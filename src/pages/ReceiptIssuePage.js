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
import ReceiptPreviewModal from "../components/ReceiptPreviewModal"; // ✅ 미리보기 분리

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import "remixicon/fonts/remixicon.css";

/* ===== 유틸 ===== */
const s = (v) => String(v ?? "").trim();
const parseNumber = (v) => parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10) || 0;
const fmtComma = (n) => (parseNumber(n) ? parseNumber(n).toLocaleString() : "");
const today = () => format(new Date(), "yyyy-MM-dd");
const toDate = (str) => (str ? new Date(str) : null);

/* 달력 커스텀 인풋: 어디를 눌러도 열림 */
const DPInput = forwardRef(function DPInput(
  { value, onClick, placeholder = "날짜", className = "ri-calendar-line dp-input" },
  ref
) {
  return (
    <div className="date-input" onClick={onClick}>
      <i className="ri-calendar-line" />
      <input
        ref={ref}
        className={className}
        value={value || ""}
        onClick={onClick}
        readOnly
        placeholder={placeholder}
      />
    </div>
  );
});

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

  const issueRef = useRef(null);
  const depositRef = useRef(null);
  const itemDateRefs = useRef([]);

  // 커서 근처 툴팁(내용+금액)
  const [tip, setTip] = useState({ show: false, x: 0, y: 0, content: "" });
  const showTip = (content, e) => setTip({ show: true, x: e.clientX + 12, y: e.clientY + 12, content });
  const moveTip = (e) => setTip((t) => ({ ...t, x: e.clientX + 12, y: e.clientY + 12 }));
  const hideTip = () => setTip((t) => ({ ...t, show: false }));

  function blankForm() {
    return {
      issueDate: today(),
      receiptName: "한남주택관리 영수증", // ✅ 기본 영수증 이름
      code: "",
      address: "",
      villaName: "",
      unitNumber: "",
      recipient: "",
      depositorName: "",      // 유지(요청에는 제거 언급 X, 저장은 계속)
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
          depositorName: s(data.depositorName || ""),
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

  /* villas(코드별빌라) 구독 */
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

  /* 툴팁(내용+금액) */
  const buildTooltip = (row) => {
    const arr = Array.isArray(row.items) ? row.items : [];
    if (!arr.length) {
      return row.amount ? `총액 : ${Number(row.amount).toLocaleString()}원` : "";
    }
    const lines = arr.map((it) => {
      const desc = s(it?.description);
      const amt = Number(it?.amount ?? (Number(it?.qty || 0) * parseNumber(it?.unitPrice)));
      return `${desc || "-"} : ${isNaN(amt) ? 0 : amt.toLocaleString()}원`;
    });
    return lines.join("\n");
  };

  /* 컬럼: 헤더 '영수증'은 텍스트만, 셀 아이콘은 테두리 없이 */
  const columns = useMemo(
    () => [
      { key: "issueDate", label: "발행일자", width: 110 },
      { key: "address", label: "주소", width: 220 },
      { key: "villaName", label: "빌라명", width: 120 },
      { key: "unitNumber", label: "호수", width: 80 },
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
        label: "영수증", // ✅ 텍스트만
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
    "issueDate","address","villaName","unitNumber","description","billingMethod","depositDate","note","code","recipient","depositorName","receiptName"
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
      depositorName: row.depositorName || "",
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

  /* 코드번호 → 주소/빌라명 자동 기입 */
  useEffect(() => {
    const v = villas.find((x) => x.code === s(form.code));
    if (v) setForm((f) => ({ ...f, address: v.address || "", villaName: v.name || "" }));
  }, [form.code, villas]);

  /* 발행일자 선택 → 기존 행 중 '빈 날짜'만 자동 기입 */
  useEffect(() => {
    if (!form.issueDate) return;
    setItems((list) => list.map((it) => (s(it.date) ? it : { ...it, date: form.issueDate })));
  }, [form.issueDate]);

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
  const addItem = () => setItems((l) => [...l, blankItem()]);
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
    if (!s(form.villaName)) return alert("빌라명을 확인하세요. (코드번호 선택 시 자동 기입)");
    if (!s(form.unitNumber)) return alert("호수를 입력하세요.");
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
      receiptName: s(form.receiptName),   // ✅ 저장
      code: s(form.code),
      address: s(form.address),
      villaName: s(form.villaName),
      unitNumber: s(form.unitNumber),
      recipient: s(form.recipient),
      depositorName: s(form.depositorName),
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
    <div className="receipt-page">
      <PageTitle title="영수증 발행 내역" subtitle="발행/수정/미리보기 및 저장" />

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

            {/* 상단 기본 정보 */}
            <div className="grid grid-3">
              {/* 영수증 이름: 입력/드롭다운 병행 */}
              <LabeledInput label="영수증 이름">
                <input
                  type="text"
                  list="receiptNameList"
                  className="input"
                  value={form.receiptName}
                  onChange={(e) => setForm((f) => ({ ...f, receiptName: e.target.value }))}
                  placeholder="영수증 이름 입력 또는 선택"
                />
                <datalist id="receiptNameList">
                  <option value="영수증" />
                  <option value="이사정산 영수증" />
                  <option value="한남주택관리 영수증" />
                </datalist>
              </LabeledInput>

              <LabeledInput label="발행일자" onClickLabel={() => issueRef.current?.click()}>
                <DatePicker
                  selected={toDate(form.issueDate)}
                  onChange={(date) => setForm((f) => ({ ...f, issueDate: format(date, "yyyy-MM-dd") }))}
                  dateFormat="yyyy-MM-dd"
                  locale={ko}
                  popperPlacement="bottom-start"
                  customInput={<DPInput ref={issueRef} />}
                />
              </LabeledInput>

              <LabeledInput label="코드번호">
                <input
                  type="text"
                  list="villaCodes"
                  className="input"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="코드번호 입력 또는 선택"
                />
                <datalist id="villaCodes">
                  {villas.map((v) => (
                    <option key={v.id} value={v.code} label={`${v.code} - ${v.name}`} />
                  ))}
                </datalist>
              </LabeledInput>

              <LabeledInput label="호수">
                <input
                  type="text"
                  className="input"
                  value={form.unitNumber}
                  onChange={(e) => setForm((f) => ({ ...f, unitNumber: e.target.value }))}
                  placeholder="예: 302호"
                />
              </LabeledInput>

              <LabeledInput label="주소">
                <input
                  type="text"
                  className="input"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="코드 선택 시 자동 기입"
                />
              </LabeledInput>

              <LabeledInput label="빌라명">
                <input
                  type="text"
                  className="input"
                  value={form.villaName}
                  onChange={(e) => setForm((f) => ({ ...f, villaName: e.target.value }))}
                  placeholder="코드 선택 시 자동 기입"
                />
              </LabeledInput>

              <LabeledInput label="공급받는자">
                <input
                  type="text"
                  className="input"
                  value={form.recipient}
                  onChange={(e) => setForm((f) => ({ ...f, recipient: e.target.value }))}
                  placeholder="예: 건물주"
                />
              </LabeledInput>

              <LabeledInput label="입금자명">
                <input
                  type="text"
                  className="input"
                  value={form.depositorName}
                  onChange={(e) => setForm((f) => ({ ...f, depositorName: e.target.value }))}
                  placeholder="예: 온수대통 건물주"
                />
              </LabeledInput>

              <LabeledInput label="청구방법">
                <input
                  type="text"
                  className="input"
                  value={form.billingMethod}
                  onChange={(e) => setForm((f) => ({ ...f, billingMethod: e.target.value }))}
                  placeholder="예: 계좌이체 / 현금 / MMS요청 등"
                />
              </LabeledInput>

              <LabeledInput label="입금날짜" onClickLabel={() => depositRef.current?.click()}>
                <DatePicker
                  selected={toDate(form.depositDate)}
                  onChange={(date) => setForm((f) => ({ ...f, depositDate: date ? format(date, "yyyy-MM-dd") : "" }))}
                  dateFormat="yyyy-MM-dd"
                  locale={ko}
                  isClearable
                  placeholderText="선택(선택 시 클릭)"
                  popperPlacement="bottom-start"
                  customInput={<DPInput ref={depositRef} />}
                />
              </LabeledInput>

              <LabeledInput label="비고">
                <input
                  type="text"
                  className="input"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="비고 메모"
                />
              </LabeledInput>
            </div>

            {/* 품목 테이블 */}
            <div className="card section">
              <div className="table-head">
                <div>날짜</div><div>품목(내용)</div><div>수량</div><div>단가</div><div>금액</div><div></div>
              </div>

              {items.map((it, idx) => (
                <div className="table-row" key={idx}>
                  <div onClick={() => itemDateRefs.current[idx]?.click()}>
                    <DatePicker
                      selected={toDate(it.date)}
                      onChange={(date) => setItemField(idx, "date", date ? format(date, "yyyy-MM-dd") : "")}
                      dateFormat="yyyy-MM-dd"
                      locale={ko}
                      isClearable
                      placeholderText="날짜"
                      popperPlacement="bottom-start"
                      customInput={<DPInput ref={(el) => (itemDateRefs.current[idx] = el)} />}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      className="input"
                      value={it.description}
                      onChange={(e) => setItemField(idx, "description", e.target.value)}
                      placeholder="예: 품입, 아이트럼 교체"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      className="input"
                      min="0"
                      value={it.qty}
                      onChange={(e) => setItemField(idx, "qty", e.target.value)}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      className="input"
                      inputMode="numeric"
                      value={it.unitPrice}
                      onChange={(e) => setItemField(idx, "unitPrice", e.target.value)}
                      placeholder="예: 20,000"
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

            {/* 액션: 수정/발행 레이블 분기 */}
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

      {/* 페이지 전용 스타일 */}
      <style>{`
        .receipt-page { padding: 14px; }
        .grid { display: grid; gap: 12px; }
        .grid-3 { grid-template-columns: repeat(3, 1fr); }
        @media (max-width: 1024px) { .grid-3 { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px)  { .grid-3 { grid-template-columns: 1fr; } }

        .input, .date-input input {
          width: 100%; border: 1px solid #e5e7eb; border-radius: 10px;
          padding: 10px 12px; font-size: 14px; outline: none;
          transition: box-shadow .15s, border-color .15s, background .15s; background:#fff;
        }
        .input:focus, .date-input:focus-within { border-color: #c7d2fe; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
        .date-input { display:flex; align-items:center; gap:8px; border:1px solid #e5e7eb; border-radius:10px; padding:8px 10px; cursor:pointer; }
        .date-input i { color:#7A5FFF; font-size:16px; }
        .dp-input { border:none; padding:0; height:20px; }

        /* 영수증 아이콘(테두리 제거) */
        .receipt-icon { background: transparent; border: none; padding: 0; cursor: pointer; line-height: 1; }
        .receipt-icon .emoji { font-size: 18px; }

        /* 테이블/모달/버튼 공통 */
        .card { background:#fff; border:1px solid #eef2f7; border-radius:14px; box-shadow:0 12px 30px rgba(16,24,40,0.06); padding:14px; }
        .section { margin-top: 10px; }
        .table-head, .table-row { display:grid; grid-template-columns: 150px 1fr 110px 160px 160px 52px; align-items:center; }
        .table-head { background:#fafafa; padding:10px 12px; font-weight:700; border-bottom:1px solid #e5e7eb; border-radius:10px 10px 0 0; }
        .table-row { padding:8px 12px; border-bottom:1px solid #f1f5f9; gap:10px; }
        .table-row .amount { text-align:right; padding-right:6px; font-weight:600; color:#111827; }
        .row-actions { display:flex; justify-content:flex-end; }
        .table-foot { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#fff; border-top:1px solid #e5e7eb; border-radius:0 0 10px 10px; }
        .btn-outline { background:#fff; border:1px dashed #c7d2fe; color:#5b5bd6; padding:8px 12px; border-radius:10px; font-weight:700; cursor:pointer; }
        .btn-outline:hover { background:#f5f7ff; }
        .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.25); z-index:1000; }
        .modal { position:fixed; top:6vh; left:50%; transform:translateX(-50%); width:1000px; max-width:96vw; max-height:88vh; overflow:auto; z-index:1001; background:#fff; border:1px solid #eef2f7; border-radius:14px; box-shadow:0 12px 30px rgba(16,24,40,0.06); padding:14px; }
        .modal-head { display:flex; align-items:center; justify-content:space-between; padding:4px 4px 12px 4px; margin-bottom:8px; border-bottom:1px solid #eef2f7; }
        .modal-head .title { font-weight:800; font-size:18px; }
        .badge-total { background:#f5f3ff; color:#5b5bd6; border:1px solid #d9d6ff; padding:6px 10px; border-radius:999px; font-weight:700; }
        .modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }
        .btn-primary { background:#7A5FFF; color:#fff; border:2px solid transparent; border-radius:10px; padding:10px 16px; font-weight:700; cursor:pointer; }
        .btn-primary:hover { background:#8F7CFF; border-color:#BFAEFF; box-shadow:0 0 0 3px rgba(122,95,255,.25); }
        .btn-primary:disabled { opacity:.6; cursor:not-allowed; }
        .btn-neutral { background:#eef2f7; color:#111; border:2px solid transparent; border-radius:10px; padding:10px 16px; font-weight:700; cursor:pointer; }

        /* 내용 말줄임 & 커서툴팁 */
        .desc-ellipsis {
          display: inline-block;
          max-width: 260px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          vertical-align: middle;
          cursor: help;
        }
        .hover-tooltip {
          position: fixed;
          z-index: 1500;
          max-width: 460px;
          white-space: pre-wrap;
          background: #111827;
          color: #fff;
          padding: 10px 12px;
          border-radius: 10px;
          box-shadow: 0 12px 28px rgba(0,0,0,0.25);
          pointer-events: none;
          font-size: 13px;
          line-height: 1.55;
        }
      `}</style>

      {/* 미리보기 모달 — 별도 파일 */}
      <ReceiptPreviewModal
        open={previewOpen}
        row={{ ...previewRow, receiptName: previewRow?.receiptName || form.receiptName }}
        onClose={() => { setPreviewOpen(false); setPreviewRow(null); }}
      />
    </div>
  );
}

/* 라벨 + 인풋 */
function LabeledInput({ label, children, onClickLabel }) {
  return (
    <label className="labeled" onClick={onClickLabel}>
      <span className="lab">{label}</span>
      {children}
      <style>{`
        .labeled { display:flex; flex-direction:column; gap:6px; cursor: default; }
        .labeled .lab { font-size: 13px; font-weight: 700; color:#111827; }
      `}</style>
    </label>
  );
}
