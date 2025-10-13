// src/pages/PublicElectricCalcPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./PublicElectricCalcPage.css";
import * as XLSX from "xlsx";
import PageTitle from "../components/PageTitle";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  writeBatch,
} from "firebase/firestore";

/** =========================================
 * 공용전기 계산 (라이트 테마, 10원 반올림/차액 공식/자동저장)
 * - 루프 차단: 저장은 '사용자 동작'에서만 수행 (rows 변경 useEffect 저장 제거)
 * - 문서키 정합: getDocKey(r)로 원격 id 우선 매칭 → 동일 문서만 갱신
 * - 안정 난수: yyyymm+code(or id) 시드로 5000~6000 고정
 * - 실시간 공유: peCalcs/{YYYYMM}/rows 에 쓰므로 다른 계정/PC에서도 동일 표시
 * ========================================= */

const YEARS = (() => {
  const y = new Date().getFullYear();
  return [y + 1, y, y - 1, y - 2, y - 3];
})();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/* ===== 유틸 ===== */
const toInt = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Math.round(v);
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const fmt = (n) => (Number.isFinite(n) ? n : 0).toLocaleString("ko-KR");
const digitsOnly = (s) => String(s ?? "").replace(/\D+/g, "");
const padLeft = (s, len) => (s.length >= len ? s : "0".repeat(len - s.length) + s);
const last10 = (s) => (s.length > 10 ? s.slice(-10) : s);
const round10 = (n) => Math.round(toInt(n) / 10) * 10;
const parseYM = (raw) => {
  const d = digitsOnly(raw);
  if (d.length < 6) return 0;
  const six = Number(d.slice(-6)); // YYYYMM
  return Number.isFinite(six) ? six : 0;
};
const ymToPrev = (yyyymm) => {
  const y = Math.floor(yyyymm / 100);
  const m = yyyymm % 100;
  if (m === 1) return (y - 1) * 100 + 12;
  return y * 100 + (m - 1);
};

/* 🔢 안정 랜덤(5000~6000): yyyymm + key(code||id)를 시드로 고정 */
const stableRand = (key, yyyymm) => {
  const s = `${key}|${yyyymm}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) >>> 0;
  return 5000 + (h % 1001); // 5000~6000
};

/* ===== 고정 헤더 ===== */
const COL_CUST = "고객번호";
const COL_YM = "청구년월";
const COL_AMT = "당월요금계";

/* ===== 로컬 저장 키 ===== */
const SAVE_KEY = (yyyymm) => `PE:SAVE:${yyyymm}`;
const CHARGE_GLOBAL_KEY = "PE:CHARGE:GLOBAL";
const loadChargeGlobal = () => {
  try {
    const raw = localStorage.getItem(CHARGE_GLOBAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};
const saveChargeGlobal = (map) => {
  try {
    localStorage.setItem(CHARGE_GLOBAL_KEY, JSON.stringify(map));
  } catch {}
};

/* ===== XLSX: 헤더 행 자동 탐지 후 객체화 ===== */
function readTableWithDetectedHeader(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!rows.length) return [];

  const norm = (s) => String(s ?? "").trim();

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(norm);
    const hasCust = cells.includes(COL_CUST);
    const hasYM = cells.includes(COL_YM);
    const hasAmt = cells.includes(COL_AMT);
    if (hasCust && hasYM && hasAmt) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) return [];

  const header = rows[headerIdx].map(norm);
  const dataRows = rows.slice(headerIdx + 1);

  const objs = dataRows.map((arr) => {
    const o = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c] || `col${c}`;
      o[key] = arr[c];
    }
    return o;
  });

  return objs;
}

/* ====== 🔒 쓰기-읽기 루프 방지용 서명 ======
 * 정규화 후 JSON 문자열로 비교 → 같으면 쓰기 생략
 */
const normalizePayload = (r) => ({
  households: toInt(r.households),
  billed: toInt(r.billed),
  method: r.method === "계산안함" ? "계산안함" : "계산",
  memo: String(r.memo || ""),
  charge: r.charge === "부과안함" ? "부과안함" : "부과",
});
const signatureOf = (payload) => JSON.stringify(payload);

export default function PublicElectricCalcPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  /* yyyymm */
  const yyyymm = useMemo(
    () => `${year}${String(month).padStart(2, "0")}`,
    [year, month]
  );
  const yyyymmNum = useMemo(() => Number(yyyymm), [yyyymm]);
  const prevYyyymmNum = useMemo(() => ymToPrev(yyyymmNum), [yyyymmNum]);

  /* Firestore: 공용전기 등록된 빌라들 */
  const [villas, setVillas] = useState([]);
  useEffect(() => {
    const qv = query(collection(db, "villas"), where("publicElectric", "!=", ""));
    const unsub = onSnapshot(qv, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          code: data.code ?? "",               // 문자열/숫자 상관없이 그대로 보관
          name: data.name || "",
          publicElectric: String(data.publicElectric ?? "").trim(),
          baseHouseholds: toInt(data.households ?? data.householdCount ?? 0),
        };
      });
      list.sort((a, b) =>
        String(a.code).localeCompare(String(b.code), "ko", { numeric: true })
      );
      setVillas(list);
    });
    return () => unsub();
  }, []);

  /* 테이블 상태 */
  const [rows, setRows] = useState([]);
  const [editBilled, setEditBilled] = useState(false); // 청구요금 편집 토글

  /* 부과설정 모달 상태 */
  const [chargeModalOpen, setChargeModalOpen] = useState(false);
  const [chargeDraft, setChargeDraft] = useState({}); // { [id]: "부과" | "부과안함" }

  /* ✅ 원격 실시간 값 구독(월별): peCalcs/{YYYYMM}/rows/{villaId or code} */
  const [remoteMap, setRemoteMap] = useState({});
  const remoteSigRef = useRef({}); // 🔒 현재 원격 서명(쓰기에 앞서 비교)
  useEffect(() => {
    const colRef = collection(db, "peCalcs", String(yyyymm), "rows");
    const unsub = onSnapshot(colRef, (snap) => {
      const m = {};
      const sigs = {};
      snap.forEach((d) => {
        const v = d.data() || {};
        const payload = {
          households: toInt(v.households),
          billed: toInt(v.billed),
          method: v.method === "계산안함" ? "계산안함" : "계산",
          memo: v.memo || "",
          charge: v.charge === "부과안함" ? "부과안함" : "부과",
        };
        m[d.id] = payload;
        sigs[d.id] = signatureOf(payload);
      });
      remoteSigRef.current = sigs; // 🔒 최신 서명 저장
      setRemoteMap(m);
    });
    return () => unsub();
  }, [yyyymm]);

  /* 저장/불러오기 */
  const loadSaved = (ym) => {
    try {
      const raw = localStorage.getItem(SAVE_KEY(ym));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  /* === 계산기 === */
  const recomputeRow = (r, yyyymmStr) => {
    const hh = toInt(r.households);
    const billed = toInt(r.billed);

    if (!hh || !billed) {
      return { ...r, assessed: 0, diff: 0 };
    }

    // 고정 난수(깜빡임 방지)
    const key = String(r.code ?? r.id ?? "");
    const seeded = stableRand(key, yyyymmStr);

    let assessed;
    if (r.method === "계산") {
      const plus = r._rand ?? seeded;
      assessed = round10((billed + plus) / hh);
    } else {
      assessed = round10(billed / hh);
    }

    const diff = toInt(assessed * hh - billed);
    return { ...r, assessed, diff, _rand: seeded };
  };

  /* 🔑 원격 문서키 결정 (기존 문서 우선) */
  const getDocKey = (r) => {
    // 1) 원격에 r.id 로 존재하면 그걸 사용
    if (remoteMap[r.id]) return String(r.id);
    // 2) 원격에 r.code 로 존재하면 그걸 사용 (선행 0 포함 문자열 유지)
    const codeStr = String(r.code ?? "");
    if (codeStr && remoteMap[codeStr]) return codeStr;
    // 3) 원격에 없음 → code가 있으면 문자열 그대로 사용, 없으면 id
    if (codeStr) return codeStr;
    return String(r.id);
  };

  /* 초기 행 구성 + (원격 > 로컬 > 기본) 병합  */
  useEffect(() => {
    const saved = loadSaved(yyyymm) || {};
    const globalCharge = loadChargeGlobal();
    const initial = villas.map((v) => {
      const savedRow = saved[v.id] || {};
      // ✅ 원격값을 code 또는 id 로 둘 다 조회
      const codeStr = String(v.code ?? "");
      const remoteRow = remoteMap[v.id] || remoteMap[codeStr] || {};

      const households = toInt(
        remoteRow.households ?? savedRow.households ?? v.baseHouseholds ?? 0
      );
      const billed = toInt(remoteRow.billed ?? savedRow.billed ?? 0);
      const memo = (remoteRow.memo ?? savedRow.memo) ?? "";

      const charge =
        (remoteRow.charge ?? savedRow.charge ?? globalCharge[v.id]) || "부과";
      const methodInit = (remoteRow.method ?? savedRow.method) || "계산";

      return recomputeRow({
        id: v.id,
        code: v.code,
        name: v.name,
        pubNo: v.publicElectric || "",
        households,
        billed,
        assessed: 0,
        diff: 0,
        method: methodInit,
        memo,
        charge,
      }, yyyymm);
    });
    setRows(initial);
    setChargeDraft(Object.fromEntries(initial.map((r) => [r.id, r.charge || "부과"])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [villas, yyyymm, remoteMap]);

  /* ===== 적용세대수 Enter → 다음 칸 포커스 ===== */
  const householdsRefs = useRef([]);

  /* ===== 저장 디바운스 ===== */
  const saveTimerRef = useRef(null);
  const debouncedSave = (ym, rowsToSave) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => _saveRows(ym, rowsToSave), 300);
  };

  /* ===== 셀 업데이트 (사용자 동작 시에만 저장 호출) ===== */
  const updateCell = (id, key, val) => {
    setRows((old) => {
      const next = old.map((r) => {
        if (r.id !== id) return r;
        let n = { ...r };
        if (key === "households" || key === "billed") {
          n[key] = toInt(val);
        } else if (key === "method") {
          n.method = val === "계산안함" ? "계산안함" : "계산";
        } else if (key === "charge") {
          n.charge = val === "부과안함" ? "부과안함" : "부과";
        } else {
          n[key] = val; // memo 등
        }
        return recomputeRow(n, yyyymm);
      });
      // 🔒 사용자 동작에서만 저장
      debouncedSave(yyyymm, next);
      return next;
    });
  };

  /* ===== Excel 업로드 ===== */
  const fileInputRef = useRef(null);
  const onClickUpload = () => fileInputRef.current?.click();

  const hasAnyData = useMemo(
    () => rows.some((r) => toInt(r.billed) > 0 || toInt(r.assessed) > 0),
    [rows]
  );

  const handleExcel = async (file) => {
    if (!file) return;

    if (hasAnyData) {
      window.alert(
        "이미 청구요금 또는 부과요금에 데이터가 존재합니다.\n" +
          "업로드를 진행할 수 없습니다.\n" +
          "필요 시 ‘전체 삭제’로 초기화한 뒤 다시 업로드하세요."
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = readTableWithDetectedHeader(ws);
    if (!json.length) {
      window.alert("엑셀에서 '고객번호/청구년월/당월요금계' 헤더 행을 찾지 못했습니다.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 고객번호별 그룹화
    const groups = new Map();
    for (const row of json) {
      const custRaw = row[COL_CUST];
      const ymRaw = row[COL_YM];
      const amtRaw = row[COL_AMT];

      const exact = String(custRaw ?? "").trim();
      const digits = digitsOnly(custRaw);
      const ym = parseYM(ymRaw);
      const amt = toInt(amtRaw);

      if (!exact && !digits) continue;
      const gkey = digits || exact;
      const arr = groups.get(gkey) || [];
      arr.push({ ym, amt, exact, digits });
      groups.set(gkey, arr);
    }

    // 정책:
    // - 그룹 1개 → 그 값 사용
    // - 2개 이상 → prevYyyymmNum 과 일치하는 ym의 amt 사용(없으면 주입 안함)
    const bestByExact = {};
    const bestByDigits = {};
    for (const [, arr] of groups.entries()) {
      if (arr.length === 1) {
        const only = arr[0];
        const amt = toInt(only.amt);
        if (only.exact) bestByExact[only.exact.trim()] = amt;
        if (only.digits) {
          const d = only.digits;
          const variants = new Set([d, padLeft(d, 10), padLeft(d, 11), padLeft(d, 9), last10(d)]);
          for (const k of variants) bestByDigits[k] = amt;
        }
      } else {
        const target = arr.find((x) => x.ym === prevYyyymmNum);
        if (target) {
          const amt = toInt(target.amt);
          if (target.exact) bestByExact[target.exact.trim()] = amt;
          if (target.digits) {
            const d = target.digits;
            const variants = new Set([d, padLeft(d, 10), padLeft(d, 11), padLeft(d, 9), last10(d)]);
            for (const k of variants) bestByDigits[k] = amt;
          }
        }
      }
    }

    // 행 주입
    let matched = 0;
    const updated = rows.map((r) => {
      const pubRaw = String(r.pubNo ?? "").trim();
      const pubDigits = digitsOnly(pubRaw);

      let amt;
      if (pubRaw && Object.prototype.hasOwnProperty.call(bestByExact, pubRaw)) {
        amt = toInt(bestByExact[pubRaw]);
      }
      if (amt === undefined) {
        const tryKeys = [
          pubDigits,
          padLeft(pubDigits, 10),
          padLeft(pubDigits, 11),
          padLeft(pubDigits, 9),
          last10(pubDigits),
        ].filter(Boolean);
        for (const k of tryKeys) {
          if (Object.prototype.hasOwnProperty.call(bestByDigits, k)) {
            amt = toInt(bestByDigits[k]);
            break;
          }
        }
      }
      if (amt === undefined || amt === 0) return recomputeRow(r, yyyymm);

      matched++;
      const rowNext = { ...r, billed: amt };
      return recomputeRow(rowNext, yyyymm);
    });

    setRows(updated);
    debouncedSave(yyyymm, updated); // ✅ 업로드 직후 원격도 동기화

    window.alert(
      `엑셀 업로드 완료\n` +
        `총 행: ${updated.length}건\n` +
        `매칭 성공: ${matched}건\n` +
        `기준: 중복 시 ${prevYyyymmNum}의 '당월요금계', 단일 건은 해당 값 그대로 사용했습니다.`
    );

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* 합계 */
  const summary = useMemo(() => {
    const totalBilled = rows.reduce((a, r) => a + toInt(r.billed), 0);
    const totalAssessed = rows.reduce((a, r) => a + toInt(r.assessed), 0);
    const totalDiff = rows.reduce((a, r) => a + toInt(r.diff), 0);
    return { totalBilled, totalAssessed, totalDiff };
  }, [rows]);

  /* === 전체 삭제 === */
  const onClearAll = () => {
    if (!rows.length) return;
    const ok = window.confirm(
      "모든 값을 비우고(적용세대수/청구/부과/차액) 계산방법과 부과설정은 유지합니다."
    );
    if (!ok) return;
    const cleared = rows.map((r) => ({
      ...r,
      households: "",
      billed: "",
      assessed: "",
      diff: "",
    }));
    setRows(cleared);
    debouncedSave(yyyymm, cleared);
  };

  const onToggleEditBilled = () => setEditBilled((v) => !v);

  /* 부과설정 모달 오픈/저장 */
  const openChargeModal = () => {
    setChargeDraft(Object.fromEntries(rows.map((r) => [r.id, r.charge || "부과"])));
    setChargeModalOpen(true);
  };
  const saveChargeModal = () => {
    const next = rows.map((r) => {
      const c = chargeDraft[r.id] || "부과";
      if (c === r.charge) return r;
      const n = { ...r, charge: c };
      return recomputeRow(n, yyyymm);
    });
    setRows(next);

    const global = loadChargeGlobal();
    const nextGlobal = { ...global, ...chargeDraft };
    saveChargeGlobal(nextGlobal);
    setChargeModalOpen(false);

    debouncedSave(yyyymm, next);
  };

  /* ===== 🔒 저장 로직 (로컬 + 원격) =====
   * - 로컬: 항상 덮어씀
   * - 원격: 현재 원격 서명과 비교하여 달라진 문서만 set()
   * - updatedAt: 실제 변경 있을 때만 갱신
   */
  const _saveRows = async (ym, rowsToSave) => {
    // 1) 로컬
    try {
      const data = {};
      rowsToSave.forEach((r) => {
        data[r.id] = normalizePayload(r); // 로컬은 id 키 유지(기존 호환)
      });
      localStorage.setItem(SAVE_KEY(ym), JSON.stringify(data));
    } catch {}

    // 2) 원격 (변경된 행만)
    try {
      const batch = writeBatch(db);
      let writeCount = 0;

      rowsToSave.forEach((r) => {
        const key = getDocKey(r);          // ✅ 실제 원격 문서키와 정확히 일치
        const payload = normalizePayload(r);
        const sig = signatureOf(payload);
        const curSig = remoteSigRef.current[key]; // 최신 원격 서명
        if (sig === curSig) return;        // 🔒 동일 → 쓰기 생략

        const ref = doc(db, "peCalcs", String(ym), "rows", key);
        batch.set(
          ref,
          {
            ...payload,
            updatedAt: Date.now(),         // ✅ 변경 시에만 갱신
          },
          { merge: true }
        );
        writeCount++;
        // 낙관적 업데이트: 같은 턴의 중복 저장 방지
        remoteSigRef.current[key] = sig;
      });

      if (writeCount > 0) {
        await batch.commit();
      }
    } catch (e) {
      console.error("Firestore 동기화 실패:", e);
    }
  };

  return (
    <div className="pe-page light">
      <PageTitle title="공용전기 계산" />

      <div className="pe-toolbar fancy">
        <div className="pe-left">
          {/* 라벨 제거: 드롭다운만 표시 */}
          <div className="pe-select-wrap no-label">
            <select
              className="pe-select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="년도"
              title="년도"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
          <div className="pe-select-wrap no-label">
            <select
              className="pe-select"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              aria-label="월"
              title="월"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </div>

          {/* 업로드 */}
          <button className="pe-btn gradient no-anim" onClick={() => fileInputRef.current?.click()}>
            <i className="ri-upload-2-line" />
            엑셀 업로드
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => handleExcel(e.target.files?.[0])}
          />

          {/* 부과설정 버튼 */}
          <button className="pe-btn accent-muted" onClick={openChargeModal} title="부과 대상 설정">
            <i className="ri-settings-3-line" />
            부과설정
          </button>
        </div>

        <div className="pe-right">
          <div className="pe-actions">
            <button
              className={`pe-btn edit-soft ${editBilled ? "active" : ""}`}
              onClick={onToggleEditBilled}
              title="청구요금 인라인 수정 토글"
            >
              <i className="ri-edit-2-line" />
              {editBilled ? "수정 종료" : "수정"}
            </button>

            <button className="pe-btn danger pretty" onClick={onClearAll} title="전체 삭제">
              <i className="ri-delete-bin-6-line" />
              전체 삭제
            </button>
          </div>

          <div className="pe-badges">
            <span className="pe-badge">
              청구요금 합계 <b>{fmt(summary.totalBilled)}원</b>
            </span>
            <span className="pe-badge">
              부과요금 합계 <b>{fmt(summary.totalAssessed)}원</b>
            </span>
            <span className="pe-badge">
              차액 합계 <b>{fmt(summary.totalDiff)}원</b>
            </span>
          </div>
        </div>
      </div>

      <div className="pe-grid">
        <div className="pe-table-card">
          <div className="pe-table-scroll">
            <table className="pe-table">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>번호</th>
                  <th style={{ width: 120 }}>코드번호</th>
                  <th style={{ width: 320 }}>빌라명</th>
                  <th style={{ width: 120 }}>적용세대수*</th>
                  <th style={{ width: 160 }}>청구요금{editBilled ? "*" : ""}</th>
                  <th style={{ width: 140 }}>부과요금</th>
                  <th style={{ width: 120 }}>차액</th>
                  <th style={{ width: 150 }}>계산방법*</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const readOnly = r.charge === "부과안함";
                  return (
                    <tr key={r.id} className={readOnly ? "row-excluded" : ""}>
                      <td className="c">{idx + 1}</td>
                      <td className="c">{String(r.code ?? "")}</td>
                      <td className="l">
                        <div className="pe-villa">
                          <span className="pe-villa-line">
                            <span className="pe-villa-name">{r.name || "-"}</span>
                            {r.charge === "부과안함" && (
                              <span className="pe-tag-excluded">부과안함</span>
                            )}
                          </span>
                          {r.pubNo ? (
                            <span className="pe-villa-cust">공용전기 {r.pubNo}</span>
                          ) : (
                            <span className="pe-villa-cust empty">공용전기 없음</span>
                          )}
                        </div>
                      </td>

                      {/* 적용세대수 */}
                      <td className="c">
                        <input
                          ref={(el) => (householdsRefs.current[idx] = el)}
                          className="pe-input num"
                          inputMode="numeric"
                          value={r.households || ""}
                          onChange={(e) => updateCell(r.id, "households", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const next = householdsRefs.current[idx + 1];
                              if (next) next.focus();
                            }
                          }}
                          placeholder="0"
                          disabled={readOnly}
                        />
                      </td>

                      {/* 청구요금 */}
                      <td className={`c ${!toInt(r.billed) ? "cell-required" : ""}`}>
                        {editBilled ? (
                          <div className="pe-money-edit">
                            <input
                              className="pe-input num"
                              inputMode="numeric"
                              value={r.billed ? fmt(r.billed) : ""}
                              onChange={(e) => updateCell(r.id, "billed", e.target.value)}
                              placeholder="0"
                              disabled={readOnly}
                            />
                            <span className="unit">원</span>
                          </div>
                        ) : (
                          <span className="strong">
                            {r.billed ? `${fmt(r.billed)}원` : "-"}
                          </span>
                        )}
                      </td>

                      {/* 부과요금 */}
                      <td className="c strong assessed-blue">
                        {r.assessed ? `${fmt(r.assessed)}원` : "-"}
                      </td>

                      {/* 차액 */}
                      <td className={`c ${r.diff >= 0 ? "pos" : "neg"}`}>
                        {r.diff ? `${fmt(r.diff)}원` : "-"}
                      </td>

                      {/* 계산방법 */}
                      <td className="c">
                        <select
                          className={`pe-select method ${r.method === "계산안함" ? "danger" : ""}`}
                          value={r.method}
                          onChange={(e) => updateCell(r.id, "method", e.target.value)}
                          disabled={readOnly}
                        >
                          <option value="계산">계산</option>
                          <option value="계산안함">계산안함</option>
                        </select>
                      </td>

                      {/* 비고 */}
                      <td className="l">
                        <input
                          className="pe-input"
                          value={r.memo}
                          onChange={(e) => updateCell(r.id, "memo", e.target.value)}
                          disabled={readOnly}
                        />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="c muted">
                      공용전기 등록된 빌라가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== 부과설정 모달 ===== */}
      {chargeModalOpen && (
        <div className="pe-modal-overlay" onClick={() => setChargeModalOpen(false)}>
          <div className="pe-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pe-modal-header">
              <h3>부과설정</h3>
            </div>
            <div className="pe-modal-body">
              <table className="pe-modal-table">
                <thead>
                  <tr>
                    <th style={{ width: 120 }}>코드번호</th>
                    <th>빌라명</th>
                    <th style={{ width: 160 }}>부과설정</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="c">{String(r.code ?? "")}</td>
                      <td className="l">
                        <div className="pe-villa">
                          <span className="pe-villa-line">
                            <span className="pe-villa-name">{r.name || "-"}</span>
                          </span>
                          {r.pubNo ? (
                            <span className="pe-villa-cust">공용전기 {r.pubNo}</span>
                          ) : (
                            <span className="pe-villa-cust empty">공용전기 없음</span>
                          )}
                        </div>
                      </td>
                      <td className="c">
                        <select
                          className="pe-select"
                          value={chargeDraft[r.id] || "부과"}
                          onChange={(e) =>
                            setChargeDraft((old) => ({ ...old, [r.id]: e.target.value }))
                          }
                        >
                          <option value="부과">부과</option>
                          <option value="부과안함">부과안함</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="c muted">
                        설정할 빌라가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="pe-modal-footer">
              <button className="pe-btn gradient" onClick={() => {
                const next = rows.map((r) => {
                  const c = chargeDraft[r.id] || "부과";
                  if (c === r.charge) return r;
                  const n = { ...r, charge: c };
                  return recomputeRow(n, yyyymm);
                });
                setRows(next);
                const global = loadChargeGlobal();
                const nextGlobal = { ...global, ...chargeDraft };
                saveChargeGlobal(nextGlobal);
                setChargeModalOpen(false);
                debouncedSave(yyyymm, next);
              }}>
                저장
              </button>
              <button className="pe-btn subtle" onClick={() => setChargeModalOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
