// src/pages/CctvPage.js
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function CctvPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 화면 표시 전용: YY-MM-DD 보정
  const formatDateYYMMDD = (v) => {
    if (!v && v !== 0) return "";
    const s = String(v).trim();
    if (/^\d{2}-\d{2}-\d{2}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{6}$/.test(s)) return `${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;
    if (/^\d{8}$/.test(s)) return `${s.slice(2,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    return s;
  };

  useEffect(() => {
    const q = query(collection(db, "villas"), where("cctv", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          cctv: data.cctv || "",
          cctvDomain: data.cctvDomain || "",
          cctvId: data.cctvId || "",
          cctvPw: data.cctvPw || "",
          cctvPort: data.cctvPort || "",
          cctvLastCheck: data.cctvLastCheck || "",
          cctvNote: data.cctvNote || "",
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
    { label: "CCTV", key: "cctv" },
    { label: "도메인", key: "cctvDomain" },
    { label: "아이디", key: "cctvId" },
    { label: "비밀번호", key: "cctvPw" },
    { label: "포트", key: "cctvPort" },
    {
      label: "최근확인일자",
      key: "cctvLastCheck",
      format: (v) => formatDateYYMMDD(v), // 화면 표시만 보정
    },
    { label: "비고", key: "cctvNote" },
  ];

  // ✅ 엑셀 업/다운로드용 필드 매핑 (헤더 ↔ 키 1:1)
  const excelFields = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "CCTV", key: "cctv" },
    { label: "도메인", key: "cctvDomain" },
    { label: "아이디", key: "cctvId" },
    { label: "비밀번호", key: "cctvPw" },
    { label: "포트", key: "cctvPort" },
    { label: "최근확인일자", key: "cctvLastCheck" }, // 예: 25-08-13
    { label: "비고", key: "cctvNote" },
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>CCTV 정보</PageTitle>

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
          "cctv",
          "cctvDomain",
          "cctvId",
          "cctvPw",
          "cctvPort",
          "cctvLastCheck",
          "cctvNote",
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
        fields={[
          "cctv",
          "cctvDomain",
          "cctvId",
          "cctvPw",
          "cctvPort",
          "cctvLastCheck",
          "cctvNote",
        ]}
        labels={{
          cctv: "CCTV",
          cctvDomain: "도메인",
          cctvId: "아이디",
          cctvPw: "비밀번호",
          cctvPort: "포트",
          cctvLastCheck: "최근확인일자",
          cctvNote: "비고",
        }}
        types={{
          cctvLastCheck: "date", // 최근확인일자는 날짜 입력
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
