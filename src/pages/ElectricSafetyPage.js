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

  // 화면 표시 전용: 금액 쉼표 포맷
  const formatAmount = (v) => {
    if (v === null || v === undefined || v === "") return "";
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? v : n.toLocaleString();
  };

  useEffect(() => {
    const q = query(collection(db, "villas"), where("electricSafety", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          electricSafety: data.electricSafety || "",
          electricSafetyAmount: data.electricSafetyAmount || "",
          electricSafetyNote: data.electricSafetyNote || "",
        };
      });
      setVillas(list);
    });

    return () => unsubscribe();
  }, []);

  const handleEdit = (villa) => {
    setSelectedVilla(villa);
    setIsModalOpen(true);
  };

  const handleSave = async (updated) => {
    const { id, ...data } = updated;
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
    { label: "금액", key: "electricSafetyAmount", format: (v) => formatAmount(v) },
    { label: "비고", key: "electricSafetyNote" },
  ];

  // ✅ 엑셀 업/다운로드용 필드 매핑
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
        // 🔽 엑셀 업/다운로드 활성화
        enableExcel={true}
        excelFields={excelFields}
        // (선택) 검색 키 지정
        searchableKeys={["code", "name", "district", "address", "electricSafety", "electricSafetyNote"]}
        // (선택) 기본 정렬/페이지 크기
        // itemsPerPage={15}
        // sortKey="code"
        // sortOrder="asc"
      />

      <GenericEditModal
        villa={selectedVilla}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVilla(null);
        }}
        onSave={handleSave}
        fields={["electricSafety", "electricSafetyAmount", "electricSafetyNote"]}
        labels={{
          electricSafety: "전기안전",
          electricSafetyAmount: "금액",
          electricSafetyNote: "비고",
        }}
        types={{}}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
