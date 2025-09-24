// src/MoveoutForm.js
import React, { useState, useRef, useEffect, forwardRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";
import { format } from "date-fns";

/* ✅ Firebase */
import { db, storage } from "./firebase";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";

/* ✅ PC 전용 스타일만 로드 (모바일 CSS 임포트 제거) */
import "./MoveoutForm.css";
import FormLayout from "./components/FormLayout";
import { formatPhoneNumber } from "./utils/formatting";

/* ===== 공통 입력 힌트 ===== */
const koreanInputProps = {
  lang: "ko",
  autoCapitalize: "none",
  autoCorrect: "off",
  autoComplete: "off",
};

/* ===== 커스텀 DatePicker 인풋 ===== */
const DPInput = forwardRef(function DPInput(
  { value, onClick, placeholder, className, onKeyDown, readOnly = true },
  ref
) {
  return (
    <input
      {...koreanInputProps}
      ref={ref}
      value={value || ""}
      onClick={onClick}
      placeholder={placeholder}
      className={className}
      onKeyDown={onKeyDown}
      readOnly={readOnly}
    />
  );
});

/* =========================
   🔧 숫자 유틸 (음수 지원)
   ========================= */

/** "선행 '-' 1개 + 숫자"만 허용한 문자열로 정규화 (타이핑 중간 상태 '-' 허용) */
const normalizeSignedString = (raw) => {
  let s = String(raw ?? "");
  // 숫자/하이픈 이외 제거
  s = s.replace(/[^\d-]/g, "");
  if (!s) return "";
  // 선행 '-'만 남기고 나머지 '-' 제거
  const hasMinus = s[0] === "-";
  s = (hasMinus ? "-" : "") + s.replace(/-/g, "").replace(/^\-+/, "");
  // 허용 패턴: "-" 또는 "-?\d+"
  // 타이핑 중간의 단독 "-"도 허용
  return s;
};

/** 정수 파싱 (- 허용). 파싱 실패 시 0 */
const parseSignedInt = (v) => {
  const norm = normalizeSignedString(v);
  if (norm === "-" || norm === "") return 0; // 중간 상태는 0으로 계산
  const n = parseInt(norm, 10);
  return Number.isFinite(n) ? n : 0;
};

/** 콤마 포맷 (- 허용). 0이면 기존 UX 유지 위해 빈 문자열 반환 */
const formatSignedComma = (v) => {
  const norm = normalizeSignedString(v);
  if (norm === "-") return "-"; // 타이핑 중간 상태 보존
  const n = parseInt(norm, 10);
  if (!Number.isFinite(n) || n === 0) return "";
  return n.toLocaleString();
};

/** blob URL 여부 */
const isBlobUrl = (u) => typeof u === "string" && u.startsWith("blob:");

/* ===== 비고 태그 정규화 유틸 ===== */
const TAG_FIRST = "1차정산";
const TAG_EXCL  = "보증금제외";

const s = (v) => String(v ?? "").trim();

const stripNoteTags = (text) => {
  const base = s(text);
  if (!base) return "";
  const removed = base
    .replace(new RegExp(`\\s*(${TAG_FIRST}|${TAG_EXCL})\\s*`, "g"), " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return removed;
};

const addTagOnce = (text, tag) => {
  const base = s(text);
  if (!tag) return base;
  if (new RegExp(`(^|\\s)${tag}(\\s|$)`).test(base)) return base;
  return base ? `${base} ${tag}`.trim() : tag;
};

export default function MoveoutForm({
  isMobile = false,
  showCancel = true,
  onDone,
  asModal,
  employeeId,
  userId,
  /* 🔷 추가된 편집 모드 지원 props */
  mode = "create",                // "create" | "edit"
  initial = null,                 // 리스트 스키마 객체 (moveDate, villaName, ...)
  docId = null,                   // 편집할 문서 ID
  existingPhotos = [],            // 기존 사진 URL 배열
}) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const isPopup = asModal || params.get("popup") === "1";

  /* ===== 폼 상태 (UI용 키) ===== */
  const [form, setForm] = useState({
    moveOutDate: "",
    name: "",
    roomNumber: "",
    contact: "",
    arrears: "",
    currentFee: "",
    waterCurr: "",
    waterPrev: "",
    waterCost: "",
    waterUnit: "",
    electricity: "",
    tvFee: "",
    cleaning: "",
    extraDesc: "",
    extraAmount: "",
    note: "",
    total: "",
    status: "정산대기",
    /* ✅ 추가: 체크박스 */
    firstSettlement: false,
    excludeDeposit: false,
  });

  /* ===== 추가내역 리스트 ===== */
  const [extras, setExtras] = useState([]); // [{desc, amount:number}]
  const [editIndex, setEditIndex] = useState(null);

  /* ===== 사진(미리보기/업로드용 파일) ===== */
  const [photos, setPhotos] = useState([]);
  const [photoFiles, setPhotoFiles] = useState([]); // 신규 업로드 File 배열
  const [photoIdx, setPhotoIdx] = useState(0);
  const photoInputRef = useRef(null);
  const blobUrlsRef = useRef([]);
  const didInitPhotosRef = useRef(false);

  /* 🔹 편집 모드일 때 기존 데이터 → UI 상태로 매핑 */
  useEffect(() => {
    if (mode !== "edit" || !initial) return;
    setForm((prev) => ({
      ...prev,
      moveOutDate: s(initial.moveDate),
      name: s(initial.villaName),
      roomNumber: s(initial.unitNumber),
      contact: s(initial.payerPhone),
      arrears: formatSignedComma(initial.arrears),
      currentFee: formatSignedComma(initial.currentMonth),
      waterCurr: normalizeSignedString(initial.currentReading ?? ""),
      waterPrev: normalizeSignedString(initial.previousReading ?? ""),
      waterUnit: formatSignedComma(initial.unitPrice),
      electricity: formatSignedComma(initial.electricity),
      tvFee: formatSignedComma(initial.tvFee),
      cleaning: formatSignedComma(initial.cleaningFee),
      note: s(initial.note),
      status: s(initial.status) || "정산대기",
      firstSettlement: !!initial.firstSettlement,
      excludeDeposit: !!initial.excludeDeposit,
    }));
    setExtras(
      Array.isArray(initial.extras)
        ? initial.extras.map((e) => ({ desc: s(e.desc), amount: Number(e.amount) || 0 }))
        : []
    );
  }, [mode, initial]);

  /* 🔹 편집 모드 최초 1회: 기존 사진 표시 */
  useEffect(() => {
    if (mode !== "edit") return;
    if (didInitPhotosRef.current) return;
    const urls = (existingPhotos || []).filter(Boolean);
    if (urls.length) {
      setPhotos(urls);
      setPhotoIdx(0);
    }
    didInitPhotosRef.current = true;
  }, [mode, existingPhotos]);

  const addPhotos = (files) => {
    if (!files || !files.length) return;
    const arr = Array.from(files);
    const urls = arr.map((f) => {
      const u = URL.createObjectURL(f);
      blobUrlsRef.current.push(u);
      return u;
    });
    setPhotos((prev) => [...urls.reverse(), ...prev]);
    setPhotoFiles((prev) => [...arr.reverse(), ...prev]);
    setPhotoIdx(0);
  };

  const deleteCurrentPhoto = () => {
    if (!photos.length) return;
    const targetUrl = photos[photoIdx];
    if (isBlobUrl(targetUrl)) {
      try { URL.revokeObjectURL(targetUrl); } catch {}
      blobUrlsRef.current = blobUrlsRef.current.filter((u) => u !== targetUrl);
      const blobIdx = photos.slice(0, photoIdx + 1).filter(isBlobUrl).length - 1;
      if (blobIdx >= 0) {
        setPhotoFiles((prev) => prev.filter((_, i) => i !== blobIdx));
      }
    }
    setPhotos((prev) => prev.filter((_, i) => i !== photoIdx));
    setPhotoIdx((p) => Math.min(p, Math.max(0, photos.length - 2)));
  };

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((u) => {
        try { URL.revokeObjectURL(u); } catch {}
      });
      blobUrlsRef.current = [];
    };
  }, []);

  /* ===== 비고 모달 ===== */
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  /* ===== Enter 이동 refs ===== */
  const contactRef = useRef(null);
  const dateInputRef = useRef(null);
  const nameRef = useRef(null);
  const roomRef = useRef(null);
  const arrearsRef = useRef(null);
  const currentFeeRef = useRef(null);
  const waterCurrRef = useRef(null);
  const waterPrevRef = useRef(null);
  const waterUnitRef = useRef(null);
  const electricityRef = useRef(null);
  const tvFeeRef = useRef(null);
  const cleaningRef = useRef(null);
  const extraDescRef = useRef(null);
  const extraAmountRef = useRef(null);

  /* ===== 호 입력 편집 제어 ===== */
  const [roomEditing, setRoomEditing] = useState(false);
  const [roomComposing, setRoomComposing] = useState(false);
  const [roomRaw, setRoomRaw] = useState("");

  const navOrder = [
    "contact",
    "moveOutDate",
    "name",
    "roomNumber",
    "arrears",
    "currentFee",
    "waterCurr",
    "waterPrev",
    "waterUnit",
    "electricity",
    "tvFee",
    "cleaning",
    "extraDesc",
    "extraAmount",
  ];
  const refs = {
    contact: contactRef,
    moveOutDate: dateInputRef,
    name: nameRef,
    roomNumber: roomRef,
    arrears: arrearsRef,
    currentFee: currentFeeRef,
    waterCurr: waterCurrRef,
    waterPrev: waterPrevRef,
    waterUnit: waterUnitRef,
    electricity: electricityRef,
    tvFee: tvFeeRef,
    cleaning: cleaningRef,
    extraDesc: extraDescRef,
    extraAmount: extraAmountRef,
  };
  const focusId = (id) => refs[id]?.current?.focus?.();

  /* ===== 제약/포맷 ===== */
  const numberFieldsWithComma = [
    "arrears", "currentFee", "electricity", "tvFee", "cleaning",
    "waterUnit", "waterCost", "total", "extraAmount",
  ];
  const numberOnlyFields = ["waterPrev", "waterCurr"];

  const handleChange = (id, value) => {
    if (id === "contact") {
      setForm((s) => ({ ...s, contact: formatPhoneNumber(value) }));
      return;
    }
    if (id === "roomNumber") return;

    // 콤마 포맷 필드(음수 지원)
    if (numberFieldsWithComma.includes(id)) {
      const norm = normalizeSignedString(value);
      // 타이핑 중간 상태 '-' 보존
      if (norm === "-") {
        setForm((s) => ({ ...s, [id]: "-" }));
        return;
      }
      const formatted = formatSignedComma(norm);
      setForm((s) => ({ ...s, [id]: formatted }));
      return;
    }

    // 숫자만(지침) 필드(음수 허용, 콤마 없음)
    if (numberOnlyFields.includes(id)) {
      const norm = normalizeSignedString(value);
      setForm((s) => ({ ...s, [id]: norm }));
      return;
    }

    setForm((s) => ({ ...s, [id]: value }));
  };

  const commitRoom = () => {
    const raw = roomRaw.replace(/\s+/g, "");
    const normalized = raw ? `${raw}호` : "";
    setForm((st) => ({ ...st, roomNumber: normalized }));
    setRoomEditing(false);
  };
  const handleRoomFocus = () => {
    const raw = String(form.roomNumber || "").replace(/호/g, "");
    setRoomRaw(raw);
    setRoomEditing(true);
  };
  const handleRoomChange = (e) => {
    const v = String(e.target.value || "");
    if (roomComposing) setRoomRaw(v);
    else setRoomRaw(v.replace(/호/g, ""));
  };
  const handleRoomCompositionEnd = (e) => {
    setRoomComposing(false);
    setRoomRaw(String(e.target.value || "").replace(/호/g, ""));
  };
  const handleRoomBlur = () => commitRoom();

  const openDatePicker = () => {
    dateInputRef.current?.focus();
    dateInputRef.current?.click();
  };

  const handleEnterNext = (currentId) => (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    const idx = navOrder.indexOf(currentId);
    if (idx < 0) return;

    if (currentId === "contact") {
      openDatePicker();
      return;
    }
    if (currentId === "roomNumber") {
      commitRoom();
    }
    if (currentId === "extraAmount") {
      addOrUpdateExtra();
      setTimeout(() => focusId("extraDesc"), 0);
      return;
    }
    const nextId = navOrder[idx + 1];
    if (nextId) focusId(nextId);
  };

  /* ===== 자동 계산(수도요금/총액) — 음수 반영 ===== */
  useEffect(() => {
    const prev = parseSignedInt(form.waterPrev);
    const curr = parseSignedInt(form.waterCurr);
    const unit = parseSignedInt(form.waterUnit);
    const usage = curr - prev;                // ⬅️ 음수 허용
    const cost = usage * unit;                // ⬅️ 음수 결과 가능
    setForm((s2) => ({ ...s2, waterCost: formatSignedComma(cost) }));
  }, [form.waterPrev, form.waterCurr, form.waterUnit]);

  useEffect(() => {
    const baseKeys = ["arrears","currentFee","waterCost","electricity","tvFee","cleaning"];
    const base = baseKeys.reduce((sum, k) => sum + parseSignedInt(form[k]), 0);
    const extraSum = extras.reduce((sum, x) => sum + (x?.amount || 0), 0);
    const total = base + extraSum;            // ⬅️ 음수 합산 허용
    setForm((s2) => ({ ...s2, total: formatSignedComma(total) }));
  }, [form.arrears, form.currentFee, form.waterCost, form.electricity, form.tvFee, form.cleaning, extras]);

  /* ===== 추가내역: 추가/수정/삭제 ===== */
  const addOrUpdateExtra = () => {
    const desc = s(form.extraDesc);
    const amt = parseSignedInt(form.extraAmount); // ⬅️ 음수 허용
    if (!desc || (form.extraAmount !== "-" && amt === 0 && normalizeSignedString(form.extraAmount) !== "0")) {
      // 금액이 '-'만 입력된 중간 상태이거나 실질 입력이 없으면 취소
      if (!desc) return false;
      if (form.extraAmount === "-" || form.extraAmount === "") return false;
    }
    setExtras((list) => {
      const next = [...list];
      if (editIndex != null) next[editIndex] = { desc, amount: amt };
      else next.push({ desc, amount: amt });
      return next;
    });
    setForm((st) => ({ ...st, extraDesc: "", extraAmount: "" }));
    setEditIndex(null);
    return true;
  };
  const beginEditExtra = (index) => {
    const it = extras[index];
    setForm((st) => ({
      ...st,
      extraDesc: it?.desc || "",
      extraAmount: formatSignedComma(it?.amount ?? 0), // 음수 포함 포맷
    }));
    setEditIndex(index);
    setTimeout(() => extraDescRef.current?.focus?.(), 0);
    };
  const deleteExtra = (index) => {
    setExtras((list) => list.filter((_, i) => i !== index));
    if (editIndex === index) {
      setEditIndex(null);
      setForm((st) => ({ ...st, extraDesc: "", extraAmount: "" }));
    }
  };

  /* ===== 저장 ===== */
  const [saving, setSaving] = useState(false);

  const buildPayloadForList = () => {
    const moveDate = s(form.moveOutDate);               // yyyy-MM-dd
    const villaName = s(form.name);
    const unitNumber = s(form.roomNumber);
    const payerPhone = s(form.contact);

    const arrears = parseSignedInt(form.arrears);
    const currentMonth = parseSignedInt(form.currentFee);
    const currentReading = parseSignedInt(form.waterCurr);
    const previousReading = parseSignedInt(form.waterPrev);
    const unitPrice = parseSignedInt(form.waterUnit);

    const usage = currentReading - previousReading;     // ⬅️ 음수 허용
    const waterFee = usage * unitPrice;                 // ⬅️ 음수 가능

    const electricity = parseSignedInt(form.electricity);
    const tvFee = parseSignedInt(form.tvFee);
    const cleaningFee = parseSignedInt(form.cleaning);

    const extrasArray = extras.map((e) => ({ desc: s(e.desc), amount: Number(e.amount) || 0 }));
    const extraAmount = extrasArray.reduce((sum, x) => sum + (x?.amount || 0), 0);

    const totalAmount = arrears + currentMonth + waterFee + electricity + tvFee + cleaningFee + extraAmount;

    const baseNote = stripNoteTags(form.note);
    const selectedTag =
      form.firstSettlement ? TAG_FIRST :
      form.excludeDeposit ? TAG_EXCL : "";
    const note = selectedTag ? addTagOnce(baseNote, selectedTag) : baseNote;

    return {
      moveDate,
      villaName,
      unitNumber,
      payerPhone,
      arrears,
      currentMonth,
      currentReading,
      previousReading,
      waterFee,
      unitPrice,
      electricity,
      tvFee,
      cleaningFee,
      extras: extrasArray,
      extraItems: "",
      extraAmount,
      totalAmount,
      status: s(form.status) || "정산대기",
      note,
      firstSettlement: !!form.firstSettlement,
      excludeDeposit: !!form.excludeDeposit,
      updatedAt: serverTimestamp(),
    };
  };

  const uploadAllPhotos = async (targetDocId) => {
    if (!photoFiles.length) return [];
    const urls = [];
    for (let i = 0; i < photoFiles.length; i++) {
      const file = photoFiles[i];
      const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
      const path = `moveouts/${targetDocId}/${uuidv4()}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      urls.push(url);
    }
    return urls;
  };

  const handleSave = async () => {
    if (saving) return;
    if (!form.moveOutDate) { alert("이사날짜를 선택하세요."); return; }
    if (!s(form.name))     { alert("빌라명을 입력하세요."); return; }
    if (!s(form.roomNumber)) { alert("호수를 입력하세요."); return; }

    setSaving(true);
    try {
      const payload = buildPayloadForList();

      if (mode === "edit" && docId) {
        await updateDoc(doc(db, "moveouts", docId), payload);

        const newUrls = await uploadAllPhotos(docId);
        if (newUrls.length) {
          await updateDoc(doc(db, "moveouts", docId), {
            photos: [...(existingPhotos || []), ...newUrls],
            updatedAt: serverTimestamp(),
          });
        }

        alert("수정되었습니다.");
      } else {
        const col = collection(db, "moveouts");
        const docRef = await addDoc(col, {
          ...payload,
          photos: [],
          createdAt: serverTimestamp(),
          createdBy: { employeeId: employeeId || "", userId: userId || "" },
        });

        const photoUrls = await uploadAllPhotos(docRef.id);
        if (photoUrls.length) {
          await updateDoc(doc(db, "moveouts", docRef.id), {
            photos: photoUrls,
            updatedAt: serverTimestamp(),
          });
        }

        alert("저장되었습니다.");
      }

      if (onDone) onDone();
      else navigate(-1);
    } catch (err) {
      console.error("저장 실패:", err);
      alert("저장 중 오류가 발생했습니다. 콘솔을 확인해주세요.");
    } finally {
      setSaving(false);
    }
  };

  /* 공용 버튼 스타일 (사진첨부/비고 동일 크기) */
  const actionBtnStyle = (variant = "photo") => {
    const styles = {
      photo: { border: "#60a5fa", bg: "#eff6ff", color: "#1d4ed8" },
      note:  { border: "#f59e0b", bg: "#fff7ed", color: "#b45309" },
    }[variant];
    return {
      height: 40,
      minWidth: 185,
      padding: "0 12px",
      borderRadius: 8,
      border: `1px solid ${styles.border}`,
      background: styles.bg,
      color: styles.color,
      fontWeight: 700,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      lineHeight: 1,
    };
  };

  /* 사진 뷰어 보조 스타일 */
  const navBtnStyle = (side) => ({
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 8,
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "1px solid #ddd",
    background: "rgba(255,255,255,0.95)",
    cursor: "pointer",
  });
  const delBtnStyle = {
    position: "absolute",
    top: 8,
    right: 8,
    border: "1px solid #fca5a5",
    background: "#fee2e2",
    color: "#b91c1c",
    padding: "4px 8px",
    borderRadius: 8,
    cursor: "pointer",
  };
  const indexBadgeStyle = {
    position: "absolute",
    right: 10,
    bottom: 10,
    background: "rgba(0,0,0,0.55)",
    color: "#fff",
    padding: "2px 8px",
    borderRadius: 12,
    fontSize: 12,
  };

  /* ===== ✅ 체크박스(배타 + 토글) 핸들러 ===== */
  const toggleFirstSettlement = () => {
    setForm((st) => {
      const willCheck = !st.firstSettlement;
      return {
        ...st,
        firstSettlement: willCheck,
        excludeDeposit: willCheck ? false : st.excludeDeposit,
      };
    });
  };
  const toggleExcludeDeposit = () => {
    setForm((st) => {
      const willCheck = !st.excludeDeposit;
      return {
        ...st,
        excludeDeposit: willCheck,
        firstSettlement: willCheck ? false : st.firstSettlement,
      };
    });
  };

  /* ===== 폼 본문 ===== */
  const renderFormContent = () => (
    <FormLayout>
      <div className="pc-moveout__grid grid">
        {/* ✅ 배타 + 토글 체크박스 */}
        <div className="input-group checkbox-inline">
          <label className="chk">
            <input
              type="checkbox"
              checked={form.firstSettlement}
              onChange={toggleFirstSettlement}
            />
            <span>1차정산</span>
          </label>
        </div>
        <div className="input-group checkbox-inline">
          <label className="chk">
            <input
              type="checkbox"
              checked={form.excludeDeposit}
              onChange={toggleExcludeDeposit}
            />
            <span>보증금제외</span>
          </label>
        </div>

        {/* 연락처 */}
        <div className="input-group contact-underline contact-field">
          <label>연락처</label>
          <input
            {...koreanInputProps}
            ref={contactRef}
            type="text"
            value={form.contact}
            onChange={(e) => handleChange("contact", e.target.value)}
            onKeyDown={handleEnterNext("contact")}
            placeholder="Phone number"
          />
        </div>

        {/* 이사날짜 */}
        <div className="input-group">
          <label>이사날짜</label>
          <DatePicker
            selected={form.moveOutDate ? new Date(form.moveOutDate) : null}
            onChange={(date) => {
              if (date) {
                setForm((st) => ({ ...st, moveOutDate: format(date, "yyyy-MM-dd") }));
                setTimeout(() => focusId("name"), 0);
              }
            }}
            dateFormat="yyyy-MM-dd"
            locale={ko}
            customInput={
              <DPInput
                ref={dateInputRef}
                placeholder="이사날짜"
                className={`custom-datepicker ${isMobile ? "mobile" : ""}`}
              />
            }
            popperPlacement="bottom-end"
            popperProps={{ modifiers: [{ name: "offset", options: { offset: [0, 8] } }] }}
          />
        </div>

        {/* 빌라명 */}
        <div className="input-group">
          <label>빌라명</label>
          <input
            {...koreanInputProps}
            ref={nameRef}
            type="text"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            onKeyDown={handleEnterNext("name")}
          />
        </div>

        {/* 호수 */}
        <div className="input-group">
          <label>호수</label>
          <input
            {...koreanInputProps}
            ref={roomRef}
            type="text"
            value={roomEditing ? roomRaw : form.roomNumber}
            onFocus={handleRoomFocus}
            onChange={handleRoomChange}
            onBlur={handleRoomBlur}
            onKeyDown={handleEnterNext("roomNumber")}
            onCompositionStart={() => {}}
            onCompositionEnd={handleRoomCompositionEnd}
            placeholder="예: 302 / B01"
          />
        </div>

        {/* 미납관리비 */}
        <div className="input-group">
          <label>미납관리비</label>
          <input
            {...koreanInputProps}
            ref={arrearsRef}
            type="text"
            inputMode="numeric"
            value={form.arrears}
            onChange={(e) => handleChange("arrears", e.target.value)}
            onKeyDown={handleEnterNext("arrears")}
          />
        </div>

        {/* 당월관리비 */}
        <div className="input-group">
          <label>당월관리비</label>
          <input
            {...koreanInputProps}
            ref={currentFeeRef}
            type="text"
            inputMode="numeric"
            value={form.currentFee}
            onChange={(e) => handleChange("currentFee", e.target.value)}
            onKeyDown={handleEnterNext("currentFee")}
          />
        </div>

        {/* 당월지침 */}
        <div className="input-group">
          <label>당월지침</label>
          <input
            {...koreanInputProps}
            ref={waterCurrRef}
            type="text"
            inputMode="numeric"
            value={form.waterCurr}
            onChange={(e) => handleChange("waterCurr", e.target.value)}
            onKeyDown={handleEnterNext("waterCurr")}
          />
        </div>

        {/* 전월지침 */}
        <div className="input-group">
          <label>전월지침</label>
          <input
            {...koreanInputProps}
            ref={waterPrevRef}
            type="text"
            inputMode="numeric"
            value={form.waterPrev}
            onChange={(e) => handleChange("waterPrev", e.target.value)}
            onKeyDown={handleEnterNext("waterPrev")}
          />
        </div>

        {/* 수도요금 (자동계산, 읽기전용) */}
        <div className="input-group">
          <label>수도요금</label>
          <input {...koreanInputProps} type="text" value={form.waterCost} readOnly />
        </div>

        {/* 수도단가 */}
        <div className="input-group">
          <label>수도단가</label>
          <input
            {...koreanInputProps}
            ref={waterUnitRef}
            type="text"
            inputMode="numeric"
            value={form.waterUnit}
            onChange={(e) => handleChange("waterUnit", e.target.value)}
            onKeyDown={handleEnterNext("waterUnit")}
          />
        </div>

        {/* 전기요금 */}
        <div className="input-group">
          <label>전기요금</label>
          <input
            {...koreanInputProps}
            ref={electricityRef}
            type="text"
            inputMode="numeric"
            value={form.electricity}
            onChange={(e) => handleChange("electricity", e.target.value)}
            onKeyDown={handleEnterNext("electricity")}
          />
        </div>

        {/* TV수신료 */}
        <div className="input-group">
          <label>TV수신료</label>
          <input
            {...koreanInputProps}
            ref={tvFeeRef}
            type="text"
            inputMode="numeric"
            value={form.tvFee}
            onChange={(e) => handleChange("tvFee", e.target.value)}
            onKeyDown={handleEnterNext("tvFee")}
          />
        </div>

        {/* 청소비용 */}
        <div className="input-group">
          <label>청소비용</label>
          <input
            {...koreanInputProps}
            ref={cleaningRef}
            type="text"
            inputMode="numeric"
            value={form.cleaning}
            onChange={(e) => handleChange("cleaning", e.target.value)}
            onKeyDown={handleEnterNext("cleaning")}
          />
        </div>
      </div>

      {/* ✅ 추가내역/추가금액/정산진행현황: 3열 고정 섹션 */}
      <div className="pc-moveout__grid extras-grid extras-grid--3col">
        <div className="input-group">
          <label>추가내역</label>
          <input
            {...koreanInputProps}
            ref={extraDescRef}
            type="text"
            value={form.extraDesc}
            onChange={(e) => handleChange("extraDesc", e.target.value)}
            onKeyDown={handleEnterNext("extraDesc")}
            placeholder="예: 도배, 장판 등"
          />
        </div>
        <div className="input-group">
          <label>추가금액</label>
          <input
            {...koreanInputProps}
            ref={extraAmountRef}
            type="text"
            inputMode="numeric"
            value={form.extraAmount}
            onChange={(e) => handleChange("extraAmount", e.target.value)}
            onKeyDown={handleEnterNext("extraAmount")}
            placeholder="예: 150,000 / -30,000"
          />
        </div>
        <div className="input-group">
          <label>정산진행현황</label>
          <select
            {...koreanInputProps}
            value={form.status}
            onChange={(e) => setForm((st) => ({ ...st, status: e.target.value }))}
          >
            <option value="정산대기">정산대기</option>
            <option value="입금대기">입금대기</option>
            <option value="정산완료">정산완료</option>
          </select>
        </div>
      </div>

      {/* 리스트(사진/비고 위) */}
      <div className="extra-list-container" style={{ marginTop: 8 }}>
        {extras.map((item, index) => (
          <div
            key={index}
            className="extra-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 0",
              borderBottom: "1px solid #eee",
            }}
          >
            <div style={{ flex: 2 }}>{item.desc}</div>
            <div style={{ flex: 1, textAlign: "right" }}>
              {item.amount.toLocaleString()}원
            </div>
            <div className="extra-actions">
              <button onClick={() => beginEditExtra(index)}>수정</button>
              <button onClick={() => deleteExtra(index)}>삭제</button>
            </div>
          </div>
        ))}
      </div>

      {/* 사진/비고/총액 */}
      <div className="pc-moveout__grid grid" style={{ marginTop: 12 }}>
        {/* 사진 */}
        <div className="input-group">
          <label>사진</label>
          <div>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              style={actionBtnStyle("photo")}
              disabled={saving}
            >
              <span>📷</span> <span>사진첨부</span>
            </button>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => addPhotos(e.target.files)}
            disabled={saving}
          />
          {photos.length > 0 && (
            <div
              onClick={() => photoInputRef.current?.click()}
              style={{
                marginTop: 8,
                border: "1px solid #eee",
                borderRadius: 8,
                minHeight: 220,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                background: "#fafafa",
                cursor: "pointer",
              }}
            >
              <img
                src={photos[photoIdx]}
                alt="미리보기"
                style={{ width: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 8 }}
              />
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="이전"
                    onClick={(e) => { e.stopPropagation(); setPhotoIdx((p) => (p - 1 + photos.length) % photos.length); }}
                    style={navBtnStyle("left")}
                    disabled={saving}
                  >‹</button>
                  <button
                    type="button"
                    aria-label="다음"
                    onClick={(e) => { e.stopPropagation(); setPhotoIdx((p) => (p + 1) % photos.length); }}
                    style={navBtnStyle("right")}
                    disabled={saving}
                  >›</button>
                </>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); deleteCurrentPhoto(); }}
                style={delBtnStyle}
                disabled={saving}
              >
                삭제
              </button>
              <div style={indexBadgeStyle}>
                {photoIdx + 1} / {photos.length}
              </div>
            </div>
          )}
        </div>

        {/* 비고 */}
        <div className="input-group">
          <label>비고</label>
          <button
            type="button"
            onClick={() => { setNoteText(form.note || ""); setNoteOpen(true); }}
            style={actionBtnStyle("note")}
            disabled={saving}
          >
            <span>📝</span> <span>{form.note ? "내용있음" : "내용없음"}</span>
          </button>
        </div>

        {/* 총 이사정산 금액(읽기전용 미리보기) */}
        <div className="input-group">
          <label>총 이사정산 금액</label>
          <input {...koreanInputProps} type="text" value={form.total} readOnly />
        </div>
      </div>

      <div style={{ marginTop: 12 }} />
    </FormLayout>
  );

  /* ===== 팝업 모드 ===== */
  if (isPopup) {
    return (
      <>
        <div
          onClick={() => (onDone ? onDone() : navigate(-1))}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.18)", zIndex: 10000 }}
        />
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed", inset: 0, zIndex: 10001,
            display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none",
          }}
        >
          {/* ✅ PC 전용 스코프 래퍼: 모바일이면 적용 안 함 */}
          <div className={`${!isMobile ? "pc-moveout" : ""}`} style={{ pointerEvents: "auto", width: "100%" }}>
            <div
              style={{
                width: 720, maxWidth: "90vw", maxHeight: "90vh",
                background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
                boxShadow: "0 18px 48px rgba(0,0,0,0.25)", overflow: "hidden",
                display: "flex", flexDirection: "column", margin: "0 auto",
              }}
            >
              <div
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", borderBottom: "1px solid #eef2f7", background: "#fafafa",
                }}
              >
                <strong style={{ fontSize: 15 }}>
                  {mode === "edit" ? "이사정산 수정" : "이사정산 등록"}
                </strong>
                <div />
              </div>

              <div style={{ padding: 14, overflow: "auto", flex: 1 }}>
                {renderFormContent()}
              </div>

              <div
                className="actions-row"
                style={{ padding: "10px 14px", borderTop: "1px solid #eef2f7", background: "#fff", position: "sticky", bottom: 0 }}
              >
                <button className="save-btn" onClick={handleSave} disabled={saving}>
                  {saving ? (mode === "edit" ? "수정 중..." : "저장 중...") : (mode === "edit" ? "수정" : "저장")}
                </button>
                <button
                  className="close-btn"
                  onClick={() => (onDone ? onDone() : navigate(-1))}
                  disabled={saving}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 비고 모달 */}
        {noteOpen && (
          <>
            <div
              onClick={() => setNoteOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 10002 }}
            />
            <div
              className={`${!isMobile ? "pc-moveout" : ""}`}
              style={{
                position: "fixed", top: "18vh", left: "50%", transform: "translateX(-50%)",
                width: 420, maxWidth: "92vw", background: "#fff", borderRadius: 12, padding: 16,
                boxShadow: "0 10px 30px rgba(0,0,0,0.25)", zIndex: 10003, display: "flex", flexDirection: "column", gap: 10,
              }}
            >
              <strong>비고</strong>
              <textarea
                {...koreanInputProps}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                style={{ minHeight: 160, padding: 12, borderRadius: 8, border: "1px solid #ddd", resize: "vertical" }}
                placeholder="메모를 입력하세요"
              />
              <div className="actions-row">
                <button
                  className="save-btn"
                  onClick={() => { setForm((st) => ({ ...st, note: noteText })); setNoteOpen(false); }}
                  disabled={saving}
                >
                  저장
                </button>
                <button className="close-btn" onClick={() => setNoteOpen(false)} disabled={saving}>
                  닫기
                </button>
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  /* ===== 전체 페이지 모드 ===== */
  return (
    <div className={`${!isMobile ? "pc-moveout" : ""} form-container ${isMobile ? "mobile" : ""}`}>
      {renderFormContent()}

      <div className="actions-row">
        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? (mode === "edit" ? "수정 중..." : "저장 중...") : (mode === "edit" ? "수정" : "저장")}
        </button>
        {showCancel && (
          <button
            type="button"
            className="close-btn"
            onClick={() => (onDone ? onDone() : navigate(-1))}
            disabled={saving}
          >
            닫기
          </button>
        )}
      </div>

      {/* 비고 모달 */}
      {noteOpen && (
        <>
          <div
            onClick={() => setNoteOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 10002 }}
          />
          <div
            className={`${!isMobile ? "pc-moveout" : ""}`}
            style={{
              position: "fixed", top: "18vh", left: "50%", transform: "translateX(-50%)",
              width: 420, maxWidth: "92vw", background: "#fff", borderRadius: 12, padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)", zIndex: 10003, display: "flex", flexDirection: "column", gap: 10,
            }}
          >
            <strong>비고</strong>
            <textarea
              {...koreanInputProps}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              style={{ minHeight: 160, padding: 12, borderRadius: 8, border: "1px solid #ddd", resize: "vertical" }}
              placeholder="메모를 입력하세요"
            />
            <div className="actions-row">
              <button
                className="save-btn"
                onClick={() => { setForm((st) => ({ ...st, note: noteText })); setNoteOpen(false); }}
                disabled={saving}
              >
                저장
              </button>
              <button className="close-btn" onClick={() => setNoteOpen(false)} disabled={saving}>
                닫기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
