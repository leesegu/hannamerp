// src/pages/PublicElectricCalcPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./PublicElectricCalcPage.css";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  writeBatch,
  setDoc,
} from "firebase/firestore";

/** =========================================
 * 공용전기 계산 (라이트 테마, 10원 반올림/차액 공식/자동저장)
 * - 루프 차단: 저장은 '사용자 동작'에서만 수행 (rows 변경 useEffect 저장 제거)
 * - 문서키 정합: getDocKey(r)로 원격 id 우선 매칭 → 동일 문서만 갱신
 * - 안정 난수: yyyymm+code(or id) 시드로 5000~6000 고정
 * - 실시간 공유: peCalcs/{YYYYMM}/rows 에 쓰므로 다른 계정/PC에서도 동일 표시
 * - ✅ 부과설정 전역화: peChargeGlobal/{villaId}.charge 에 저장/구독 → 모든 달에 공통 적용
 * ========================================= */

const YEARS = (() => {
  const y = new Date().getFullYear();
  return [y + 1, y, y - 1, y - 2, y - 3];
})();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/* ===== 계산방법 드롭다운 옵션 (미납관리 상태 드롭다운과 같은 형태) ===== */
const METHOD_OPTIONS = [
  {
    value: "계산",
    label: "계산",
    description: "부과요금 자동 계산",
  },
  {
    value: "계산안함",
    label: "계산안함",
    description: "부과요금을 계산하지 않아요",
  },
];

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

/* ====== 🔒 쓰기-읽기 루프 방지용 서명 ====== */
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

  /* ===== ✅ 전역 부과설정 (모든 달 공통) Firestore 구독 ===== */
  const [globalChargeRemote, setGlobalChargeRemote] = useState({});
  useEffect(() => {
    const col = collection(db, "peChargeGlobal");
    const unsub = onSnapshot(col, (snap) => {
      const m = {};
      snap.forEach((d) => {
        const v = d.data() || {};
        const c = v.charge === "부과안함" ? "부과안함" : "부과";
        m[d.id] = c;
      });
      setGlobalChargeRemote(m);
    });
    return () => unsub();
  }, []);

  /* 테이블 상태 */
  const [rows, setRows] = useState([]);
  const [editBilled, setEditBilled] = useState(false); // 청구요금 편집 토글

  /* ✅ 검색 (코드번호 / 빌라명 / 공용전기번호 / 비고) */
  const [searchText, setSearchText] = useState("");

  /* =========================================================
     ✅ 년/월 · 계산방법 커스텀 드롭다운
     (미납관리 페이지의 "상태" 드롭다운과 동일한 방식:
      버튼을 누르면 document.body 로 포탈시킨 목록 팝업이 뜨는 구조)
  ========================================================= */

  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [yearPickerPos, setYearPickerPos] = useState({ top: 0, left: 0 });
  const yearPickerRef = useRef(null);

  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerPos, setMonthPickerPos] = useState({ top: 0, left: 0 });
  const monthPickerRef = useRef(null);

  const [openMethodRowId, setOpenMethodRowId] = useState(null);
  const [methodPickerPos, setMethodPickerPos] = useState({ top: 0, left: 0 });
  const methodPickerRef = useRef(null);

  const toggleYearPicker = (event) => {
    if (yearPickerOpen) {
      setYearPickerOpen(false);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setYearPickerPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    setYearPickerOpen(true);
  };

  const toggleMonthPicker = (event) => {
    if (monthPickerOpen) {
      setMonthPickerOpen(false);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setMonthPickerPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    setMonthPickerOpen(true);
  };

  const toggleMethodPicker = (row, event) => {
    if (openMethodRowId === row.id) {
      setOpenMethodRowId(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setMethodPickerPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    setOpenMethodRowId(row.id);
  };

  const handleMethodSelect = (row, value) => {
    updateCell(row.id, "method", value);
    setOpenMethodRowId(null);
  };

  /* 년도 팝업 - 바깥 클릭 / 스크롤 / 리사이즈 시 닫기 */
  useEffect(() => {
    if (!yearPickerOpen) return undefined;

    const handleOutsideClick = (event) => {
      const popupEl = yearPickerRef.current;
      if (popupEl && popupEl.contains(event.target)) return;
      if (event.target?.closest?.(".pec-picker-trigger-year")) return;
      setYearPickerOpen(false);
    };
    const handleClose = () => setYearPickerOpen(false);

    document.addEventListener("mousedown", handleOutsideClick, true);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick, true);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [yearPickerOpen]);

  /* 월 팝업 - 바깥 클릭 / 스크롤 / 리사이즈 시 닫기 */
  useEffect(() => {
    if (!monthPickerOpen) return undefined;

    const handleOutsideClick = (event) => {
      const popupEl = monthPickerRef.current;
      if (popupEl && popupEl.contains(event.target)) return;
      if (event.target?.closest?.(".pec-picker-trigger-month")) return;
      setMonthPickerOpen(false);
    };
    const handleClose = () => setMonthPickerOpen(false);

    document.addEventListener("mousedown", handleOutsideClick, true);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick, true);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [monthPickerOpen]);

  /* 계산방법 팝업 - 바깥 클릭 / 스크롤 / 리사이즈 시 닫기 */
  useEffect(() => {
    if (!openMethodRowId) return undefined;

    const handleOutsideClick = (event) => {
      const popupEl = methodPickerRef.current;
      if (popupEl && popupEl.contains(event.target)) return;
      if (event.target?.closest?.(".pec-method-trigger")) return;
      setOpenMethodRowId(null);
    };
    const handleClose = () => setOpenMethodRowId(null);

    document.addEventListener("mousedown", handleOutsideClick, true);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick, true);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [openMethodRowId]);

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

  /* 초기 행 구성 + (전역 > 원격(월) > 로컬(월) > 로컬 전역) 병합  */
  useEffect(() => {
    const saved = loadSaved(yyyymm) || {};
    const globalChargeLocal = loadChargeGlobal();
    const initial = villas.map((v) => {
      const savedRow = saved[v.id] || {};
      // ✅ 원격값을 code 또는 id 로 둘 다 조회
      const codeStr = String(v.code ?? "");
      const remoteRow = remoteMap[v.id] || remoteMap[codeStr] || {};

      // ✅ 부과설정 우선순위: 전역(Firestore) > 월 원격 > 월 로컬 > 로컬 전역 > "부과"
      const charge =
        (globalChargeRemote[v.id]) ??
        (remoteRow.charge) ??
        (savedRow.charge) ??
        (globalChargeLocal[v.id]) ??
        "부과";

      const households = toInt(
        remoteRow.households ?? savedRow.households ?? v.baseHouseholds ?? 0
      );
      const billed = toInt(remoteRow.billed ?? savedRow.billed ?? 0);
      const memo = (remoteRow.memo ?? savedRow.memo) ?? "";
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
    // 모달 초안은 전역 설정을 우선으로 준비
    const draftFromGlobal = {};
    initial.forEach((r) => {
      draftFromGlobal[r.id] = (globalChargeRemote[r.id]) || r.charge || "부과";
    });
    setChargeDraft(draftFromGlobal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [villas, yyyymm, remoteMap, globalChargeRemote]);

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

  /* ✅ 검색 필터 (화면 표시용 - rows 원본/저장/계산에는 영향 없음) */
  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((r) => {
      const target = [r.code, r.name, r.pubNo, r.memo]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      return target.includes(keyword);
    });
  }, [rows, searchText]);

  /* ✅ 계산방법 팝업에 표시할 행 (열려있는 경우에만) */
  const openMethodRow = useMemo(
    () =>
      openMethodRowId
        ? filteredRows.find((r) => r.id === openMethodRowId)
        : null,
    [filteredRows, openMethodRowId]
  );

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
    // ✅ 전역(Firestore) 우선 → 없으면 현재 행 → 기본 "부과"
    const draft = {};
    rows.forEach((r) => {
      draft[r.id] = globalChargeRemote[r.id] || r.charge || "부과";
    });
    setChargeDraft(draft);
    setChargeModalOpen(true);
  };

  const saveChargeModal = async () => {
    // 1) 화면 반영 (모든 행에 즉시)
    const next = rows.map((r) => {
      const c = chargeDraft[r.id] || "부과";
      if (c === r.charge) return r;
      const n = { ...r, charge: c };
      return recomputeRow(n, yyyymm);
    });
    setRows(next);

    // 2) 전역 저장: Firestore peChargeGlobal/{villaId}.charge
    try {
      const batch = writeBatch(db);
      Object.entries(chargeDraft).forEach(([villaId, c]) => {
        const ref = doc(db, "peChargeGlobal", villaId);
        batch.set(ref, { charge: c === "부과안함" ? "부과안함" : "부과", updatedAt: Date.now() }, { merge: true });
      });
      await batch.commit();
    } catch (e) {
      console.error("전역 부과설정 저장 실패:", e);
    }

    // 3) 로컬 전역도 동기화(오프라인/캐시)
    const globalLocal = loadChargeGlobal();
    const nextGlobal = { ...globalLocal, ...chargeDraft };
    saveChargeGlobal(nextGlobal);

    setChargeModalOpen(false);

    // 4) 월별 원격도 동기화(선택사항): 현재 월 rows 저장
    debouncedSave(yyyymm, next);
  };

  /* ===== 🔒 저장 로직 (로컬 + 원격) ===== */
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
    <div className="pec-page">
      {/* ===== 히어로 타이틀 ===== */}
      <section className="pec-hero">
        <div className="pec-hero__content">
          <div className="pec-hero__eyebrow">PUBLIC ELECTRICITY CALCULATION</div>
          <h2>공용전기 계산</h2>
        </div>
      </section>

      {/* ===== 툴바 (년/월 선택 · 업로드 · 부과설정 · 수정 · 삭제 · 검색) ===== */}
      <section className="pec-toolbar">
        <div className="pec-toolbar__left">
          <div className="pec-select-group">
            <button
              type="button"
              className={`pec-picker-trigger pec-picker-trigger-year ${
                yearPickerOpen ? "is-open" : ""
              }`}
              onClick={toggleYearPicker}
            >
              {year}년
              <i
                className={`ri-arrow-down-s-line ${
                  yearPickerOpen ? "is-open" : ""
                }`}
              />
            </button>

            <button
              type="button"
              className={`pec-picker-trigger pec-picker-trigger-month ${
                monthPickerOpen ? "is-open" : ""
              }`}
              onClick={toggleMonthPicker}
            >
              {month}월
              <i
                className={`ri-arrow-down-s-line ${
                  monthPickerOpen ? "is-open" : ""
                }`}
              />
            </button>
          </div>

          <button
            type="button"
            className="pec-tool-button is-upload"
            onClick={() => fileInputRef.current?.click()}
          >
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

          <button
            type="button"
            className="pec-tool-button is-settings"
            onClick={openChargeModal}
            title="부과 대상 설정"
          >
            <i className="ri-settings-3-line" />
            부과설정
          </button>

          <button
            type="button"
            className={`pec-tool-button is-edit ${editBilled ? "is-active" : ""}`}
            onClick={onToggleEditBilled}
            title="청구요금 인라인 수정 토글"
          >
            <i className="ri-edit-2-line" />
            {editBilled ? "수정 종료" : "수정"}
          </button>

          <button
            type="button"
            className="pec-tool-button is-danger"
            onClick={onClearAll}
            title="전체 삭제"
          >
            <i className="ri-delete-bin-6-line" />
            전체 삭제
          </button>
        </div>

        <div className="pec-search">
          <span className="pec-search__icon">⌕</span>

          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="코드번호, 빌라명, 공용전기번호 검색"
          />

          {searchText && (
            <button
              type="button"
              className="pec-search__clear"
              onClick={() => setSearchText("")}
              aria-label="검색어 지우기"
            >
              ✕
            </button>
          )}
        </div>
      </section>

      {/* ===== 요약 카드 ===== */}
      <section className="pec-summary-grid">
        <div className="pec-summary-card pec-summary-card--billed">
          <div className="pec-summary-card__label">청구요금 합계</div>
          <div className="pec-summary-card__number">
            {fmt(summary.totalBilled)}
            <span>원</span>
          </div>
        </div>

        <div className="pec-summary-card pec-summary-card--assessed">
          <div className="pec-summary-card__label">부과요금 합계</div>
          <div className="pec-summary-card__number">
            {fmt(summary.totalAssessed)}
            <span>원</span>
          </div>
        </div>

        <div
          className={`pec-summary-card ${
            summary.totalDiff < 0
              ? "pec-summary-card--diff-neg"
              : "pec-summary-card--diff-pos"
          }`}
        >
          <div className="pec-summary-card__label">차액 합계</div>
          <div className="pec-summary-card__number">
            {fmt(summary.totalDiff)}
            <span>원</span>
          </div>
        </div>
      </section>

      {/* ===== 데이터 테이블 ===== */}
      <section className="pec-table-card">
        <div className="pec-table-head">
          <h3>빌라별 공용전기 부과 내역</h3>
          <span className="pec-table-count">{filteredRows.length}건</span>
        </div>

        <div className="pec-table-scroll">
          <table className="pec-table">
            <thead>
              <tr>
                <th className="col-no">번호</th>
                <th className="col-code">코드번호</th>
                <th className="col-villa">빌라명</th>
                <th className="col-households">적용세대수*</th>
                <th className="col-billed">청구요금{editBilled ? "*" : ""}</th>
                <th className="col-assessed">부과요금</th>
                <th className="col-diff">차액</th>
                <th className="col-method">계산방법*</th>
                <th className="col-memo">비고</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, idx) => {
                const readOnly = r.charge === "부과안함";
                return (
                  <tr key={r.id} className={readOnly ? "row-excluded" : ""}>
                    <td className="c pec-no-cell">{idx + 1}</td>
                    <td className="c pec-code-cell">{String(r.code ?? "")}</td>
                    <td className="l">
                      <div className="pec-villa-cell">
                        <div className="pec-villa-cell__name-row">
                          <strong>{r.name || "-"}</strong>
                          {r.charge === "부과안함" && (
                            <span className="pec-tag-excluded">부과안함</span>
                          )}
                        </div>
                        {r.pubNo ? (
                          <span className="pec-villa-cell__sub">
                            공용전기 {r.pubNo}
                          </span>
                        ) : (
                          <span className="pec-villa-cell__sub is-empty">
                            공용전기 없음
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 적용세대수 */}
                    <td className="c">
                      <input
                        ref={(el) => (householdsRefs.current[idx] = el)}
                        className="pec-input num"
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
                        <div className="pec-money-edit">
                          <input
                            className="pec-input num"
                            inputMode="numeric"
                            value={r.billed ? fmt(r.billed) : ""}
                            onChange={(e) => updateCell(r.id, "billed", e.target.value)}
                            placeholder="0"
                            disabled={readOnly}
                          />
                          <span className="unit">원</span>
                        </div>
                      ) : (
                        <span className="pec-money billed-money">
                          {r.billed ? `${fmt(r.billed)}원` : "-"}
                        </span>
                      )}
                    </td>

                    {/* 부과요금 */}
                    <td className="c">
                      <span className="pec-money assessed-money">
                        {r.assessed ? `${fmt(r.assessed)}원` : "-"}
                      </span>
                    </td>

                    {/* 차액 */}
                    <td className="c">
                      <span className={`pec-money ${r.diff >= 0 ? "pos" : "neg"}`}>
                        {r.diff ? `${fmt(r.diff)}원` : "-"}
                      </span>
                    </td>

                    {/* 계산방법 */}
                    <td className="c">
                      <button
                        type="button"
                        className={`pec-method-trigger pec-method-trigger-${
                          r.method === "계산안함" ? "off" : "on"
                        } ${openMethodRowId === r.id ? "is-open" : ""}`}
                        onClick={(e) => toggleMethodPicker(r, e)}
                        disabled={readOnly}
                      >
                        <span className="pec-method-trigger-dot" />
                        {r.method}
                        <i
                          className={`ri-arrow-down-s-line ${
                            openMethodRowId === r.id ? "is-open" : ""
                          }`}
                        />
                      </button>
                    </td>

                    {/* 비고 */}
                    <td className="l">
                      <input
                        className="pec-input"
                        value={r.memo}
                        onChange={(e) => updateCell(r.id, "memo", e.target.value)}
                        disabled={readOnly}
                      />
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="pec-empty-cell">
                    {rows.length === 0
                      ? "공용전기 등록된 빌라가 없습니다."
                      : "검색 결과가 없습니다."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== 년도 선택 팝업 ===== */}
      {yearPickerOpen &&
        createPortal(
          <div
            ref={yearPickerRef}
            className="pec-picker-popup"
            style={{ top: yearPickerPos.top, left: yearPickerPos.left }}
          >
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                className={`pec-picker-option ${year === y ? "is-selected" : ""}`}
                onClick={() => {
                  setYear(y);
                  setYearPickerOpen(false);
                }}
              >
                <span className="pec-picker-option-text">{y}년</span>
                {year === y && <i className="ri-check-line pec-picker-option-check" />}
              </button>
            ))}
          </div>,
          document.body
        )}

      {/* ===== 월 선택 팝업 ===== */}
      {monthPickerOpen &&
        createPortal(
          <div
            ref={monthPickerRef}
            className="pec-picker-popup"
            style={{ top: monthPickerPos.top, left: monthPickerPos.left }}
          >
            {MONTHS.map((m) => (
              <button
                key={m}
                type="button"
                className={`pec-picker-option ${month === m ? "is-selected" : ""}`}
                onClick={() => {
                  setMonth(m);
                  setMonthPickerOpen(false);
                }}
              >
                <span className="pec-picker-option-text">{m}월</span>
                {month === m && <i className="ri-check-line pec-picker-option-check" />}
              </button>
            ))}
          </div>,
          document.body
        )}

      {/* ===== 계산방법 선택 팝업 ===== */}
      {openMethodRowId &&
        openMethodRow &&
        createPortal(
          <div
            ref={methodPickerRef}
            className="pec-picker-popup pec-method-popup"
            style={{ top: methodPickerPos.top, left: methodPickerPos.left }}
          >
            {METHOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`pec-method-option pec-method-option-${
                  option.value === "계산안함" ? "off" : "on"
                } ${openMethodRow.method === option.value ? "is-selected" : ""}`}
                onClick={() => handleMethodSelect(openMethodRow, option.value)}
              >
                <span className="pec-method-option-dot" />
                <span className="pec-method-option-text">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                {openMethodRow.method === option.value && (
                  <i className="ri-check-line pec-method-option-check" />
                )}
              </button>
            ))}
          </div>,
          document.body
        )}

      {/* ===== 부과설정 모달 ===== */}
      {chargeModalOpen && (
        <div className="pec-modal-overlay" onClick={() => setChargeModalOpen(false)}>
          <div className="pec-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pec-modal-head">
              <div>
                <h3>부과설정</h3>
                <p>빌라별 공용전기 요금 부과 여부를 설정합니다.</p>
              </div>

              <button
                type="button"
                className="pec-modal-close"
                onClick={() => setChargeModalOpen(false)}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="pec-modal-body">
              <table className="pec-modal-table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>코드번호</th>
                    <th>빌라명</th>
                    <th style={{ width: 150 }}>부과설정</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="c pec-code-cell">{String(r.code ?? "")}</td>
                      <td className="l">
                        <div className="pec-villa-cell">
                          <div className="pec-villa-cell__name-row">
                            <strong>{r.name || "-"}</strong>
                          </div>
                          {r.pubNo ? (
                            <span className="pec-villa-cell__sub">
                              공용전기 {r.pubNo}
                            </span>
                          ) : (
                            <span className="pec-villa-cell__sub is-empty">
                              공용전기 없음
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="c">
                        <select
                          className="pec-select"
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
                      <td colSpan={3} className="pec-empty-cell">
                        설정할 빌라가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pec-modal-foot">
              <button
                type="button"
                className="pec-modal-cancel"
                onClick={() => setChargeModalOpen(false)}
              >
                취소
              </button>

              <button
                type="button"
                className="pec-modal-save"
                onClick={saveChargeModal}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
