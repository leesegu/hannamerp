// src/pages/SepticPage.js
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom"; // ✅ 유지
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

  // ✅ 대시보드 → ?villa=<id> 수신
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const focusVilla =
    params.get("villa") ||
    params.get("id") ||
    params.get("row");

  useEffect(() => {
    const q = query(collection(db, "villas"), where("septic", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setVillas(list);
    });
    return () => unsubscribe();
  }, []);

  // ===== 금액 정규화 =====
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

    if (data.septicAmount !== undefined) {
      const n = normalizeAmount(data.septicAmount);
      if (n !== undefined) data.septicAmount = n;
      else delete data.septicAmount;
    }

    await updateDoc(doc(db, "villas", id), data);
    setIsModalOpen(false);
    setSelectedVilla(null);
  };

  // ===== ✅ 작업검토일 계산 (작업날짜의 1년 뒤 하루 전) =====
  // - 입력 포맷 유지: YYYY-MM-DD → YYYY-MM-DD, YY-MM-DD → YY-MM-DD
  // - 유효하지 않거나 비어있으면 ''(빈칸)
  const computeReviewDate = (dateStr) => {
    if (!dateStr) return "";
    const s = String(dateStr).trim();
    const m = s.match(/^(\d{2}|\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return "";

    const [, yStr, moStr, dStr] = m;
    let year = yStr.length === 2 ? 2000 + Number(yStr) : Number(yStr);
    const month = Number(moStr);
    const day = Number(dStr);

    // UTC 기준으로 계산(월/일 경계 안전)
    const base = new Date(Date.UTC(year, month - 1, day));
    if (isNaN(base)) return "";

    // +1년 -1일
    const next = new Date(Date.UTC(base.getUTCFullYear() + 1, base.getUTCMonth(), base.getUTCDate()));
    next.setUTCDate(next.getUTCDate() - 1);

    const outYearFull = next.getUTCFullYear();
    const outMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
    const outDay = String(next.getUTCDate()).padStart(2, "0");

    if (yStr.length === 2) {
      const yy = String(outYearFull).slice(-2);
      return `${yy}-${outMonth}-${outDay}`;
    }
    return `${outYearFull}-${outMonth}-${outDay}`;
  };

  // ===== 테이블 컬럼 =====
  const columns = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "정화조", key: "septic" },
    { label: "창살제거", key: "septicGrate" },
    { label: "작업날짜", key: "septicDate" },
    // ✅ 여기 추가: 작업날짜 오른쪽에 "작업검토" (계산된 표시용)
    { label: "작업검토", key: "septicReview" },
    {
      label: "금액",
      key: "septicAmount",
      format: (value) => {
        const num = Number(String(value).replace(/[^\d.-]/g, ""));
        return Number.isFinite(num) ? num.toLocaleString() : "-";
      },
    },
    { label: "비고", key: "septicNote" },
  ];

  // ===== 엑셀 필드 =====
  const excelFields = [
    "code", "name", "district", "address",
    "septic", "septicGrate", "septicDate",
    "septicAmount", "septicNote"
  ];

  // ===== 정화조 고유값 → 필터 버튼 (좌측 상단, 검색창과 같은 행) =====
  const septicOptions = useMemo(() => {
    const set = new Set(
      villas.map((v) => (v.septic ?? "").trim()).filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [villas]);

  const [septicFilter, setSepticFilter] = useState(""); // "" = 전체

  const filteredVillas = useMemo(() => {
    const base = villas.filter((v) => {
      const s = (v.septic ?? "").trim();
      return septicFilter ? s === septicFilter : true;
    });
    // ✅ 표시용 계산 필드 주입 (작업검토)
    return base.map((v) => ({
      ...v,
      septicReview: computeReviewDate(v.septicDate),
    }));
  }, [villas, septicFilter]);

  // 옵션 변화로 선택 값이 사라지면 초기화
  useEffect(() => {
    if (septicFilter && !septicOptions.includes(septicFilter)) {
      setSepticFilter("");
    }
  }, [septicOptions, septicFilter]);

  // ===== ✅ 필터 결과 총 금액 =====
  const totalAmount = useMemo(() => {
    let amount = 0;
    for (const v of filteredVillas) {
      const n = Number(String(v.septicAmount ?? "").replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n)) amount += n;
    }
    return amount;
  }, [filteredVillas]);

  // ===== 좌측 컨트롤(버튼들) + 총 금액 배지 =====
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

  // 배지 스타일 (ElevatorPage와 톤 맞춤)
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
        onClick={() => setSepticFilter("")}
        style={septicFilter === "" ? btnActive : btn}
        title="전체"
      >
        전체
      </button>
      {septicOptions.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => setSepticFilter(opt)}
          style={septicFilter === opt ? btnActive : btn}
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
      <PageTitle>정화조 정보</PageTitle>

      <DataTable
        columns={columns}
        data={filteredVillas}
        onEdit={handleEdit}
        sortKey="code"
        sortOrder="asc"
        itemsPerPage={15}
        enableExcel={true}
        excelFields={excelFields}
        /** ✅ 포커스 적용 */
        focusId={focusVilla}
        rowIdKey="id"
        /** ✅ 검색창과 같은 행(좌측)에 필터 버튼 + 총 금액 배지 배치 */
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
          "septicGrate",
          "septicDate",
          "septicAmount",
          "septicNote",
        ]}
        readOnlyKeys={["septic"]}
        labels={{
          septic: "정화조",
          septicGrate: "창살제거",
          septicDate: "작업날짜",
          septicAmount: "금액",
          septicNote: "비고",
        }}
        types={{
          septicDate: "date",
          septicAmount: "amount",
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
