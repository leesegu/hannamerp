// ==================================
// 관리비회계 · 수입정리 페이지 (Storage JSON 버전 · 정리본)
// - 월별 JSON: acct_income_json/<YYYY-MM>.json
// - 대용량 엑셀: Storage 업로드 → IMPORT_API 호출 (백엔드가 월 JSON 갱신)
// - 소량 엑셀/수동 추가/인라인 수정: 클라가 해당 월 JSON 읽어와 병합 저장
// - IME(한글) 입력 안정화 + 메모 입력 시 버벅임 개선(메모 드래프트 분리)
// - ✅ 즉시 커밋(메모/카테고리/미확인) + 드래프트 자동정리
// - ✅ 삭제모드(행 선택 후 끌 때 확인→삭제)
// - ✅ 중복 모달에서 체크한 항목만 ‘중복 무시하고 추가’
// - ✅ 업로드 시 category를 실제 저장(구분 비어도 계좌번호 기반 자동설정)
// ==================================
import React, {
  useCallback, useMemo, useRef, useState, useEffect,
} from "react";
import * as XLSX from "xlsx";
import "./IncomeImportPage.css";

import { db } from "../firebase";
import {
  collection, getDocs, onSnapshot, query as fsQuery,
} from "firebase/firestore";
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL, getBytes,
} from "firebase/storage";

/* ===== .env (Functions API) ===== */
const IMPORT_API = process.env.REACT_APP_IMPORT_API || "";

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
const monthKeyOf = (dateStr) => (dateStr ? String(dateStr).slice(0, 7) : "");

// 큰 텍스트 필드 방어(과도한 payload 방지)
const trimField = (v, max = 2000) => s(v).slice(0, max);

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
  [r.date, r.time, toNumber(r.inAmt), s(r.record)].join("|");

/* ★ 계좌번호 기반 자동카테고리 */
function autoCategoryByAccount(accountNoRaw = "") {
  const acct = s(accountNoRaw).replace(/\s|-/g, "");
  if (acct.startsWith("356")) return "무통장입금";
  if (acct.startsWith("352")) return "이사정산";
  return "";
}

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

    if (col.dateTime >= 0) {
      const raw = row[col.dateTime];
      const d = normalizeExcelCellToLocalDate(raw, { truncateTime: false, date1904 });
      if (d) {
        dt = d;
        dateStr = fmtDateLocal(d);
        timeStr = fmtTimeLocal(d);
      }
    }

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

    const baseCategory = s(row[col.category]) || autoCategoryByAccount(meta.accountNo) || "";

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
      record: s(row[col.record]) || "",
      memo: s(row[col.memo]) || "",
      category: baseCategory, // ✅ 실제 category 저장
      _seq: s(row[col.seq]) || "",
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

/* ===== Storage(JSON) 유틸 ===== */
const storage = getStorage();

const MONTH_BASE = "acct_income_json"; // 폴더 루트
const monthPath = (monthKey) => `${MONTH_BASE}/${monthKey}.json`;

// 월 JSON 형태: { meta: {updatedAt: number}, items: { [id]: Row } }
async function readMonthJSON(monthKey) {
  const ref = sRef(storage, monthPath(monthKey));
  try {
    const bytes = await getBytes(ref);
    const text = new TextDecoder().decode(bytes);
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== "object") return { meta: {}, items: {} };
    return { meta: obj.meta || {}, items: obj.items || {} };
  } catch (e) {
    const code = e?.code || "";
    const msg = String(e?.message || "");
    const notFound =
      code === "storage/object-not-found" ||
      msg.includes("object-not-found") ||
      msg.includes("No such object");
    if (notFound) {
      return { meta: {}, items: {} };
    }
    throw e; // 상위 useEffect에서 setError로 노출
  }
}

async function writeMonthJSON(monthKey, dataObj) {
  const ref = sRef(storage, monthPath(monthKey));
  const blob = new Blob([JSON.stringify(dataObj)], { type: "application/json" });
  await uploadBytes(ref, blob, { contentType: "application/json" });
}

/* ===== 월 키 유틸 ===== */
function toMonthKeys(yFrom, mFrom, yTo, mTo) {
  const keys = [];
  const d = new Date(yFrom, mFrom - 1, 1);
  const end = new Date(yTo, mTo - 1, 1);
  while (d <= end) {
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return keys;
}

/* ===== 대용량 판단: 용량(>=1MB) 또는 행수(>=3,000행) ===== */
const SIZE_LARGE_BYTES = 1 * 1024 * 1024; // 1MB
const ROW_LARGE_THRESHOLD = 3000;

async function shouldUseBackend(file) {
  if (!IMPORT_API) return false;
  if (file.size >= SIZE_LARGE_BYTES) return true;
  try {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const ref = ws && ws["!ref"];
    if (!ref) return false;
    const range = XLSX.utils.decode_range(ref);
    const rowCount = (range.e.r - range.s.r + 1) || 0;
    return rowCount >= ROW_LARGE_THRESHOLD;
  } catch {
    return false;
  }
}

/* ===== 메인 ===== */
export default function IncomeImportPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  // ==== 삭제모드 ====
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteSel, setDeleteSel] = useState({}); // { [id]: true }

  const [dupOpen, setDupOpen] = useState(false);
  // ✅ 중복 상세 목록 & 선택
  const [dupList, setDupList] = useState([]); // [{...rowLike}]
  const [dupChecked, setDupChecked] = useState({}); // { [idx]: true }

  const [query, setQuery] = useState("");
  const [onlyIncome, setOnlyIncome] = useState(true);
  const [editMode, setEditMode] = useState(false);

  const pageSizeOptions = [50, 100, 300, 500];
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const [incomeCategories, setIncomeCategories] = useState([]);

  const [unconfOpen, setUnconfOpen] = useState(false);
  const [unconfQuery, setUnconfQuery] = useState("");
  const [unconfDraft, setUnconfDraft] = useState({});

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    date: "",
    category: "",
    inAmt: "",
    record: "",
    memo: "",
  });

  // ===== IME(한글) 입력 안정화 refs =====
  const composingRef = useRef({});      // { [id]: true/false }

  const [uploadError, setUploadError] = useState("");

  // ✅ 메모 입력 버벅임 개선: 입력 중 드래프트 보관용
  const [memoDrafts, setMemoDrafts] = useState({}); // { [id]: string }

  // ===== 월별 캐시 (Storage JSON)
  const monthsRef = useRef({});

  const today = useMemo(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  }, []);
  const [yFrom, setYFrom] = useState(today.y);
  const [mFrom, setMFrom] = useState(today.m);
  const [dFrom, setDFrom] = useState(today.d);
  const [yTo,   setYTo]   = useState(today.y);
  const [mTo,   setMTo]   = useState(today.m);
  const [dTo,   setDTo]   = useState(today.d);

  const clampRange = useCallback((nyF, nmF, ndF, nyT, nmT, ndT) => {
    const start = ymdToDate(nyF, nmF - 1, ndF);
    const end = ymdToDate(nyT, nmT - 1, ndT);
    if (start > end) return [nyF, nmF, ndF, nyF, nmF, ndF];
    return [nyF, nmF, ndF, nyT, nmT, ndT];
  }, []);

  const [sortKey, setSortKey] = useState("datetime");
  const [sortDir, setSortDir] = useState("desc");

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

  const fileInputRef = useRef(null);
  const onPickFiles = useCallback(() => fileInputRef.current?.click(), []);

  /* ===== 수입 대분류 로드(Firestore 그대로 유지) ===== */
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
    const qy = fsQuery(col);

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

  /* ===== 월 범위가 바뀔 때: 해당 월 JSON들을 로드 → rows 구성 ===== */
  const rebuildRowsFromCache = useCallback(() => {
    const list = [];
    const store = monthsRef.current;
    Object.keys(store).forEach((mk) => {
      const items = store[mk]?.items || {};
      Object.values(items).forEach((r) => list.push(r));
    });

    const start = new Date(yFrom, mFrom - 1, dFrom, 0, 0, 0, 0);
    const end = new Date(yTo, mTo - 1, dTo, 23, 59, 59, 999);
    const filtered = list.filter((r) => {
      const d = parseYMDLocal(r.date);
      if (!(d instanceof Date) || isNaN(d)) return false;
      const d0 = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const d1 = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      return !(d < d0 || d > d1);
    });

    filtered.sort((a, b) => s(b.datetime).localeCompare(s(a.datetime)));
    setRows(filtered);
    setPage(1);
  }, [yFrom, mFrom, dFrom, yTo, mTo, dTo]);

  const loadMonthsIfNeeded = useCallback(async (monthKeys) => {
    const store = monthsRef.current;
    for (const mk of monthKeys) {
      if (!store[mk]?.loaded) {
        const data = await readMonthJSON(mk);
        store[mk] = {
          loaded: true,
          meta: data.meta || {},
          items: data.items || {},
          dirty: false,
          timer: null,
        };
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setError("");
        const monthKeys = toMonthKeys(yFrom, mFrom, yTo, mTo);
        await loadMonthsIfNeeded(monthKeys);
        rebuildRowsFromCache();
      } catch (e) {
        console.error(e);
        setError(String(e?.message || e));
      }
    })();
  }, [yFrom, mFrom, dFrom, yTo, mTo, dTo, loadMonthsIfNeeded, rebuildRowsFromCache]);

  /* ===== 월 JSON 저장 디바운서 ===== */
  const scheduleMonthSave = useCallback((monthKey) => {
    const store = monthsRef.current;
    const bucket = store[monthKey];
    if (!bucket) return;
    bucket.dirty = true;
    if (bucket.timer) clearTimeout(bucket.timer);
    bucket.timer = setTimeout(async () => {
      try {
        const payload = {
          meta: { updatedAt: Date.now() },
          items: bucket.items,
        };
        await writeMonthJSON(monthKey, payload);
        bucket.dirty = false;
      } catch (e) {
        console.error(`월 저장 실패(${monthKey}):`, e);
      } finally {
        bucket.timer = null;
      }
    }, 400);
  }, []);

  /* ===== 인라인 수정 → 월 JSON 반영(+디바운스 저장) ===== */
  const saveTimers = useRef({});
  const updateRowLocalAndCache = useCallback((id, patch) => {
    // 1) 화면 즉시 갱신
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch, datetime: (() => {
      const dateStr = s((patch.date ?? r.date) || "");
      const timeStr = s((patch.time ?? r.time) || "00:00:00");
      return dateStr ? `${dateStr} ${timeStr}` : (patch.datetime ?? r.datetime ?? "");
    })() } : r)));

    // 2) 월 JSON 캐시 반영 + 저장 예약
    const store = monthsRef.current;
    const cur = (rows.find((r) => r._id === id)) || {};
    const mk = monthKeyOf(patch.date || cur.date);
    if (!mk) return;

    if (!store[mk]) store[mk] = { loaded: true, meta: {}, items: {}, dirty: false, timer: null };

    const prevObj = store[mk].items[id] || cur;
    const nextObj = { ...prevObj, ...patch };

    if (nextObj.record != null) nextObj.record = trimField(nextObj.record);
    if (nextObj.memo != null)   nextObj.memo   = trimField(nextObj.memo);

    const dateStr = s(nextObj.date || "");
    const timeStr = s(nextObj.time || "00:00:00");
    nextObj.datetime = dateStr ? `${dateStr} ${timeStr}` : nextObj.datetime || "";

    store[mk].items[id] = nextObj;
    scheduleMonthSave(mk);
  }, [rows, scheduleMonthSave]);

  const scheduleSave = useCallback((id, patch) => {
    const key = String(id);
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => {
      updateRowLocalAndCache(key, patch);
      delete saveTimers.current[key];
    }, 350);
  }, [updateRowLocalAndCache]);

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
    scheduleSave(id, patch);
  };

  // ✅ 메모 드래프트 커밋 함수 (즉시 커밋)
  const commitMemo = useCallback((id, value) => {
    const current = (rows.find(r => r._id === id)?.memo) ?? "";
    if (s(value) === s(current)) {
      setMemoDrafts(prev => {
        const { [id]: _omit, ...rest } = prev;
        return rest;
      });
      return;
    }
    updateRowLocalAndCache(id, { memo: value });
    setMemoDrafts(prev => {
      const { [id]: _omit, ...rest } = prev;
      return rest;
    });
  }, [rows, updateRowLocalAndCache]);

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

  // ✅ rows 갱신 시, 동일 값이 된 드래프트 자동 정리
  useEffect(() => {
    setMemoDrafts((prev) => {
      if (!prev || Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        const r = rows.find((x) => x._id === id);
        if (r && s(prev[id]) === s(r.memo ?? "")) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

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
    setRows((prev) =>
      prev.map((r) => {
        const d = unconfDraft[r._id];
        return d
          ? { ...r, memo: d.memo, unconfirmed: !!d.unconfirmed, category: d.category ?? r.category }
          : r;
      })
    );
    setUnconfOpen(false);

    const store = monthsRef.current;
    for (const [id, d] of Object.entries(unconfDraft)) {
      const cur =
        rows.find((x) => x._id === id) ||
        Object.values(store).flatMap((b) => Object.values(b.items || {})).find((x) => x._id === id);
      if (!cur) continue;
      const mk = monthKeyOf(cur.date);
      if (!mk) continue;
      if (!store[mk]) store[mk] = { loaded: true, meta: {}, items: {}, dirty: false, timer: null };
      const next = {
        ...(store[mk].items[id] || cur),
        memo: s(d.memo),
        unconfirmed: !!d.unconfirmed,
        category: s(d.category || ""),
      };
      store[mk].items[id] = next;
      scheduleMonthSave(mk);
    }
  };

  /* ===== 통계용 범위 리스트 ===== */
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

  const statCount = rangeList.length;
  const statInSum = useMemo(() => rangeList.reduce((sum, r) => sum + toNumber(r.inAmt), 0), [rangeList]);
  const statOutSum = useMemo(() => rangeList.reduce((sum, r) => sum + toNumber(r.outAmt), 0), [rangeList]);
  const statMemoMiss = useMemo(
    () => rangeList.filter((r) => toNumber(r.inAmt) > 0 && !r.unconfirmed && s(r.memo) === "").length,
    [rangeList]
  );

  /* ===== 검색/정렬/페이지 (최종 블록) ===== */
  const filteredView = useMemo(() => {
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

  const sortedView = useMemo(() => {
    const list = [...filteredView];
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (sortKey === "inAmt" || sortKey === "outAmt") {
        return (toNumber(av) - toNumber(bv)) * (sortDir === "asc" ? 1 : -1);
      }
      return s(av).localeCompare(s(bv)) * (sortDir === "asc" ? 1 : -1);
    });
    return list;
  }, [filteredView, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedView.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const startIdx = (curPage - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const pageRows = sortedView.slice(startIdx, endIdx);

  /* ===== 파일 업로드 (대용량 위임 + 소량 로컬 파싱→월 JSON 저장) ===== */
  const handleFiles = useCallback(
    async (files) => {
      setError("");
      setUploadError("");

      const onlyOne = files && files.length === 1;
      const first = onlyOne ? files[0] : null;

      if (onlyOne && first && (await shouldUseBackend(first))) {
        try {
          const safeName = first.name.replace(/[^\w.\-]/g, "_");
          const path = `imports/${Date.now()}_${safeName}`;
          const r = sRef(storage, path);
          await uploadBytes(r, first, {
            contentType:
              first.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          const downloadUrl = await getDownloadURL(r);

          const resp = await fetch(IMPORT_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ downloadUrl, recentMonths: 12 }),
          });
          const js = await resp.json();
          if (!resp.ok || !js.ok) throw new Error(js.error || "Import failed");

          alert(`대량 업로드 완료: 총 ${js.total}건 (핫:${js.hotSaved}, 콜드:${js.coldSaved})`);

          try {
            const now = new Date();
            const yToNow = now.getFullYear(), mToNow = now.getMonth() + 1;
            const yFromGuess = yToNow - 1;
            const mFromGuess = mToNow;
            const keys = toMonthKeys(yFromGuess, mFromGuess, yToNow, mToNow);
            keys.forEach((k) => { if (monthsRef.current[k]) monthsRef.current[k].loaded = false; });
            await loadMonthsIfNeeded(keys);
            rebuildRowsFromCache();
          } catch (e) {
            console.warn("대량 업로드 후 월 로드 갱신 실패(무시 가능):", e);
          }
          return;
        } catch (e) {
          console.error(e);
          setUploadError(String(e?.message || e));
          alert("대량 업로드 중 오류가 발생했습니다.");
          return;
        }
      }

      const merged = [];           // 즉시 추가(중복 아님)
      const dupCandidates = [];    // 중복 목록(모달에서 선택 후 추가)
      const existedKeys = new Set(rows.map((r) => makeDupKey(r)));

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
            const withMonth = { ...r, monthKey: monthKeyOf(r.date) };
            if (existedKeys.has(key)) {
              dupCandidates.push(withMonth);
            } else {
              existedKeys.add(key);
              merged.push(withMonth);
            }
          }
        } catch (e) {
          console.error(e);
          setUploadError((prev) => prev + `\n[${file.name}] ${e.message || String(e)}`);
        }
      }

      // ✅ 먼저 중복 아님(merged)은 바로 저장
      try {
        const byMonth = merged.reduce((acc, r) => {
          const mk = r.monthKey || monthKeyOf(r.date);
          if (!mk) return acc;
          (acc[mk] ||= []).push(r);
          return acc;
        }, {});
        const monthKeys = Object.keys(byMonth);
        await loadMonthsIfNeeded(monthKeys);
        const store = monthsRef.current;
        for (const mk of monthKeys) {
          const bucket = store[mk] || { loaded: true, meta: {}, items: {}, dirty: false, timer: null };
          store[mk] = bucket;
          for (const r of byMonth[mk]) {
            const id = `r_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
            const next = {
              _id: id,
              date: s(r.date),
              time: s(r.time || "00:00:00"),
              datetime: s(r.datetime || `${s(r.date)} ${s(r.time || "00:00:00")}`),
              accountNo: s(r.accountNo),
              holder: s(r.holder),
              category: s(r.category || autoCategoryByAccount(r.accountNo) || ""), // ✅ 실제 저장
              inAmt: toNumber(r.inAmt),
              outAmt: toNumber(r.outAmt),
              balance: toNumber(r.balance),
              record: trimField(r.record),
              memo: trimField(r.memo),
              _seq: s(r._seq || ""),
              type: r.type || (toNumber(r.inAmt) > 0 ? "입금" : toNumber(r.outAmt) > 0 ? "출금" : ""),
              unconfirmed: !!r.unconfirmed,
              monthKey: s(r.monthKey || mk),
            };
            bucket.items[id] = next;
          }
          scheduleMonthSave(mk);
        }
      } catch (e) {
        console.error("소량 업로드 병합/저장 실패:", e);
        setUploadError((prev) => prev + `\n저장 실패: ${e?.message || e}`);
      }

      // ✅ 화면 갱신
      try {
        const now = new Date();
        const yToNow = now.getFullYear(), mToNow = now.getMonth() + 1;
        const keys = toMonthKeys(yToNow - 1, mToNow, yToNow, mToNow);
        await loadMonthsIfNeeded(keys);
        rebuildRowsFromCache();
      } catch(e) {
        console.warn("업로드 후 갱신 실패(무시 가능):", e);
      }

      // ✅ 중복 목록 모달로 띄우기(체크된 것만 ‘중복 무시하고 추가’)
      if (dupCandidates.length > 0) {
        const defaultChecked = {};
        dupCandidates.forEach((_, idx) => { defaultChecked[idx] = true; });
        setDupList(dupCandidates);
        setDupChecked(defaultChecked);
        setDupOpen(true);
      } else {
        setDupList([]);
        setDupChecked({});
        setDupOpen(false);
      }
    },
    [rows, loadMonthsIfNeeded, rebuildRowsFromCache, scheduleMonthSave]
  );

  /* ===== 수동 추가 ===== */
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
    const id = `${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
    const newRow = {
      _id: id,
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
      monthKey: monthKeyOf(date),
    };

    const next = [...rows, newRow].sort((a,b)=> s(b.datetime).localeCompare(s(a.datetime)));
    setRows(next);
    setPage(1);
    setAddOpen(false);

    try {
      const mk = newRow.monthKey;
      await loadMonthsIfNeeded([mk]);
      const store = monthsRef.current;
      if (!store[mk]) store[mk] = { loaded: true, meta: {}, items: {}, dirty: false, timer: null };
      store[mk].items[id] = newRow;
      scheduleMonthSave(mk);
    } catch (e) {
      console.error("수동 추가 저장 실패:", e);
    }
  };

  /* ===== 삭제모드 토글 & 삭제 반영 (비밀번호 확인 추가) ===== */
  const toggleDeleteMode = async () => {
    if (!deleteMode) {
      // 켜기 전 비밀번호 확인
      const pw = window.prompt("삭제 비밀번호를 입력하세요.");
      if (pw !== "20453948") {
        alert("비밀번호가 올바르지 않습니다.");
        return;
      }
      setDeleteSel({});
      setDeleteMode(true);
      return;
    }
    // 끄기 → 선택건수 확인 후 삭제 여부 묻기
    const ids = Object.keys(deleteSel).filter((k) => deleteSel[k]);
    if (ids.length === 0) {
      setDeleteMode(false);
      return;
    }
    const ok = window.confirm(`선택한 ${ids.length.toLocaleString()}건을 삭제하시겠습니까?`);
    if (!ok) {
      // 취소 → 삭제모드 유지
      return;
    }
    // 실제 삭제
    const store = monthsRef.current;
    const affectedMonths = new Set();
    setRows((prev) => prev.filter((r) => !deleteSel[r._id]));
    for (const mk of Object.keys(store)) {
      const items = store[mk]?.items || {};
      let touched = false;
      for (const id of ids) {
        if (items[id]) {
          delete items[id];
          touched = true;
        }
      }
      if (touched) affectedMonths.add(mk);
    }
    affectedMonths.forEach((mk) => scheduleMonthSave(mk));
    setDeleteSel({});
    setDeleteMode(false);
  };

  const setDeleteChecked = (id, checked) => {
    setDeleteSel((p) => ({ ...p, [id]: !!checked }));
  };

  // 헤더(구분) 옆 전체선택 체크박스 핸들러 (현재 페이지 대상)
  const headerToggleSelectAll = (checked) => {
    setDeleteSel((prev) => {
      const next = { ...prev };
      pageRows.forEach((r) => { next[r._id] = checked; });
      return next;
    });
  };

  /* ===== 중복 모달: 체크된 항목만 ‘중복 무시하고 추가’ ===== */
  const confirmDupAdd = async () => {
    const selected = dupList.filter((_, idx) => dupChecked[idx]);
    if (selected.length === 0) {
      setDupOpen(false);
      setDupList([]);
      setDupChecked({});
      return;
    }
    try {
      const byMonth = selected.reduce((acc, r) => {
        const mk = r.monthKey || monthKeyOf(r.date);
        if (!mk) return acc;
        (acc[mk] ||= []).push(r);
        return acc;
      }, {});
      const monthKeys = Object.keys(byMonth);
      await loadMonthsIfNeeded(monthKeys);
      const store = monthsRef.current;
      for (const mk of monthKeys) {
        const bucket = store[mk] || { loaded: true, meta: {}, items: {}, dirty: false, timer: null };
        store[mk] = bucket;
        for (const r of byMonth[mk]) {
          const id = `r_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
          const next = {
            _id: id,
            date: s(r.date),
            time: s(r.time || "00:00:00"),
            datetime: s(r.datetime || `${s(r.date)} ${s(r.time || "00:00:00")}`),
            accountNo: s(r.accountNo),
            holder: s(r.holder),
            category: s(r.category || autoCategoryByAccount(r.accountNo) || ""), // ✅ 실제 저장
            inAmt: toNumber(r.inAmt),
            outAmt: toNumber(r.outAmt),
            balance: toNumber(r.balance),
            record: trimField(r.record),
            memo: trimField(r.memo),
            _seq: s(r._seq || ""),
            type: r.type || (toNumber(r.inAmt) > 0 ? "입금" : toNumber(r.outAmt) > 0 ? "출금" : ""),
            unconfirmed: !!r.unconfirmed,
            monthKey: s(r.monthKey || mk),
          };
          bucket.items[id] = next;
        }
        scheduleMonthSave(mk);
      }
      const now = new Date();
      const keys = toMonthKeys(now.getFullYear() - 1, now.getMonth() + 1, now.getFullYear(), now.getMonth() + 1);
      await loadMonthsIfNeeded(keys);
      rebuildRowsFromCache();
    } catch (e) {
      console.error("중복 무시 추가 실패:", e);
      alert("중복 무시 추가 중 오류가 발생했습니다.");
    } finally {
      setDupOpen(false);
      setDupList([]);
      setDupChecked({});
    }
  };

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
            accept=".xlsx"
            multiple
            style={{ display: "none" }}
            onChange={(e) => e.target.files && handleFiles([...e.target.files])}
          />

          {/* 수동 추가 */}
          <button className="btn add" onClick={openAdd} title="수동으로 항목 추가">추가</button>

          {/* 미확인 */}
          <button className="btn unconf" onClick={() => setUnconfOpen(true)}>
            <span className="ico" aria-hidden>🔎</span>
            <span className="btn-label">미확인</span>
          </button>

          {/* ✅ 삭제모드 (비밀번호 확인) */}
          <button
            className={`btn ${deleteMode ? "danger" : ""}`}
            onClick={toggleDeleteMode}
            title="삭제모드: 켜면 구분 칸에 체크박스 표시"
          >
            {deleteMode ? "삭제모드 끄기" : "삭제모드"}
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
              <th onClick={() => clickSort("category")} className="col-type">
                구분
                {/* 삭제모드일 때 전체 선택 체크박스 (현재 페이지 기준) */}
                {deleteMode && (
                  <label className="del-all">
                    <input
                      type="checkbox"
                      checked={pageRows.length > 0 && pageRows.every((r) => !!deleteSel[r._id])}
                      onChange={(e) => headerToggleSelectAll(e.target.checked)}
                    />
                    <span className="del-all-lbl">전체</span>
                  </label>
                )}
              </th>
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
              const draftValue = memoDrafts[r._id];
              const memoValue = draftValue !== undefined ? draftValue : (r.memo ?? "");

              return (
                <tr key={r._id}>
                  <td className="center">
                    <div className="cell-flex">
                      {/* ✅ 삭제모드 체크박스 (구분 칸 왼쪽) */}
                      {deleteMode && (
                        <input
                          type="checkbox"
                          className="del-chk"
                          checked={!!deleteSel[r._id]}
                          onChange={(e) => setDeleteChecked(r._id, e.target.checked)}
                        />
                      )}

                      {/* 구분 표시/수정 */}
                      {editMode ? (
                        <div className="category-select-wrap">
                          <select
                            className="edit-select type-select pretty-select rich"
                            style={selectStyle(displayValue)}
                            value={displayValue}
                            onChange={(e) => updateRowLocalAndCache(r._id, { category: e.target.value })}
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
                    </div>
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
                          value={memoValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMemoDrafts((p) => ({ ...p, [r._id]: val }));
                          }}
                          onCompositionStart={() => { composingRef.current[r._id] = true; }}
                          onCompositionEnd={(e) => {
                            composingRef.current[r._id] = false;
                            const latest = e.currentTarget.value;
                            updateRowLocalAndCache(r._id, { memo: latest });
                            setMemoDrafts((p) => {
                              const { [r._id]: _omit, ...rest } = p;
                              return rest;
                            });
                          }}
                          onBlur={(e) => {
                            if (composingRef.current[r._id]) return;
                            commitMemo(r._id, e.currentTarget.value);
                          }}
                          placeholder=""
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitMemo(r._id, e.currentTarget.value);
                              focusNextMemo(r._id, pageRows);
                            }
                          }}
                        />
                        {/* 미확인 토글 - ✅ 즉시 커밋 */}
                        <label className="chk mi2">
                          <input
                            type="checkbox"
                            checked={!!r.unconfirmed}
                            onChange={(e) => updateRowLocalAndCache(r._id, { unconfirmed: e.target.checked })}
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

      {/* 페이지네이션 */}
      <div className="pagination">
        <button className="btn" disabled={curPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>◀</button>
        <div className="pageinfo">{curPage} / {pageCount}</div>
        <button className="btn" disabled={curPage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>▶</button>
      </div>

      {/* 중복 안내 (체크형) */}
      <Modal
        open={dupOpen}
        title="중복 항목 안내"
        mode="confirm"
        cancelText="닫기"
        confirmText="체크된 항목만 추가"
        onClose={() => { setDupOpen(false); }}
        onConfirm={confirmDupAdd}
        primaryFirst
        showClose={false}
        variant="large"
      >
        {dupList.length > 0 ? (
          <>
            <p>중복으로 판정된 항목이 <b>{dupList.length.toLocaleString()}</b>건 있습니다. 기본으로 체크되어 있으며, <b>체크된 항목만 ‘중복 무시’하고 추가</b>됩니다.</p>
            <div className="unconf-list">
              <table className="dense mini">
                <colgroup>
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "34%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>추가</th>
                    <th>날짜</th>
                    <th>시간</th>
                    <th>구분</th>
                    <th className="num">입금</th>
                    <th>거래기록</th>
                    <th>계좌</th>
                  </tr>
                </thead>
                <tbody>
                  {dupList.map((r, idx) => (
                    <tr key={`dup_${idx}`}>
                      <td className="center">
                        <input
                          type="checkbox"
                          checked={!!dupChecked[idx]}
                          onChange={(e) => setDupChecked((p) => ({ ...p, [idx]: e.target.checked }))}
                        />
                      </td>
                      <td className="mono center">{r.date}</td>
                      <td className="mono center">{r.time}</td>
                      <td className="center">
                        <span
                          className={`type-badge ${s(r.category) ? "cat" : ""}`}
                          style={s(r.category) ? colorVars(r.category) : undefined}
                        >
                          {r.category || autoCategoryByAccount(r.accountNo) || "-"}
                        </span>
                      </td>
                      <td className="num">{fmtComma(r.inAmt)}</td>
                      <td className="center">{r.record}</td>
                      <td className="mono center">{r.accountNo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p>중복 항목이 없습니다.</p>
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
              <col style={{ width: "16%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "32%" }} />
              <col style={{ width: "6%" }} />
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
