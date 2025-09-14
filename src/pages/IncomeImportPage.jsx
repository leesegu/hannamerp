// ==================================
// 관리비회계 · 수입정리 페이지
// - 삭제 기능 제거
// - 통계 카드/배치
// - '구분' 드롭다운 = 관리비회계설정의 "수입대분류" 이름 목록 사용
// ==================================
import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import * as XLSX from "xlsx";
import "./IncomeImportPage.css";

/* Firebase: 수입대분류 로드 */
import { db } from "../firebase";
import { collection, getDocs, getDoc, doc } from "firebase/firestore";

/* ===== 유틸 ===== */
const s = (v) => String(v ?? "").trim();
const toNumber = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const num = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
};

/** 안전한 날짜/시간 파서 */
const parseKoreanDateTime = (v) => {
  if (v instanceof Date && !isNaN(v)) return v;
  const raw = s(v);
  if (!raw) return null;
  const norm = raw.replace(/[.\-]/g, "/").replace(/\s+/g, " ").trim();
  const m = norm.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, Y, M, D, hh = "0", mm = "0", ss = "0"] = m;
  const dt = new Date(+Y, +M - 1, +D, +hh, +mm, +ss);
  return isNaN(dt) ? null : dt;
};

const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (d) =>
  d instanceof Date && !isNaN(d)
    ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    : "";
const fmtTime = (d) =>
  d instanceof Date && !isNaN(d)
    ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
    : "";
const fmtComma = (n) => (toNumber(n) ? toNumber(n).toLocaleString() : "");
const ymdToDate = (y, m, d) => new Date(y, m - 1, d);

/** 'YYYY-MM-DD' 로컬 파싱 */
const parseYMDLocal = (ymd) => {
  if (!ymd) return null;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m.map((t) => +t);
  return new Date(y, mo - 1, d);
};

/* ===== 엑셀 파싱 보조 ===== */
function findHeaderRow(rows) {
  const maxScan = Math.min(rows.length, 50);
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] || [];
    const hasDate = row.some((c) => s(c).includes("거래일시"));
    const hasInAmt = row.some((c) => s(c).includes("입금금액"));
    if (hasDate && hasInAmt) return i;
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
      if (cell.includes("조회시작일")) {
        const val = s(r[j + 1]) || findFollowingValue(rows, i, j);
        meta.dateFrom = val || meta.dateFrom;
      }
      if (cell.includes("조회종료일")) {
        const val = s(r[j + 1]) || findFollowingValue(rows, i, j);
        meta.dateTo = val || meta.dateTo;
      }
    }
  }
  meta.balance = toNumber(meta.balanceText);
  return meta;
}
const makeDupKey = (r) =>
  [r.date, r.time, toNumber(r.inAmt), s(r.record), toNumber(r.balance)].join("|");

function rowsToRecords(rows, headerRowIdx, meta) {
  const header = (rows[headerRowIdx] || []).map((h) => s(h));
  const idx = (key) => header.findIndex((h) => h.includes(key));

  const col = {
    seq: idx("순번"),
    dateTime: idx("거래일시"),
    inAmt: idx("입금금액"),
    outAmt: idx("출금금액"),
    balance: idx("거래후잔액"),
    record: idx("거래기록사항"),
    memo: idx("거래메모"),
  };

  const out = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rawDate = row[col.dateTime];
    const dt = parseKoreanDateTime(rawDate);
    const hasAny = row.some((c) => s(c) !== "");
    if (!hasAny) continue;

    const inAmt = toNumber(row[col.inAmt]);
    const outAmt = toNumber(row[col.outAmt]);

    out.push({
      _id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      accountNo: s(meta.accountNo),
      holder: s(meta.holder),
      date: fmtDate(dt),
      time: fmtTime(dt),
      datetime: dt instanceof Date && !isNaN(dt) ? dt.toISOString() : "",
      inAmt,
      outAmt,
      balance: toNumber(row[col.balance]),
      record: s(row[col.record]),
      memo: s(row[col.memo]),
      _seq: s(row[col.seq]),
      // 기본 타입 유지(입금/출금), 화면 표시/검색은 category 우선
      type: inAmt > 0 ? "입금" : outAmt > 0 ? "출금" : "",
      category: "",             // ★ 설정에서 로드되는 수입대분류 이름
      unconfirmed: false,
    });
  }
  return out;
}

/* ===== 공용 모달 ===== */
function Modal({
  open,
  title,
  children,
  onClose,
  onConfirm,
  confirmText = "확인",
  cancelText = "닫기",
  mode = "confirm",
  primaryFirst = false,
  showClose = true,
  variant = "default", // "default" | "large"
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal-card ${variant === "large" ? "lg" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-title nowrap">{title}</div>
          {showClose ? <button className="modal-x" onClick={onClose}>×</button> : null}
        </div>

        <div className="modal-body scrollable">
          {children}
        </div>

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

/* ===== 메인 ===== */
export default function IncomeImportPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const [dupInfo, setDupInfo] = useState(null);
  const [dupOpen, setDupOpen] = useState(false);

  // 검색/필터/모드
  const [query, setQuery] = useState("");
  const [onlyIncome, setOnlyIncome] = useState(true);
  const [editMode, setEditMode] = useState(false);

  // ★ 수입대분류 목록 (관리비회계설정 → 수입 항목 → 수입대분류)
  const [incomeCategories, setIncomeCategories] = useState([]); // [{id, name}...]

  // 미확인 모달/상태
  const [unconfOpen, setUnconfOpen] = useState(false);
  const [unconfQuery, setUnconfQuery] = useState("");
  const [unconfDraft, setUnconfDraft] = useState({});

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
    const start = ymdToDate(nyF, nmF, ndF);
    const end = ymdToDate(nyT, nmT, ndT);
    if (start > end) return [nyF, nmF, ndF, nyF, nmF, ndF];
    return [nyF, nmF, ndF, nyT, nmT, ndT];
  }, []);

  /* 페이지네이션 */
  const pageSizeOptions = [20, 50, 100, 300, 500];
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  /* 파일 업로드 */
  const fileInputRef = useRef(null);
  const onPickFiles = useCallback(() => fileInputRef.current?.click(), []);
  const handleFiles = useCallback(
    async (files) => {
      setError("");
      const merged = [];

      const abKeys = new Set(rows.map((r) => makeDupKey(r)));
      const dupExamples = new Set();
      let dupCount = 0;

      for (const file of files) {
        try {
          const ab = await file.arrayBuffer();
          const wb = XLSX.read(ab, { type: "array", cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const aoo = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });

          const meta = parseMeta(aoo);
          const headerRowIdx = findHeaderRow(aoo);
          if (headerRowIdx === -1) throw new Error("헤더(거래일시/입금금액)를 찾지 못했습니다.");

          const recs = rowsToRecords(aoo, headerRowIdx, meta);
          for (const r of recs) {
            const key = makeDupKey(r);
            if (abKeys.has(key)) {
              dupCount++;
              if (dupExamples.size < 5)
                dupExamples.add(`${r.date} ${r.time} | ${r.type} ${fmtComma(r.inAmt || r.outAmt)} | ${r.record}`);
              continue;
            }
            abKeys.add(key);
            merged.push(r);
          }
        } catch (e) {
          console.error(e);
          setError((prev) => prev + `\n[${file.name}] ${e.message || String(e)}`);
        }
      }

      if (dupCount > 0) {
        setDupInfo({ count: dupCount, examples: Array.from(dupExamples) });
        setDupOpen(true);
      } else {
        setDupInfo(null);
        setDupOpen(false);
      }

      merged.sort((a, b) => s(b.datetime).localeCompare(s(a.datetime)));
      const nextRows = [...rows, ...merged].sort((a, b) => s(b.datetime).localeCompare(s(a.datetime)));
      setRows(nextRows);
      setPage(1);

      const last = nextRows.find((r) => r.date);
      if (last?.date) {
        const [yy, mm, dd] = last.date.split("-").map((t) => +t);
        const [nyF, nmF, ndF, nyT, nmT, ndT] = clampRange(yy, mm, dd, yy, mm, dd);
        setYFrom(nyF); setMFrom(nmF); setDFrom(ndF);
        setYTo(nyT);   setMTo(nmT);   setDTo(ndT);
      }
    },
    [rows, clampRange]
  );

  /* ===== 수입대분류 로드 =====
     관리비회계설정(수입)에서 다음 순서로 탐색:
     1) accountingSettings/income/categories (subcollection, docs: {name})
     2) accountingSettings/income/수입대분류 (doc: {items: [...]})
     3) incomeCategories (root collection, docs: {name})
  */
  const loadIncomeCategories = useCallback(async () => {
    try {
      let items = [];

      // 1) subcollection
      try {
        const sub = collection(db, "accountingSettings", "income", "categories");
        const snap = await getDocs(sub);
        const arr = snap.docs.map(d => s(d.data()?.name ?? d.data()?.label ?? d.id)).filter(Boolean);
        items.push(...arr);
      } catch (_) {}

      // 2) single doc with items
      if (items.length === 0) {
        try {
          const docRef = doc(db, "accountingSettings", "income", "수입대분류");
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const arr = Array.isArray(snap.data()?.items) ? snap.data().items.map(s).filter(Boolean) : [];
            items.push(...arr);
          }
        } catch (_) {}
      }

      // 3) root collection fallback
      if (items.length === 0) {
        try {
          const root = collection(db, "incomeCategories");
          const snap = await getDocs(root);
          const arr = snap.docs.map(d => s(d.data()?.name ?? d.data()?.label ?? d.id)).filter(Boolean);
          items.push(...arr);
        } catch (_) {}
      }

      // 정리(중복 제거 + 정렬)
      const uniq = Array.from(new Set(items)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ko"));
      setIncomeCategories(uniq.map((name, i) => ({ id: `cat_${i}`, name })));
    } catch (e) {
      console.error("loadIncomeCategories error:", e);
      setIncomeCategories([]);
    }
  }, []);

  useEffect(() => {
    loadIncomeCategories();
  }, [loadIncomeCategories]);

  /* 기간 필터만 반영한 목록 → 통계 계산용 */
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

  /* 통계 계산 */
  const statCount = rangeList.length;
  const statInSum = useMemo(
    () => rangeList.reduce((sum, r) => sum + toNumber(r.inAmt), 0),
    [rangeList]
  );
  const statOutSum = useMemo(
    () => rangeList.reduce((sum, r) => sum + toNumber(r.outAmt), 0),
    [rangeList]
  );
  const statMemoMiss = useMemo(
    () =>
      rangeList.filter(
        (r) =>
          toNumber(r.inAmt) > 0 &&
          !r.unconfirmed &&
          s(r.memo) === ""
      ).length,
    [rangeList]
  );

  /* 검색/입금만까지 반영한 화면 표시용 목록 */
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

      const bag = [(r.category || r.type), r.accountNo, r.holder, r.record, r.memo]
        .join("\n")
        .toLowerCase();
      return bag.includes(qLower);
    });
  }, [rangeList, query, onlyIncome]);

  /* 정렬 */
  const [sortKey, setSortKey] = useState("datetime");
  const [sortDir, setSortDir] = useState("desc");
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

  const clickSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  /* 페이지 */
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const startIdx = (curPage - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const pageRows = sorted.slice(startIdx, endIdx);

  /* 인라인 수정 */
  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  };

  // 엔터로 다음 메모로 (현재 페이지 내 이동)
  const memoRefs = useRef({});
  const setMemoRef = (id, el) => { memoRefs.current[id] = el; };
  const focusNextMemo = (currentId) => {
    const idsInPageOrder = pageRows.map((r) => r._id);
    const idx = idsInPageOrder.indexOf(currentId);
    if (idx >= 0 && idx < idsInPageOrder.length - 1) {
      const nextId = idsInPageOrder[idx + 1];
      const el = memoRefs.current[nextId];
      if (el) el.focus();
    }
  };

  // 미확인 목록/합계/검색
  const unconfirmedList = useMemo(() => sorted.filter((r) => r.unconfirmed), [sorted]);
  const unconfirmedTotalInAmt = useMemo(
    () => unconfirmedList.reduce((sum, r) => sum + toNumber(r.inAmt), 0),
    [unconfirmedList]
  );

  useEffect(() => {
    if (unconfOpen) {
      const initial = {};
      unconfirmedList.forEach((r) => {
        initial[r._id] = { memo: r.memo, unconfirmed: !!r.unconfirmed };
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
    setUnconfDraft((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), memo } }));
  const setDraftFlag = (id, flag) =>
    setUnconfDraft((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), unconfirmed: !!flag } }));

  const applyUnconfEdits = () => {
    setRows((prev) =>
      prev.map((r) => {
        const d = unconfDraft[r._id];
        return d ? { ...r, memo: d.memo, unconfirmed: !!d.unconfirmed } : r;
      })
    );
    setUnconfOpen(false);
  };

  /* 화면 */
  return (
    <div className="income-page">
      {/* === 툴바 #1: 왼쪽 버튼들 / 오른쪽 검색+페이지 === */}
      <div className="toolbar tight">
        <div className="left">
          {/* 엑셀업로드 */}
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

          <button className="btn unconf" onClick={() => setUnconfOpen(true)}>
            <span className="ico" aria-hidden>🔎</span>
            <span className="btn-label">미확인</span>
          </button>

          <label className="chk fancy">
            <input
              type="checkbox"
              checked={onlyIncome}
              onChange={(e) => setOnlyIncome(e.target.checked)}
            />
            <span className="toggle" aria-hidden></span>
            <span className="lbl">입금만</span>
          </label>

          <label className="chk fancy">
            <input
              type="checkbox"
              checked={editMode}
              onChange={(e) => setEditMode(e.target.checked)}
            />
            <span className="toggle" aria-hidden></span>
            <span className="lbl">수정모드</span>
          </label>
        </div>

        {/* 오른쪽: 검색 + 페이지 사이즈 */}
        <div className="right">
          <input
            className="search"
            placeholder=""
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="page-size"
            value={pageSize}
            onChange={(e) => {
              const v = Number(e.target.value) || 20;
              setPageSize(v);
              setPage(1);
            }}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}/페이지
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* === 툴바 #2: 날짜범위 / 오른쪽 통계카드 === */}
      <div className="toolbar tight">
        <div className="mid">
          <div className="range-pickers compact">
            <DateTriple
              y={yFrom}
              m={mFrom}
              d={dFrom}
              onY={(v) => setYFrom(v)}
              onM={(v) => setMFrom(v)}
              onD={(v) => setDFrom(v)}
            />
            <span className="dash">—</span>
            <DateTriple
              y={yTo}
              m={mTo}
              d={dTo}
              onY={(v) => setYTo(v)}
              onM={(v) => setMTo(v)}
              onD={(v) => setDTo(v)}
            />
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="right stats-row">
          <div className="stat-card count">
            <div className="icon" aria-hidden>🧾</div>
            <div className="meta">
              <div className="label">총 건수</div>
              <div className="value">{statCount.toLocaleString()}건</div>
            </div>
          </div>
          <div className="stat-card in">
            <div className="icon" aria-hidden>💵</div>
            <div className="meta">
              <div className="label">입금합계</div>
              <div className="value">{fmtComma(statInSum)}원</div>
            </div>
          </div>
          <div className="stat-card out">
            <div className="icon" aria-hidden>💸</div>
            <div className="meta">
              <div className="label">출금합계</div>
              <div className="value">{fmtComma(statOutSum)}원</div>
            </div>
          </div>
          <div className="stat-card warn">
            <div className="icon" aria-hidden>⚠️</div>
            <div className="meta">
              <div className="label">메모누락</div>
              <div className="value">{statMemoMiss.toLocaleString()}건</div>
            </div>
          </div>
        </div>
      </div>

      {error && <pre className="error tight">{error}</pre>}

      {/* 테이블 */}
      <div className="table-wrap">
        <table className="dense modern">
          <thead>
            <tr>
              {/* 삭제/체크 컬럼 없음 */}
              <th onClick={() => clickSort("category")} className="col-type">구분</th>
              <th onClick={() => clickSort("accountNo")} className="col-account">계좌번호</th>
              <th onClick={() => clickSort("date")} className="col-date">거래일</th>
              <th onClick={() => clickSort("time")} className="col-time">시간</th>
              <th onClick={() => clickSort("inAmt")} className="num col-in">입금금액</th>
              <th onClick={() => clickSort("outAmt")} className="num col-out">출금금액</th>
              <th onClick={() => clickSort("record")} className="col-record">거래기록사항</th>
              <th onClick={() => clickSort("memo")} className="col-memo">거래메모</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r._id}>
                <td className="center">
                  {editMode ? (
                    <div className="category-select-wrap">
                      <select
                        className="edit-select type-select pretty-select rich"
                        value={r.category || ""}
                        onChange={(e) => updateRow(r._id, { category: e.target.value })}
                      >
                        <option value="">— 수입대분류 선택 —</option>
                        {incomeCategories.map((c) => (
                          <option key={c.id || c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span
                      className={`type-badge ${
                        r.category ? "cat" : (toNumber(r.inAmt) > 0 ? "in" : toNumber(r.outAmt) > 0 ? "out" : "")
                      }`}
                      title={r.category || (toNumber(r.inAmt) > 0 ? "입금" : toNumber(r.outAmt) > 0 ? "출금" : "-")}
                    >
                      {r.category || (toNumber(r.inAmt) > 0 ? "입금" : toNumber(r.outAmt) > 0 ? "출금" : "-")}
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
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); focusNextMemo(r._id); }
                        }}
                      />
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
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="pagination tight">
        <button className="btn" onClick={() => setPage(1)} disabled={curPage === 1}>«</button>
        <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage === 1}>‹</button>
        <span className="pageinfo">{curPage} / {pageCount}</span>
        <button className="btn" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={curPage === pageCount}>›</button>
        <button className="btn" onClick={() => setPage(pageCount)} disabled={curPage === pageCount}>»</button>
      </div>

      {/* 중복 안내 모달 */}
      <Modal open={dupOpen} title="중복 항목 안내" onClose={() => setDupOpen(false)}>
        {dupInfo && (
          <>
            <p>업로드 중 <b>{dupInfo.count.toLocaleString()}</b>건의 중복 항목을 발견하여 추가하지 않았습니다.</p>
            {dupInfo.examples?.length > 0 && (
              <ul className="dup-list">
                {dupInfo.examples.map((t, i) => (<li key={i}>• {t}</li>))}
              </ul>
            )}
          </>
        )}
      </Modal>

      {/* 미확인 목록 모달 */}
      <Modal
        open={unconfOpen}
        title="미확인 목록"
        mode="confirm"
        cancelText="닫기"
        confirmText="저장"
        onClose={() => setUnconfOpen(false)}
        onConfirm={applyUnconfEdits}
        primaryFirst={true}
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
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />      {/* 입금 */}
              <col style={{ width: "22%" }} />     {/* 거래기록 */}
              <col style={{ width: "39%" }} />     {/* 메모 */}
              <col style={{ width: "2%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>날짜</th>
                <th>시간</th>
                <th>구분</th>
                <th className="num">입금</th>
                <th>거래기록</th>
                <th>메모</th>
                <th>미확인</th>
              </tr>
            </thead>
            <tbody>
              {modalList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="center muted">검색 결과가 없습니다.</td>
                </tr>
              ) : (
                modalList.map((r) => (
                  <tr key={`u_${r._id}`}>
                    <td className="center mono">{r.date}</td>
                    <td className="center mono">{r.time}</td>
                    <td className="center">{r.category || r.type || "-"}</td>
                    <td className="num">{fmtComma(r.inAmt)}</td>
                    <td className="center">{r.record}</td>
                    <td>
                      <input
                        className="edit-input memo-input"
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}

/* ===== 내부 컴포넌트: DateTriple ===== */
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
