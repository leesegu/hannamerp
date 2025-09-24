// src/pages/ElevatorPage.js
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  deleteField,          // ⬅️ 추가: 필드 삭제용
} from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function ElevatorPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ✅ 대시보드 → ?villa=<id> 수신
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const focusVilla =
    params.get("villa") || params.get("id") || params.get("row");

  useEffect(() => {
    const q = query(collection(db, "villas"), where("elevator", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setVillas(list);
    });
    return () => unsubscribe();
  }, []);

  const handleEdit = (villa) => {
    setSelectedVilla(villa);
    setIsModalOpen(true);
  };

  // ---------- 날짜 포맷 ----------
  const toYYMMDD = (date) => {
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  const formatDateYYMMDD = (value) => {
    if (value === "" || value == null) return "";
    if (typeof value === "object" && value?.seconds) {
      const d = new Date(value.seconds * 1000);
      return isNaN(d) ? "" : toYYMMDD(d);
    }
    if (value instanceof Date) return toYYMMDD(value);
    if (typeof value === "number") {
      const d = new Date(value);
      return isNaN(d) ? "" : toYYMMDD(d);
    }
    const s = String(value).trim();
    if (!s) return "";
    if (/^\d{8}$/.test(s)) return `${s.slice(2,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    if (/^\d{6}$/.test(s))  return `${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;
    const parts = s.replace(/[./]/g, "-").split("-");
    if (parts.length === 3) {
      let [y, m, d] = parts.map((x) => x.padStart(2, "0"));
      if (y.length === 4) y = y.slice(2);
      return `${y}-${m}-${d}`;
    }
    const d = new Date(s);
    return isNaN(d) ? "" : toYYMMDD(d);
  };

  // ---------- 금액 정규화 ----------
  const normalizeAmount = (v) => {
    const cleaned = String(v ?? "").replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  };

  const handleSave = async (updated) => {
    const { id, ...data } = updated;

    // ✅ 날짜 필드 정규화
    if (data.contractStart)   data.contractStart   = formatDateYYMMDD(data.contractStart);
    if (data.contractEnd)     data.contractEnd     = formatDateYYMMDD(data.contractEnd);
    if (data.regularApply)    data.regularApply    = formatDateYYMMDD(data.regularApply);
    if (data.regularExpire)   data.regularExpire   = formatDateYYMMDD(data.regularExpire);
    if (data.safetyManager)   data.safetyManager   = formatDateYYMMDD(data.safetyManager);

    // ✅ 검사신청: 비우면 실제 필드 삭제, 값 있으면 포맷
    if (data.inspectionApply === "" || data.inspectionApply == null) {
      data.inspectionApply = deleteField();          // ⬅️ 핵심: Firestore에서 해당 필드 삭제
    } else {
      data.inspectionApply = formatDateYYMMDD(data.inspectionApply);
    }

    // 금액 정규화
    if (data.elevatorAmount !== undefined) {
      const n = normalizeAmount(data.elevatorAmount);
      if (n !== undefined) data.elevatorAmount = n;
      else data.elevatorAmount = deleteField();
    }

    await updateDoc(doc(db, "villas", id), data);
    setIsModalOpen(false);
    setSelectedVilla(null);
  };

  // ====== 컬럼 ======
  const columns = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "승강기", key: "elevator" },
    { label: "제조사", key: "manufacturer" },
    {
      label: "금액",
      key: "elevatorAmount",
      format: (value) => {
        if (value === "" || value == null) return "";
        const num = Number(String(value).replace(/,/g, ""));
        return isNaN(num) ? "" : num.toLocaleString();
      },
    },
    { label: "제조번호", key: "serialNumber" },
    { label: "안전관리자", key: "safetyManager",    format: formatDateYYMMDD },
    { label: "정기신청",   key: "regularApply",     format: formatDateYYMMDD },
    { label: "정기만료",   key: "regularExpire",    format: formatDateYYMMDD },
    { label: "검사신청",   key: "inspectionApply",  format: formatDateYYMMDD }, // ⬅️ 빈값이면 빈칸
    { label: "보험사",     key: "insuranceCompany" },
    { label: "계약일",     key: "contractStart",    format: formatDateYYMMDD },
    { label: "계약만기",   key: "contractEnd",      format: formatDateYYMMDD },
    { label: "비고",       key: "elevatorNote" },
  ];

  const excelFields = [
    "code","name","district","address",
    "elevator","manufacturer","elevatorAmount",
    "serialNumber","safetyManager","regularApply",
    "regularExpire","inspectionApply","insuranceCompany",
    "contractStart","contractEnd","elevatorNote"
  ];

  // ====== 필터(승강기 고유값 → 버튼) ======
  const elevatorOptions = useMemo(() => {
    const set = new Set(
      villas.map((v) => (v.elevator ?? "").trim()).filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [villas]);

  const [elevatorFilter, setElevatorFilter] = useState(""); // "" = 전체

  const filteredVillas = useMemo(() => {
    return villas.filter((v) => {
      const e = (v.elevator ?? "").trim();
      return elevatorFilter ? e === elevatorFilter : true;
    });
  }, [villas, elevatorFilter]);

  useEffect(() => {
    if (elevatorFilter && !elevatorOptions.includes(elevatorFilter)) {
      setElevatorFilter("");
    }
  }, [elevatorOptions, elevatorFilter]);

  // ====== 상단 버튼 (검색창과 같은 행의 좌측) ======
  const btn = {
    padding: "8px 12px",
    borderRadius: "10px",
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1.1,
  };
  const btnActive = { ...btn, background: "#7B5CFF", color: "#fff", borderColor: "#6a4cf0" };

  const leftControls = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => setElevatorFilter("")}
        style={elevatorFilter === "" ? btnActive : btn}
        title="전체"
      >
        전체
      </button>
      {elevatorOptions.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => setElevatorFilter(opt)}
          style={elevatorFilter === opt ? btnActive : btn}
          title={`${opt}만 보기`}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  const addYears = (yyyy_mm_dd, years = 1) => {
    if (!yyyy_mm_dd) return "";
    const [y, m, d] = String(yyyy_mm_dd).split("-").map(Number);
    if (!y || !m || !d) return "";
    const base = new Date(0);
    base.setFullYear(y, m - 1, d);
    base.setHours(0, 0, 0, 0);
    base.setFullYear(base.getFullYear() + years);
    const yy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, "0");
    const dd = String(base.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  const onFormUpdate = (next, changedKey) => {
    if (changedKey === "regularApply" && next.regularApply) {
      next.regularExpire = addYears(next.regularApply, 1);
    }
    if (changedKey === "contractStart" && next.contractStart) {
      next.contractEnd = addYears(next.contractStart, 1);
    }
    return next;
  };

  return (
    <div className="page-wrapper">
      <PageTitle>승강기 정보</PageTitle>

      <DataTable
        columns={columns}
        data={filteredVillas}
        onEdit={handleEdit}
        sortKey="code"
        sortOrder="asc"
        itemsPerPage={15}
        enableExcel={true}
        excelFields={excelFields}
        focusId={focusVilla}
        rowIdKey="id"
        leftControls={leftControls}
      />

      <GenericEditModal
        villa={selectedVilla}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVilla(null);
        }}
        onSave={handleSave}
        onFormUpdate={onFormUpdate}
        fields={[
          "manufacturer",
          "elevatorAmount",
          "serialNumber",
          "safetyManager",
          "regularApply",
          "regularExpire",
          "inspectionApply",
          "insuranceCompany",
          "contractStart",
          "contractEnd",
          "elevatorNote",
        ]}
        readOnlyKeys={["elevator"]}
        labels={{
          elevator: "승강기",
          manufacturer: "제조사",
          elevatorAmount: "금액",
          serialNumber: "제조번호",
          safetyManager: "안전관리자",
          regularApply: "정기신청",
          regularExpire: "정기만료",
          inspectionApply: "검사신청",
          insuranceCompany: "보험사",
          contractStart: "계약일",
          contractEnd: "계약만기",
          elevatorNote: "비고",
        }}
        types={{
          elevatorAmount: "amount",
          safetyManager: "date",
          regularApply: "date",
          regularExpire: "date",
          inspectionApply: "date",   // 달력 + X(클리어)
          contractStart: "date",
          contractEnd: "date",
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
