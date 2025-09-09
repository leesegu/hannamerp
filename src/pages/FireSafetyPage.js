// src/pages/FireSafetyPage.js
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom"; // ✅ 추가
import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function FireSafetyPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ✅ 대시보드 → ?villa=<id> 수신
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const focusVilla =
    params.get("villa") ||
    params.get("id") ||
    params.get("row");

  useEffect(() => {
    const q = query(collection(db, "villas"), where("fireSafety", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setVillas(list);
    });
    return () => unsubscribe();
  }, []);

  const formatAmount = (v) => {
    if (!v) return "-";
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? "-" : n.toLocaleString();
  };

  const formatDateYYMMDD = (v) => {
    if (!v && v !== 0) return "";
    const s = String(v).trim();
    if (/^\d{2}-\d{2}-\d{2}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{6}$/.test(s)) return `${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;
    if (/^\d{8}$/.test(s)) return `${s.slice(2,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    return s;
  };

  const normalizeAmount = (v) => {
    const cleaned = String(v ?? "").replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  };

  const handleEdit = (villa) => {
    setSelectedVilla(villa);
    setIsModalOpen(true);
  };

  const handleSave = async (updated) => {
    const { id, ...data } = updated;

    if (data.fireSafetyAmount) {
      const n = normalizeAmount(data.fireSafetyAmount);
      if (n !== undefined) data.fireSafetyAmount = n;
      else delete data.fireSafetyAmount;
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
    { label: "소방안전", key: "fireSafety" },
    {
      label: "금액",
      key: "fireSafetyAmount",
      format: formatAmount,
    },
    { label: "안전관리자", key: "fireSafetyManager" },
    {
      label: "교육일자",
      key: "fireSafetyTrainingDate",
      format: formatDateYYMMDD,
    },
    { label: "비고", key: "fireSafetyNote" },
  ];

  const excelFields = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "소방안전", key: "fireSafety" },
    { label: "금액", key: "fireSafetyAmount" },
    { label: "안전관리자", key: "fireSafetyManager" },
    { label: "교육일자", key: "fireSafetyTrainingDate" },
    { label: "비고", key: "fireSafetyNote" },
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>소방안전 정보</PageTitle>

      <DataTable
        columns={columns}
        data={villas}
        onEdit={handleEdit}
        enableExcel={true}
        excelFields={excelFields}
        searchableKeys={[
          "code", "name", "district", "address",
          "fireSafety", "fireSafetyManager", "fireSafetyTrainingDate", "fireSafetyNote"
        ]}
        /** ✅ 포커스 적용 */
        focusId={focusVilla}
        rowIdKey="id"
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
          "fireSafetyAmount",
          "fireSafetyManager",
          "fireSafetyTrainingDate",
          "fireSafetyNote",
        ]}
        readOnlyKeys={["fireSafety"]}
        labels={{
          fireSafety: "소방안전",
          fireSafetyAmount: "금액",
          fireSafetyManager: "안전관리자",
          fireSafetyTrainingDate: "교육일자",
          fireSafetyNote: "비고",
        }}
        types={{
          fireSafetyAmount: "amount",
          fireSafetyTrainingDate: "date",
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
