// src/pages/PublicElectricPage.js
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function PublicElectricPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "villas"), where("publicElectric", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          publicElectric: data.publicElectric || "",
          publicElectricOwner: data.publicElectricOwner || "",
          publicElectricNote: data.publicElectricNote || "",
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
    { label: "공용전기", key: "publicElectric" },
    { label: "명의", key: "publicElectricOwner" },
    { label: "비고", key: "publicElectricNote" },
  ];

  // ✅ 엑셀 업/다운로드용 필드 매핑 (헤더 ↔ 키 1:1)
  const excelFields = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "공용전기", key: "publicElectric" },
    { label: "명의", key: "publicElectricOwner" },
    { label: "비고", key: "publicElectricNote" },
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>공용전기 정보</PageTitle>

      <DataTable
        columns={columns}
        data={villas}
        onEdit={handleEdit}
        // 🔽 엑셀 업/다운로드 활성화 (DataTable.js의 AoA 다운로드 & 강화 업로드 매칭 사용)
        enableExcel={true}
        excelFields={excelFields}
        // (선택) 검색 키 지정
        searchableKeys={[
          "code",
          "name",
          "district",
          "address",
          "publicElectric",
          "publicElectricOwner",
          "publicElectricNote",
        ]}
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
        fields={["publicElectric", "publicElectricOwner", "publicElectricNote"]}
        labels={{
          publicElectric: "공용전기",
          publicElectricOwner: "명의",
          publicElectricNote: "비고",
        }}
        types={{}}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
