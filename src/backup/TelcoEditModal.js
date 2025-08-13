// src/components/TelcoEditModal.js
import React, { useState, useEffect, useRef } from "react";
import ModalWrapper from "../components/ModalWrapper";
import "./ModalWrapper.css";

export default function TelcoEditModal({ villa, isOpen, onClose, onSave }) {
  const [form, setForm] = useState({ ...villa });
  const inputRefs = useRef([]);

  // 입력 필드 순서 정의
  const editableFields = [
    { label: "금액", name: "telcoAmount" },
    { label: "명의", name: "telcoName" },
    { label: "명세서번호", name: "telcoBillNo" },
    { label: "회선수", name: "telcoLineCount" },
    { label: "수신방법", name: "telcoReceiveMethod" },
    { label: "약정기간", name: "telcoContract" },
    { label: "지원금", name: "telcoSupport" },
    { label: "비고", name: "telcoNote" },
  ];

  useEffect(() => {
    setForm({ ...villa });
  }, [villa]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === "telcoAmount") {
      // 숫자만 추출해서 쉼표 포맷 적용
      const numeric = value.replace(/[^\d]/g, "");
      newValue = numeric ? Number(numeric).toLocaleString() : "";
    }

    else if (name === "telcoContract") {
      const digits = value.replace(/[^\d]/g, "");

      if (digits.length === 6) {
        // 250325 → 25-03-25
        newValue = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
      } else if (digits.length === 8) {
        // 20250325 → 25-03-25
        newValue = `${digits.slice(2, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
      }
    }

    setForm((prev) => ({
      ...prev,
      [name]: newValue,
    }));
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const nextInput = inputRefs.current[idx + 1];
      if (nextInput) nextInput.focus();
    }
  };

  const handleSubmit = () => {
    const cleanedForm = {
      ...form,
      telcoAmount: form.telcoAmount?.replace(/,/g, ""), // 쉼표 제거하고 저장
    };
    onSave(cleanedForm);
  };

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      title="통신사 정보 수정"
      footer={
        <>
          <button className="save-btn" onClick={handleSubmit}>저장</button>
          <button className="close-btn" onClick={onClose}>닫기</button>
        </>
      }
    >
      {/* 읽기 전용 정보 */}
      <div className="modal-grid-3">
        <div>
          <label>코드번호</label>
          <input value={form.code || ""} disabled />
        </div>
        <div>
          <label>빌라명</label>
          <input value={form.name || ""} disabled />
        </div>
        <div>
          <label>주소</label>
          <input value={form.address || ""} disabled />
        </div>
        <div>
          <label>통신사</label>
          <input value={form.telco || ""} disabled />
        </div>
      </div>

      <hr />

      {/* 수정 가능한 필드 */}
      <div className="modal-grid-3">
        {editableFields.map((field, idx) => (
          <div key={field.name}>
            <label>{field.label}</label>
            <input
              name={field.name}
              value={form[field.name] || ""}
              onChange={handleChange}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              ref={(el) => (inputRefs.current[idx] = el)}
              placeholder={
                field.name === "telcoContract" ? "예: 250325 또는 20250325" : ""
              }
            />
          </div>
        ))}
      </div>
    </ModalWrapper>
  );
}
