import React, { useState, useEffect, useRef } from "react";
import { db, storage } from "../firebase";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";
import "./MobileMoveoutForm.css";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";

export default function MobileMoveoutForm({ userId, employeeId }) {
  const [form, setForm] = useState({
    moveoutDate: new Date(),
    contact: "",
    villaName: "",
    roomNumber: "",
    unpaidFee: "",
    currentFee: "",
    currentMeter: "",
    previousMeter: "",
    waterFee: "",
    waterRate: "",
    electricFee: "",
    tvFee: "",
    cleaningFee: "",
    extraItem: "",
    extraCost: "",
    totalAmount: "",
    status: "정산대기",
    note: "",
    photos: [],
  });

  const [imageFiles, setImageFiles] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteTemp, setNoteTemp] = useState("");
  const [extraList, setExtraList] = useState([]);
  const [editIndex, setEditIndex] = useState(null);
  const navigate = useNavigate();

  


    const refs = {
    contact: useRef(),
    villaName: useRef(),
    roomNumber: useRef(),
    unpaidFee: useRef(),
    currentFee: useRef(),
    currentMeter: useRef(),
    electricFee: useRef(),
    tvFee: useRef(),
    cleaningFee: useRef(),
    extraItem: useRef(),
    extraCost: useRef(),
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const formatCurrency = (value) => {
    const num = value.replace(/,/g, "").replace(/\D/g, "");
    return num ? parseInt(num).toLocaleString() : "";
  };

  const handleCurrencyChange = (e) => {
    const { name, value } = e.target;
    const onlyNum = value.replace(/,/g, "").replace(/\D/g, "");
    setForm((prev) => ({ ...prev, [name]: formatCurrency(onlyNum) }));
  };

const handleKeyDown = (e, nextRef) => {
  if (e.key === "Enter" && nextRef?.current) {
    e.preventDefault();
    nextRef.current.focus();
  }
};

  const formatPhoneNumber = (value) => {
    const digits = value.replace(/\D/g, "").substring(0, 11);
    if (digits.length < 4) return digits;
    if (digits.length < 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 10)
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  };

  const handlePhoneChange = (e) => {
    const input = e.target.value;
    const onlyDigits = input.replace(/\D/g, "");
    setForm((prev) => ({ ...prev, contact: formatPhoneNumber(onlyDigits) }));
  };

const handleAddExtra = () => {
  if (!form.extraItem || !form.extraCost) return;

  if (editIndex !== null) {
    const updated = [...extraList];
    updated[editIndex] = { item: form.extraItem, cost: form.extraCost };
    setExtraList(updated);
    setEditIndex(null);
  } else {
    setExtraList((prev) => [...prev, { item: form.extraItem, cost: form.extraCost }]);
  }

  setForm((prev) => ({ ...prev, extraItem: "", extraCost: "" }));
  setTimeout(() => refs.extraItem.current.focus(), 100);
};


const handleImageChange = (e) => {
  const files = Array.from(e.target.files);
  const newPreviews = files.map((file) => URL.createObjectURL(file));
  setImageFiles((prev) => [...files, ...prev]);       // 최근 이미지가 앞으로
  setPreviewUrls((prev) => [...newPreviews, ...prev]);
  setCurrentImageIndex(0);                             // 첫 이미지로 초기화
};

const showPrevImage = () => {
  setCurrentImageIndex((prev) => (prev === 0 ? previewUrls.length - 1 : prev - 1));
};

const showNextImage = () => {
  setCurrentImageIndex((prev) => (prev === previewUrls.length - 1 ? 0 : prev + 1));
};


  const handleRemoveImage = (index) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadImagesAndGetUrls = async () => {
    const urls = [];
    for (let file of imageFiles) {
      const fileRef = ref(storage, `moveouts/${uuidv4()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      urls.push(url);
    }
    return urls;
  };

  const handleRemoveExtra = (index) => {
    setExtraList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditExtra = (index) => {
  const selected = extraList[index];
  setForm((prev) => ({ ...prev, extraItem: selected.item, extraCost: selected.cost }));
  setEditIndex(index);
  setTimeout(() => refs.extraItem.current.focus(), 100);
};


  useEffect(() => {
    const parse = (v) => parseInt(v?.toString().replace(/,/g, "")) || 0;
    const extraSum = extraList.reduce((sum, item) => sum + parse(item.cost), 0);
    const total =
      parse(form.unpaidFee) +
      parse(form.currentFee) +
      parse(form.waterFee) +
      parse(form.electricFee) +
      parse(form.tvFee) +
      parse(form.cleaningFee) +
      extraSum;
    setForm((prev) => ({ ...prev, totalAmount: total > 0 ? total.toLocaleString() : "" }));
  }, [form.unpaidFee, form.currentFee, form.waterFee, form.electricFee, form.tvFee, form.cleaningFee, extraList]);

  useEffect(() => {
    const cur = parseInt(form.currentMeter) || 0;
    const prev = parseInt(form.previousMeter) || 0;
    const rate = parseInt(form.waterRate?.toString().replace(/,/g, "")) || 0;
    const usage = cur - prev;
    const water = usage > 0 ? usage * rate : 0;
    setForm((prev) => ({ ...prev, waterFee: water > 0 ? water.toLocaleString() : "" }));
  }, [form.currentMeter, form.previousMeter, form.waterRate]);

const handleSave = async () => {
  try {
    const imageUrls = await uploadImagesAndGetUrls();

    await addDoc(collection(db, "moveoutData"), {
      moveoutDate: form.moveOutDate.toISOString().split("T")[0],
      contact: form.contact,
      villaName: form.name,
      roomNumber: form.roomNumber,
      unpaidFee: form.arrears,
      currentFee: form.currentFee,
      currentMeter: form.waterCurr,
      previousMeter: form.waterPrev,
      waterFee: form.waterCost,
      waterRate: form.waterUnit,
      electricFee: form.electricity,
      tvFee: form.tvFee,
      cleaningFee: form.cleaning,
      extraItems: extraList,
      totalAmount: form.total,
      status: form.status,
      note: form.notes,
      photos: imageUrls,
      userId,
      employeeId,
      groupId: userId, // ✅ PC에서 사용되는 groupId
      createdAt: Timestamp.now(),
    });

    alert("저장되었습니다.");
    navigate("/main");
  } catch (err) {
    console.error(err);
    alert("저장 실패");
  }
};


  useEffect(() => {
    const parse = (v) => parseInt(v?.toString().replace(/,/g, "")) || 0;
    const extraSum = extraList.reduce((sum, item) => sum + parse(item.cost), 0);
    const total =
      parse(form.unpaidFee) +
      parse(form.currentFee) +
      parse(form.waterFee) +
      parse(form.electricFee) +
      parse(form.tvFee) +
      parse(form.cleaningFee) +
      extraSum;
    setForm((prev) => ({ ...prev, totalAmount: total > 0 ? total.toLocaleString() : "" }));
  }, [form.unpaidFee, form.currentFee, form.waterFee, form.electricFee, form.tvFee, form.cleaningFee, extraList]);

  useEffect(() => {
    const cur = parseInt(form.currentMeter) || 0;
    const prev = parseInt(form.previousMeter) || 0;
    const rate = parseInt(form.waterRate?.toString().replace(/,/g, "")) || 0;
    const usage = cur - prev;
    const water = usage > 0 ? usage * rate : 0;
    setForm((prev) => ({ ...prev, waterFee: water > 0 ? water.toLocaleString() : "" }));
  }, [form.currentMeter, form.previousMeter, form.waterRate]);

    return (
    <div className="mobile-form-container">
<div className="form-header">
  <button className="back-button" onClick={() => navigate("/main")}>
    <FiArrowLeft size={10} />
    뒤로가기
  </button>
  <span className="form-title">이사정산 등록</span>
</div>
      <div className="form-grid">
        <div className="form-cell"><label>이사날짜</label><DatePicker selected={form.moveoutDate} onChange={(date) => setForm((prev) => ({ ...prev, moveoutDate: date }))} dateFormat="yyyy-MM-dd" locale={ko} /></div>
        <div className="form-cell"><label>연락처</label><input name="contact" value={form.contact} onChange={handlePhoneChange} onKeyDown={(e) => handleKeyDown(e, refs.villaName)} ref={refs.contact} /></div>
        <div className="form-cell"><label>빌라명</label><input name="villaName" value={form.villaName} onChange={handleChange} onKeyDown={(e) => handleKeyDown(e, refs.roomNumber)} ref={refs.villaName} /></div>
        <div className="form-cell"><label>호수</label><input name="roomNumber" value={form.roomNumber} onChange={handleChange} onKeyDown={(e) => handleKeyDown(e, refs.unpaidFee)} ref={refs.roomNumber} /></div>
        <div className="form-cell"><label>미납관리비</label><input name="unpaidFee" value={form.unpaidFee} onChange={handleCurrencyChange} onKeyDown={(e) => handleKeyDown(e, refs.currentFee)} ref={refs.unpaidFee} /></div>
        <div className="form-cell"><label>당월관리비</label><input name="currentFee" value={form.currentFee} onChange={handleCurrencyChange} onKeyDown={(e) => handleKeyDown(e, refs.currentMeter)} ref={refs.currentFee} /></div>
        <div className="form-cell"><label>당월지침</label><input name="currentMeter" value={form.currentMeter} onChange={handleChange} onKeyDown={(e) => handleKeyDown(e, refs.electricFee)} ref={refs.currentMeter} /></div>
        <div className="form-cell"><label>전월지침</label><input name="previousMeter" value={form.previousMeter} onChange={handleChange} /></div>
        <div className="form-cell"><label>수도요금</label><input name="waterFee" value={form.waterFee} onChange={handleCurrencyChange} /></div>
        <div className="form-cell"><label>수도단가</label><input name="waterRate" value={form.waterRate} onChange={handleCurrencyChange} /></div>
        <div className="form-cell"><label>전기요금</label><input name="electricFee" value={form.electricFee} onChange={handleCurrencyChange} onKeyDown={(e) => handleKeyDown(e, refs.tvFee)} ref={refs.electricFee} /></div>
        <div className="form-cell"><label>TV수신료</label><input name="tvFee" value={form.tvFee} onChange={handleCurrencyChange} onKeyDown={(e) => handleKeyDown(e, refs.cleaningFee)} ref={refs.tvFee} /></div>
        <div className="form-cell"><label>청소비용</label><input name="cleaningFee" value={form.cleaningFee} onChange={handleCurrencyChange} onKeyDown={(e) => handleKeyDown(e, refs.extraItem)} ref={refs.cleaningFee} /></div>
        <div className="form-cell"></div>
        <div className="form-cell"><label>추가내역</label><input name="extraItem" value={form.extraItem} onChange={handleChange} onKeyDown={(e) => handleKeyDown(e, refs.extraCost)} ref={refs.extraItem} /></div>
        <div className="form-cell"><label>추가금액</label><input name="extraCost" value={form.extraCost} onChange={handleCurrencyChange} ref={refs.extraCost} onKeyDown={(e) => { if (e.key === "Enter") { handleAddExtra(); setTimeout(() => refs.extraItem.current.focus(), 100); }}} /></div>
        <div className="form-cell full-width"><div className="extra-list">{extraList.map((item, idx) => (
  <div key={idx} className="extra-row">
    <span>{item.item} - {formatCurrency(item.cost)}원</span>
    <div>
      <button onClick={() => handleEditExtra(idx)}>수정</button>
      <button onClick={() => handleRemoveExtra(idx)}>삭제</button>
    </div>
  </div>
))}
</div></div>
        <div className="form-cell"><label>총 이사정산 금액</label><input name="totalAmount" value={form.totalAmount} onChange={handleCurrencyChange} /></div>
        <div className="form-cell"><label>정산진행현황</label><select name="status" value={form.status} onChange={handleChange}><option value="정산대기">정산대기</option><option value="입금대기">입금대기</option><option value="입금완료">입금완료</option></select></div>
{/* 사진첨부 (좌측) */}
<div className="form-cell">
  <label>사진첨부</label>
  <input type="file" accept="image/*" multiple onChange={handleImageChange} />
</div>

{/* 비고 (우측) */}
<div className="form-cell">
  <label>비고</label>
  <button
    type="button"
    onClick={() => {
      setNoteTemp(form.note);
      setShowNoteModal(true);
    }}
    className="note-button"
  >
    {form.note ? "내용 있음" : "입력하기"}
  </button>
</div>

{/* 사진 미리보기 (하단 전체 너비) */}
{previewUrls.length > 0 && (
  <div className="form-cell full-width">
    <div className="image-slider">
      <button onClick={showPrevImage} className="nav-button">〈</button>

      <div className="image-slide-wrapper">
        <img
          src={previewUrls[currentImageIndex]}
          alt="미리보기"
          className="slider-image"
        />
        <button
          className="delete-button"
          onClick={() => handleRemoveImage(currentImageIndex)}
        >
          삭제
        </button>
      </div>

      <button onClick={showNextImage} className="nav-button">〉</button>
      <div className="image-counter">{currentImageIndex + 1} / {previewUrls.length}</div>
    </div>
  </div>
)}

        <div className="form-actions"><button onClick={handleSave}>저장하기</button></div>
      </div>
      {showNoteModal && (<div className="note-modal-overlay" onClick={() => setShowNoteModal(false)}><div className="note-modal" onClick={(e) => e.stopPropagation()}><h3>비고 입력</h3><textarea value={noteTemp} onChange={(e) => setNoteTemp(e.target.value)} placeholder="비고 내용을 입력하세요" /><div className="note-modal-buttons"><button onClick={() => setShowNoteModal(false)}>취소</button><button onClick={() => { setForm((prev) => ({ ...prev, note: noteTemp })); setShowNoteModal(false); }}>
                      저장
            </button>
          </div>
        </div>
      </div>
    )}

  </div>
);
}