// src/pages/ExpensePage.jsx
import React, {
  useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle,
} from "react";
import "./ExpensePage.css";
import * as XLSX from "xlsx";

// Firestore는 '분류/거래처' 조회 용도로만 사용 (저장은 Storage JSON)
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";

// ✅ Storage(JSON) 사용
import { getStorage, ref as sRef, uploadBytes, getBytes } from "firebase/storage";

/** ====== 상수/공통 ====== */
const INITIAL_ROWS = 20;
const LS_KEY = "ExpensePage:WIP:v1";
const LS_HOLD_KEY = "ExpensePage:HOLD:v1";

// Storage 폴더/포맷: acct_expense_json/<YYYY-MM>.json
// { meta:{}, days:{ 'YYYY-MM-DD': { rows:[], total:number, updatedAt:number } } }
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
const weekdayKo = ["일", "월", "화", "수", "목", "금", "토"];
const getWeekdayLabel = (ymd) => {
  const d = new Date(ymd);
  if (isNaN(d)) return "";
  return `(${weekdayKo[d.getDay()]})`;
};
const ymdToMonthKey = (ymd) => s(ymd).slice(0, 7);

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
function Modal({ open, onClose, title, children, width = 720, showCloseX = true }) {
  if (!open) return null;
  return (
    <div
      className="xp-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target.classList.contains("xp-modal-backdrop")) onClose?.();
      }}
    >
      <div className="xp-modal" style={{ width }}>
        <div className="xp-modal-head">
          <div className="xp-modal-title">{title}</div>
          {showCloseX && (
            <button className="xp-modal-close" onClick={onClose} title="닫기">
              <i className="ri-close-line" />
            </button>
          )}
        </div>
        <div className="xp-modal-body">{children}</div>
      </div>
    </div>
  );
}

/** ====== 커스텀 달력 ====== */
function ymdToDate(ymd) {
  const [y, m, d] = (ymd || "").split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}
function toYMD(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
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
    <Modal open={open} onClose={onClose} title={titleText} width={380}>
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

  useImperativeHandle(ref, () => ({
    open: () => !disabled && setOpen(true),
    close: () => setOpen(false),
    focus: () => {
      if (disabled) return;
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

/** ====== 출금보류 모달 (드래프트 편집, 저장 시에만 반영) ====== */
function HoldTable({ initialRows, onSaveDraft, onClose, onSendRow }) {
  const [delMode, setDelMode] = useState(false);
  const [draft, setDraft] = useState(() => (initialRows ? JSON.parse(JSON.stringify(initialRows)) : []));

  useEffect(() => {
    setDraft(initialRows ? JSON.parse(JSON.stringify(initialRows)) : []);
  }, [initialRows]);

  const update = (idx, key, val) => {
    setDraft((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: key === "amount" ? fmtComma(val) : val };
      return next;
    });
  };

  const add = () =>
    setDraft((prev) => [...prev, { type: "", desc: "", bank: "", accountNo: "", amount: "", note: "" }]);

  const removeRow = (idx) => setDraft((prev) => prev.filter((_, i) => i !== idx));

  const onEnterNext = (e) => {
    if (e.key !== "Enter") return;
    const r = Number(e.currentTarget.getAttribute("data-row"));
    const c = Number(e.currentTarget.getAttribute("data-col"));
    const nextCol = Math.min(c + 1, 5);
    const nextSel = document.querySelector(`input[data-row="${r}"][data-col="${nextCol}"]`);
    if (nextSel) nextSel.focus();
  };

  const sendRow = (idx) => {
    const row = draft[idx];
    if (!row) return;
    onSendRow?.(row);
    removeRow(idx);
  };

  return (
    <div className="hold-wrap">
      {/* ✅ 상단 툴바 고정 */}
      <div className="hold-toolbar sticky-top">
        <button className="hold-btn add" onClick={add} title="행 추가">
          <i className="ri-add-line" /> 행추가
        </button>
        <button
          className={`hold-btn delete ${delMode ? "on" : ""}`}
          onClick={() => setDelMode((v) => !v)}
          title="삭제 모드"
        >
          <i className="ri-delete-bin-6-line" /> {delMode ? "삭제모드 해제" : "삭제"}
        </button>
      </div>

      <div className="hold-table-wrap">
        {/* ✅ 안쪽 스크롤 제거용 클래스 유지(no-inner-scroll) → CSS에서 overflow 제거 */}
        <div className="hold-viewport no-inner-scroll">
          <table className="hold-table">
            <thead>
              <tr>
                <th className="w-80">구분</th>
                <th className="w-260">내용</th>
                <th className="w-100">은행</th>
                <th className="w-180">계좌번호</th>
                <th className="w-110">금액</th>
                <th className="w-320">비고</th>
                <th className="w-90">보내기</th>
              </tr>
            </thead>
            <tbody>
              {draft.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "#6b7280" }}>
                    행이 없습니다.
                  </td>
                </tr>
              ) : (
                draft.map((r, i) => (
                  <tr key={i}>
                    <td style={{ position: "relative" }}>
                      {delMode && (
                        <button
                          type="button"
                          className="hold-del-row-btn"
                          onClick={() => removeRow(i)}
                          title="이 줄 삭제"
                        >
                          삭제
                        </button>
                      )}
                      <input
                        className="xp-input"
                        data-row={i}
                        data-col={0}
                        value={r.type || ""}
                        onChange={(e) => update(i, "type", e.target.value)}
                        onKeyDown={onEnterNext}
                      />
                    </td>
                    <td>
                      <input
                        className="xp-input"
                        data-row={i}
                        data-col={1}
                        value={r.desc || ""}
                        onChange={(e) => update(i, "desc", e.target.value)}
                        onKeyDown={onEnterNext}
                      />
                    </td>
                    <td>
                      <input
                        className="xp-input"
                        data-row={i}
                        data-col={2}
                        value={r.bank || ""}
                        onChange={(e) => update(i, "bank", e.target.value)}
                        onKeyDown={onEnterNext}
                      />
                    </td>
                    <td>
                      <input
                        className="xp-input"
                        data-row={i}
                        data-col={3}
                        value={r.accountNo || ""}
                        onChange={(e) => update(i, "accountNo", e.target.value)}
                        onKeyDown={onEnterNext}
                      />
                    </td>
                    <td>
                      <input
                        className="xp-input xp-amt"
                        data-row={i}
                        data-col={4}
                        value={r.amount || ""}
                        onChange={(e) => update(i, "amount", e.target.value)}
                        onKeyDown={onEnterNext}
                      />
                    </td>
                    <td>
                      <input
                        className="xp-input"
                        data-row={i}
                        data-col={5}
                        value={r.note || ""}
                        onChange={(e) => update(i, "note", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const nxt = document.querySelector(
                              `input[data-row="${i + 1}"][data-col="0"]`
                            );
                            if (nxt) nxt.focus();
                          }
                        }}
                      />
                    </td>
                    <td className="send-cell">
                      <button
                        className="hold-btn send"
                        onClick={() => sendRow(i)}
                        title="지출정리로 보내기"
                      >
                        보내기
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ✅ 하단 저장/닫기 바 고정 */}
      <div className="hold-footer sticky-bottom">
        <button
          className="hold-btn save"
          onClick={() => {
            try {
              onSaveDraft?.(draft);
              alert("출금보류 목록이 저장되었습니다.");
            } catch {
              alert("출금보류 저장 중 오류가 발생했습니다.");
            }
          }}
        >
          <i className="ri-save-3-line" /> 저장
        </button>
        <button className="hold-btn close" onClick={onClose}>
          <i className="ri-close-line" /> 닫기
        </button>
      </div>
    </div>
  );
}

/* ===== Excel 날짜 유틸 ===== */
const EXCEL_EPS = 1e-7;
function excelSerialToLocalDate(val, date1904 = false) {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  let serial = val;
  if (Math.abs(serial - Math.round(serial)) < EXCEL_EPS) serial = Math.round(serial);
  const o = XLSX.SSF.parse_date_code(serial, { date1904 });
  if (!o) return null;
  return new Date(o.y, (o.m || 1) - 1, o.d || 1, o.H || 0, o.M || 0, Math.floor(o.S || 0));
}
function fmtDateLocal(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${y}-${m}-${dd}`;
}
function normalizeExcelDateCell(cell, date1904 = false) {
  if (cell == null || cell === "") return "";
  if (typeof cell === "number") {
    const d = excelSerialToLocalDate(cell, date1904);
    return d ? fmtDateLocal(d) : "";
  }
  if (cell instanceof Date && !isNaN(cell)) return fmtDateLocal(cell);
  const raw = s(cell);
  if (!raw) return "";
  const norm = raw.replace(/[.]/g, "-").replace(/\//g, "-").trim();
  const m = norm.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) ? "" : fmtDateLocal(d);
}

/** ====== 엑셀 파서 ====== */
const headerIndex = (header, names) => {
  const idx = names
    .flatMap((nm) => [nm, ...nm.split("|")])
    .map((nm) => header.findIndex((h) => s(h).includes(nm)))
    .find((i) => i >= 0);
  return typeof idx === "number" ? idx : -1;
};
function parseExpenseSheet(ws, is1904 = false) {
  const aoo = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });
  if (!aoo.length) return { headerRow: -1, rows: [] };

  // 헤더 탐색
  let headerRow = -1;
  for (let i = 0; i < Math.min(aoo.length, 50); i++) {
    const row = (aoo[i] || []).map(s);
    const hasDate = row.some((c) => /지출일자|일자/.test(c));
    const hasAmt = row.some((c) => /금액|지출금액/.test(c));
    if (hasDate && hasAmt) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) return { headerRow: -1, rows: [] };
  const header = (aoo[headerRow] || []).map(s);

  const col = {
    date: headerIndex(header, ["지출일자|일자"]),
    main: headerIndex(header, ["대분류"]),
    sub: headerIndex(header, ["소분류"]),
    desc: headerIndex(header, ["내용"]),
    amount: headerIndex(header, ["금액|지출금액"]),
    inAcc: headerIndex(header, ["입금 계좌번호|입금계좌|입금계좌번호"]),
    out: headerIndex(header, ["출금계좌|출금방법"]),
    paid: headerIndex(header, ["출금확인"]),
    note: headerIndex(header, ["비고"]),
  };

  const out = [];
  let lastYmd = "";
  for (let r = headerRow + 1; r < aoo.length; r++) {
    const row = aoo[r] || [];
    const any = row.some((c) => s(c) !== "");
    if (!any) continue;

    let ymd = normalizeExcelDateCell(row[col.date], is1904);
    if (!ymd) ymd = lastYmd;
    if (ymd) lastYmd = ymd;

    const amount = fmtComma(row[col.amount]);
    out.push({
      date: ymd,
      mainName: s(row[col.main]),
      subName: s(row[col.sub]),
      desc: s(row[col.desc]),
      amount,
      inAccount: s(row[col.inAcc]),
      outMethod: s(row[col.out]),
      paid: s(row[col.paid]),
      note: s(row[col.note]),
    });
  }
  return { headerRow, rows: out };
}

/** ====== 메인 컴포넌트 ====== */
export default function ExpensePage() {
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

  // ✅ "불러오기를 한 상태" 여부 및 불러온 기준 날짜
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedDate, setLoadedDate] = useState(""); // 불러오기 성공 시 설정

  // 분류/결제수단/거래처 로드 전용
  const [mainCats, setMainCats] = useState([]);
  const [payMethods, setPayMethods] = useState([]);
  const [vendors, setVendors] = useState([]);

  // 출금보류 저장본(저장 버튼으로만 반영)
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdRows, setHoldRows] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_HOLD_KEY);
      if (raw) return JSON.parse(raw) || [];
    } catch {}
    return [];
  });

  const [deleteMode, setDeleteMode] = useState(false);
  const openers = useRef({});
  const registerOpeners = (i, obj) => {
    openers.current[i] = obj;
  };

  const fileInputRef = useRef(null);
  const onPickFiles = () => fileInputRef.current?.click();
  const handleFiles = async (fileList) => {
    /* 기존 그대로 (엑셀 업로드 파이프라인이 있다면 여기에) */
  };

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
        const v = qsVen.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })).map((x) => ({
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
  }, [date]);

  const onRefresh = () => {
    const ok = window.confirm("새로고침하면 현재 지출 입력 내용이 모두 삭제됩니다. 계속할까요?");
    if (!ok) return;
    const init = Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i));
    setRows(init);
    persistLocal(date, init);
    setIsLoaded(false);
    setLoadedDate("");
  };

  /** ===== 저장 정책 =====
   * - 해당 날짜에 기존 저장본이 없는 경우: 자유 저장 가능
   * - 해당 날짜에 기존 저장본이 있는 경우: 반드시 '불러오기'를 먼저 해서 isLoaded=true && loadedDate===date 인 상태에서만 저장 가능
   * - 저장은 해당 날짜의 내용을 '덮어쓰기(Overwrite)' 하므로, 중복 불가/미병합 보장
   */
  const saveToStorage = async (theDate, theRows) => {
    const ymd = theDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      alert("유효한 날짜가 아닙니다.");
      return false;
    }

    const mk = ymdToMonthKey(ymd);
    const cur = await readMonthJSON(mk);
    const existed = !!(cur?.days?.[ymd]?.rows?.length > 0);

    // 기존 저장본이 있을 때: 반드시 불러오기 상태에서만 저장 가능
    if (existed) {
      if (!isLoaded || loadedDate !== ymd) {
        alert(
          "같은 지출일자에 저장된 내용이 있습니다.\n" +
          "해당 내용을 수정/추가/삭제하려면 먼저 '불러오기'로 그 날짜를 불러온 뒤 저장해 주세요."
        );
        return false;
      }
    }

    // 저장할 데이터 정리
    const nowFull = (theRows || [])
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
    const nowValid = nowFull.map(normalizeRow).filter(isValidForSave);
    if (nowValid.length === 0) {
      alert("저장할 유효한 행이 없습니다.");
      return false;
    }

    // 번호 재부여 + 합계
    const renumbered = nowValid.map((r, i) => ({ ...r, no: i + 1 }));
    const newTotal = renumbered.reduce((acc, r) => acc + toNumber(r.amount), 0);

    // ✅ 덮어쓰기(Overwrite)로 중복/병합 문제 방지
    const days = cur.days || {};
    days[ymd] = { rows: renumbered, total: newTotal, updatedAt: Date.now() };

    await writeMonthJSON(mk, { meta: { updatedAt: Date.now() }, days });
    return true;
  };

  const onSave = async () => {
    try {
      const changed = await saveToStorage(date, rows);
      if (!changed) return;
      alert("저장되었습니다.");

      // 저장 후에도 계속 편집하실 수 있지만, 초기화가 필요하면 아래 유지
      const init = Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i));
      setRows(init);
      persistLocal(date, init);
      setIsLoaded(false);
      setLoadedDate("");
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  const performLoadForDate = async (targetYMD) => {
    try {
      if (hasAnyContent(rows)) {
        persistLocal(date, rows);
      }
      const mk = ymdToMonthKey(targetYMD);
      const { days } = await readMonthJSON(mk);
      const pack = days[targetYMD];

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

        setDate(targetYMD);
        setRows(padded);
        persistLocal(targetYMD, padded);
        setIsLoaded(true);
        setLoadedDate(targetYMD); // ✅ 불러온 날짜 기록
        alert("불러오기가 완료되었습니다.");
      } else {
        const keys = Object.keys(days || {}).sort();
        alert(
          `선택한 날짜(${targetYMD})에는 저장된 지출 데이터가 없습니다.\n` +
            (keys.length ? `이 월에 저장된 날짜: ${keys.join(", ")}` : "이 월의 저장된 날짜도 없습니다.")
        );
        setIsLoaded(false);
        setLoadedDate("");
      }
    } catch (e) {
      console.error(e);
      alert("불러오기 중 오류가 발생했습니다.");
      setIsLoaded(false);
      setLoadedDate("");
    }
  };

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

  return (
    <div className="xp-page">
      {/* 상단 바 */}
      <div className="xp-top slim fancy">
        <div className="xp-actions">
          <button className="xp-btn xp-excel small pad-s" onClick={onPickFiles} title="엑셀 업로드">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ marginRight: 6 }}>
              <rect x="3" y="3" width="18" height="18" rx="2.5" fill="#1F6F43" />
              <path
                d="M8.5 8.5l2.5 3-2.5 3M12.5 8.5l-2.5 3 2.5 3"
                stroke="#fff"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect x="13.5" y="5" width="6" height="14" fill="#2EA06B" />
            </svg>
            엑셀 업로드
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            style={{ display: "none" }}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />

          <button className="xp-btn xp-refresh small pad-s" onClick={onRefresh} title="새로고침">
            <i className="ri-refresh-line" /> 새로고침
          </button>
          <button className="xp-btn xp-load small pad-s" onClick={() => setLoadModalOpen(true)} title="불러오기">
            <i className="ri-download-2-line" /> 불러오기
          </button>
          <button className="xp-btn xp-hold small pad-s" onClick={() => setHoldOpen(true)} title="출금보류">
            <i className="ri-pause-circle-line" /> 출금보류
          </button>
          <button
            className="xp-btn xp-save small pad-s"
            onClick={onSave}
            title="저장"
          >
            <i className="ri-save-3-line" /> 저장
          </button>
          <button
            className={`xp-btn xp-delete small pad-s ${deleteMode ? "on" : ""}`}
            onClick={() => setDeleteMode((v) => !v)}
            title="삭제 모드"
          >
            <i className="ri-delete-bin-6-line" /> {deleteMode ? "삭제모드 해제" : "삭제"}
          </button>
        </div>

        {/* 우측 패널: 지출일자 → 합계 */}
        <div className="xp-side fancy-panel narrow mini" onClick={() => document.activeElement?.blur()}>
          <div
            className="xp-side-row xp-side-date scale-095"
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setDateModalOpen(true);
                  }}
                  title="달력 열기"
                >
                  <i className="ri-calendar-2-line" />
                </button>
              </div>
              <span className="xp-weekday">{getWeekdayLabel(date)}</span>
            </div>
          </div>

          <div className="xp-side-row xp-side-sum scale-095">
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
                onDeleteRow={() => clearRow(i)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="xp-bottom-actions">
        <button className="xp-add-rows" onClick={() => addRows(10)}>
          + 10줄 더 추가
        </button>
      </div>

      {/* 모달들 */}
      <CalendarModal
        open={dateModalOpen}
        defaultDate={date}
        titleText="지출일자 날짜선택"
        onPick={(ymd) => {
          setDate(ymd);
          persistLocal(ymd, rows);
        }}
        onClose={() => setDateModalOpen(false)}
      />
      <CalendarModal
        open={loadModalOpen}
        defaultDate={date}
        titleText="불러오기 날짜선택"
        onPick={(ymd) => performLoadForDate(ymd)}
        onClose={() => setLoadModalOpen(false)}
      />

      {/* 출금보류: 드래프트 편집 → 저장 시에만 반영 */}
      {/* ❌ 상단 X 아이콘 제거(showCloseX=false) */}
      <Modal open={holdOpen} onClose={() => setHoldOpen(false)} title="출금보류" width={960} showCloseX={false}>
        <HoldTable
          initialRows={holdRows}
          onSendRow={(r) => receiveFromHold(r)}
          onSaveDraft={(newRows) => {
            try {
              setHoldRows(newRows);
              localStorage.setItem(LS_HOLD_KEY, JSON.stringify(newRows));
            } catch {}
          }}
          onClose={() => setHoldOpen(false)}
        />
      </Modal>
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
          disabled={!row.mainId}
        />
      </td>

      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
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

      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
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

      <td>
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
