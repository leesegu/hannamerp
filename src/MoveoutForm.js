import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // ✅ 추가
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { db, storage } from "./firebase";
import { collection, addDoc, setDoc, doc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import "./MoveoutForm.css";
import { FiArrowLeft } from "react-icons/fi";


export default function MoveoutForm({ employeeId, userId, editItem, onDone, showCancel, isMobile }) {
  const navigate = useNavigate();
  const isMobileDevice = typeof isMobile === "boolean" ? isMobile : window.innerWidth <= 768;
  
  const [form, setForm] = useState({
    moveOutDate: "",
    name: "",
    roomNumber: "",
    arrears: "",
    currentFee: "",
    waterCurr: "",
    waterPrev: "",
    waterCost: "",
    waterUnit: "",
    electricity: "",
    gas: "",
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
  
  const numberFieldsWithComma = ["arrears", "currentFee", "electricity", "gas", "cleaning", "waterUnit", "waterCost", "defectAmount", "total"];
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

  const handleChange = (id, value) => {
    if (numberFieldsWithComma.includes(id)) {
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

  const handleStartEditDefect = (index) => {
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
        arrears: "",
        currentFee: "",
        waterCurr: "",
        waterPrev: "",
        waterCost: "",
        waterUnit: "",
        electricity: "",
        gas: "",
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
    const totalSum = ["arrears", "currentFee", "waterCost", "electricity", "gas", "cleaning"].reduce(
      (sum, key) => sum + parseNumber(form[key]),
      0
    );
    const defectSum = defects.reduce((sum, d) => sum + parseNumber(d.amount), 0);
    setForm((prevForm) => ({ ...prevForm, total: (totalSum + defectSum).toLocaleString() }));
  }, [form.arrears, form.currentFee, form.waterCost, form.electricity, form.gas, form.cleaning, defects]);

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
    { id: "gas", label: "가스요금" },
    { id: "cleaning", label: "청소비용" },
  ];

  return (
  <div className="form-container">
    {/* ✅ 뒤로가기 버튼 (모바일 전용) */}
    {isMobileDevice && (
  <button
    onClick={() => navigate("/main")}
    style={{
      position: "absolute",
      top: "16px",
      left: "16px",
      backgroundColor: "#ffffff",
      border: "1px solid #ccc",
      borderRadius: "8px",
      padding: "6px 12px",
      display: "flex",
      alignItems: "center",
      fontSize: "14px",
      color: "#333",
      cursor: "pointer",
      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
      zIndex: 1000,
    }}
  >
    <FiArrowLeft size={18} color="#ff8c00" style={{ marginRight: "6px" }} />
    뒤로가기
  </button>
)}

    <div className="form-inner">
<h2>이사정산 입력</h2>
        {/* (이하 동일 - 생략 없이 반영됨) */}
        <div className="grid">
          {inputList.map(({ id, label, type, readOnly }, index) => (
            <div key={id} className="input-group">
              <label>{label}</label>
              {id === "moveOutDate" ? (
                <DatePicker
                  selected={form.moveOutDate ? new Date(form.moveOutDate) : null}
                  onChange={(date) => handleChange("moveOutDate", date.toISOString().split("T")[0])}
                  dateFormat="yyyy-MM-dd"
                  className="custom-datepicker"
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

        {/* 하자입력 */}
        <div className="grid">
          <div className="input-group">
            <label>하자내역</label>
            <input
              ref={defectDescRef}
              value={form.defectDesc}
              onChange={(e) => handleChange("defectDesc", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && defectAmountRef.current?.focus()}
            />
          </div>
          <div className="input-group">
            <label>하자금액</label>
            <input
              ref={defectAmountRef}
              value={form.defectAmount}
              onChange={(e) => handleChange("defectAmount", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddDefect()}
            />
          </div>
        </div>

        <div className="defect-list-container">
          {defects.map((d, i) => (
            <div key={i} className="defect-row">
              <span className="defect-desc">{d.desc}</span>
              <span className="defect-amount">{d.amount}원</span>
              <div className="defect-actions">
                <button onClick={() => handleStartEditDefect(i)}>수정</button>
                <button onClick={() => handleDeleteDefect(i)}>삭제</button>
              </div>
            </div>
          ))}
        </div>

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

        <div className="input-group">
          <label>사진첨부</label>
          <input type="file" multiple onChange={handleImageChange} />
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

        <div className="input-group">
        <label>비고</label>
        <button onClick={openNoteModal}>
          {form.notes ? "내용있음" : "내용없음"}
        </button>
      </div>

      {/* ✅ 저장 버튼 */}
      <button className="save-button" onClick={handleSave}>
        저장
      </button>
    </div>

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