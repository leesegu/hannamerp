// src/pages/VendorsMainPage.js
import React, { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import DataTable from "../components/DataTable";
import PageTitle from "../components/PageTitle";
import GenericEditModal from "../components/GenericEditModal";

export default function VendorsMainPage() {
  const [vendors, setVendors] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editVendor, setEditVendor] = useState(null); // 모달 폼 데이터
  const [origId, setOrigId] = useState(null);         // 기존 문서 ID (이름 변경 감지용)

  // 실시간 구독
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "vendorsAll"), (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setVendors(list);
    });
    return () => unsubscribe();
  }, []);

  // 테이블/모달 공통 필드
  const fields = useMemo(
    () => [
      "vendor",
      "type",
      "bizNo",
      "phone",
      "cell",
      "fax",
      "bank",
      "accountName",
      "accountNo",
      "note",
      "memo",
    ],
    []
  );

  // ✅ 중복 검사 대상 필드 (동일 필드끼리만 검사)
  const duplicateCheckKeys = useMemo(
    () => ["vendor", "bizNo", "phone", "cell", "fax", "accountNo"],
    []
  );

  const labels = {
    vendor: "거래처*",
    type: "구분",
    bizNo: "사업자등록번호",
    phone: "대표번호",
    cell: "개인번호",
    fax: "FAX",
    bank: "은행",
    accountName: "예금주",
    accountNo: "계좌번호",
    note: "특이사항",
    memo: "비고",
  };

  const types = {
    bizNo: "text",
    phone: "text",
    cell: "text",
    fax: "text",
    accountNo: "text",
  };

  const safeDocId = (raw) =>
    String(raw || "")
      .trim()
      .replace(/\//g, "∕")
      .slice(0, 1500);

  // 등록 버튼 → 빈 객체로 모달 열기
  const handleAdd = () => {
    setEditVendor({
      vendor: "",
      type: "",
      bizNo: "",
      phone: "",
      cell: "",
      fax: "",
      bank: "",
      accountName: "",
      accountNo: "",
      note: "",
      memo: "",
    });
    setOrigId(null);
    setShowModal(true);
  };

  // 행 수정 버튼 → 해당 데이터로 모달 열기
  const handleEdit = (row) => {
    setEditVendor({
      vendor: row.vendor || "",
      type: row.type || "",
      bizNo: row.bizNo || "",
      phone: row.phone || "",
      cell: row.cell || "",
      fax: row.fax || "",
      bank: row.bank || "",
      accountName: row.accountName || "",
      accountNo: row.accountNo || "",
      note: row.note || "",
      memo: row.memo || "",
    });
    setOrigId(row.id);
    setShowModal(true);
  };

  // 🔎 중복 검사: 지정한 각 필드별로 "동일 필드" 값 완전 일치(자기 자신 제외)
  const findExactFieldDuplicates = (form) => {
    const trimmed = (v) => String(v ?? "").trim();
    const dupMap = {}; // { fieldKey: [vendorNames...] }

    duplicateCheckKeys.forEach((key) => {
      const value = trimmed(form[key]);
      if (!value) return;

      const matches = vendors.filter((v) => {
        if (origId && v.id === origId) return false; // 자기 자신 제외
        return trimmed(v[key]) === value;            // 동일 필드에서만 비교
      });

      if (matches.length > 0) {
        dupMap[key] = matches.map((m) => m.vendor || m.id);
      }
    });

    return dupMap;
  };

  // 모달 저장 처리 (등록/수정 공통)
  const handleSaveFromModal = async (form) => {
    // 1) 지정 필드 중복 경고
    const dupMap = findExactFieldDuplicates(form);
    const hasDup = Object.keys(dupMap).length > 0;
    if (hasDup) {
      const lines = Object.entries(dupMap).map(([key, names]) => {
        const label = labels[key] || key;
        return `- ${label} 값이 기존 항목과 동일: ${names.join(", ")}`;
      });
      const ok = window.confirm(
        `다음 항목의 값이 기존 데이터와 완전히 일치합니다:\n\n${lines.join(
          "\n"
        )}\n\n그래도 저장하시겠습니까?`
      );
      if (!ok) return; // 사용자가 '아니오' 선택 → 저장 중단
    }

    // 2) ID 및 저장
    const newId = safeDocId(form.vendor);
    if (!newId) {
      alert("거래처명은 필수입니다.");
      return;
    }

    const dataToSave = {
      vendor: form.vendor?.trim() || "",
      type: form.type?.trim() || "",
      bizNo: form.bizNo?.trim() || "",
      phone: form.phone?.trim() || "",
      cell: form.cell?.trim() || "",
      fax: form.fax?.trim() || "",
      bank: form.bank?.trim() || "",
      accountName: form.accountName?.trim() || "",
      accountNo: form.accountNo?.trim() || "",
      note: form.note?.trim() || "",
      memo: form.memo?.trim() || "",
    };

    // 문서 ID가 바뀌면: 새 ID로 쓰고, 기존 ID 삭제
    if (origId && origId !== newId) {
      await setDoc(doc(db, "vendorsAll", newId), dataToSave, { merge: true });
      await deleteDoc(doc(db, "vendorsAll", origId));
    } else {
      const targetId = origId || newId;
      await setDoc(doc(db, "vendorsAll", targetId), dataToSave, { merge: true });
    }

    setShowModal(false);
    setEditVendor(null);
    setOrigId(null);
  };

  // 삭제
  const handleDelete = async (row) => {
    if (!row?.id) return;
    if (!window.confirm(`${row.vendor || row.id} 항목을 삭제하시겠습니까?`)) return;
    await deleteDoc(doc(db, "vendorsAll", row.id));
  };

  return (
    <div className="page-wrapper">
      <PageTitle>거래처목록</PageTitle>

      <DataTable
        columns={[
          { key: "vendor", label: "거래처", editable: true },
          { key: "type", label: "구분", editable: true },
          { key: "bizNo", label: "사업자등록번호", editable: true },
          { key: "phone", label: "대표번호", editable: true },
          { key: "cell", label: "개인번호", editable: true },
          { key: "fax", label: "FAX", editable: true },
          { key: "bank", label: "은행", editable: true },
          { key: "accountName", label: "예금주", editable: true },
          { key: "accountNo", label: "계좌번호", editable: true },
          { key: "note", label: "특이사항", editable: true },
          { key: "memo", label: "비고", editable: true },
        ]}
        data={vendors}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        // 🔎 searchableKeys 제거 → 모든 컬럼 + row 전체 검색
        sortKey="vendor"
        enableExcel
        collectionName="vendorsAll"
        idKey="vendor"
        idAliases={["거래처", "업체명", "이름"]}
        excelFields={fields}
        onUploadComplete={({ updated, skipped }) => {
          console.log(`업데이트: ${updated}, 스킵: ${skipped}`);
          alert("엑셀 업로드가 완료되었습니다.");
        }}
      />

      {/* 공통 모달: 읽기전용 헤더 제거, 모달 제목 prop 사용 안 함 */}
      {showModal && (
        <GenericEditModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setEditVendor(null);
            setOrigId(null);
          }}
          onSave={handleSaveFromModal}
          villa={editVendor}
          headerKeys={[]}           // 읽기전용 상단 표시 안함
          readOnlyKeys={[]}         // 전부 수정 가능
          fields={fields}
          gridClass="modal-grid-2"  // 2열 레이아웃
          labels={labels}
          types={types}
        />
      )}
    </div>
  );
}
