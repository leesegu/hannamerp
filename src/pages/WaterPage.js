// src/pages/WaterPage.js
import React, { useEffect, useState, useRef } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

// 전자수용가번호 셀: 더블클릭하면 선택 + 복사
function CopyableCell({ value }) {
  const [copied, setCopied] = useState(false);
  const spanRef = useRef(null);

  const handleDblClick = async (e) => {
    e.stopPropagation();
    const text = String(value ?? "");
    if (!text) return;

    // 셀 텍스트 선택
    try {
      const sel = window.getSelection();
      if (sel && spanRef.current) {
        const range = document.createRange();
        range.selectNodeContents(spanRef.current);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch {}

    // 클립보드 복사 (HTTPS면 Clipboard API, 아니면 execCommand 폴백)
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  return (
    <span
      ref={spanRef}
      onDoubleClick={handleDblClick}
      style={{ userSelect: "text", cursor: "copy" }}
      title="더블클릭하면 복사"
    >
      {value || "-"}
      {copied && (
        <span style={{ marginLeft: 6, fontSize: 12, color: "#7A5FFF", fontWeight: 600 }}>
          복사됨
        </span>
      )}
    </span>
  );
}

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
    {
      label: "전자수용가번호",
      key: "waterNumber",
      render: (row) => <CopyableCell value={row.waterNumber} />, // ✅ 더블클릭 복사
    },
    { label: "명의", key: "waterOwner" },
    { label: "비고", key: "waterNote" },
  ];

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
        enableExcel={true}
        excelFields={excelFields}
        searchableKeys={["code", "name", "district", "address", "water", "waterNumber", "waterOwner", "waterNote"]}
      />

      <GenericEditModal
        villa={selectedVilla}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVilla(null);
        }}
        onSave={handleSave}
        fields={["waterNumber", "waterOwner", "waterNote"]}
        readOnlyKeys={["water"]} // ✅ 읽기 전용 상단 표시
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
