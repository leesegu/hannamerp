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

  useEffect(() => {
    const q = query(collection(db, "villas"), where("cctv", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
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
    { label: "최근확인일자", key: "cctvLastCheck" },
    { label: "비고", key: "cctvNote" },
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>CCTV 정보</PageTitle>
      <DataTable columns={columns} data={villas} onEdit={handleEdit} />
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
