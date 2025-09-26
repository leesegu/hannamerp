// src/pages/PublicElectricPage.js
import React, { useEffect, useMemo, useState } from "react";
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

  // ========= ✅ 구 필터 =========
  const districtOptions = useMemo(() => {
    const set = new Set(villas.map((v) => (v.district ?? "").trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [villas]);

  const [districtFilter, setDistrictFilter] = useState(""); // "" = 전체

  const filteredVillas = useMemo(() => {
    return villas.filter((v) => {
      const d = (v.district ?? "").trim();
      return districtFilter ? d === districtFilter : true;
    });
  }, [villas, districtFilter]);

  useEffect(() => {
    if (districtFilter && !districtOptions.includes(districtFilter)) {
      setDistrictFilter("");
    }
  }, [districtOptions, districtFilter]);

  // ===== 버튼 스타일 =====
  const btn = {
    padding: "8px 12px",
    borderRadius: "10px",
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1.1,
  };
  const btnActive = { ...btn, background: "#7B5CFF", color: "#fff", borderColor: "#6a4cf0" };

  // ===== 검색창 왼쪽: 구 필터 버튼 =====
  const leftControls = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => setDistrictFilter("")}
        style={districtFilter === "" ? btnActive : btn}
        title="전체"
      >
        전체
      </button>
      {districtOptions.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => setDistrictFilter(opt)}
          style={districtFilter === opt ? btnActive : btn}
          title={`${opt}만 보기`}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  const columns = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "공용전기", key: "publicElectric" },
    { label: "명의", key: "publicElectricOwner" },
    { label: "비고", key: "publicElectricNote" },
  ];

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
        data={filteredVillas}       // ✅ 필터 적용된 데이터 사용
        onEdit={handleEdit}
        enableExcel={true}
        excelFields={excelFields}
        searchableKeys={[
          "code", "name", "district", "address",
          "publicElectric", "publicElectricOwner", "publicElectricNote"
        ]}
        /** ✅ 검색창과 같은 행(좌측)에 '구' 필터 버튼 배치 */
        leftControls={leftControls}
      />

      <GenericEditModal
        villa={selectedVilla}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVilla(null);
        }}
        onSave={handleSave}
        fields={["publicElectricOwner", "publicElectricNote"]}
        readOnlyKeys={["publicElectric"]}
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
