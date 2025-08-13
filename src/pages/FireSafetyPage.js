// src/pages/FireSafetyPage.js
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function FireSafetyPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "villas"), where("fireSafety", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          fireSafety: data.fireSafety || "",
          fireSafetyAmount: data.fireSafetyAmount || "",
          fireSafetyManager: data.fireSafetyManager || "",
          fireSafetyTrainingDate: data.fireSafetyTrainingDate || "",
          fireSafetyNote: data.fireSafetyNote || "",
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
    { label: "소방안전", key: "fireSafety" },
    { label: "금액", key: "fireSafetyAmount" },
    { label: "안전관리자", key: "fireSafetyManager" },
    { label: "교육일자", key: "fireSafetyTrainingDate" },
    { label: "비고", key: "fireSafetyNote" },
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>소방안전 정보</PageTitle>
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
          "fireSafety",
          "fireSafetyAmount",
          "fireSafetyManager",
          "fireSafetyTrainingDate",
          "fireSafetyNote",
        ]}
        labels={{
          fireSafety: "소방안전",
          fireSafetyAmount: "금액",
          fireSafetyManager: "안전관리자",
          fireSafetyTrainingDate: "교육일자",
          fireSafetyNote: "비고",
        }}
        types={{}}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
