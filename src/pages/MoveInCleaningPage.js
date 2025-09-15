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
  getDoc,
  setDoc,
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
    return s(v);
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
/* yyyy-MM-dd → 20250909 같은 정렬용 숫자 */
const dateToNum = (v) => {
  const d = strToDate(v);
  if (!d) return 0;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return parseInt(`${y}${m}${dd}`, 10);
};

/* ===== 진행현황 색상/배지 ===== */
const statusMeta = (status) => {
  switch (status) {
    case "미접수":
      return { dot: "#EF4444" };
    case "접수완료":
      return { dot: "#F59E0B" };
    case "청소완료":
      return { dot: "#10B981" };
    case "청소보류":
      return { dot: "#9CA3AF" };
    default:
      return { dot: "#9CA3AF" };
  }
};
const StatusCell = ({ value }) => {
  const v = String(value || "미접수").trim();
  const { dot } = statusMeta(v);
  return (
    <span>
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dot,
          marginRight: 6,
          verticalAlign: "middle",
        }}
      />
      {v}
    </span>
  );
};

/* ===== 모달 ===== */
function SimpleModal({ open, title, children, onClose, width = 720, headerRight = null }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white max-w-[92vw] rounded-xl shadow-xl"
        style={{ width }}
      >
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <div>{headerRight}</div>
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
    status: s(initial?.status) || "미접수",
    note: s(initial?.note) || "",
    sourceMoveoutId: s(initial?.sourceMoveoutId) || "",
  }));

  const linked = !!form.sourceMoveoutId;

  const [depositorOptions, setDepositorOptions] = useState([]);
  const [vendorOptions, setVendorOptions] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const depositorSnap = await getDoc(doc(db, "serviceSettings", "입금자"));
        const vendorSnap = await getDoc(doc(db, "serviceSettings", "거래처"));
        const depositorArr = Array.isArray(depositorSnap.data()?.items)
          ? depositorSnap.data().items.filter((x) => s(x) !== "")
          : [];
        const vendorArr = Array.isArray(vendorSnap.data()?.items)
          ? vendorSnap.data().items.filter((x) => s(x) !== "")
          : [];
        setDepositorOptions(depositorArr);
        setVendorOptions(vendorArr);
      } catch (e) {
        console.error("serviceSettings 불러오기 오류:", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (form.depositor && !depositorOptions.includes(form.depositor)) {
      setDepositorOptions((prev) => [...prev, form.depositor]);
    }
  }, [form.depositor, depositorOptions]);
  useEffect(() => {
    if (form.vendor && !vendorOptions.includes(form.vendor)) {
      setVendorOptions((prev) => [...prev, form.vendor]);
    }
  }, [form.vendor, vendorOptions]);

  const villaRef = useRef(null);
  const unitRef = useRef(null);
  const depositRef = useRef(null);
  const payoutRef = useRef(null);

  const handleChange = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const handleAmount = (key, val) => handleChange(key, fmtComma(parseNumber(val)));

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      settleDate: s(form.settleDate),
      receivedDate: s(form.receivedDate),
      villaName: s(form.villaName),
      unitNumber: s(form.unitNumber),
      depositIn: parseNumber(form.depositIn),
      payoutOut: parseNumber(form.payoutOut),
      depositor: s(form.depositor),
      vendor: s(form.vendor),
      status: s(form.status),
      note: s(form.note),
      updatedAt: serverTimestamp(),
    };

    try {
      if (form.id) {
        // 🔒 이 페이지 데이터만 수정 (moveouts 역방향 업데이트 제거)
        await updateDoc(doc(db, "moveInCleanings", form.id), payload);
      } else {
        await addDoc(collection(db, "moveInCleanings"), {
          ...payload,
          createdAt: serverTimestamp(),
          sourceMoveoutId: "", // 독립 등록
        });
      }
      onSaved?.();
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  const enterTo = (e, nextRef) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nextRef?.current?.focus();
    }
  };

  const dateInputClass =
    "h-10 px-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400 w-[332px]";

  const ro = { readOnly: true, style: { background: "#f9fafb", pointerEvents: "none" } };
  const roDp = { disabled: true };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 1) 정산날짜 · 접수날짜 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">정산날짜</label>
          <DatePicker
            locale={ko}
            dateFormat="yyyy-MM-dd"
            selected={strToDate(form.settleDate)}
            onChange={(d) => handleChange("settleDate", d ? fmtDate(d) : "")}
            className={dateInputClass}
            calendarClassName="!text-sm"
            {...(linked ? roDp : {})}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">접수날짜</label>
          <DatePicker
            locale={ko}
            dateFormat="yyyy-MM-dd"
            selected={strToDate(form.receivedDate)}
            onChange={(d) => handleChange("receivedDate", d ? fmtDate(d) : "")}
            className={dateInputClass}
            calendarClassName="!text-sm"
          />
        </div>
      </div>

      {/* 2) 빌라명 · 호수 */}
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
            {...(linked ? ro : {})}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">호수</label>
          <input
            ref={unitRef}
            type="text"
            value={form.unitNumber}
            onChange={(e) => handleChange("unitNumber", e.target.value)}
            onKeyDown={(e) => enterTo(e, depositRef)}
            className="w-full h-10 px-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
            {...(linked ? ro : {})}
          />
        </div>
      </div>

      {/* 3) 입금금액 · 출금금액 */}
      <div className="grid grid-cols-2 gap-3">
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
            {...(linked ? ro : {})}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            className="w-full h-10 px-3 rounded-md border border-gray-300 text-right focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
      </div>

      {/* 4) 입금자 · 거래처 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">입금자</label>
          <select
            value={form.depositor}
            onChange={(e) => handleChange("depositor", e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="">선택</option>
            {depositorOptions.map((opt, i) => (
              <option key={`${opt}-${i}`} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text.sm text-gray-600 mb-1">거래처</label>
          <select
            value={form.vendor}
            onChange={(e) => handleChange("vendor", e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="">선택</option>
            {vendorOptions.map((opt, i) => (
              <option key={`${opt}-${i}`} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 5) 진행현황 · 비고 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">진행현황</label>
          <select
            value={form.status}
            onChange={(e) => handleChange("status", e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="미접수">🔴 미접수</option>
            <option value="접수완료">🟡 접수완료</option>
            <option value="청소완료">🟢 청소완료</option>
            <option value="청소보류">⚪ 청소보류</option>
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

      {/* 버튼: 저장/닫기 */}
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

/* ===== 메인 페이지 ===== */
export default function MoveInCleaningPage() {
  const [rows, setRows] = useState([]);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingRow, setEditingRow] = useState(null);

  const [statusFilter, setStatusFilter] = useState("ALL");

  const [sumOpen, setSumOpen] = useState(false);
  const [sumYear, setSumYear] = useState("");
  const [sumMonth, setSumMonth] = useState("");

  /* 🔁 A. moveInCleanings 목록 구독 */
  useEffect(() => {
    const qy = query(collection(db, "moveInCleanings"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        const list = snap.docs.map((d) => {
          const x = d.data() || {};
          const deposit = parseNumber(x.depositIn);
          const payout = parseNumber(x.payoutOut);

          const settle = fmtDate(x.settleDate);
          const ymd = /^\d{4}-\d{2}-\d{2}$/.test(settle) ? settle : "0000-00-00";
          const ymdNum = parseInt(ymd.replace(/-/g, ""), 10) || 0;

          const rank = ymd === todayStr ? 0 : 1;
          const inv = String(99999999 - ymdNum).padStart(8, "0");
          const sortCombo = `${rank}-${inv}`;

          const diff = deposit - payout;
          const ym = /^\d{4}-\d{2}-\d{2}$/.test(settle) ? settle.slice(0, 7) : "";

          return {
            id: d.id,
            settleDate: settle,
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
            sourceMoveoutId: s(x.sourceMoveoutId || ""),
            __depositNum: deposit,
            __payoutNum: payout,
            __settleYm: ym,
            __settleNum: dateToNum(settle),
            __sortCombo: sortCombo,
          };
        });

        setRows(list);
      },
      (err) => {
        console.error("[moveInCleanings listen error]", err);
        alert("목록 조회 중 오류가 발생했습니다.\n콘솔을 확인하세요.");
      }
    );
    return () => unsub();
  }, []);

  /* 🔁 B. 이사정산 → 입주청소 자동 동기화 (단방향) */
  useEffect(() => {
    const moQ = collection(db, "moveouts");
    const unsub = onSnapshot(
      moQ,
      async (snap) => {
        for (const d of snap.docs) {
          try {
            const x = d.data() || {};
            const settleDate = fmtDate(x.moveDate);
            const villaName = s(x.villaName);
            const unitNumber = s(x.unitNumber);
            const moStatus = s(x.status);
            const cleaningFee = parseNumber(x.cleaningFee);

            // ⬇ 정산완료일 때만 청소비를 입금금액으로 반영
            const depositIn = moStatus === "정산완료" ? cleaningFee : 0;

            const ref = doc(db, "moveInCleanings", `mo_${d.id}`);
            const prev = await getDoc(ref);
            const exists = prev.exists();
            const prevStatus = s(prev.data()?.status);

            // ⚠ 이 모듈의 status는 사용자가 관리. moveouts 변경이 status를 덮어쓰지 않도록 prev 유지.
            const payload = {
              sourceMoveoutId: d.id,   // ✅ 연동 키
              settleDate,
              villaName,
              unitNumber,
              depositIn,
              status: prevStatus || "미접수",
              updatedAt: serverTimestamp(),
            };
            if (!exists) payload.createdAt = serverTimestamp();

            await setDoc(ref, payload, { merge: true });
          } catch (e) {
            console.error("moveouts → moveInCleanings 동기화 오류:", e);
          }
        }
      },
      (err) => {
        console.error("[moveouts listen error]", err);
      }
    );
    return () => unsub();
  }, []);

  /* 연/월 옵션 (차액 모달용) */
  const yearOptions = useMemo(() => {
    const years = new Set();
    rows.forEach((r) => { if (r.__settleYm) years.add(r.__settleYm.slice(0, 4)); });
    const arr = Array.from(years).sort((a, b) => b.localeCompare(a));
    return arr.length ? arr : [String(new Date().getFullYear())];
  }, [rows]);

  useEffect(() => {
    if (!sumYear && yearOptions.length) setSumYear(yearOptions[0]);
  }, [yearOptions, sumYear]);

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")),
    []
  );

  useEffect(() => {
    if (!sumMonth) {
      const m = String(new Date().getMonth() + 1).padStart(2, "0");
      setSumMonth(m);
    }
  }, [sumMonth]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "ALL") return rows;
    return rows.filter((r) => String(r.status || "") === statusFilter);
  }, [rows, statusFilter]);

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
      { key: "status", label: "진행현황", width: 120, render: (row) => <StatusCell value={row.status} /> },
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
    const raw = rows.find((r) => r.id === row.id) || row;
    setFormMode("edit");
    setEditingRow(raw);
    setFormOpen(true);
  };

  const handleDelete = async (row) => {
    const raw = rows.find((r) => r.id === row.id) || row;
    if (!raw?.id) return;
    if (raw.sourceMoveoutId) {
      alert("이 항목은 이사정산과 연동되었습니다. 이사정산 페이지에서 삭제해 주세요.");
      return;
    }
    if (!window.confirm("해당 내역을 삭제할까요?")) return;
    await deleteDoc(doc(db, "moveInCleanings", raw.id));
  };

  const handleSaved = () => {
    setFormOpen(false);
    setEditingRow(null);
    setFormMode("create");
  };

  /* 좌측 상단: 진행현황 필터 */
  const leftControls = (
    <>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        style={{
          height: 36,
          borderRadius: 9999,
          border: "1px solid #e5e7eb",
          background: "#f3f4f6",
          padding: "0 14px",
          fontWeight: 600,
          color: "#374151",
          outline: "none",
        }}
        title="진행현황 필터"
      >
        <option value="ALL">전체</option>
        <option value="미접수">미접수</option>
        <option value="접수완료">접수완료</option>
        <option value="청소완료">청소완료</option>
        <option value="청소보류">청소보류</option>
      </select>
    </>
  );

  /* 우측 상단: 차액 버튼 */
  const rightControls = (
    <button
      type="button"
      onClick={() => setSumOpen(true)}
      style={{
        height: 36,
        borderRadius: 9999,
        border: "1px solid #e5e7eb",
        background: "#eef2ff",
        color: "#4338ca",
        padding: "0 14px",
        fontWeight: 700,
        outline: "none",
        cursor: "pointer",
      }}
      title="월별 차액 합계"
    >
      차액
    </button>
  );

  /* 월별 합계 계산 */
  const targetYm = sumYear && sumMonth ? `${sumYear}-${sumMonth}` : "";
  const monthlyTotals = useMemo(() => {
    if (!targetYm) return { deposit: 0, payout: 0, diff: 0 };
    return rows.reduce(
      (acc, r) => {
        if (r.__settleYm === targetYm) {
          acc.deposit += r.__depositNum || 0;
          acc.payout += r.__payoutNum || 0;
        }
        return acc;
      },
      { deposit: 0, payout: 0, diff: 0 }
    );
  }, [rows, targetYm]);
  monthlyTotals.diff = (monthlyTotals.deposit || 0) - (monthlyTotals.payout || 0);

  return (
    <div className="page-wrapper">
      <PageTitle>입주청소</PageTitle>

      <DataTable
        columns={columns}
        data={filteredRows}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        searchableKeys={searchableKeys}
        itemsPerPage={15}
        enableExcel={false}
        leftControls={leftControls}
        rightControls={rightControls}
        sortKey="__sortCombo"
        sortOrder="asc"
      />

      {/* 등록/수정 모달 */}
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

      {/* 🔹 차액 합계 모달 */}
      <SimpleModal
        open={sumOpen}
        title="월별 차액 합계"
        width={420}
        onClose={() => setSumOpen(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">년도</label>
              <select
                value={sumYear}
                onChange={(e) => setSumYear(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">월</label>
              <select
                value={sumMonth}
                onChange={(e) => setSumMonth(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-1">
            <div className="p-3 rounded-md border bg-gray-50 text-center">
              <div className="text-xs text-gray-500 mb-1">입금액</div>
              <div className="text-lg font-semibold">
                {fmtComma(monthlyTotals.deposit)}원
              </div>
            </div>
            <div className="p-3 rounded-md border bg-gray-50 text-center">
              <div className="text-xs text-gray-500 mb-1">출금액</div>
              <div className="text-lg font-semibold">
                {fmtComma(monthlyTotals.payout)}원
              </div>
            </div>
            <div className="p-3 rounded-md border bg-gray-50 text-center">
              <div className="text-xs text-gray-500 mb-1">차액</div>
              <div className="text-lg font-semibold">
                {fmtComma(monthlyTotals.diff)}원
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setSumOpen(false)}
              className="h-10 px-4 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              닫기
            </button>
          </div>
        </div>
      </SimpleModal>
    </div>
  );
}
