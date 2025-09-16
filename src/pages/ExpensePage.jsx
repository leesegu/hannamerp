// src/pages/ExpensePage.jsx
import React, {
  useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle,
} from "react";
import "./ExpensePage.css";
import { db } from "../firebase";
import {
  collection, getDocs, addDoc, serverTimestamp, query, where, limit, doc, updateDoc,
} from "firebase/firestore";

/** ====== 상수 ====== */
const INITIAL_ROWS = 20;
const LS_KEY = "ExpensePage:WIP:v1";
const LS_HOLD_KEY = "ExpensePage:HOLD:v1";

/** 숫자 유틸 */
const toNumber = (v) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmtComma = (v) => {
  const n = toNumber(v);
  return n ? n.toLocaleString() : "";
};
const todayYMD = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};
const weekdayKo = ["일", "월", "화", "수", "목", "금", "토"];
const getWeekdayLabel = (ymd) => {
  const d = new Date(ymd);
  if (isNaN(d)) return "";
  return `(${weekdayKo[d.getDay()]})`;
};

/** 행 기본값 */
const makeEmptyRow = (i) => ({
  no: i + 1,
  mainId: "",
  mainName: "",
  subName: "",
  desc: "",
  amount: "",
  inAccount: "",
  outMethod: "",
  paid: "",
  note: "",
});

const hasAnyContent = (rows) =>
  rows.some((r) => r.mainId || r.subName || r.desc || toNumber(r.amount) || r.inAccount || r.outMethod || r.paid || r.note);

/* ========== 공통 모달 래퍼 ========== */
function Modal({ open, onClose, title, children, width = 720, showCloseX = true }) {
  if (!open) return null;
  return (
    <div className="xp-modal-backdrop" onMouseDown={(e)=>{ if (e.target.classList.contains("xp-modal-backdrop")) onClose?.(); }}>
      <div className="xp-modal" style={{ width }}>
        <div className="xp-modal-head">
          <div className="xp-modal-title">{title}</div>
          {showCloseX && (
            <button className="xp-modal-close" onClick={onClose} title="닫기">
              <i className="ri-close-line" />
            </button>
          )}
        </div>
        <div className="xp-modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ========== 커스텀 달력 ========== */
function ymdToDate(ymd) {
  const [y,m,d] = (ymd||"").split("-").map((x)=>parseInt(x,10));
  if(!y||!m||!d) return new Date();
  return new Date(y, m-1, d);
}
function toYMD(d) {
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function getMonthMatrix(year, month){
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const prevDays = startWeekday;
  const totalCells = Math.ceil((prevDays + daysInMonth)/7)*7;
  const cells = [];
  for(let i=0; i<totalCells; i++){
    const dayNum = i - prevDays + 1;
    const date = new Date(year, month, dayNum);
    const inMonth = dayNum>=1 && dayNum<=daysInMonth;
    cells.push({ date, inMonth });
  }
  return cells;
}
function CalendarModal({ open, defaultDate, onPick, onClose, titleText = "날짜 선택" }) {
  const base = defaultDate ? ymdToDate(defaultDate) : new Date();
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const cells = useMemo(()=>getMonthMatrix(view.y, view.m), [view]);
  const months = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  const go = (delta)=> setView((v)=> {
    const m = v.m + delta;
    const y = v.y + Math.floor(m/12);
    const nm = (m%12+12)%12;
    return { y, m: nm };
  });

  return (
    <Modal open={open} onClose={onClose} title={titleText} width={380}>
      <div className="cal-wrap">
        <div className="cal-top">
          <button className="cal-nav" onClick={()=>go(-1)} title="이전 달"><i className="ri-arrow-left-s-line"/></button>
          <div className="cal-title">
            <div className="cal-month">{months[view.m]}</div>
            <div className="cal-year">{view.y}</div>
          </div>
          <button className="cal-nav" onClick={()=>go(1)} title="다음 달"><i className="ri-arrow-right-s-line"/></button>
        </div>
        <div className="cal-head">
          {["일","월","화","수","목","금","토"].map((w)=><div key={w} className="cal-head-cell">{w}</div>)}
        </div>
        <div className="cal-grid">
          {cells.map((c, idx)=>{
            const isToday = toYMD(c.date) === toYMD(new Date());
            return (
              <button
                key={idx}
                className={`cal-cell ${c.inMonth ? "" : "muted"} ${isToday ? "today": ""}`}
                onClick={()=>{ onPick?.(toYMD(c.date)); onClose?.(); }}
                title={toYMD(c.date)}
              >
                <span className="cal-daynum">{c.date.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/** ====== 간단 드롭다운 ====== */
const SimpleCombo = forwardRef(function SimpleCombo(
  { value, onPick, items = [], placeholder = "- 선택 -", render = (x) => x.name ?? x, getKey = (x) => x.id ?? x, getValue = (x) => x.name ?? x },
  ref
) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const btnRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
    focus: () => {
      setFocus(true);
      setOpen(true);
      setTimeout(() => setFocus(false), 0);
      btnRef.current?.focus();
    },
  }));

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (it) => {
    const val = getValue(it);
    onPick?.(it, val);
    setOpen(false);
  };

  const label = value || placeholder;

  return (
    <div className="scombo" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`xp-input scombo-btn ${!value ? "scombo-placeholder" : ""}`}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => focus && setOpen(true)}
        title={label}
      >
        <span className="scombo-text">{label}</span>
        <i className="ri-arrow-down-s-line scombo-caret" />
      </button>
      {open && (
        <div className="scombo-panel">
          {items.length === 0 && <div className="scombo-empty">항목 없음</div>}
          {items.map((it) => (
            <button key={getKey(it)} type="button" className="scombo-item" onClick={() => pick(it)}>
              {render(it)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

/** ====== 검색형 콤보(입금 계좌번호) ====== */
const AccountCombo = forwardRef(function AccountCombo({ value, onChange, vendors, placeholder, onComplete }, ref) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || "");
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => setQ(value || ""), [value]);

  const list = useMemo(() => {
    const needle = (q || "").trim().toLowerCase();
    const base = vendors || [];
    if (!needle) return base.slice(0, 10);
    return base
      .filter((v) => {
        return (
          String(v.vendor).toLowerCase().includes(needle) ||
          String(v.accountName).toLowerCase().includes(needle) ||
          String(v.accountNo).toLowerCase().includes(needle) ||
          String(v.bank).toLowerCase().includes(needle)
        );
      })
      .slice(0, 12);
  }, [q, vendors]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (hit) => {
    const label = [hit.bank, hit.accountNo, hit.accountName].filter(Boolean).join(" ");
    onChange(label, hit);
    setOpen(false);
    onComplete?.();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      if (list.length > 0) {
        pick(list[0]);
      } else {
        onChange(q, null);
        setOpen(false);
        onComplete?.();
      }
    }
  };

  return (
    <div className="combo" ref={wrapRef}>
      <input
        ref={inputRef}
        className="xp-input combo-input"
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="combo-panel">
          {list.length === 0 && <div className="combo-empty">검색 결과 없음</div>}
          {list.map((hit) => (
            <button
              key={hit.id}
              type="button"
              className="combo-item"
              onClick={() => pick(hit)}
              title={`${hit.vendor || "-"}`}
            >
              <div className="combo-line1">{hit.vendor || "-"}</div>
              <div className="combo-line2">
                <span className="combo-bank">{hit.bank || "-"}</span>
                <span className="combo-acc">{hit.accountNo || "-"}</span>
                <span className="combo-holder">{hit.accountName || "-"}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

/** ====== 출금확인 콤보 ====== */
const PaidCombo = forwardRef(function PaidCombo({ value, onPick }, ref) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const items = ["출금대기", "출금완료"];

  const btnRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
    focus: () => btnRef.current?.focus(),
  }));

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const label = value || "";

  return (
    <div className="scombo" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`xp-input scombo-btn ${!value ? "scombo-placeholder" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={label}
      >
        <span className="scombo-text">{label}</span>
        <i className="ri-arrow-down-s-line scombo-caret" />
      </button>
      {open && (
        <div className="scombo-panel">
          {items.map((it) => (
            <button
              key={it}
              type="button"
              className="scombo-item"
              onClick={() => {
                onPick(it);
                setOpen(false);
              }}
            >
              {it}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

/* ========== 출금보류 모달 컨텐츠 ========== */
function HoldTable({ rows, setRows }) {
  const [delMode, setDelMode] = useState(false);

  const update = (idx, key, val) => {
    setRows((prev)=>{
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: key==="amount" ? fmtComma(val) : val };
      return next;
    });
  };
  const add = ()=> setRows((prev)=> [...prev, { type:"", desc:"", bank:"", accountNo:"", amount:"", note:"" }]);
  const clear = (idx)=> setRows((prev)=> {
    const next = [...prev];
    next[idx] = { type:"", desc:"", bank:"", accountNo:"", amount:"", note:"" };
    return next;
  });

  useEffect(()=>{ if(rows.length===0) add(); },[]);

  // Enter 이동용
  const onEnterNext = (e) => {
    if (e.key !== "Enter") return;
    const r = Number(e.currentTarget.getAttribute("data-row"));
    const c = Number(e.currentTarget.getAttribute("data-col"));
    const nextCol = Math.min(c + 1, 5);
    const nextSel = document.querySelector(`input[data-row="${r}"][data-col="${nextCol}"]`);
    if (nextSel) nextSel.focus();
  };

  return (
    <div className="hold-wrap">
      {/* 상단 툴바: 우측 정렬(행추가, 삭제 토글) */}
      <div className="hold-toolbar">
        <button className="hold-btn add" onClick={add} title="행 추가">
          <i className="ri-add-line" /> 행추가
        </button>
        <button className={`hold-btn delete ${delMode ? "on": ""}`} onClick={()=>setDelMode(v=>!v)} title="삭제 모드">
          <i className="ri-delete-bin-6-line" /> {delMode ? "삭제모드 해제" : "삭제"}
        </button>
      </div>

      <div className="hold-table-wrap">
        <div className="hold-viewport">
          <table className="hold-table">
            <thead>
              <tr>
                <th style={{width:100}}>구분</th>
                <th style={{width:260}}>내용</th>
                <th style={{width:100}}>은행</th>
                <th style={{width:180}}>계좌번호</th>
                <th style={{width:150}}>금액</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i)=>(
                <tr key={i}>
                  <td style={{position:"relative"}}>
                    {delMode && (
                      <button
                        type="button"
                        className="hold-del-row-btn"
                        onClick={()=>clear(i)}
                        title="이 줄 내용 삭제"
                      >
                        삭제
                      </button>
                    )}
                    <input className="xp-input"
                      data-row={i} data-col={0}
                      value={r.type||""}
                      onChange={(e)=>update(i,"type",e.target.value)}
                      onKeyDown={onEnterNext}
                    />
                  </td>
                  <td>
                    <input className="xp-input"
                      data-row={i} data-col={1}
                      value={r.desc||""}
                      onChange={(e)=>update(i,"desc",e.target.value)}
                      onKeyDown={onEnterNext}
                    />
                  </td>
                  <td>
                    <input className="xp-input"
                      data-row={i} data-col={2}
                      value={r.bank||""}
                      onChange={(e)=>update(i,"bank",e.target.value)}
                      onKeyDown={onEnterNext}
                    />
                  </td>
                  <td>
                    <input className="xp-input"
                      data-row={i} data-col={3}
                      value={r.accountNo||""}
                      onChange={(e)=>update(i,"accountNo",e.target.value)}
                      onKeyDown={onEnterNext}
                    />
                  </td>
                  <td>
                    <input className="xp-input xp-amt"
                      data-row={i} data-col={4}
                      value={r.amount||""}
                      onChange={(e)=>update(i,"amount",e.target.value)}
                      onKeyDown={onEnterNext}
                    />
                  </td>
                  <td>
                    <input className="xp-input"
                      data-row={i} data-col={5}
                      value={r.note||""}
                      onChange={(e)=>update(i,"note",e.target.value)}
                      onKeyDown={(e)=>{ if(e.key==="Enter"){ const nxt = document.querySelector(`input[data-row="${i+1}"][data-col="0"]`); if(nxt) nxt.focus(); } }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 하단 버튼: 우측 하단 정렬(저장, 닫기) */}
      <div className="hold-footer">
        <button className="hold-btn save" onClick={()=> {
          try { localStorage.setItem(LS_HOLD_KEY, JSON.stringify(rows)); alert("출금보류 목록이 저장되었습니다."); }
          catch { alert("출금보류 저장 중 오류가 발생했습니다."); }
        }}>
          <i className="ri-save-3-line" /> 저장
        </button>
        <button className="hold-btn close" onClick={()=>window.dispatchEvent(new CustomEvent("closeHoldModal"))}>
          닫기
        </button>
      </div>
    </div>
  );
}

/** 🔧 저장 보조: 정규화/서명/검증 */
const normalizeRow = (r) => ({
  mainId: r.mainId || "",
  subName: (r.subName || "").trim(),
  desc: (r.desc || "").trim(),
  amount: toNumber(r.amount || 0),
  inAccount: (r.inAccount || "").trim(),
  outMethod: r.outMethod || "",
  paid: r.paid || "",
  note: (r.note || "").trim(),
});
const rowSig = (r) =>
  [r.mainId, r.subName, r.desc, r.amount, r.inAccount, r.outMethod, r.paid, r.note].join("|");
const isValidForSave = (r) => !!(r.mainId && r.subName && r.outMethod);

/** ====== 메인 컴포넌트 ====== */
export default function ExpensePage() {
  const [date, setDate] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.date) return parsed.date; // 불러온 날짜 유지
      }
    } catch {}
    return todayYMD();
  });
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);

  const [rows, setRows] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.rows && Array.isArray(parsed.rows) && parsed.rows.length) return parsed.rows;
      }
    } catch {}
    return Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i));
  });

  const [mainCats, setMainCats] = useState([]);
  const [payMethods, setPayMethods] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [holdOpen, setHoldOpen] = useState(false);
  const [holdRows, setHoldRows] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_HOLD_KEY);
      if (raw) return JSON.parse(raw) || [];
    } catch {}
    return [];
  });

  const [deleteMode, setDeleteMode] = useState(false); // 삭제 토글
  const [loadedFromRemote, setLoadedFromRemote] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return !!parsed?.loadedFromRemote;
      }
    } catch {}
    return false;
  });
  const [loadedBaseRows, setLoadedBaseRows] = useState([]); // 🔸 불러온 원본(정규화) 스냅샷

  const openers = useRef({});
  const registerOpeners = (i, obj) => { openers.current[i] = obj; };

  useEffect(() => {
    (async () => {
      try {
        const qsMain = await getDocs(collection(db, "acct_expense_main"));
        const mains = qsMain.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .sort((a,b)=> (a.order??0)-(b.order??0))
          .map((x)=>({ id:x.id, name:x.name || x.title || "", subs: Array.isArray(x.subs)?x.subs:[] }));
        setMainCats(mains);
      } catch { setMainCats([]); }

      try {
        const qsPay = await getDocs(collection(db, "acct_payment_methods"));
        const pays = qsPay.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .sort((a,b)=> (a.order??0)-(b.order??0))
          .map((x)=>({ id:x.id, name:x.name || x.title || "" }));
        setPayMethods(pays);
      } catch { setPayMethods([]); }

      try {
        const qsVen = await getDocs(collection(db, "vendorsAll"));
        const v = qsVen.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })).map((x) => ({
          id: x.id,
          vendor: String(x.vendor || ""),
          bank: String(x.bank || ""),
          accountName: String(x.accountName || ""),
          accountNo: String(x.accountNo || ""),
        }));
        setVendors(v);
      } catch { setVendors([]); }
    })();
  }, []);

  const total = useMemo(() => rows.reduce((acc, r) => acc + toNumber(r.amount), 0), [rows]);

  const persistLocal = (nextDate, nextRows, wasRemote = loadedFromRemote) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ date: nextDate, rows: nextRows, loadedFromRemote: !!wasRemote })); } catch {}
  };

  const updateRow = (idx, patch) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[idx], ...patch };
      if (patch.mainId !== undefined) {
        row.subName = "";
        row.mainName = mainCats.find((m) => m.id === patch.mainId)?.name || "";
      }
      next[idx] = row;
      persistLocal(date, next);
      return next;
    });
  };

  const clearRow = (idx) => {
    setRows((prev) => {
      const next = [...prev];
      const baseNo = next[idx]?.no ?? idx+1;
      next[idx] = { ...makeEmptyRow(baseNo - 1), no: baseNo };
      persistLocal(date, next);
      return next;
    });
  };

  const addRows = (n = 10) => {
    setRows((prev) => {
      const start = prev.length;
      const extra = Array.from({ length: n }, (_, i) => makeEmptyRow(start + i));
      const next = [...prev, ...extra];
      persistLocal(date, next);
      return next;
    });
  };

  useEffect(() => { persistLocal(date, rows); }, [date]); // 날짜 변경 시에도 저장

  /** 🔄 새로고침(현재 화면 내용만 초기화) */
  const onRefresh = () => {
    const ok = window.confirm("새로고침하면 현재 지출 입력 내용이 모두 삭제됩니다. 계속할까요?");
    if (!ok) return;
    const init = Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i));
    setRows(init);
    // 날짜는 유지(불러온 날짜든 오늘이든)
    persistLocal(date, init, loadedFromRemote);
  };

  /** 💾 저장: 차등 저장(불러온 상태면 추가/삭제만 반영, 그 외엔 기존 동작 유지) */
  const saveToFirestore = async (theDate, theRows) => {
    // 1) 현재 내용 정리 + 유효성(대분류/소분류/출금계좌 필수)
    const nowFull = (theRows || [])
      .map((r) => ({ ...r, amount: toNumber(r.amount) }))
      .filter((r) => r.mainId || r.subName || r.desc || r.amount || r.inAccount || r.outMethod || r.paid || r.note);

    const nowValid = nowFull.filter((r) => isValidForSave(normalizeRow(r)));
    if (nowValid.length === 0) return false;

    const nowNorm = nowValid.map(normalizeRow);
    const nowSigs = new Set(nowNorm.map(rowSig));

    // 2) 해당 날짜 문서 조회
    const qs = await getDocs(
      query(collection(db, "expenses"), where("date", "==", theDate), limit(50))
    );

    // 최신 1개 선택(클라이언트 정렬)
    let latest = null;
    if (!qs.empty) {
      const docs = qs.docs.map(d => ({ id: d.id, ...(d.data()||{}) }));
      docs.sort((a,b)=> {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      latest = docs[0];
    }

    if (loadedFromRemote && loadedBaseRows.length && latest) {
      // 🔸 불러온 상태: 추가/삭제만 반영
      const baseSigs = new Set(loadedBaseRows.map(rowSig));

      const addedIndices = nowNorm
        .map((n, i) => ({ i, sig: rowSig(n) }))
        .filter(({ sig }) => !baseSigs.has(sig))
        .map(({ i }) => i);

      const deletedSigs = [...baseSigs].filter((sig) => !nowSigs.has(sig));
      const deletedSigSet = new Set(deletedSigs);

      const existingRows = Array.isArray(latest.rows) ? latest.rows : [];
      // 기존 문서에서 '삭제' 대상 제거(정규화 후 서명 비교)
      const pruned = existingRows.filter((er) => {
        const sig = rowSig(normalizeRow(er));
        return !deletedSigSet.has(sig);
      });

      // '추가' 대상만 붙이기(현재 화면의 full 오브젝트 사용)
      const addedRows = addedIndices.map((idx) => nowValid[idx]);

      const merged = [...pruned, ...addedRows];
      const renumbered = merged.map((r, i) => ({ ...r, no: i + 1 }));
      const newTotal = renumbered.reduce((acc, r) => acc + toNumber(r.amount), 0);

      await updateDoc(doc(db, "expenses", latest.id), {
        rows: renumbered,
        total: newTotal,
        updatedAt: serverTimestamp(),
      });
      return true;
    } else {
      // 🔸 일반 모드(불러오지 않은 상태): 기존 문서가 있으면 '추가' 병합 유지
      if (latest) {
        const existingRows = Array.isArray(latest.rows) ? latest.rows : [];
        const merged = [...existingRows, ...nowValid];
        const renumbered = merged.map((r, i) => ({ ...r, no: i + 1 }));
        const newTotal = renumbered.reduce((acc, r)=> acc + toNumber(r.amount), 0);
        await updateDoc(doc(db, "expenses", latest.id), {
          rows: renumbered,
          total: newTotal,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "expenses"), {
          date: theDate,
          rows: nowValid.map((r, i) => ({ ...r, no: i + 1 })),
          total: nowValid.reduce((acc, r)=>acc + toNumber(r.amount), 0),
          createdAt: serverTimestamp(),
        });
      }
      return true;
    }
  };

  const onSave = async () => {
    try {
      const changed = await saveToFirestore(date, rows);
      if (!changed) { alert("저장할 내용이 없습니다. (대분류/소분류/출금계좌 필수)"); return; }

      alert("저장되었습니다.");
      // 저장 후 화면 초기화(날짜 유지)
      const init = Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i));
      setRows(init);
      persistLocal(date, init, loadedFromRemote);
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  /** 📥 불러오기 */
  const performLoadForDate = async (targetYMD) => {
    try {
      if (hasAnyContent(rows)) {
        // 자동 임시 저장(같은 날짜로 저장되는게 싫다면 주석)
        await saveToFirestore(date, rows);
      }

      const qs = await getDocs(
        query(collection(db, "expenses"), where("date", "==", targetYMD), limit(50))
      );

      let padded = Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i));
      let baseNorm = [];
      if (!qs.empty) {
        const docs = qs.docs.map(d => ({ id: d.id, ...(d.data()||{}) }));
        docs.sort((a,b)=>{
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        const data = docs[0];
        const loadedRows = Array.isArray(data.rows) ? data.rows : [];
        const normalized = loadedRows.map((r, i) => ({
          ...makeEmptyRow(i),
          ...r,
          no: i + 1,
          amount: r.amount ? fmtComma(r.amount) : "",
          paid: r.paid || "",
        }));
        const pad = Math.max(0, INITIAL_ROWS - normalized.length);
        padded = pad > 0
          ? [...normalized, ...Array.from({ length: pad }, (_, k) => makeEmptyRow(normalized.length + k))]
          : normalized;

        // 🔸 불러온 원본을 정규화하여 스냅샷 저장(차등 저장용)
        baseNorm = loadedRows.map((r) => normalizeRow(r)).filter(isValidForSave);
      } else {
        baseNorm = []; // 문서 없으면 기준 없음
      }

      setDate(targetYMD);
      setRows(padded);
      setLoadedFromRemote(true);
      setLoadedBaseRows(baseNorm);
      persistLocal(targetYMD, padded, true);
      alert("불러오기가 완료되었습니다.");
    } catch (e) {
      console.error(e);
      alert("불러오기 중 오류가 발생했습니다. (네트워크/권한 확인)");
    }
  };

  const openNextRowMain = (i) => {
    const next = openers.current[i + 1];
    if (next?.openMain) next.openMain();
  };

  // 출금보류 모달 닫기 이벤트 브릿지
  useEffect(() => {
    const onClose = () => setHoldOpen(false);
    window.addEventListener("closeHoldModal", onClose);
    return () => window.removeEventListener("closeHoldModal", onClose);
  }, []);

  return (
    <div className="xp-page">
      {/* 상단 바 */}
      <div className="xp-top slim fancy">
        <div className="xp-actions">
          {/* ▶ 버튼 순서: 새로고침, 불러오기, 출금보류, 저장, 삭제 */}
          <button className="xp-btn xp-refresh small" onClick={onRefresh} title="새로고침">
            <i className="ri-refresh-line" /> 새로고침
          </button>
          <button className="xp-btn xp-load small" onClick={()=>setLoadModalOpen(true)} title="불러오기">
            <i className="ri-download-2-line" /> 불러오기
          </button>
          <button className="xp-btn xp-hold small" onClick={()=>setHoldOpen(true)} title="출금보류">
            <i className="ri-pause-circle-line" /> 출금보류
          </button>
          <button className="xp-btn xp-save small" onClick={onSave} title="저장">
            <i className="ri-save-3-line" /> 저장
          </button>
          <button
            className={`xp-btn xp-delete small ${deleteMode ? "on" : ""}`}
            onClick={()=>setDeleteMode((v)=>!v)}
            title="삭제 모드"
          >
            <i className="ri-delete-bin-6-line" /> {deleteMode ? "삭제모드 해제" : "삭제"}
          </button>
        </div>

        {/* 우측 패널: 가로 배치(지출일자 → 합계) */}
        <div className="xp-side fancy-panel narrow" onClick={()=>document.activeElement?.blur()}>
          {/* 지출일자 */}
          <div
            className="xp-side-row xp-side-date"
            onClick={() => setDateModalOpen(true)}
            role="button"
            title="날짜 선택"
          >
            <div className="xp-side-label">지출일자</div>
            <div className="xp-date-wrap">
              <div className="xp-date-display">
                <span className="xp-date-text">{date}</span>
                <button
                  className="xp-date-open"
                  onClick={(e)=>{ e.stopPropagation(); setDateModalOpen(true); }}
                  title="달력 열기"
                >
                  <i className="ri-calendar-2-line" />
                </button>
              </div>
              <span className="xp-weekday">{getWeekdayLabel(date)}</span>
            </div>
          </div>

          {/* 합계 */}
          <div className="xp-side-row xp-side-sum">
            <div className="xp-side-label">합계</div>
            <div className="xp-side-krw">₩</div>
            <div className="xp-side-val">{fmtComma(total) || "-"}</div>
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="xp-table-wrap scrollable">
        <table className="xp-table">
          <thead>
            <tr>
              <th style={{ width: 56 }}>번호</th>
              <th style={{ width: 140 }}>대분류</th>
              <th style={{ width: 160 }}>소분류</th>
              <th style={{ width: 320 }}>내용</th>
              <th style={{ width: 140 }}>금액</th>
              <th style={{ width: 260 }}>입금 계좌번호</th>
              <th style={{ width: 150 }}>출금계좌</th>
              <th style={{ width: 120 }}>출금확인</th>
              <th style={{ width: 240 }}>비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <RowEditor
                key={i}
                idx={i}
                row={r}
                mains={mainCats}
                payMethods={payMethods}
                vendors={vendors}
                onChange={(patch) => updateRow(i, patch)}
                registerOpeners={registerOpeners}
                openNextRowMain={() => openNextRowMain(i)}
                deleteMode={deleteMode}
                onDeleteRow={()=>clearRow(i)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="xp-bottom-actions">
        <button className="xp-add-rows" onClick={() => addRows(10)}>+ 10줄 더 추가</button>
      </div>

      {/* 모달들 */}
      <CalendarModal
        open={dateModalOpen}
        defaultDate={date}
        titleText="지출일자 날짜선택"
        onPick={(ymd)=>{ setDate(ymd); persistLocal(ymd, rows, loadedFromRemote); }}
        onClose={()=>setDateModalOpen(false)}
      />

      <CalendarModal
        open={loadModalOpen}
        defaultDate={date}
        titleText="불러오기 날짜선택"
        onPick={(ymd)=>performLoadForDate(ymd)}
        onClose={()=>setLoadModalOpen(false)}
      />

      <Modal open={holdOpen} onClose={()=>setHoldOpen(false)} title="출금보류" width={960} showCloseX={false}>
        <HoldTable rows={holdRows} setRows={setHoldRows} />
      </Modal>
    </div>
  );
}

/** ====== Row 컴포넌트 ====== */
function RowEditor({
  idx, row, mains, payMethods, vendors, onChange, registerOpeners, openNextRowMain,
  deleteMode, onDeleteRow,
}) {
  const mainRef = useRef(null);
  const subRef = useRef(null);
  const descRef = useRef(null);
  const amtRef = useRef(null);
  const inAccRef = useRef(null);
  const outRef = useRef(null);
  const paidRef = useRef(null);
  const noteRef = useRef(null);

  useEffect(() => {
    registerOpeners(idx, {
      openMain: () => mainRef.current?.focus(),
    });
  }, [idx, registerOpeners]);

  const subItems = useMemo(() => {
    const m = mains.find((x) => x.id === row.mainId);
    return (m?.subs || []).map((name, i) => ({ id: `${m?.id || "m"}-${i}`, name }));
  }, [mains, row.mainId]);

  const onAmountChange = (e) => {
    const raw = e.target.value;
    const num = toNumber(raw);
    const withComma = num ? num.toLocaleString() : "";
    onChange({ amount: withComma });
  };

  const isPaidDone = row.paid === "출금완료";

  return (
    <tr className={isPaidDone ? "xp-tr-paid" : ""}>
      <td className={`xp-td-no ${deleteMode ? "xp-td-del-on" : ""}`}>
        {deleteMode && (
          <button
            type="button"
            className="xp-del-row-btn"
            onClick={onDeleteRow}
            title="이 줄 내용 삭제"
          >
            삭제
          </button>
        )}
        {row.no}
      </td>

      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <SimpleCombo
          ref={mainRef}
          value={row.mainName}
          items={mains}
          onPick={(it) => {
            onChange({ mainId: it.id, mainName: it.name });
            setTimeout(() => subRef.current?.open(), 0);
          }}
          placeholder="- 선택 -"
        />
      </td>

      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <SimpleCombo
          ref={subRef}
          value={row.subName}
          items={subItems}
          onPick={(it) => {
            onChange({ subName: it.name });
            setTimeout(() => descRef.current?.focus(), 0);
          }}
          placeholder={row.mainId ? "- 선택 -" : "대분류 먼저 선택"}
        />
      </td>

      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <input
          ref={descRef}
          className="xp-input"
          value={row.desc}
          onChange={(e) => onChange({ desc: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") amtRef.current?.focus(); }}
        />
      </td>

      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <input
          ref={amtRef}
          className="xp-input xp-amt"
          inputMode="numeric"
          value={row.amount}
          onChange={onAmountChange}
          onKeyDown={(e) => { if (e.key === "Enter") { inAccRef.current?.focus(); inAccRef.current?.open(); } }}
        />
      </td>

      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <AccountCombo
          ref={inAccRef}
          value={row.inAccount}
          onChange={(v) => onChange({ inAccount: v })}
          vendors={vendors}
          placeholder="거래처/예금주/계좌번호 검색"
          onComplete={() => {
            outRef.current?.open?.();
            outRef.current?.focus?.();
          }}
        />
      </td>

      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <SimpleCombo
          ref={outRef}
          value={row.outMethod}
          items={payMethods}
          onPick={(it) => {
            onChange({ outMethod: it.name });
            setTimeout(() => { paidRef.current?.open(); }, 0);
          }}
          placeholder="- 선택 -"
        />
      </td>

      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <PaidCombo
          ref={paidRef}
          value={row.paid}
          onPick={(v) => {
            onChange({ paid: v || "" });
            if (v) setTimeout(() => noteRef.current?.focus(), 0);
          }}
        />
      </td>

      <td>
        <input
          ref={noteRef}
          className="xp-input"
          value={row.note}
          onChange={(e) => onChange({ note: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") openNextRowMain(); }}
        />
      </td>
    </tr>
  );
}
