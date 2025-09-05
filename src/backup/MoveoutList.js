// src/MoveoutForm.js
import React, { useState, useRef, useEffect, useMemo, forwardRef } from "react";
import DatePicker from "react-datepicker";
import { useNavigate, useLocation } from "react-router-dom";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";
import { format } from "date-fns";
import { db, storage } from "./firebase";
import { collection, addDoc, setDoc, doc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";

import "./MoveoutForm.css";
import "./MoveoutForm.mobile.css";
import FormLayout from "./components/FormLayout";
import ImageSlider from "./components/ImageSlider";
import { formatPhoneNumber } from "./utils/formatting";

console.log("✅ MoveoutForm 로딩됨");

// 숫자 파싱 유틸
const parseNumber = (str) => parseInt((String(str) || "0").replace(/[^\d]/g, ""), 10) || 0;

// 공통 인풋 props (한글 우선 힌트)
const koreanInputProps = {
  lang: "ko",
  autoCapitalize: "none",
  autoCorrect: "off",
  autoComplete: "off",
};

// DatePicker 커스텀 인풋
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

export default function MoveoutForm({
  employeeId,
  userId,
  editItem, // 있으면 수정 모드
  onDone,
  showCancel = true,
  isMobile,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobileDevice = typeof isMobile === "boolean" ? isMobile : window.innerWidth <= 768;

  // 문서 lang=ko 보장 + 스크롤 잠금
  useEffect(() => {
    const prevLang = document.documentElement.getAttribute("lang");
    document.documentElement.setAttribute("lang", "ko");
    document.body.style.overflow = "hidden";
    return () => {
      if (prevLang) document.documentElement.setAttribute("lang", prevLang);
      else document.documentElement.removeAttribute("lang");
      document.body.style.overflow = "auto";
    };
  }, []);

  // 폼 상태
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
    defectDesc: "",
    defectAmount: "",
    total: "",
    notes: "",
    status: "정산대기",
  });

  // 모드/문서 ID
  const [docId, setDocId] = useState(null);

  // 추가내역 리스트 + 인라인 편집 상태
  const [defects, setDefects] = useState([]);
  const [rowEdit, setRowEdit] = useState({ index: null, desc: "", amount: "" });

  // 비고 모달
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  // 이미지: 기존/신규/미리보기
  const [existingImageUrls, setExistingImageUrls] = useState([]);
  const [images, setImages] = useState([]); // 신규 File[]
  const [imagePreviews, setImagePreviews] = useState([]); // (기존 + blob)
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const previewUrlsRef = useRef([]); // blob 추적
  const fileInputRef = useRef(null);

  // 포커스 refs (입력 이동 전용)
  const defectDescRef = useRef(null);
  const defectAmountRef = useRef(null);
  const listEndRef = useRef(null);

  // 숫자 입력 정책
  const numberFieldsWithComma = useMemo(
    () => ["arrears", "currentFee", "electricity", "tvFee", "cleaning", "waterUnit", "waterCost", "defectAmount", "total"],
    []
  );
  const numberOnlyFields = useMemo(() => ["waterPrev", "waterCurr"], []);

  // 등록/수정 초기 로드
  useEffect(() => {
    let parsed = null;
    if (editItem) parsed = editItem;
    else {
      const saved = localStorage.getItem("editItem");
      if (saved) parsed = JSON.parse(saved);
    }

    if (parsed) {
      // 수정 모드
      setDocId(parsed.docId || null);
      setForm((prev) => ({
        ...prev,
        ...parsed,
        defectDesc: "",
        defectAmount: "",
      }));
      setNoteText(parsed.notes || "");
      setDefects(parsed.defects || []);

      const urls = (parsed.images || []).slice().reverse();
      setExistingImageUrls(urls);
      setImagePreviews(urls);
      setImages([]);
    } else {
      // 등록
      setDocId(null);
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 경로 변경 시 등록 초기화
  useEffect(() => {
    if (!docId && !editItem) resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // 언마운트 시 blob revoke
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((u) => {
        try { URL.revokeObjectURL(u); } catch {}
      });
      previewUrlsRef.current = [];
    };
  }, []);

  const revokeAllBlobsInPreviews = () => {
    imagePreviews.forEach((u) => {
      if (typeof u === "string" && u.startsWith("blob:")) {
        try { URL.revokeObjectURL(u); } catch {}
      }
    });
    previewUrlsRef.current = [];
  };

  const resetForm = () => {
    revokeAllBlobsInPreviews();
    setForm({
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
      defectDesc: "",
      defectAmount: "",
      total: "",
      notes: "",
      status: "정산대기",
    });
    setNoteText("");
    setDefects([]);
    setRowEdit({ index: null, desc: "", amount: "" });
    setImages([]);
    setExistingImageUrls([]);
    setImagePreviews([]);
    setCurrentImageIndex(0);
  };

  // 입력 변경
  const handleChange = (id, value) => {
    if (id === "contact") {
      const formatted = formatPhoneNumber(value);
      setForm((s) => ({ ...s, [id]: formatted }));
    } else if (numberFieldsWithComma.includes(id)) {
      const numeric = (value || "").replace(/[^\d]/g, "");
      const formatted = numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      setForm((s) => ({ ...s, [id]: formatted }));
    } else if (numberOnlyFields.includes(id)) {
      const numeric = (value || "").replace(/[^\d]/g, "");
      setForm((s) => ({ ...s, [id]: numeric }));
    } else {
      setForm((s) => ({ ...s, [id]: value }));
    }
  };

  /* --------------------- 추가내역: 등록/인라인 수정 --------------------- */

  // 엔터 처리 공통
  const handleEnterOnDesc = (e) => {
    if (e.key !== "Enter" && e.key !== "NumpadEnter") return;
    if (e.isComposing) return; // IME 조합 중이면 무시
    e.preventDefault();
    e.stopPropagation();

    const hasDesc = String(form.defectDesc || "").trim().length > 0;
    const hasAmt = parseNumber(form.defectAmount) > 0;

    if (hasDesc && hasAmt) {
      addDefect();
    } else {
      // 빠진 입력으로 포커스 이동
      if (!hasAmt) defectAmountRef.current?.focus();
      else defectDescRef.current?.focus();
    }
  };

  const handleEnterOnAmount = (e) => {
    if (e.key !== "Enter" && e.key !== "NumpadEnter") return;
    if (e.isComposing) return;
    e.preventDefault();
    e.stopPropagation();

    const hasDesc = String(form.defectDesc || "").trim().length > 0;
    const hasAmt = parseNumber(form.defectAmount) > 0;

    if (hasDesc && hasAmt) {
      addDefect();
    } else {
      if (!hasDesc) defectDescRef.current?.focus();
      else defectAmountRef.current?.focus();
    }
  };

  const addDefect = () => {
    const desc = String(form.defectDesc || "").trim();
    const amt = parseNumber(form.defectAmount);
    if (!desc || !amt) return false;

    setDefects((list) => [...list, { desc, amount: amt.toLocaleString() }]);

    // 입력 초기화 + 포커스 + 리스트 하단 스크롤
    setForm((s) => ({ ...s, defectDesc: "", defectAmount: "" }));
    setTimeout(() => {
      defectDescRef.current?.focus();
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 0);

    return true;
  };

  // 리스트 인라인 수정 컨트롤
  const beginRowEdit = (index) => {
    const t = defects[index];
    setRowEdit({ index, desc: t?.desc || "", amount: t?.amount || "" });
  };
  const saveRowEdit = () => {
    const { index, desc, amount } = rowEdit;
    if (index === null || index < 0) return;
    const cleanAmt = parseNumber(amount);
    if (!String(desc).trim() || !cleanAmt) return;
    setDefects((list) =>
      list.map((d, i) =>
        i === index ? { desc: String(desc).trim(), amount: cleanAmt.toLocaleString() } : d
      )
    );
    setRowEdit({ index: null, desc: "", amount: "" });
  };
  const cancelRowEdit = () => setRowEdit({ index: null, desc: "", amount: "" });
  const handleDeleteDefect = (index) => {
    setDefects((list) => list.filter((_, i) => i !== index));
    if (rowEdit.index === index) setRowEdit({ index: null, desc: "", amount: "" });
  };

  // 이미지
  const handleImageChange = (e) => {
    const newFiles = Array.from(e.target.files || []);
    if (!newFiles.length) return;
    const createdUrls = newFiles.map((f) => URL.createObjectURL(f));
    previewUrlsRef.current.push(...createdUrls);
    setImages((arr) => [...arr, ...newFiles]);
    setImagePreviews((arr) => [...arr, ...createdUrls]);
    setCurrentImageIndex(0);
  };
  const handleImageDelete = (idx) => {
    const url = imagePreviews[idx];
    if (typeof url === "string" && existingImageUrls.includes(url)) {
      setExistingImageUrls((arr) => arr.filter((u) => u !== url));
    } else {
      const newIdx = idx - existingImageUrls.length;
      setImages((arr) => {
        if (newIdx >= 0 && newIdx < arr.length) {
          const next = [...arr];
          next.splice(newIdx, 1);
          return next;
        }
        return arr;
      });
      if (url?.startsWith("blob:")) {
        try { URL.revokeObjectURL(url); } catch {}
        previewUrlsRef.current = previewUrlsRef.current.filter((u) => u !== url);
      }
    }
    setImagePreviews((arr) => arr.filter((_, i) => i !== idx));
    setCurrentImageIndex((prev) => Math.max(0, Math.min(prev, imagePreviews.length - 2)));
  };

  // 비고 모달
  const openNoteModal = () => { setNoteText(form.notes || ""); setNoteModalOpen(true); };
  const saveNote = () => { setForm((s) => ({ ...s, notes: noteText })); setNoteModalOpen(false); };

  // 수도요금 자동
  useEffect(() => {
    const prev = parseNumber(form.waterPrev);
    const curr = parseNumber(form.waterCurr);
    const unit = parseNumber(form.waterUnit);
    if (!isNaN(prev) && !isNaN(curr) && !isNaN(unit)) {
      const usage = Math.max(0, curr - prev);
      const cost = usage * unit;
      setForm((s) => ({ ...s, waterCost: cost.toLocaleString() }));
    }
  }, [form.waterPrev, form.waterCurr, form.waterUnit]);

  // 총합 자동
  useEffect(() => {
    const baseSumKeys = ["arrears", "currentFee", "waterCost", "electricity", "tvFee", "cleaning"];
    const base = baseSumKeys.reduce((sum, k) => sum + parseNumber(form[k]), 0);
    const extra = defects.reduce((sum, d) => sum + parseNumber(d.amount), 0);
    setForm((s) => ({ ...s, total: (base + extra).toLocaleString() }));
  }, [form.arrears, form.currentFee, form.waterCost, form.electricity, form.tvFee, form.cleaning, defects]);

  // 저장(등록/수정 겸용)
  const handleSave = async () => {
    if (!form.name?.trim() || !form.roomNumber?.trim()) {
      alert("빌라명과 호수는 필수입니다.");
      return;
    }
    try {
      const uploadedUrls = [];
      for (const file of images) {
        const imageRef = ref(storage, `moveout/${uuidv4()}-${file.name}`);
        const snapshot = await uploadBytes(imageRef, file);
        const url = await getDownloadURL(snapshot.ref);
        uploadedUrls.push(url);
      }

      const now = Timestamp.now();
      const allowedStatuses = ["정산대기", "입금대기", "입금완료"];
      const safeStatus = allowedStatuses.includes(form.status) ? form.status : "정산대기";
      const validMoveOutDate = form.moveOutDate || new Date().toISOString().split("T")[0];
      const finalImages = [...existingImageUrls, ...uploadedUrls];

      const baseData = {
        ...form,
        moveOutDate: validMoveOutDate,
        total: parseNumber(form.total),
        defects,
        notes: form.notes || noteText || "",
        images: finalImages,
        groupId: userId,
        employeeId,
        status: safeStatus,
      };

      if (docId) {
        await setDoc(doc(db, "moveoutData", docId), { ...baseData, updatedAt: now }, { merge: true });
      } else {
        await addDoc(collection(db, "moveoutData"), { ...baseData, createdAt: now });
      }

      alert("정산내역 저장 완료 ✅");
      localStorage.removeItem("editItem");
      resetForm();

      if (isMobileDevice) navigate("/main");
      else if (onDone) onDone();
    } catch (err) {
      console.error("❌ 저장 오류:", err);
      alert("❌ 오류 발생: " + err.message);
    }
  };

  const isEditMode = !!docId;

  // 입력 목록
  const inputList = [
    { id: "moveOutDate", label: "이사날짜", type: "date" },
    { id: "name", label: "빌라명" },
    { id: "roomNumber", label: "호수" },
    { id: "arrears", label: "미납관리비" },
    { id: "currentFee", label: "당월관리비" },
    { id: "waterCurr", label: "당월지침" },
    { id: "waterPrev", label: "전월지침" },
    { id: "waterCost", label: "수도요금", readOnly: true },
    { id: "waterUnit", label: "수도단가" },
    { id: "electricity", label: "전기요금" },
    { id: "tvFee", label: "TV수신료" },
    { id: "cleaning", label: "청소비용" },
  ];

  return (
    <>
      <div className={`form-container ${isMobileDevice ? "mobile" : ""} ${isEditMode ? "edit-mode" : ""}`}>
        <FormLayout>
          <h2 className="form-title">{isEditMode ? "이사정산 수정" : "이사정산 등록"}</h2>

          {/* 연락처 단독 라인 */}
          <div className="grid">
            <div className="input-group" />
            <div className="input-group" />
            <div className="input-group contact-underline contact-field">
              <input
                {...koreanInputProps}
                type="text"
                value={form.contact}
                onChange={(e) => handleChange("contact", e.target.value)}
                placeholder="Phone number"
              />
            </div>

            {/* 메인 입력들 */}
            {inputList.map(({ id, label, type, readOnly }) => (
              <div key={id} className="input-group">
                <label>{label}</label>
                {id === "moveOutDate" ? (
                  <DatePicker
                    selected={form.moveOutDate ? new Date(form.moveOutDate) : null}
                    onChange={(date) => date && handleChange("moveOutDate", format(date, "yyyy-MM-dd"))}
                    dateFormat="yyyy-MM-dd"
                    locale={ko}
                    customInput={
                      <DPInput
                        placeholder="이사날짜"
                        className={`custom-datepicker ${isMobileDevice ? "mobile" : ""}`}
                      />
                    }
                    popperPlacement="bottom-end"
                    popperProps={{ modifiers: [{ name: "offset", options: { offset: [0, 8] } }] }}
                  />
                ) : (
                  <input
                    {...koreanInputProps}
                    type={type || "text"}
                    value={form[id]}
                    onChange={(e) => handleChange(id, e.target.value)}
                    inputMode={
                      numberOnlyFields.includes(id) || numberFieldsWithComma.includes(id) ? "numeric" : "text"
                    }
                    readOnly={readOnly}
                  />
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }} />

          {/* 추가내역 상단 입력 */}
          <div className="grid">
            <div className="input-group">
              <label>추가내역</label>
              <input
                {...koreanInputProps}
                ref={defectDescRef}
                value={form.defectDesc}
                onChange={(e) => setForm((s) => ({ ...s, defectDesc: e.target.value }))}
                onKeyDown={handleEnterOnDesc}
                placeholder={isEditMode ? "리스트에서 수정 / 여긴 새 항목 추가" : "추가내역"}
              />
            </div>
            <div className="input-group">
              <label>추가금액</label>
              <input
                {...koreanInputProps}
                ref={defectAmountRef}
                value={form.defectAmount}
                onChange={(e) => {
                  const numeric = (e.target.value || "").replace(/[^\d]/g, "");
                  const withComma = numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                  setForm((s) => ({ ...s, defectAmount: withComma }));
                }}
                onKeyDown={handleEnterOnAmount}
                placeholder={isEditMode ? "리스트에서 수정 / 여긴 새 항목 추가" : "추가금액"}
                inputMode="numeric"
              />
            </div>
          </div>

          {/* 리스트 (인라인 수정) */}
          <div className="extra-list-container">
            {defects.map((item, index) => {
              const isRowEditing = rowEdit.index === index;
              return (
                <div key={index} className="extra-row">
                  <div className="extra-desc" style={{ flex: 2 }}>
                    {isRowEditing ? (
                      <input
                        {...koreanInputProps}
                        value={rowEdit.desc}
                        onChange={(e) => setRowEdit((s) => ({ ...s, desc: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "NumpadEnter") { e.preventDefault(); saveRowEdit(); }
                          else if (e.key === "Escape") { e.preventDefault(); cancelRowEdit(); }
                        }}
                        placeholder="내역"
                        style={{ width: "100%" }}
                      />
                    ) : (
                      item.desc
                    )}
                  </div>
                  <div className="extra-amount" style={{ flex: 1, textAlign: "right", marginRight: "1rem" }}>
                    {isRowEditing ? (
                      <input
                        {...koreanInputProps}
                        value={rowEdit.amount}
                        onChange={(e) => {
                          const numeric = (e.target.value || "").replace(/[^\d]/g, "");
                          setRowEdit((s) => ({ ...s, amount: numeric ? Number(numeric).toLocaleString() : "" }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "NumpadEnter") { e.preventDefault(); saveRowEdit(); }
                          else if (e.key === "Escape") { e.preventDefault(); cancelRowEdit(); }
                        }}
                        placeholder="금액"
                        inputMode="numeric"
                        style={{ width: "100%", textAlign: "right" }}
                      />
                    ) : (
                      `${item.amount}원`
                    )}
                  </div>
                  <div className="extra-actions" style={{ display: "flex", gap: 6 }}>
                    {isRowEditing ? (
                      <>
                        <button onClick={saveRowEdit}>저장</button>
                        <button onClick={cancelRowEdit}>취소</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => beginRowEdit(index)}>수정</button>
                        <button onClick={() => handleDeleteDefect(index)}>삭제</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={listEndRef} /> {/* 스크롤 앵커 */}
          </div>

          <div style={{ marginTop: 16 }} />
          <div className="grid">
            <div className="input-group">
              <label>총 이사정산 금액</label>
              <input {...koreanInputProps} type="text" value={form.total} readOnly />
            </div>
            <div className="input-group">
              <label>정산진행현황</label>
              <select
                {...koreanInputProps}
                value={form.status}
                onChange={(e) => handleChange("status", e.target.value)}
              >
                <option value="정산대기">정산대기</option>
                <option value="입금대기">입금대기</option>
                <option value="입금완료">입금완료</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 16 }} />

          {/* 사진첨부 & 비고 */}
          <div className="grid-2col">
            <div className="input-group">
              <label>사진첨부</label>
              <input type="file" multiple ref={fileInputRef} onChange={handleImageChange} style={{ display: "none" }} />
              <button type="button" className="custom-button green" onClick={() => fileInputRef.current?.click()}>
                + 사진첨부
              </button>
            </div>

            <ImageSlider imageUrls={imagePreviews} setImageUrls={() => {}} isMobile={isMobileDevice} />

            <div className="input-group">
              <label>비고</label>
              <button className="custom-button orange" onClick={openNoteModal}>
                {form.notes ? "내용있음" : "내용없음"}
              </button>
            </div>
          </div>

          {/* 단일 슬라이더 */}
          {imagePreviews.length > 0 && (
            <div className="image-slider-single">
              <div className="slider-controls">
                <button onClick={() => setCurrentImageIndex((p) => (p > 0 ? p - 1 : imagePreviews.length - 1))} />
                <div className="slider-image-container" style={{ position: "relative" }}>
                  <img src={imagePreviews[currentImageIndex]} alt={`preview-${currentImageIndex}`} style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 8 }} />
                  <button
                    onClick={() => handleImageDelete(currentImageIndex)}
                    style={{ position: "absolute", top: 0, right: 0, background: "red", color: "white", border: "none", cursor: "pointer", padding: "2px 6px" }}
                  >
                    X
                  </button>
                </div>
                <button onClick={() => setCurrentImageIndex((p) => (p < imagePreviews.length - 1 ? p + 1 : 0))} />
              </div>
              <div className="slider-indicator">{currentImageIndex + 1} / {imagePreviews.length}</div>
            </div>
          )}

          {/* 하단 액션 버튼 */}
          <div className="actions-row">
            <button className="save-button" onClick={handleSave}>저장</button>
            {showCancel && (
              <button type="button" className="cancel-button" onClick={() => (isMobileDevice ? navigate("/main") : onDone?.())}>
                닫기
              </button>
            )}
          </div>
        </FormLayout>
      </div>

      {/* 비고 모달 */}
      {noteModalOpen && (
        <>
          <div className="note-modal-overlay" onClick={() => setNoteModalOpen(false)} />
          <div className={`note-modal ${isMobileDevice ? "mobile" : "pc"}`}>
            <textarea
              {...koreanInputProps}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="비고 입력"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "NumpadEnter") {
                  if (e.isComposing) return;
                  e.preventDefault();
                  e.stopPropagation();
                  saveNote();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setNoteModalOpen(false);
                }
              }}
            />
            <div className="note-modal-buttons">
              <button className="save" onClick={saveNote}>저장</button>
              <button className="cancel" onClick={() => setNoteModalOpen(false)}>닫기</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
