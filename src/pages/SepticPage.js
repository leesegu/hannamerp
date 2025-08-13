// src/pages/SepticPage.js
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

export default function SepticPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 🔎 정화조(septic) 필드가 채워진 문서만 조회
  useEffect(() => {
    const q = query(collection(db, "villas"), where("septic", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          septic: data.septic || "",
          septicGrate: data.septicGrate || "",
          septicDate: data.septicDate || "",
          septicAmount: data.septicAmount || "",
          septicNote: data.septicNote || "",
        };
      });
      setVillas(list);
    });

    return () => unsubscribe();
  }, []);

  // 💰 금액 정규화: "₩12,300" -> 12300 (숫자), 빈 값/이상치 -> 빈 문자열
  function normalizeAmount(v) {
    if (v === null || v === undefined) return "";
    const raw = String(v).trim();
    if (raw === "" || raw === "-") return "";
    const cleaned = raw.replace(/[^\d.-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === "-.") return "";
    const n = Number(cleaned);
    return isNaN(n) ? "" : n;
  }

  // ✏ 수정
  const handleEdit = (villa) => {
    setSelectedVilla(villa);
    setIsModalOpen(true);
  };

  // 💾 저장 (금액 정규화 적용)
  const handleSave = async (updated) => {
    const { id, ...data } = updated;

    if ("septicAmount" in data) {
      data.septicAmount = normalizeAmount(data.septicAmount);
    }

    await updateDoc(doc(db, "villas", id), data);
    setIsModalOpen(false);
    setSelectedVilla(null);
  };

  // 📋 테이블 컬럼 (금액 포맷터 개선)
  const columns = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "정화조", key: "septic" },
    { label: "창살제거", key: "septicGrate" },
    { label: "작업날짜", key: "septicDate" },
    {
      label: "금액",
      key: "septicAmount",
      format: (value) => {
        // 1) 완전 빈 값 처리
        if (value === null || value === undefined) return "-";
        const raw = String(value).trim();
        if (raw === "" || raw === "-") return "-";

        // 2) 숫자만 추출 (통화기호/쉼표 제거)
        const cleaned = raw.replace(/[^\d.-]/g, ""); // 예: "₩12,300" -> "12300"

        // 3) 비정상/빈 문자열 처리
        if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === "-.") return "-";

        const num = Number(cleaned);
        if (isNaN(num)) return "-";   // 숫자 변환 실패 시 대시
        return num.toLocaleString();  // 정상 숫자는 쉼표 포맷
      },
    },
    { label: "비고", key: "septicNote" },
  ];

  // 📑 엑셀 import/export 필드 (순서 고정)
  const excelFields = [
    "code",
    "name",
    "district",
    "address",
    "septic",
    "septicGrate",
    "septicDate",
    "septicAmount",
    "septicNote",
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>정화조 정보</PageTitle>

      <DataTable
        columns={columns}
        data={villas}
        onEdit={handleEdit}
        // 🔽 검색/정렬/페이지 옵션
        sortKey="code"
        sortOrder="asc"
        itemsPerPage={15}
        // 🔽 엑셀 버튼/아이콘/글씨 크기 — TelcoPage와 동일 UI
        enableExcel={true}
        excelFields={excelFields}
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
          "septic",
          "septicGrate",
          "septicDate",
          "septicAmount",
          "septicNote",
        ]}
        labels={{
          septic: "정화조",
          septicGrate: "창살제거",
          septicDate: "작업날짜",
          septicAmount: "금액",
          septicNote: "비고",
        }}
        // ✅ 금액/날짜 입력 UX 통일
        types={{
          septicAmount: "amount", // 쉼표 포맷 자동
          septicDate: "date",     // 날짜 포맷 자동 (GenericEditModal 공통 로직)
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
