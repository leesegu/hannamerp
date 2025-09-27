// src/pages/PublicElectricCalcPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./PublicElectricCalcPage.css";
import * as XLSX from "xlsx";
import PageTitle from "../components/PageTitle";
import { db } from "../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";

/** =========================================
 * 공용전기 계산 (라이트 테마, 10원 반올림/차액 공식/자동저장)
 * - 빌라명 아래 publicElectric(공용전기 번호) 표시
 * - 엑셀 업로드:
 *   · 헤더행 자동 탐지(고정 컬럼: 고객번호/청구년월/당월요금계)
 *   · 동일 고객번호가 여러 건이면 청구년월(YYYYMM) 최대의 당월요금계 채택
 *   · 채택값 → 청구요금(billed) (부과요금은 규칙 계산)
 * - 계산:
 *   · 부과요금: 10원 단위 반올림(1원단위 0원 표기)
 *   · 계산: (청구요금 + 5,000~6,000 랜덤) / 적용세대수 → round10
 *   · 계산안함: 청구요금 / 적용세대수 → round10
 *   · 차액: (부과요금 × 적용세대수) - 청구요금
 * - pubNo가 숫자가 아니면 자동으로 계산방법=계산안함
 * - 연/월 별 자동 저장/불러오기(localStorage: PE:SAVE:<YYYYMM>)
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
const randomOffset = () => 5000 + Math.floor(Math.random() * 1001);
const round10 = (n) => Math.round(toInt(n) / 10) * 10; // ✅ 10원 단위 반올림
const parseYM = (raw) => {
  const d = digitsOnly(raw);
  if (d.length < 6) return 0;
  const six = Number(d.slice(-6)); // YYYYMM
  return Number.isFinite(six) ? six : 0;
};

/* ===== 고정 헤더 ===== */
const COL_CUST = "고객번호";
const COL_YM = "청구년월";
const COL_AMT = "당월요금계";

/* ===== 로컬 저장 키 ===== */
const SAVE_KEY = (yyyymm) => `PE:SAVE:${yyyymm}`;

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

export default function PublicElectricCalcPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  /* yyyymm */
  const yyyymm = useMemo(
    () => `${year}${String(month).padStart(2, "0")}`,
    [year, month]
  );

  /* Firestore: 공용전기 등록된 빌라들 */
  const [villas, setVillas] = useState([]);
  useEffect(() => {
    const qv = query(collection(db, "villas"), where("publicElectric", "!=", ""));
    const unsub = onSnapshot(qv, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          code: data.code || "",
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

  /* 저장/불러오기 */
  const loadSaved = (ym) => {
    try {
      const raw = localStorage.getItem(SAVE_KEY(ym));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const saveRows = (ym, rows) => {
    try {
      const data = {};
      rows.forEach((r) => {
        data[r.id] = {
          households: toInt(r.households),
          billed: toInt(r.billed),
          method: r.method,
          memo: r.memo || "",
        };
      });
      localStorage.setItem(SAVE_KEY(ym), JSON.stringify(data));
    } catch {}
  };

  /* 초기 행 구성 + 저장본 병합 */
  useEffect(() => {
    const saved = loadSaved(yyyymm) || {};
    const initial = villas.map((v) => {
      const pubNo = v.publicElectric || "";
      const pubDigits = digitsOnly(pubNo);
      const savedRow = saved[v.id] || {};
      const methodInit =
        pubDigits ? (savedRow.method || "계산") : "계산안함"; // ✅ 숫자 아니면 강제 계산안함
      const households = toInt(savedRow.households ?? v.baseHouseholds ?? 0);
      const billed = toInt(savedRow.billed ?? 0);
      const memo = savedRow.memo ?? "";

      return recomputeRow({
        id: v.id,
        code: v.code,
        name: v.name,
        pubNo,
        households,
        billed,
        assessed: 0,
        diff: 0,
        method: methodInit,
        memo,
        _rand: randomOffset(), // 행 고정 랜덤
      });
    });
    setRows(initial);
  }, [villas, yyyymm]); // 연/월 바뀔 때마다 저장본 로드

  /* rows 변경 시 자동 저장 */
  useEffect(() => {
    if (rows.length) saveRows(yyyymm, rows);
  }, [rows, yyyymm]);

  /* 계산기 (10원 반올림 + 차액 공식) */
  const recomputeRow = (r) => {
    const hh = toInt(r.households);
    const billed = toInt(r.billed);

    if (!hh || !billed) {
      return { ...r, assessed: 0, diff: 0 };
    }

    let assessed;
    if (r.method === "계산") {
      const plus = r._rand || randomOffset();
      assessed = round10((billed + plus) / hh);
    } else {
      assessed = round10(billed / hh);
    }

    const diff = toInt(assessed * hh - billed); // ✅ 차액 공식
    return { ...r, assessed, diff };
  };

  /* ===== 적용세대수 Enter → 다음 칸 포커스 ===== */
  const householdsRefs = useRef([]);

  /* 셀 업데이트 */
  const updateCell = (id, key, val) => {
    setRows((old) =>
      old.map((r) => {
        if (r.id !== id) return r;
        let next = { ...r };

        if (key === "households" || key === "billed") {
          next[key] = toInt(val);
        } else if (key === "method") {
          next.method = val === "계산안함" ? "계산안함" : "계산";
          if (next.method === "계산" && !next._rand) next._rand = randomOffset();
        } else {
          next[key] = val; // memo 등
        }

        // pubNo가 숫자가 아니면 강제로 계산안함 유지
        if (!digitsOnly(next.pubNo)) next.method = "계산안함";

        next = recomputeRow(next);
        return next;
      })
    );
  };

  /* 엑셀 업로드 */
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

    // 고객번호별 최신 청구년월의 금액 선택
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

    const bestByExact = {};
    const bestByDigits = {};
    for (const [, arr] of groups.entries()) {
      arr.sort((a, b) => (b.ym || 0) - (a.ym || 0)); // 최신 우선
      const best = arr[0] || { amt: 0, exact: "", digits: "" };
      const amt = toInt(best.amt);
      if (best.exact) bestByExact[best.exact.trim()] = amt;
      if (best.digits) {
        const d = best.digits;
        const variants = new Set([d, padLeft(d, 10), padLeft(d, 11), padLeft(d, 9), last10(d)]);
        for (const k of variants) bestByDigits[k] = amt;
      }
    }

    // 행 주입(원문 → 숫자 변형)
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
      if (amt === undefined || amt === 0) return recomputeRow(r);

      matched++;
      const rowNext = { ...r, billed: amt };
      // pubNo 비숫자면 계산안함 강제
      if (!digitsOnly(rowNext.pubNo)) rowNext.method = "계산안함";
      return recomputeRow(rowNext);
    });

    setRows(updated);
    saveRows(yyyymm, updated); // ✅ 업로드 직후 자동 저장

    window.alert(
      `엑셀 업로드 완료\n` +
        `총 행: ${updated.length}건\n` +
        `매칭 성공: ${matched}건\n` +
        `기준: 동일 고객번호에서 '청구년월'이 가장 큰 행의 '당월요금계'를 사용했습니다.`
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

  /* === 전체 삭제(요청사항 반영) ===
     - 적용세대수/청구요금/부과요금/차액 모두 빈칸("")으로
     - 계산방법은 기본값으로 복귀(공용전기가 숫자면 '계산', 아니면 '계산안함') */
  const onClearAll = () => {
    if (!rows.length) return;
    const ok = window.confirm("모든 값을 비우고(적용세대수/청구/부과/차액) 계산방법도 기본값으로 되돌릴까요?");
    if (!ok) return;
    const cleared = rows.map((r) => {
      const isDigits = !!digitsOnly(r.pubNo);
      return {
        ...r,
        households: "",
        billed: "",
        assessed: "",
        diff: "",
        method: isDigits ? "계산" : "계산안함",
      };
    });
    setRows(cleared);
    saveRows(yyyymm, cleared);
  };

  const onToggleEditBilled = () => setEditBilled((v) => !v);

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

          {/* ⬇️ 업로드 버튼(애니메이션 없음) */}
          <button className="pe-btn gradient no-anim" onClick={onClickUpload}>
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
        </div>

        <div className="pe-right">
          <div className="pe-actions">
            {/* ⬇️ 수정 버튼 색상 강조 */}
            <button
              className={`pe-btn outline edit-colored ${editBilled ? "active" : ""}`}
              onClick={onToggleEditBilled}
              title="청구요금 인라인 수정 토글"
            >
              <i className="ri-edit-2-line" />
              {editBilled ? "수정 종료" : "수정"}
            </button>
            <button className="pe-btn danger" onClick={onClearAll} title="전체 삭제">
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
                {rows.map((r, idx) => (
                  <tr key={r.id}>
                    <td className="c">{idx + 1}</td>
                    <td className="c">{r.code}</td>
                    <td className="l">
                      <div className="pe-villa">
                        <span className="pe-villa-name">{r.name || "-"}</span>
                        {r.pubNo ? (
                          <span className="pe-villa-cust">공용전기 {r.pubNo}</span>
                        ) : (
                          <span className="pe-villa-cust empty">공용전기 없음</span>
                        )}
                      </div>
                    </td>
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
                      />
                    </td>

                    {/* 청구요금: 수정 토글 시 입력 가능, 아니면 표시만 + 비어있으면 옅은 붉은 배경 */}
                    <td className={`c ${!toInt(r.billed) ? "cell-required" : ""}`}>
                      {editBilled ? (
                        <div className="pe-money-edit">
                          <input
                            className="pe-input num"
                            inputMode="numeric"
                            value={r.billed ? fmt(r.billed) : ""}
                            onChange={(e) => updateCell(r.id, "billed", e.target.value)}
                            placeholder="0"
                          />
                          <span className="unit">원</span>
                        </div>
                      ) : (
                        <span className="strong">
                          {r.billed ? `${fmt(r.billed)}원` : "-"}
                        </span>
                      )}
                    </td>

                    {/* 부과요금: 파란색 표시 */}
                    <td className="c strong assessed-blue">
                      {r.assessed ? `${fmt(r.assessed)}원` : "-"}
                    </td>

                    {/* 차액: (부과요금×적용세대수) - 청구요금 */}
                    <td className={`c ${r.diff >= 0 ? "pos" : "neg"}`}>
                      {r.diff ? `${fmt(r.diff)}원` : "-"}
                    </td>

                    <td className="c">
                      <select
                        className={`pe-select method ${r.method === "계산안함" ? "danger" : ""}`}
                        value={r.method}
                        onChange={(e) => updateCell(r.id, "method", e.target.value)}
                      >
                        <option value="계산">계산</option>
                        <option value="계산안함">계산안함</option>
                      </select>
                    </td>

                    <td className="l">
                      <input
                        className="pe-input"
                        value={r.memo}
                        onChange={(e) => updateCell(r.id, "memo", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
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
          {/* 하단 범례 없음 */}
        </div>
      </div>
    </div>
  );
}
