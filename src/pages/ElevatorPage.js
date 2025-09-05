// src/pages/ElevatorPage.js
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
} from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function ElevatorPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  const toYYMMDD = (date) => {
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  const formatDateYYMMDD = (value) => {
    if (!value && value !== 0) return "";
    if (typeof value === "object" && value?.seconds) return toYYMMDD(new Date(value.seconds * 1000));
    if (value instanceof Date) return toYYMMDD(value);
    if (typeof value === "number") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? "" : toYYMMDD(d);
    }
    const s = String(value).trim();
    if (/^\d{8}$/.test(s)) return `${s.slice(2, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    if (/^\d{6}$/.test(s)) return `${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
    const parts = s.replace(/[./]/g, "-").split("-");
    if (parts.length === 3) {
      let [y, m, d] = parts.map((x) => x.padStart(2, "0"));
      if (y.length === 4) y = y.slice(2);
      return `${y}-${m}-${d}`;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : toYYMMDD(d);
  };

  const normalizeAmount = (v) => {
    const cleaned = String(v ?? "").replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  };

  // ====== 모달 저장 ======
  const handleSave = async (updated) => {
    const { id, ...data } = updated;

    // 날짜 필드 정규화 (yy-MM-dd로 저장)
    if (data.contractStart) data.contractStart = formatDateYYMMDD(data.contractStart);
    if (data.contractEnd) data.contractEnd = formatDateYYMMDD(data.contractEnd);
    if (data.regularApply) data.regularApply = formatDateYYMMDD(data.regularApply);
    if (data.regularExpire) data.regularExpire = formatDateYYMMDD(data.regularExpire);
    if (data.safetyManager) data.safetyManager = formatDateYYMMDD(data.safetyManager);

    // 금액 정규화
    if (data.elevatorAmount) {
      const n = normalizeAmount(data.elevatorAmount);
      if (n !== undefined) data.elevatorAmount = n;
      else delete data.elevatorAmount;
    }

    await updateDoc(doc(db, "villas", id), data);
    setIsModalOpen(false);
    setSelectedVilla(null);
  };

  // ====== 표 컬럼 ======
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
        const num = Number(String(value).replace(/,/g, ""));
        return isNaN(num) ? (value ?? "-") : num.toLocaleString();
      },
    },
    { label: "제조번호", key: "serialNumber" },
    { label: "안전관리자", key: "safetyManager", format: formatDateYYMMDD }, // ← 날짜로 표시
    { label: "정기신청", key: "regularApply",  format: formatDateYYMMDD },
    { label: "정기만료", key: "regularExpire", format: formatDateYYMMDD },
    { label: "검사신청", key: "inspectionApply" },
    { label: "보험사", key: "insuranceCompany" },
    { label: "계약일",   key: "contractStart", format: formatDateYYMMDD },
    { label: "계약만기", key: "contractEnd",   format: formatDateYYMMDD },
    { label: "비고", key: "elevatorNote" },
  ];

  const excelFields = [
    "code", "name", "district", "address",
    "elevator", "manufacturer", "elevatorAmount",
    "serialNumber", "safetyManager", "regularApply",
    "regularExpire", "inspectionApply", "insuranceCompany",
    "contractStart", "contractEnd", "elevatorNote"
  ];

  // ====== onFormUpdate: 기준일 선택 시 +1년 자동 반영 ======
  const addYears = (yyyy_mm_dd, years = 1) => {
    if (!yyyy_mm_dd) return "";
    const [y, m, d] = String(yyyy_mm_dd).split("-").map(Number);
    if (!y || !m || !d) return "";
    const base = new Date(0);
    base.setFullYear(y, m - 1, d);
    base.setHours(0, 0, 0, 0);
    base.setFullYear(base.getFullYear() + years); // 윤년 안전
    const yy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, "0");
    const dd = String(base.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  const onFormUpdate = (next, changedKey) => {
    // 기준일이 바뀌면 만기일/정기만료를 자동 +1년으로 세팅
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
        data={villas}
        onEdit={handleEdit}
        sortKey="code"
        sortOrder="asc"
        itemsPerPage={15}
        enableExcel={true}
        excelFields={excelFields}
      />

      <GenericEditModal
        villa={selectedVilla}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVilla(null);
        }}
        onSave={handleSave}
        /* ✅ 기준일 선택 시 만기 자동 세팅 */
        onFormUpdate={onFormUpdate}
        fields={[
          "manufacturer",
          "elevatorAmount",
          "serialNumber",
          "safetyManager",   // ← 달력
          "regularApply",    // ← 달력
          "regularExpire",   // ← 자동 +1년 (수정 가능)
          "inspectionApply",
          "insuranceCompany",
          "contractStart",   // ← 달력
          "contractEnd",     // ← 자동 +1년 (수정 가능)
          "elevatorNote",
        ]}
        readOnlyKeys={["elevator"]} // 읽기 전용으로 상단 표시할 때 사용
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
          safetyManager: "date",   // ← 안전관리자도 달력
          regularApply: "date",    // ← 기준일
          regularExpire: "date",   // ← 자동 +1년(수정 가능)
          contractStart: "date",   // ← 기준일
          contractEnd: "date",     // ← 자동 +1년(수정 가능)
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
