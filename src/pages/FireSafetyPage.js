// src/pages/FireSafetyPage.js
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  deleteField, // ⬅️ 필드 삭제용
} from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function FireSafetyPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ✅ 대시보드 → ?villa=<id> 수신
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const focusVilla =
    params.get("villa") ||
    params.get("id") ||
    params.get("row");

  // 목록: fireSafety 값이 있는 문서만
  useEffect(() => {
    const qy = query(collection(db, "villas"), where("fireSafety", "!=", ""));
    const unsubscribe = onSnapshot(qy, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setVillas(list);
    });
    return () => unsubscribe();
  }, []);

  // ===== 포맷 유틸 =====
  const formatAmount = (v) => {
    if (v === "" || v == null) return "-";
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n.toLocaleString() : "-";
  };

  const toYYMMDD = (date) => {
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  const formatDateYYMMDD = (value) => {
    if (value === "" || value == null) return "";
    if (typeof value === "object" && value?.seconds) {
      const d = new Date(value.seconds * 1000);
      return isNaN(d) ? "" : toYYMMDD(d);
    }
    if (value instanceof Date) return toYYMMDD(value);
    if (typeof value === "number") {
      const d = new Date(value);
      return isNaN(d) ? "" : toYYMMDD(d);
    }
    const s = String(value).trim();
    if (!s) return "";
    if (/^\d{8}$/.test(s)) return `${s.slice(2,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    if (/^\d{6}$/.test(s))  return `${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;
    const parts = s.replace(/[./]/g, "-").split("-");
    if (parts.length === 3) {
      let [y, m, d] = parts.map((x) => x.padStart(2, "0"));
      if (y.length === 4) y = y.slice(2);
      return `${y}-${m}-${d}`;
    }
    const d = new Date(s);
    return isNaN(d) ? "" : toYYMMDD(d);
  };

  const normalizeAmount = (v) => {
    const cleaned = String(v ?? "").replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  };

  // 편집
  const handleEdit = (villa) => {
    setSelectedVilla(villa);
    setIsModalOpen(true);
  };

  const handleSave = async (updated) => {
    const { id, ...data } = updated;

    // 금액 정규화
    if (data.fireSafetyAmount !== undefined) {
      const n = normalizeAmount(data.fireSafetyAmount);
      if (n !== undefined) data.fireSafetyAmount = n;
      else data.fireSafetyAmount = deleteField(); // 비우면 실제 삭제
    }

    // 교육일자: 달력 X로 비우면 삭제, 있으면 포맷
    if (data.fireSafetyTrainingDate === "" || data.fireSafetyTrainingDate == null) {
      data.fireSafetyTrainingDate = deleteField();
    } else if (data.fireSafetyTrainingDate) {
      data.fireSafetyTrainingDate = formatDateYYMMDD(data.fireSafetyTrainingDate);
    }

    await updateDoc(doc(db, "villas", id), data);
    setIsModalOpen(false);
    setSelectedVilla(null);
  };

  // ===== 컬럼 =====
  const columns = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "소방안전", key: "fireSafety" },
    { label: "금액", key: "fireSafetyAmount", format: formatAmount },
    { label: "안전관리자", key: "fireSafetyManager" },
    { label: "교육일자", key: "fireSafetyTrainingDate", format: formatDateYYMMDD }, // ⬅️ 빈값이면 빈칸
    { label: "비고", key: "fireSafetyNote" },
  ];

  // ===== 엑셀 필드 =====
  const excelFields = [
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

  // ===== 소방안전 고유값 → 필터 버튼 (좌측 상단, 검색창과 같은 행) =====
  const safetyOptions = useMemo(() => {
    const set = new Set(
      villas.map((v) => (v.fireSafety ?? "").trim()).filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [villas]);

  const [safetyFilter, setSafetyFilter] = useState(""); // "" = 전체

  const filteredVillas = useMemo(() => {
    return villas.filter((v) => {
      const s = (v.fireSafety ?? "").trim();
      return safetyFilter ? s === safetyFilter : true;
    });
  }, [villas, safetyFilter]);

  useEffect(() => {
    if (safetyFilter && !safetyOptions.includes(safetyFilter)) setSafetyFilter("");
  }, [safetyOptions, safetyFilter]);

  // 좌측 버튼들
  const btn = {
    padding: "8px 12px",
    borderRadius: "10px",
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1.1,
  };
  const btnActive = { ...btn, background: "#7B5CFF", color: "#fff", borderColor: "#6a4cf0" };

  const leftControls = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => setSafetyFilter("")}
        style={safetyFilter === "" ? btnActive : btn}
        title="전체"
      >
        전체
      </button>
      {safetyOptions.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => setSafetyFilter(opt)}
          style={safetyFilter === opt ? btnActive : btn}
          title={`${opt}만 보기`}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page-wrapper">
      <PageTitle>소방안전 정보</PageTitle>

      <DataTable
        columns={columns}
        data={filteredVillas}
        onEdit={handleEdit}
        enableExcel={true}
        excelFields={excelFields}
        searchableKeys={[
          "code", "name", "district", "address",
          "fireSafety", "fireSafetyManager", "fireSafetyTrainingDate", "fireSafetyNote"
        ]}
        /** ✅ 포커스 적용 */
        focusId={focusVilla}
        rowIdKey="id"
        /** ✅ 검색창과 같은 행(좌측)에 필터 버튼 배치 */
        leftControls={leftControls}
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
          "fireSafetyAmount",
          "fireSafetyManager",
          "fireSafetyTrainingDate",
          "fireSafetyNote",
        ]}
        readOnlyKeys={["fireSafety"]}
        labels={{
          fireSafety: "소방안전",
          fireSafetyAmount: "금액",
          fireSafetyManager: "안전관리자",
          fireSafetyTrainingDate: "교육일자",
          fireSafetyNote: "비고",
        }}
        types={{
          fireSafetyAmount: "amount",
          fireSafetyTrainingDate: "date", // ⬅️ 달력 + X(클리어)
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
