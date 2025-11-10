// src/pages/CctvPage.js
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function CctvPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const formatDateYYMMDD = (v) => {
    if (!v && v !== 0) return "";
    const s = String(v).trim();
    if (/^\d{2}-\d{2}-\d{2}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{6}$/.test(s)) return `${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;
    if (/^\d{8}$/.test(s)) return `${s.slice(2,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    return s;
  };

  useEffect(() => {
    const q = query(collection(db, "villas"), where("cctv", "!=", ""));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
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

  /* === 추가: 복사 텍스트 생성 & 복사 함수 (요청 포맷 반영 · 괄호 제거) === */
  const buildCopyText = (row) => {
    const addr = row?.address ?? "";
    const name = row?.name ?? "";
    const cctv = row?.cctv ?? "";
    const domain = row?.cctvDomain ?? "";
    const cctvId = row?.cctvId ?? "";
    const cctvPw = row?.cctvPw ?? "";
    const port = row?.cctvPort ?? "";

    // ✅ 새 포맷 (괄호 제거, "주소번지 빌라명" 라인과 섹션 제목 고정)
    return (
`안녕하세요 한남주택관리입니다

${addr}번지 ${name}

CCTV 정보
어플이름 : ${cctv}
IP주소 : ${domain}
아이디 : ${cctvId}
비밀번호 : ${cctvPw}
포트 : ${port}`
    );
  };

  const handleCopy = async (row) => {
    const text = buildCopyText(row);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      alert("복사되었습니다.");
    } catch (e) {
      console.error(e);
      alert("복사 중 오류가 발생했습니다.");
    }
  };

  const columns = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "CCTV", key: "cctv" },
    { label: "도메인", key: "cctvDomain" },
    { label: "아이디", key: "cctvId" },
    { label: "비밀번호", key: "cctvPw" },
    { label: "포트", key: "cctvPort" },
    {
      label: "최근확인일자",
      key: "cctvLastCheck",
      format: (v) => formatDateYYMMDD(v),
    },
    { label: "비고", key: "cctvNote" },

    /* === 추가 컬럼: 복사 (비고와 관리 사이) ===
       DataTable이 컬럼의 render(row) 또는 format(value, row)를 지원한다고 가정합니다. */
    {
      label: "복사",
      key: "__copy__", // 실제 데이터 키는 아님
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation?.(); handleCopy(row); }}
          title="CCTV 정보 복사"
          style={{
            // ✅ 테두리/배경 제거: 아이콘만 보이도록
            border: "none",
            background: "transparent",
            padding: 0,
            width: 28,
            height: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "transform .06s ease, filter .15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.05)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
          onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(1px)"; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
        >
          {/* ▶ 심플 & 직관적인 '복사' 아이콘 (겹치는 문서) — 보더 없는 라인/면 조합 */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"
          >
            <defs>
              <linearGradient id="copyGold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#F6DFA8"/>
                <stop offset="50%" stopColor="#E4C079"/>
                <stop offset="100%" stopColor="#CFA862"/>
              </linearGradient>
            </defs>
            {/* 뒤 문서(잉크 라인) */}
            <rect x="9" y="7" width="9.5" height="11" rx="2"
                  fill="none" stroke="#2B314C" strokeWidth="1.5" />
            {/* 앞 문서(연한 면 + 골드 상단 탭) */}
            <rect x="5" y="4" width="9.5" height="11" rx="2"
                  fill="#F8FAFC" stroke="#94A3B8" strokeWidth="1.2" />
            <rect x="7" y="4" width="5.5" height="1.8" rx="0.9" fill="url(#copyGold)" />
            {/* 텍스트 라인 */}
            <path d="M7.2 8h5.8M7.2 10.2h5.8M7.2 12.4h3.6"
                  stroke="#2B314C" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      ),
    },
  ];

  const excelFields = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "CCTV", key: "cctv" },
    { label: "도메인", key: "cctvDomain" },
    { label: "아이디", key: "cctvId" },
    { label: "비밀번호", key: "cctvPw" },
    { label: "포트", key: "cctvPort" },
    { label: "최근확인일자", key: "cctvLastCheck" },
    { label: "비고", key: "cctvNote" },
  ];

  return (
    <div className="page-wrapper">
      <PageTitle>CCTV 정보</PageTitle>

      <DataTable
        columns={columns}
        data={villas}
        onEdit={handleEdit}
        enableExcel={true}
        excelFields={excelFields}
        searchableKeys={[
          "code", "name", "district", "address",
          "cctv", "cctvDomain", "cctvId", "cctvPw", "cctvPort", "cctvLastCheck", "cctvNote"
        ]}
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
          "cctvDomain",
          "cctvId",
          "cctvPw",
          "cctvPort",
          "cctvLastCheck",
          "cctvNote",
        ]}
        readOnlyKeys={["cctv"]}
        labels={{
          cctv: "CCTV",
          cctvDomain: "도메인",
          cctvId: "아이디",
          cctvPw: "비밀번호",
          cctvPort: "포트",
          cctvLastCheck: "최근확인일자",
          cctvNote: "비고",
        }}
        types={{
          cctvLastCheck: "date",
        }}
        gridClass="modal-grid-2"
      />
    </div>
  );
}
