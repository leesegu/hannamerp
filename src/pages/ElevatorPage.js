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

export default function ElevatorPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "villas"), where("elevator", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          elevator: data.elevator || "",
          manufacturer: data.manufacturer || "",
          elevatorAmount: data.elevatorAmount || "",
          serialNumber: data.serialNumber || "",
          safetyManager: data.safetyManager || "",
          regularApply: data.regularApply || "",
          regularExpire: data.regularExpire || "",
          inspectionApply: data.inspectionApply || "",
          insuranceCompany: data.insuranceCompany || "",
          contractStart: data.contractStart || "",
          contractEnd: data.contractEnd || "",
          elevatorNote: data.elevatorNote || "",
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
    { label: "승강기", key: "elevator" },
    { label: "제조사", key: "manufacturer" },
    { label: "금액", key: "elevatorAmount" },
    { label: "제조번호", key: "serialNumber" },
    { label: "안전관리자", key: "safetyManager" },
    { label: "정기신청", key: "regularApply" },
    { label: "정기만료", key: "regularExpire" },
    { label: "검사신청", key: "inspectionApply" },
    { label: "보험사", key: "insuranceCompany" },
    { label: "계약일", key: "contractStart" },
    { label: "계약만기", key: "contractEnd" },
    { label: "비고", key: "elevatorNote" },
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>승강기 정보</PageTitle>

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
          "elevator",
          "manufacturer",
          "elevatorAmount",
          "serialNumber",
          "safetyManager",
          "regularApply",
          "regularExpire",
          "inspectionApply",
          "insuranceCompany",
          "contractStart",
          "contractEnd",
          "elevatorNote",
        ]}
        labels={{
          elevator: "승강기",
          manufacturer: "제조사",
          elevatorAmount: "금액",
          serialNumber: "제조번호",
          safetyManager: "안전관리자",
          regularApply: "정기신청",
          regularExpire: "정기만료",
          inspectionApply: "검사신청",
          insuranceCompany: "보험사",
          contractStart: "계약일",
          contractEnd: "계약만기",
          elevatorNote: "비고",
        }}
        types={{}}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
