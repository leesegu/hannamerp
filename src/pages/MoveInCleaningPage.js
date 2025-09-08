// src/pages/MoveInCleaningPage.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import DataTable from "../components/DataTable";
import PageTitle from "../components/PageTitle";

/* ✅ 날짜 선택용 */
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";

/* ===== 유틸 ===== */
const s = (v) => String(v ?? "").trim();
const parseNumber = (v) =>
  parseInt(String(v ?? "").replace(/[^0-9\-]/g, ""), 10) || 0;

const fmtComma = (n) => {
  const num = parseNumber(n);
  return num === 0 ? "" : num.toLocaleString();
};

const fmtDate = (v) => {
  if (!v) return "";
  try {
    if (typeof v?.toDate === "function") {
      const d = v.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
    if (v instanceof Date) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, "0");
      const dd = String(v.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
    return s(v); // yyyy-MM-dd 가정
  } catch {
    return s(v);
  }
};

const strToDate = (str) => {
  const v = s(str);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [yy, mm, dd] = v.split("-").map((x) => parseInt(x, 10));
  const d = new Date(yy, mm - 1, dd);
  return isNaN(d.getTime()) ? null : d;
};

/* ===== 간단 모달 (상단 X 아이콘 제거됨) ===== */
function SimpleModal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-[720px] max-w-[92vw] rounded-xl shadow-xl">
        <div className="px-5 py-3 border-b flex items-center">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          {/* ❌ 상단 X 아이콘 삭제 */}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ===== 등록/수정 폼 ===== */
function EditForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState(() => ({
    id: initial?.id ?? "",
    settleDate: fmtDate(initial?.settleDate) || "",
    receivedDate: fmtDate(initial?.receivedDate) || "",
    villaName: s(initial?.villaName) || "",
    unitNumber: s(initial?.unitNumber) || "",
    depositIn: fmtComma(initial?.depositIn) || "",
    payoutOut: fmtComma(initial?.payoutOut) || "",
    depositor: s(initial?.depositor) || "",
    vendor: s(initial?.vendor) || "",
    status: s(initial?.status) || "미접수", // ✅ 기본값 변경
    note: s(initial?.note) || "",
  }));

  /* ✅ 포커스 이동을 위한 ref */
  const villaRef = useRef(null);
  const unitRef = useRef(null);
  const depositRef = useRef(null);
  const payoutRef = useRef(null);

  const handleChange = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const handleAmount = (key, val) =>
    handleChange(key, fmtComma(parseNumber(val)));

  const diff = parseNumber(form.depositIn) - parseNumber(form.payoutOut);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      settleDate: s(form.settleDate),     // yyyy-MM-dd
      receivedDate: s(form.receivedDate), // yyyy-MM-dd
      villaName: s(form.villaName),
      unitNumber: s(form.unitNumber),
      depositIn: parseNumber(form.depositIn),
      payoutOut: parseNumber(form.payoutOut),
      depositor: s(form.depositor),
      vendor: s(form.vendor),
      status: s(form.status), // 미접수/접수완료/청소완료
      note: s(form.note),
      updatedAt: serverTimestamp(),
    };
    try {
      if (form.id) {
        await updateDoc(doc(db, "moveInCleanings", form.id), payload);
      } else {
        await addDoc(collection(db, "moveInCleanings"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      onSaved?.();
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  /* ✅ 엔터 이동 핸들러 */
  const enterTo = (e, nextRef) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nextRef?.current?.focus();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 날짜들: 클릭 시 달력 열림 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">정산날짜</label>
          <DatePicker
            placeholderText="yyyy-MM-dd"
            locale={ko}
            dateFormat="yyyy-MM-dd"
            selected={strToDate(form.settleDate)}
            onChange={(d) => handleChange("settleDate", d ? fmtDate(d) : "")}
            className="w-full h-10 px-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
            onKeyDown={(e) => enterTo(e, null)} // 엔터 시 달력에서 기본 동작 유지
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">접수날짜</label>
          <DatePicker
            placeholderText="yyyy-MM-dd"
            locale={ko}
            dateFormat="yyyy-MM-dd"
            selected={strToDate(form.receivedDate)}
            onChange={(d) => handleChange("receivedDate", d ? fmtDate(d) : "")}
            className="w-full h-10 px-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
      </div>

      {/* 빌라/호수 (엔터 이동: 빌라명 → 호수) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">빌라명</label>
          <input
            ref={villaRef}
            type="text"
            value={form.villaName}
            onChange={(e) => handleChange("villaName", e.target.value)}
            onKeyDown={(e) => enterTo(e, unitRef)}
            className="w-full h-10 px-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">호수</label>
          <input
            ref={unitRef}
            type="text"
            value={form.unitNumber}
            onChange={(e) => handleChange("unitNumber", e.target.value)}
            onKeyDown={(e) => enterTo(e, depositRef)} // ✅ 호수 → 입금금액
            className="w-full h-10 px-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
      </div>

      {/* 금액들 (엔터 이동: 입금금액 → 출금금액) */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">입금금액</label>
          <input
            ref={depositRef}
            type="text"
            placeholder="0"
            value={form.depositIn}
            onChange={(e) => handleAmount("depositIn", e.target.value)}
            onKeyDown={(e) => enterTo(e, payoutRef)}
            className="w-full h-10 px-3 rounded-md border border-gray-300 text-right focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">출금금액</label>
          <input
            ref={payoutRef}
            type="text"
            placeholder="0"
            value={form.payoutOut}
            onChange={(e) => handleAmount("payoutOut", e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-gray-300 text-right focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">차액 (자동)</label>
          <input
            type="text"
            value={fmtComma(diff)}
            readOnly
            className="w-full h-10 px-3 rounded-md border border-gray-200 bg-gray-50 text-right"
          />
        </div>
      </div>

      {/* 입금자/거래처 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">입금자</label>
          <input
            type="text"
            value={form.depositor}
            onChange={(e) => handleChange("depositor", e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">거래처</label>
          <input
            type="text"
            value={form.vendor}
            onChange={(e) => handleChange("vendor", e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
      </div>

      {/* 진행현황/비고 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">진행현황</label>
          <select
            value={form.status}
            onChange={(e) => handleChange("status", e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            {/* ✅ 옵션 축소 */}
            <option value="미접수">미접수</option>
            <option value="접수완료">접수완료</option>
            <option value="청소완료">청소완료</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">비고</label>
          <input
            type="text"
            value={form.note}
            onChange={(e) => handleChange("note", e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
      </div>

      {/* 버튼들: 저장 / 닫기 (순서 변경) */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="submit"
          className="h-10 px-5 rounded-md bg-purple-600 text-white hover:bg-purple-700"
        >
          저장
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-4 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          닫기
        </button>
      </div>
    </form>
  );
}

export default function MoveInCleaningPage() {
  const [rows, setRows] = useState([]);

  // 모달 상태
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create"); // "create" | "edit"
  const [editingRow, setEditingRow] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, "moveInCleanings"),
      orderBy("settleDate", "desc"),
      orderBy("receivedDate", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const x = d.data() || {};
        const deposit = parseNumber(x.depositIn);
        const payout = parseNumber(x.payoutOut);
        const diff = deposit - payout;

        return {
          id: d.id,
          settleDate: fmtDate(x.settleDate),
          receivedDate: fmtDate(x.receivedDate),
          villaName: s(x.villaName),
          unitNumber: s(x.unitNumber),
          depositIn: fmtComma(deposit),
          payoutOut: fmtComma(payout),
          diff: fmtComma(diff),
          depositor: s(x.depositor),
          vendor: s(x.vendor),
          status: s(x.status),
          note: s(x.note),
        };
      });
      setRows(list);
    });

    return () => unsub();
  }, []);

  // 테이블 컬럼
  const columns = useMemo(
    () => [
      { key: "settleDate", label: "정산날짜", width: 110 },
      { key: "receivedDate", label: "접수날짜", width: 110 },
      { key: "villaName", label: "빌라명", width: 160 },
      { key: "unitNumber", label: "호수", width: 80, align: "center" },
      { key: "depositIn", label: "입금금액", width: 120, align: "right" },
      { key: "payoutOut", label: "출금금액", width: 120, align: "right" },
      { key: "diff", label: "차액", width: 120, align: "right" },
      { key: "depositor", label: "입금자", width: 120 },
      { key: "vendor", label: "거래처", width: 140 },
      { key: "status", label: "진행현황", width: 110 },
      { key: "note", label: "비고", width: 220 },
    ],
    []
  );

  const searchableKeys = [
    "settleDate",
    "receivedDate",
    "villaName",
    "unitNumber",
    "depositor",
    "vendor",
    "status",
    "note",
  ];

  const handleAdd = () => {
    setFormMode("create");
    setEditingRow(null);
    setFormOpen(true);
  };

  const handleEdit = (row) => {
    setFormMode("edit");
    setEditingRow(row);
    setFormOpen(true);
  };

  const handleDelete = async (row) => {
    if (!row?.id) return;
    if (!window.confirm("해당 내역을 삭제할까요?")) return;
    await deleteDoc(doc(db, "moveInCleanings", row.id));
  };

  const handleSaved = () => {
    setFormOpen(false);
    setEditingRow(null);
    setFormMode("create");
    // onSnapshot으로 자동 갱신
  };

  return (
    <div className="page-wrapper">
      <PageTitle>입주청소</PageTitle>

      <DataTable
        /* MoveoutList와 동일한 버튼 위치: onAdd 전달 시 상단 우측에 '등록' */
        columns={columns}
        data={rows}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        searchableKeys={searchableKeys}
        itemsPerPage={15}
        enableExcel={false}
      />

      {/* 🔷 등록/수정 모달 (상단 X 제거, 하단 버튼 저장/닫기) */}
      <SimpleModal
        open={formOpen}
        title={formMode === "edit" ? "입주청소 수정" : "입주청소 등록"}
        onClose={() => {
          setFormOpen(false);
          setEditingRow(null);
          setFormMode("create");
        }}
      >
        <EditForm
          initial={editingRow}
          onCancel={() => {
            setFormOpen(false);
            setEditingRow(null);
            setFormMode("create");
          }}
          onSaved={handleSaved}
        />
      </SimpleModal>
    </div>
  );
}
