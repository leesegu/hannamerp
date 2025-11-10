// src/pages/CardExpenseModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
/** ✅ Firestore 실시간 동기화 사용 */
import { db } from "../firebase";
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "firebase/firestore";

import "./CardExpenseModal.css";

/* ================= 아이콘 ================= */
const IconSearch = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M10 2a8 8 0 0 1 6.32 12.9l4.39 4.38a1 1 0 0 1-1.42 1.42l-4.38-4.39A8 8 0 1 1 10 2Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"/>
  </svg>
);
const IconCalendar = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M7 2a1 1 0 0 0-1 1v1H5a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3h-1V3a1 1 0 1 0-2 0v1H8V3a1 1 0 0 0-1-1Zm12 8H5v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8Z"/>
  </svg>
);
const IconCard = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M3 5h18a2 2 0 0 1 2 2v2H1V7a2 2 0 0 1 2-2Zm-2 6h22v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-6Zm4 5h6a1 1 0 1 0 0-2H5a1 1 0 1 0 0 2Z"/>
  </svg>
);
const IconUser = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M12 2a6 6 0 1 1 0 12A6 6 0 0 1 12 2Zm0 14c-5 0-9 2.5-9 5.5V22h18v-.5C21 18.5 17 16 12 16Z"/>
  </svg>
);
const IconTag = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M10.59 3.59A2 2 0 0 1 12 3h7a2 2 0 0 1 2 2v7a2 2 0 0 1-.59 1.41l-7 7a2 2 0 0 1-2.82 0l-7-7a2 2 0 0 1 0-2.82l7-7ZM16 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/>
  </svg>
);
const IconWon = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path d="M4 7h3l2 8 2-8h2l2 8 2-8h3l-3 10h-4l-1-4-1 4H7L4 7Zm-2 5h20v2H2v-2Z" fill="currentColor"/>
  </svg>
);
const IconNote = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M5 2h10l6 6v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm9 1.5V8h4.5L14 3.5Z"/>
  </svg>
);
const IconPencil = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path fill="currentColor" d="m18.7 2.3 3 3L8.4 18.6 5.1 19l.7-3.3L18.7 2.3Zm3-1L20 0l-3 3 4 4 3-3-1.3-1.3Z"/>
  </svg>
);
const IconAlert = (props) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 0 1-1-1V8a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1Z"/>
  </svg>
);
const IconChevronLeft = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
    <path fill="currentColor" d="m14 18-6-6 6-6 1.4 1.4-4.6 4.6 4.6 4.6L14 18z"/>
  </svg>
);
const IconChevronRight = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
    <path fill="currentColor" d="m10 18 6-6-6-6-1.4 1.4 4.6 4.6-4.6 4.6L10 18z"/>
  </svg>
);

/* ================= 유틸 ================= */
const z2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt?.getTime?.())) return String(d).split(" ")[0] || String(d);
  return `${dt.getFullYear()}-${z2(dt.getMonth() + 1)}-${z2(dt.getDate())}`;
};
const toNum = (v) => {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmtWon = (n) => (toNum(n) || 0).toLocaleString("ko-KR");
const monthKeyOf = (d) => String(d || "").slice(0, 7);
const yearOf = (mk) => String(mk || "").slice(0, 4);

function sumo(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = String(r[key] || "미지정");
    m.set(k, (m.get(k) || 0) + toNum(r.amount));
  }
  return Array.from(m.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}

function usePagination(items, pageSize = 10) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil((items?.length || 0) / pageSize));
  const current = useMemo(() => {
    const s = (page - 1) * pageSize;
    return (items || []).slice(s, s + pageSize);
  }, [items, page, pageSize]);
  useEffect(() => { setPage(1); }, [items, pageSize]);
  return { page, setPage, pageCount, current };
}

function useClickOutside(ref, handler) {
  useEffect(() => {
    const on = (e) => { if (!ref.current || ref.current.contains(e.target)) return; handler(e); };
    document.addEventListener("mousedown", on);
    document.addEventListener("touchstart", on);
    return () => {
      document.removeEventListener("mousedown", on);
      document.removeEventListener("touchstart", on);
    };
  }, [ref, handler]);
}

/* ===== 날짜 정렬 & 낙관적 업데이트 유틸 ===== */
const toTime = (v) => {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const norm = s.replace(/[./]/g, "-");
  const d = new Date(norm);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
};
const byDateDesc = (a, b) => toTime(b?.date) - toTime(a?.date);

function upsertByIdDesc(list, row) {
  const i = list.findIndex((x) => x.id === row.id);
  const next =
    i === -1
      ? [row, ...list]
      : list.map((x, idx) => (idx === i ? { ...x, ...row } : x));
  return next.slice().sort(byDateDesc);
}
function removeById(list, id) {
  return list.filter((x) => x.id !== id);
}

/* ================= 커스텀 월 선택 ================= */
const CustomMonthPicker = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(() => {
    const date = new Date((value || "") + "-01");
    return Number.isNaN(date.getFullYear()) ? new Date().getFullYear() : date.getFullYear();
  });
  const wrapperRef = useRef(null);
  useClickOutside(wrapperRef, () => setIsOpen(false));

  const validDate = new Date((value || "") + "-01");
  const currentYear = Number.isNaN(validDate.getFullYear()) ? -1 : validDate.getFullYear();
  const currentMonth = Number.isNaN(validDate.getMonth()) ? -1 : validDate.getMonth();

  const selectMonth = (i) => { onChange(`${displayYear}-${z2(i + 1)}`); setIsOpen(false); };
  const changeYear = (d) => setDisplayYear((y) => y + d);

  useEffect(() => {
    const date = new Date((value || "") + "-01");
    const year = Number.isNaN(date.getFullYear()) ? new Date().getFullYear() : date.getFullYear();
    setDisplayYear(year);
  }, [value]);

  const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  return (
    <div className="mp-wrap" ref={wrapperRef}>
      <button className="mp-trigger" onClick={() => setIsOpen(!isOpen)}>
        <IconCalendar width="16" height="16" />
        {value}
        <span className="caret">▾</span>
      </button>
      {isOpen && (
        <div className="mp-pop">
          <div className="mp-head">
            <button className="nav nav-prev" onClick={() => changeYear(-1)}><IconChevronLeft /></button>
            <div className="yr">{displayYear}</div>
            <button className="nav nav-next" onClick={() => changeYear(1)}><IconChevronRight /></button>
          </div>
          <div className="mp-grid">
            {MONTH_LABELS.map((m, i) => (
              <button
                key={m}
                className={`mm ${displayYear === currentYear && i === currentMonth ? "is-picked" : ""}`}
                onClick={() => selectMonth(i)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="mp-foot"><button className="mp-close btn ghost" onClick={() => setIsOpen(false)}>닫기</button></div>
        </div>
      )}
    </div>
  );
};

/* ================= 커스텀 드롭다운 ================= */
const CustomSelect = ({ value, onChange, options = [], renderIcon: Icon }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  const pick = (v) => { onChange(v); setOpen(false); };
  return (
    <div className="csel" ref={ref}>
      <button className="csel-trigger" onClick={() => setOpen((v) => !v)}>
        {Icon ? <Icon className="inputicon" /> : null}
        <span className="csel-value">{value}</span>
        <span className="csel-caret">▾</span>
      </button>
      {open && (
        <div className="csel-pop">
          {options.map((opt) => (
            <div
              key={opt}
              className={`csel-item ${opt === value ? "is-active" : ""}`}
              onClick={() => pick(opt)}
              role="button"
              tabIndex={0}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ================= 통계 모달 ================= */
function distinct(arr) { return Array.from(new Set((arr || []).filter(Boolean))); }
const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

const StatsModal = ({ rows, onClose }) => {
  const allYears = distinct((rows || []).map(r => String(r.date || "").slice(0,4)));
  const CY = String(new Date().getFullYear());
  const initialYear = allYears.includes(CY) ? CY : (allYears[0] || CY);
  const [year, setYear] = useState(initialYear);
  const [months, setMonths] = useState(() => new Set(MONTH_LABELS));
  const payers = distinct((rows || []).map(r => r.payer));

  const toggleMonth = (ml) => {
    const n = new Set(months);
    n.has(ml) ? n.delete(ml) : n.add(ml);
    setMonths(n);
  };
  const [payFilter, setPayFilter] = useState(new Set());
  const toggleP = (p) => {
    const n = new Set(payFilter);
    n.has(p) ? n.delete(p) : n.add(p);
    setPayFilter(n);
  };

  const filtered = useMemo(() => {
    return (rows || []).filter(r => {
      const y = String(r.date || "").slice(0,4);
      if (y !== year) return false;
      const mIdx = (new Date(r.date)).getMonth();
      if (!months.has(MONTH_LABELS[mIdx])) return false;
      if (payFilter.size && !payFilter.has(r.payer)) return false;
      return true;
    });
  }, [rows, year, months, payFilter]);

  const cats = distinct(filtered.map(r => r.category)).filter(Boolean);

  const monthRows = Array.from({length:12}, (_,i)=>i).map(i => {
    const mk = `${year}-${ z2(i+1) }`;
    const inside = filtered.filter(r => (r.date||"").startsWith(mk));
    const totalsByCat = {};
    cats.forEach(c => { totalsByCat[c] = inside.filter(r => r.category===c).reduce((s,r)=>s+toNum(r.amount),0); });
    const sum = inside.reduce((s,r)=>s+toNum(r.amount),0);
    return { label: MONTH_LABELS[i], totalsByCat, sum };
  });

  const grandByCat = {};
  cats.forEach(c => { grandByCat[c] = monthRows.reduce((s,row)=>s+row.totalsByCat[c],0); });
  const grandSum = monthRows.reduce((s,row)=>s+row.sum,0);

  return (
    <div className="pop-overlay" onClick={onClose}>
      <div className="stats-panel" onClick={(e)=>e.stopPropagation()}>
        <div className="pop-head">
          <div className="pop-title">카드지출 통계</div>
          <button className="btn close pop-close" onClick={onClose} aria-label="닫기">닫기</button>
        </div>

        <div className="stats-layout">
          <div className="h-100 w-100 flex flex-col">
            <div className="filter-block">
              <div className="filter-title">연도</div>
              <div className="year-row">
                <select className="stats-year-select" value={year} onChange={e=>setYear(e.target.value)}>
                  {allYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="filter-block">
              <div className="filter-title">월 선택</div>
              <div className="months-grid">
                {MONTH_LABELS.map(ml => (
                  <button key={ml}
                          className={`month-pill ${months.has(ml) ? "is-on":""}`}
                          onClick={()=>toggleMonth(ml)}>{ml}</button>
                ))}
              </div>
            </div>

            <div className="filter-block">
              <div className="filter-title">결제자</div>
              <div className="payer-list">
                {payers.map(p => (
                  <button key={p}
                          className={`met ${payFilter.has(p) ? "is-on":""}`}
                          onClick={()=>toggleP(p)}>{p}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="stats-tablewrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>월</th>
                  {cats.map(c => <th key={c}>{c}</th>)}
                  <th>총합계</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map(row => (
                  <tr key={row.label}>
                    <td className="mcell">{row.label}</td>
                    {cats.map(c => <td key={c}>{row.totalsByCat[c].toLocaleString('ko-KR')}</td>)}
                    <td className="strong">{row.sum.toLocaleString('ko-KR')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="mcell strong">총합계</td>
                  {cats.map(c => <td key={c} className="strong">{grandByCat[c].toLocaleString('ko-KR')}</td>)}
                  <td className="strong">{grandSum.toLocaleString('ko-KR')}</td>
                </tr>
              </tfoot>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
};

/* ================= 차트 모달 (막대 그래프 UI) ================= */
const ChartsModal = ({ rows, onClose }) => {
  const allYears = distinct((rows || []).map(r => String(r.date || "").slice(0,4)));
  const CY = String(new Date().getFullYear());
  const initialYear = allYears.includes(CY) ? CY : (allYears[0] || CY);
  const [year, setYear] = useState(initialYear);

  const yrRows = useMemo(() => (rows || []).filter(r => String(r.date||"").startsWith(year)), [rows, year]);

  const byMonth = Array.from({length:12}, (_,i)=> {
    const mk = `${year}-${z2(i+1)}`;
    const total = yrRows.filter(r => (r.date||"").startsWith(mk)).reduce((s,r)=>s+toNum(r.amount),0);
    return { name: `${i+1}월`, total };
  });
  const maxMonth = Math.max(1, ...byMonth.map(x=>x.total));

  const byCat   = useMemo(()=>sumo(yrRows,"category"),[yrRows]);
  const maxCat  = Math.max(1, ...byCat.map(x=>x.total));

  const byPayer = useMemo(()=>sumo(yrRows,"payer"),[yrRows]);
  const maxP    = Math.max(1, ...byPayer.map(x=>x.total));

  const byPayType = useMemo(()=>sumo(yrRows,"payType"),[yrRows]);
  const maxPT     = Math.max(1, ...byPayType.map(x=>x.total));

  return (
    <div className="pop-overlay" onClick={onClose}>
      <div className="charts-panel" onClick={(e)=>e.stopPropagation()}>
        <div className="pop-head charts-head">
          <div className="charts-head-left">
            <div className="pop-title">카드지출 차트</div>
            <select className="year-select inline" value={year} onChange={(e)=>setYear(e.target.value)}>
              {allYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button className="btn blue close pop-close" onClick={onClose} aria-label="닫기">닫기</button>
        </div>

        <div className="charts-grid charts-grid-quad">
          <div className="chart-card">
            <div className="chart-title">월별 카드금액</div>
            <div className="bars vstack">
              {byMonth.map(c => (
                <div key={c.name} className="bar-row">
                  <div className="bar-label">{c.name}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{width: `${(c.total/maxMonth)*100}%`}} />
                    <div className="bar-value">{c.total.toLocaleString('ko-KR')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">카테고리 합계</div>
            <div className="bars vstack">
              {byCat.map(c => (
                <div key={c.name} className="bar-row">
                  <div className="bar-label">{c.name}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{width: `${(c.total/maxCat)*100}%`}} />
                    <div className="bar-value">{c.total.toLocaleString('ko-KR')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">결제자 합계</div>
            <div className="bars vstack">
              {byPayer.map(c => (
                <div key={c.name} className="bar-row">
                  <div className="bar-label">{c.name}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{width: `${(c.total/maxP)*100}%`}} />
                    <div className="bar-value">{c.total.toLocaleString('ko-KR')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">결제유형 합계</div>
            <div className="bars vstack">
              {byPayType.map(c => (
                <div key={c.name} className="bar-row">
                  <div className="bar-label">{c.name}</div>
                  <div className="bar-track">
                    <div className="bar-fill pink" style={{width: `${(c.total/maxPT)*100}%`}} />
                    <div className="bar-value">{c.total.toLocaleString('ko-KR')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

/* ================= 본 컴포넌트 ================= */
export default function CardExpenseModal({ open, onClose }) {
  /* Firestore 컬렉션 레퍼런스 */
  const colRef = collection(db, "card_expenses");

  /* 데이터 */
  const [rows, setRows] = useState([]);
  const [yearRows, setYearRows] = useState([]);
  const yearIndexRef = useRef(new Map());
  const [monthKey, setMonthKey] = useState(() => new Date().toISOString().slice(0, 7));

  /* 검색 */
  const [q, setQ] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const [highlightId, setHighlightId] = useState(null);

  /* 신규 입력 */
  const [newRow, setNewRow] = useState({
    date: ymd(new Date()),
    payType: "카드",
    payer: "최슬기",
    category: "식대",
    amount: "",
    desc: "",
    memo: "",
  });

  /* 편집 상태 */
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  /* 삭제 확인 모달 */
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState(null);

  /* 통계/차트 팝업 */
  const [showStats, setShowStats] = useState(false);
  const [showCharts, setShowCharts] = useState(false);

  /* 인덱스 필요 시 무정렬 폴백 구독 헬퍼 */
  const subscribeWithFallback = (primaryQuery, fallbackQuery, onData) => {
    let unsubPrimary = null;
    let unsubFallback = null;

    const startFallback = () => {
      if (unsubFallback) return;
      unsubFallback = onSnapshot(
        fallbackQuery,
        (snap) => {
          const list = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
          onData(list);
        },
        (err) => {
          console.error("[Firestore fallback] onSnapshot error:", err);
        }
      );
    };

    try {
      unsubPrimary = onSnapshot(
        primaryQuery,
        (snap) => {
          const list = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
          onData(list);
        },
        (err) => {
          console.warn("[Firestore primary] onSnapshot error, fallback →", err?.code || err);
          startFallback();
        }
      );
    } catch (e) {
      console.warn("[Firestore primary] subscribe exception, fallback →", e);
      startFallback();
    }

    return () => {
      if (unsubPrimary) unsubPrimary();
      if (unsubFallback) unsubFallback();
    };
  };

  /* 🔁 실시간 구독: 월별 */
  useEffect(() => {
    if (!open) return;

    const qPrimary  = query(
      colRef,
      where("monthKey", "==", monthKey),
      orderBy("date", "desc")
    );
    const qFallback = query(
      colRef,
      where("monthKey", "==", monthKey)
    );

    const unsub = subscribeWithFallback(qPrimary, qFallback, (list) => {
      setRows(list); // 화면에서 정렬은 filtered에서 처리
    });

    return () => { if (unsub) unsub(); };
  }, [open, monthKey]); // eslint-disable-line

  /* 🔁 실시간 구독: 연도 전체 */
  useEffect(() => {
    if (!open) return;
    const y = yearOf(monthKey);

    const qPrimary  = query(
      colRef,
      where("year", "==", y),
      orderBy("date", "desc")
    );
    const qFallback = query(
      colRef,
      where("year", "==", y)
    );

    const unsub = subscribeWithFallback(qPrimary, qFallback, (list) => {
      const idx = new Map();
      list.forEach((r) => { if (r?.id) idx.set(r.id, r); });
      setYearRows(list);
      yearIndexRef.current = idx;
    });

    return () => { if (unsub) unsub(); };
  }, [open, monthKey]); // eslint-disable-line

  /* 파생 */
  const monthFiltered = rows;
  const searchBase = q.trim() ? yearRows : monthFiltered;

  const filtered = useMemo(() => {
    const base = searchBase || [];
    if (!q.trim()) return base.slice().sort(byDateDesc);
    const needle = q.toLowerCase();
    const arr = base.filter((r) => {
      const amountStr = String(r.amount ?? "");
      return (
        amountStr.includes(needle) ||
        (r.desc  || "").toLowerCase().includes(needle) ||
        (r.memo  || "").toLowerCase().includes(needle)
      );
    });
    return arr.sort(byDateDesc);
  }, [searchBase, q]);

  const monthTotal      = useMemo(() => monthFiltered.reduce((s, r) => s + toNum(r.amount), 0), [monthFiltered]);
  const monthByPayer    = useMemo(() => sumo(monthFiltered, "payer"), [monthFiltered]);
  const monthByCategory = useMemo(() => sumo(monthFiltered, "category"), [monthFiltered]);

  const { page, setPage, pageCount, current } = usePagination(filtered, 9);

  /* ✅ 추가(즉시 저장 + 낙관적 반영) */
  const addNew = async () => {
    const numeric = toNum(newRow.amount);
    const dateStr = newRow.date || ymd(new Date());
    const mk = monthKeyOf(dateStr);
    const yr = yearOf(mk);

    const payload = {
      date: dateStr,
      monthKey: mk,
      year: yr,
      payType: (newRow.payType || "카드").trim(),
      payer: (newRow.payer || "").trim(),
      category: (newRow.category || "").trim(),
      amount: numeric,
      desc: (newRow.desc || "").trim(),
      memo: (newRow.memo || "").trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const ref = await addDoc(colRef, payload);

      // 낙관적 반영
      const optimistic = { id: ref.id, ...payload };
      if (mk === monthKey) setRows((p) => upsertByIdDesc(p, optimistic));
      if (yr === yearOf(monthKey)) {
        setYearRows((p) => upsertByIdDesc(p, optimistic));
        yearIndexRef.current.set(ref.id, optimistic);
      }
      if (mk !== monthKey) setMonthKey(mk);

      setNewRow((v) => ({ ...v, date: dateStr, amount: "", desc: "", memo: "" }));
      setMatchIdx(0);
    } catch (e) {
      console.error("addDoc failed:", e);
    }
  };

  /* ✏️ 편집(즉시 저장 + 낙관적 반영) */
  const beginEdit = (row) => { setEditId(row.id); setEditDraft({ ...row, amount: String(row.amount ?? "") }); };
  const cancelEdit = () => { setEditId(null); setEditDraft({}); };

  const commitEdit = async () => {
    if (!editId) return;
    const numeric = toNum(editDraft.amount);
    const dateStr = editDraft.date || ymd(new Date());
    const mk = monthKeyOf(dateStr);
    const yv = yearOf(mk);

    const updatePayload = {
      date: dateStr,
      monthKey: mk,
      year: yv,
      payType: (editDraft.payType || "").trim(),
      payer: (editDraft.payer || "").trim(),
      category: (editDraft.category || "").trim(),
      amount: numeric,
      desc: (editDraft.desc || "").trim(),
      memo: (editDraft.memo || "").trim(),
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, "card_expenses", editId), updatePayload);

      const optimistic = { id: editId, ...updatePayload };
      if (mk === monthKey) {
        setRows((p) => upsertByIdDesc(p, optimistic));
      } else {
        setRows((p) => removeById(p, editId));
      }
      if (yv === yearOf(monthKey)) {
        setYearRows((p) => upsertByIdDesc(p, optimistic));
        yearIndexRef.current.set(editId, optimistic);
      } else {
        // 연도 바뀌면 현재 yearRows에서 제거 (새 연도 스트림에서 들어옴)
        setYearRows((p) => removeById(p, editId));
        yearIndexRef.current.delete(editId);
      }

      if (mk !== monthKey) setMonthKey(mk);

      setEditId(null);
      setEditDraft({});
    } catch (e) {
      console.error("updateDoc failed:", e);
    }
  };

  /* 🗑️ 삭제(즉시 반영) */
  const removeRow = (id) => { setRowToDelete(id); setIsConfirmOpen(true); };
  const handleConfirmDelete = async () => {
    if (rowToDelete) {
      try {
        await deleteDoc(doc(db, "card_expenses", rowToDelete));
        setRows((p)      => removeById(p, rowToDelete));
        setYearRows((p)  => removeById(p, rowToDelete));
        yearIndexRef.current.delete(rowToDelete);
      } catch (e) {
        console.error("deleteDoc failed:", e);
      }
    }
    setIsConfirmOpen(false);
    setRowToDelete(null);
  };
  const handleCancelDelete = () => { setIsConfirmOpen(false); setRowToDelete(null); };

  /* 바디 스크롤 잠금 */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const openPicker = (el) => { if (!el) return; if (typeof el.showPicker === "function") el.showPicker(); else { el.focus(); el.click(); } };

  const newDateRef = useRef(null);
  const amountRef  = useRef(null);
  const descRef    = useRef(null);
  const memoRef    = useRef(null);

  /* 검색 매치 이동 */
  const rowRefs = useRef(new Map());
  useEffect(() => { rowRefs.current.clear(); }, [current]);

  const matchIds = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.toLowerCase();
    return (yearRows || []).filter((r) => {
      const s = String(r.amount || "");
      return s.includes(needle) ||
             (r.desc || "").toLowerCase().includes(needle) ||
             (r.memo || "").toLowerCase().includes(needle);
    }).map((r) => r.id);
  }, [yearRows, q]);

  const gotoMatch = async (idx) => {
    if (!matchIds.length) return;
    const id = matchIds[idx % matchIds.length];
    const target = yearIndexRef.current.get(id);
    if (!target) return;
    const targetMk = monthKeyOf(target.date);

    if (targetMk !== monthKey) {
      setMonthKey(targetMk);
      // 월 전환 후 페이지/스크롤 이동
      setTimeout(() => {
        const list = (() => {
          const base = q.trim() ? yearRows : rows;
          const nn = q.toLowerCase();
          const arr = (base || []).filter((r) => {
            if (!q.trim()) return true;
            const s2 = String(r.amount || "");
            return s2.includes(nn) || (r.desc || "").toLowerCase().includes(nn) || (r.memo || "").toLowerCase().includes(nn);
          }).sort(byDateDesc);
          return arr;
        })();
        const j = list.findIndex((r) => r.id === id);
        if (j >= 0) {
          const tp = Math.floor(j / 9) + 1;
          if (tp !== page) setPage(tp);
          setTimeout(() => {
            const el = rowRefs.current.get(id);
            if (el) {
              el.scrollIntoView({ block: "center", behavior: "smooth" });
              setHighlightId(id);
              setTimeout(() => setHighlightId(null), 1200);
            }
          }, 50);
        }
      }, 150);
      return;
    }

    const j = filtered.findIndex((r) => r.id === id);
    if (j >= 0) {
      const tp = Math.floor(j / 9) + 1;
      if (tp !== page) setPage(tp);
      setTimeout(() => {
        const el = rowRefs.current.get(id);
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          setHighlightId(id); setTimeout(() => setHighlightId(null), 1200);
        }
      }, 50);
    }
  };

  const onSearchKeyDown = (e) => {
    if (e.key === "Enter" && matchIds.length) {
      e.preventDefault();
      const next = (matchIdx + 1) % matchIds.length;
      setMatchIdx(next);
      gotoMatch(next);
    }
  };

  const onAmountChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    const withComma = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    setNewRow((v) => ({ ...v, amount: withComma }));
  };
  const onAmountKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); descRef.current?.focus(); } };
  const onDescKeyDown   = (e) => { if (e.key === "Enter") { e.preventDefault(); memoRef.current?.focus(); } };
  const onMemoKeyDown   = (e) => { if (e.key === "Enter") { e.preventDefault(); addNew(); newDateRef.current?.focus(); } };

  if (!open) return null;

  return (
    <>
      <div className="cemodal">
        <div className="cemodal__backdrop" onClick={onClose} />
        <div className="cemodal__panel" role="dialog" aria-modal="true">
          {/* Header */}
          <div className="cemodal__header">
            <div className="cemodal__title">
              <span className="cemodal__badge"><IconCard /></span>
              카드지출 관리
            </div>

            {/* 오른쪽 끝: 닫기 ← 검색 ← 달력 ← 통계/차트 */}
            <div className="cemodal__header-right">
              <button className="btn luxe" onClick={()=>setShowStats(true)}>통계</button>
              <button className="btn luxe" onClick={()=>setShowCharts(true)}>차트</button>

              <CustomMonthPicker value={monthKey} onChange={(val) => { setMonthKey(val); setMatchIdx(0); }} />

              <div className="inputwrap searchwrap searchwrap--header">
                <IconSearch className="inputicon" />
                <input
                  className="search"
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setMatchIdx(0); }}
                  onKeyDown={onSearchKeyDown}
                  placeholder="검색"
                />
                <div className={`matchcounter ${matchIds.length ? "" : "is-empty"}`}>
                  {matchIds.length ? `${(matchIdx % matchIds.length) + 1}/${matchIds.length}` : "0/0"}
                </div>
              </div>

              <button className="btn close cemodal__btn-close" onClick={onClose} aria-label="닫기">닫기</button>
            </div>
          </div>

          {/* Stats */}
          <div className="cemodal__stats">
            <div className="stat">
              <div className="stat__label"><IconSearch className="thicon" />표시 건수</div>
              <div className="stat__value">{String(filtered.length)} <span className="stat__unit">건</span></div>
            </div>
            <div className="stat">
              <div className="stat__label"><IconWon className="thicon" />합계</div>
              <div className="stat__value">₩ {fmtWon(monthTotal)}</div>
            </div>
            <div className="stat stat--pill">
              <div className="stat__label"><IconUser className="thicon" />결제자 Top</div>
              <div className="stat__list">
                {monthByPayer.slice(0, 3).map((x) => (
                  <span key={x.name} className="pill"><IconUser />{x.name}<b>₩{fmtWon(x.total)}</b></span>
                ))}
              </div>
            </div>
            <div className="stat stat--pill">
              <div className="stat__label"><IconTag className="thicon" />사용내역 Top</div>
              <div className="stat__list">
                {monthByCategory.slice(0, 3).map((x) => (
                  <span key={x.name} className="pill"><IconTag />{x.name}<b>₩{fmtWon(x.total)}</b></span>
                ))}
              </div>
            </div>
          </div>

          {/* New row form */}
          <div className="cemodal__newform">
            <div className="inputwrap datechip">
              <IconCalendar className="inputicon" />
              <input
                ref={newDateRef}
                type="date"
                value={newRow.date}
                onChange={(e) => setNewRow((v) => ({ ...v, date: e.target.value }))}
                onClick={(e) => openPicker(e.currentTarget)}
                className="fancy-picker-alt"
              />
            </div>

            {/* 결제유형 */}
            <div className="inputwrap no-select-padding">
              <CustomSelect
                value={newRow.payType}
                onChange={(v) => setNewRow((x) => ({ ...x, payType: v }))}
                options={["카드", "현금"]}
                renderIcon={IconCard}
              />
            </div>

            {/* 결제자 */}
            <div className="inputwrap no-select-padding">
              <CustomSelect
                value={newRow.payer}
                onChange={(v) => setNewRow((x) => ({ ...x, payer: v }))}
                options={["최슬기", "김성은", "이승준", "이한솔", "이세구"]}
                renderIcon={IconUser}
              />
            </div>

            {/* 사용내역 */}
            <div className="inputwrap no-select-padding">
              <CustomSelect
                value={newRow.category}
                onChange={(v) => setNewRow((x) => ({ ...x, category: v }))}
                options={["식대", "자재비", "사무실", "주유비"]}
                renderIcon={IconTag}
              />
            </div>

            {/* 금액 */}
            <div className="inputwrap">
              <IconWon className="inputicon" />
              <input
                ref={amountRef}
                placeholder="금액"
                value={newRow.amount}
                onChange={onAmountChange}
                onKeyDown={onAmountKeyDown}
                inputMode="numeric"
                className="input-center"
              />
            </div>

            {/* 내용 */}
            <div className="inputwrap input--stretch">
              <IconNote className="inputicon" />
              <input
                ref={descRef}
                placeholder="내용"
                value={newRow.desc}
                onChange={(e) => setNewRow((v) => ({ ...v, desc: e.target.value }))}
                onKeyDown={onDescKeyDown}
              />
            </div>

            {/* 비고 */}
            <div className="inputwrap input--stretch">
              <IconPencil className="inputicon" />
              <input
                ref={memoRef}
                placeholder="비고"
                value={newRow.memo}
                onChange={(e) => setNewRow((v) => ({ ...v, memo: e.target.value }))}
                onKeyDown={onMemoKeyDown}
              />
            </div>

            <button className="btn primary center" onClick={addNew}>추가</button>
          </div>

          {/* Table */}
          <div className="cemodal__tablewrap">
            <table className="cemodal__table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>
                    <span className="thicon"><IconCalendar /></span>날짜
                  </th>
                  <th style={{ width: 120 }}>
                    <span className="thicon"><IconCard /></span>결제유형
                  </th>
                  <th style={{ width: 140 }}>
                    <span className="thicon"><IconUser /></span>결제자
                  </th>
                  <th style={{ width: 160 }}>
                    <span className="thicon"><IconTag /></span>사용내역
                  </th>
                  <th style={{ width: 160 }}>
                    <span className="thicon"><IconWon /></span>금액
                  </th>
                  <th><span className="thicon"><IconNote /></span>내용</th>
                  <th style={{ width: 200 }}><span className="thicon"><IconPencil /></span>비고</th>
                  <th style={{ width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {current.map((r) => (
                  <tr
                    key={r.id}
                    ref={(el) => el && (rowRefs.current.set(r.id, el))}
                    className={highlightId === r.id ? "row--highlight" : ""}
                  >
                    {editId === r.id ? (
                      <>
                        <td>
                          <div className="inputwrap datechip">
                            <IconCalendar className="inputicon" />
                            <input
                              type="date"
                              value={editDraft.date}
                              onChange={(e) => setEditDraft((v) => ({ ...v, date: e.target.value }))}
                              onClick={(e) => openPicker(e.currentTarget)}
                              className="fancy-picker-alt"
                            />
                          </div>
                        </td>
                        <td>
                          <div className="inputwrap no-select-padding">
                            <CustomSelect
                              value={editDraft.payType}
                              onChange={(v) => setEditDraft((x) => ({ ...x, payType: v }))}
                              options={["카드", "현금"]}
                              renderIcon={IconCard}
                            />
                          </div>
                        </td>
                        <td>
                          <div className="inputwrap no-select-padding">
                            <CustomSelect
                              value={editDraft.payer}
                              onChange={(v) => setEditDraft((x) => ({ ...x, payer: v }))}
                              options={["최슬기", "김성은", "이승준", "이한솔", "이세구"]}
                              renderIcon={IconUser}
                            />
                          </div>
                        </td>
                        <td>
                          <div className="inputwrap no-select-padding">
                            <CustomSelect
                              value={editDraft.category}
                              onChange={(v) => setEditDraft((x) => ({ ...x, category: v }))}
                              options={["식대","자재비","사무실","주유비"]}
                              renderIcon={IconTag}
                            />
                          </div>
                        </td>
                        <td className="num">
                          <div className="inputwrap">
                            <IconWon className="inputicon" />
                            <input
                              className="input-center"
                              value={String(editDraft.amount ?? "").replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                              onChange={(e) => setEditDraft((x) => ({ ...x, amount: e.target.value.replace(/[^0-9]/g, "") }))}
                            />
                          </div>
                        </td>
                        <td className="col-desc">
                          <div className="inputwrap">
                            <IconNote className="inputicon" />
                            <input value={editDraft.desc || ""} onChange={(e) => setEditDraft((v) => ({ ...v, desc: e.target.value }))} />
                          </div>
                        </td>
                        <td className="col-memo" style={{ width: 200 }}>
                          <div className="inputwrap">
                            <IconPencil className="inputicon" />
                            <input value={editDraft.memo || ""} onChange={(e) => setEditDraft((v) => ({ ...v, memo: e.target.value }))} />
                          </div>
                        </td>
                        <td className="actions">
                          <button className="btn edit" onClick={commitEdit}>저장</button>
                          <button className="btn ghost" onClick={cancelEdit}>취소</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{r.date}</td>
                        <td>{r.payType}</td>
                        <td>{r.payer}</td>
                        <td>{r.category}</td>
                        <td className="num">{fmtWon(r.amount)}</td>
                        <td className="col-desc muted">{r.desc}</td>
                        <td className="col-memo muted" style={{ width: 200 }}>{r.memo}</td>
                        <td className="actions">
                          <button className="btn edit" onClick={() => beginEdit(r)}>수정</button>
                          <button className="btn ghost" onClick={() => removeRow(r.id)}>삭제</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {!current.length && (
                  <tr><td colSpan={8} className="empty">데이터가 없습니다</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="cemodal__pager">
            <button className="btn ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>&lt; 이전</button>
            <div className="pageinfo">{page} / {pageCount}</div>
            <button className="btn ghost" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>다음 &gt;</button>
          </div>
        </div>

        {/* 삭제 확인 모달 */}
        {isConfirmOpen && (
          <>
            <div className="cemodal__confirm-backdrop" onClick={handleCancelDelete} />
            <div className="cemodal__confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
              <h3 id="confirm-title" className="cemodal__confirm-title">
                <IconAlert style={{ color: '#E53E3E', marginRight: '10px', verticalAlign: 'middle' }} />
                삭제 확인
              </h3>
              <p className="cemodal__confirm-message">정말 이 항목을 삭제하시겠습니까?<br />삭제된 데이터는 복구할 수 없습니다.</p>
              <div className="cemodal__confirm-actions">
                <button className="btn danger" onClick={handleConfirmDelete}>삭제</button>
                <button className="btn ghost" onClick={handleCancelDelete}>취소</button>
              </div>
            </div>
          </>
        )}

        {/* 통계/차트 모달 */}
        {showStats && <StatsModal rows={yearRows} onClose={()=>setShowStats(false)} />}
        {showCharts && <ChartsModal rows={yearRows} onClose={()=>setShowCharts(false)} />}
      </div>
    </>
  );
}
