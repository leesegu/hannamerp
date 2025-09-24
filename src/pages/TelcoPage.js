// src/pages/TelcoPage.js
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import DataTable from "../components/DataTable";
import GenericEditModal from "../components/GenericEditModal";
import PageTitle from "../components/PageTitle";

export default function TelcoPage() {
  const [villas, setVillas] = useState([]);
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  /** ================= 하이라이트(금액) 로컬 영속 ================= */
  const HKEY = "TelcoPage:amtHL";
  const readHL = () => {
    try {
      const raw = localStorage.getItem(HKEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  };
  const writeHL = (set) => {
    try { localStorage.setItem(HKEY, JSON.stringify(Array.from(set))); } catch {}
  };
  const [amtHL, setAmtHL] = useState(() => readHL());
  const isAmtHighlighted = (row) => !!row?.id && amtHL.has(row.id);
  const toggleAmtHL = (row) => {
    if (!row?.id) return;
    setAmtHL(prev => {
      const next = new Set(prev);
      next.has(row.id) ? next.delete(row.id) : next.add(row.id);
      writeHL(next);
      return next;
    });
  };
  const clearAllHighlights = () => {
    if (!window.confirm("금액 하이라이트를 모두 지울까요?")) return;
    const empty = new Set();
    setAmtHL(empty);
    writeHL(empty);
  };

  /** ================= 포커스 (?villa=ID) ================= */
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const focusVilla = params.get("villa");

  /** ================= 데이터 구독 ================= */
  useEffect(() => {
    const qy = query(collection(db, "villas"), where("telco", "!=", ""));
    const unsub = onSnapshot(qy, (snap) => {
      const list = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          code: x.code || "",
          name: x.name || "",
          district: x.district || "",
          address: x.address || "",
          telco: x.telco || "",
          telcoAmount: x.telcoAmount ?? "",
          telcoName: x.telcoName ?? "",
          telcoBillNo: x.telcoBillNo ?? "",
          telcoLineCount: x.telcoLineCount ?? "",
          telcoReceiveMethod: x.telcoReceiveMethod ?? "",
          telcoContract: x.telcoContract ?? "",
          telcoSupport: x.telcoSupport ?? "",
          telcoNote: x.telcoNote ?? "",
        };
      });
      setVillas(list);
    });
    return () => unsub();
  }, []);

  const handleEdit = (villa) => {
    setSelectedVilla(villa);
    setIsModalOpen(true);
  };

  /** ================= 포맷/정규화 유틸 ================= */
  const toYYMMDD = (d) =>
    `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  function formatDateYYMMDD(value) {
    if (!value && value !== 0) return "";
    if (typeof value === "object" && value?.seconds) return toYYMMDD(new Date(value.seconds * 1000));
    if (value instanceof Date) return toYYMMDD(value);
    if (typeof value === "number") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? "" : toYYMMDD(d);
    }
    const s = String(value).trim();
    if (!s) return "";
    if (/^\d{8}$/.test(s)) return `${s.slice(2, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    if (/^\d{6}$/.test(s)) return `${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
    const parts = s.replace(/[./]/g, "-").split("-");
    if (parts.length === 3) {
      let [y, m, d] = parts.map((x) => x.padStart(2, "0"));
      if (y.length === 4) y = y.slice(2);
      return `${y}-${m}-${d}`;
    }
    const tryD = new Date(s);
    return isNaN(tryD.getTime()) ? s : toYYMMDD(tryD);
  }

  const normalizeAmountForSave = (v) => {
    if (v == null) return undefined;
    const cleaned = String(v).replace(/[^\d.-]/g, "");
    if (!cleaned) return undefined;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  };
  const normalizeIntForSave = (v) => {
    if (v == null) return undefined;
    const cleaned = String(v).replace(/[^\d-]/g, "");
    if (!cleaned) return undefined;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  };

  const handleSave = async (updated) => {
    const { id, ...data } = updated;
    if (data.telcoContract) data.telcoContract = formatDateYYMMDD(data.telcoContract);

    const amt = normalizeAmountForSave(data.telcoAmount);
    const sup = normalizeAmountForSave(data.telcoSupport);
    const lines = normalizeIntForSave(data.telcoLineCount);

    if (amt === undefined) delete data.telcoAmount; else data.telcoAmount = amt;
    if (sup === undefined) delete data.telcoSupport; else data.telcoSupport = sup;
    if (lines === undefined) delete data.telcoLineCount; else data.telcoLineCount = lines;

    await updateDoc(doc(db, "villas", id), data);
    setIsModalOpen(false);
    setSelectedVilla(null);
  };

  /** ================= 금액 셀(우클릭 토글) ================= */
  const formatTelcoAmountCell = (value, row) => {
    const num = Number(String(value).replace(/,/g, ""));
    const display = Number.isFinite(num) ? num.toLocaleString() : (value ?? "-");
    const highlighted = isAmtHighlighted(row);
    const onCtx = (e) => {
      e.preventDefault();
      toggleAmtHL(row);
    };
    return (
      <span
        onContextMenu={onCtx}
        style={{
          cursor: "context-menu",
          padding: "0 4px",
          display: "inline-block",
          backgroundColor: highlighted ? "rgba(255, 235, 59, 0.6)" : "",
          borderRadius: highlighted ? "4px" : "",
          transition: "background-color 120ms ease",
        }}
        title="오른쪽 클릭으로 하이라이트 토글"
      >
        {display}
      </span>
    );
  };

  /** ================= 필터 옵션(통신사/명의) ================= */
  const telcoOptions = useMemo(() => {
    const set = new Set(villas.map(v => (v.telco ?? "").trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [villas]);

  const ownerOptions = useMemo(() => {
    const set = new Set(villas.map(v => (v.telcoName ?? "").trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [villas]);

  const [telcoFilter, setTelcoFilter] = useState(""); // "" = 전체
  const [ownerFilter, setOwnerFilter] = useState(""); // "" = 전체

  const filteredVillas = useMemo(() => {
    return villas.filter((v) => {
      const t = (v.telco ?? "").trim();
      const o = (v.telcoName ?? "").trim();
      const okT = telcoFilter ? t === telcoFilter : true;
      const okO = ownerFilter ? o === ownerFilter : true;
      return okT && okO;
    });
  }, [villas, telcoFilter, ownerFilter]);

  useEffect(() => { if (telcoFilter && !telcoOptions.includes(telcoFilter)) setTelcoFilter(""); }, [telcoOptions, telcoFilter]);
  useEffect(() => { if (ownerFilter && !ownerOptions.includes(ownerFilter)) setOwnerFilter(""); }, [ownerOptions, ownerFilter]);

  /** ================= 테이블 컬럼/엑셀 필드 ================= */
  const columns = [
    { label: "코드번호", key: "code" },
    { label: "빌라명", key: "name" },
    { label: "구", key: "district" },
    { label: "주소", key: "address" },
    { label: "통신사", key: "telco" },
    { label: "금액", key: "telcoAmount", format: (v, r) => formatTelcoAmountCell(v, r) },
    { label: "명의", key: "telcoName" },
    { label: "명세서번호", key: "telcoBillNo" },
    { label: "회선수", key: "telcoLineCount" },
    { label: "수신방법", key: "telcoReceiveMethod" },
    { label: "약정만료", key: "telcoContract", format: (v) => formatDateYYMMDD(v) },
    {
      label: "지원금",
      key: "telcoSupport",
      format: (v) => {
        const n = Number(String(v).replace(/,/g, ""));
        return Number.isFinite(n) ? n.toLocaleString() : (v ?? "-");
      },
    },
    { label: "비고", key: "telcoNote" },
  ];

  const excelFields = [
    "code", "name", "district", "address", "telco",
    "telcoAmount", "telcoName", "telcoBillNo",
    "telcoLineCount", "telcoReceiveMethod",
    "telcoContract", "telcoSupport", "telcoNote",
  ];

  /** ================= 좌측 툴바(검색창과 같은 행, 좌측 끝 정렬) ================= */
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
  const groupInline = { display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
  const divider = { width: 1, height: 18, background: "#e6e6ef", display: "inline-block", margin: "0 6px" };

  const leftControls = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {/* 통신사 버튼들 */}
      <div style={groupInline}>
        <button type="button" onClick={() => setTelcoFilter("")} style={telcoFilter === "" ? btnActive : btn} title="통신사 전체">전체</button>
        {telcoOptions.map((t) => (
          <button key={t} type="button" onClick={() => setTelcoFilter(t)} style={telcoFilter === t ? btnActive : btn} title={`${t}만 보기`}>
            {t}
          </button>
        ))}
      </div>

      <span style={divider} />

      {/* 명의 버튼들 */}
      <div style={groupInline}>
        <button type="button" onClick={() => setOwnerFilter("")} style={ownerFilter === "" ? btnActive : btn} title="명의 전체">전체</button>
        {ownerOptions.map((o) => (
          <button key={o} type="button" onClick={() => setOwnerFilter(o)} style={ownerFilter === o ? btnActive : btn} title={`${o}만 보기`}>
            {o}
          </button>
        ))}
      </div>

      <span style={divider} />

      {/* 하이라이트 해제 */}
      <div style={groupInline}>
        <button
          type="button"
          onClick={clearAllHighlights}
          style={{ ...btn, background: "#ffefef", borderColor: "#ffd0d0", color: "#c62828", fontWeight: 700 }}
          title="금액 하이라이트를 모두 지웁니다"
        >
          하이라이트 해제
        </button>
      </div>
    </div>
  );

  /** ================= 렌더 ================= */
  return (
    <div className="page-wrapper">
      <PageTitle>통신사 정보</PageTitle>

      <DataTable
        columns={columns}
        data={filteredVillas}
        onEdit={handleEdit}
        sortKey="code"
        sortOrder="asc"
        itemsPerPage={15}
        enableExcel={true}
        excelFields={excelFields}
        focusId={focusVilla}
        rowIdKey="id"
        /** ⬇️ 검색창과 같은 행의 '좌측' 슬롯 */
        leftControls={leftControls}
      />

      <GenericEditModal
        villa={selectedVilla}
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedVilla(null); }}
        onSave={handleSave}
        fields={[
          "telcoAmount","telcoName","telcoBillNo","telcoLineCount",
          "telcoReceiveMethod","telcoContract","telcoSupport","telcoNote",
        ]}
        readOnlyKeys={["telco"]}
        labels={{
          telco: "통신사", telcoAmount: "금액", telcoName: "명의", telcoBillNo: "명세서번호",
          telcoLineCount: "회선수", telcoReceiveMethod: "수신방법", telcoContract: "약정만료",
          telcoSupport: "지원금", telcoNote: "비고",
        }}
        types={{ telcoAmount: "amount", telcoSupport: "amount", telcoLineCount: "number", telcoContract: "date" }}
        gridClass="modal-grid-3"
      />
    </div>
  );
}
