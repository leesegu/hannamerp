// src/pages/MoveoutList.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { db } from "../firebase";
import {
  collection, onSnapshot, query, orderBy,
  deleteDoc, doc, getDocs, where,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import * as htmlToImage from "html-to-image";
import { jsPDF } from "jspdf";

import DataTable from "../components/DataTable";
import PageTitle from "../components/PageTitle";
import ReceiptTemplate from "../components/ReceiptTemplate";
import MoveoutForm from "../MoveoutForm";

const storage = getStorage();

/* ---------- 유틸 ---------- */
const toNum = (v) =>
  v === "" || v == null ? 0 : (Number(String(v).replace(/[,\s]/g, "")) || 0);

const sumExtrasFromArray = (extras) =>
  (extras || []).reduce((acc, it) => acc + (Number(it?.amount || 0) || 0), 0);

const getExtraTotal = (x) => {
  const sx = Array.isArray(x.extras) ? sumExtrasFromArray(x.extras) : 0;
  return sx || toNum(x.extraAmount);
};

const sumTotal = (x) =>
  toNum(x.arrears) +
  toNum(x.currentMonth) +
  toNum(x.waterFee) +
  toNum(x.electricity) +
  toNum(x.tvFee) +
  toNum(x.cleaningFee) +
  getExtraTotal(x);

const fmtAmount = (val) => {
  const n = toNum(val);
  return n ? n.toLocaleString() : (val === 0 ? "0" : "");
};

const IconBtn = ({ active = true, type, title, onClick }) => {
  const color = active
    ? type === "note" ? "#F59E0B"
    : type === "extras" ? "#0EA5E9"
    : type === "receipt" ? "#14B8A6"
    : "#7A5FFF"
    : "#bbb";
  const char =
    type === "note" ? "📝" : type === "extras" ? "🧾" : type === "receipt" ? "📑" : "🖼️";
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        if (active) onClick?.();
      }}
      style={{
        background: "transparent",
        border: "none",
        color,
        fontSize: 18,
        lineHeight: 1,
        cursor: active ? "pointer" : "default",
        padding: 0,
      }}
      disabled={!active}
    >
      {char}
    </button>
  );
};

/* 진행현황 점 색상 */
const StatusCell = ({ value }) => {
  const v = String(value || "").trim();
  let color = "#9CA3AF";
  if (v === "입금대기") color = "#EF4444";
  if (v === "정산완료") color = "#10B981";
  if (v === "정산대기") color = "#9CA3AF";
  const dot = (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        marginRight: 6,
        verticalAlign: "middle",
      }}
    />
  );
  return <span>{dot}{v || "-"}</span>;
};

const FlagDots = ({ first, exclude }) => {
  const wrap = { display: "inline-flex", gap: 4, marginLeft: 6, verticalAlign: "middle" };
  const dot = (bg, title) => (
    <span
      title={title}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: bg,
        opacity: 0.9,
      }}
    />
  );
  return (
    <span style={wrap}>
      {first && dot("#3b9904ff", "1차정산")}
      {exclude && dot("#f70303ff", "보증금제외")}
    </span>
  );
};

/* 빌라명 정규화(공백/대소문자 무시) */
const normVilla = (s) => String(s ?? "")
  .trim()
  .replace(/\s+/g, " ")
  .toLowerCase();

/* ---------- 메인 ---------- */
export default function MoveoutList({ employeeId, userId, isMobile }) {
  const navigate = useNavigate();
  const { search } = useLocation();

  // 대시보드가 넘겨준 쿼리 파라미터
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const paramRowId = params.get("row") || ""; // 백워드 호환
  const paramVillaRaw = params.get("villa") || params.get("villaName") || "";
  const paramVilla = normVilla(paramVillaRaw);

  const [rows, setRows] = useState([]);

  // 공용 폼 모달
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [currentItem, setCurrentItem] = useState(null);

  // 미니뷰어 & 영수증
  const [miniOpen, setMiniOpen] = useState(false);
  const [miniType, setMiniType] = useState(null);
  const [miniRow, setMiniRow] = useState(null);
  const [miniPhotoIdx, setMiniPhotoIdx] = useState(0);

  const [fullImageOpen, setFullImageOpen] = useState(false);
  const [fullImageSrc, setFullImageSrc] = useState("");

  // 진행현황 필터(요청: 대시보드 클릭해도 변경하지 않음)
  const [statusFilter, setStatusFilter] = useState("ALL");

  // 🔹 영수증 미리보기 상태
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptRow, setReceiptRow] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  const receiptRef = useRef(null);

  /* 데이터 구독 */
  useEffect(() => {
    const q = query(collection(db, "moveouts"), orderBy("moveDate", "desc"));
    return onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  /* 필터 */
  const rowsForFilter = useMemo(() => (
    statusFilter === "ALL" ? rows : rows.filter((r) => String(r.status || "") === statusFilter)
  ), [rows, statusFilter]);

  const sumForFilter = useMemo(() => {
    if (statusFilter !== "입금대기") return 0;
    return rows
      .filter((r) => String(r.status || "") === "입금대기")
      .reduce((acc, r) => acc + toNum(sumTotal(r)), 0);
  }, [rows, statusFilter]);

  /* ===========================
   * ✅ 정렬 로직 (완전 새로 작성)
   * - 날짜 우선: 오늘(0) → 어제(-1) → 내일(+1) → 모레(+2) → 그 이후 미래(오름차순) → 어제 이전 과거(내림차순: -2, -3 … 가까운 과거 우선)
   * - 동일 날짜 내 2차 정렬: 진행현황 "정산대기(0) → 입금대기(1) → 정산완료(2) → 기타(3)"
   * - 이후 타이브레이커: id 오름차순
   * - 유효하지 않은 날짜는 맨 아래
   * =========================== */
  const sortedRows = useMemo(() => {
    const today = new Date();
    const todayY = today.getFullYear();
    const todayM = today.getMonth();
    const todayD = today.getDate();
    const todayStart = new Date(todayY, todayM, todayD);

    const dayDiff = (ymdStr) => {
      // ymdStr: YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymdStr || ""))) return null;
      const [y, m, d] = ymdStr.split("-").map((n) => parseInt(n, 10));
      const dt = new Date(y, (m - 1), d);
      const diffMs = dt.setHours(0,0,0,0) - todayStart.setHours(0,0,0,0);
      return Math.round(diffMs / (24 * 60 * 60 * 1000));
    };

    const statusRank = (v) => {
      const s = String(v || "").trim();
      if (s === "정산대기") return 0;
      if (s === "입금대기") return 1;
      if (s === "정산완료") return 2;
      return 3; // 기타/미지정
    };

    // 비교 함수: a가 앞서야하면 음수, 뒤면 양수, 같으면 0
    const compare = (a, b) => {
      const da = dayDiff(a.moveDate);
      const db = dayDiff(b.moveDate);

      // 유효하지 않은 날짜는 맨 아래
      const aInvalid = da === null;
      const bInvalid = db === null;
      if (aInvalid && !bInvalid) return 1;
      if (!aInvalid && bInvalid) return -1;
      if (aInvalid && bInvalid) {
        // 둘 다 invalid면 진행현황, id 순
        const sa = statusRank(a.status);
        const sb = statusRank(b.status);
        if (sa !== sb) return sa - sb;
        return String(a.id).localeCompare(String(b.id));
      }

      // 날짜 우선 규칙
      if (da === db) {
        // 같은 날짜 → 진행현황 → id
        const sa = statusRank(a.status);
        const sb = statusRank(b.status);
        if (sa !== sb) return sa - sb;
        return String(a.id).localeCompare(String(b.id));
      }

      // 1) 오늘(0)
      if (da === 0) return -1;
      if (db === 0) return 1;

      // 2) 어제(-1)
      if (da === -1) return -1;
      if (db === -1) return 1;

      // 3) 둘 다 미래(>= +1) → diff 오름차순
      if (da >= 1 && db >= 1) return da - db;

      // 4) 하나는 미래(>=+1), 하나는 과거(<=-2) → 미래 쪽이 먼저
      if (da >= 1 && db <= -2) return -1;
      if (da <= -2 && db >= 1) return 1;

      // 5) 둘 다 과거(<= -2) → 가까운 과거(-2가 -3보다 먼저) = |diff| 오름차순
      if (da <= -2 && db <= -2) return Math.abs(da) - Math.abs(db);

      // 논리적으로 여기까지 오기 어려우나, 안전망
      return da - db;
    };

    // 표시용/검색용 필드를 가공하되, 정렬용 __필드는 만들지 않음
    const mapped = rowsForFilter.map((r) => {
      const photoCount = Array.isArray(r.photos) ? r.photos.filter((u) => !!String(u || "").trim()).length : 0;
      const hasPhotos = photoCount > 0;
      const noteStr = String(r.note || "").trim();
      const hasNote = noteStr.length > 0;
      const extrasArr = Array.isArray(r.extras) ? r.extras : [];
      const hasExtrasFromArr = extrasArr.some((e) => String(e?.desc || "").trim().length > 0 && toNum(e?.amount) > 0);
      const hasExtrasFromPair = String(r.extraItems || "").trim().length > 0 && toNum(r.extraAmount) > 0;
      const hasExtras = hasExtrasFromArr || hasExtrasFromPair;

      const totalRaw = sumTotal(r);
      const elecRaw  = toNum(r.electricity);

      const totalRawStr = String(totalRaw || 0);
      const elecRawStr  = String(elecRaw  || 0);
      const totalComma  = totalRaw ? totalRaw.toLocaleString() : "0";
      const elecComma   = elecRaw  ? elecRaw.toLocaleString()  : "0";

      return {
        ...r,
        arrears: fmtAmount(r.arrears),
        currentMonth: fmtAmount(r.currentMonth),
        waterFee: fmtAmount(r.waterFee),
        unitPrice: fmtAmount(r.unitPrice),
        electricity: fmtAmount(r.electricity),
        tvFee: fmtAmount(r.tvFee),
        cleaningFee: fmtAmount(r.cleaningFee),
        totalAmount: fmtAmount(totalRaw),

        // 검색 전용(콤마 유/무 모두 대응)
        search_total_commas: totalComma,
        search_total_raw: totalRawStr,
        search_elec_commas: elecComma,
        search_elec_raw: elecRawStr,
        search_money: `${totalRawStr} ${totalComma} ${elecRawStr} ${elecComma}`,

        __hasPhotos: hasPhotos,
        __hasNote: hasNote,
        __hasExtras: hasExtras,
      };
    });

    return mapped.sort(compare);
  }, [rowsForFilter]);

  /* ✅ DataTable의 focusId: (빌라명 → 문서ID) 또는 row=id(백워드) */
  const focusId = useMemo(() => {
    if (paramVilla) {
      const found = sortedRows.find(r => normVilla(r.villaName) === paramVilla);
      if (found) return found.id;
    }
    if (paramRowId) {
      const found = sortedRows.find(r => r.id === paramRowId);
      if (found) return found.id;
    }
    return "";
  }, [sortedRows, paramVilla, paramRowId]);

  /* ✅ 표시 배열: 포커스 대상이 항상 보이도록 맨 위로 올림 */
  const displayRows = useMemo(() => {
    if (!sortedRows.length || !focusId) return sortedRows;
    const idx = sortedRows.findIndex(r => r.id === focusId);
    if (idx > -1) {
      const target = sortedRows[idx];
      return [target, ...sortedRows.slice(0, idx), ...sortedRows.slice(idx + 1)];
    }
    return sortedRows;
  }, [sortedRows, focusId]);

  /* 컬럼 (tr 내에 마커 심기: focusId 탐색 보조용) */
  const columns = [
    { label: "이사날짜", key: "moveDate" },
    {
      label: "빌라명",
      key: "villaName",
      render: (row) => (
        <span style={{ display:"inline-flex", alignItems:"center", position:"relative" }}>
          <span
            data-row-id={row.id}
            aria-hidden
            style={{ position:"absolute", inset:0, width:0, height:0, overflow:"hidden" }}
          />
          {row.villaName}
          <FlagDots first={!!row.firstSettlement} exclude={!!row.excludeDeposit} />
        </span>
      ),
    },
    { label: "호수", key: "unitNumber" },
    { label: "미납", key: "arrears" },
    { label: "당월", key: "currentMonth" },
    { label: "당월지침", key: "currentReading" },
    { label: "전월지침", key: "previousReading" },
    { label: "수도요금", key: "waterFee" },
    { label: "단가", key: "unitPrice" },
    { label: "전기", key: "electricity" },
    { label: "TV수신료", key: "tvFee" },
    { label: "청소", key: "cleaningFee" },
    /* ✅ 총액만 노란색 하이라이트 */
    {
      label: "총액",
      key: "totalAmount",
      render: (row) => (
        <span
          style={{
            background: "rgba(255, 235, 59, 0.6)",
            padding: "2px 8px",
            borderRadius: 8,
            fontWeight: 800,
            display: "inline-block",
          }}
          title="총액"
        >
          {row.totalAmount}
        </span>
      ),
    },
    { label: "진행현황", key: "status", render: (row) => <StatusCell value={row.status} /> },
    {
      label: "추가내역",
      key: "extrasIcon",
      render: (row) => {
        const has = !!row.__hasExtras;
        if (!has) return null;
        return (
          <IconBtn
            active={true}
            type="extras"
            title="추가내역 보기"
            onClick={() => { setMiniRow(row); setMiniType("extras"); setMiniOpen(true); }}
          />
        );
      },
    },
    {
      label: "사진",
      key: "photosIcon",
      render: (row) => {
        const has = !!row.__hasPhotos;
        if (!has) return null;
        return (
          <IconBtn
            active={true}
            type="photo"
            title="사진 보기"
            onClick={() => { setMiniRow(row); setMiniType("photos"); setMiniPhotoIdx(0); setMiniOpen(true); }}
          />
        );
      },
    },
    {
      label: "비고",
      key: "noteIcon",
      render: (row) => {
        const has = !!row.__hasNote;
        if (!has) return null;
        return (
          <IconBtn
            active={true}
            type="note"
            title="비고 보기"
            onClick={() => { setMiniRow(row); setMiniType("note"); setMiniOpen(true); }}
          />
        );
      },
    },
    {
      label: "영수증",
      key: "receiptIcon",
      render: (row) => (
        <IconBtn
          active={true}
          type="receipt"
          title="영수증 미리보기"
          onClick={() => openReceiptPreview(row)}
        />
      ),
    },
  ];

  /* 폼/삭제/영수증 함수들 */
  const openForm = ({ mode, item = null }) => {
    setFormMode(mode);
    setCurrentItem(item);
    setFormOpen(true);
  };
  const handleAdd = () => {
    if (isMobile) { navigate("/mobile/form"); return; }
    openForm({ mode: "create" });
  };
  const handleEdit = (row) => openForm({ mode: "edit", item: row });

  const handleDeleteRow = async (row) => {
    if (!row?.id) return;
    try {
      const clQ = query(collection(db, "moveInCleanings"), where("sourceMoveoutId", "==", row.id));
      const clSnap = await getDocs(clQ);

      if (!clSnap.empty) {
        const both = window.confirm(
          "이 항목은 입주청소와 연동되어 있습니다.\n두 데이터(이사정산 + 입주청소)를 모두 삭제하시겠습니까?\n\n[확인] 둘 다 삭제 / [취소] 다음 단계로"
        );
        if (both) {
          await Promise.all(clSnap.docs.map((d) => deleteDoc(doc(db, "moveInCleanings", d.id))));
          await deleteDoc(doc(db, "moveouts", row.id));
          return;
        }
        const onlyMoveout = window.confirm("이사정산 데이터만 삭제하시겠습니까?");
        if (!onlyMoveout) return;
        await deleteDoc(doc(db, "moveouts", row.id));
        return;
      }

      if (!window.confirm("해당 이사정산 내역을 삭제할까요?")) return;
      await deleteDoc(doc(db, "moveouts", row.id));
    } catch (e) {
      console.error("삭제 중 오류:", e);
      alert("삭제 중 오류가 발생했습니다. 콘솔을 확인하세요.");
    }
  };

  const openReceiptPreview = async (row) => { setReceiptRow(row); setReceiptOpen(true); };

  const downloadReceipt = async (format) => {
    if (!receiptRef.current || !receiptRow) return;
    try {
      const dataUrl = await htmlToImage.toJpeg(receiptRef.current, {
        backgroundColor: "#ffffff",
        quality: 0.95,
        pixelRatio: 2,
      });
      const base = `${String(receiptRow.moveDate || "").replace(/-/g, "")}${String(
        receiptRow.villaName || ""
      )}${String(receiptRow.unitNumber || "")}`.replace(/[\\/:*?"<>|]/g, "");
      if (format === "jpg") {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${base}.jpg`;
        a.click();
      } else {
        const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
        const imgProps = pdf.getImageProperties(dataUrl);
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const usableWidth = pageWidth - margin * 2;
        const imgWidth = usableWidth;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
        const scale = imgHeight > pageHeight - margin * 2 ? (pageHeight - margin * 2) / imgHeight : 1;
        pdf.addImage(dataUrl, "JPEG", margin, margin, imgWidth * scale, imgHeight * scale);
        pdf.save(`${base}.pdf`);
      }
    } catch (e) {
      console.error("영수증 저장 실패:", e);
      alert("영수증 저장 중 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    const run = async () => {
      if (!receiptOpen || !receiptRow) return;
      await new Promise((r) => setTimeout(r, 0));
      if (!receiptRef.current) return;
      try {
        const dataUrl = await htmlToImage.toJpeg(receiptRef.current, {
          backgroundColor: "#ffffff",
          quality: 0.95,
          pixelRatio: 2,
        });
        setReceiptPreviewUrl(dataUrl);
      } catch (err) {
        console.error("영수증 미리보기 생성 실패:", err);
        setReceiptPreviewUrl("");
      }
    };
    run();
  }, [receiptOpen, receiptRow]);

  const closeMini = () => { setMiniOpen(false); setMiniType(null); setMiniRow(null); };
  const nextMiniPhoto = (dir) => {
    if (!miniRow?.photos?.length) return;
    const n = miniRow.photos.length;
    setMiniPhotoIdx((p) => (p + dir + n) % n);
  };
  const closeReceiptPreview = async () => {
    setReceiptPreviewUrl("");
    setReceiptRow(null);
    setReceiptOpen(false);
  };

  /* 좌측 컨트롤 */
  const leftControls = (
    <>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        style={{
          height: 36,
          borderRadius: 9999,
          border: "1px solid #e5e7eb",
          background: "#f3f4f6",
          padding: "0 14px",
          fontWeight: 600,
          color: "#374151",
          outline: "none",
        }}
      >
        <option value="ALL">전체</option>
        <option value="정산대기">정산대기</option>
        <option value="입금대기">입금대기</option>
        <option value="정산완료">정산완료</option>
      </select>

      {statusFilter === "입금대기" && (
        <span
          style={{
            marginLeft: 10,
            background: "#eef2ff",
            color: "#4338ca",
            border: "1px solid #c7d2fe",
            padding: "6px 10px",
            borderRadius: 9999,
            fontWeight: 700,
          }}
        >
          합계 {fmtAmount(sumForFilter)}원
        </span>
      )}
    </>
  );

  return (
    <div className="page-wrapper">
      {/* ✅ 통신사 페이지와 완전 동일 톤의 노란 하이라이트 */}
      <style>{`
        @keyframes pulseGlow {
          0%   { box-shadow: 0 0 0 0 rgba(255, 235, 59, 0.55); }
          70%  { box-shadow: 0 0 0 12px rgba(255, 235, 59, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 235, 59, 0); }
        }
        tr.is-highlighted--yellow,
        tr.is-highlighted--yellow > td,
        tr.is-highlighted--yellow > th {
          background: rgba(255, 235, 59, 0.6) !important; /* 행 전체 칠하기 */
        }
        .is-highlighted--yellow {
          animation: pulseGlow 1.4s ease-out 2;
          transition: background .3s ease;
        }
        /* div 기반 셀에도 강제 */
        .is-highlighted--yellow-cell {
          background: rgba(255, 235, 59, 0.6) !important;
        }
      `}</style>

      <PageTitle>이사정산 조회</PageTitle>

      <DataTable
        columns={columns}
        data={displayRows}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDeleteRow}
        searchableKeys={[
          "moveDate","villaName","unitNumber","status","note",
          /* ▶ 검색 확장: 총액/전기 (콤마 O/X 모두) */
          "totalAmount", "electricity",
          "search_total_commas","search_total_raw",
          "search_elec_commas","search_elec_raw",
          /* ===(신규) 전기+총액 합본 키 === */
          "search_money",
        ]}
        itemsPerPage={15}
        enableExcel={false}
        /* ⚠️ 내부에서 이미 최종 정렬을 끝내서 넘기므로 sortKey/sortOrder는 제거 */
        /* sortKey / sortOrder 미지정 */
        /* ✅ TelcoPage와 동일: 자동 점프용 */
        focusId={focusId}
        rowIdKey="id"
        leftControls={leftControls}
      />

      {/* 🔷 등록/수정 공용: MoveoutForm 모달 */}
      {formOpen && (
        <MoveoutForm
          asModal
          isMobile={false}
          employeeId={employeeId}
          userId={userId}
          mode={formMode}
          initial={formMode === "edit" ? currentItem : null}
          docId={formMode === "edit" ? currentItem?.id : null}
          existingPhotos={formMode === "edit" ? (currentItem?.photos || []) : []}
          onDone={() => {
            setFormOpen(false);
            setCurrentItem(null);
            setFormMode("create");
          }}
        />
      )}

      {/* 미니 뷰어 */}
      {miniOpen && miniRow && (
        <div
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.25)", display:"flex",
                   alignItems:"center", justifyContent:"center", zIndex:10001 }}
          onClick={closeMini}
        >
          <div
            style={{ width: miniType === "photos" ? 640 : 420, background:"#fff", borderRadius:10, padding:16,
                     boxShadow:"0 10px 30px rgba(0,0,0,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <strong>
                {miniType === "photos" ? "사진 보기" : miniType === "note" ? "비고" : "추가내역"}
              </strong>
              <button className="close-btn" onClick={closeMini}>닫기</button>
            </div>

            {miniType === "note" && (
              <div style={{ whiteSpace:"pre-wrap", lineHeight:1.6 }}>{miniRow.note}</div>
            )}

            {miniType === "extras" && (
              <div>
                {Array.isArray(miniRow.extras) && miniRow.extras.length > 0 ? (
                  miniRow.extras.map((e, i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #eee" }}>
                      <span>{e.desc}</span>
                      <span style={{ fontVariantNumeric:"tabular-nums", textAlign:"left" }}>{fmtAmount(e.amount)}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0" }}>
                    <span>{String(miniRow.extraItems || "").trim() || "-"}</span>
                    <span style={{ fontVariantNumeric:"tabular-nums", textAlign:"left" }}>
                      {fmtAmount(miniRow.extraAmount)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {miniType === "photos" && (
              <div style={{ position:"relative" }}>
                {Array.isArray(miniRow.photos) && miniRow.photos.filter(Boolean).length > 0 ? (
                  <>
                    <div style={{ textAlign:"center" }}>
                      <img
                        src={miniRow.photos[miniPhotoIdx]}
                        alt="사진"
                        style={{ width:"100%", maxWidth:600, height:360, objectFit:"cover", borderRadius:8, border:"1px solid #ddd", cursor:"zoom-in" }}
                        onClick={() => { setFullImageSrc(miniRow.photos[miniPhotoIdx]); setFullImageOpen(true); }}
                      />
                    </div>
                    <button type="button" onClick={() => nextMiniPhoto(-1)} style={miniNavBtn("left")} aria-label="이전">‹</button>
                    <button type="button" onClick={() => nextMiniPhoto(1)} style={miniNavBtn("right")} aria-label="다음">›</button>
                    <div style={{ position:"absolute", right:12, bottom:12, background:"rgba(0,0,0,0.55)", color:"#fff",
                                  padding:"2px 8px", borderRadius:12, fontSize:12 }}>
                      {miniPhotoIdx + 1} / {miniRow.photos.length}
                    </div>
                  </>
                ) : <div>사진 없음</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🔎 원본 이미지 확대 뷰 */}
      {fullImageOpen && (
        <div
          onClick={() => setFullImageOpen(false)}
          style={{
            position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:10005,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth:"95vw", maxHeight:"95vh",
              overflow:"auto", borderRadius:8, boxShadow:"0 10px 30px rgba(0,0,0,0.35)",
              background:"#111", padding:10
            }}
          >
            <img
              src={fullImageSrc}
              alt="원본"
              style={{ width:"auto", height:"auto", display:"block" }}
            />
          </div>
          <button
            onClick={() => setFullImageOpen(false)}
            style={{
              position:"fixed", top:20, right:20,
              background:"rgba(255,255,255,0.9)", border:"1px solid #ddd",
              padding:"6px 10px", borderRadius:8, cursor:"pointer", fontWeight:700
            }}
          >
            닫기
          </button>
        </div>
      )}

      {/* ▼▼▼ 영수증 모달 ▼▼▼ */}
      {receiptOpen && receiptRow && (
        <div
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.25)", display:"flex",
                   alignItems:"center", justifyContent:"center", zIndex:10002 }}
          onClick={closeReceiptPreview}
        >
          <div
            style={{
              width: "min(640px, 95vw)",
              maxHeight: "90vh",
              background:"#fff",
              borderRadius:10,
              boxShadow:"0 10px 30px rgba(0,0,0,0.3)",
              overflow:"hidden",
              display:"flex",
              flexDirection:"column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                position:"sticky",
                top:0,
                zIndex:1,
                background:"#fff",
                borderBottom:"1px solid #eee",
                padding:"10px 12px",
                display:"flex",
                alignItems:"center",
                justifyContent:"space-between",
                gap:8,
              }}
            >
              <strong>영수증 미리보기</strong>
              <div style={{ display:"flex", gap:8 }}>
                <button className="save-btn" onClick={(e) => { e.stopPropagation(); downloadReceipt("jpg"); }}>
                  JPG 저장
                </button>
                <button className="save-btn" onClick={(e) => { e.stopPropagation(); downloadReceipt("pdf"); }}>
                  PDF 저장
                </button>
                <button className="close-btn" onClick={(e) => { e.stopPropagation(); closeReceiptPreview(); }}>
                  닫기
                </button>
              </div>
            </div>

            <div style={{ padding:16, overflowY:"auto" }}>
              <div style={{ textAlign:"center", marginBottom:12 }}>
                {receiptPreviewUrl ? (
                  <img
                    src={receiptPreviewUrl}
                    alt="영수증 미리보기"
                    style={{
                      width: 600,
                      maxWidth: "calc(95vw - 40px)",
                      height: "auto",
                      border: "1px solid #eee",
                      borderRadius: 8
                    }}
                  />
                ) : (
                  <div style={{ padding:20, color:"#888" }}>미리보기를 준비 중...</div>
                )}
              </div>
            </div>

            {/* 캡처용 숨김 원본 */}
            <div style={{ position:"absolute", left:-99999, top:-99999 }}>
              <ReceiptTemplate
                refProp={receiptRef}
                item={{
                  moveOutDate: receiptRow.moveDate || "",
                  name: receiptRow.villaName || "",
                  roomNumber: receiptRow.unitNumber || "",
                  arrears: toNum(receiptRow.arrears),
                  currentFee: toNum(receiptRow.currentMonth),
                  waterCost: toNum(receiptRow.waterFee),
                  electricity: toNum(receiptRow.electricity),
                  tvFee: toNum(receiptRow.tvFee),
                  cleaning: toNum(receiptRow.cleaningFee),
                  defects: (Array.isArray(receiptRow.extras) ? receiptRow.extras : []).map((e) => ({ desc: e.desc, amount: toNum(e.amount) })),
                  total: sumTotal(receiptRow),
                }}
              />
            </div>
          </div>
        </div>
      )}
      {/* ▲▲▲ 영수증 모달 ▲▲▲ */}
    </div>
  );
}

const miniNavBtn = (side) => ({
  position: "absolute",
  [side]: 6,
  top: "50%",
  transform: "translateY(-50%)",
  background: "rgba(255,255,255,0.9)",
  border: "1px solid #ddd",
  borderRadius: "50%",
  width: 30,
  height: 30,
  cursor: "pointer",
});
