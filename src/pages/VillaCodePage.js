import React, { useState } from "react";
import DataTable from "../components/DataTable";
import VillaRegisterModal from "../components/VillaRegisterModal"; // 등록 모달 분리

export default function VillaCodePage() {
  const columns = [
    { key: "code", label: "코드번호" },
    { key: "name", label: "빌라명" },
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

  // ✅ 샘플 데이터 제거 → 빈 배열로 초기화
  const [data, setData] = useState([]);

  const [showModal, setShowModal] = useState(false);

  const handleAdd = () => {
    setShowModal(true);
  };

  const handleSave = (newItem) => {
    setData((prev) => [...prev, newItem]);
    setShowModal(false);
  };

  const handleEdit = (row) => {
    alert(`수정: ${row.code} - ${row.name}`);
  };

  const handleDelete = (row) => {
    if (window.confirm(`${row.name} (${row.code})을 삭제하시겠습니까?`)) {
      setData((prev) => prev.filter((item) => item.code !== row.code));
    }
  };

  return (
    <div className="villa-code-page">
      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>코드별빌라</h2>

      <DataTable
        columns={columns}
        data={data}
        searchableKeys={["code", "name", "address"]}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {showModal && (
        <VillaRegisterModal
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
