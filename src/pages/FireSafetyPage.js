// src/pages/FireSafetyPage.js
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function FireSafetyPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 화면 표시용 포맷터들
  const formatAmount = (v) => {
    if (v === null || v === undefined || v === "") return "";
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? v : n.toLocaleString(); // 12,345 형태로 표시
  };

  const formatDateYYMMDD = (v) => {
    if (!v && v !== 0) return "";
    const s = String(v).trim();
    // 이미 YY-MM-DD거나 YYYY-MM-DD면 그대로 표시
    if (/^\d{2}-\d{2}-\d{2}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // 숫자만 들어올 때도 표시 보정 (예: 250813 -> 25-08-13)
    if (/^\d{6}$/.test(s)) return `${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;
    if (/^\d{8}$/.test(s)) return `${s.slice(2,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    return s;
  };

  useEffect(() => {
    // fireSafety 필드가 있는 문서만 조회
    const q = query(collection(db, "villas"), where("fireSafety", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          fireSafety: data.fireSafety || "",
          fireSafetyAmount: data.fireSafetyAmount || "",
          fireSafetyManager: data.fireSafetyManager || "",
          fireSafetyTrainingDate: data.fireSafetyTrainingDate || "",
          fireSafetyNote: data.fireSafetyNote || "",
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
    { label: "소방안전", key: "fireSafety" },
    {
      label: "금액",
      key: "fireSafetyAmount",
      format: (val) => formatAmount(val), // ← 화면에서만 쉼표 표시
    },
    { label: "안전관리자", key: "fireSafetyManager" },
    {
      label: "교육일자",
      key: "fireSafetyTrainingDate",
      format: (val) => formatDateYYMMDD(val), // 선택: 화면 표시에만 날짜 보정
    },
    { label: "비고", key: "fireSafetyNote" },
  ];

  // ✅ 엑셀 업/다운로드용 필드 매핑 (엑셀 헤더와 Firestore 필드명 1:1)
  const excelFields = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "소방안전", key: "fireSafety" },
    { label: "금액", key: "fireSafetyAmount" },
    { label: "안전관리자", key: "fireSafetyManager" },
    { label: "교육일자", key: "fireSafetyTrainingDate" }, // 예: 25-08-13
    { label: "비고", key: "fireSafetyNote" },
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>소방안전 정보</PageTitle>

      <DataTable
        columns={columns}
        data={villas}
        onEdit={handleEdit}
        // 🔽 엑셀 업/다운로드 활성화
        enableExcel={true}
        excelFields={excelFields}
        // (선택) 검색 키 지정: 미지정 시 DataTable이 전체 텍스트 기반으로 검색
        searchableKeys={[
          "code",
          "name",
          "district",
          "address",
          "fireSafety",
          "fireSafetyManager",
          "fireSafetyTrainingDate",
          "fireSafetyNote",
        ]}
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
        fields={[
          "fireSafety",
          "fireSafetyAmount",
          "fireSafetyManager",
          "fireSafetyTrainingDate",
          "fireSafetyNote",
        ]}
        labels={{
          fireSafety: "소방안전",
          fireSafetyAmount: "금액",
          fireSafetyManager: "안전관리자",
          fireSafetyTrainingDate: "교육일자",
          fireSafetyNote: "비고",
        }}
        types={{}}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
