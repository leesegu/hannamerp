// src/pages/CleaningPage.js
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function CleaningPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "villas"), where("cleaning", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          cleaning: data.cleaning || "",
          cleaningDay: data.cleaningDay || "",
          cleaningWeek: data.cleaningWeek || "",
          cleaningAmount: data.cleaningAmount || "",
          cleaningNote: data.cleaningNote || "",
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
    { label: "건물청소", key: "cleaning" },
    { label: "요일", key: "cleaningDay" },
    { label: "주", key: "cleaningWeek" },
    { label: "금액", key: "cleaningAmount" },
    { label: "비고", key: "cleaningNote" },
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>건물청소 정보</PageTitle>
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
          "cleaning",
          "cleaningDay",
          "cleaningWeek",
          "cleaningAmount",
          "cleaningNote"
        ]}
        labels={{
          cleaning: "건물청소",
          cleaningDay: "요일",
          cleaningWeek: "주",
          cleaningAmount: "금액",
          cleaningNote: "비고"
        }}
        types={{}}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
