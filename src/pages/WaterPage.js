// src/pages/WaterPage.js
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function WaterPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "villas"), where("water", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          water: data.water || "",
          waterNumber: data.waterNumber || "",
          waterOwner: data.waterOwner || "",
          waterNote: data.waterNote || "",
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
    { label: "상수도", key: "water" },
    { label: "전자수용가번호", key: "waterNumber" },
    { label: "명의", key: "waterOwner" },
    { label: "비고", key: "waterNote" },
  ];

  // ✅ 엑셀 업/다운로드용 필드 매핑 (헤더 ↔ 키 1:1)
  const excelFields = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "상수도", key: "water" },
    { label: "전자수용가번호", key: "waterNumber" },
    { label: "명의", key: "waterOwner" },
    { label: "비고", key: "waterNote" },
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>상수도 정보</PageTitle>

      <DataTable
        columns={columns}
        data={villas}
        onEdit={handleEdit}
        // 🔽 엑셀 업/다운로드 활성화 (DataTable.js의 AoA 다운로드 & 강화 업로드 매칭 활용)
        enableExcel={true}
        excelFields={excelFields}
        // (선택) 검색 키 지정
        searchableKeys={["code", "name", "district", "address", "water", "waterNumber", "waterOwner", "waterNote"]}
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
        fields={["water", "waterNumber", "waterOwner", "waterNote"]}
        labels={{
          water: "상수도",
          waterNumber: "전자수용가번호",
          waterOwner: "명의",
          waterNote: "비고",
        }}
        types={{}}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
