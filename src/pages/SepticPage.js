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

  useEffect(() => {
    const q = query(collection(db, "villas"), where("septic", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
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
    { label: "정화조", key: "septic" },
    { label: "창살제거", key: "septicGrate" },
    { label: "작업날짜", key: "septicDate" },
    { label: "금액", key: "septicAmount" },
    { label: "비고", key: "septicNote" },
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>정화조 정보</PageTitle>

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
        types={{}}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
