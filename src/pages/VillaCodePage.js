// src/pages/VillaCodePage.js
import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";

import DataTable from "../components/DataTable";
import VillaRegisterModal from "../components/VillaRegisterModal";
import PageTitle from "../components/PageTitle";

export default function VillaCodePage() {
  const [data, setData] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // ✅ Firestore 필드명과 동일한 key만 사용
  const columns = [
    { key: "code", label: "코드번호" },
    { key: "name", label: "빌라명" },
    { key: "district", label: "구" },
    { key: "address", label: "주소" },
    { key: "telco", label: "통신사" },
    { key: "elevator", label: "승강기" },
    { key: "septic", label: "정화조" },
    { key: "fireSafety", label: "소방안전" },
    { key: "electricSafety", label: "전기안전" },
    { key: "water", label: "상수도" },
    { key: "publicElectric", label: "공용전기" },
    { key: "cleaning", label: "건물청소" },
    { key: "cctv", label: "CCTV" },
  ];

  // ✅ 목록 재조회 함수 (업로드 후에도 사용)
  const fetchVillas = async () => {
    try {
      const snap = await getDocs(collection(db, "villas"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setData(list);
    } catch (error) {
      console.error("🔥 목록 로딩 실패:", error);
    }
  };

  // ✅ 최초 1회 로딩
  useEffect(() => {
    fetchVillas();
  }, []);

  // ✅ 등록 버튼 클릭
  const handleAdd = () => {
    setEditItem(null);
    setShowModal(true);
  };

  // ✅ 저장 처리(모달에서 저장 후 돌아올 때 리스트에 반영)
  const handleSave = (saved) => {
    setData((prev) => {
      const exists = prev.some((v) => v.id === saved.id);
      return exists
        ? prev.map((v) => (v.id === saved.id ? saved : v))
        : [...prev, saved];
    });
    setShowModal(false);
  };

  // ✅ 수정 버튼 클릭
  const handleEdit = (row) => {
    setEditItem(row);
    setShowModal(true);
  };

  // ✅ 삭제 버튼 클릭
  const handleDelete = async (row) => {
    if (window.confirm(`${row.name} (${row.code}) 항목을 삭제하시겠습니까?`)) {
      try {
        await deleteDoc(doc(db, "villas", row.id));
        setData((prev) => prev.filter((item) => item.id !== row.id));
      } catch (error) {
        console.error("🔥 삭제 실패:", error);
        alert("삭제에 실패했습니다.");
      }
    }
  };

  return (
    <div className="page-wrapper">
      <PageTitle>코드별빌라</PageTitle>

      <DataTable
        columns={columns}
        data={data}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        // 🔽 엑셀 업로드/다운로드 설정
        enableExcel={true}
        collectionName="villas"      // ✅ 빌라 전용 컬렉션만 사용
        idKey="code"                 // ✅ 문서 ID = code
        idAliases={["코드번호", "code"]}
        excelFields={columns.map((c) => c.key)} // ✅ 필드명 1:1 통일
        sortKey="code"
        // 업로드 완료 후 목록 재조회 (getDocs 기반이므로 필요)
        onUploadComplete={() => {
          fetchVillas();
        }}
      />

      {showModal && (
        <VillaRegisterModal
          onClose={() => setShowModal(false)}
          onSaved={handleSave}
          editItem={editItem}
        />
      )}
    </div>
  );
}
