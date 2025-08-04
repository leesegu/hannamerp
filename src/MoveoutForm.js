import React, { useState, useRef, useEffect } from "react";
import DatePicker from "react-datepicker";
import { useNavigate, useLocation } from "react-router-dom";  // ✅ useLocation 추가
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";
import { format } from "date-fns";
import { db, storage } from "./firebase";
import { collection, addDoc, setDoc, doc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import "./MoveoutForm.css";
import { FiArrowLeft } from "react-icons/fi";
import FormLayout from "./components/FormLayout";
import { formatPhoneNumber } from "./utils/formatting";
import "./MoveoutForm.css"; // PC 기본 스타일
import "./MoveoutForm.mobile.css"; // 모바일 대응 스타일 (media query 적용됨)
// MoveoutForm.js 상단
import { FiX } from "react-icons/fi";


console.log("✅ MoveoutForm 로딩됨");

export default function MoveoutForm({ employeeId, userId, editItem, onDone, showCancel, isMobile }) {
  useEffect(() => {
    console.log("✅ MoveoutForm 렌더됨 / isMobile:", isMobile);
  document.body.style.overflow = "hidden";
  return () => {
    document.body.style.overflow = "auto";
  };
}, []);

  const navigate = useNavigate();
  const handleBack = () => {
  navigate("/main");
};
  const location = useLocation();
  const isMobileDevice = typeof isMobile === "boolean" ? isMobile : window.innerWidth <= 768;
  
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

  const [defects, setDefects] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [images, setImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [existingImageUrls, setExistingImageUrls] = useState([]); // ✅ 기존 이미지 URL 저장
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const modalRef = useRef();  // 모달창에 접근할 수 있도록 ref 생성

  const inputRefs = useRef([]);
  const defectDescRef = useRef();
  const defectAmountRef = useRef();
  
  const numberFieldsWithComma = ["arrears", "currentFee", "electricity", "tvFee", "cleaning", "waterUnit", "waterCost", "defectAmount", "total"];
  const numberOnlyFields = ["waterPrev", "waterCurr"];
  const parseNumber = (str) => parseInt((str || "0").replace(/,/g, "")) || 0;

  useEffect(() => {
    if (editItem) {
      setForm({
        ...editItem,
        defectDesc: "",
        defectAmount: ""
      });
      setNoteText(editItem.notes || "");
      setDefects(editItem.defects || []);

      const imageUrls = (editItem.images || []).slice().reverse();
      setImagePreviews(imageUrls);
      setImages([]); // 파일 객체는 새로 선택된 이미지만
      setExistingImageUrls(imageUrls); // ✅ 기존 이미지 URL 저장

      window.lastSavedItem = editItem;
    }
  }, [editItem]);

  useEffect(() => {
  if (!editItem) {
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
    setImages([]);
    setImagePreviews([]);
    setExistingImageUrls([]);
    setCurrentImageIndex(0);
    setEditingIndex(null);
    setNoteModalOpen(false);
  }
}, [location.pathname]); // ← 반드시 location.pathname으로!

const handleChange = (id, value) => {
  if (id === "contact") {
    const formatted = formatPhoneNumber(value); // 유틸에서 가져온 함수
    setForm({ ...form, [id]: formatted });
  } else if (numberFieldsWithComma.includes(id)) {
    const numeric = value.replace(/[^0-9]/g, "");
    const formatted = numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    setForm({ ...form, [id]: formatted });
  } else if (numberOnlyFields.includes(id)) {
    const numeric = value.replace(/[^0-9]/g, "");
    setForm({ ...form, [id]: numeric });
  } else {
    setForm({ ...form, [id]: value });
  }
};


  const handleKeyDown = (e, index) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = inputRefs.current[index + 1];
      if (next) next.focus();
    }
  };

  const handleAddDefect = () => {
    if (form.defectDesc && form.defectAmount) {
      if (editingIndex !== null) {
        const updated = defects.map((d, i) =>
          i === editingIndex ? { desc: form.defectDesc, amount: form.defectAmount } : d
        );
        setDefects(updated);
        setEditingIndex(null);
      } else {
        setDefects([...defects, { desc: form.defectDesc, amount: form.defectAmount }]);
      }
      setForm({ ...form, defectDesc: "", defectAmount: "" });
      defectDescRef.current?.focus();
    }
  };

const handleEditDefect = (index) => {
  setForm({
    ...form,
    defectDesc: defects[index].desc,
    defectAmount: defects[index].amount,
  });
  setEditingIndex(index);
  defectDescRef.current?.focus();
};

  const handleDeleteDefect = (index) => {
    const updated = [...defects];
    updated.splice(index, 1);
    setDefects(updated);
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    const newImages = [...files, ...images];
    const newPreviews = [...files.map((file) => URL.createObjectURL(file)), ...imagePreviews];

    setImages(newImages);
    setImagePreviews(newPreviews);
    setCurrentImageIndex(0);
  };

  const handleImageDelete = (idx) => {
    const updatedImages = [...images];
    const updatedPreviews = [...imagePreviews];
    const updatedExistingUrls = [...existingImageUrls];

    if (typeof updatedPreviews[idx] === "string" && updatedExistingUrls.includes(updatedPreviews[idx])) {
      updatedExistingUrls.splice(updatedExistingUrls.indexOf(updatedPreviews[idx]), 1);
    }

    updatedImages.splice(idx, 1);
    updatedPreviews.splice(idx, 1);

    setImages(updatedImages);
    setImagePreviews(updatedPreviews);
    setExistingImageUrls(updatedExistingUrls);
    setCurrentImageIndex(Math.max(0, updatedPreviews.length - 1));
  };

  const openNoteModal = () => {
    setNoteText(form.notes);
    setNoteModalOpen(true);
  };

  const saveNote = () => {
    setForm({ ...form, notes: noteText });
    setNoteModalOpen(false);
  };

  const handleSave = async () => {
    console.log("✅ handleSave 실행됨", { employeeId, userId, form });
    try {
      const imageUrls = [...existingImageUrls]; // ✅ 기존 이미지 URL 포함
      for (const image of images) {
        if (typeof image === "string") continue;
        const imageRef = ref(storage, `moveout/${uuidv4()}-${image.name}`);
        const snapshot = await uploadBytes(imageRef, image);
        const url = await getDownloadURL(snapshot.ref);
        imageUrls.push(url);
      }

      const validMoveOutDate = form.moveOutDate || new Date().toISOString().split("T")[0];
      const allowedStatuses = ["정산대기", "입금대기", "입금완료"];
      const safeStatus = allowedStatuses.includes(form.status) ? form.status : "정산대기";

      const saveData = {
        ...form,
        moveOutDate: validMoveOutDate,
        total: parseNumber(form.total),
        defects,
        notes: noteText,
        images: imageUrls,
        createdAt: Timestamp.now(),
        groupId: userId,
        employeeId,
        status: safeStatus,
      };

      if (editItem?.docId) {
        await setDoc(doc(db, "moveoutData", editItem.docId), saveData, { merge: true });
      } else {
        await addDoc(collection(db, "moveoutData"), saveData);
      }

      alert("정산내역 저장 완료 ✅");
      if (onDone) onDone();

      // 초기화
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
      setImages([]);
      setImagePreviews([]);
      setExistingImageUrls([]);
      setCurrentImageIndex(0);
      setEditingIndex(null);
      setNoteModalOpen(false);
    } catch (err) {
      console.error("❌ 저장 오류 발생:", err);
      alert("❌ 오류 발생: " + err.message);
    }
  };

  useEffect(() => {
    const prev = parseNumber(form.waterPrev);
    const curr = parseNumber(form.waterCurr);
    const unit = parseNumber(form.waterUnit);
    if (!isNaN(prev) && !isNaN(curr) && !isNaN(unit)) {
      const usage = curr - prev;
      const cost = usage * unit;
      setForm((prevForm) => ({ ...prevForm, waterCost: cost.toLocaleString() }));
    }
  }, [form.waterPrev, form.waterCurr, form.waterUnit]);

  useEffect(() => {
    const totalSum = ["arrears", "currentFee", "waterCost", "electricity", "tvFee", "cleaning"].reduce(
      (sum, key) => sum + parseNumber(form[key]),
      0
    );
    const defectSum = defects.reduce((sum, d) => sum + parseNumber(d.amount), 0);
    setForm((prevForm) => ({ ...prevForm, total: (totalSum + defectSum).toLocaleString() }));
  }, [form.arrears, form.currentFee, form.waterCost, form.electricity, form.tvFee, form.cleaning, defects]);

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
  { id: "tvFee", label: "TV수신료" }, // ✅ 수정됨
  { id: "cleaning", label: "청소비용" },
];

console.log("MoveoutForm 컴포넌트 렌더됨");
  return (
  <div className={`form-container ${isMobileDevice ? "mobile" : ""}`}>
    {!isMobile && (
  <button className="close-button" onClick={onDone}>
    <FiX />
  </button>
)}
    {/* ✅ 뒤로가기 버튼 (모바일 전용) */}
{isMobileDevice && (
  <div className="mobile-back-button-wrapper">
    <button className="mobile-back-button" onClick={handleBack}>
      <FiArrowLeft size={20} />
      <span>뒤로가기</span>
    </button>
  </div>
)}

    <FormLayout>
<h2>이사정산 등록</h2>
        {/* (이하 동일 - 생략 없이 반영됨) */}
<div className="grid">
  {/* ✅ 1줄: 비워둠, 비워둠, 연락처 */}
  <div className="input-group" />
  <div className="input-group" />
<div className="input-group contact-underline contact-field">
  <input
    type="text"
    value={form.contact}
    onChange={(e) => handleChange("contact", e.target.value)}
    placeholder="Phone number"
  />
</div>
        
          {inputList.map(({ id, label, type, readOnly }, index) => (
            <div key={id} className="input-group">
              <label>{label}</label>
              {id === "moveOutDate" ? (
<DatePicker
  selected={form.moveOutDate ? new Date(form.moveOutDate) : null}
  onChange={(date) => handleChange("moveOutDate", format(date, "yyyy-MM-dd"))}
  dateFormat="yyyy-MM-dd"
  locale={ko}
  className={`custom-datepicker ${isMobileDevice ? "mobile" : ""}`}
  popperPlacement="bottom-end"
  popperProps={{
    modifiers: [
      {
        name: "offset",
        options: {
          offset: [0, 8],
        },
      },
    ],
  }}
/>



              ) : (
                <input
                  ref={(el) => (inputRefs.current[index] = el)}
                  type={type || "text"}
                  value={form[id]}
                  onChange={(e) => handleChange(id, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  readOnly={readOnly}
                />
              )}
            </div>
          ))}
        </div>

<div style={{ marginTop: "16px" }} />
        {/* 하자입력 */}
        <div className="grid">
  <div className="input-group">
    <label>추가내역</label> {/* ✅ 수정됨 */}
    <input
      ref={defectDescRef}
      value={form.defectDesc}
      onChange={(e) => handleChange("defectDesc", e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && defectAmountRef.current?.focus()}
    />
  </div>
  <div className="input-group">
    <label>추가금액</label> {/* ✅ 수정됨 */}
    <input
      ref={defectAmountRef}
      value={form.defectAmount}
      onChange={(e) => handleChange("defectAmount", e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && handleAddDefect()}
    />
  </div>
</div>

<div className="extra-list-container">
  {defects.map((item, index) => (
    <div key={index} className="extra-row">
      <div className="extra-desc">{item.desc}</div>
      <div className="extra-amount">{item.amount}원</div>
      <div className="extra-actions">
        <button onClick={() => handleEditDefect(index)}>수정</button>
        <button onClick={() => handleDeleteDefect(index)}>삭제</button>
      </div>
    </div>
  ))}
</div>


<div style={{ marginTop: "16px" }} />
        <div className="grid">
          <div className="input-group">
            <label>총 이사정산 금액</label>
            <input type="text" value={form.total} readOnly />
          </div>
          <div className="input-group">
            <label>정산진행현황</label>
            <select value={form.status} onChange={(e) => handleChange("status", e.target.value)}>
              <option value="정산대기">정산대기</option>
              <option value="입금대기">입금대기</option>
              <option value="입금완료">입금완료</option>
            </select>
          </div>
        </div>

<div style={{ marginTop: "16px" }} />

<div className="grid-2col">
  {/* 사진첨부 버튼 */}
  <div className="input-group">
    <label>사진첨부</label>
    <input
      type="file"
      id="file-upload"
      multiple
      onChange={handleImageChange}
      style={{ display: "none" }}
    />
    <button
      type="button"
      className="custom-button green"
      onClick={() => document.getElementById("file-upload").click()}
    >
      + 사진첨부
    </button>
  </div>

  {/* 비고 버튼 */}
  <div className="input-group">
    <label>비고</label>
    <button className="custom-button orange" onClick={openNoteModal}>
      {form.notes ? "내용있음" : "내용없음"}
    </button>
  </div>
</div>


        {imagePreviews.length > 0 && (
          <div className="image-slider-single">
            <div className="slider-controls">
              <button onClick={() => setCurrentImageIndex(prev => prev > 0 ? prev - 1 : imagePreviews.length - 1)}>◀</button>
              <div className="slider-image-container" style={{ position: "relative" }}>
                <img
                  src={imagePreviews[currentImageIndex]}
                  alt={`preview-${currentImageIndex}`}
                  style={{ maxWidth: "100%", maxHeight: "300px", borderRadius: "8px" }}
                />
                <button
                  onClick={() => handleImageDelete(currentImageIndex)}
                  style={{
                    position: "absolute", top: 0, right: 0, background: "red",
                    color: "white", border: "none", cursor: "pointer", padding: "2px 6px"
                  }}
                >
                  X
                </button>
              </div>
              <button onClick={() => setCurrentImageIndex(prev => prev < imagePreviews.length - 1 ? prev + 1 : 0)}>▶</button>
            </div>
            <div className="slider-indicator">{currentImageIndex + 1} / {imagePreviews.length}</div>
          </div>
        )}

      {/* ✅ 저장 버튼 */}
      <button className="save-button" onClick={handleSave}>
        저장
      </button>
    </FormLayout>

    {/* ✅ 모달은 form-inner 바깥에서 렌더링 */}
    {noteModalOpen && (
  <div className="modal-wrapper">
    <div className="modal" ref={modalRef}>
      <textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="비고 입력"
      />
      <button onClick={saveNote}>저장</button>
      <button onClick={() => setNoteModalOpen(false)}>닫기</button>
    </div>
  </div>
)}
  </div> 
);        
}
