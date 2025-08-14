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

  const handleSave = async (updated) => {
    const { id, ...data } = updated;

    if (data.contractStart) data.contractStart = formatDateYYMMDD(data.contractStart);
    if (data.contractEnd) data.contractEnd = formatDateYYMMDD(data.contractEnd);

    if (data.elevatorAmount) {
      const n = normalizeAmount(data.elevatorAmount);
      if (n !== undefined) data.elevatorAmount = n;
      else delete data.elevatorAmount;
    }

    await updateDoc(doc(db, "villas", id), data);
    setIsModalOpen(false);
    setSelectedVilla(null);
  };

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
    { label: "안전관리자", key: "safetyManager" },
    { label: "정기신청", key: "regularApply" },
    { label: "정기만료", key: "regularExpire" },
    { label: "검사신청", key: "inspectionApply" },
    { label: "보험사", key: "insuranceCompany" },
    {
      label: "계약일",
      key: "contractStart",
      format: formatDateYYMMDD,
    },
    {
      label: "계약만기",
      key: "contractEnd",
      format: formatDateYYMMDD,
    },
    { label: "비고", key: "elevatorNote" },
  ];

  const excelFields = [
    "code", "name", "district", "address",
    "elevator", "manufacturer", "elevatorAmount",
    "serialNumber", "safetyManager", "regularApply",
    "regularExpire", "inspectionApply", "insuranceCompany",
    "contractStart", "contractEnd", "elevatorNote"
  ];

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
        readOnlyKeys={["elevator"]} // ✅ 읽기 전용으로 상단 표시
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
          contractStart: "date",
          contractEnd: "date",
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
