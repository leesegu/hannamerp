// src/pages/ReceiptIssuePage.js
import React, { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import DataTable from "../components/DataTable";
import PageTitle from "../components/PageTitle";
import ReceiptPreviewModal from "../components/ReceiptPreviewModal";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import "remixicon/fonts/remixicon.css";

import "./ReceiptIssuePage.css";
import { useLocation } from "react-router-dom"; // ✅ 대시보드에서 넘긴 ?row= 파라미터 읽기

/* ===== 유틸 ===== */
const s = (v) => String(v ?? "").trim();
const parseNumber = (v) => parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10) || 0;
const fmtComma = (n) => (parseNumber(n) ? parseNumber(n).toLocaleString() : "");
const today = () => format(new Date(), "yyyy-MM-dd");
const MAX_ITEMS = 15;

/* 안전한 Date 파서 */
function parseToDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    if (v > 20000 && v < 60000) {
      const ms = Math.round((v - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  let sVal = String(v).trim().replace(/[./]/g, "-");
  if (/^\d{2}-\d{2}-\d{2}$/.test(sVal)) {
    const [yy, mm, dd] = sVal.split("-");
    sVal = `20${yy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(sVal)) {
    const d = new Date(`${sVal}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(sVal);
  return isNaN(d.getTime()) ? null : d;
}

/* ✅ 표기 통일용: 어떤 입력이 들어와도 yyyy-MM-dd 로 정규화 */
function normalizeToYMD(v) {
  const d = parseToDate(v);
  return d ? format(d, "yyyy-MM-dd") : s(v);
}

/* ===== 날짜 인풋 ===== */
const DPInput = forwardRef(function DPInput(
  // ✅ placeholder 설명 제거 (요청사항)
  { value, onClick, placeholder = "", clearable = false },
  ref
) {
  return (
    <div className="date-field" data-clear={clearable ? "true" : "false"} onClick={onClick}>
      <input ref={ref} className="date-inner" value={value || ""} onClick={onClick} readOnly placeholder={placeholder} />
      <i className="ri-calendar-line date-icon" />
    </div>
  );
});

function AutoCloseDate({ selected, onChange, isClearable = false, placeholder = "" }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const closeNow = () => setTimeout(() => { setOpen(false); inputRef.current?.blur(); }, 0);
  const handleSelect = (date) => { onChange(date); closeNow(); };
  return (
    <DatePicker
      selected={selected}
      onChange={handleSelect}
      onSelect={handleSelect}
      open={open}
      onInputClick={() => setOpen(true)}
      onClickOutside={closeNow}
      onCalendarClose={() => setOpen(false)}
      preventOpenOnFocus
      shouldCloseOnSelect
      dateFormat="yyyy-MM-dd"
      locale={ko}
      isClearable={isClearable}
      popperPlacement="bottom-start"
      portalId="datepicker-portal"
      // ✅ placeholder 설명 제거
      customInput={<DPInput ref={inputRef} placeholder={placeholder} clearable={isClearable} />}
    />
  );
}

/* ===== 공통 콤보 ===== */
function ComboShell({ children, open, setOpen, boxRef }) {
  useEffect(() => {
    const onDocClick = (e) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [boxRef, setOpen]);
  return <div className="combo-wrap" ref={boxRef}>{children}</div>;
}

function ReceiptNameCombo({ value, onChange }) {
  const options = useMemo(() => ["영수증", "이사정산 영수증", "한남주택관리 영수증"], []);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const onSelect = (val) => { onChange(val); setOpen(false); inputRef.current?.blur(); };

  return (
    <ComboShell open={open} setOpen={setOpen} boxRef={boxRef}>
      <div className="combo-input">
        <input
          ref={inputRef}
          className="input"
          value={value}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        />
        <i className="ri-arrow-down-s-line combo-caret" onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }} />
      </div>
      {open && (
        <div className="combo-pop">
          <div className="combo-panel">
            <div className="combo-items stylish">
              {options.map((opt) => (
                <button key={opt} type="button" className="combo-item btnlike"
                        onMouseDown={(e) => { e.preventDefault(); onSelect(opt); }}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </ComboShell>
  );
}

/* 🔁 CodeCombo (누락된 정의 보강) */
function CodeCombo({ value, onChange, onSelectOption, options }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const list = useMemo(() => {
    const f = s(filter);
    return options.filter((v) => (f ? v.code.includes(f) || v.name.includes(f) : true)).slice(0, 300);
  }, [filter, options]);
  const onSelect = (code) => {
    onChange(code);
    setOpen(false);
    setFilter("");
    inputRef.current?.blur();
    onSelectOption?.(code);
  };

  return (
    <ComboShell open={open} setOpen={setOpen} boxRef={boxRef}>
      <div className="combo-input">
        <input
          ref={inputRef}
          className="input"
          value={value}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => { onChange(e.target.value); setFilter(e.target.value); setOpen(true); }}
        />
        <i className="ri-arrow-down-s-line combo-caret" onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }} />
      </div>
      {open && (
        <div className="combo-pop">
          <div className="combo-panel">
            <div className="combo-search">
              <i className="ri-search-line" />
              <input className="combo-search-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="코드/이름 검색" />
            </div>
            <div className="combo-items stylish">
              {list.length === 0 ? (
                <div className="combo-empty">검색 결과가 없습니다</div>
              ) : (
                list.map((v) => (
                  <button key={v.id} type="button" className="combo-item btnlike"
                          onMouseDown={(e) => { e.preventDefault(); onSelect(v.code); }}>
                    <b className="ci-code">{v.code}</b><span className="ci-name">{v.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </ComboShell>
  );
}

/* ✅ BillingCombo: placeholder 제거(요청사항) + useRef 조건 호출 금지 */
function BillingCombo({ value, onChange, openTick = 0, externInputRef = null }) {
  const options = ["문자", "팩스", "카톡", "이메일", "텔레그램", "보류"];
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const innerRef = useRef(null);
  const inputRef = externInputRef ?? innerRef;

  const onSelect = (val) => { onChange(val); setOpen(false); inputRef.current?.blur(); };

  useEffect(() => {
    if (openTick > 0) {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [openTick, inputRef]);

  return (
    <ComboShell open={open} setOpen={setOpen} boxRef={boxRef}>
      <div className="combo-input">
        <input
          ref={inputRef}
          className="input"
          value={value}
          // ✅ placeholder 설명 제거
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        />
        <i className="ri-arrow-down-s-line combo-caret" onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }} />
      </div>
      {open && (
        <div className="combo-pop">
          <div className="combo-panel">
            <div className="combo-items stylish">
              {options.map((opt) => (
                <button key={opt} type="button" className="combo-item btnlike"
                        onMouseDown={(e) => { e.preventDefault(); onSelect(opt); }}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </ComboShell>
  );
}

/* ===== 메인 ===== */
export default function ReceiptIssuePage() {
  const [rows, setRows] = useState([]);
  const [villas, setVillas] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState("create");
  const [editRowId, setEditRowId] = useState(null);

  const [form, setForm] = useState(blankForm());
  const [items, setItems] = useState([blankItem()]);
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  const itemDateRefs = useRef([]);
  const itemDescRefs = useRef([]);
  const itemQtyRefs = useRef([]);
  const itemPriceRefs = useRef([]);

  const unitRef = useRef(null);
  const recipientRef = useRef(null);
  const receiverRef = useRef(null);
  const billingInputRef = useRef(null);
  const [billingOpenTick, setBillingOpenTick] = useState(0);

  const [tip, setTip] = useState({ show: false, x: 0, y: 0, content: "" });
  const showTip = (content, e) => setTip({ show: true, x: e.clientX + 12, y: e.clientY + 12, content });
  const moveTip = (e) => setTip((t) => ({ ...t, x: e.clientX + 12, y: e.clientY + 12 }));
  const hideTip = () => setTip((t) => ({ ...t, show: false }));

  // ✅ 대시보드 미수금 패널에서 넘어온 row 하이라이트용 파라미터
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const focusRowId = params.get("row") || ""; // DataTable의 focusId로 넘김

  function blankForm() {
    return {
      issueDate: today(),
      receiptName: "한남주택관리 영수증",
      code: "",
      address: "",
      villaName: "",
      unitNumber: "",
      recipient: "",
      receiver: "",
      billingMethod: "",
      depositDate: "",
      note: "",
    };
  }
  function blankItem() {
    return { date: "", description: "", qty: 1, unitPrice: "", amount: 0 };
  }

  /* 목록/빌라 로딩 */
  useEffect(() => {
    const qx = query(collection(db, "receipts"), orderBy("issueDate", "desc"));
    return onSnapshot(qx, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        const its = Array.isArray(data.items) ? data.items : [];
        const total = Number((data.totalAmount ?? data.amount) || 0);
        const summary =
          s(data.description) ||
          (its.length ? (its.length === 1 ? s(its[0].description) : `${s(its[0].description)} 외 ${its.length - 1}건`) : "");
        return {
          id: d.id,
          // ✅ 날짜 표기 정규화 (25-09-12 → 2025-09-12)
          issueDate: normalizeToYMD(data.issueDate || ""),
          receiptName: s(data.receiptName || "한남주택관리 영수증"),
          address: s(data.address || ""),
          villaName: s(data.villaName || ""),
          unitNumber: s(data.unitNumber || ""),
          amount: total,
          description: summary,
          billingMethod: s(data.billingMethod || ""),
          receiver: s(data.receiver || ""),
          // ✅ 날짜 표기 정규화
          depositDate: normalizeToYMD(data.depositDate || ""),
          note: s(data.note || ""),
          code: s(data.code || ""),
          recipient: s(data.recipient || ""),
          items: its,
        };
      });
      setRows(list);
    });
  }, []);

  useEffect(() => {
    const qx = query(collection(db, "villas"), orderBy("code", "asc"));
    return onSnapshot(qx, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, code: s(data.code || ""), name: s(data.name || ""), address: s(data.address || "") };
      });
      setVillas(list);
    });
  }, []);

  const buildTooltip = (row) => {
    const arr = Array.isArray(row.items) ? row.items : [];
    if (!arr.length) return row.amount ? `총액 : ${Number(row.amount).toLocaleString()}원` : "";
    const lines = arr.map((it) => {
      const desc = s(it?.description);
      const amt = Number(it?.amount ?? (Number(it?.qty || 0) * parseNumber(it?.unitPrice)));
      return `${desc || "-"} : ${isNaN(amt) ? 0 : amt.toLocaleString()}원`;
    });
    return lines.join("\n");
  };

  /* ✅ 칼럼 순서: 내용 → 금액 */
  const columns = useMemo(
    () => [
      { key: "issueDate", label: "발행일자", width: 110 },
      { key: "address", label: "주소", width: 220 },
      { key: "villaName", label: "빌라명", width: 120 },
      { key: "unitNumber", label: "나머지주소", width: 80 },
      {
        key: "description",
        label: "내용",
        width: 260,
        render: (row) => {
          const summary = s(row.description || "") || "-";
          const tipText = buildTooltip(row);
          return (
            <span className="desc-ellipsis" onMouseEnter={(e) => showTip(tipText, e)} onMouseMove={moveTip} onMouseLeave={hideTip}>
              {summary}
            </span>
          );
        },
      },
      { key: "amount", label: "금액", width: 110, render: (row) => (row.amount ? row.amount.toLocaleString() : "") },
      { key: "receiver", label: "받는사람", width: 120 },
      { key: "billingMethod", label: "청구방법", width: 120 },
      { key: "depositDate", label: "입금날짜", width: 110 },
      // ✅ 비고가 길어도 테이블을 밀지 않게: 말줄임 + 마우스오버 툴팁
      {
        key: "note",
        label: "비고",
        width: 160,
        render: (row) => {
          const note = s(row.note);
          if (!note) return "";
          return (
            <span
              className="note-ellipsis"
              onMouseEnter={(e) => showTip(note, e)}
              onMouseMove={moveTip}
              onMouseLeave={hideTip}
              title=""
            >
              {note}
            </span>
          );
        },
      },
      {
        key: "receipt",
        label: "영수증",
        width: 80,
        render: (row) => (
          <button className="receipt-icon" title="영수증 미리보기" onClick={() => onPreview(row)}>
            <span className="emoji">📑</span>
          </button>
        ),
      },
    ],
    [] // eslint-disable-line
  );

  const searchableKeys = [
    "issueDate","address","villaName","unitNumber","description","billingMethod","depositDate","note","code","recipient","receiver","receiptName"
  ];

  const unpaidRows = useMemo(() => rows.filter((r) => !s(r.depositDate)), [rows]);
  const unpaidSum = useMemo(() => unpaidRows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0), [unpaidRows]);
  const shownData = useMemo(() => (unpaidOnly ? unpaidRows : rows), [unpaidOnly, rows, unpaidRows]);

  const onPreview = (row) => { setPreviewRow(row); setPreviewOpen(true); };

  /* ===== 저장/수정 ===== */
  const computeItems = () =>
    items
      .filter((it) => s(it.description) || parseNumber(it.unitPrice) || Number(it.qty))
      .map((it) => {
        const qty = Number(it.qty || 0);
        const unitPrice = parseNumber(it.unitPrice);
        const amount = qty * unitPrice;
        return {
          date: s(it.date),
          description: s(it.description),
          qty,
          unitPrice,
          amount,
        };
      });

  const computeTotal = (its) => its.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  const handleSubmit = async () => {
    const issueDate = s(form.issueDate);
    if (!issueDate) { alert("발행일자를 선택하세요."); return; }

    const payload = {
      issueDate,
      receiptName: s(form.receiptName) || "한남주택관리 영수증",
      code: s(form.code),
      address: s(form.address),
      villaName: s(form.villaName),
      unitNumber: s(form.unitNumber),
      recipient: s(form.recipient),
      receiver: s(form.receiver),
      billingMethod: s(form.billingMethod),
      depositDate: s(form.depositDate),
      note: s(form.note),
      items: computeItems(),
    };
    payload.totalAmount = computeTotal(payload.items);
    payload.description = payload.items.length
      ? (payload.items.length === 1 ? s(payload.items[0].description) : `${s(payload.items[0].description)} 외 ${payload.items.length - 1}건`)
      : s(form.note);

    try {
      if (editMode === "edit" && editRowId) {
        await updateDoc(doc(db, "receipts", editRowId), { ...payload, updatedAt: serverTimestamp() });
        alert("수정되었습니다.");
      } else {
        await addDoc(collection(db, "receipts"), { ...payload, createdAt: serverTimestamp() });
        alert("발행되었습니다.");
      }
      setEditOpen(false);
      setForm(blankForm());
      setItems([blankItem()]);
      setEditMode("create");
      setEditRowId(null);
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  /* 편집 열기/삭제/추가 */
  const onEdit = (row) => {
    setEditMode("edit");
    setEditRowId(row.id);
    setForm({
      // ✅ 편집 모달에 들어올 때도 yyyy-MM-dd 로 보이도록 정규화
      issueDate: normalizeToYMD(row.issueDate || today()),
      receiptName: row.receiptName || "한남주택관리 영수증",
      code: row.code || "",
      address: row.address || "",
      villaName: row.villaName || "",
      unitNumber: row.unitNumber || "",
      recipient: row.recipient || "",
      receiver: row.receiver || "",
      billingMethod: row.billingMethod || "",
      depositDate: normalizeToYMD(row.depositDate || ""),
      note: row.note || "",
    });
    setItems(
      (row.items || []).length
        ? row.items.map((it) => ({
            date: normalizeToYMD(it.date || ""),
            description: s(it.description || ""),
            qty: Number(it.qty || 0),
            unitPrice: fmtComma(it.unitPrice),
            amount: Number(it.amount || 0),
          }))
        : [blankItem()]
    );
    setEditOpen(true);
  };

  const onDelete = async (row) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "receipts", row.id));
  };

  const onAdd = () => {
    setEditMode("create");
    setEditRowId(null);
    setForm(blankForm());
    setItems([blankItem()]);
    setEditOpen(true);
  };

  /* 코드 선택 시 주소/빌라명 자동 채움 */
  useEffect(() => {
    const v = villas.find((x) => x.code === s(form.code));
    if (v) setForm((f) => ({ ...f, address: v.address || "", villaName: v.name || "" }));
  }, [form.code, villas]);

  const ensureNextRowAndFocusDesc = (idx) => {
    if (items.length <= idx + 1) {
      setItems((l) => {
        if (l.length <= idx + 1) return [...l, blankItem()];
        return l;
      });
      setTimeout(() => { itemDescRefs.current[idx + 1]?.focus(); }, 0);
    } else {
      itemDescRefs.current[idx + 1]?.focus();
    }
  };

  const setItemField = (idx, key, value) => {
    setItems((list) => {
      const next = [...list];
      const cur = { ...next[idx] };
      if (key === "qty") cur.qty = parseNumber(value) || 0;
      else if (key === "unitPrice") {
        const only = String(value || "").replace(/[^0-9]/g, "");
        cur.unitPrice = only.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      } else cur[key] = value;
      const up = parseNumber(cur.unitPrice);
      cur.amount = (Number(cur.qty || 0) * up) || 0;
      next[idx] = cur;
      return next;
    });
  };

  const addItem = () => {
    setItems((l) => {
      if (l.length >= MAX_ITEMS) {
        alert(`품목은 최대 ${MAX_ITEMS}개까지 추가할 수 있습니다.`);
        return l;
      }
      return [...l, blankItem()];
    });
  };

  const removeItem = (idx) => setItems((l) => (l.length > 1 ? l.filter((_, i) => i !== idx) : l));

  const totalAmount = useMemo(() => items.reduce((s2, it) => s2 + (Number(it.amount) || 0), 0), [items]);

  /* ====== Enter 이동(요청 동선) ====== */
  const onEnterTo = (nextAction) => (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    nextAction?.();
  };

  return (
    <div className="page-wrapper">
      <PageTitle>영수증발행</PageTitle>

      <div id="datepicker-portal" />

      <div className="receipt-page">
        <DataTable
          columns={columns}
          data={shownData}
          searchableKeys={searchableKeys}
          itemsPerPage={15}
          sortKey="issueDate"
          sortOrder="desc"
          onAdd={onAdd}
          addButtonLabel="발행"
          addButtonIcon="🧾"
          onEdit={onEdit}
          onDelete={onDelete}
          enableExcel={true}
          collectionName="receipts"
          appendWithoutId={true}
          excelFields={[
            "issueDate","address","villaName","unitNumber","amount","description",
            "receiver","billingMethod","depositDate","note","code","recipient","receiptName"
          ]}
          leftControls={
            <div className="chip-row">
              <button
                type="button"
                className={`btn-chip ${unpaidOnly ? "on" : ""}`}
                onClick={() => setUnpaidOnly((v) => !v)}
                title="입금날짜가 비어있는 항목만 보기"
              >
                미수금
              </button>
              <div className="badge-unpaid-sum">
                합계&nbsp;<b>{unpaidSum.toLocaleString()}</b>&nbsp;원
              </div>
            </div>
          }
          focusId={focusRowId}  // ✅ 대시보드에서 넘어온 특정 영수증 행을 하이라이트/스크롤
          rowIdKey="id"         // ✅ focus용 키 지정 (이게 없어서 하이라이트가 안 보였음)
        />

        {editOpen && (
          <>
            <div className="modal-backdrop" onClick={() => setEditOpen(false)} />
            <div className="modal modal-neo modal-compact">
              <div className="modal-head">
                <div className="title">{editMode === "edit" ? "영수증 수정" : "영수증 발행"}</div>
                <div className="right">
                  <span className="badge-total">합계 {totalAmount.toLocaleString()} 원</span>
                </div>
              </div>

              <div className="modal-body">
                <div className="neo-form-shell">
                  <div className="neo-form-grid grid-3">
                    <LabeledInput label="영수증 이름">
                      <ReceiptNameCombo value={form.receiptName} onChange={(val) => setForm((f) => ({ ...f, receiptName: val }))} />
                    </LabeledInput>

                    <LabeledInput label="발행일자">
                      <AutoCloseDate
                        selected={parseToDate(form.issueDate)}
                        onChange={(date) => setForm((f) => ({ ...f, issueDate: date ? format(date, "yyyy-MM-dd") : "" }))}
                      />
                    </LabeledInput>

                    <LabeledInput label="코드번호">
                      <CodeCombo
                        value={form.code}
                        onChange={(val) => setForm((f) => ({ ...f, code: val }))}
                        onSelectOption={() => unitRef.current?.focus()}
                        options={villas}
                      />
                    </LabeledInput>

                    <LabeledInput label="주소">
                      <input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
                    </LabeledInput>

                    <LabeledInput label="빌라명">
                      <input className="input" value={form.villaName} onChange={(e) => setForm((f) => ({ ...f, villaName: e.target.value }))} />
                    </LabeledInput>

                    <LabeledInput label="나머지주소">
                      <input
                        ref={unitRef}
                        className="input"
                        value={form.unitNumber}
                        onChange={(e) => setForm((f) => ({ ...f, unitNumber: e.target.value }))}
                        onKeyDown={onEnterTo(() => recipientRef.current?.focus())}
                      />
                    </LabeledInput>

                    <LabeledInput label="공급받는자">
                      <input
                        ref={recipientRef}
                        className="input"
                        value={form.recipient}
                        onChange={(e) => setForm((f) => ({ ...f, recipient: e.target.value }))}
                        onKeyDown={onEnterTo(() => receiverRef.current?.focus())}
                      />
                    </LabeledInput>

                    <LabeledInput label="받는 사람">
                      <input
                        ref={receiverRef}
                        className="input"
                        value={form.receiver}
                        onChange={(e) => setForm((f) => ({ ...f, receiver: e.target.value }))}
                        onKeyDown={onEnterTo(() => {
                          setBillingOpenTick((t) => t + 1);
                          setTimeout(() => billingInputRef.current?.focus(), 0);
                        })}
                      />
                    </LabeledInput>

                    <LabeledInput label="청구방법">
                      <BillingCombo
                        value={form.billingMethod}
                        onChange={(val) => setForm((f) => ({ ...f, billingMethod: val }))}
                        openTick={billingOpenTick}
                        externInputRef={billingInputRef}
                      />
                    </LabeledInput>

                    <LabeledInput label="입금날짜">
                      <AutoCloseDate
                        selected={parseToDate(form.depositDate)}
                        onChange={(date) => setForm((f) => ({ ...f, depositDate: date ? format(date, "yyyy-MM-dd") : "" }))}
                        isClearable
                      />
                    </LabeledInput>

                    <LabeledInput label="비고">
                      <input className="input" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
                    </LabeledInput>

                    <div className="neo-empty" />
                  </div>
                </div>

                {/* 품목 테이블 */}
                <div className="card section neo-items">
                  <div className="table-head center small">
                    <div>날짜</div><div>품목(내용)</div><div>수량</div><div>단가</div><div>금액</div><div></div>
                  </div>

                  {items.map((it, idx) => (
                    <div className="table-row center" key={idx}>
                      <div className="col-date">
                        <div className="date-item">
                          <DatePicker
                            selected={parseToDate(it.date)}
                            onChange={(date) => {
                              setItemField(idx, "date", date ? format(date, "yyyy-MM-dd") : "");
                              setTimeout(() => itemDescRefs.current[idx]?.focus(), 0);
                            }}
                            dateFormat="yyyy-MM-dd"
                            locale={ko}
                            isClearable
                            shouldCloseOnSelect
                            popperPlacement="bottom-start"
                            portalId="datepicker-portal"
                            // ✅ placeholder 설명 제거
                            customInput={<DPInput ref={(el) => (itemDateRefs.current[idx] = el)} clearable />}
                          />
                        </div>
                      </div>
                      <div>
                        <input
                          ref={(el) => (itemDescRefs.current[idx] = el)}
                          className="input"
                          value={it.description}
                          onChange={(e) => setItemField(idx, "description", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              itemPriceRefs.current[idx]?.focus();
                            }
                          }}
                        />
                      </div>
                      <div>
                        <input
                          ref={(el) => (itemQtyRefs.current[idx] = el)}
                          type="number"
                          className="input"
                          min="0"
                          value={it.qty}
                          onChange={(e) => setItemField(idx, "qty", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              itemPriceRefs.current[idx]?.focus();
                            }
                          }}
                        />
                      </div>
                      <div>
                        <input
                          ref={(el) => (itemPriceRefs.current[idx] = el)}
                          className="input"
                          inputMode="numeric"
                          value={it.unitPrice}
                          onChange={(e) => setItemField(idx, "unitPrice", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              ensureNextRowAndFocusDesc(idx);
                            }
                          }}
                        />
                      </div>
                      <div className="amount">{(Number(it.amount) || 0).toLocaleString()} 원</div>
                      <div className="row-actions">
                        <button className="icon-btn danger" title="행 삭제" onClick={() => removeItem(idx)}>
                          <i className="ri-close-line" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="table-foot">
                    <button className="btn-outline add-item" onClick={addItem} type="button">
                      <i className="ri-add-line" /> 항목 추가
                    </button>
                    <div className="sum">합계 <b>{totalAmount.toLocaleString()}</b> 원</div>
                  </div>
                </div>
              </div>

              <div className="modal-actions neo-actions">
                <button className="btn-primary same btn-lg" onClick={handleSubmit}>
                  {editMode === "edit" ? "수정" : "발행"}
                </button>
                <button className="btn-neutral same btn-lg" onClick={() => setEditOpen(false)}>
                  닫기
                </button>
              </div>
            </div>
          </>
        )}

        {tip.show && <div className="hover-tooltip" style={{ top: tip.y, left: tip.x }}>{tip.content}</div>}

        <ReceiptPreviewModal
          open={previewOpen}
          row={{ ...previewRow, receiptName: previewRow?.receiptName || form.receiptName }}
          onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
        />
      </div>
    </div>
  );
}

function LabeledInput({ label, children, onClickLabel }) {
  return (
    <label className="labeled" onClick={onClickLabel}>
      <span className="lab">{label}</span>
      {children}
    </label>
  );
}
