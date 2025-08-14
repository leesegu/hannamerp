// src/pages/ElectricSafetyPage.js
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function ElectricSafetyPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "villas"), where("electricSafety", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setVillas(list);
    });
    return () => unsubscribe();
  }, []);

  const formatAmount = (v) => {
    if (v === null || v === undefined || v === "") return "-";
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? "-" : n.toLocaleString();
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

    if (data.electricSafetyAmount) {
      const n = normalizeAmount(data.electricSafetyAmount);
      if (n !== undefined) data.electricSafetyAmount = n;
      else delete data.electricSafetyAmount;
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
    { label: "전기안전", key: "electricSafety" },
    {
      label: "금액",
      key: "electricSafetyAmount",
      format: (v) => formatAmount(v),
    },
    { label: "비고", key: "electricSafetyNote" },
  ];

  const excelFields = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "전기안전", key: "electricSafety" },
    { label: "금액", key: "electricSafetyAmount" },
    { label: "비고", key: "electricSafetyNote" },
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>전기안전 정보</PageTitle>

      <DataTable
        columns={columns}
        data={villas}
        onEdit={handleEdit}
        enableExcel={true}
        excelFields={excelFields}
        searchableKeys={[
          "code", "name", "district", "address", "electricSafety", "electricSafetyNote"
        ]}
      />

      <GenericEditModal
        villa={selectedVilla}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVilla(null);
        }}
        onSave={handleSave}
        fields={["electricSafetyAmount", "electricSafetyNote"]}
        readOnlyKeys={["electricSafety"]}
        labels={{
          electricSafety: "전기안전",
          electricSafetyAmount: "금액",
          electricSafetyNote: "비고",
        }}
        types={{
          electricSafetyAmount: "amount",
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
