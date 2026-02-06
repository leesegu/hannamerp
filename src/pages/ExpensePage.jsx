// src/pages/ExpensePage.jsx
import React, {
  useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle,
} from "react";
import "./ExpensePage.css";

import { db } from "../firebase";
import {
  collection,
  getDocs,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { getStorage, ref as sRef, uploadBytes, getBytes, listAll } from "firebase/storage";
/* ✅ 캡쳐용 */
import * as htmlToImage from "html-to-image";

/* ✅ [추가] 카드지출 팝업 */
import CardExpenseModal from "./CardExpenseModal";

/** ====== 상수/공통 ====== */
const INITIAL_ROWS = 20;
const LS_KEY = "ExpensePage:WIP:v1";
const LS_HOLD_KEY = "ExpensePage:HOLD:v1";

const EXPENSE_BASE = "acct_expense_json";
const monthPath = (monthKey) => `${EXPENSE_BASE}/${monthKey}.json`;
const storage = getStorage();

const s = (v) => String(v ?? "").trim();
const toNumber = (v) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmtComma = (v) => {
  const n = toNumber(v);
  return n ? n.toLocaleString() : "";
};
const pad2 = (n) => String(n).padStart(2, "0");
const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const weekdayKo = ["일","월","화","수","목","금","토"];
const getWeekdayLabel = (ymd) => {
  const d = new Date(ymd);
  if (isNaN(d)) return "";
  return `(${weekdayKo[d.getDay()]})`;
};
const ymdToMonthKey = (ymd) => s(ymd).slice(0, 7);
const ymdToDate = (ymd) => {
  const [y, m, d] = (ymd || "").split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
};
const toYMD = (d) => {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};
const absDaysBetween = (ymdA, ymdB) => {
  const a = ymdToDate(ymdA);
  const b = ymdToDate(ymdB);
  return Math.abs((a - b) / 86400000);
};

/** ====== Storage JSON 유틸 ====== */
async function readMonthJSON(monthKey) {
  const ref = sRef(storage, monthPath(monthKey));
  try {
    const bytes = await getBytes(ref);
    const text = new TextDecoder().decode(bytes);
    const obj = JSON.parse(text);
    const days = obj?.days && typeof obj.days === "object" ? obj.days : {};
    const meta = obj?.meta || {};
    return { meta, days };
  } catch (e) {
    const code = e?.code || "";
    const msg = String(e?.message || "");
    const notFound =
      code === "storage/object-not-found" ||
      msg.includes("object-not-found") ||
      msg.includes("No such object");
    if (notFound) return { meta: {}, days: {} };
    throw e;
  }
}
async function writeMonthJSON(monthKey, dataObj) {
  const ref = sRef(storage, monthPath(monthKey));
  const blob = new Blob([JSON.stringify(dataObj)], { type: "application/json" });
  await uploadBytes(ref, blob, { contentType: "application/json" });
}

/** ====== 테이블/행 유틸 ====== */
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
  rows.some(
    (r) =>
      r.mainId ||
      r.subName ||
      r.desc ||
      toNumber(r.amount) ||
      r.inAccount ||
      r.outMethod ||
      r.paid ||
      r.note
  );

const normalizeRow = (r) => ({
  mainId: r.mainId || "",
  mainName: s(r.mainName || ""),
  subName: s(r.subName || ""),
  desc: s(r.desc || ""),
  amount: toNumber(r.amount || 0),
  inAccount: s(r.inAccount || ""),
  outMethod: r.outMethod || "",
  paid: r.paid || "",
  note: s(r.note || ""),
});
const isValidForSave = (r) => !!(r.mainId || r.mainName) && !!r.subName && !!r.outMethod;

/** ====== 공통 모달 ====== */
function Modal({ open, onClose, title, children, width = 720, showCloseX = true, className = "", rightExtras = null }) {
  if (!open) return null;
  return (
    <div
      className="xp-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target.classList.contains("xp-modal-backdrop")) onClose?.();
      }}
    >
      <div className={`xp-modal ${className}`} style={{ width }}>
        <div className="xp-modal-head">
          <div className="xp-modal-title">{title}</div>
          <div className="xp-modal-head-right">
            {rightExtras}
            {showCloseX && (
              <button className="xp-modal-close" onClick={onClose} title="닫기">
                <i className="ri-close-line" />
              </button>
            )}
          </div>
        </div>
        <div className="xp-modal-body">{children}</div>
      </div>
    </div>
  );
}

/** ====== 커스텀 달력 ====== */
function getMonthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = startWeekday;
  const totalCells = Math.ceil((prevDays + daysInMonth) / 7) * 7;
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - prevDays + 1;
    const date = new Date(year, month, dayNum);
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
    cells.push({ date, inMonth });
  }
  return cells;
}
function CalendarModal({ open, defaultDate, onPick, onClose, titleText = "날짜 선택" }) {
  const base = defaultDate ? ymdToDate(defaultDate) : new Date();
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const cells = useMemo(() => getMonthMatrix(view.y, view.m), [view]);
  const months = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  const go = (delta) =>
    setView((v) => {
      const m = v.m + delta;
      const y = v.y + Math.floor(m / 12);
      const nm = ((m % 12) + 12) % 12;
      return { y, m: nm };
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titleText}
      width={380}
    >
      <div className="cal-wrap">
        <div className="cal-top">
          <button className="cal-nav" onClick={() => go(-1)} title="이전 달">
            <i className="ri-arrow-left-s-line" />
          </button>
          <div className="cal-title">
            <div className="cal-month">{months[view.m]}</div>
            <div className="cal-year">{view.y}</div>
          </div>
          <button className="cal-nav" onClick={() => go(1)} title="다음 달">
            <i className="ri-arrow-right-s-line" />
          </button>
        </div>
        <div className="cal-head">
          {["일","월","화","수","목","금","토"].map((w) => (
            <div key={w} className="cal-head-cell">
              {w}
            </div>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((c, idx) => {
            const isToday = toYMD(c.date) === toYMD(new Date());
            return (
              <button
                key={idx}
                className={`cal-cell ${c.inMonth ? "" : "muted"} ${isToday ? "today" : ""}`}
                onClick={() => {
                  onPick?.(toYMD(c.date));
                  onClose?.();
                }}
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


/** ====== 간단 콤보/검색 콤보/출금확인 콤보 ====== */
const SimpleCombo = forwardRef(function SimpleCombo(
  { value, onPick, items = [], placeholder = "- 선택 -", render = (x) => x.name ?? x, getKey = (x) => x.id ?? x, getValue = (x) => x.name ?? x, disabled = false },
  ref
) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const btnRef = useRef(null);

  useImperativeHandle(ref, () => (
    {
      open: () => !disabled && setOpen(true),
      close: () => setOpen(false),
      focus: () => {
        if (disabled) return;
        setFocus(true);
        setOpen(true);
        setTimeout(() => setFocus(false), 0);
        btnRef.current?.focus();
      },
    }
  ));

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (it) => {
    if (disabled) return;
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
        onClick={() => !disabled && setOpen((v) => !v)}
        onFocus={() => focus && setOpen(true)}
        title={label}
        disabled={disabled}
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

const AccountCombo = forwardRef(function AccountCombo(
  { value, onChange, vendors, placeholder, onComplete, disabled = false },
  ref
) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || "");
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: () => !disabled && setOpen(true),
    close: () => setOpen(false),
    focus: () => !disabled && inputRef.current?.focus(),
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
    if (disabled) return;
    const label = [hit.bank, hit.accountNo, hit.accountName].filter(Boolean).join(" ");
    onChange(label, hit);
    setOpen(false);
    onComplete?.();
  };

  const onKeyDown = (e) => {
    if (disabled) return;
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
          if (disabled) return;
          setQ(e.target.value);
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => !disabled && setOpen(true)}
        onKeyDown={onKeyDown}
        disabled={disabled}
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

const PaidCombo = forwardRef(function PaidCombo({ value, onPick, disabled = false }, ref) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const items = ["출금대기", "출금완료"];
  const btnRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: () => !disabled && setOpen(true),
    close: () => setOpen(false),
    focus: () => !disabled && btnRef.current?.focus(),
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
        onClick={() => !disabled && setOpen((v) => !v)}
        title={label}
        disabled={disabled}
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
                if (disabled) return;
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

/** =======================================================================
 *  출금보류 모달
 * ======================================================================= */
function HoldTable({ initialRows, onSaveDraft, onClose, onSendRow }) {
  const [draft, setDraft] = useState(() =>
    initialRows ? JSON.parse(JSON.stringify(initialRows)) : []
  );
  const saveTimer = useRef(null);

  useEffect(() => {
    setDraft(initialRows ? JSON.parse(JSON.stringify(initialRows)) : []);
  }, [initialRows]);

  // 자동 저장(디바운스 500ms)
  useEffect(() => {
    if (!onSaveDraft) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onSaveDraft(draft);
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, onSaveDraft]);

  const cols = [
    { key: "type",      title: "구분",     width: 60  },
    { key: "desc",      title: "내용",     width: 240 },
    { key: "bank",      title: "은행",     width: 80 },
    { key: "accountNo", title: "계좌번호", width: 240 },
    { key: "amount",    title: "금액",     width: 80, align: "right", isAmount: true },
    { key: "note",      title: "비고",     width: 220 },
    { key: "_send",     title: "보내기",   width: 160,  isAction: true },
  ];

  const tableRef = useRef(null);

  const addNRows = () => {
    const n = 10;
    setDraft((prev) => [
      ...prev,
      ...Array.from({ length: n }, () => ({
        type: "", desc: "", bank: "", accountNo: "", amount: "", note: "",
      })),
    ]);
    requestAnimationFrame(() => {
      const lastRow = (draft?.length ?? 0) + n - 1;
      const el = tableRef.current?.querySelector(
        `.hg-cell[data-row="${lastRow}"][data-col="0"] input`
      );
      el?.focus();
    });
  };

  const deleteRow = (idx) => {
    const next = draft.filter((_, i) => i !== idx);
    setDraft(next);
    onSaveDraft?.(next); // 즉시 저장
  };

  const sendRow = (idx) => {
    const row = draft[idx];
    if (!row) return;
    onSendRow?.(row);
    const next = draft.filter((_, i) => i !== idx);
    setDraft(next);
    onSaveDraft?.(next); // 즉시 저장
  };

  const setCell = (r, c, val) => {
    setDraft((prev) => {
      const next = [...prev];
      const row = { ...next[r] };
      const key = cols[c].key;
      row[key] = cols[c].isAmount ? fmtComma(val) : val;
      next[r] = row;
      return next;
    });
  };

  const onKey = (e) => {
    if (e.key !== "Enter") return;
    const cur = e.currentTarget;
    const r = Number(cur.getAttribute("data-row"));
    const c = Number(cur.getAttribute("data-col"));
    const colsCount = cols.length;
    let nc = c + 1;
    while (nc < colsCount && cols[nc]?.isAction) nc++;
    let nr = r;
    if (nc >= colsCount) {
      nr = r + 1;
      nc = 0;
      while (nc < colsCount && cols[nc]?.isAction) nc++;
    }
    const nxt = tableRef.current?.querySelector(
      `.hg-cell[data-row="${nr}"][data-col="${nc}"] input`
    );
    if (nxt) nxt.focus();
    else addNRows(); // 마지막이면 +10
  };

  return (
    <div className="hold-new">
      <div className="hg-toolbar">
        <div className="hg-left">
          <button className="hg-btn add" onClick={addNRows} title="10행 추가">
            <i className="ri-add-line" /> 행추가 (+10)
          </button>
        </div>
        <div className="hg-right"></div>
      </div>

      <div className="hg-wrap" ref={tableRef}>
        <table className="hg-table" style={{ width: 1200 }}>
          <thead>
            <tr>
              {cols.map((col) => (
                <th key={col.key} style={{ width: col.width }}>{col.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="hg-empty">
                  출금보류 내역이 없습니다.
                </td>
              </tr>
            ) : (
              draft.map((row, rIdx) => (
                <tr key={rIdx}>
                  {cols.map((col, cIdx) => {
                    if (col.isAction) {
                      return (
                        <td key={col.key} className="hg-cell action">
                          <div className="hg-actions">
                            <button
                              className="hg-btn send mini"
                              onClick={() => sendRow(rIdx)}
                            >
                              보내기
                            </button>
                            <button
                              className="hg-icon del mini"
                              title="행 삭제"
                              onClick={() => deleteRow(rIdx)}
                            >
                              <i className="ri-delete-bin-6-line" />
                            </button>
                          </div>
                        </td>
                      );
                    }
                    return (
                      <td
                        key={col.key}
                        className={`hg-cell ${col.align === "right" ? "ta-right" : ""}`}
                        data-row={rIdx}
                        data-col={cIdx}
                      >
                        <input
                          className={`hg-input ${col.isAmount ? "amt" : ""}`}
                          value={col.isAmount ? (row[col.key] || "") : (row[col.key] ?? "")}
                          onChange={(e) => setCell(rIdx, cIdx, e.target.value)}
                          onKeyDown={onKey}
                          data-row={rIdx}
                          data-col={cIdx}
                          placeholder=""
                        />
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 하단 버튼 */}
      <div className="hg-footer">
        <button className="hg-btn close" onClick={onClose} title="닫기">
          <i className="ri-close-line" /> 닫기
        </button>
      </div>
    </div>
  );
}

/** ====== 메인 컴포넌트 ====== */
export default function ExpensePage() {
  /* ✅ 캡쳐용 ref */
  const pageRef = useRef(null);

  const [date, setDate] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.date) return parsed.date;
      }
    } catch {}
    return todayYMD();
  });
  const [dateModalOpen, setDateModalOpen] = useState(false);

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

  // 분류/결제수단/거래처 로드 전용
  const [mainCats, setMainCats] = useState([]);
  const [payMethods, setPayMethods] = useState([]);
  const [vendors, setVendors] = useState([]);

  // 출금보류 저장본
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdRows, setHoldRows] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_HOLD_KEY);
      if (raw) return JSON.parse(raw) || [];
    } catch {}
    return [];
  });

  // 출금현황 모달
  const [outModalOpen, setOutModalOpen] = useState(false);

  /* ✅ [추가] 카드지출 팝업 상태 */
  const [cardModalOpen, setCardModalOpen] = useState(false);

  // ✅ 검색 관련 상태
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState([]); // [{ ymd, rowIdx, fields }]
  const [hitIdx, setHitIdx] = useState(-1);
  const [highlight, setHighlight] = useState(null); // { ymd, rowIdx, fields, q }

  // ✅ [추가] 검색 년도 드롭다운 (기본: 현재년도)
  const YEAR_OPTIONS = useMemo(() => {
    const ys = [];
    for (let y = 2024; y <= 2030; y++) ys.push(String(y));
    return ys;
  }, []);
  const [searchYear, setSearchYear] = useState(() => String(new Date().getFullYear()));

  // ✅ Firestore 실시간 구독: acct_expense_hold/current
  useEffect(() => {
    const ref = doc(db, "acct_expense_hold", "current");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        setHoldRows(rows);
        try { localStorage.setItem(LS_HOLD_KEY, JSON.stringify(rows)); } catch {}
      },
      (err) => {
        console.error("holdRows onSnapshot error:", err);
      }
    );
    return () => unsub();
  }, []);

  const [deleteMode, setDeleteMode] = useState(false);
  const openers = useRef({});
  const registerOpeners = (i, obj) => {
    openers.current[i] = obj;
  };

  // === 불러오기 중/초기화 여부 플래그(자동저장 억제용) ===
  const loadingRef = useRef(false);
  const initialMountRef = useRef(true);
  const saveTimer = useRef(null);
  const lastSavedKeyRef = useRef("");
  const lastSavedHashRef = useRef("");

  // 분류/결제수단/거래처 로드
  useEffect(() => {
    (async () => {
      try {
        const qsMain = await getDocs(collection(db, "acct_expense_main"));
        const mains = qsMain.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((x) => ({
            id: x.id,
            name: x.name || x.title || "",
            subs: Array.isArray(x.subs) ? x.subs : [],
          }));
        setMainCats(mains);
      } catch {
        setMainCats([]);
      }

      try {
        const qsPay = await getDocs(collection(db, "acct_payment_methods"));
        const pays = qsPay.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((x) => ({ id: x.id, name: x.name || x.title || "" }));
        setPayMethods(pays);
      } catch {
        setPayMethods([]);
      }

      try {
        const qsVen = await getDocs(collection(db, "vendorsAll"));
        const v = qsVen.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .map((x) => ({
            id: x.id,
            vendor: String(x.vendor || ""),
            bank: String(x.bank || ""),
            accountName: String(x.accountName || ""),
            accountNo: String(x.accountNo || ""),
          }));
        setVendors(v);
      } catch {
        setVendors([]);
      }
    })();
  }, []);

  const total = useMemo(() => rows.reduce((acc, r) => acc + toNumber(r.amount), 0), [rows]);

  /** ▼▼▼ 출금확인 · 출금계좌별 집계 (대기/완료/합계) ▼▼▼ */
  const outBreak = useMemo(() => {
    const map = new Map();
    let totalPending = 0;
    let totalDone = 0;

    (rows || []).forEach((r) => {
      const acc = s(r.outMethod);
      const amt = toNumber(r.amount);
      if (!acc || !amt) return;
      const isDone = s(r.paid) === "출금완료";

      const cur = map.get(acc) || { account: acc, pending: 0, done: 0 };
      if (isDone) {
        cur.done += amt;
        totalDone += amt;
      } else {
        cur.pending += amt;
        totalPending += amt;
      }
      map.set(acc, cur);
    });

    const items = Array.from(map.values())
      .map((it) => ({ ...it, sum: it.pending + it.done }))
      .sort((a, b) => a.account.localeCompare(b.account));

    return {
      items,
      totalPending,
      totalDone,
      totalSum: totalPending + totalDone,
    };
  }, [rows]);

  const persistLocal = (nextDate, nextRows) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ date: nextDate, rows: nextRows }));
    } catch {}
  };

  // ✅ 편집은 항상 가능
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
      const baseNo = next[idx]?.no ?? idx + 1;
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

  useEffect(() => {
    persistLocal(date, rows);
  }, [date]); // date 변경 시 현 로컬 상태 보존

  /** ===== 저장(자동) ===== */
  async function saveToStorageAuto(theDate, theRows) {
    if (loadingRef.current) return false; // 불러오는 중에는 저장 금지
    const ymd = theDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;

    const full = (theRows || [])
      .map((r) => ({ ...r, amount: toNumber(r.amount) }))
      .filter(
        (r) =>
          r.mainId ||
          r.mainName ||
          r.subName ||
          r.desc ||
          r.amount ||
          r.inAccount ||
          r.outMethod ||
          r.paid ||
          r.note
      );
    const valid = full.map(normalizeRow).filter(isValidForSave);

    const key = ymd;
    const hash = JSON.stringify(valid);
    if (lastSavedKeyRef.current === key && lastSavedHashRef.current === hash) {
      return false;
    }

    const renumbered = valid.map((r, i) => ({ ...r, no: i + 1 }));
    const newTotal = renumbered.reduce((acc, r) => acc + toNumber(r.amount), 0);

    const mk = ymdToMonthKey(ymd);
    const cur = await readMonthJSON(mk);
    const days = cur.days || {};
    days[ymd] = { rows: renumbered, total: newTotal, updatedAt: Date.now() };
    await writeMonthJSON(mk, { meta: { updatedAt: Date.now() }, days });

    lastSavedKeyRef.current = key;
    lastSavedHashRef.current = hash;
    return true;
  }

  // ✅ rows 변경 시 자동 저장(디바운스)
  useEffect(() => {
    if (initialMountRef.current) return;
    if (loadingRef.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveToStorageAuto(date, rows);
    }, 600);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, date]);

  // ✅ 날짜 전환/선택 시
  const switchDate = async (targetYMD) => {
    try {
      if (hasAnyContent(rows)) {
        await saveToStorageAuto(date, rows);
      }
      // 하이라이트 초기화
      setHighlight(null);
      await performLoadForDate(targetYMD, { setDateAfter: true });
    } catch (e) {
      console.error(e);
      alert("날짜 전환 중 오류가 발생했습니다.");
    }
  };

  const performLoadForDate = async (targetYMD, opts = { setDateAfter: false }) => {
    try {
      loadingRef.current = true;
      const mk = ymdToMonthKey(targetYMD);
      const { days } = await readMonthJSON(mk);
      const pack = days[targetYMD];

      if (opts.setDateAfter) setDate(targetYMD);

      if (pack && Array.isArray(pack.rows)) {
        const normalized = pack.rows.map((r, i) => ({
          ...makeEmptyRow(i),
          ...r,
          no: i + 1,
          amount: r.amount ? fmtComma(r.amount) : "",
          paid: r.paid || "",
        }));
        const pad = Math.max(0, INITIAL_ROWS - normalized.length);
        const padded =
          pad > 0
            ? [...normalized, ...Array.from({ length: pad }, (_, k) => makeEmptyRow(normalized.length + k))]
            : normalized;

        setRows(padded);
        persistLocal(targetYMD, padded);
      } else {
        const init = Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i));
        setRows(init);
        persistLocal(targetYMD, init);
      }
    } catch (e) {
      console.error(e);
      alert("불러오기 중 오류가 발생했습니다.");
      const init = Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i));
      if (opts.setDateAfter) setDate(targetYMD);
      setRows(init);
      persistLocal(targetYMD, init);
    } finally {
      loadingRef.current = false;
      initialMountRef.current = false;
    }
  };

  useEffect(() => {
    performLoadForDate(date);
  }, []); // eslint-disable-line

  const openNextRowMain = (i) => {
    const next = openers.current[i + 1];
    if (next?.openMain) next.openMain();
  };

  /** ✅ 출금보류 → 지출정리 한 줄 받기 */
  const receiveFromHold = (holdRow) => {
    const inAcc = [s(holdRow.bank), s(holdRow.accountNo)].filter(Boolean).join(" ").trim();
    const incoming = {
      desc: s(holdRow.desc),
      inAccount: inAcc,
      amount: fmtComma(holdRow.amount),
      note: s(holdRow.note),
    };
    const rowIsEmpty = (x) =>
      !(x.mainId || x.subName || x.desc || toNumber(x.amount) || x.inAccount || x.outMethod || x.paid || x.note);

    setRows((prev) => {
      const next = [...prev];
      let idx = next.findIndex(rowIsEmpty);
      if (idx === -1) {
        idx = next.length;
        next.push(makeEmptyRow(idx));
      }
      next[idx] = { ...next[idx], ...incoming };
      persistLocal(date, next);
      return next;
    });
  };

  /** =========================
   *  🔎 검색(선택년도 범위) - 자동검색 + Enter로 다음
   * ========================= */
  const tableWrapRef = useRef(null);
  const lastSearchQRef = useRef("");
  const debounceTimerRef = useRef(null);

  const findRowMatchedFields = (row, qLower) => {
    const fields = [];
    const check = (val) => String(val ?? "").toLowerCase().includes(qLower);
    if (check(row.mainName)) fields.push("mainName");
    if (check(row.subName)) fields.push("subName");
    if (check(row.desc)) fields.push("desc");
    if (check(row.inAccount)) fields.push("inAccount");
    if (check(row.outMethod)) fields.push("outMethod");
    if (check(row.note)) fields.push("note");
    if (qLower && /\d/.test(qLower)) {
      if (String(row.amount ?? "").replace(/,/g, "").includes(qLower.replace(/\D/g, ""))) {
        fields.push("amount");
      }
    }
    return fields;
  };

  // Storage에 저장된 "모든 월(YYYY-MM.json)"을 목록화
  const listAllMonthKeys = async () => {
    const baseRef = sRef(storage, EXPENSE_BASE);
    const res = await listAll(baseRef);
    const keys = (res.items || [])
      .map((it) => String(it.name || ""))
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/i, ""))
      .filter((mk) => /^\d{4}-\d{2}$/.test(mk))
      .sort();
    return keys;
  };

  // ✅ [수정] 드롭다운에서 선택된 "년도"만 검색
  const runYearSearch = async (q, selectedYear) => {
    const qLower = q.toLowerCase();

    let mkList = [];
    try {
      mkList = await listAllMonthKeys();
    } catch {
      // (실패 시) 선택년도 12개월 fallback
      mkList = Array.from({ length: 12 }, (_, i) => `${selectedYear}-${pad2(i + 1)}`);
    }

    // ✅ 선택년도만 필터링
    mkList = (mkList || []).filter((mk) => String(mk).startsWith(`${selectedYear}-`));
    // 선택년도에 파일이 하나도 없으면 fallback(그래도 12개월 검색 시도)
    if (mkList.length === 0) {
      mkList = Array.from({ length: 12 }, (_, i) => `${selectedYear}-${pad2(i + 1)}`);
    }

    const monthPromises = mkList.map(async (mk) => {
      try {
        const { days } = await readMonthJSON(mk);
        return days || {};
      } catch {
        return {};
      }
    });

    const monthsDays = await Promise.all(monthPromises);
    const hits = [];
    const today = todayYMD();

    monthsDays.forEach((days) => {
      const dayKeys = Object.keys(days);
      for (const ymd of dayKeys) {
        // ✅ 안전하게 해당 년도만
        if (!String(ymd).startsWith(`${selectedYear}-`)) continue;

        const pack = days[ymd];
        const rlist = Array.isArray(pack?.rows) ? pack.rows : [];
        rlist.forEach((row, idx) => {
          const fields = findRowMatchedFields(row, qLower);
          if (fields.length) {
            hits.push({ ymd, rowIdx: idx, fields, dist: absDaysBetween(ymd, today) });
          }
        });
      }
    });

    hits.sort((a, b) => (a.dist - b.dist) || (a.ymd.localeCompare(b.ymd)) || (a.rowIdx - b.rowIdx));
    return hits;
  };

  const goToHit = async (idx) => {
    if (!searchHits.length) return;
    const nextIdx = (idx + searchHits.length) % searchHits.length;
    const hit = searchHits[nextIdx];
    setHitIdx(nextIdx);
    await switchDate(hit.ymd);
    setHighlight({ ymd: hit.ymd, rowIdx: hit.rowIdx, fields: hit.fields, q: searchQ });
  };

  useEffect(() => {
    if (!highlight) return;
    if (highlight.ymd !== date) return;
    const wrap = tableWrapRef.current;
    if (!wrap) return;
    const rowEl = wrap.querySelector(`tbody tr:nth-child(${highlight.rowIdx + 1})`);
    if (rowEl?.scrollIntoView) {
      rowEl.scrollIntoView({ block: "center" });
    }
  }, [highlight, date]);

  useEffect(() => {
    const onDoc = () => setHighlight(null);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // ✅ [수정] searchQ 뿐 아니라 searchYear 변경 시에도 재검색
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const q = s(searchQ);
    if (!q) {
      setSearchHits([]);
      setHitIdx(-1);
      setHighlight(null);
      return;
    }
    debounceTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const year = String(searchYear || new Date().getFullYear());
        const hits = await runYearSearch(q, year);
        setSearchHits(hits);
        lastSearchQRef.current = q;
        if (hits.length) {
          setHitIdx(0);
          await goToHit(0);
        } else {
          setHitIdx(-1);
          setHighlight(null);
        }
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [searchQ, searchYear]); // ✅ year 포함

  const onSearchKeyDown = async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (searchHits.length) {
      await goToHit(hitIdx + 1);
    }
  };

  const onClickTodayQuick = async () => {
    const today = todayYMD();
    await switchDate(today);
  };

  // ✅ 항상 표시될 카운터 텍스트
  const counterText = `${Math.max(0, hitIdx + 1)}/${searchHits.length || 0}`;

  /** ✅ 전체 페이지 캡쳐 (스크롤 포함) */
  const onCapturePage = async () => {
    try {
      const target = pageRef.current;
      if (!target) return;

      // 1) 클론을 만들어 화면 밖에 렌더
      const clone = target.cloneNode(true);
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-99999px";
      container.style.top = "-99999px";
      container.style.width = `${target.scrollWidth}px`;
      container.style.background = "#fff";
      container.appendChild(clone);
      document.body.appendChild(container);

      // 2) 스크롤 영역(테이블 등) 확장
      clone.querySelectorAll(".scrollable").forEach((el) => {
        el.style.maxHeight = "none";
        el.style.overflow = "visible";
      });

      // 3) 이미지 생성 (고해상도)
      const dataUrl = await htmlToImage.toPng(clone, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        width: Math.max(clone.scrollWidth, clone.clientWidth),
        height: Math.max(clone.scrollHeight, clone.clientHeight),
      });

      // 4) 다운로드
      const a = document.createElement("a");
      const ts = new Date();
      const tsLabel = `${ts.getFullYear()}${pad2(ts.getMonth() + 1)}${pad2(ts.getDate())}_${pad2(ts.getHours())}${pad2(ts.getMinutes())}${pad2(ts.getSeconds())}`;
      a.href = dataUrl;
      a.download = `Expense_${tsLabel}.png`;
      a.click();

      // 5) 정리
      document.body.removeChild(container);
    } catch (e) {
      console.error(e);
      alert("캡쳐 생성 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="xp-page" ref={pageRef}>
      {/* 상단 바 — 요청 순서대로 한 줄 정렬 */}
      <div className="xp-top slim fancy" style={{ gridTemplateColumns: "1fr" }}>
        <div className="xp-actions" style={{ overflow: "visible", flexWrap: "nowrap" }}>
          {/* 1) 추가 */}
          <button
            className="xp-btn xp-load small pad-s"
            onClick={() => addRows(1)}
            title="추가"
          >
            <i className="ri-add-line" /> 추가
          </button>

          {/* 3) 출금보류 */}
          <button
            className="xp-btn xp-hold small pad-s"
            onClick={() => setHoldOpen(true)}
            title="출금보류"
          >
            <i className="ri-pause-circle-line" /> 출금보류
          </button>

          {/* 4) 출금현황 */}
          <button
            className="xp-btn xp-save small pad-s"
            onClick={() => setOutModalOpen(true)}
            title="출금현황"
          >
            <i className="ri-pie-chart-line" /> 출금현황
          </button>

          {/* 5) 캡쳐 */}
          <button
            className="xp-btn"
            onClick={onCapturePage}
            title="현재 페이지 캡쳐/저장"
            style={{
              height: 34, padding: "0 12px", borderRadius: 12, gap: 8, fontSize: 13,
              background: "linear-gradient(135deg,#06b6d4 0%,#0ea5e9 100%)",
            }}
          >
            <i className="ri-camera-3-line" /> 캡쳐
          </button>

          {/* 6) 오늘 */}
          <button
            className="xp-btn"
            onClick={onClickTodayQuick}
            title="오늘로 이동"
            style={{
              height: 34, padding: "0 12px", borderRadius: 12, gap: 8, fontSize: 13,
              background: "linear-gradient(135deg,#22c55e 0%,#16a34a 100%)",
            }}
          >
            <i className="ri-calendar-event-line" /> 오늘
          </button>

          {/* 7) 삭제 */}
          <button
            className={`xp-btn xp-delete small pad-s ${deleteMode ? "on" : ""}`}
            onClick={() => setDeleteMode((v) => !v)}
            title="삭제 모드"
          >
            <i className="ri-delete-bin-6-line" /> {deleteMode ? "삭제모드 해제" : "삭제"}
          </button>

          {/* 8) 검색창 */}
          <div
            className={`xp-search ${searching ? "is-loading" : ""}`}
            onMouseDown={(e)=>e.stopPropagation()}
            onClick={(e)=>e.stopPropagation()}
            style={{ marginLeft: 6, marginRight: 6 }}
          >
            <i className="ri-search-line xp-search-icon" />
            <input
              className="xp-input xp-search-input"
              placeholder=""
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={onSearchKeyDown}
              title="검색"
            />
            <div className={`xp-search-status ${searchHits.length > 0 ? "ok" : ""}`} title="결과 수">
              {searching && <i className="ri-loader-4-line xp-spin" />}
              <span>{counterText}</span>
            </div>
          </div>

          {/* ✅ [추가] 검색창 오른쪽: 년도 드롭다운 (2024~2030, 기본 현재년도) */}
          <select
            className="xp-year-select"
            value={searchYear}
            onChange={(e) => setSearchYear(e.target.value)}
            title="검색 년도"
            onMouseDown={(e)=>e.stopPropagation()}
            onClick={(e)=>e.stopPropagation()}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>

          {/* ✅ [추가] 카드지출 버튼 — 검색창과 날짜 패널 사이 */}
          <button
            className="xp-btn"
            onClick={() => setCardModalOpen(true)}
            title="카드지출"
            style={{
              height: 34, padding: "0 12px", borderRadius: 12, gap: 8, fontSize: 13,
              background: "linear-gradient(135deg,#6C8CF5 0%,#4F73EA 100%)",
              marginLeft: 40,
              marginRight: 8
            }}
          >
            <i className="ri-bank-card-line" /> 카드지출
          </button>

          {/* 9) 지출일자/합계 패널 — 더 크게 + 오른쪽 정렬 고정 */}
          <div
            className="xp-side fancy-panel narrow mini"
            role="button"
            title="날짜 선택"
            onClick={() => setDateModalOpen(true)}
            style={{
              width: 560,
              padding: 10,
              gap: 10,
              marginLeft: "auto",
              marginRight: 0,
            }}
          >
            <div
              className="xp-side-row xp-side-date"
              style={{
                transform: "scale(0.92)",
                transformOrigin: "right center",
                padding: "4px 10px",
                minWidth: 220
              }}
            >
              <div className="xp-side-label">지출일자</div>
              <div className="xp-date-wrap">
                <div className="xp-date-display" style={{ height: 32, padding: "0 32px 0 12px" }}>
                  <span className="xp-date-text">{date}</span>
                  <button
                    className="xp-date-open"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDateModalOpen(true);
                    }}
                    title="달력 열기"
                    style={{ right: 6, fontSize: 18 }}
                  >
                    <i className="ri-calendar-2-line" />
                  </button>
                </div>
                <span className="xp-weekday">{getWeekdayLabel(date)}</span>
              </div>
            </div>

            <div
              className="xp-side-row xp-side-sum"
              style={{
                transform: "scale(0.92)",
                transformOrigin: "right center",
                padding: "8px 12px",
                minWidth: 220
              }}
            >
              <div className="xp-side-label">합계</div>
              <div className="xp-side-krw">₩</div>
              <div className="xp-side-val" style={{ fontSize: 18 }}>{fmtComma(total) || "-"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 출금현황 모달 — 가로폭 축소 + 합계 칩/컬럼 추가 */}
      <Modal
        open={outModalOpen}
        onClose={() => setOutModalOpen(false)}
        title="출금현황"
        width={640}
      >
        <div
          style={{
            borderRadius: 16,
            padding: "12px",
            background: "linear-gradient(135deg,#f5f3ff 0%,#e0e7ff 50%,#ffe4e6 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.6)",
            marginBottom: 10,
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <i className="ri-pie-chart-2-line" style={{ fontSize: 22, color: "#6d28d9" }} />
            <div style={{ fontWeight: 900, color: "#312e81" }}>요약</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{
              padding: "6px 10px", borderRadius: 999,
              background: "linear-gradient(135deg,#dbeafe,#e9d5ff)",
              fontWeight: 800, color: "#1e3a8a", fontSize: 12,
            }}>
              대기 합계&nbsp;<span style={{ color: "#7c3aed" }}>₩{fmtComma(outBreak.totalPending)}</span>
            </div>
            <div style={{
              padding: "6px 10px", borderRadius: 999,
              background: "linear-gradient(135deg,#dcfce7,#bbf7d0)",
              fontWeight: 800, color: "#065f46", fontSize: 12,
            }}>
              완료 합계&nbsp;<span style={{ color: "#047857" }}>₩{fmtComma(outBreak.totalDone)}</span>
            </div>
            <div style={{
              padding: "6px 10px", borderRadius: 999,
              background: "linear-gradient(135deg,#fee2e2,#fecaca)",
              fontWeight: 800, color: "#7f1d1d", fontSize: 12,
            }}>
              출금합계&nbsp;<span style={{ color: "#b91c1c" }}>₩{fmtComma(outBreak.totalSum)}</span>
            </div>
          </div>
        </div>

        <div
          className="xp-out-table"
          role="table"
          style={{ borderRadius: 14, overflow: "hidden" }}
        >
          <div
            className="xp-out-row xp-out-row-head"
            role="row"
            style={{
              background: "linear-gradient(180deg,#ede9fe,#e0e7ff)",
              color: "#3730a3",
              fontWeight: 900,
              borderBottom: "1px solid #e9d5ff",
              display: "grid",
              gridTemplateColumns: "1fr 120px 120px 120px",
              gap: 8,
              alignItems: "center",
              padding: "6px 10px",
            }}
          >
            <div role="columnheader">출금계좌</div>
            <div role="columnheader" style={{ textAlign: "right" }}>출금대기</div>
            <div role="columnheader" style={{ textAlign: "right" }}>출금완료</div>
            <div role="columnheader" style={{ textAlign: "right" }}>합계</div>
          </div>

          {(outBreak.items.length === 0) ? (
            <div className="xp-out-empty">표시할 항목이 없습니다.</div>
          ) : (
            outBreak.items.map((it, idx) => (
              <div
                role="row"
                key={it.account}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 120px 120px",
                  gap: 8,
                  alignItems: "center",
                  padding: "6px 10px",
                  borderTop: "1px solid #f3f4f6",
                  background: idx % 2 === 0 ? "#ffffff" : "#fbfdff",
                }}
              >
                <div role="cell" title={it.account} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.account}
                </div>
                <div role="cell" style={{ textAlign: "right", fontWeight: 800 }}>₩{fmtComma(it.pending)}</div>
                <div role="cell" style={{ textAlign: "right", fontWeight: 800 }}>₩{fmtComma(it.done)}</div>
                <div role="cell" style={{ textAlign: "right", fontWeight: 900 }}>₩{fmtComma(it.sum)}</div>
              </div>
            ))
          )}
        </div>

        <div style={{
          marginTop: 12,
          height: 8,
          borderRadius: 999,
          background: "linear-gradient(90deg,#a78bfa,#60a5fa,#f472b6)",
          opacity: .6,
        }} />
      </Modal>

      {/* 메인 테이블 */}
      <div className="xp-table-wrap scrollable" ref={tableWrapRef}>
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
                onDeleteRow={() => clearRow(i)}
                hit={
                  highlight && highlight.ymd === date && highlight.rowIdx === i
                    ? { fields: new Set(highlight.fields || []) }
                    : null
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 달력 모달 */}
      <CalendarModal
        open={dateModalOpen}
        defaultDate={date}
        titleText="지출일자 선택"
        onPick={(ymd) => switchDate(ymd)}
        onClose={() => setDateModalOpen(false)}
      />

      {/* 출금보류 모달 */}
      <Modal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        title="출금보류"
        width={1200}
        showCloseX={true}
        className="xp-modal-hold"
      >
        <HoldTable
          initialRows={holdRows}
          onSendRow={(r) => receiveFromHold(r)}
          onSaveDraft={async (newRows) => {
            try {
              const ref = doc(db, "acct_expense_hold", "current");
              await setDoc(ref, { rows: newRows, updatedAt: serverTimestamp() }, { merge: true });
              try { localStorage.setItem(LS_HOLD_KEY, JSON.stringify(newRows)); } catch {}
            } catch (e) {
              console.error(e);
              alert("출금보류 저장 중 오류가 발생했습니다.");
            }
          }}
          onClose={() => setHoldOpen(false)}
        />
      </Modal>

      {/* ✅ [추가] 카드지출 팝업 렌더 */}
      <CardExpenseModal open={cardModalOpen} onClose={() => setCardModalOpen(false)} />
    </div>
  );
}

/** ====== Row ====== */
function RowEditor({
  idx,
  row,
  mains,
  payMethods,
  vendors,
  onChange,
  registerOpeners,
  openNextRowMain,
  deleteMode,
  onDeleteRow,
  hit, // { fields: Set<string> } | null
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
    registerOpeners(idx, { openMain: () => mainRef.current?.focus() });
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
  const hitHas = (f) => !!(hit && hit.fields && hit.fields.has(f));

  return (
    <tr className={isPaidDone ? "xp-tr-paid" : ""}>
      <td className={`xp-td-no ${deleteMode ? "xp-td-del-on" : ""}`}>
        {deleteMode && (
          <button type="button" className="xp-del-row-btn" onClick={onDeleteRow} title="이 줄 내용 삭제">
            삭제
          </button>
        )}
        {row.no}
      </td>

      <td className={`${isPaidDone ? "xp-td-dim-dark" : ""} ${hitHas("mainName") ? "xp-hit" : ""}`}>
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

      <td className={`${isPaidDone ? "xp-td-dim-dark" : ""} ${hitHas("subName") ? "xp-hit" : ""}`}>
        <SimpleCombo
          ref={subRef}
          value={row.subName}
          items={subItems}
          onPick={(it) => {
            onChange({ subName: it.name });
            setTimeout(() => descRef.current?.focus(), 0);
          }}
          placeholder={row.mainId ? "- 선택 -" : "대분류 먼저 선택"}
          disabled={!row.mainId}
        />
      </td>

      <td className={`${isPaidDone ? "xp-td-dim-dark" : ""} ${hitHas("desc") ? "xp-hit" : ""}`}>
        <input
          ref={descRef}
          className="xp-input"
          value={row.desc}
          onChange={(e) => onChange({ desc: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") amtRef.current?.focus();
          }}
        />
      </td>

      <td className={`${isPaidDone ? "xp-td-dim-dark" : ""} ${hitHas("amount") ? "xp-hit" : ""}`}>
        <input
          ref={amtRef}
          className="xp-input xp-amt"
          inputMode="numeric"
          value={row.amount}
          onChange={onAmountChange}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              inAccRef.current?.focus();
              inAccRef.current?.open();
            }
          }}
        />
      </td>

      <td className={`${isPaidDone ? "xp-td-dim-dark" : ""} ${hitHas("inAccount") ? "xp-hit" : ""}`}>
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

      <td className={`${isPaidDone ? "xp-td-dim-dark" : ""} ${hitHas("outMethod") ? "xp-hit" : ""}`}>
        <SimpleCombo
          ref={outRef}
          value={row.outMethod}
          items={payMethods}
          onPick={(it) => {
            onChange({ outMethod: it.name });
            setTimeout(() => {
              paidRef.current?.open();
            }, 0);
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

      <td className={`${hitHas("note") ? "xp-hit" : ""}`}>
        <input
          ref={noteRef}
          className="xp-input"
          value={row.note}
          onChange={(e) => onChange({ note: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") openNextRowMain();
          }}
        />
      </td>
    </tr>
  );
}
