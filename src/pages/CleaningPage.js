// src/pages/CleaningPage.js
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function CleaningPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 목록 구독: cleaning 값이 있는 문서만
  useEffect(() => {
    const qy = query(collection(db, "villas"), where("cleaning", "!=", ""));
    const unsubscribe = onSnapshot(qy, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          cleaning: data.cleaning || "",
          cleaningDay: data.cleaningDay || "",
          cleaningWeek: data.cleaningWeek || "",
          cleaningAmount: data.cleaningAmount ?? "",
          cleaningNote: data.cleaningNote || "",
        };
      });
      setVillas(list);
    });
    return () => unsubscribe();
  }, []);

  // 금액 포맷/정규화
  const formatAmount = (v) => {
    if (v === null || v === undefined || v === "") return "-";
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? "-" : n.toLocaleString();
  };
  const normalizeAmount = (v) => {
    const cleaned = String(v ?? "").replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  };

  const handleEdit = (villa) => {
    setSelectedVilla(villa);
    setIsModalOpen(true);
  };

  const handleSave = async (updated) => {
    const { id, ...data } = updated;
    if (data.cleaningAmount !== undefined) {
      const n = normalizeAmount(data.cleaningAmount);
      if (n !== undefined) data.cleaningAmount = n;
      else delete data.cleaningAmount;
    }
    await updateDoc(doc(db, "villas", id), data);
    setIsModalOpen(false);
    setSelectedVilla(null);
  };

  // ========= 필터: cleaning 고유값으로 버튼 =========
  const cleaningOptions = useMemo(() => {
    const set = new Set(
      villas.map((v) => (v.cleaning ?? "").trim()).filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [villas]);

  const [cleaningFilter, setCleaningFilter] = useState(""); // ""=전체

  const filteredVillas = useMemo(() => {
    return villas.filter((v) => {
      const c = (v.cleaning ?? "").trim();
      return cleaningFilter ? c === cleaningFilter : true;
    });
  }, [villas, cleaningFilter]);

  // 선택된 필터가 옵션에서 사라지면 초기화(데이터 변동 대비)
  useEffect(() => {
    if (cleaningFilter && !cleaningOptions.includes(cleaningFilter)) {
      setCleaningFilter("");
    }
  }, [cleaningOptions, cleaningFilter]);

  // ✅ 필터 결과 총 금액
  const totalAmount = useMemo(() => {
    let amount = 0;
    for (const v of filteredVillas) {
      const n = Number(String(v.cleaningAmount ?? "").replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n)) amount += n;
    }
    return amount;
  }, [filteredVillas]);

  // 테이블 컬럼
  const columns = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "건물청소", key: "cleaning" },
    { label: "요일", key: "cleaningDay" },
    { label: "주", key: "cleaningWeek" },
    {
      label: "금액",
      key: "cleaningAmount",
      format: (v) => formatAmount(v),
    },
    { label: "비고", key: "cleaningNote" },
  ];

  // 엑셀 필드
  const excelFields = [
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

  // ===== 상단 버튼(검색창과 같은 행, 좌측 끝) + 총 금액 배지 =====
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

  // 배지 스타일 (다른 페이지와 톤 맞춤)
  const badgeWrap = {
    display: "inline-flex",
    alignItems: "center",
    background: "#f6f3ff",
    border: "1px solid #e5dcff",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    color: "#5b40cc",
    whiteSpace: "nowrap",
    flexShrink: 0,
    minWidth: "max-content",
  };

  const leftControls = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", width: "100%" }}>
      <button
        type="button"
        onClick={() => setCleaningFilter("")}
        style={cleaningFilter === "" ? btnActive : btn}
        title="전체"
      >
        전체
      </button>
      {cleaningOptions.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => setCleaningFilter(opt)}
          style={cleaningFilter === opt ? btnActive : btn}
          title={`${opt}만 보기`}
        >
          {opt}
        </button>
      ))}

      {/* 오른쪽으로 밀어내기 */}
      <div style={{ flex: 1 }} />

      {/* ✅ 총 금액 배지 (검색창 바로 왼쪽) */}
      <div style={badgeWrap} title="현재 필터에 해당하는 총 금액">
        총 금액: {totalAmount.toLocaleString()}원
      </div>
    </div>
  );

  return (
    <div className="page-wrapper">
      <PageTitle>건물청소 정보</PageTitle>

      <DataTable
        columns={columns}
        data={filteredVillas}
        onEdit={handleEdit}
        enableExcel={true}
        excelFields={excelFields}
        searchableKeys={[
          "code", "name", "district", "address",
          "cleaning", "cleaningDay", "cleaningWeek", "cleaningAmount", "cleaningNote"
        ]}
        /** ⬇️ 검색창과 같은 행의 '좌측' 슬롯에 필터 버튼 + 총 금액 배지 배치 */
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
          "cleaningDay",
          "cleaningWeek",
          "cleaningAmount",
          "cleaningNote",
        ]}
        readOnlyKeys={["cleaning"]}
        labels={{
          cleaning: "건물청소",
          cleaningDay: "요일",
          cleaningWeek: "주",
          cleaningAmount: "금액",
          cleaningNote: "비고",
        }}
        types={{
          cleaningAmount: "amount",
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
