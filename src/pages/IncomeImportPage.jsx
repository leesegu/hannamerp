// ==================================
// 관리비회계 · 수입정리 페이지 (중복 상태 제거/요청 기능 포함)
// ==================================
import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import * as XLSX from "xlsx";
import "./IncomeImportPage.css";

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
const fmtDate = (d) => (d instanceof Date && !isNaN(d) ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : "");
const fmtTime = (d) => (d instanceof Date && !isNaN(d) ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` : "");
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
      type: inAmt > 0 ? "입금" : outAmt > 0 ? "출금" : "",
      unconfirmed: false,
    });
  }
  return out;
}

/* ===== 공용 모달 ===== */
function Modal({ open, title, children, onClose, onConfirm, confirmText = "확인", cancelText = "닫기", mode = "info" }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">
          {mode === "confirm" ? (
            <>
              <button className="btn" onClick={onClose}>{cancelText}</button>
              <button className="btn danger" onClick={onConfirm}>{confirmText}</button>
            </>
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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmOpenPayload, setConfirmOpenPayload] = useState(null);

  const [query, setQuery] = useState("");
  const [onlyIncome, setOnlyIncome] = useState(true);
  const [editMode, setEditMode] = useState(false);

  // ✅ 미확인 모달/상태
  const [unconfOpen, setUnconfOpen] = useState(false);
  const [unconfQuery, setUnconfQuery] = useState("");
  const [unconfDraft, setUnconfDraft] = useState({}); // { id: { memo, unconfirmed } }

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
  const pageSizeOptions = [24, 50, 100, 200, 300];
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(1);

  /* ✅ 선택(체크) — 단일 선언 */
  const [selected, setSelected] = useState(new Set());

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

  /* 필터 */
  const filtered = useMemo(() => {
    const q = s(query);
    const qLower = q.toLowerCase();
    const qNum = toNumber(q);

    const start = new Date(yFrom, mFrom - 1, dFrom, 0, 0, 0, 0);
    const end = new Date(yTo, mTo - 1, dTo, 23, 59, 59, 999);

    return rows.filter((r) => {
      const rDate = parseYMDLocal(r.date);
      if (!(rDate instanceof Date) || isNaN(rDate)) return false;

      if (rDate < new Date(start.getFullYear(), start.getMonth(), start.getDate())) return false;
      if (rDate > new Date(end.getFullYear(), end.getMonth(), end.getDate())) return false;

      if (onlyIncome && !(r.inAmt > 0)) return false;

      if (!q) return true;

      if (qNum > 0) {
        const inEq = toNumber(r.inAmt) === qNum;
        const outEq = toNumber(r.outAmt) === qNum;
        const contains = fmtComma(r.inAmt).includes(q) || fmtComma(r.outAmt).includes(q);
        if (inEq || outEq || contains) return true;
      }

      const bag = [r.type, r.accountNo, r.holder, r.record, r.memo].join("\n").toLowerCase();
      return bag.includes(qLower);
    });
  }, [rows, query, onlyIncome, yFrom, mFrom, dFrom, yTo, mTo, dTo]);

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

  /* ✅ 정렬 클릭 핸들러 (누락 보완) */
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

  /* 선택(체크) 유틸 */
  const isChecked = (id) => selected.has(id);
  const toggleOne = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleAllPage = () => {
    const ids = pageRows.map((r) => r._id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSelected) ids.forEach((id) => n.delete(id));
      else ids.forEach((id) => n.add(id));
      return n;
    });
  };

  /* 삭제 */
  const confirmRemoveSelected = () => {
    if (selected.size === 0) return;
    setConfirmOpenPayload({ count: selected.size });
    setConfirmOpen(true);
  };
  const removeSelected = () => {
    const keep = rows.filter((r) => !selected.has(r._id));
    setRows(keep);
    setSelected(new Set());
    const newCount = Math.max(1, Math.ceil(keep.length / pageSize));
    setPage((p) => Math.min(p, newCount));
    setConfirmOpen(false);
  };

  /* 기간 컴포넌트 */
  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const arr = [];
    for (let y = thisYear; y >= thisYear - 10; y--) arr.push(y);
    return arr;
  }, []);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const DateTriple = ({ y, m, d, onY, onM, onD }) => {
    const maxDay = new Date(y, m, 0).getDate();
    const dayOptions = Array.from({ length: maxDay }, (_, i) => i + 1);
    return (
      <div className="date-triple">
        <select value={y} onChange={(e) => onY(+e.target.value)}>
          {yearOptions.map((yy) => <option key={yy} value={yy}>{yy}년</option>)}
        </select>
        <select value={m} onChange={(e) => onM(+e.target.value)}>
          {monthOptions.map((mm) => <option key={mm} value={mm}>{mm}월</option>)}
        </select>
        <select value={Math.min(d, maxDay)} onChange={(e) => onD(+e.target.value)}>
          {dayOptions.map((dd) => <option key={dd} value={dd}>{dd}일</option>)}
        </select>
      </div>
    );
  };
  const onFromChange = (ny, nm, nd) => {
    const [aY, aM, aD, bY, bM, bD] = clampRange(ny, nm, nd, yTo, mTo, dTo);
    setYFrom(aY); setMFrom(aM); setDFrom(aD);
    setYTo(bY); setMTo(bM); setDTo(bD);
    setPage(1);
  };
  const onToChange = (ny, nm, nd) => {
    const [aY, aM, aD, bY, bM, bD] = clampRange(yFrom, mFrom, dFrom, ny, nm, nd);
    setYFrom(aY); setMFrom(aM); setDFrom(aD);
    setYTo(bY); setMTo(bM); setDTo(bD);
    setPage(1);
  };

  /* ✅ 인라인 수정 핸들러 (누락 보완) */
  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  };

  // 거래메모 엔터 이동
  const memoRefs = useRef({});
  const setMemoRef = (id, el) => {
    memoRefs.current[id] = el;
  };
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

  return (
    <div className="income-page">
      {/* 상단 툴바 */}
      <div className="toolbar tight">
        <div className="left">
          <button className="btn" onClick={onPickFiles}>
            <i className="ri-file-excel-2-line" /> 엑셀 업로드
          </button>
          <input
            ref={fileInputRef}
            type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }}
            onChange={(e) => e.target.files && handleFiles([...e.target.files])}
          />
          <label className="chk">
            <input type="checkbox" checked={onlyIncome} onChange={(e) => setOnlyIncome(e.target.checked)} />
            입금만
          </label>
          <label className="chk">
            <input type="checkbox" checked={editMode} onChange={(e) => setEditMode(e.target.checked)} />
            수정모드
          </label>

          {/* 미확인 목록 버튼 */}
          <button className="btn warn" onClick={() => setUnconfOpen(true)}>
            미확인
          </button>
        </div>

        <div className="mid">
          <div className="range-pickers compact">
            <DateTriple
              y={yFrom} m={mFrom} d={dFrom}
              onY={(v) => onFromChange(v, mFrom, dFrom)}
              onM={(v) => onFromChange(yFrom, v, dFrom)}
              onD={(v) => onFromChange(yFrom, mFrom, v)}
            />
            <span className="dash">—</span>
            <DateTriple
              y={yTo} m={mTo} d={dTo}
              onY={(v) => onToChange(v, mTo, dTo)}
              onM={(v) => onToChange(yTo, v, dTo)}
              onD={(v) => onToChange(yTo, mTo, v)}
            />
          </div>
        </div>

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
              const v = Number(e.target.value) || 24;
              setPageSize(v);
              setPage(1);
            }}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n}/페이지</option>
            ))}
          </select>
          <button
            className="btn danger"
            disabled={selected.size === 0}
            onClick={confirmRemoveSelected}
            title="선택 삭제"
          >
            삭제({selected.size})
          </button>
        </div>
      </div>

      {error && <pre className="error tight">{error}</pre>}

      {/* 테이블 */}
      <div className="table-wrap">
        <table className="dense modern">
          <thead>
            <tr>
              <th className="th-check center" style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r._id))}
                  onChange={toggleAllPage}
                />
              </th>
              <th onClick={() => clickSort("type")} className="col-type">구분</th>
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
                <td className="td-check">
                  <input type="checkbox" checked={isChecked(r._id)} onChange={() => toggleOne(r._id)} />
                </td>

                {/* 구분: 내용 중앙정렬 */}
                <td className="center">
                  {editMode ? (
                    <select
                      className="edit-select type-select pretty-select"
                      value={r.type}
                      onChange={(e) => updateRow(r._id, { type: e.target.value })}
                    >
                      <option value="">선택</option>
                      <option value="입금">입금</option>
                      <option value="출금">출금</option>
                    </select>
                  ) : (
                    <span className={`type-badge ${r.type === "입금" ? "in" : r.type === "출금" ? "out" : ""}`}>
                      {r.type || "-"}
                    </span>
                  )}
                </td>

                {/* 계좌번호: 중앙정렬 */}
                <td className="mono center">{r.accountNo}</td>

                {/* 거래일/시간: 중앙정렬 */}
                <td className="mono center">{r.date}</td>
                <td className="mono center">{r.time}</td>

                <td className="num strong in">{fmtComma(r.inAmt)}</td>
                <td className="num out">{fmtComma(r.outAmt)}</td>

                {/* 거래기록사항: 중앙정렬 */}
                <td className="clip center">{r.record}</td>

                {/* 거래메모: 수정모드에서만 미확인 체크 표시/수정 */}
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
                          if (e.key === "Enter") {
                            e.preventDefault();
                            focusNextMemo(r._id);
                          }
                        }}
                      />
                      <label className="chk mi">
                        <input
                          type="checkbox"
                          checked={!!r.unconfirmed}
                          onChange={(e) => updateRow(r._id, { unconfirmed: e.target.checked })}
                        />
                        미확인
                      </label>
                    </div>
                  ) : (
                    <div className="memo-wrap">
                      <div className="memo-text" title={r.memo || ""}>{r.memo}</div>
                      {/* 비수정모드: 체크박스 표시하지 않음 */}
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

      {/* 삭제 확인 모달 */}
      <Modal
        open={confirmOpen}
        title="선택 삭제"
        mode="confirm"
        cancelText="취소"
        confirmText="삭제"
        onClose={() => setConfirmOpen(false)}
        onConfirm={removeSelected}
      >
        선택한 {confirmOpenPayload?.count?.toLocaleString() ?? 0}건을 삭제할까요?
      </Modal>

      {/* 미확인 목록 모달 (검색/편집/저장) */}
      <Modal
        open={unconfOpen}
        title="미확인 목록"
        mode="confirm"
        cancelText="닫기"
        confirmText="저장"
        onClose={() => setUnconfOpen(false)}
        onConfirm={applyUnconfEdits}
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
              {modalList.map((r) => (
                <tr key={`u_${r._id}`}>
                  <td className="center mono">{r.date}</td>
                  <td className="center mono">{r.time}</td>
                  <td className="center">{r.type || "-"}</td>
                  <td className="num">{fmtComma(r.inAmt)}</td>
                  <td className="clip center">{r.record}</td>
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
              ))}
              {modalList.length === 0 && (
                <tr><td colSpan={7} className="center muted">검색 결과가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
