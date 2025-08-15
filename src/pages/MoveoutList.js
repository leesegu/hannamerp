import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../firebase";
import {
  collection, onSnapshot, query, orderBy,
  addDoc, updateDoc, doc, Timestamp, deleteDoc,
} from "firebase/firestore";
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from "firebase/storage";
import * as htmlToImage from "html-to-image";
import { jsPDF } from "jspdf"; // ✅ PDF 저장용
import DataTable from "../components/DataTable";
import PageTitle from "../components/PageTitle";
import GenericEditModal from "../components/GenericEditModal";
import ReceiptTemplate from "../components/ReceiptTemplate";

const storage = getStorage();

/* ========= 유틸 ========= */
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

const calcWaterFee = (x) => {
  const usage = Math.max(0, toNum(x.currentReading) - toNum(x.previousReading));
  return usage * toNum(x.unitPrice);
};

const fmtAmount = (val) => {
  const n = toNum(val);
  return n ? n.toLocaleString() : (val === 0 ? "0" : "");
};

// 전화번호 하이픈
const formatPhoneKR = (raw) => {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("02")) {
    if (d.length <= 2) return "02";
    if (d.length <= 5) return `02-${d.slice(2)}`;
    if (d.length <= 9)  return `02-${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
    return `02-${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  }
  if (d.startsWith("1") && d.length <= 8) {
    return d.length > 4 ? `${d.slice(0,4)}-${d.slice(4)}` : d;
  }
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0,3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0,3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
  return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7,11)}`;
};

// 호수 '호' 자동 부착(중복 방지)
const formatUnitNumber = (raw) => {
  let s = String(raw || "").trim();
  if (!s) return "";
  s = s.replace(/\s+/g, "");
  s = s.replace(/호+$/g, "");
  return s ? `${s}호` : "";
};

/* ========= 아이콘 버튼 ========= */
const IconBtn = ({ active = true, type, title, onClick }) => {
  const color = active
    ? (type === "note" ? "#F59E0B"
      : type === "extras" ? "#0EA5E9"
      : type === "receipt" ? "#14B8A6"
      : "#7A5FFF")
    : "#bbb";
  const char =
    type === "note" ? "📝"
    : type === "extras" ? "🧾"
    : type === "receipt" ? "📑"
    : "🖼️";
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

const StatusCell = ({ value }) => {
  const v = String(value || "").trim();
  let color = "#9CA3AF"; // 입금대기(회색)
  if (v === "정산대기") color = "#EF4444";   // 빨강
  if (v === "정산완료") color = "#10B981";   // 초록
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

export default function MoveoutList({ employeeId, userId }) {
  const [rows, setRows] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [pendingFiles, setPendingFiles] = useState([]);
  const [pendingPreviews, setPendingPreviews] = useState([]);

  const [miniOpen, setMiniOpen] = useState(false);
  const [miniType, setMiniType] = useState(null); // 'photos' | 'note' | 'extras'
  const [miniRow, setMiniRow] = useState(null);
  const [miniPhotoIdx, setMiniPhotoIdx] = useState(0);

  // 진행현황 필터
  const [statusFilter, setStatusFilter] = useState("ALL");

  // ===== 영수증 미리보기 상태 (업로드 없이 즉시 표시) =====
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptRow, setReceiptRow] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  const receiptRef = useRef(null); // ReceiptTemplate 캡처용

  useEffect(() => {
    const q = query(collection(db, "moveouts"), orderBy("moveDate", "desc"));
    return onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    const urls = pendingFiles.map((f) => URL.createObjectURL(f));
    setPendingPreviews(urls);
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [pendingFiles]);

  const emptyItem = useMemo(() => ({
    moveDate: "", villaName: "", unitNumber: "", payerPhone: "",
    arrears: "", currentMonth: "", currentReading: "", previousReading: "",
    waterFee: "", unitPrice: "", electricity: "", tvFee: "", cleaningFee: "",
    extraItems: "", extraAmount: "",
    extras: [],
    totalAmount: "", status: "정산대기",
    photos: [], note: "",
  }), []);

  const formatters = useMemo(() => ({
    payerPhone: formatPhoneKR,
    unitNumber: formatUnitNumber,
  }), []);

  /* ====== 상태 필터 적용 데이터/합계 ====== */
  const rowsForFilter = useMemo(() => {
    if (statusFilter === "ALL") return rows;
    return rows.filter((r) => String(r.status || "") === statusFilter);
  }, [rows, statusFilter]);

  const sumForFilter = useMemo(() => {
    if (statusFilter !== "입금대기") return 0;
    return rows
      .filter((r) => String(r.status || "") === "입금대기")
      .reduce((acc, r) => acc + toNum(r.totalAmount), 0);
  }, [rows, statusFilter]);

  // ===== 오늘 날짜 최상단 + 내부 정렬 보장용 __sortCombo =====
  const displayRows = useMemo(() => {
    const today = new Date();
    const todayStr =
      `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

    const mapped = rowsForFilter.map((r) => {
      // robust has* 계산
      const photoCount = Array.isArray(r.photos) ? r.photos.filter((u) => !!String(u || "").trim()).length : 0;
      const hasPhotos = photoCount > 0;

      const noteStr = String(r.note || "").trim();
      const hasNote = noteStr.length > 0;

      const extrasArr = Array.isArray(r.extras) ? r.extras : [];
      const hasExtrasFromArr = extrasArr.some(
        (e) => String(e?.desc || "").trim().length > 0 && toNum(e?.amount) > 0
      );
      const hasExtrasFromPair =
        String(r.extraItems || "").trim().length > 0 && toNum(r.extraAmount) > 0;
      const hasExtras = hasExtrasFromArr || hasExtrasFromPair;

      const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(r.moveDate || ""))
        ? String(r.moveDate)
        : "0000-00-00";
      const ymdNum = parseInt(ymd.replace(/-/g, ""), 10) || 0;

      const rank = ymd === todayStr ? 0 : 1;
      const inv = String(99999999 - ymdNum).padStart(8, "0");
      const sortCombo = `${rank}-${inv}`;

      return {
        ...r,
        arrears: fmtAmount(r.arrears),
        currentMonth: fmtAmount(r.currentMonth),
        waterFee: fmtAmount(r.waterFee),
        unitPrice: fmtAmount(r.unitPrice),
        electricity: fmtAmount(r.electricity),
        tvFee: fmtAmount(r.tvFee),
        cleaningFee: fmtAmount(r.cleaningFee),
        totalAmount: fmtAmount(r.totalAmount),

        __hasPhotos: hasPhotos,
        __hasNote: hasNote,
        __hasExtras: hasExtras,

        __sortCombo: sortCombo,
      };
    });

    mapped.sort((a, b) => a.__sortCombo.localeCompare(b.__sortCombo));
    return mapped;
  }, [rowsForFilter]);

  /* ====== 컬럼 정의 ====== */
  const columns = [
    { label: "이사날짜", key: "moveDate" },
    { label: "빌라명", key: "villaName" },
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
    { label: "총액", key: "totalAmount" },

    { label: "진행현황", key: "status", render: (row) => <StatusCell value={row.status} /> },

    {
      label: "추가내역",
      key: "extrasIcon",
      render: (row) => {
        const has = !!row.__hasExtras;
        if (!has) return null;               // ❗ 내용 없으면 아이콘 표시 안함
        return (
          <IconBtn
            active={true}
            type="extras"
            title="추가내역 보기"
            onClick={() => {
              setMiniRow(row);
              setMiniType("extras");
              setMiniOpen(true);
            }}
          />
        );
      },
    },

    {
      label: "사진",
      key: "photosIcon",
      render: (row) => {
        const has = !!row.__hasPhotos;
        if (!has) return null;               // ❗ 내용 없으면 아이콘 표시 안함
        return (
          <IconBtn
            active={true}
            type="photo"
            title="사진 보기"
            onClick={() => {
              setMiniRow(row);
              setMiniType("photos");
              setMiniPhotoIdx(0);
              setMiniOpen(true);
            }}
          />
        );
      },
    },

    {
      label: "비고",
      key: "noteIcon",
      render: (row) => {
        const has = !!row.__hasNote;
        if (!has) return null;               // ❗ 내용 없으면 아이콘 표시 안함
        return (
          <IconBtn
            active={true}
            type="note"
            title="비고 보기"
            onClick={() => {
              setMiniRow(row);
              setMiniType("note");
              setMiniOpen(true);
            }}
          />
        );
      },
    },

    {
      label: "영수증",
      key: "receiptIcon",
      render: (row) => (
        <IconBtn
          active={true} // 영수증은 항상 표시/활성
          type="receipt"
          title="영수증 미리보기"
          onClick={() => openReceiptPreview(row)}
        />
      ),
    },
  ];

  const handleAdd = () => { setEditing(null); setIsOpen(true); setPendingFiles([]); };
  const handleEdit = (row) => { setEditing(row); setIsOpen(true); setPendingFiles([]); };

  const onFormUpdate = (next) => {
    const water = calcWaterFee(next);
    next.waterFee = water ? water.toLocaleString() : "";
    const total = sumTotal({ ...next, waterFee: water });
    next.totalAmount = total ? total.toLocaleString() : "";
    return next;
  };

  // 파일 선택: 최신이 앞에 오도록 prepend
  const onFilesSelected = (_field, files) => {
    const arr = Array.from(files || []);
    setPendingFiles((prev) => [...arr, ...prev]);
  };
  const onRemovePendingPhoto = (idx) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // 저장/수정
  const handleSave = async (v) => {
    if (!v.moveDate || !v.villaName || !v.unitNumber) {
      alert("이사날짜, 빌라명, 호수는 필수입니다.");
      return;
    }
    const isEdit = !!editing?.id;
    setIsOpen(false); // 즉시 닫기

    try {
      const water = calcWaterFee(v);
      const extrasSum = Array.isArray(v.extras) ? sumExtrasFromArray(v.extras) : toNum(v.extraAmount);
      const total = toNum(v.arrears) + toNum(v.currentMonth) + water
                  + toNum(v.electricity) + toNum(v.tvFee) + toNum(v.cleaningFee)
                  + extrasSum;

      const payload = {
        moveDate: v.moveDate,
        villaName: String(v.villaName || "").trim(),
        unitNumber: String(v.unitNumber || "").trim(),
        payerPhone: String(v.payerPhone || "").trim(),
        arrears: toNum(v.arrears),
        currentMonth: toNum(v.currentMonth),
        currentReading: toNum(v.currentReading),
        previousReading: toNum(v.previousReading),
        waterFee: water,
        unitPrice: toNum(v.unitPrice),
        electricity: toNum(v.electricity),
        tvFee: toNum(v.tvFee),
        cleaningFee: toNum(v.cleaningFee),

        extras: Array.isArray(v.extras) ? v.extras : [],
        extraItems: String(v.extraItems || "").trim(),
        extraAmount: extrasSum,

        totalAmount: total,
        status: v.status || "정산대기",
        note: String(v.note || "").trim(),
      };

      let docId = editing?.id;
      if (docId) {
        await updateDoc(doc(db, "moveouts", docId), { ...payload, updatedAt: Timestamp.now() });
      } else {
        const docRef = await addDoc(collection(db, "moveouts"), {
          ...payload, photos: [],
          createdAt: Timestamp.now(),
          createdBy: { employeeId: employeeId || "", userId: userId || "" },
        });
        docId = docRef.id;
      }

      const existingAfterEdit = Array.isArray(v.photos) ? v.photos : [];

      if (pendingFiles.length > 0 && docId) {
        const urls = [];
        for (const file of pendingFiles) {
          const key = `moveouts/${docId}/${Date.now()}_${file.name}`;
          const storageRef = ref(storage, key);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          urls.push(url);
        }
        const updatedPhotos = [...existingAfterEdit, ...urls];
        await updateDoc(doc(db, "moveouts", docId), { photos: updatedPhotos });
      } else {
        const prevPhotos = Array.isArray(editing?.photos) ? editing.photos : [];
        const changed = JSON.stringify(existingAfterEdit) !== JSON.stringify(prevPhotos);
        if (changed) await updateDoc(doc(db, "moveouts", docId), { photos: existingAfterEdit });
      }

      alert(isEdit ? "수정 완료" : "저장 완료");
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setPendingFiles([]);
    }
  };

  const handleDeleteRow = async (row) => {
    if (!row?.id) return;
    if (!window.confirm("해당 이사정산 내역을 삭제할까요?")) return;
    await deleteDoc(doc(db, "moveouts", row.id));
  };

  const closeMini = () => { setMiniOpen(false); setMiniType(null); setMiniRow(null); };
  const nextMiniPhoto = (dir) => {
    if (!miniRow?.photos?.length) return;
    const n = miniRow.photos.length;
    setMiniPhotoIdx((p) => (p + dir + n) % n);
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

  /* ====== 영수증 미리보기 ====== */
  const makeFilenameBase = (row) => {
    const yyyymmdd = String(row.moveDate || "").replace(/-/g, "");
    const name = String(row.villaName || "");
    const unit = String(row.unitNumber || "");
    const base = `${yyyymmdd}${name}${unit}`;
    return base.replace(/[\\/:*?"<>|]/g, "");
  };

  const mapRowToReceiptItem = (row) => {
    const extras = Array.isArray(row.extras) ? row.extras : [];
    return {
      moveOutDate: row.moveDate || "",
      name: row.villaName || "",
      roomNumber: row.unitNumber || "",
      arrears: toNum(row.arrears),
      currentFee: toNum(row.currentMonth),
      waterCost: toNum(row.waterFee),
      electricity: toNum(row.electricity),
      tvFee: toNum(row.tvFee),
      cleaning: toNum(row.cleaningFee),
      defects: extras.map((e) => ({ desc: e.desc, amount: toNum(e.amount) })),
      total: sumTotal(row),
    };
  };

  const openReceiptPreview = async (row) => {
    setReceiptRow(row);
    setReceiptOpen(true);
  };

  // 미리보기: 오프스크린 ReceiptTemplate만 캡처
  useEffect(() => {
    const run = async () => {
      if (!receiptOpen || !receiptRow) return;
      await new Promise((r) => setTimeout(r, 0)); // 렌더 직후
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

  const closeReceiptPreview = async () => {
    setReceiptPreviewUrl("");
    setReceiptRow(null);
    setReceiptOpen(false);
  };

  // ✅ JPG / PDF 저장 (모달 전체가 아닌 ReceiptTemplate만)
  const downloadReceipt = async (format /* 'jpg' | 'pdf' */) => {
    if (!receiptRef.current || !receiptRow) return;
    const base = makeFilenameBase(receiptRow);
    try {
      if (format === "jpg") {
        const dataUrl = await htmlToImage.toJpeg(receiptRef.current, {
          backgroundColor: "#ffffff",
          quality: 0.95,
          pixelRatio: 2,
        });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${base}.jpg`;
        a.click();
      } else {
        const dataUrl = await htmlToImage.toJpeg(receiptRef.current, {
          backgroundColor: "#ffffff",
          quality: 0.95,
          pixelRatio: 2,
        });
        const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
        const imgProps = pdf.getImageProperties(dataUrl);
        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 10;
        const usableWidth = pageWidth - margin * 2;
        const imgWidth = usableWidth;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

        const pageHeight = pdf.internal.pageSize.getHeight();
        if (imgHeight > pageHeight - margin * 2) {
          const scale = (pageHeight - margin * 2) / imgHeight;
          pdf.addImage(dataUrl, "JPEG", margin, margin, imgWidth * scale, imgHeight * scale);
        } else {
          pdf.addImage(dataUrl, "JPEG", margin, margin, imgWidth, imgHeight);
        }
        pdf.save(`${base}.pdf`);
      }
    } catch (e) {
      console.error("영수증 저장 실패:", e);
      alert("영수증 저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="page-wrapper">
      <PageTitle>이사정산 조회</PageTitle>

      <DataTable
        columns={columns}
        data={displayRows}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDeleteRow}
        searchableKeys={["moveDate","villaName","unitNumber","status","note"]}
        itemsPerPage={15}
        enableExcel={false}
        sortKey="__sortCombo"  // ✅ 오늘 먼저 + 날짜 내림차순 고정
        sortOrder="asc"
        leftControls={leftControls}
      />

      <GenericEditModal
        isOpen={isOpen}
        onClose={() => { setIsOpen(false); setPendingFiles([]); }}
        onSave={handleSave}
        villa={editing || emptyItem}
        fields={[
          "payerPhone",
          "moveDate", "villaName", "unitNumber",
          "arrears", "currentMonth", "currentReading",
          "previousReading", "waterFee", "unitPrice",
          "electricity", "tvFee", "cleaningFee",
          "extraItems", "extraAmount", "status",
          "totalAmount",
          "photos", "note",
        ]}
        labels={{
          moveDate: "이사날짜",
          villaName: "빌라명",
          unitNumber: "호수",
          payerPhone: "Phone number",
          arrears: "미납관리비",
          currentMonth: "당월관리비",
          currentReading: "당월지침",
          previousReading: "전월지침",
          waterFee: "수도요금",
          unitPrice: "수도단가",
          electricity: "전기요금",
          tvFee: "TV수신료",
          cleaningFee: "청소비용",
          extraItems: "추가내역",
          extraAmount: "추가금액",
          totalAmount: "총이사정산금액",
          status: "정산진행현황",
          photos: "사진첨부",
          note: "비고",
        }}
        types={{
          moveDate: "date",
          villaName: "text",
          unitNumber: "text",
          payerPhone: "text",
          arrears: "amount",
          currentMonth: "amount",
          currentReading: "number",
          previousReading: "number",
          waterFee: "amount",
          unitPrice: "amount",
          electricity: "amount",
          tvFee: "amount",
          cleaningFee: "amount",
          extraItems: "text",
          extraAmount: "amount",
          totalAmount: "amount",
          status: "select",
          photos: "file",
          note: "note",
        }}
        selectOptions={{ status: ["정산대기", "입금대기", "정산완료"] }}
        placeholders={{ moveDate: "선택 이사날짜", photos: "+ 사진첨부", note: "내용없음" }}
        headerKeys={[]}
        includeReadOnlyInHeader={false}
        readOnlyKeys={["waterFee","totalAmount"]}
        gridClass="modal-grid-moveout"
        onFormUpdate={onFormUpdate}
        formatters={formatters}
        onFilesSelected={onFilesSelected}
        photoPreviews={pendingPreviews}
        onRemovePendingPhoto={onRemovePendingPhoto}
        variant="moveout"
      />

      {/* 아이콘 클릭 미니 뷰어 */}
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
                {miniType === "photos" ? "사진 보기"
                  : miniType === "note" ? "비고"
                  : "추가내역"}
              </strong>
              <button className="close-btn" onClick={closeMini}>닫기</button>
            </div>

            {miniType === "note" && (
              <div style={{ whiteSpace:"pre-wrap", lineHeight:1.6 }}>
                {miniRow.note}
              </div>
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
                        style={{ width:"100%", maxWidth:600, height:360, objectFit:"cover", borderRadius:8, border:"1px solid #ddd" }}
                      />
                    </div>
                    <button type="button" onClick={() => nextMiniPhoto(-1)} style={miniNavBtn("left")} aria-label="이전">‹</button>
                    <button type="button" onClick={() => nextMiniPhoto(1)} style={miniNavBtn("right")} aria-label="다음">›</button>
                    <div style={{ position:"absolute", right:12, bottom:12, background:"rgba(0,0,0,0.55)", color:"#fff",
                                  padding:"2px 8px", borderRadius:12, fontSize:12 }}>
                      {miniPhotoIdx + 1} / {miniRow.photos.length}
                    </div>
                  </>
                ) : (
                  <div>사진 없음</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 영수증 미리보기 모달 ===== */}
      {receiptOpen && receiptRow && (
        <div
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.25)", display:"flex",
                   alignItems:"center", justifyContent:"center", zIndex:10002 }}
          onClick={closeReceiptPreview}
        >
          <div
            style={{
              width: 720,
              maxWidth: "90vw",
              maxHeight: "90vh",
              overflowY: "auto",
              background:"#fff",
              borderRadius:10,
              padding:16,
              boxShadow:"0 10px 30px rgba(0,0,0,0.3)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <strong>영수증 미리보기</strong>
              <button className="close-btn" onClick={closeReceiptPreview}>닫기</button>
            </div>

            {/* 미리보기 이미지 (JPEG data URL 즉시 표시) */}
            <div style={{ textAlign:"center", marginBottom:12 }}>
              {receiptPreviewUrl ? (
                <img
                  src={receiptPreviewUrl}
                  alt="영수증 미리보기"
                  style={{ width:"100%", maxWidth:480, border:"1px solid #eee", borderRadius:8 }}
                />
              ) : (
                <div style={{ padding:20, color:"#888" }}>미리보기를 준비 중...</div>
              )}
            </div>

            <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
              <button className="save-btn" onClick={() => downloadReceipt("jpg")}>JPG 저장</button>
              <button className="save-btn" onClick={() => downloadReceipt("pdf")}>PDF 저장</button>
            </div>

            {/* 화면에는 보이지 않지만 캡처용으로 DOM에 유지 */}
            <div style={{ position:"absolute", left:-99999, top:-99999 }}>
              <ReceiptTemplate
                refProp={receiptRef}
                item={mapRowToReceiptItem(receiptRow)}
              />
            </div>
          </div>
        </div>
      )}
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
