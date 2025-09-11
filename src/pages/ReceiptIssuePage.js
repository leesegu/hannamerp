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

// ✅ 새로 분리된 CSS
import "./ReceiptIssuePage.css";

/* ===== 유틸 ===== */
const s = (v) => String(v ?? "").trim();
const parseNumber = (v) => parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10) || 0;
const fmtComma = (n) => (parseNumber(n) ? parseNumber(n).toLocaleString() : "");
const today = () => format(new Date(), "yyyy-MM-dd");
const toDate = (str) => (str ? new Date(str) : null);

// ✅ 최대 품목 행 수(16개 이상 불가 → 최대 15개)
const MAX_ITEMS = 15;

/* 날짜 인풋: .date-field 셸(테두리/라운드/포커스) + compact 옵션 */
const DPInput = forwardRef(function DPInput(
  { value, onClick, placeholder = "날짜", clearable = false, compact = false },
  ref
) {
  return (
    <div
      className={`date-field${compact ? " compact" : ""}`}
      data-clear={clearable ? "true" : "false"}
      onClick={onClick}
    >
      <input
        ref={ref}
        className="date-inner"
        value={value || ""}
        onClick={onClick}
        readOnly
        placeholder={placeholder}
      />
      <i className="ri-calendar-line date-icon" />
    </div>
  );
});

/* 선택 즉시 닫힘 보장 (발행일자/입금날짜용) */
function AutoCloseDate({ selected, onChange, isClearable = false, placeholder = "날짜", compact = false }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const closeNow = () => {
    setTimeout(() => {
      setOpen(false);
      inputRef.current?.blur();
    }, 0);
  };

  const handleSelect = (date) => {
    onChange(date);
    closeNow();
  };

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
      customInput={<DPInput ref={inputRef} placeholder={placeholder} clearable={isClearable} compact={compact} />}
    />
  );
}

/* 영수증이름 콤보: 검색 없음, 선택 시 자동 닫힘 */
function ReceiptNameCombo({ value, onChange }) {
  const options = useMemo(() => ["영수증", "이사정산 영수증", "한남주택관리 영수증"], []);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const onSelect = (val) => {
    onChange(val);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="namecombo" ref={boxRef}>
      <input
        ref={inputRef}
        className="input"
        value={value}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      <i
        className="ri-arrow-down-s-line combo-caret"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      />
      {open && (
        <div className="combo-list">
          <div className="combo-items">
            {options.map((opt) => (
              <div
                key={opt}
                className="combo-item small"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(opt);
                }}
              >
                <div className="ci-name">{opt}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* 코드번호 콤보: 검색 유지, 선택 시 자동 닫힘(항목 높이 축소) + 선택 콜백 */
function CodeCombo({ value, onChange, onSelectOption, options }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const list = useMemo(() => {
    const f = s(filter);
    return options.filter((v) => (f ? v.code.includes(f) || v.name.includes(f) : true)).slice(0, 300);
  }, [filter, options]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const onSelect = (code) => {
    onChange(code);
    setOpen(false);
    setFilter("");
    inputRef.current?.blur();
    onSelectOption?.(code);
  };

  return (
    <div className="codecombo" ref={boxRef}>
      <input
        ref={inputRef}
        className="input"
        value={value}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setFilter(e.target.value);
          setOpen(true);
        }}
      />
      <i
        className="ri-arrow-down-s-line combo-caret"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      />
      {open && (
        <div className="combo-list">
          <div className="combo-search">
            <i className="ri-search-line" />
            <input
              className="combo-search-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="combo-items">
            {list.length === 0 ? (
              <div className="combo-empty">검색 결과가 없습니다</div>
            ) : (
              list.map((v) => (
                <div
                  key={v.id}
                  className="combo-item small"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(v.code);
                  }}
                >
                  <div className="ci-code">{v.code}</div>
                  <div className="ci-name">{v.name}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReceiptIssuePage() {
  const [rows, setRows] = useState([]);
  const [villas, setVillas] = useState([]);
  const [loading, setLoading] = useState(true);

  // 미리보기
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState(null);

  // 모달/폼
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState("create");
  const [editRowId, setEditRowId] = useState(null);

  const [form, setForm] = useState(blankForm());
  const [items, setItems] = useState([blankItem()]);

  // 품목 입력 포커스 제어용 refs
  const itemDateRefs = useRef([]);
  const itemDescRefs = useRef([]);
  const itemQtyRefs = useRef([]);
  const itemPriceRefs = useRef([]);

  // 상단 입력 포커스 제어용 refs
  const unitRef = useRef(null);
  const recipientRef = useRef(null);
  const billingRef = useRef(null);

  // 커서툴팁(내용+금액)
  const [tip, setTip] = useState({ show: false, x: 0, y: 0, content: "" });
  const showTip = (content, e) => setTip({ show: true, x: e.clientX + 12, y: e.clientY + 12, content });
  const moveTip = (e) => setTip((t) => ({ ...t, x: e.clientX + 12, y: e.clientY + 12 }));
  const hideTip = () => setTip((t) => ({ ...t, show: false }));

  function blankForm() {
    return {
      issueDate: today(),
      receiptName: "한남주택관리 영수증",
      code: "",
      address: "",
      villaName: "",
      unitNumber: "",
      recipient: "",
      billingMethod: "",
      depositDate: "",
      note: "",
    };
  }
  function blankItem() {
    return { date: "", description: "", qty: 1, unitPrice: "", amount: 0 };
  }

  /* receipts 구독 */
  useEffect(() => {
    const qx = query(collection(db, "receipts"), orderBy("issueDate", "desc"));
    const unsub = onSnapshot(qx, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        const its = Array.isArray(data.items) ? data.items : [];
        const total = Number(data.totalAmount || 0);
        const summary =
          s(data.description) ||
          (its.length ? (its.length === 1 ? s(its[0].description) : `${s(its[0].description)} 외 ${its.length - 1}건`) : "");
        return {
          id: d.id,
          issueDate: s(data.issueDate || ""),
          receiptName: s(data.receiptName || "한남주택관리 영수증"),
          address: s(data.address || ""),
          villaName: s(data.villaName || ""),
          unitNumber: s(data.unitNumber || ""),
          amount: total,
          description: summary,
          billingMethod: s(data.billingMethod || ""),
          depositDate: s(data.depositDate || ""),
          note: s(data.note || ""),
          code: s(data.code || ""),
          recipient: s(data.recipient || ""),
          items: its,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });
      setRows(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  /* villas 구독 */
  useEffect(() => {
    const qx = query(collection(db, "villas"), orderBy("code", "asc"));
    const unsub = onSnapshot(qx, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, code: s(data.code || ""), name: s(data.name || ""), address: s(data.address || "") };
      });
      setVillas(list);
    });
    return () => unsub();
  }, []);

  /* 툴팁 텍스트 */
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

  /* 목록 컬럼 */
  const columns = useMemo(
    () => [
      { key: "issueDate", label: "발행일자", width: 110 },
      { key: "address", label: "주소", width: 220 },
      { key: "villaName", label: "빌라명", width: 120 },
      { key: "unitNumber", label: "나머지주소", width: 80 },
      { key: "amount", label: "금액", width: 110, render: (row) => (row.amount ? row.amount.toLocaleString() : "") },
      {
        key: "description",
        label: "내용",
        width: 240,
        render: (row) => {
          const summary = s(row.description || "") || "-";
          const tipText = buildTooltip(row);
          return (
            <span
              className="desc-ellipsis"
              onMouseEnter={(e) => showTip(tipText, e)}
              onMouseMove={moveTip}
              onMouseLeave={hideTip}
            >
              {summary}
            </span>
          );
        },
      },
      { key: "billingMethod", label: "청구방법", width: 120 },
      { key: "depositDate", label: "입금날짜", width: 110 },
      { key: "note", label: "비고", width: 160 },
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
    []
  );

  const searchableKeys = [
    "issueDate","address","villaName","unitNumber","description","billingMethod","depositDate","note","code","recipient","receiptName"
  ];

  /* 액션 */
  const onPreview = (row) => { setPreviewRow(row); setPreviewOpen(true); };

  const onEdit = (row) => {
    setEditMode("edit");
    setEditRowId(row.id);
    setForm({
      issueDate: row.issueDate || today(),
      receiptName: row.receiptName || "한남주택관리 영수증",
      code: row.code || "",
      address: row.address || "",
      villaName: row.villaName || "",
      unitNumber: row.unitNumber || "",
      recipient: row.recipient || "",
      billingMethod: row.billingMethod || "",
      depositDate: row.depositDate || "",
      note: row.note || "",
    });
    setItems(
      (row.items || []).length
        ? row.items.map((it) => ({
            date: it.date || "",
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

  /* 코드번호 선택 시 주소/빌라명 자동 기입 */
  useEffect(() => {
    const v = villas.find((x) => x.code === s(form.code));
    if (v) setForm((f) => ({ ...f, address: v.address || "", villaName: v.name || "" }));
  }, [form.code, villas]);

  /* ====== 입력 이동 유틸: 다음 행의 품목으로 포커스 or 폴백 ====== */
  const focusNextRowDescOr = (idx, fallback) => {
    if (items.length > idx + 1 && itemDescRefs.current[idx + 1]) {
      itemDescRefs.current[idx + 1].focus();
    } else {
      fallback?.();
    }
  };

  /* 품목 입력 */
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
  const summaryText = useMemo(() => {
    const nonEmpty = items.filter((it) => s(it.description));
    if (nonEmpty.length === 0) return "";
    if (nonEmpty.length === 1) return s(nonEmpty[0].description);
    return `${s(nonEmpty[0].description)} 외 ${nonEmpty.length - 1}건`;
  }, [items]);

  /* 저장 */
  const [saving, setSaving] = useState(false);
  const saveForm = async () => {
    if (saving) return;
    if (!s(form.issueDate)) return alert("발행일자를 입력하세요.");
    if (!s(form.code)) return alert("코드번호를 선택/입력하세요.");
    if (!s(form.villaName)) return alert("빌라명을 확인하세요.");
    if (totalAmount <= 0) return alert("품목의 합계 금액이 0원입니다.");

    const itemsPayload = items.map((it) => ({
      date: s(it.date),
      description: s(it.description),
      qty: Number(it.qty || 0),
      unitPrice: parseNumber(it.unitPrice),
      amount: Number(it.amount || 0),
    }));

    const payload = {
      issueDate: s(form.issueDate),
      receiptName: s(form.receiptName),
      code: s(form.code),
      address: s(form.address),
      villaName: s(form.villaName),
      unitNumber: s(form.unitNumber),
      recipient: s(form.recipient),
      billingMethod: s(form.billingMethod),
      depositDate: s(form.depositDate),
      note: s(form.note),
      items: itemsPayload,
      totalAmount,
      description: summaryText,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (editMode === "edit" && editRowId) {
        await updateDoc(doc(db, "receipts", editRowId), payload);
      } else {
        await addDoc(collection(db, "receipts"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setEditOpen(false);
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  /* ===== 렌더 ===== */
  return (
    <div className="page-wrapper">
      <PageTitle>영수증발행</PageTitle>

      <div className="receipt-page">
        <DataTable
          columns={columns}
          data={rows}
          searchableKeys={searchableKeys}
          itemsPerPage={10}
          sortKey="issueDate"
          sortOrder="desc"
          onAdd={onAdd}
          addButtonLabel="발행"
          addButtonIcon="🧾"
          onEdit={onEdit}
          onDelete={onDelete}
        />

        {/* 등록/수정 모달 */}
        {editOpen && (
          <>
            <div className="modal-backdrop" onClick={() => setEditOpen(false)} />
            <div className="modal">
              <div className="modal-head">
                <div className="title">{editMode === "edit" ? "영수증 수정" : "영수증 발행"}</div>
                <div className="right">
                  <span className="badge-total">합계 {totalAmount.toLocaleString()} 원</span>
                </div>
              </div>

              <div className="modal-body">
                <div className="grid grid-3">
                  <LabeledInput label="영수증 이름">
                    <ReceiptNameCombo
                      value={form.receiptName}
                      onChange={(val) => setForm((f) => ({ ...f, receiptName: val }))}
                    />
                  </LabeledInput>

                  <LabeledInput label="발행일자">
                    <AutoCloseDate
                      selected={toDate(form.issueDate)}
                      onChange={(date) =>
                        setForm((f) => ({ ...f, issueDate: date ? format(date, "yyyy-MM-dd") : "" }))
                      }
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
                    <input
                      type="text"
                      className="input"
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    />
                  </LabeledInput>

                  <LabeledInput label="빌라명">
                    <input
                      type="text"
                      className="input"
                      value={form.villaName}
                      onChange={(e) => setForm((f) => ({ ...f, villaName: e.target.value }))}
                    />
                  </LabeledInput>

                  <LabeledInput label="나머지주소">
                    <input
                      ref={unitRef}
                      type="text"
                      className="input"
                      value={form.unitNumber}
                      onChange={(e) => setForm((f) => ({ ...f, unitNumber: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") recipientRef.current?.focus(); }}
                    />
                  </LabeledInput>

                  <LabeledInput label="공급받는자">
                    <input
                      ref={recipientRef}
                      type="text"
                      className="input"
                      value={form.recipient}
                      onChange={(e) => setForm((f) => ({ ...f, recipient: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") billingRef.current?.focus(); }}
                    />
                  </LabeledInput>

                  <LabeledInput label="청구방법">
                    <input
                      ref={billingRef}
                      type="text"
                      className="input"
                      value={form.billingMethod}
                      onChange={(e) => setForm((f) => ({ ...f, billingMethod: e.target.value }))}
                    />
                  </LabeledInput>

                  <LabeledInput label="입금날짜">
                    <AutoCloseDate
                      selected={toDate(form.depositDate)}
                      onChange={(date) =>
                        setForm((f) => ({ ...f, depositDate: date ? format(date, "yyyy-MM-dd") : "" }))
                      }
                      isClearable
                    />
                  </LabeledInput>

                  <div className="col-span-3">
                    <LabeledInput label="비고">
                      <input
                        type="text"
                        className="input"
                        value={form.note}
                        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                      />
                    </LabeledInput>
                  </div>
                </div>

                {/* 품목 테이블 */}
                <div className="card section">
                  <div className="table-head center small">
                    <div>날짜</div><div>품목(내용)</div><div>수량</div><div>단가</div><div>금액</div><div></div>
                  </div>

                  {items.map((it, idx) => (
                    <div className="table-row center" key={idx}>
                      <div className="col-date">
                        <DatePicker
                          selected={toDate(it.date)}
                          onChange={(date) => {
                            setItemField(idx, "date", date ? format(date, "yyyy-MM-dd") : "");
                            setTimeout(() => itemDescRefs.current[idx]?.focus(), 0);
                          }}
                          dateFormat="yyyy-MM-dd"
                          locale={ko}
                          isClearable
                          shouldCloseOnSelect
                          popperPlacement="bottom-start"
                          customInput={
                            <DPInput
                              ref={(el) => (itemDateRefs.current[idx] = el)}
                              clearable
                              compact
                            />
                          }
                        />
                      </div>
                      <div>
                        <input
                          ref={(el) => (itemDescRefs.current[idx] = el)}
                          type="text"
                          className="input"
                          value={it.description}
                          onChange={(e) => setItemField(idx, "description", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              focusNextRowDescOr(idx, () => {
                                itemQtyRefs.current[idx]?.focus();
                              });
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
                              focusNextRowDescOr(idx, () => {
                                itemPriceRefs.current[idx]?.focus();
                              });
                            }
                          }}
                        />
                      </div>
                      <div>
                        <input
                          ref={(el) => (itemPriceRefs.current[idx] = el)}
                          type="text"
                          className="input"
                          inputMode="numeric"
                          value={it.unitPrice}
                          onChange={(e) => setItemField(idx, "unitPrice", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              focusNextRowDescOr(idx);
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
                    <button className="btn-outline" onClick={addItem} type="button">+ 항목 추가</button>
                    <div className="sum">합계 <b>{totalAmount.toLocaleString()}</b> 원</div>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn-primary" onClick={saveForm} disabled={saving}>
                  {saving ? "저장 중..." : (editMode === "edit" ? "수정" : "발행")}
                </button>
                <button className="btn-neutral" onClick={() => setEditOpen(false)} disabled={saving}>
                  닫기
                </button>
              </div>
            </div>
          </>
        )}

        {/* 커서 근처 툴팁 */}
        {tip.show && (
          <div className="hover-tooltip" style={{ top: tip.y, left: tip.x }}>
            {tip.content}
          </div>
        )}

        {/* 미리보기 모달 */}
        <ReceiptPreviewModal
          open={previewOpen}
          row={{ ...previewRow, receiptName: previewRow?.receiptName || form.receiptName }}
          onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
        />
      </div>
    </div>
  );
}

/* 라벨 + 인풋 */
function LabeledInput({ label, children, onClickLabel }) {
  return (
    <label className="labeled" onClick={onClickLabel}>
      <span className="lab">{label}</span>
      {children}
    </label>
  );
}
