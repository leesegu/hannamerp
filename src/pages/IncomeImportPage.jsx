// ==================================
// 관리비회계 · 수입정리 페이지
// (수정)
// 1) 엑셀 업로드: 파싱 → 표 반영 → Firestore 자동 저장
// 2) 저장 컬렉션: acct_income  (※ income_records 사용 안 함)
// 3) 엑셀 컬럼 매핑: 일자→date, 구분→category, 입금금액→inAmt, 거래기록사항→record, 거래메모→memo
// 4) '엑셀자료추가' 기능 및 관련 코드 제거
// 5) 날짜 -1일 표시 문제: EPS 보정 + 날짜전용열 시간 소수부 제거(자정 고정) + 1900/1904 대응 + 문자열파서 미사용
// 6) 수동 '추가'(모달) 포함
// 7) Firestore 실시간(onSnapshot) 반영 + 수정 실시간 저장(디바운스)
// 8) '입금만' / '수정모드' 토글 퍼플 스타일
// ==================================
import React, {
  useCallback, useMemo, useRef, useState, useEffect,
} from "react";
import * as XLSX from "xlsx";
import "./IncomeImportPage.css";

import { db } from "../firebase";
import {
  collection,
  getDocs,
  onSnapshot,
  query as fsQuery,
  orderBy as fsOrderBy,
  writeBatch,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

/* ===== 유틸 ===== */
const s = (v) => String(v ?? "").trim();
const toNumber = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const num = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
};
const pad2 = (n) => String(n).padStart(2, "0");
const fmtComma = (n) => (toNumber(n) ? toNumber(n).toLocaleString() : "");

/* ===== 날짜 처리 ===== */
const EXCEL_EPS = 1e-7;

const excelSerialToLocalDate = (val, opts = {}) => {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  const { truncateTime = false, date1904 = false } = opts;

  let serial = val;
  if (Math.abs(serial - Math.round(serial)) < EXCEL_EPS) serial = Math.round(serial);
  if (truncateTime) serial = Math.floor(serial + EXCEL_EPS);

  const o = XLSX.SSF.parse_date_code(serial, { date1904 });
  if (!o) return null;

  const H = truncateTime ? 0 : (o.H || 0);
  const M = truncateTime ? 0 : (o.M || 0);
  const S = truncateTime ? 0 : Math.floor(o.S || 0);
  return new Date(o.y, (o.m || 1) - 1, o.d || 1, H, M, S);
};

const parseKoreanDateTime = (v) => {
  const raw = s(v);
  if (!raw) return null;
  const norm = raw.replace(/[.\-]/g, "/").replace(/\s+/g, " ").trim();
  const m = norm.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, Y, M, D, hh = "0", mm = "0", ss = "0"] = m;
  const dt = new Date(+Y, +M - 1, +D, +hh, +mm, +ss);
  return isNaN(dt) ? null : dt;
};

const normalizeExcelCellToLocalDate = (cell, { truncateTime = false, date1904 = false } = {}) => {
  if (cell == null || cell === "") return null;

  if (typeof cell === "number" && Number.isFinite(cell)) {
    return excelSerialToLocalDate(cell, { truncateTime, date1904 });
  }

  if (cell instanceof Date && !isNaN(cell)) {
    return new Date(
      cell.getFullYear(), cell.getMonth(), cell.getDate(),
      truncateTime ? 0 : cell.getHours(),
      truncateTime ? 0 : cell.getMinutes(),
      truncateTime ? 0 : cell.getSeconds()
    );
  }

  const d = parseKoreanDateTime(cell);
  if (!(d instanceof Date) || isNaN(d)) return null;
  if (truncateTime) return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  return d;
};

const fmtDateLocal = (d) => {
  if (!(d instanceof Date) || isNaN(d)) return "";
  const ld = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  return `${ld.getFullYear()}-${pad2(ld.getMonth() + 1)}-${pad2(ld.getDate())}`;
};
const fmtTimeLocal = (d) =>
  d instanceof Date && !isNaN(d)
    ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
    : "";

const parseYMDLocal = (ymd) => {
  if (!ymd) return null;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m.map((t) => +t);
  return new Date(y, mo - 1, d);
};

const ymdToDate = (y, m, d) => new Date(y, m - 1, d);
const parseHms = (t) => {
  const m = s(t).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return [0, 0, 0];
  return [+(m[1] || 0), +(m[2] || 0), +(m[3] || 0)];
};

/* ===== 엑셀 파싱 보조 ===== */
function findHeaderRow(rows) {
  const maxScan = Math.min(rows.length, 50);
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] || [];
    const text = row.map((c) => s(c));
    const hasDateTime = text.some((c) => c.includes("거래일시"));
    const hasDateOnly =
      text.some((c) => c.includes("일자")) ||
      text.some((c) => c.includes("거래일")) ||
      text.some((c) => c.includes("거래일자"));
    const hasInAmt = text.some((c) => c.includes("입금금액"));
    if ((hasDateTime || hasDateOnly) && hasInAmt) return i;
  }
  return -1;
}
function findFollowingValue(rows, r0, c0, maxRadius = 8) {
  for (let c = c0 + 1; c <= c0 + maxRadius; c++) {
    const v = rows[r0]?.[c];
    if (s(v)) return s(v);
  }
  for (let r = r0 + 1; r <= r0 + maxRadius; r++) {
    const v = rows[r]?.[c0 + 1] ?? rows[r]?.[c0];
    if (s(v)) return s(v);
  }
  for (let dr = 0; dr <= maxRadius; dr++) {
    for (let dc = 0; dc <= maxRadius; dc++) {
      const v = rows[r0 + dr]?.[c0 + dc];
      if (s(v)) return s(v);
    }
  }
  return "";
}
function parseMeta(rows) {
  const meta = {};
  const scan = Math.min(rows.length, 30);
  for (let i = 0; i < scan; i++) {
    const r = rows[i] || [];
    for (let j = 0; j < r.length; j++) {
      const cell = s(r[j]);
      if (!cell) continue;
      if (cell.includes("계좌번호")) {
        const val = s(r[j + 1]) || findFollowingValue(rows, i, j);
        meta.accountNo = val || meta.accountNo;
      }
      if (cell.includes("예금주명")) {
        const val = s(r[j + 1]) || findFollowingValue(rows, i, j);
        meta.holder = val || meta.holder;
      }
      if (cell.includes("통장잔액")) {
        const val = s(r[j + 1]) || findFollowingValue(rows, i, j);
        meta.balanceText = val || meta.balanceText;
      }
    }
  }
  meta.balance = toNumber(meta.balanceText);
  return meta;
}

const makeDupKey = (r) =>
  [r.date, r.time, toNumber(r.inAmt), s(r.record)].join("|"); // (balance 제외: 저장 스키마 간소화)

/* 컬럼 매핑/레코드 변환 */
function rowsToRecords(rows, headerRowIdx, meta, { date1904 = false } = {}) {
  const header = (rows[headerRowIdx] || []).map((h) => s(h));
  const idx = (key) => header.findIndex((h) => h.includes(key));

  const col = {
    seq: idx("순번"),
    dateTime: idx("거래일시"),
    dateOnly: (() => {
      const cands = ["일자", "거래일자", "거래일"];
      for (const k of cands) {
        const i = idx(k);
        if (i >= 0) return i;
      }
      return -1;
    })(),
    timeOnly: idx("시간"),
    inAmt: idx("입금금액"),
    outAmt: idx("출금금액"),
    balance: idx("거래후잔액"),
    record: idx("거래기록사항"),
    memo: idx("거래메모"),
    category: idx("구분"),
  };

  const out = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const hasAny = row.some((c) => s(c) !== "");
    if (!hasAny) continue;

    let dt = null;
    let dateStr = "";
    let timeStr = "";

    // 거래일시
    if (col.dateTime >= 0) {
      const raw = row[col.dateTime];
      const d = normalizeExcelCellToLocalDate(raw, { truncateTime: false, date1904 });
      if (d) {
        dt = d;
        dateStr = fmtDateLocal(d);
        timeStr = fmtTimeLocal(d);
      }
    }

    // 일자/거래일(자정 고정)
    if (!dateStr && col.dateOnly >= 0) {
      const rawD = row[col.dateOnly];
      const d = normalizeExcelCellToLocalDate(rawD, { truncateTime: true, date1904 });
      if (d) {
        dateStr = fmtDateLocal(d);
      } else {
        const m = s(rawD).replace(/[.]/g, "/").replace(/-/g, "/").match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
        if (m) {
          const dd = new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0);
          dateStr = fmtDateLocal(dd);
        }
      }

      if (col.timeOnly >= 0) {
        const rawT = s(row[col.timeOnly]);
        const [hh, mm, ss] = parseHms(rawT);
        timeStr = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
      }
      if (dateStr && !timeStr) timeStr = "00:00:00";
      if (dateStr) {
        const [yy, mo, dd] = dateStr.split("-").map((t) => +t);
        const [hh, mi, ss] = parseHms(timeStr || "00:00:00");
        dt = new Date(yy, (mo || 1) - 1, dd || 1, hh, mi, ss);
      }
    }

    const inAmt = col.inAmt >= 0 ? toNumber(row[col.inAmt]) : 0;
    const outAmt = col.outAmt >= 0 ? toNumber(row[col.outAmt]) : 0;

    out.push({
      _id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      accountNo: s(meta.accountNo),
      holder: s(meta.holder),
      date: dateStr,
      time: timeStr || "00:00:00",
      datetime: `${dateStr} ${timeStr || "00:00:00"}`,
      inAmt,
      outAmt,
      balance: col.balance >= 0 ? toNumber(row[col.balance]) : 0,
      record: col.record >= 0 ? s(row[col.record]) : "",
      memo: col.memo >= 0 ? s(row[col.memo]) : "",
      category: col.category >= 0 ? s(row[col.category]) : "",
      _seq: col.seq >= 0 ? s(row[col.seq]) : "",
      type: inAmt > 0 ? "입금" : outAmt > 0 ? "출금" : "",
      unconfirmed: false,
    });
  }
  return out;
}

/* ===== 색/선택 유틸 ===== */
function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function safeHueFromName(name) {
  const key = s(name);
  if (key === "무통장입금") return 140;
  if (key === "이사정산") return 270;
  const bands = [
    [30, 90],
    [120, 210],
    [210, 300],
  ];
  const seed = hash(key);
  const b = bands[seed % bands.length];
  const span = b[1] - b[0];
  return b[0] + (seed % span);
}
function colorTokens(name) {
  const h = safeHueFromName(name || "default");
  return {
    text: `hsl(${h}, 70%, 32%)`,
    border: `hsl(${h}, 90%, 80%)`,
    bgTop: `hsl(${h}, 100%, 98%)`,
    bgBot: `hsl(${h}, 92%, 96%)`,
  };
}
function colorVars(name) {
  const { text, border, bgTop, bgBot } = colorTokens(name);
  return { "--cat-color": text, "--cat-border": border, "--cat-bg-top": bgTop, "--cat-bg-bot": bgBot };
}
function selectStyle(name) {
  if (!s(name)) return {};
  const { text, border, bgTop, bgBot } = colorTokens(name);
  return {
    color: text,
    borderColor: border,
    backgroundImage:
      `linear-gradient(180deg, ${bgTop} 0%, ${bgBot} 100%),` +
      `url("data:image/svg+xml;utf8,<svg fill='%236b7280' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M5.5 7.5l4.5 4 4.5-4'/></svg>")`,
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundPosition: "right 8px center, right 8px center",
    backgroundSize: "auto, 12px",
  };
}

/* ===== 공용 모달 ===== */
function Modal({
  open, title, children, onClose, onConfirm,
  confirmText = "확인", cancelText = "닫기",
  mode = "confirm", primaryFirst = false, showClose = true, variant = "default"
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card ${variant === "large" ? "lg" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title nowrap">{title}</div>
          {showClose ? <button className="modal-x" onClick={onClose}>×</button> : null}
        </div>
        <div className="modal-body scrollable">{children}</div>
        <div className="modal-foot">
          {mode === "confirm" ? (
            primaryFirst ? (
              <>
                <button className="btn danger" onClick={onConfirm}>{confirmText}</button>
                <button className="btn" onClick={onClose}>{cancelText}</button>
              </>
            ) : (
              <>
                <button className="btn" onClick={onClose}>{cancelText}</button>
                <button className="btn danger" onClick={onConfirm}>{confirmText}</button>
              </>
            )
          ) : (
            <button className="btn" onClick={onClose}>{cancelText}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ★ 계좌번호 기반 자동카테고리 */
function autoCategoryByAccount(accountNoRaw = "") {
  const acct = s(accountNoRaw).replace(/\s|-/g, "");
  if (acct.startsWith("356")) return "무통장입금";
  if (acct.startsWith("352")) return "이사정산";
  return "";
}

/* ===== Firestore 저장/갱신 유틸 ===== */
const collRef = collection(db, "acct_income");

/** 업로드 신규 레코드 자동 저장(필드 폭넓게 저장: 이후 실시간 뷰/수정 용이) */
async function autosaveChunk(list) {
  if (!list.length) return 0;
  const batch = writeBatch(db);
  list.forEach((r) => {
    const id = `r_${hash(makeDupKey(r)).toString(16)}`;
    const ref = doc(collRef, id);
    batch.set(
      ref,
      {
        _id: id,
        date: s(r.date),
        time: s(r.time || "00:00:00"),
        datetime: s(r.datetime || `${s(r.date)} ${s(r.time || "00:00:00")}`),
        accountNo: s(r.accountNo),
        holder: s(r.holder),
        category: s(r.category || ""),
        inAmt: toNumber(r.inAmt),
        outAmt: toNumber(r.outAmt),
        balance: toNumber(r.balance),
        record: s(r.record),
        memo: s(r.memo),
        _seq: s(r._seq || ""),
        type: r.type || (toNumber(r.inAmt) > 0 ? "입금" : toNumber(r.outAmt) > 0 ? "출금" : ""),
        unconfirmed: !!r.unconfirmed,
        importedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
  await batch.commit();
  return list.length;
}

/** 단건 패치(디바운스용) */
async function patchDoc(id, patch) {
  const ref = doc(collRef, id);
  await setDoc(ref, { ...patch }, { merge: true });
}

/* ===== 메인 ===== */
export default function IncomeImportPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  // 중복 알림
  const [dupInfo, setDupInfo] = useState(null);
  const [dupOpen, setDupOpen] = useState(false);

  // 검색/필터/모드
  const [query, setQuery] = useState("");
  const [onlyIncome, setOnlyIncome] = useState(true);
  const [editMode, setEditMode] = useState(false);

  // 페이지 사이즈
  const pageSizeOptions = [50, 100, 300, 500];
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  // 분류 목록
  const [incomeCategories, setIncomeCategories] = useState([]);

  // 미확인 모달
  const [unconfOpen, setUnconfOpen] = useState(false);
  const [unconfQuery, setUnconfQuery] = useState("");
  const [unconfDraft, setUnconfDraft] = useState({});

  // 수동 추가 모달
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    date: "",
    category: "",
    inAmt: "",
    record: "",
    memo: "",
  });

  /* 기간 */
  const today = useMemo(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  }, []);
  const [yFrom, setYFrom] = useState(today.y);
  const [mFrom, setMFrom] = useState(today.m);
  const [dFrom, setDFrom] = useState(today.d);
  const [yTo, setYTo] = useState(today.y);
  const [mTo, setMTo] = useState(today.m);
  const [dTo, setDTo] = useState(today.d);

  const clampRange = useCallback((nyF, nmF, ndF, nyT, nmT, ndT) => {
    const start = ymdToDate(nyF, nmF - 1, ndF);
    const end = ymdToDate(nyT, nmT - 1, ndT);
    if (start > end) return [nyF, nmF, ndF, nyF, nmF, ndF];
    return [nyF, nmF, ndF, nyT, nmT, ndT];
  }, []);

  /* 정렬 상태 */
  const [sortKey, setSortKey] = useState("datetime");
  const [sortDir, setSortDir] = useState("desc");

  // 정렬 클릭
  const clickSort = useCallback((key) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  /* 파일 업로드(파싱) */
  const fileInputRef = useRef(null);
  const onPickFiles = useCallback(() => fileInputRef.current?.click(), []);

  // ▼ 업로드(파싱 → rows 반영 → 자동 저장)
  const [uploadError, setUploadError] = useState("");
  const handleFiles = useCallback(
    async (files) => {
      setError("");
      setUploadError("");
      const merged = [];

      const abKeys = new Set(rows.map((r) => makeDupKey(r)));
      const dupExamples = new Set();
      let dupCount = 0;

      for (const file of files) {
        try {
          const ab = await file.arrayBuffer();
          const wb = XLSX.read(ab, { type: "array", cellDates: true });
          const is1904 = !!(wb?.Workbook?.WBProps?.date1904);

          const ws = wb.Sheets[wb.SheetNames[0]];
          const aoo = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });

          const meta = parseMeta(aoo);
          const headerRowIdx = findHeaderRow(aoo);
          if (headerRowIdx === -1) throw new Error("헤더(일자/거래일시/입금금액 등)를 찾지 못했습니다.");

          const recs = rowsToRecords(aoo, headerRowIdx, meta, { date1904: is1904 });
          for (const r of recs) {
            const key = makeDupKey(r);
            if (abKeys.has(key)) {
              dupCount++;
              if (dupExamples.size < 5)
                dupExamples.add(`${r.date} ${r.time} | ${r.category || r.type} ${fmtComma(r.inAmt || r.outAmt)} | ${r.record}`);
              continue;
            }
            abKeys.add(key);
            merged.push(r);
          }
        } catch (e) {
          console.error(e);
          setUploadError((prev) => prev + `\n[${file.name}] ${e.message || String(e)}`);
        }
      }

      if (dupCount > 0) {
        setDupInfo({ count: dupCount, examples: Array.from(dupExamples) });
        setDupOpen(true);
      } else {
        setDupInfo(null);
        setDupOpen(false);
      }

      // UI 즉시 반영
      const nextRows = [...rows, ...merged].sort((a, b) => s(b.datetime).localeCompare(s(a.datetime)));
      setRows(nextRows);
      setPage(1);

      // 기간 자동 보정(최근 일자)
      const last = nextRows.find((r) => r.date);
      if (last?.date) {
        const [yy, mm, dd] = last.date.split("-").map((t) => +t);
        const [nyF, nmF, ndF, nyT, nmT, ndT] = clampRange(yy, mm, dd, yy, mm, dd);
        setYFrom(nyF); setMFrom(nmF); setDFrom(ndF);
        setYTo(nyT);   setMTo(nmT);   setDTo(ndT);
      }

      // Firestore 저장
      try {
        await autosaveChunk(merged);
      } catch (e) {
        console.error("자동 저장 실패:", e);
        setUploadError((prev) => prev + `\n자동 저장 실패: ${e?.message || e}`);
      }
    },
    [rows, clampRange]
  );

  /* ===== 수입 대분류 로드 ===== */
  useEffect(() => {
    const safeSort = (arr) =>
      [...arr].sort((a, b) => {
        const ao = Number.isFinite(+a.order) ? +a.order : Number.MAX_SAFE_INTEGER;
        const bo = Number.isFinite(+b.order) ? +b.order : Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        const ac = a.createdAt ?? Number.MAX_SAFE_INTEGER;
        const bc = b.createdAt ?? Number.MAX_SAFE_INTEGER;
        if (ac !== bc) return ac > bc ? 1 : -1;
        return s(a.name).localeCompare(s(b.name));
      });

    const col = collection(db, "acct_income_main");
    const qy = fsQuery(col, fsOrderBy("order", "asc"));

    const unsub = onSnapshot(
      qy,
      (snap) => {
        let items = snap.docs
          .map((d) => {
            const data = d.data() || {};
            return {
              name: s(data.name || d.id),
              order: data.order,
              createdAt: data.createdAt ?? data.created_at ?? data.created ?? undefined,
            };
          })
          .filter((x) => !!x.name);
        items = safeSort(items);
        setIncomeCategories(items.map((x) => x.name));
      },
      async () => {
        try {
          const snap2 = await getDocs(col);
          let items = snap2.docs
            .map((d) => {
              const data = d.data() || {};
              return {
                name: s(data.name || d.id),
                order: data.order,
                createdAt: data.createdAt ?? data.created_at ?? data.created ?? undefined,
              };
            })
            .filter((x) => !!x.name);
          items = safeSort(items);
          setIncomeCategories(items.map((x) => x.name));
        } catch {
          setIncomeCategories([]);
        }
      }
    );
    return () => unsub();
  }, []);

  /* ===== Firestore 실시간 구독: 컬렉션 전체 최신 반영 ===== */
  useEffect(() => {
    const q = fsQuery(collRef, fsOrderBy("date", "desc"), fsOrderBy("importedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() || {};
          const inAmt = toNumber(data.inAmt);
          const outAmt = toNumber(data.outAmt);
          const time = s(data.time || "00:00:00");
          const date = s(data.date || "");
          return {
            _id: s(data._id || d.id),
            accountNo: s(data.accountNo),
            holder: s(data.holder),
            date,
            time,
            datetime: s(data.datetime || (date ? `${date} ${time}` : "")),
            inAmt,
            outAmt,
            balance: toNumber(data.balance),
            record: s(data.record),
            memo: s(data.memo),
            category: s(data.category),
            _seq: s(data._seq),
            type: data.type || (inAmt > 0 ? "입금" : outAmt > 0 ? "출금" : ""),
            unconfirmed: !!data.unconfirmed,
          };
        });
        setRows(list);
      },
      (e) => {
        console.error(e);
        setError(String(e?.message || e));
      }
    );
    return () => unsub();
  }, []);

  /* ===== 인라인 수정 → 디바운스 저장 ===== */
  const saveTimers = useRef({});
  const scheduleSave = useCallback((id, patch) => {
    const key = String(id);
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(async () => {
      try { await patchDoc(key, patch); }
      catch (e) { console.error("저장 실패:", e); }
      finally { delete saveTimers.current[key]; }
    }, 350);
  }, []);

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
    scheduleSave(id, patch);
  };

  // 엔터로 다음 메모로
  const memoRefs = useRef({});
  const setMemoRef = (id, el) => { memoRefs.current[id] = el; };
  const focusNextMemo = (currentId, pageRows) => {
    const idsInPageOrder = pageRows.map((r) => r._id);
    const idx = idsInPageOrder.indexOf(currentId);
    if (idx >= 0 && idx < idsInPageOrder.length - 1) {
      const nextId = idsInPageOrder[idx + 1];
      const el = memoRefs.current[nextId];
      if (el) el.focus();
    }
  };

  // 미확인
  const unconfirmedList = useMemo(() => rows.filter((r) => r.unconfirmed), [rows]);
  const unconfirmedTotalInAmt = useMemo(
    () => unconfirmedList.reduce((sum, r) => sum + toNumber(r.inAmt), 0),
    [unconfirmedList]
  );
  useEffect(() => {
    if (unconfOpen) {
      const initial = {};
      unconfirmedList.forEach((r) => {
        initial[r._id] = {
          memo: r.memo,
          unconfirmed: !!r.unconfirmed,
          category: r.category || autoCategoryByAccount(r.accountNo) || "",
        };
      });
      setUnconfDraft(initial);
      setUnconfQuery("");
    }
  }, [unconfOpen, unconfirmedList]);

  const modalList = useMemo(() => {
    const q = s(unconfQuery).toLowerCase();
    if (!q) return unconfirmedList;
    const qNum = toNumber(q);
    return unconfirmedList.filter((r) => {
      const draftMemo = unconfDraft[r._id]?.memo ?? r.memo ?? "";
      const bag = [r.record, draftMemo].join("\n").toLowerCase();
      const textHit = bag.includes(q);
      const amtHit = qNum > 0 && (toNumber(r.inAmt) === qNum || fmtComma(r.inAmt).includes(q));
      return textHit || amtHit;
    });
  }, [unconfQuery, unconfirmedList, unconfDraft]);

  const setDraftMemo = (id, memo) =>
    setUnconfDraft((p) => ({ ...p, [id]: { ...(p[id] || {}), memo } }));
  const setDraftFlag = (id, flag) =>
    setUnconfDraft((p) => ({ ...p, [id]: { ...(p[id] || {}), unconfirmed: !!flag } }));
  const setDraftCategory = (id, category) =>
    setUnconfDraft((p) => ({ ...p, [id]: { ...(p[id] || {}), category } }));

  const applyUnconfEdits = async () => {
    // 로컬 반영
    setRows((prev) =>
      prev.map((r) => {
        const d = unconfDraft[r._id];
        return d
          ? { ...r, memo: d.memo, unconfirmed: !!d.unconfirmed, category: d.category ?? r.category }
          : r;
      })
    );
    setUnconfOpen(false);

    // 서버 반영(batch)
    try {
      const batch = writeBatch(db);
      Object.entries(unconfDraft).forEach(([id, d]) => {
        const ref = doc(collRef, id);
        batch.set(ref, {
          memo: s(d.memo),
          unconfirmed: !!d.unconfirmed,
          category: s(d.category || ""),
        }, { merge: true });
      });
      await batch.commit();
    } catch (e) {
      console.error("미확인 저장 실패:", e);
    }
  };

  /* ===== 기간 필터 → 통계용 ===== */
  const rangeList = useMemo(() => {
    const start = new Date(yFrom, mFrom - 1, dFrom, 0, 0, 0, 0);
    const end = new Date(yTo, mTo - 1, dTo, 23, 59, 59, 999);
    return rows.filter((r) => {
      const rDate = parseYMDLocal(r.date);
      if (!(rDate instanceof Date) || isNaN(rDate)) return false;
      const d0 = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const d1 = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      return !(rDate < d0 || rDate > d1);
    });
  }, [rows, yFrom, mFrom, dFrom, yTo, mTo, dTo]);

  /* 통계 */
  const statCount = rangeList.length;
  const statInSum = useMemo(() => rangeList.reduce((sum, r) => sum + toNumber(r.inAmt), 0), [rangeList]);
  const statOutSum = useMemo(() => rangeList.reduce((sum, r) => sum + toNumber(r.outAmt), 0), [rangeList]);
  const statMemoMiss = useMemo(
    () => rangeList.filter((r) => toNumber(r.inAmt) > 0 && !r.unconfirmed && s(r.memo) === "").length,
    [rangeList]
  );

  /* 검색/입금만 반영 목록 */
  const filtered = useMemo(() => {
    const q = s(query);
    const qLower = q.toLowerCase();
    const qNum = toNumber(q);

    return rangeList.filter((r) => {
      if (onlyIncome && !(r.inAmt > 0)) return false;
      if (!q) return true;

      if (qNum > 0) {
        const inEq = toNumber(r.inAmt) === qNum;
        const outEq = toNumber(r.outAmt) === qNum;
        const contains = fmtComma(r.inAmt).includes(q) || fmtComma(r.outAmt).includes(q);
        if (inEq || outEq || contains) return true;
      }

      const bag = [(r.category || r.type), r.accountNo, r.holder, r.record, r.memo].join("\n").toLowerCase();
      return bag.includes(qLower);
    });
  }, [rangeList, query, onlyIncome]);

  /* 정렬 */
  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (sortKey === "inAmt" || sortKey === "outAmt") {
        return (toNumber(av) - toNumber(bv)) * (sortDir === "asc" ? 1 : -1);
        }
      return s(av).localeCompare(s(bv)) * (sortDir === "asc" ? 1 : -1);
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  /* 페이지 */
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const startIdx = (curPage - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const pageRows = sorted.slice(startIdx, endIdx);

  /* 수동 추가 */
  const openAdd = () => {
    setAddForm({
      date: fmtDateLocal(new Date()),
      category: incomeCategories[0] || "",
      inAmt: "",
      record: "",
      memo: "",
    });
    setAddOpen(true);
  };
  const changeAdd = (key, val) => setAddForm((p) => ({ ...p, [key]: val }));
  const changeMoney = (val) => {
    const n = toNumber(val);
    return n ? n.toLocaleString() : "";
  };
  const saveAdd = async () => {
    const date = s(addForm.date);
    const category = s(addForm.category);
    const inAmtNum = toNumber(addForm.inAmt);
    const record = s(addForm.record);
    const memo = s(addForm.memo);
    if (!date || !category || !inAmtNum) {
      alert("거래일, 구분, 입금금액은 필수입니다.");
      return;
    }
    const newRow = {
      _id: `${Date.now()}_${Math.random().toString(36).slice(2,9)}`,
      accountNo: "",
      holder: "",
      date,
      time: "00:00:00",
      datetime: `${date} 00:00:00`,
      inAmt: inAmtNum,
      outAmt: 0,
      balance: 0,
      record,
      memo,
      category,
      _seq: "",
      type: "입금",
      unconfirmed: false,
    };
    const next = [...rows, newRow].sort((a,b)=> s(b.datetime).localeCompare(s(a.datetime)));
    setRows(next);
    setPage(1);
    setAddOpen(false);
    try { await autosaveChunk([newRow]); } catch (e) { console.error("수동 추가 저장 실패:", e); }
  };

  /* 화면 */
  return (
    <div className="income-page">
      {/* === 툴바 1 === */}
      <div className="toolbar tight">
        <div className="left">
          {/* 엑셀 업로드 */}
          <button className="btn excel" onClick={onPickFiles} title="엑셀 업로드">
            <span className="ico" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="2.5" fill="#1F6F43"/>
                <path d="M8.5 8.5l2.5 3-2.5 3M12.5 8.5l-2.5 3 2.5 3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="13.5" y="5" width="6" height="14" fill="#2EA06B" />
              </svg>
            </span>
            <span className="btn-label">엑셀 업로드</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            style={{ display: "none" }}
            onChange={(e) => e.target.files && handleFiles([...e.target.files])}
          />

          {/* 수동 추가 */}
          <button className="btn add" onClick={openAdd} title="수동으로 항목 추가">추가</button>

          <button className="btn unconf" onClick={() => setUnconfOpen(true)}>
            <span className="ico" aria-hidden>🔎</span>
            <span className="btn-label">미확인</span>
          </button>

          {/* ✅ 퍼플 토글: 입금만 */}
          <label className="chk purple">
            <input type="checkbox" checked={onlyIncome} onChange={(e) => setOnlyIncome(e.target.checked)} />
            <span className="switch" aria-hidden></span>
            <span className="lbl">입금만</span>
          </label>

          {/* ✅ 퍼플 토글: 수정모드 */}
          <label className="chk purple">
            <input type="checkbox" checked={editMode} onChange={(e) => setEditMode(e.target.checked)} />
            <span className="switch" aria-hidden></span>
            <span className="lbl">수정모드</span>
          </label>
        </div>

        <div className="right">
          <input className="search" placeholder="" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select
            className="page-size"
            value={pageSize}
            onChange={(e) => { const v = Number(e.target.value) || 50; setPageSize(v); setPage(1); }}
          >
            {pageSizeOptions.map((n) => (<option key={n} value={n}>{n}/페이지</option>))}
          </select>
        </div>
      </div>

      {/* === 기간 + 통계 === */}
      <div className="toolbar tight">
        <div className="mid">
          <div className="range-pickers compact">
            <DateTriple y={yFrom} m={mFrom} d={dFrom} onY={(v) => setYFrom(v)} onM={(v) => setMFrom(v)} onD={(v) => setDFrom(v)} />
            <span className="dash">—</span>
            <DateTriple y={yTo} m={mTo} d={dTo} onY={(v) => setYTo(v)} onM={(v) => setMTo(v)} onD={(v) => setDTo(v)} />
          </div>
        </div>

        <div className="right stats-row">
          <div className="stat-card count"><div className="icon">🧾</div><div className="meta"><div className="label">총 건수</div><div className="value">{statCount.toLocaleString()}건</div></div></div>
          <div className="stat-card in"><div className="icon">💵</div><div className="meta"><div className="label">입금합계</div><div className="value">{fmtComma(statInSum)}원</div></div></div>
          <div className="stat-card out"><div className="icon">💸</div><div className="meta"><div className="label">출금합계</div><div className="value">{fmtComma(statOutSum)}원</div></div></div>
          <div className="stat-card warn"><div className="icon">⚠️</div><div className="meta"><div className="label">메모누락</div><div className="value">{statMemoMiss.toLocaleString()}건</div></div></div>
        </div>
      </div>

      {error && <pre className="error tight">{error}</pre>}
      {uploadError && <pre className="error tight">{uploadError}</pre>}

      {/* 테이블 */}
      <div className="table-wrap">
        <table className="dense modern">
          <thead>
            <tr>
              <th onClick={() => clickSort("category")} className="col-type">구분</th>
              <th onClick={() => clickSort("accountNo")} className="col-account">계좌번호</th>
              <th onClick={() => clickSort("date")} className="col-date">거래일</th>
              <th onClick={() => clickSort("time")} className="col-time">시간</th>
              <th onClick={() => clickSort("inAmt")} className="num col-in">입금금액</th>
              <th onClick={() => clickSort("outAmt")} className="num col-out">{onlyIncome ? "" : "출금금액"}</th>
              <th onClick={() => clickSort("record")} className="col-record">거래기록사항</th>
              <th onClick={() => clickSort("memo")} className="col-memo">거래메모</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const cat = s(r.category);
              const autoCat = autoCategoryByAccount(r.accountNo);
              const shownCat = cat || autoCat;
              const displayValue = shownCat || (incomeCategories[0] || "");
              const hasDisplayInList = incomeCategories.includes(displayValue);

              return (
                <tr key={r._id}>
                  <td className="center">
                    {editMode ? (
                      <div className="category-select-wrap">
                        <select
                          className="edit-select type-select pretty-select rich"
                          style={selectStyle(displayValue)}
                          value={displayValue}
                          onChange={(e) => updateRow(r._id, { category: e.target.value })}
                        >
                          {incomeCategories.length === 0 ? (
                            <option value="">불러오는 중…</option>
                          ) : (
                            <>
                              {!hasDisplayInList && displayValue && (
                                <option value={displayValue}>{displayValue}</option>
                              )}
                              {incomeCategories.map((name) => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                    ) : (
                      <span
                        className={`type-badge ${shownCat ? "cat" : toNumber(r.inAmt) > 0 ? "in" : toNumber(r.outAmt) > 0 ? "out" : ""}`}
                        title={shownCat || (toNumber(r.inAmt) > 0 ? "입금" : toNumber(r.outAmt) > 0 ? "출금" : "-")}
                        style={shownCat ? colorVars(shownCat) : undefined}
                      >
                        {shownCat || (toNumber(r.inAmt) > 0 ? "입금" : toNumber(r.outAmt) > 0 ? "출금" : "-")}
                      </span>
                    )}
                  </td>

                  <td className="mono center">{r.accountNo}</td>
                  <td className="mono center">{r.date}</td>
                  <td className="mono center">{r.time}</td>

                  <td className="num strong in">{fmtComma(r.inAmt)}</td>
                  <td className="num out">{fmtComma(r.outAmt)}</td>

                  <td className="clip center">{r.record}</td>

                  <td className="memo-cell">
                    {editMode ? (
                      <div className="memo-wrap">
                        <input
                          ref={(el) => setMemoRef(r._id, el)}
                          className="edit-input memo-input"
                          value={r.memo}
                          onChange={(e) => updateRow(r._id, { memo: e.target.value })}
                          placeholder=""
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNextMemo(r._id, pageRows); } }}
                        />
                        {/* 미확인 토글(기존 그대로) */}
                        <label className="chk mi2">
                          <input
                            type="checkbox"
                            checked={!!r.unconfirmed}
                            onChange={(e) => updateRow(r._id, { unconfirmed: e.target.checked })}
                          />
                          <span className="box" aria-hidden></span>
                          <span className="lbl">미확인</span>
                        </label>
                      </div>
                    ) : (
                      <div className="memo-wrap">
                        <div className="memo-text" title={r.memo || ""}>{r.memo}</div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션(간단 표기) */}
      <div className="pagination">
        <button className="btn" disabled={curPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>◀</button>
        <div className="pageinfo">{curPage} / {pageCount}</div>
        <button className="btn" disabled={curPage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>▶</button>
      </div>

      {/* 중복 안내 */}
      <Modal open={dupOpen} title="중복 항목 안내" onClose={() => setDupOpen(false)}>
        {dupInfo && (
          <>
            <p>업로드 중 <b>{dupInfo.count.toLocaleString()}</b>건의 중복 항목을 발견하여 추가하지 않았습니다.</p>
            {dupInfo.examples?.length > 0 && (
              <ul className="dup-list">{dupInfo.examples.map((t, i) => (<li key={i}>• {t}</li>))}</ul>
            )}
          </>
        )}
      </Modal>

      {/* 미확인 모달 */}
      <Modal
        open={unconfOpen}
        title="미확인 목록"
        mode="confirm"
        cancelText="닫기"
        confirmText="저장"
        onClose={() => setUnconfOpen(false)}
        onConfirm={applyUnconfEdits}
        primaryFirst
        showClose={false}
        variant="large"
      >
        <div className="unconf-top">
          <div className="unconf-summary">
            <div>총 건수: <b>{unconfirmedList.length.toLocaleString()}</b>건</div>
            <div>미확인 금액: <b>{fmtComma(unconfirmedTotalInAmt)}</b>원</div>
          </div>
          <input
            className="search unconf-search"
            placeholder="미확인 내역 검색 (금액/거래기록/메모)"
            value={unconfQuery}
            onChange={(e) => setUnconfQuery(e.target.value)}
          />
        </div>

        <div className="unconf-list">
          <table className="dense mini">
            <colgroup>
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "21%" }} />
              <col style={{ width: "35%" }} />
              <col style={{ width: "2%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>날짜</th><th>시간</th><th>구분</th><th className="num">입금</th><th>거래기록</th><th>메모</th><th>미확인</th>
              </tr>
            </thead>
            <tbody>
              {modalList.length === 0 ? (
                <tr><td colSpan={7} className="center muted">검색 결과가 없습니다.</td></tr>
              ) : (
                modalList.map((r) => {
                  const catDraft = unconfDraft[r._id]?.category ?? r.category ?? "";
                  const autoCat = autoCategoryByAccount(r.accountNo);
                  const displayCat = catDraft || autoCat || (incomeCategories[0] || "");
                  const hasDisplayInList = incomeCategories.includes(displayCat);
                  return (
                    <tr key={`u_${r._id}`}>
                      <td className="center mono">{r.date}</td>
                      <td className="center mono">{r.time}</td>
                      <td className="center">
                        <select
                          className="pretty-select"
                          style={selectStyle(displayCat)}
                          value={displayCat}
                          onChange={(e) => setDraftCategory(r._id, e.target.value)}
                        >
                          {!hasDisplayInList && displayCat && <option value={displayCat}>{displayCat}</option>}
                          {incomeCategories.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="num">{fmtComma(r.inAmt)}</td>
                      <td className="center">{r.record}</td>
                      <td>
                        <input
                          className="edit-input"
                          style={{ width: "100%" }}
                          value={unconfDraft[r._id]?.memo ?? r.memo ?? ""}
                          onChange={(e) => setDraftMemo(r._id, e.target.value)}
                          placeholder=""
                        />
                      </td>
                      <td className="center">
                        <input
                          type="checkbox"
                          checked={!!(unconfDraft[r._id]?.unconfirmed ?? r.unconfirmed)}
                          onChange={(e) => setDraftFlag(r._id, e.target.checked)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* 수동 추가 모달 */}
      <Modal
        open={addOpen}
        title="항목 추가"
        mode="confirm"
        cancelText="닫기"
        confirmText="추가"
        onClose={() => setAddOpen(false)}
        onConfirm={saveAdd}
        primaryFirst
        showClose={false}
      >
        <div className="add-form">
          <div className="add-row">
            <label>거래일</label>
            <input
              type="date"
              className="edit-input"
              value={addForm.date}
              onChange={(e) => changeAdd("date", e.target.value)}
            />
          </div>
          <div className="add-row">
            <label>구분</label>
            <select
              className="pretty-select wide"
              style={selectStyle(addForm.category)}
              value={addForm.category}
              onChange={(e) => changeAdd("category", e.target.value)}
            >
              {incomeCategories.length === 0 ? (
                <option value="">불러오는 중…</option>
              ) : (
                incomeCategories.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))
              )}
            </select>
          </div>
          <div className="add-row">
            <label>입금금액</label>
            <input
              className="edit-input"
              inputMode="numeric"
              placeholder="0"
              value={addForm.inAmt}
              onChange={(e) => changeAdd("inAmt", changeMoney(e.target.value))}
            />
          </div>
          <div className="add-row">
            <label>거래기록사항</label>
            <input
              className="edit-input"
              value={addForm.record}
              onChange={(e) => changeAdd("record", e.target.value)}
            />
          </div>
          <div className="add-row">
            <label>거래메모</label>
            <input
              className="edit-input"
              value={addForm.memo}
              onChange={(e) => changeAdd("memo", e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ===== 내부: DateTriple ===== */
function DateTriple({ y, m, d, onY, onM, onD }) {
  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const arr = [];
    for (let yy = thisYear; yy >= thisYear - 10; yy--) arr.push(yy);
    return arr;
  }, []);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const maxDay = new Date(y, m, 0).getDate();
  return (
    <div className="date-triple">
      <select value={y} onChange={(e) => onY(+e.target.value)}>
        {yearOptions.map((yy) => (<option key={yy} value={yy}>{yy}년</option>))}
      </select>
      <select value={m} onChange={(e) => onM(+e.target.value)}>
        {monthOptions.map((mm) => (<option key={mm} value={mm}>{mm}월</option>))}
      </select>
      <select value={Math.min(d, maxDay)} onChange={(e) => onD(+e.target.value)}>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((dd) => (<option key={dd} value={dd}>{dd}일</option>))}
      </select>
    </div>
  );
}
