// src/components/GenericEditModal.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import ModalWrapper from "./ModalWrapper";
import "./ModalStyles.css";

/** ✅ 기본 한글 라벨 맵 (labels로 언제든 덮어쓸 수 있음) */
const DEFAULT_LABELS = {
  // 공통 상단
  code: "코드",
  name: "빌라명",
  district: "구",
  address: "주소",

  // 기본 선택값 헤더
  telco: "통신사",
  elevator: "승강기",
  septic: "정화조",
  fireSafety: "소방안전",
  electricSafety: "전기안전",
  water: "상수도",
  publicElectric: "공용전기",
  cleaning: "건물청소",
  cctv: "CCTV",

  // 통신사 상세
  telcoAmount: "금액",
  telcoName: "명의",
  telcoBillNo: "명세서번호",
  telcoLines: "회선수",
  telcoReceive: "수신방법",
  telcoTerm: "약정기간",
  telcoSupport: "지원금",
  telcoMemo: "비고",

  // 승강기 예시
  elevatorAmount: "금액",
  elevatorExpire: "점검만료",
  elevatorMemo: "비고",

  // 정화조 예시
  septicAmount: "금액",
  septicExpire: "점검만료",
  septicMemo: "비고",

  // 소방안전 예시
  fireSafetyAmount: "금액",
  fireSafetyExpire: "점검만료",
  fireSafetyMemo: "비고",

  // 전기안전 예시
  electricSafetyAmount: "금액",
  electricSafetyExpire: "점검만료",
  electricSafetyMemo: "비고",

  // 상수도/공용전기/청소/CCTV 예시
  waterAmount: "금액",
  waterExpire: "검침일/만료",
  waterMemo: "비고",

  publicElectricAmount: "금액",
  publicElectricMemo: "비고",

  cleaningAmount: "금액",
  cleaningMemo: "비고",

  cctvAmount: "금액",
  cctvMemo: "비고",
};

/**
 * Props
 * - villa: 수정 대상 객체
 * - isOpen, onClose, onSave: 모달 제어
 * - fields: 수정 가능한 필드 배열 (기존 그대로)
 * - labels: { key: "라벨" }  // ✅ DEFAULT_LABELS 위에 덮어씀
 * - types:  { key: "text" | "number" | "amount" | "date" | "select" }
 * - gridClass: 입력 그리드 클래스
 * - readOnlyKeys: 헤더 영역에 읽기 전용으로 보여줄 추가 키들 (페이지별로 다르게)
 * - headerKeys: 상단 기본 정보 키들 (기본: code, name, district, address)
 * - selectOptions: { key: string[] }  // ✅ select 타입일 때 옵션 목록
 * - formatters: { key: (value:string) => string }  // ✅ 입력단계 자동 포맷
 */
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
  headerKeys = ["code", "name", "district", "address"],
  selectOptions = {},        // ✅ 추가
  formatters = {},           // ✅ 추가
}) {
  const [form, setForm] = useState({});
  const inputRefs = useRef([]);

  // ✅ 기본 라벨과 사용자 라벨 병합
  const mergedLabels = useMemo(
    () => ({ ...DEFAULT_LABELS, ...labels }),
    [labels]
  );

  useEffect(() => {
    setForm(villa || {});
    inputRefs.current = [];
  }, [villa]);

  // ---- 값 포맷터 (헤더/읽기전용 표시용) ----
  const formatValue = (key, raw) => {
    const t = types[key] || "text";
    if (raw == null) return "";

    if (t === "amount") {
      const n = String(raw).replace(/[^\d.-]/g, "");
      if (!n) return "";
      const num = Number(n);
      return Number.isFinite(num) ? num.toLocaleString() : raw;
    }
    if (t === "number") {
      return String(raw).replace(/[^0-9]/g, "");
    }
    if (t === "date") {
      // 표시용: YY-MM-DD 형태로 보이게(기존 로직 유지)
      const s = String(raw).replace(/[^0-9]/g, "");
      if (s.length >= 6) {
        const y = s.length === 8 ? s.slice(2, 4) : s.slice(0, 2);
        const m = s.length === 8 ? s.slice(4, 6) : s.slice(2, 4);
        const d = s.length === 8 ? s.slice(6, 8) : s.slice(4, 6);
        return `${y}-${m}-${d}`;
      }
      return s;
    }
    // text 기본
    return String(raw);
  };

  // ---- 입력 변경 ----
  const handleChange = (e, fieldType) => {
    const { name, value } = e.target;

    // ✅ 1) 사용자 지정 포맷터가 있으면 최우선 적용
    if (formatters && typeof formatters[name] === "function") {
      let next = value;
      try {
        next = formatters[name](value);
      } catch {
        // 포맷터 에러 시 원본값 유지
        next = value;
      }
      setForm((prev) => ({ ...prev, [name]: next }));
      return;
    }

    // ✅ 2) 기본 타입별 포맷
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
    // text/select는 그대로

    setForm((prev) => ({
      ...prev,
      [name]: newValue,
    }));
  };

  // ---- 엔터로 다음 필드 이동 (비활성/읽기전용은 건너뛰기) ----
  const handleKeyDown = (e, idx) => {
    if (e.key === "Enter") {
      e.preventDefault();
      let nextIdx = idx + 1;
      while (nextIdx < inputRefs.current.length) {
        const next = inputRefs.current[nextIdx];
        if (next && !next.disabled && !next.readOnly) {
          next.focus();
          break;
        }
        nextIdx++;
      }
    }
  };

  // ---- 저장 ----
  const handleSubmit = () => {
    onSave(form);
  };

  // ---- 헤더 표시 데이터 구성: 기본 headerKeys + 추가 readOnlyKeys ----
  const headerList = useMemo(() => {
    const keys = [...new Set([...headerKeys, ...readOnlyKeys])];
    return keys
      .map((k) => ({
        key: k,
        label: mergedLabels[k] || k,
        value: formatValue(k, form[k]),
      }))
      .filter((item) => item.value !== "" && item.value != null);
  }, [form, headerKeys, readOnlyKeys, mergedLabels]);

  // ---- 필드 렌더러 (select 지원 추가) ----
  const renderInput = (field, idx) => {
    const label = mergedLabels[field] || field;
    const type = types[field] || "text";
    const disabled = readOnlyKeys.includes(field);
    const val = form[field] ?? "";

    // select 타입
    if (type === "select") {
      const opts = Array.isArray(selectOptions?.[field])
        ? selectOptions[field]
        : [];
      return (
        <div key={field} className="form-field">
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
            <option value="">선택</option>
            {opts.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }

    // number → 입력 제한
    if (type === "number") {
      return (
        <div key={field} className="form-field">
          <label>{label}</label>
          <input
            ref={(el) => (inputRefs.current[idx] = el)}
            type="text"
            name={field}
            value={val}
            onChange={(e) => handleChange(e, type)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            placeholder={label}
            disabled={disabled}
            readOnly={disabled}
            inputMode="numeric"
            className={disabled ? "input-readonly" : ""}
          />
        </div>
      );
    }

    // amount/date/text 공통
    return (
      <div key={field} className="form-field">
        <label>{label}</label>
        <input
          ref={(el) => (inputRefs.current[idx] = el)}
          type="text"
          name={field}
          value={val}
          onChange={(e) => handleChange(e, type)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          placeholder={label}
          disabled={disabled}
          readOnly={disabled}
          autoComplete="off"
          className={disabled ? "input-readonly" : ""}
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
      {/* ✅ 상단 읽기 전용 정보: 코드/이름/구/주소 + 페이지별 읽기전용 키들 */}
      {headerList.length > 0 && (
        <div className="readonly-inline" style={{ marginBottom: "24px" }}>
          {headerList.map(({ key, label, value }) => (
            <span key={key} className="readonly-chip">
              <strong>{label}:</strong> {value}
            </span>
          ))}
        </div>
      )}

      {/* ✅ 입력 필드 영역 (수정 가능 항목만) */}
      <div className={gridClass}>
        {fields.map((field, idx) => renderInput(field, idx))}
      </div>
    </ModalWrapper>
  );
}
