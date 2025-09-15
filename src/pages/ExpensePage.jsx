// src/pages/ExpensePage.jsx
import React, {
  useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle,
} from "react";
import "./ExpensePage.css";
import { db } from "../firebase";
import {
  collection, getDocs, addDoc, serverTimestamp, query, where, limit,
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

/* ========== 커스텀 달력 (화려/깔끔) ========== */
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
  const update = (idx, key, val) => {
    setRows((prev)=>{
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: key==="amount" ? fmtComma(val) : val };
      return next;
    });
  };
  const add = ()=> setRows((prev)=> [...prev, { type:"", desc:"", bank:"", accountNo:"", amount:"", note:"" }]);
  useEffect(()=>{ if(rows.length===0) add(); },[]);

  // Enter 이동용: data-row / data-col 사용
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
      <div className="hold-table-wrap">
        <div className="hold-viewport">
          <table className="hold-table">
            <thead>
              <tr>
                <th style={{width:100}}>구분</th>{/* ↓ 조금 줄임 */}
                <th style={{width:260}}>내용</th>
                <th style={{width:100}}>은행</th>{/* ↓ 조금 줄임 */}
                <th style={{width:180}}>계좌번호</th>
                <th style={{width:150}}>금액</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i)=>(
                <tr key={i}>
                  <td>
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
                      onKeyDown={(e)=>{ if(e.key==="Enter"){ /* 행 마지막: 다음 행 첫 입력으로 */ const nxt = document.querySelector(`input[data-row="${i+1}"][data-col="0"]`); if(nxt) nxt.focus(); } }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="hold-actions">
        <button className="xp-add-rows" onClick={()=>setRows((p)=>[...p, { type:"", desc:"", bank:"", accountNo:"", amount:"", note:"" }])}>+ 행 추가</button>
      </div>
    </div>
  );
}

/** ====== 메인 컴포넌트 ====== */
export default function ExpensePage() {
  const [date, setDate] = useState(todayYMD());
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);

  const [rows, setRows] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.date) return Array.isArray(parsed.rows) && parsed.rows.length
          ? parsed.rows
          : Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i));
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

  const updateRow = (idx, patch) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[idx], ...patch };
      if (patch.mainId !== undefined) {
        row.subName = "";
        row.mainName = mainCats.find((m) => m.id === patch.mainId)?.name || "";
      }
      next[idx] = row;
      try { localStorage.setItem(LS_KEY, JSON.stringify({ date, rows: next })); } catch {}
      return next;
    });
  };

  const addRows = (n = 10) => {
    setRows((prev) => {
      const start = prev.length;
      const extra = Array.from({ length: n }, (_, i) => makeEmptyRow(start + i));
      const next = [...prev, ...extra];
      try { localStorage.setItem(LS_KEY, JSON.stringify({ date, rows: next })); } catch {}
      return next;
    });
  };

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ date, rows })); } catch {}
  }, [date]);

  const saveToFirestore = async (theDate, theRows) => {
    const cleaned = (theRows || [])
      .map((r) => ({ ...r, amount: toNumber(r.amount) }))
      .filter((r) =>
        r.mainId || r.subName || r.desc || r.amount || r.inAccount || r.outMethod || r.paid || r.note
      );
    if (cleaned.length === 0) return false;

    await addDoc(collection(db, "expenses"), {
      date: theDate,
      rows: cleaned.map((r, i) => ({
        no: i + 1,
        mainId: r.mainId,
        mainName: r.mainName,
        subName: r.subName,
        desc: r.desc,
        amount: toNumber(r.amount),
        inAccount: r.inAccount,
        outMethod: r.outMethod,
        paid: r.paid || "",
        note: r.note,
      })),
      total: cleaned.reduce((acc, r)=>acc + toNumber(r.amount), 0),
      createdAt: serverTimestamp(),
    });
    return true;
  };

  const onSave = async () => {
    try {
      const changed = await saveToFirestore(date, rows);
      if (!changed) { alert("저장할 내용이 없습니다."); return; }

      alert("저장되었습니다.");
      try { localStorage.removeItem(LS_KEY); } catch {}

      const init = Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i));
      setRows(init);
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  /** 🔧 인덱스 없이 동작하도록 수정: where(date)==target + limit 후 클라이언트 정렬 */
  const performLoadForDate = async (targetYMD) => {
    try {
      if (hasAnyContent(rows)) {
        await saveToFirestore(date, rows);
      }

      const qs = await getDocs(
        query(
          collection(db, "expenses"),
          where("date", "==", targetYMD),
          limit(50)
        )
      );

      let padded = Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i));
      if (!qs.empty) {
        const docs = qs.docs.map(d => ({ id: d.id, ...(d.data()||{}) }));
        // createdAt 내림차순으로 클라이언트 정렬
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
      }

      setDate(targetYMD);
      setRows(padded);
      try { localStorage.setItem(LS_KEY, JSON.stringify({ date: targetYMD, rows: padded })); } catch {}
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

  const saveHoldToLocal = () => {
    try {
      localStorage.setItem(LS_HOLD_KEY, JSON.stringify(holdRows));
      alert("출금보류 목록이 저장되었습니다.");
      setHoldOpen(false);
    } catch {
      alert("출금보류 저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="xp-page">
      {/* 상단 바 */}
      <div className="xp-top slim fancy">
        <div className="xp-actions">
          <button className="xp-btn xp-load small" onClick={()=>setLoadModalOpen(true)} title="불러오기">불러오기</button>
          <button className="xp-btn xp-save small" onClick={onSave} title="저장">저장</button>
          <button className="xp-btn xp-hold small" onClick={()=>setHoldOpen(true)} title="출금보류">출금보류</button>
        </div>

        <div className="xp-side fancy-panel narrow" onClick={()=>document.activeElement?.blur()}>
          <div className="xp-side-row xp-side-sum">
            <div className="xp-side-label">합계</div>
            <div className="xp-side-krw">₩</div>
            <div className="xp-side-val">{fmtComma(total) || "-"}</div>
          </div>

          {/* 지출일자: 날짜 왼쪽, 요일 오른쪽으로 분리 */}
          <div
            className="xp-side-row xp-side-date"
            onClick={() => setDateModalOpen(true)}
            role="button"
            title="날짜 선택"
          >
            <div className="xp-side-label">지출일자</div>

            {/* 시각적으로 보이는 날짜 박스 (왼쪽 정렬) */}
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

              {/* 요일 뱃지: 우측에 별도 배치 */}
              <span className="xp-weekday">{getWeekdayLabel(date)}</span>
            </div>
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
        onPick={(ymd)=>{ setDate(ymd); try { localStorage.setItem(LS_KEY, JSON.stringify({ date: ymd, rows })); } catch {} }}
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
        <div className="hold-footer">
          <button className="xp-btn xp-save small" onClick={saveHoldToLocal}>저장</button>
          <button className="xp-add-rows" onClick={()=>setHoldOpen(false)}>닫기</button>
        </div>
      </Modal>
    </div>
  );
}

/** ====== Row 컴포넌트 ====== */
function RowEditor({ idx, row, mains, payMethods, vendors, onChange, registerOpeners, openNextRowMain }) {
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
      <td className="xp-td-no">{row.no}</td>

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
