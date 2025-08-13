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

  // 🔍 승강기 필드가 있는 문서만 가져오기
  useEffect(() => {
    const q = query(collection(db, "villas"), where("elevator", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          elevator: data.elevator || "",
          manufacturer: data.manufacturer || "",
          elevatorAmount: data.elevatorAmount || "",
          serialNumber: data.serialNumber || "",
          safetyManager: data.safetyManager || "",
          regularApply: data.regularApply || "",
          regularExpire: data.regularExpire || "",
          inspectionApply: data.inspectionApply || "",
          insuranceCompany: data.insuranceCompany || "",
          contractStart: data.contractStart || "",
          contractEnd: data.contractEnd || "",
          elevatorNote: data.elevatorNote || "",
        };
      });
      setVillas(list);
    });

    return () => unsubscribe();
  }, []);

  // ✏ 수정 버튼 클릭 시
  const handleEdit = (villa) => {
    setSelectedVilla(villa);
    setIsModalOpen(true);
  };

  // 💾 저장
  const handleSave = async (updated) => {
    const { id, ...data } = updated;
    await updateDoc(doc(db, "villas", id), data);
    setIsModalOpen(false);
    setSelectedVilla(null);
  };

  // 📋 테이블 컬럼 정의
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
    { label: "계약일", key: "contractStart" },
    { label: "계약만기", key: "contractEnd" },
    { label: "비고", key: "elevatorNote" },
  ];

  // 📑 엑셀 import/export 필드
  const excelFields = [
    "code",
    "name",
    "district",
    "address",
    "elevator",
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
        enableExcel={true}       // 📌 통신사 페이지와 동일하게 엑셀 기능 활성화
        excelFields={excelFields} // 📌 내보내기/업로드 필드 순서 지정
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
          "elevator",
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
          elevatorAmount: "amount", // 금액: 쉼표 포맷
          contractStart: "date",    // 계약일: 날짜 포맷
          contractEnd: "date",      // 계약만기: 날짜 포맷
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
