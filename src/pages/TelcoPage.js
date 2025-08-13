// src/pages/TelcoPage.js
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

export default function TelcoPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 🔎 통신사 필드가 있는 문서만 가져오기
  useEffect(() => {
    const q = query(collection(db, "villas"), where("telco", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          telco: data.telco || "",
          telcoAmount: data.telcoAmount || "",
          telcoName: data.telcoName || "",
          telcoBillNo: data.telcoBillNo || "",
          telcoLineCount: data.telcoLineCount || "",
          telcoReceiveMethod: data.telcoReceiveMethod || "",
          telcoContract: data.telcoContract || "",
          telcoSupport: data.telcoSupport || "",
          telcoNote: data.telcoNote || "",
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

  // 📋 테이블 컬럼 정의
  const columns = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "통신사", key: "telco" },
    {
      label: "금액",
      key: "telcoAmount",
      format: (value) => {
        const num = Number(String(value).replace(/,/g, ""));
        return isNaN(num) ? (value ?? "-") : num.toLocaleString();
      },
    },
    { label: "명의", key: "telcoName" },
    { label: "명세서번호", key: "telcoBillNo" },
    { label: "회선수", key: "telcoLineCount" },
    { label: "수신방법", key: "telcoReceiveMethod" },
    { label: "약정기간", key: "telcoContract" },
    { label: "지원금", key: "telcoSupport" },
    { label: "비고", key: "telcoNote" },
  ];

  // 📑 엑셀 import/export 필드 (순서대로 저장/내보내기)
  const excelFields = [
    "code",
    "name",
    "district",
    "address",
    "telco",
    "telcoAmount",
    "telcoName",
    "telcoBillNo",
    "telcoLineCount",
    "telcoReceiveMethod",
    "telcoContract",
    "telcoSupport",
    "telcoNote",
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>통신사 정보</PageTitle>

      <DataTable
        columns={columns}
        data={villas}
        onEdit={handleEdit}
        // 🔽 검색/정렬/페이지 옵션
        searchableKeys={["code", "name", "district", "address", "telco"]}
        sortKey="code"
        sortOrder="asc"
        itemsPerPage={15}
        // 🔽 엑셀 다운로드/업로드 활성화 (비밀번호 확인은 DataTable 내부에 적용됨)
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
          "telco",
          "telcoAmount",
          "telcoName",
          "telcoBillNo",
          "telcoLineCount",
          "telcoReceiveMethod",
          "telcoContract",
          "telcoSupport",
          "telcoNote",
        ]}
        labels={{
          telco: "통신사",
          telcoAmount: "금액",
          telcoName: "명의",
          telcoBillNo: "명세서번호",
          telcoLineCount: "회선수",
          telcoReceiveMethod: "수신방법",
          telcoContract: "약정기간",
          telcoSupport: "지원금",
          telcoNote: "비고",
        }}
        types={{
          telcoAmount: "amount", // ✅ 금액: 쉼표 포맷
          telcoContract: "date", // ✅ 날짜: 'YY-MM-DD' 자동 포맷
        }}
        gridClass="modal-grid-3"
      />
    </div>
  );
}
