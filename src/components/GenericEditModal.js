// src/components/GenericEditModal.js
import React, { useState, useEffect, useRef, useMemo, forwardRef } from "react";
import ModalWrapper from "./ModalWrapper";
import "./ModalStyles.css";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";

/* ---- 유틸 ---- */
const parseYYYYMMDD = (s) => {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};
const formatYYYYMMDD = (date) => {
  if (!date || isNaN(date)) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const DPInput = forwardRef(function DPInput(
  { value, onClick, placeholder, disabled, className, onKeyDown, name },
  ref
) {
  return (
    <input
      ref={ref}
      name={name}
      value={value || ""}
      onClick={onClick}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      onKeyDown={onKeyDown}
      readOnly
      autoComplete="off"
    />
  );
});

/**
 * 🔹 슬림 버전 GenericEditModal
 * - 지원: text, number, amount, date, select
 * - 제거: file(사진), note(내부 팝업), extraItems/extraAmount(추가내역), variant, photoPreviews 등
 * - renderAs: "modal" | "panel" (panel은 페이지 섹션처럼 렌더)
 */
export default function GenericEditModal({
  // 데이터/필드
  villa,
  fields = [],
  labels = {},
  types = {},
  readOnlyKeys = [],
  selectOptions = {},
  formatters = {},
  placeholders = {},
  onFormUpdate = null,

  // 레이아웃/스타일
  gridClass = "modal-grid-3",
  extraContent = null,

  // 액션
  onSave,
  onClose,

  // 렌더 모드/푸터
  renderAs = "modal",
  isOpen = true,
  showFooter = true,
  saveText = "저장",
  closeText = "닫기",

  // ModalWrapper props
  title = null,
  width = "700px",
  maxWidth = "90vw",
  className = "",
}) {
  const [form, setForm] = useState({});
  const inputRefs = useRef([]);

  const mergedLabels = useMemo(() => ({ ...labels }), [labels]);

  // 초기화
  useEffect(() => {
    if (renderAs === "modal" && !isOpen) return;
    const base = villa || {};
    const next = { ...base };
    // 예: 특정 필드 정규화가 필요하면 여기서 처리 (formatters 사용)
    setForm(next);
    inputRefs.current = [];
  }, [isOpen, villa, renderAs]);

  const patchForm = (patch, changedKey) => {
    const next0 = { ...form, ...patch };
    const next = onFormUpdate ? onFormUpdate(next0, changedKey) : next0;
    setForm(next);
  };
  const setFieldValue = (name, value) => patchForm({ [name]: value }, name);

  const handleChange = (e, fieldType) => {
    const { name, value } = e.target;

    let newValue = value;
    if (fieldType === "number") {
      newValue = value.replace(/[^0-9]/g, "");
    } else if (fieldType === "amount") {
      const numeric = value.replace(/[^0-9]/g, "");
      newValue = numeric ? Number(numeric).toLocaleString() : "";
    } else if (fieldType === "date") {
      newValue = value; // DatePicker에서 직접 세팅
    }

    // 선택적으로 커스텀 포맷터 적용 (예: 전화번호 등)
    if (formatters?.[name]) {
      try {
        newValue = formatters[name](newValue);
      } catch {}
    }

    setFieldValue(name, newValue);
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === "Enter") {
      e.preventDefault();
      let nextIdx = idx + 1;
      while (nextIdx < inputRefs.current.length) {
        const next = inputRefs.current[nextIdx];
        if (next && !next.disabled && !next.readOnly) { next.focus?.(); break; }
        nextIdx++;
      }
    }
  };

  const handleSubmit = () => onSave?.(form);

  const renderInput = (field, idx) => {
    const label = mergedLabels[field] || field;
    const type = types[field] || "text";
    const disabled = readOnlyKeys.includes(field);
    const val = form[field] ?? "";
    const ph = placeholders[field] || label;

    // select
    if (type === "select") {
      const opts = Array.isArray(selectOptions?.[field]) ? selectOptions[field] : [];
      return (
        <div key={field} className={`form-field field-${field}`}>
          <label>{label}</label>
          <select
            ref={(el) => (inputRefs.current[idx] = el)}
            name={field}
            value={val}
            onChange={(e) => handleChange(e, type)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            disabled={disabled}
            className={disabled ? "input-readonly" : ""}
          >
            {opts.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
          </select>
        </div>
      );
    }

    // date
    if (type === "date") {
      const selectedDate = parseYYYYMMDD(val);
      return (
        <div key={field} className={`form-field field-${field}`}>
          <label>{label}</label>
          <DatePicker
            selected={selectedDate}
            onChange={(date) => {
              const str = formatYYYYMMDD(date);
              handleChange({ target: { name: field, value: str } }, "date");
            }}
            locale={ko}
            dateFormat="yyyy-MM-dd"
            disabled={disabled}
            customInput={
              <DPInput
                name={field}
                placeholder={ph}
                className={disabled ? "input-readonly" : ""}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                ref={(el) => (inputRefs.current[idx] = el)}
              />
            }
          />
        </div>
      );
    }

    // default: text/number/amount
    return (
      <div key={field} className={`form-field field-${field}`}>
        <label>{label}</label>
        <input
          ref={(el) => (inputRefs.current[idx] = el)}
          type="text"
          name={field}
          value={val}
          onChange={(e) => handleChange(e, type)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          placeholder={ph}
          disabled={disabled}
          readOnly={disabled}
          autoComplete="off"
          inputMode={type === "number" || type === "amount" ? "numeric" : "text"}
        />
      </div>
    );
  };

  const Content = (
    <>
      <div className={gridClass}>
        {fields.map((field, idx) => renderInput(field, idx))}
      </div>

      {extraContent}

      {showFooter && (
        <div className="modal-footer" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, width: "100%", justifyContent: "flex-end" }}>
            <button className="save-btn" onClick={handleSubmit}>{saveText}</button>
            <button className="close-btn" onClick={onClose}>{closeText}</button>
          </div>
        </div>
      )}
    </>
  );

  if (renderAs === "panel") {
    return (
      <div className={`generic-edit-panel ${className || ""}`}>
        {title && <div className="modal-header"><h3 className="modal-title">{title}</h3></div>}
        {Content}
      </div>
    );
  }

  if (!isOpen) return null;
  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={null}
      width={width}
      maxWidth={maxWidth}
      className={className}
    >
      {Content}
    </ModalWrapper>
  );
}
