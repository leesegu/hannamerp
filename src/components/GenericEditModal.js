// src/components/GenericEditModal.js
import React, { useState, useEffect, useRef, useMemo, forwardRef } from "react";
import ModalWrapper from "./ModalWrapper";
import "./ModalStyles.css";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";

/* ---- 날짜 유틸 (1900년 문제 방지 & 유연 파싱) ---- */
const normalizeDateString = (s) =>
  String(s || "").trim().replace(/[./]/g, "-").replace(/\s+/g, "");

const toFourDigitYear = (yy) => {
  // 00~69 → 2000~, 70~99 → 1900~ (표준 규칙)
  return yy <= 69 ? 2000 + yy : 1900 + yy;
};

const makeDate = (year, month, day) => {
  const d = new Date(0);
  d.setFullYear(year, month - 1, day);
  d.setHours(0, 0, 0, 0);
  return d;
};

const parseFlexibleYMD = (input) => {
  if (!input) return null;
  const s = normalizeDateString(input);
  const parts = s.split("-");
  if (parts.length !== 3) return null;

  let [y, m, d] = parts.map((x) => (x ? Number(x) : NaN));
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;

  if (y >= 0 && y <= 99) y = toFourDigitYear(y);
  m = Math.min(Math.max(m, 1), 12);
  d = Math.min(Math.max(d, 1), 31);

  const date = makeDate(y, m, d);
  return isNaN(date) ? null : date;
};

const formatYYYYMMDD = (date) => {
  if (!date || isNaN(date)) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/* ---- 커스텀 인풋 ---- */
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
 * - amount: 입력 시 즉시 쉼표, 저장 시 쉼표 제거 후 숫자로 변환
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

  // ✅ 달력이 버튼 뒤에 깔리지 않도록 z-index CSS 1회 주입
  useEffect(() => {
    const styleId = "rdp-zfix";
    if (!document.getElementById(styleId)) {
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = `
        /* react-datepicker 팝퍼를 모달 버튼보다 위로 */
        .react-datepicker-popper { z-index: 999999; }
      `;
      document.head.appendChild(s);
    }
  }, []);

  // 초기화
  useEffect(() => {
    if (renderAs === "modal" && !isOpen) return;
    const base = villa || {};
    const next = { ...base };
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
        if (next && !next.disabled && !next.readOnly) {
          next.focus?.();
          break;
        }
        nextIdx++;
      }
    }
  };

  // ✅ 저장 시 amount 타입은 쉼표 제거 후 Number로 변환
  const handleSubmit = () => {
    const cleaned = {};
    for (const [k, v] of Object.entries(form)) {
      if (types[k] === "amount") {
        const num = v ? Number(String(v).replace(/,/g, "")) : 0;
        cleaned[k] = Number.isFinite(num) ? num : 0;
      } else {
        cleaned[k] = v;
      }
    }
    onSave?.(cleaned);
  };

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
            {opts.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }

    // date
    if (type === "date") {
      const selectedDate = parseFlexibleYMD(val);
      return (
        <div key={field} className={`form-field field-${field}`}>
          <label>{label}</label>
          <DatePicker
            selected={selectedDate}
            onChange={(date) => {
              // date가 null이면 비우기(삭제)
              const str = date ? formatYYYYMMDD(date) : "";
              handleChange({ target: { name: field, value: str } }, "date");
            }}
            locale={ko}
            dateFormat="yyyy-MM-dd"   // 저장 포맷 기준 (YYYY-MM-DD)
            disabled={disabled}
            isClearable                 // ✅ X 버튼으로 날짜 삭제 가능
            clearButtonTitle="지우기"
            /* 포털 없이 '펼쳐지되' 버튼 위로 보이게 (z-index는 위에서 주입) */
            placement="top-start"
            popperPlacement="top-start"
            showPopperArrow={false}
            fixedHeight                 // ✅ 달력 높이 고정 (항상 6주 표시)
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
          inputMode={
            type === "number" || type === "amount" ? "numeric" : "text"
          }
        />
      </div>
    );
  };

  const Content = (
    <>
      <div className={gridClass}>{fields.map((field, idx) => renderInput(field, idx))}</div>

      {extraContent}

      {showFooter && (
        <div className="modal-footer" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, width: "100%", justifyContent: "flex-end" }}>
            <button className="save-btn" onClick={handleSubmit}>
              {saveText}
            </button>
            <button className="close-btn" onClick={onClose}>
              {closeText}
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (renderAs === "panel") {
    return (
      <div className={`generic-edit-panel ${className || ""}`}>
        {title && (
          <div className="modal-header">
            <h3 className="modal-title">{title}</h3>
          </div>
        )}
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
