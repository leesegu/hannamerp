import React, { useState, useEffect, useRef, useMemo, forwardRef } from "react";
import ModalWrapper from "./ModalWrapper";
import "./ModalStyles.css";

/* 날짜 입력 */
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";

const DEFAULT_LABELS = {};

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

// DatePicker 커스텀 인풋
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

export default function GenericEditModal({
  villa,
  isOpen,
  onClose,
  onSave,
  fields = [],
  labels = {},
  types = {},
  gridClass = "modal-grid-3",
  readOnlyKeys = [],
  headerKeys = [],
  selectOptions = {},
  formatters = {},
  placeholders = {},
  onFormUpdate = null,
  includeReadOnlyInHeader = false,
  extraContent = null,
  onFilesSelected = () => {},
  photoPreviews = [],
  onRemovePendingPhoto = () => {},
  /** ✅ 이사정산 페이지 전용 확장 스타일 */
  variant = "default", // "default" | "moveout"
}) {
  const [form, setForm] = useState({});
  const [photoIndex, setPhotoIndex] = useState(0);

  const inputRefs = useRef([]);
  const nameRefs = useRef({});

  // 상단 입력창 기반 편집
  const [editIdx, setEditIdx] = useState(-1);

  // 비고 팝업(모달 내부)
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const mergedLabels = useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);

  // ✅ 폼 초기화
  useEffect(() => {
    if (!isOpen) return;
    const base = villa || {};
    const next = {
      ...base,
      extras: Array.isArray(base.extras) ? base.extras : [],
      photos: Array.isArray(base.photos) ? base.photos : (base.photos ? [base.photos] : []),
    };
    // 초기 표시 시 1회만 ‘호’ 정규화
    if (formatters?.unitNumber) {
      try { next.unitNumber = formatters.unitNumber(next.unitNumber); } catch {}
    }
    setForm(next);
    setPhotoIndex(0);
    inputRefs.current = [];
    nameRefs.current = {};
    setEditIdx(-1);
  }, [isOpen, villa]); // ⚠️ formatters 제외

  useEffect(() => { setPhotoIndex(0); }, [photoPreviews.length, form.photos?.length]);

  const patchForm = (patch, changedKey) => {
    const next0 = { ...form, ...patch };
    const next = onFormUpdate ? onFormUpdate(next0, changedKey) : next0;
    setForm(next);
  };
  const setFieldValue = (name, value) => patchForm({ [name]: value }, name);

  const handleChange = (e, fieldType) => {
    const { name, value } = e.target;

    if (name === "payerPhone" && typeof formatters?.payerPhone === "function") {
      let next = value;
      try { next = formatters.payerPhone(value); } catch {}
      setFieldValue(name, next);
      return;
    }

    let newValue = value;
    if (fieldType === "number") newValue = value.replace(/[^0-9]/g, "");
    else if (fieldType === "amount") {
      const numeric = value.replace(/[^0-9]/g, "");
      newValue = numeric ? Number(numeric).toLocaleString() : "";
    } else if (fieldType === "date") {
      newValue = value;
    }

    setFieldValue(name, newValue);
  };

  const handleBlur = (name) => {
    if (name === "unitNumber" && typeof formatters?.unitNumber === "function") {
      try {
        const next = formatters.unitNumber(form[name]);
        setFieldValue(name, next);
      } catch {}
    }
  };

  const focusByName = (nm) => {
    const el = nameRefs.current[nm];
    if (el && typeof el.focus === "function") el.focus();
  };

  const handleKeyDown = (e, idx, field) => {
    if (field === "extraItems" && e.key === "Enter") {
      e.preventDefault();
      focusByName("extraAmount");
      return;
    }
    if (field === "extraAmount" && e.key === "Enter") {
      e.preventDefault();
      handleAddOrUpdateExtra();
      focusByName("extraItems");
      return;
    }
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

  const handleSubmit = () => onSave(form);

  /* ===== 추가내역: 상단 입력창으로 추가/수정 ===== */
  const handleAddOrUpdateExtra = () => {
    const desc = String(form.extraItems || "").trim();
    const amt = Number(String(form.extraAmount || "").replace(/[^0-9]/g, "")) || 0;
    if (!desc || !amt) return;

    const list = Array.isArray(form.extras) ? [...form.extras] : [];

    if (editIdx >= 0 && editIdx < list.length) {
      // 수정
      const target = list[editIdx] || {};
      list[editIdx] = { ...target, desc, amount: amt };
    } else {
      // 추가
      list.unshift({ id: Date.now(), desc, amount: amt });
    }

    patchForm({ extras: list, extraItems: "", extraAmount: "" }, "extras");
    setEditIdx(-1);
  };

  const handleDeleteExtra = (idx) => {
    const nextExtras = (form.extras || []).filter((_, i) => i !== idx);
    patchForm({ extras: nextExtras }, "extras");
    setEditIdx(-1);
  };

  const startEditExtra = (idx) => {
    const it = form.extras?.[idx];
    if (!it) return;
    setEditIdx(idx);
    // 수정 시작 시 두 입력칸 모두 값 세팅
    setFieldValue("extraItems", String(it.desc || ""));
    setFieldValue("extraAmount", Number(it.amount || 0).toLocaleString());
    // 커서 UX: 내역부터 수정 → Enter → 금액 → Enter → 반영
    setTimeout(() => focusByName("extraItems"), 0);
  };

  // 리스트(내용) 렌더 — 입력칸은 건드리지 않음
  const renderExtrasList = () => {
    if (!Array.isArray(form.extras) || form.extras.length === 0) {
      return null;
    }
    return (
      <div style={{ marginTop: 8 }}>
        {form.extras.map((it, i) => (
          <div
            key={it.id ?? i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
              fontSize: 13,
            }}
          >
            <div style={{ minWidth: 0, flex: "1 1 auto", color: "#333" }}>
              • {it.desc}
            </div>
            <div
              style={{
                minWidth: 90,
                textAlign: "left",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {it.amount ? it.amount.toLocaleString() : ""}
            </div>
            <button
              type="button"
              onClick={() => startEditExtra(i)}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #ddd",
                background: "#f0f0ff",
              }}
            >
              수정
            </button>
            <button
              type="button"
              onClick={() => handleDeleteExtra(i)}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #ddd",
                background: "#f5f5f5",
              }}
            >
              삭제
            </button>
          </div>
        ))}
      </div>
    );
  };

  const navBtnStyle = (side) => ({
    position: "absolute",
    [side]: 6,
    top: "50%",
    transform: "translateY(-50%)",
    background: "rgba(255,255,255,0.9)",
    border: "1px solid #ddd",
    borderRadius: "50%",
    width: 30,
    height: 30,
    cursor: "pointer",
  });

  // ✅ 이사정산 전용 넓은 버튼 스타일
  const wideBtnStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
  };

  const renderInput = (field, idx) => {
    const label = mergedLabels[field] || field;
    const type = types[field] || "text";
    const disabled = readOnlyKeys.includes(field);
    const val = form[field] ?? (type === "file" ? [] : "");
    const ph = placeholders[field] || label;

    // select
    if (type === "select") {
      const opts = Array.isArray(selectOptions?.[field]) ? selectOptions[field] : [];
      return (
        <div key={field} className={`form-field field-${field}`}>
          <label>{label}</label>
          <select
            ref={(el) => { inputRefs.current[idx] = el; nameRefs.current[field] = el; }}
            name={field}
            value={val}
            onChange={(e) => handleChange(e, type)}
            onKeyDown={(e) => handleKeyDown(e, idx, field)}
            disabled={disabled}
            className={disabled ? "input-readonly" : ""}
            onBlur={() => handleBlur(field)}
          >
            {opts.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
          </select>
        </div>
      );
    }

    // 파일(사진) — 한 장씩 슬라이드
    if (type === "file") {
      let fileRef = null;

      const previewItems = (photoPreviews || []).map((url, i) => ({ kind: "pending", url, pidx: i }));
      const existing = Array.isArray(val) ? val : [];
      const existingItems = existing.map((url, i) => ({ kind: "existing", url, eidx: i })).reverse();
      const items = [...previewItems, ...existingItems];
      const hasItems = items.length > 0;
      const cur = hasItems ? Math.min(photoIndex, items.length - 1) : 0;

      const go = (dir) => {
        if (!hasItems) return;
        const next = (cur + dir + items.length) % items.length;
        setPhotoIndex(next);
      };
      const removeCurrent = () => {
        if (!hasItems) return;
        const it = items[cur];
        if (it.kind === "pending") onRemovePendingPhoto(it.pidx);
        else {
          const next = (form.photos || []).filter((_, i) => i !== it.eidx);
          patchForm({ photos: next }, "photos");
        }
      };

      return (
        <div key={field} className={`form-field field-${field}`}>
          <label>{label}</label>

          <input
            ref={(el) => (fileRef = el)}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { onFilesSelected(field, e.target.files); e.target.value = ""; }}
          />
          <button
            type="button"
            ref={(el) => { inputRefs.current[idx] = el; nameRefs.current[field] = el; }}
            className={variant === "moveout" ? "" : "save-btn"}
            onClick={() => fileRef && fileRef.click()}
            disabled={disabled}
            onKeyDown={(e) => handleKeyDown(e, idx, field)}
            onBlur={() => handleBlur(field)}
            style={variant === "moveout"
              ? { ...wideBtnStyle, background:"#eef2ff", border:"2px solid #c7d2fe", color:"#374151" }
              : undefined}
          >
            📷 {ph || "+ 사진첨부"}
          </button>

          {hasItems && (
            <div style={{ position: "relative", marginTop: 10 }}>
              <div style={{ textAlign: "center" }}>
                <img
                  src={items[cur].url}
                  alt="첨부"
                  style={{ width: "100%", maxWidth: 520, height: 300, objectFit: "cover", borderRadius: 8, border: "1px solid #ddd" }}
                />
              </div>
              <button type="button" onClick={() => go(-1)} style={navBtnStyle("left")} aria-label="이전">‹</button>
              <button type="button" onClick={() => go(1)} style={navBtnStyle("right")} aria-label="다음">›</button>
              <button
                type="button"
                onClick={removeCurrent}
                title="삭제"
                style={{ position:"absolute", right:10, top:10, width:28, height:28, borderRadius:"50%", border:"none",
                         background:"rgba(0,0,0,0.55)", color:"#fff", cursor:"pointer", fontWeight:700, lineHeight:"28px" }}
              >×</button>
              <div style={{ position:"absolute", right:12, bottom:12, background:"rgba(0,0,0,0.55)", color:"#fff",
                            padding:"2px 8px", borderRadius:12, fontSize:12 }}>
                {cur + 1} / {items.length}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 비고(버튼 → 내부 팝업)
    if (type === "note") {
      const hasNote = !!(form.note && String(form.note).trim());
      const preview = hasNote ? "내용있음" : "내용없음";
      return (
        <div key={field} className={`form-field field-${field}`}>
          <label>{label}</label>
          <button
            type="button"
            ref={(el) => { inputRefs.current[idx] = el; nameRefs.current[field] = el; }}
            onClick={() => { setNoteDraft(form.note || ""); setNoteOpen(true); }}
            onKeyDown={(e) => handleKeyDown(e, idx, field)}
            className={variant === "moveout" ? "" : "close-btn"}
            style={variant === "moveout"
              ? { ...wideBtnStyle, textAlign:"left", background:"#fff7ed", border:"2px solid #fcd34d", color:"#92400e" }
              : {
                  textAlign: "left", background: "#f7f7ff", border: "2px solid #dcd9ff", color: "#444",
                  padding: "10px 12px", borderRadius: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
            title="클릭하여 비고 입력"
            onBlur={() => handleBlur(field)}
          >
            📝 {preview}
          </button>

          {noteOpen && (
            <div
              style={{
                position:"fixed", inset:0, background:"rgba(0,0,0,0.2)",
                display:"flex", alignItems:"center", justifyContent:"center", zIndex:10000
              }}
            >
              <div
                style={{ width:360, background:"#fff", borderRadius:10, padding:16, boxShadow:"0 10px 30px rgba(0,0,0,0.2)" }}
                onClick={(e) => e.stopPropagation()} // 바깥 클릭 닫힘 방지
              >
                <div style={{ fontWeight:700, marginBottom:8 }}>비고 입력</div>
                <textarea
                  rows={4}
                  style={{ width:"100%", boxSizing:"border-box", padding:8, borderRadius:6, border:"2px solid #ddd" }}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="내용을 입력하세요"
                />
                <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:12 }}>
                  <button
                    className="save-btn"
                    onClick={() => { setFieldValue("note", noteDraft); setNoteOpen(false); }}
                  >
                    저장
                  </button>
                  <button className="close-btn" onClick={() => setNoteOpen(false)}>닫기</button>
                </div>
              </div>
            </div>
          )}
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
                placeholder={placeholders[field] || "선택 이사날짜"}
                className={disabled ? "input-readonly" : ""}
                onKeyDown={(e) => handleKeyDown(e, idx, field)}
                ref={(el) => { inputRefs.current[idx] = el; nameRefs.current[field] = el; }}
              />
            }
          />
        </div>
      );
    }

    // text/number/amount
    const smallForExtra = field === "extraItems" || field === "extraAmount";

    // ❗ extraAmount일 때: 입력칸 바로 아래 "그리드 전체폭" 리스트 블록을 항상 렌더(placeholder 포함)
    if (field === "extraAmount") {
      const inputEl = (
        <div key={field} className={`form-field field-${field}`}>
          <label style={smallForExtra ? { fontSize: 13 } : undefined}>{label}</label>
          <input
            ref={(el) => { inputRefs.current[idx] = el; nameRefs.current[field] = el; }}
            type="text"
            name={field}
            value={val}
            onChange={(e) => handleChange(e, types[field] || "text")}
            onKeyDown={(e) => handleKeyDown(e, idx, field)}
            onBlur={() => handleBlur(field)}
            placeholder={placeholders[field] || label}
            disabled={disabled}
            readOnly={disabled}
            autoComplete="off"
            inputMode={types[field] === "number" || types[field] === "amount" ? "numeric" : undefined}
            className={disabled ? "input-readonly" : ""}
            style={smallForExtra ? { fontSize: 13, padding: "6px 10px" } : undefined}
          />
        </div>
      );

      // 항상 존재하는 placeholder 컨테이너 → 위치 고정
      const listEl = (
        <div
          key="__extraslist"
          className="form-field field-extras-list"
          style={{ gridColumn: "1 / -1", paddingTop: 0 }}
        >
          {renderExtrasList()}
        </div>
      );

      return [inputEl, listEl];
    }

    // 그 외 일반 입력
    return (
      <div key={field} className={`form-field field-${field}`}>
        <label style={smallForExtra ? { fontSize: 13 } : undefined}>{label}</label>
        <input
          ref={(el) => { inputRefs.current[idx] = el; nameRefs.current[field] = el; }}
          type="text"
          name={field}
          value={val}
          onChange={(e) => handleChange(e, type)}
          onKeyDown={(e) => handleKeyDown(e, idx, field)}
          onBlur={() => handleBlur(field)}
          placeholder={placeholders[field] || label}
          disabled={disabled}
          readOnly={disabled}
          autoComplete="off"
          // ✅ 한글 우선 입력 힌트(브라우저/OS 지원 범위 내)
          lang={field === "extraItems" ? "ko" : undefined}
          inputMode={type === "number" || type === "amount" ? "numeric" : "text"}
          autoCapitalize={field === "extraItems" ? "none" : undefined}
          autoCorrect={field === "extraItems" ? "off" : undefined}
          className={disabled ? "input-readonly" : ""}
          style={smallForExtra ? { fontSize: 13, padding: "6px 10px" } : undefined}
        />
      </div>
    );
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
      <div className={gridClass}>
        {fields.map((field, idx) => renderInput(field, idx))}
      </div>

      {extraContent}
    </ModalWrapper>
  );
}
