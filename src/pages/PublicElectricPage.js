// src/pages/PublicElectricPage.js
import React, { useEffect, useState } from "react";
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
      const list = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
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

  const columns = [
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
      <DataTable columns={columns} data={villas} onEdit={handleEdit} />
      <GenericEditModal
        villa={selectedVilla}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVilla(null);
        }}
        onSave={handleSave}
        fields={["publicElectric", "publicElectricOwner", "publicElectricNote"]}
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
