// src/pages/VillaCodePage.js
import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  setDoc,            // ✅ 관리종료 컬렉션에 복사용
  serverTimestamp,   // ✅ 삭제 시각 기록용
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
  //   1) 현재 villas 문서 전체를 villas_end 컬렉션에 그대로 저장(관리종료)
  //   2) 저장 성공 후에만 villas 컬렉션에서 삭제
  const handleDelete = async (row) => {
    if (!window.confirm(`${row.name} (${row.code}) 항목을 관리종료 처리하시겠습니까?`)) {
      return;
    }

    if (!row.id) {
      alert("관리종료 저장을 위해 문서 id가 필요합니다. 관리자에게 문의해주세요.");
      console.error("관리종료 처리 실패: row.id 없음", row);
      return;
    }

    try {
      const { id, ...rest } = row;

      // ✅ 1단계: 관리종료 컬렉션에 전체 스냅샷 저장
      // - villas_end/문서ID (문서ID는 기존 villas 문서 id 그대로 사용)
      await setDoc(doc(db, "villas_end", id), {
        ...rest,                // 코드번호, 빌라명, 주소, telco/elevator/… 모든 필드 그대로
        originalId: id,         // 원본 문서 id 기록(필요시 추적용)
        deletedAt: serverTimestamp(), // 삭제(관리종료) 시각
      });

      // ✅ 2단계: 원본 컬렉션에서 실제 삭제
      await deleteDoc(doc(db, "villas", id));

      // ✅ 3단계: 화면 목록에서도 제거
      setData((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("🔥 삭제/관리종료 처리 실패:", error);
      alert("관리종료 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
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
