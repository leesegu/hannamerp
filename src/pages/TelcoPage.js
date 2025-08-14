// src/pages/TelcoPage.js
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

export default function TelcoPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 🔎 통신사 필드가 있는 문서만 가져오기
  useEffect(() => {
    const q = query(collection(db, "villas"), where("telco", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          code: data.code || "",
          name: data.name || "",
          district: data.district || "",
          address: data.address || "",
          telco: data.telco || "",
          telcoAmount: data.telcoAmount ?? "",
          telcoName: data.telcoName ?? "",
          telcoBillNo: data.telcoBillNo ?? "",
          telcoLineCount: data.telcoLineCount ?? "",
          telcoReceiveMethod: data.telcoReceiveMethod ?? "",
          telcoContract: data.telcoContract ?? "",
          telcoSupport: data.telcoSupport ?? "",
          telcoNote: data.telcoNote ?? "",
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

  // ---------- 포맷 유틸 ----------
  const toYYMMDD = (date) => {
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  // 표시용/저장용 공통 포맷터 (빈 값 -> "")
  function formatDateYYMMDD(value) {
    if (!value && value !== 0) return "";
    // Firestore Timestamp
    if (typeof value === "object" && value?.seconds) {
      const d = new Date(value.seconds * 1000);
      return toYYMMDD(d);
    }
    // JS Date
    if (value instanceof Date) return toYYMMDD(value);
    // 숫자(ms)
    if (typeof value === "number") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? "" : toYYMMDD(d);
    }
    // 문자열
    if (typeof value === "string") {
      const s = value.trim();
      if (!s) return "";
      if (/^\d{8}$/.test(s)) {
        const yy = s.slice(2, 4);
        const mm = s.slice(4, 6);
        const dd = s.slice(6, 8);
        return `${yy}-${mm}-${dd}`;
      }
      if (/^\d{6}$/.test(s)) {
        const yy = s.slice(0, 2);
        const mm = s.slice(2, 4);
        const dd = s.slice(4, 6);
        return `${yy}-${mm}-${dd}`;
      }
      const parts = s.replace(/[./]/g, "-").split("-");
      if (parts.length === 3) {
        let [y, m, d] = parts.map((x) => x.padStart(2, "0"));
        if (y.length === 4) y = y.slice(2);
        return `${y}-${m}-${d}`;
      }
      const tryDate = new Date(s);
      return isNaN(tryDate.getTime()) ? s : toYYMMDD(tryDate);
    }
    return String(value ?? "");
  }

  // 숫자/금액 정규화 (빈 값이면 undefined 반환하여 저장 시 필드 제거 가능)
  const normalizeAmountForSave = (v) => {
    if (v === null || v === undefined) return undefined;
    const cleaned = String(v).replace(/[^\d.-]/g, "");
    if (!cleaned) return undefined;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  };
  const normalizeIntForSave = (v) => {
    if (v === null || v === undefined) return undefined;
    const cleaned = String(v).replace(/[^\d-]/g, "");
    if (!cleaned) return undefined;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  };

  const handleSave = async (updated) => {
    const { id, ...data } = updated;

    // ✅ 날짜 통일
    if (data.telcoContract) {
      data.telcoContract = formatDateYYMMDD(data.telcoContract);
    }

    // ✅ 금액/숫자 통일 (숫자 형태로 저장)
    const amt = normalizeAmountForSave(data.telcoAmount);
    const sup = normalizeAmountForSave(data.telcoSupport);
    const lines = normalizeIntForSave(data.telcoLineCount);

    if (amt === undefined) delete data.telcoAmount;
    else data.telcoAmount = amt;

    if (sup === undefined) delete data.telcoSupport;
    else data.telcoSupport = sup;

    if (lines === undefined) delete data.telcoLineCount;
    else data.telcoLineCount = lines;

    await updateDoc(doc(db, "villas", id), data);
    setIsModalOpen(false);
    setSelectedVilla(null);
  };

  // 📋 테이블 컬럼 정의
  const columns = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "통신사", key: "telco" },
    {
      label: "금액",
      key: "telcoAmount",
      format: (value) => {
        const num = Number(String(value).replace(/,/g, ""));
        return Number.isFinite(num) ? num.toLocaleString() : (value ?? "-");
      },
    },
    { label: "명의", key: "telcoName" },
    { label: "명세서번호", key: "telcoBillNo" },
    { label: "회선수", key: "telcoLineCount" },
    { label: "수신방법", key: "telcoReceiveMethod" },
    {
      label: "약정기간",
      key: "telcoContract",
      format: (value) => formatDateYYMMDD(value), // ✅ 표시도 YY-MM-DD
    },
    {
      label: "지원금",
      key: "telcoSupport",
      format: (value) => {
        const num = Number(String(value).replace(/,/g, ""));
        return Number.isFinite(num) ? num.toLocaleString() : (value ?? "-");
      },
    },
    { label: "비고", key: "telcoNote" },
  ];

  // 📑 엑셀 import/export 필드 (순서대로 저장/내보내기)
  const excelFields = [
    "code",
    "name",
    "district",
    "address",
    "telco",
    "telcoAmount",
    "telcoName",
    "telcoBillNo",
    "telcoLineCount",
    "telcoReceiveMethod",
    "telcoContract",
    "telcoSupport",
    "telcoNote",
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>통신사 정보</PageTitle>

      <DataTable
        columns={columns}
        data={villas}
        onEdit={handleEdit}
        // 🔽 검색/정렬/페이지 옵션
        sortKey="code"
        sortOrder="asc"
        itemsPerPage={15}
        // 🔽 엑셀 다운로드/업로드 활성화
        enableExcel={true}
        excelFields={excelFields}
      />

      <GenericEditModal
        villa={selectedVilla}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVilla(null);
        }}
        onSave={handleSave}
        // ✅ 수정 가능한 필드만 나열 (통신사는 읽기전용 헤더로 표시)
        fields={[
          "telcoAmount",
          "telcoName",
          "telcoBillNo",
          "telcoLineCount",
          "telcoReceiveMethod",
          "telcoContract",
          "telcoSupport",
          "telcoNote",
        ]}
        // ✅ 상단/읽기전용으로 함께 표시할 키
        readOnlyKeys={["telco"]}
        labels={{
          telco: "통신사",
          telcoAmount: "금액",
          telcoName: "명의",
          telcoBillNo: "명세서번호",
          telcoLineCount: "회선수",
          telcoReceiveMethod: "수신방법",
          telcoContract: "약정기간",
          telcoSupport: "지원금",
          telcoNote: "비고",
        }}
        types={{
          telcoAmount: "amount",
          telcoSupport: "amount",
          telcoLineCount: "number",
          telcoContract: "date",
        }}
        gridClass="modal-grid-3"
      />
    </div>
  );
}
