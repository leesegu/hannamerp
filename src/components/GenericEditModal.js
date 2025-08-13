// src/components/GenericEditModal.js
import React, { useState, useEffect, useRef } from "react";
import ModalWrapper from "./ModalWrapper";
import "./ModalStyles.css";

export default function GenericEditModal({
  villa,
  isOpen,
  onClose,
  onSave,
  fields = [],
  labels = {},
  types = {},
  gridClass = "modal-grid-3",
}) {
  const [form, setForm] = useState({});
  const inputRefs = useRef([]);

  useEffect(() => {
    setForm(villa || {});
    inputRefs.current = [];
  }, [villa]);

  const handleChange = (e, fieldType) => {
    const { name, value } = e.target;
    let newValue = value;

    if (fieldType === "number") {
      newValue = value.replace(/[^0-9]/g, "");
    } else if (fieldType === "amount") {
      const numeric = value.replace(/[^0-9]/g, "");
      newValue = numeric ? Number(numeric).toLocaleString() : "";
    } else if (fieldType === "date") {
      const clean = value.replace(/[^0-9]/g, "");
      if (clean.length >= 6) {
        const y = clean.length === 8 ? clean.slice(2, 4) : clean.slice(0, 2);
        const m = clean.length === 8 ? clean.slice(4, 6) : clean.slice(2, 4);
        const d = clean.length === 8 ? clean.slice(6, 8) : clean.slice(4, 6);
        newValue = `${y}-${m}-${d}`;
      } else {
        newValue = clean;
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
      const next = inputRefs.current[idx + 1];
      if (next) next.focus();
    }
  };

  const handleSubmit = () => {
    onSave(form);
  };

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      title={null}
      footer={
        <>
          <button className="save-btn" onClick={handleSubmit}>저장</button>
          <button className="close-btn" onClick={onClose}>닫기</button>
        </>
      }
    >
      {/* ✅ 상단 읽기 전용 정보 */}
      {form.code && (
        <div className="readonly-inline" style={{ marginBottom: "24px" }}>
          <span>[{form.code}]</span>
          <span>{form.name}</span>
          <span>· {form.district}</span>
          <span>· {form.address}</span>
        </div>
      )}

      {/* ✅ 입력 필드 영역 */}
      <div className={gridClass}>
        {fields.map((field, idx) => {
          const label = labels[field] || field;
          const type = types[field] || "text";

          return (
            <div key={field} className="form-field">
              <label>{label}</label>
              <input
                ref={(el) => (inputRefs.current[idx] = el)}
                type="text"
                name={field}
                value={form[field] || ""}
                onChange={(e) => handleChange(e, type)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                placeholder={label}
              />
            </div>
          );
        })}
      </div>
    </ModalWrapper>
  );
}
