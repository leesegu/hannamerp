// src/MoveoutForm.js
import React, { useState, useRef, useEffect, forwardRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";
import { format } from "date-fns";

import "./MoveoutForm.css";
import "./MoveoutForm.mobile.css";
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

/* 숫자 파싱 */
const parseNumber = (v) =>
  parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10) || 0;

export default function MoveoutForm({
  isMobile = false,
  showCancel = true,
  onDone,
  asModal, // 외부에서 팝업 강제 시 true
}) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const isPopup = asModal || params.get("popup") === "1";

  /* ===== 폼 상태 ===== */
  const [form, setForm] = useState({
    moveOutDate: "",
    name: "",
    roomNumber: "",    // 확정 표시값 (예: "203호")
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
  });

  /* ===== 추가내역 리스트 & 수정 인덱스 ===== */
  const [extras, setExtras] = useState([]); // [{desc, amount:number}]
  const [editIndex, setEditIndex] = useState(null);

  /* ===== 사진(미리보기/슬라이더) ===== */
  const [photos, setPhotos] = useState([]); // array of objectURLs (newest first)
  const [photoIdx, setPhotoIdx] = useState(0);
  const photoInputRef = useRef(null);
  const blobUrlsRef = useRef([]); // revoke 관리

  const addPhotos = (files) => {
    if (!files || !files.length) return;
    const urls = Array.from(files).map((f) => {
      const u = URL.createObjectURL(f);
      blobUrlsRef.current.push(u);
      return u;
    });
    // 최신이 맨 위로 보이도록 앞에 붙임
    setPhotos((prev) => [...urls.reverse(), ...prev]);
    setPhotoIdx(0);
  };

  const deleteCurrentPhoto = () => {
    if (!photos.length) return;
    const target = photos[photoIdx];
    try { URL.revokeObjectURL(target); } catch {}
    blobUrlsRef.current = blobUrlsRef.current.filter((u) => u !== target);
    const next = photos.filter((_, i) => i !== photoIdx);
    setPhotos(next);
    setPhotoIdx((p) => (next.length ? Math.min(p, next.length - 1) : 0));
  };

  useEffect(() => {
    return () => {
      // 언마운트 시 모두 revoke
      blobUrlsRef.current.forEach((u) => {
        try { URL.revokeObjectURL(u); } catch {}
      });
      blobUrlsRef.current = [];
    };
  }, []);

  /* ===== 모달(비고) ===== */
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  /* ===== Enter 이동용 refs ===== */
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

  /* ===== 호 입력(편집) 전용 상태 =====
     - 입력 중(roomEditing=true)엔 roomRaw을 그대로 보여줌 (호 미표시)
     - IME 조합 중에는 값을 필터링하지 않음(백스페이스/커서 안정)
     - IME 조합 종료 시 '호' 제거
     - Enter/blur로 확정할 때만 '호' 1회 자동 부착
  ================================= */
  const [roomEditing, setRoomEditing] = useState(false);
  const [roomComposing, setRoomComposing] = useState(false);
  const [roomRaw, setRoomRaw] = useState(""); // 편집 중 순수값

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

  /* ===== 숫자 포맷 / 숫자만 ===== */
  const numberFieldsWithComma = [
    "arrears", "currentFee", "electricity", "tvFee", "cleaning",
    "waterUnit", "waterCost", "total", "extraAmount",
  ];
  const numberOnlyFields = ["waterPrev", "waterCurr"];

  /* ===== 일반 입력 변경 ===== */
  const handleChange = (id, value) => {
    if (id === "contact") {
      const formatted = formatPhoneNumber(value);
      setForm((s) => ({ ...s, [id]: formatted }));
      return;
    }
    if (id === "roomNumber") return; // 별도 로직 사용
    if (numberFieldsWithComma.includes(id)) {
      const numeric = String(value || "").replace(/[^0-9]/g, "");
      const formatted = numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      setForm((s) => ({ ...s, [id]: formatted }));
      return;
    }
    if (numberOnlyFields.includes(id)) {
      const numeric = String(value || "").replace(/[^0-9]/g, "");
      setForm((s) => ({ ...s, [id]: numeric }));
      return;
    }
    setForm((s) => ({ ...s, [id]: value }));
  };

  /* ===== 호 입력 전용 핸들러 ===== */
  const commitRoom = () => {
    const raw = roomRaw.replace(/\s+/g, ""); // 사용자가 쓴 '호'는 제거됨
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
    if (roomComposing) setRoomRaw(v);         // 조합 중엔 손대지 않음
    else setRoomRaw(v.replace(/호/g, ""));    // 조합 아닐 때 '호' 즉시 제거(무시)
  };
  const handleRoomCompositionStart = () => setRoomComposing(true);
  const handleRoomCompositionEnd = (e) => {
    setRoomComposing(false);
    setRoomRaw(String(e.target.value || "").replace(/호/g, "")); // 조합 끝나면 제거
  };
  const handleRoomBlur = () => commitRoom();

  /* ===== 달력 오픈(Enter/클릭 지원) ===== */
  const openDatePicker = () => {
    // 연락처 Enter 시 강제 오픈: 포커스+클릭
    dateInputRef.current?.focus();
    dateInputRef.current?.click();
  };

  /* ===== Enter 이동 ===== */
  const handleEnterNext = (currentId) => (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    const idx = navOrder.indexOf(currentId);
    if (idx < 0) return;

    if (currentId === "contact") {
      openDatePicker(); // Enter로 달력 오픈
      return;
    }
    if (currentId === "roomNumber") {
      commitRoom(); // Enter로 호 확정
    }
    if (currentId === "extraAmount") {
      addOrUpdateExtra();
      setTimeout(() => focusId("extraDesc"), 0);
      return;
    }

    const nextId = navOrder[idx + 1];
    if (nextId) focusId(nextId);
  };

  /* ===== 자동 계산: 수도요금 ===== */
  useEffect(() => {
    const prev = parseNumber(form.waterPrev);
    const curr = parseNumber(form.waterCurr);
    const unit = parseNumber(form.waterUnit);
    const usage = Math.max(0, curr - prev);
    const cost = usage * unit;
    setForm((s) => ({ ...s, waterCost: cost ? cost.toLocaleString() : "" }));
  }, [form.waterPrev, form.waterCurr, form.waterUnit]);

  /* ===== 자동 합계: 총 이사정산 금액 ===== */
  useEffect(() => {
    const baseKeys = ["arrears","currentFee","waterCost","electricity","tvFee","cleaning"];
    const base = baseKeys.reduce((sum, k) => sum + parseNumber(form[k]), 0);
    const extraSum = extras.reduce((sum, x) => sum + (x?.amount || 0), 0);
    setForm((s) => ({ ...s, total: (base + extraSum) ? (base + extraSum).toLocaleString() : "" }));
  }, [form.arrears, form.currentFee, form.waterCost, form.electricity, form.tvFee, form.cleaning, extras]);

  /* ===== 추가내역: 추가/수정/삭제 ===== */
  const addOrUpdateExtra = () => {
    const desc = String(form.extraDesc || "").trim();
    const amt = parseNumber(form.extraAmount);
    if (!desc || !amt) return false;

    setExtras((list) => {
      const next = [...list];
      if (editIndex != null) next[editIndex] = { desc, amount: amt };
      else next.push({ desc, amount: amt });
      return next;
    });

    setForm((s) => ({ ...s, extraDesc: "", extraAmount: "" }));
    setEditIndex(null);
    return true;
  };
  const beginEditExtra = (index) => {
    const it = extras[index];
    setForm((s) => ({
      ...s,
      extraDesc: it?.desc || "",
      extraAmount: it?.amount ? it.amount.toLocaleString() : "",
    }));
    setEditIndex(index);
    setTimeout(() => extraDescRef.current?.focus?.(), 0);
  };
  const deleteExtra = (index) => {
    setExtras((list) => list.filter((_, i) => i !== index));
    if (editIndex === index) {
      setEditIndex(null);
      setForm((s) => ({ ...s, extraDesc: "", extraAmount: "" }));
    }
  };

  /* ===== 저장(임시) ===== */
  const handleSave = () => {
    console.log("[저장]", { ...form, extras, photos, note: form.note });
    alert("지금은 베이스 화면입니다. 저장 로직은 다음 단계에서 추가할게요.");
  };

  /* 공용 버튼 스타일 (사진첨부/비고 동일 크기) + 색상/아이콘 */
  const actionBtnStyle = (variant = "photo") => {
    const styles = {
      photo: { border: "#60a5fa", bg: "#eff6ff", color: "#1d4ed8", emoji: "📷" },
      note:  { border: "#f59e0b", bg: "#fff7ed", color: "#b45309", emoji: "📝" },
    }[variant];
    return {
      padding: "10px 12px",
      borderRadius: 8,
      border: `1px solid ${styles.border}`,
      background: styles.bg,
      color: styles.color,
      fontWeight: 700,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
    };
  };

  /* ===== 폼 본문 렌더(내부 제목 없음) ===== */
  const renderFormContent = () => (
    <FormLayout>
      <div className="grid">
        {/* 연락처 */}
        <div className="input-group" />
        <div className="input-group" />
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

        {/* 이사날짜 (클릭/Enter 둘 다 달력 오픈) */}
        <div className="input-group">
          <label>이사날짜</label>
          <DatePicker
            selected={form.moveOutDate ? new Date(form.moveOutDate) : null}
            onChange={(date) => {
              if (date) {
                setForm((s) => ({ ...s, moveOutDate: format(date, "yyyy-MM-dd") }));
                setTimeout(() => focusId("name"), 0); // 선택 후 빌라명으로
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

        {/* 호수 (편집 중엔 roomRaw, Enter/blur 확정 시 '호' 1회) */}
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
            onCompositionStart={() => setRoomComposing(true)}
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

      {/* ✅ 추가내역/추가금액 + (오른쪽) 정산진행현황 */}
      <div className="grid extras-grid">
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
            placeholder="예: 150,000"
          />
        </div>
        <div className="input-group">
          <label>정산진행현황</label>
          <select
            {...koreanInputProps}
            value={form.status}
            onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
          >
            <option value="정산대기">정산대기</option>
            <option value="입금대기">입금대기</option>
            <option value="입금완료">입금완료</option>
          </select>
        </div>
      </div>

      {/* ===== 사진 / 비고 / 총액 (총액을 비고 오른쪽으로) ===== */}
      <div className="grid" style={{ marginTop: 12 }}>
        {/* 사진 — 버튼만 먼저 보이고, 이미지가 있을 때만 미리보기 표시 */}
        <div className="input-group">
          <label>사진</label>
          <div>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              style={actionBtnStyle("photo")}
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
          />
          {/* 사진이 있을 때만 미리보기 영역 표시 */}
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
              {/* 좌우 버튼 */}
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="이전"
                    onClick={(e) => { e.stopPropagation(); setPhotoIdx((p) => (p - 1 + photos.length) % photos.length); }}
                    style={navBtnStyle("left")}
                  >‹</button>
                  <button
                    type="button"
                    aria-label="다음"
                    onClick={(e) => { e.stopPropagation(); setPhotoIdx((p) => (p + 1) % photos.length); }}
                    style={navBtnStyle("right")}
                  >›</button>
                </>
              )}
              {/* 삭제 버튼 */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); deleteCurrentPhoto(); }}
                style={delBtnStyle}
              >
                삭제
              </button>
              {/* 인덱스 표시 */}
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
          >
            <span>📝</span> <span>{form.note ? "내용있음" : "내용없음"}</span>
          </button>
        </div>

        {/* 총 이사정산 금액 — 비고 오른쪽 */}
        <div className="input-group">
          <label>총 이사정산 금액</label>
          <input {...koreanInputProps} type="text" value={form.total} readOnly />
        </div>
      </div>

      {/* 추가내역 리스트 (수정/삭제) */}
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

      <div style={{ marginTop: 12 }} />
    </FormLayout>
  );

  /* 버튼 공통 스타일 */
  const btnStyle = {
    minWidth: 110,
    height: 38,
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
    color: "#111827",
    fontWeight: 600,
    cursor: "pointer",
  };

  /* ===== 팝업(모달) ===== */
  if (isPopup) {
    return (
      <>
        {/* 뒤쪽 리스트가 보이도록 연한 오버레이 */}
        <div
          onClick={() => (onDone ? onDone() : navigate(-1))}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.18)",
            zIndex: 10000,
          }}
        />
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 640,
              maxWidth: "90vw",
              maxHeight: "80vh",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              boxShadow: "0 18px 48px rgba(0,0,0,0.25)",
              overflow: "hidden",
              pointerEvents: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* 모달 헤더 제목 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderBottom: "1px solid #eef2f7",
                background: "#fafafa",
              }}
            >
              <strong style={{ fontSize: 15 }}>이사정산 등록</strong>
              <div />
            </div>

            {/* 본문 */}
            <div style={{ padding: 14, overflow: "auto", flex: 1 }}>
              {renderFormContent()}
            </div>

            {/* ✅ 버튼 순서: 저장 → 닫기 */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                padding: "10px 14px",
                borderTop: "1px solid #eef2f7",
                background: "#fff",
                position: "sticky",
                bottom: 0,
              }}
            >
              <button style={btnStyle} onClick={handleSave}>
                저장
              </button>
              <button
                style={btnStyle}
                onClick={() => (onDone ? onDone() : navigate(-1))}
              >
                닫기
              </button>
            </div>
          </div>
        </div>

        {/* 비고 모달 */}
        {noteOpen && (
          <>
            <div
              onClick={() => setNoteOpen(false)}
              style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 10002,
              }}
            />
            <div
              style={{
                position: "fixed",
                top: "18vh", left: "50%", transform: "translateX(-50%)",
                width: 420, maxWidth: "92vw",
                background: "#fff", borderRadius: 12, padding: 16,
                boxShadow: "0 10px 30px rgba(0,0,0,0.25)", zIndex: 10003,
                display: "flex", flexDirection: "column", gap: 10,
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
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  style={btnStyle}
                  onClick={() => {
                    setForm((s) => ({ ...s, note: noteText }));
                    setNoteOpen(false);
                  }}
                >
                  저장
                </button>
                <button style={btnStyle} onClick={() => setNoteOpen(false)}>
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
    <div className={`form-container ${isMobile ? "mobile" : ""}`}>
      {renderFormContent()}

      {/* 하단 버튼 */}
      <div className="actions-row" style={{ justifyContent: "flex-end", gap: 8 }}>
        <button style={btnStyle} onClick={handleSave}>
          저장
        </button>
        {showCancel && (
          <button
            type="button"
            style={btnStyle}
            onClick={() => (onDone ? onDone() : navigate(-1))}
          >
            닫기
          </button>
        )}
      </div>

      {/* 비고 모달 (전체 페이지 모드) */}
      {noteOpen && (
        <>
          <div
            onClick={() => setNoteOpen(false)}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 10002,
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "18vh", left: "50%", transform: "translateX(-50%)",
              width: 420, maxWidth: "92vw",
              background: "#fff", borderRadius: 12, padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)", zIndex: 10003,
              display: "flex", flexDirection: "column", gap: 10,
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
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                style={btnStyle}
                onClick={() => {
                  setForm((s) => ({ ...s, note: noteText }));
                  setNoteOpen(false);
                }}
              >
                저장
              </button>
              <button style={btnStyle} onClick={() => setNoteOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* 사진 뷰어 보조 스타일(인라인용) */
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
