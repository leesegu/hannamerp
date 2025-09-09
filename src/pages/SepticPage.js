// src/pages/SepticPage.js
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom"; // ✅ 추가
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

export default function SepticPage() {
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
    const q = query(collection(db, "villas"), where("septic", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setVillas(list);
    });

    return () => unsubscribe();
  }, []);

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

    if (data.septicAmount) {
      const n = normalizeAmount(data.septicAmount);
      if (n !== undefined) data.septicAmount = n;
      else delete data.septicAmount;
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
    { label: "정화조", key: "septic" },
    { label: "창살제거", key: "septicGrate" },
    { label: "작업날짜", key: "septicDate" },
    {
      label: "금액",
      key: "septicAmount",
      format: (value) => {
        const num = Number(String(value).replace(/[^\d.-]/g, ""));
        return Number.isFinite(num) ? num.toLocaleString() : "-";
      },
    },
    { label: "비고", key: "septicNote" },
  ];

  const excelFields = [
    "code", "name", "district", "address",
    "septic", "septicGrate", "septicDate",
    "septicAmount", "septicNote"
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>정화조 정보</PageTitle>

      <DataTable
        columns={columns}
        data={villas}
        onEdit={handleEdit}
        sortKey="code"
        sortOrder="asc"
        itemsPerPage={15}
        enableExcel={true}
        excelFields={excelFields}
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
          "septicGrate",
          "septicDate",
          "septicAmount",
          "septicNote",
        ]}
        readOnlyKeys={["septic"]}
        labels={{
          septic: "정화조",
          septicGrate: "창살제거",
          septicDate: "작업날짜",
          septicAmount: "금액",
          septicNote: "비고",
        }}
        types={{
          septicDate: "date",
          septicAmount: "amount",
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
