// src/pages/PayrollBook.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./PayrollBook.css";
import { db } from "../firebase";
import {
  collection,
  doc,
  onSnapshot,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";

/** 유틸 */
const pad2 = (n) => String(n).padStart(2, "0");
const now = new Date();
const THIS_YEAR = now.getFullYear();
const THIS_MONTH = now.getMonth() + 1;

const WONS = (v) =>
  (Number(v || 0) || 0).toLocaleString("ko-KR", { maximumFractionDigits: 0 });
const toNum = (v) => {
  if (v == null || v === "") return 0;
  const s = String(v).replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const DEFAULT_PAY_FIELDS = [
  { key: "basePay", label: "기본급" },
  { key: "bonus", label: "상여" },
  { key: "dutyAllowance", label: "업무수당" },
  { key: "carAllowance", label: "차량보조금" },
  { key: "positionAllowance", label: "직책수당" },
  { key: "longServiceAllowance", label: "근속수당" },
];
const DEFAULT_DED_FIELDS = [
  { key: "pension", label: "국민연금" },
  { key: "health", label: "건강보험" },
  { key: "employmentIns", label: "고용보험" },
  { key: "ltc", label: "장기요양보험" },
  { key: "incomeTax", label: "소득세" },
  { key: "localTax", label: "지방소득세" },
  { key: "yearEndTax", label: "연말정산소득세" },
  { key: "yearEndLocalTax", label: "연말정산지방소득세" },
];

/** 공용 인라인 숫자/문자 입력 셀 */
function EditableCell({
  value,
  onCommit,
  placeholder,
  type = "text",
  className,
  editable = true,
  colKey,    // 어떤 항목인지(합산/음수판단용)
  colIndex,  // 위/아래 이동용 "열 번호" 식별자 (예: 'pay-0', 'ded-2', 'workDays' 등)
}) {
  const [draft, setDraft] = useState("");
  const ref = useRef(null);

  const isCountField = colKey === "workDays" || colKey === "workHours";
  const isNumber = type === "number";

  //초기 표시값 세팅
  useEffect(() => {
    if (!editable) return;
    if (!isNumber) {
      setDraft(value || "");
      return;
    }
    const n = toNum(value);
    if (value == null || value === "") {
      setDraft("");
    } else if (isCountField) {
      // 근무일수/근무시간은 콤마 없이 그대로
      setDraft(value !== undefined && value !== null ? String(value) : "");
    } else {
      // 금액: 음수/양수 모두 콤마 포함 표시
      setDraft(
        Number.isFinite(n)
          ? n.toLocaleString("ko-KR", { maximumFractionDigits: 0 })
          : ""
      );
    }
  }, [editable, isNumber, value, isCountField]);

  const commit = () => {
    if (!editable) return;
    if (isNumber) {
      onCommit?.(toNum(draft));
    } else {
      onCommit?.(draft.trim());
    }
  };

  // 좌/우 이동 (DOM 순서 기준)
  const moveFocus = (delta) => {
    const inputs = Array.from(document.querySelectorAll(".pb-edit-input"));
    const idx = inputs.indexOf(ref.current);
    if (idx === -1) return;
    const next = inputs[idx + delta];
    if (next) {
      next.focus();
      if (next.select) next.select();
    }
  };

  // 🔧 위/아래 이동: 같은 "열(colIndex)" 안에서 화면상의 바로 위/아래 입력칸으로 이동
  const moveVertical = (delta) => {
    if (!ref.current) return;
    const col = ref.current.dataset.colIndex;
    if (!col) return;

    // 같은 colIndex를 가진 입력칸들만 대상으로
    const inputs = Array.from(
      document.querySelectorAll(`.pb-edit-input[data-col-index="${col}"]`)
    );
    if (inputs.length <= 1) return;

    // 화면상의 위치 기준으로 위→아래 순으로 정렬
    inputs.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (ra.top === rb.top) return ra.left - rb.left;
      return ra.top - rb.top;
    });

    const idx = inputs.indexOf(ref.current);
    if (idx === -1) return;

    const next = inputs[idx + delta];
    if (next) {
      next.focus();
      if (next.select) next.select();
    }
  };

  // 수정 불가 모드: 그냥 표시만
  if (!editable) {
    const isNegative = isNumber && toNum(value) < 0;
    return (
      <div className={`cell ${className || ""}`}>
        <span className={`cell-text ${isNegative ? "negative" : ""}`}>
          {isNumber ? (value || value === 0 ? WONS(value) : "") : value || ""}
        </span>
      </div>
    );
  }

  const isNegativeDraft = isNumber && toNum(draft) < 0;

  return (
    <div className={`cell ${className || ""}`}>
      <input
        ref={ref}
        className={`cell-input pb-edit-input ${isNegativeDraft ? "negative" : ""}`}
        type="text"
        data-col={colKey || ""}
        data-col-index={colIndex || ""}
        inputMode={isNumber ? "decimal" : undefined}
        value={draft}
        onChange={(e) => {
          const raw = e.target.value;

          if (!isNumber) {
            setDraft(raw);
            return;
          }

          if (isCountField) {
            // 근무일수/근무시간: 숫자/마이너스 그대로 (보통 음수 안 쓰겠지만 유지)
            setDraft(raw.replace(/[^\d-]/g, ""));
            return;
          }

          // 금액 필드: 마이너스 입력 허용
          // 1) 빈 문자열 허용
          if (raw === "") {
            setDraft("");
            return;
          }
          // 2) "-"만 입력한 상태도 허용 (아직 숫자 안 친 상태)
          if (raw === "-") {
            setDraft("-");
            return;
          }

          // 3) 나머지는 숫자/마이너스만 필터 → 숫자로 파싱 후 콤마 포맷
          const n = toNum(raw);
          setDraft(
            Number.isFinite(n)
              ? n.toLocaleString("ko-KR", { maximumFractionDigits: 0 })
              : ""
          );
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            moveFocus(1);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            commit();
            moveFocus(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            commit();
            moveFocus(-1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            commit();
            moveVertical(1); // ⇦ 같은 열의 바로 아래 입력칸
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            commit();
            moveVertical(-1); // ⇦ 같은 열의 바로 위 입력칸
          } else if (e.key === "Escape") {
            e.preventDefault();
            if (isNumber) {
              if (isCountField) {
                setDraft(value !== undefined && value !== null ? String(value) : "");
              } else {
                const n = toNum(value);
                setDraft(
                  value == null || value === ""
                    ? ""
                    : Number.isFinite(n)
                    ? n.toLocaleString("ko-KR", { maximumFractionDigits: 0 })
                    : ""
                );
              }
            } else {
              setDraft(value || "");
            }
          }
        }}
        placeholder={placeholder}
      />
    </div>
  );
}

export default function PayrollBook() {
  /** 선택된 연/월 */
  const [year, setYear] = useState(() => {
    const clamped = Math.min(Math.max(THIS_YEAR, 2025), 2035);
    return clamped;
  });
  const [month, setMonth] = useState(THIS_MONTH);

  /** 수정 모드 (버튼으로 토글) */
  const [editMode, setEditMode] = useState(false);

  /** 급여/공제 필드 설정 (동적) */
  const [payFields, setPayFields] = useState(DEFAULT_PAY_FIELDS);
  const [dedFields, setDedFields] = useState(DEFAULT_DED_FIELDS);

  // ✅ 항목 설정을 연/월 무관 공통 문서로 사용
  const configDoc = useMemo(() => doc(db, "payrollConfig", "global"), []);

  useEffect(() => {
    const unsub = onSnapshot(configDoc, (snap) => {
      if (snap.exists()) {
        const d = snap.data() || {};
        setPayFields(
          Array.isArray(d.payFields) && d.payFields.length
            ? d.payFields
            : DEFAULT_PAY_FIELDS
        );
        setDedFields(
          Array.isArray(d.dedFields) && d.dedFields.length
            ? d.dedFields
            : DEFAULT_DED_FIELDS
        );
      } else {
        setPayFields(DEFAULT_PAY_FIELDS);
        setDedFields(DEFAULT_DED_FIELDS);
      }
    });
    return () => unsub();
  }, [configDoc]);

  /** 직원 목록 (인적사항 자동 채움용) */
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "employees"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEmployees(list);
    });
    return () => unsub();
  }, []);

  /** 급여 데이터 */
  const [rows, setRows] = useState({}); // { empId: { ...fields } }
  const rowsCol = useMemo(() => {
    const yRef = doc(db, "payroll", String(year));
    const mCol = collection(yRef, "months");
    const rCol = collection(doc(mCol, pad2(month)), "rows");
    return rCol;
  }, [year, month]);

  // 해당 연/월 데이터 구독 + 직원 동기화(없으면 생성)
  useEffect(() => {
    let unsub;
    (async () => {
      // 1) 실시간 구독
      unsub = onSnapshot(rowsCol, (snap) => {
        const map = {};
        snap.forEach((d) => (map[d.id] = d.data()));
        setRows(map);
      });

      // 2) 직원 목록을 읽고, 빠진 직원은 기본값으로 행 생성
      const snap = await getDocs(rowsCol);
      const existing = new Set(snap.docs.map((d) => d.id));
      const batch = writeBatch(db);
      for (const emp of employees) {
        if (!emp?.id) continue;
        if (!existing.has(emp.id)) {
          const ref = doc(rowsCol, emp.id);
          const seed = {
            empId: emp.id,
            empNo: emp.empNo || "",
            name: emp.name || "",
            rrn: emp.resRegNo || "",
            address: emp.address || "",
            dept: emp.dept || "",
            position: emp.position || "",
            joinDate: emp.joinDate || "",
            workDays: 0,
            workHours: 0,
            // 급여 항목
            basePay: 0,
            bonus: 0,
            dutyAllowance: 0,
            carAllowance: 0,
            positionAllowance: 0,
            longServiceAllowance: 0,
            // 공제
            pension: 0,
            health: 0,
            employmentIns: 0,
            ltc: 0,
            incomeTax: 0,
            localTax: 0,
            yearEndTax: 0,
            yearEndLocalTax: 0,
            // 자동합계
            grossTotal: 0,
            dedTotal: 0,
            netPay: 0,
          };
          batch.set(ref, seed, { merge: true });
        }
      }
      await batch.commit();
    })();

    return () => {
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsCol, employees.map((e) => e.id).join(",")]);

  const years = useMemo(() => {
    const arr = [];
    const start = 2025;
    const end = 2035;
    for (let y = start; y <= end; y++) arr.push(y);
    return arr;
  }, []);

  /** 셀 값 변경 → 합계 재계산 → Firestore 반영 */
  const updateCell = async (empId, field, rawValue) => {
    const numericFields = [
      "basePay",
      "bonus",
      "pension",
      "health",
      "employmentIns",
      "ltc",
      "incomeTax",
      "localTax",
      "yearEndTax",
      "yearEndLocalTax",
      "workDays",
      "workHours",
      // 동적 급여/공제 항목도 숫자로 처리
      ...payFields.map((f) => f.key),
      ...dedFields.map((f) => f.key),
    ];

    const v = numericFields.includes(field) ? toNum(rawValue) : rawValue;

    const prev = rows[empId] || {};
    const next = { ...prev, [field]: v };

    // 합계 갱신 (설정된 필드 기반) - 음수 포함해서 계산
    const gross = payFields.reduce((sum, f) => sum + toNum(next[f.key]), 0);
    const ded = dedFields.reduce((sum, f) => sum + toNum(next[f.key]), 0);
    next.grossTotal = Math.round(gross);
    next.dedTotal = Math.round(ded);
    next.netPay = Math.round(gross - ded);

    setRows((old) => ({ ...old, [empId]: next }));

    try {
      await setDoc(doc(rowsCol, String(empId)), next, { merge: true });
    } catch (e) {
      console.error(e);
    }
  };

  /** 연간합계 모달 */
  const [statsOpen, setStatsOpen] = useState(false);
  const [yearStats, setYearStats] = useState([]); // [{month, gross, ded, net}]
  const loadYearStats = async () => {
    const yRef = doc(db, "payroll", String(year));
    const mCol = collection(yRef, "months");
    const arr = [];
    for (let m = 1; m <= 12; m++) {
      const rCol = collection(doc(mCol, pad2(m)), "rows");
      const snap = await getDocs(rCol);
      let gross = 0,
        ded = 0,
        net = 0;
      for (const d of snap.docs) {
        const v = d.data() || {};
        gross += toNum(v.grossTotal);
        ded += toNum(v.dedTotal);
        net += toNum(v.netPay);
      }
      arr.push({ month: m, gross, ded, net });
    }
    setYearStats(arr);
    setStatsOpen(true);
  };

  const totalGross = yearStats.reduce((s, it) => s + toNum(it.gross), 0);
  const totalDed = yearStats.reduce((s, it) => s + toNum(it.ded), 0);
  const totalNet = yearStats.reduce((s, it) => s + toNum(it.net), 0);

  // 직원행 구성 (employees 기준으로 정렬)
  const sortedEmployees = useMemo(() => {
    const byNo = (a, b) =>
      String(a.empNo || "").localeCompare(String(b.empNo || ""));
    return [...employees].sort(byNo);
  }, [employees]);

  /** 필드 추가 모달 */
  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [fieldType, setFieldType] = useState("pay"); // 'pay' | 'ded'
  const [newFieldLabel, setNewFieldLabel] = useState("");

  const handleAddField = async () => {
    const label = newFieldLabel.trim();
    if (!label) return;

    // label 기반 key 생성 (간단 변환 + 타임스탬프)
    const baseKey =
      label
        .replace(/\s+/g, "_")
        .replace(/[^\w가-힣]/g, "")
        .slice(0, 20) || "custom";
    const key = `${fieldType}_${baseKey}_${Date.now()}`;

    try {
      if (fieldType === "pay") {
        const nextPay = [...payFields, { key, label }];
        setPayFields(nextPay);
        await setDoc(configDoc, { payFields: nextPay }, { merge: true });
      } else {
        const nextDed = [...dedFields, { key, label }];
        setDedFields(nextDed);
        await setDoc(configDoc, { dedFields: nextDed }, { merge: true });
      }
      setNewFieldLabel("");
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteField = async (type, key) => {
    if (!window.confirm("이 항목을 삭제하시겠습니까?")) return;

    try {
      if (type === "pay") {
        const nextPay = payFields.filter((f) => f.key !== key);
        setPayFields(nextPay);
        await setDoc(configDoc, { payFields: nextPay }, { merge: true });
      } else {
        const nextDed = dedFields.filter((f) => f.key !== key);
        setDedFields(nextDed);
        await setDoc(configDoc, { dedFields: nextDed }, { merge: true });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRenameField = async (type, key) => {
    const list = type === "pay" ? payFields : dedFields;
    const target = list.find((f) => f.key === key);
    if (!target) return;
    const nextLabelRaw = window.prompt("항목명을 수정하세요.", target.label);
    if (nextLabelRaw == null) return;
    const label = nextLabelRaw.trim();
    if (!label) return;

    try {
      const updated = list.map((f) =>
        f.key === key ? { ...f, label } : f
      );
      if (type === "pay") {
        setPayFields(updated);
        await setDoc(configDoc, { payFields: updated }, { merge: true });
      } else {
        setDedFields(updated);
        await setDoc(configDoc, { dedFields: updated }, { merge: true });
      }
    } catch (e) {
      console.error(e);
    }
  };

  /** 급여/공제 표시 레이아웃 (한 줄 6개) */
  const PAY_COLS = 6;
  const DED_COLS = 6;
  const payRowCount = Math.max(1, Math.ceil(payFields.length / PAY_COLS));
  const dedRowCount = Math.max(1, Math.ceil(dedFields.length / DED_COLS));
  const fieldRowCount = Math.max(payRowCount, dedRowCount);

  /** 🔁 이월 버튼: 현재 월 금액 → 다음 달(12월이면 다음 해 1월)로 이월 */
  const handleCarryOver = async () => {
    const srcYear = year;
    const srcMonth = month;
    const targetYear = srcMonth === 12 ? srcYear + 1 : srcYear;
    const targetMonth = srcMonth === 12 ? 1 : srcMonth + 1;

    if (!Object.keys(rows).length) {
      window.alert("이월할 데이터가 없습니다.");
      return;
    }

    const ok = window.confirm(
      `${srcYear}년 ${srcMonth}월 급여 데이터를 ${targetYear}년 ${targetMonth}월로 이월하시겠습니까?\n(기본급여/제수당, 공제액 및 합계 금액이 이월됩니다.)`
    );
    if (!ok) return;

    try {
      const yRef = doc(db, "payroll", String(targetYear));
      const mCol = collection(yRef, "months");
      const targetRowsCol = collection(doc(mCol, pad2(targetMonth)), "rows");

      const batch = writeBatch(db);

      Object.entries(rows).forEach(([empId, r]) => {
        const ref = doc(targetRowsCol, String(empId));
        const payload = {
          empId,
        };

        // 급여/공제 금액 이월 (음수 포함)
        payFields.forEach((f) => {
          payload[f.key] = toNum(r[f.key]);
        });
        dedFields.forEach((f) => {
          payload[f.key] = toNum(r[f.key]);
        });

        const gross = payFields.reduce(
          (sum, f) => sum + toNum(payload[f.key]),
          0
        );
        const ded = dedFields.reduce(
          (sum, f) => sum + toNum(payload[f.key]),
          0
        );
        payload.grossTotal = Math.round(gross);
        payload.dedTotal = Math.round(ded);
        payload.netPay = Math.round(gross - ded);

        batch.set(ref, payload, { merge: true });
      });

      await batch.commit();
      window.alert(
        `${targetYear}년 ${targetMonth}월로 이월이 완료되었습니다.`
      );
    } catch (e) {
      console.error(e);
      window.alert("이월 중 오류가 발생했습니다. 콘솔을 확인해주세요.");
    }
  };

  return (
    <div className="pb-wrap">
      <div className="pb-toolbar">
        <div className="pb-controls">
          <label className="pb-label">연도</label>
          <select
            className="pb-select"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>

          <div className="pb-months">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button
                key={m}
                className={`pb-month ${m === month ? "on" : ""}`}
                onClick={() => setMonth(m)}
              >
                {m}월
              </button>
            ))}
          </div>
        </div>

        <div className="pb-actions">
          {/* ▶ 버튼 순서: 추가 → 수정 → 이월 → 통계 */}
          <button
            className="pb-btn pb-btn-add"
            onClick={() => setFieldModalOpen(true)}
          >
            + 항목 추가
          </button>
          <button
            className={`pb-btn pb-btn-edit ${editMode ? "on" : ""}`}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? "수정 종료" : "수정 모드"}
          </button>
          <button
            className="pb-btn pb-btn-carry"
            onClick={handleCarryOver}
          >
            이월
          </button>
          <button className="pb-btn pb-btn-stats" onClick={loadYearStats}>
            <span className="pb-btn-stats-dot" />
            연도별 총 급여 지급내역
          </button>
        </div>
      </div>

      <div className="pb-paper">
        <div className="pb-title">
          {year}년 {month}월분 급여대장
        </div>

        <div className="pb-table-wrap">
          <table className="pb-table">
            <thead>
              <tr className="hdr-1">
                {/* 인적 사항 / 근무 / 합계 헤더 */}
                <th
                  rowSpan={1 + fieldRowCount}
                  className="hdr-block auto empno-cell col-empno"
                >
                  <span className="th-multi">
                    사원
                    <br />
                    번호
                  </span>
                </th>
                <th
                  rowSpan={1 + fieldRowCount}
                  className="hdr-block auto col-dept"
                >
                  부서명
                </th>
                <th
                  rowSpan={1 + fieldRowCount}
                  className="hdr-block auto col-name"
                >
                  성명
                </th>

                <th
                  rowSpan={1 + fieldRowCount}
                  className="hdr-block col-workdays"
                >
                  근무일수
                </th>
                <th
                  rowSpan={1 + fieldRowCount}
                  className="hdr-block col-workhours"
                >
                  근무시간
                </th>

                <th colSpan={PAY_COLS} className="hdr-block col-pay-group">
                  기본급여 및 제수당
                </th>

                <th
                  rowSpan={1 + fieldRowCount}
                  className="sum gross col-gross"
                >
                  지급합계
                </th>

                <th colSpan={DED_COLS} className="hdr-block col-ded-group">
                  공제액
                </th>

                <th
                  rowSpan={1 + fieldRowCount}
                  className="sum ded-total col-dedtotal"
                >
                  공제 합계
                </th>
                <th
                  rowSpan={1 + fieldRowCount}
                  className="sum net col-net"
                >
                  차인지급액
                </th>
              </tr>

              {/* 급여/공제 항목 라벨: 한 줄당 6개씩 */}
              {Array.from({ length: fieldRowCount }).map((_, rowIdx) => {
                const paySlice = payFields.slice(
                  rowIdx * PAY_COLS,
                  rowIdx * PAY_COLS + PAY_COLS
                );
                const dedSlice = dedFields.slice(
                  rowIdx * DED_COLS,
                  rowIdx * DED_COLS + DED_COLS
                );
                return (
                  <tr key={rowIdx} className="hdr-2">
                    {Array.from({ length: PAY_COLS }).map((__, i) => {
                      const f = paySlice[i];
                      const isLast = i === PAY_COLS - 1;
                      return (
                        <th
                          key={`pay-h-${rowIdx}-${i}`}
                          className={`pay ${isLast ? "col-pay-last" : "col-pay"}`}
                        >
                          {f ? f.label : ""}
                        </th>
                      );
                    })}
                    {Array.from({ length: DED_COLS }).map((__, i) => {
                      const f = dedSlice[i];
                      const isFirst = i === 0;
                      return (
                        <th
                          key={`ded-h-${rowIdx}-${i}`}
                          className={`ded ${
                            isFirst ? "col-ded-first" : "col-ded"
                          }`}
                        >
                          {f ? f.label : ""}
                        </th>
                      );
                    })}
                  </tr>
                );
              })}
            </thead>

            <tbody>
              {sortedEmployees.map((e) => {
                const r = rows[e.id] || {};
                const rowSpan = fieldRowCount;

                return Array.from({ length: fieldRowCount }).map((_, rowIdx) => {
                  const paySlice = payFields.slice(
                    rowIdx * PAY_COLS,
                    rowIdx * PAY_COLS + PAY_COLS
                  );
                  const dedSlice = dedFields.slice(
                    rowIdx * DED_COLS,
                    rowIdx * DED_COLS + DED_COLS
                  );

                  return (
                    <tr
                      key={`${e.id}-${rowIdx}`}
                      className={`emp-row ${
                        rowIdx === 0 ? "emp-row-first" : ""
                      }`}
                    >
                      {/* 인적사항 & 근무 (첫 줄에만, rowSpan으로 묶음) */}
                      {rowIdx === 0 && (
                        <>
                          <td
                            className="auto empno-cell col-empno"
                            rowSpan={rowSpan}
                          >
                            {e.empNo || ""}
                          </td>
                          <td className="auto col-dept" rowSpan={rowSpan}>
                            {e.dept || ""}
                          </td>
                          <td className="auto col-name" rowSpan={rowSpan}>
                            {e.name || ""}
                          </td>

                          <td className="edit col-workdays" rowSpan={rowSpan}>
                            <EditableCell
                              type="number"
                              value={r.workDays}
                              onCommit={(v) => updateCell(e.id, "workDays", v)}
                              placeholder="0"
                              editable={editMode}
                              colKey="workDays"
                              colIndex="workDays"
                            />
                          </td>
                          <td className="edit col-workhours" rowSpan={rowSpan}>
                            <EditableCell
                              type="number"
                              value={r.workHours}
                              onCommit={(v) =>
                                updateCell(e.id, "workHours", v)
                              }
                              placeholder="0"
                              editable={editMode}
                              colKey="workHours"
                              colIndex="workHours"
                            />
                          </td>
                        </>
                      )}

                      {/* 급여 항목 (한 줄당 최대 6개) */}
                      {Array.from({ length: PAY_COLS }).map((__, i) => {
                        const f = paySlice[i];
                        const key = f ? f.key : null;
                        const val = key ? r[key] : null;
                        const isLast = i === PAY_COLS - 1;
                        const extraClass =
                          " col-pay" + (isLast ? " col-pay-last" : "");
                        return (
                          <td
                            key={`pay-${e.id}-${rowIdx}-${i}`}
                            className={`edit pay${extraClass}`}
                          >
                            {f ? (
                              <EditableCell
                                type="number"
                                value={val}
                                onCommit={(v) => updateCell(e.id, key, v)}
                                placeholder="0"
                                editable={editMode}
                                colKey={key}
                                colIndex={`pay-${i}`}
                              />
                            ) : null}
                          </td>
                        );
                      })}

                      {/* 지급합계 (첫 줄만 표시, 세로로 합치기) */}
                      {rowIdx === 0 && (
                        <td className="sum gross col-gross" rowSpan={rowSpan}>
                          {WONS(r.grossTotal)}
                        </td>
                      )}

                      {/* 공제 항목 (한 줄당 최대 6개) */}
                      {Array.from({ length: DED_COLS }).map((__, i) => {
                        const f = dedSlice[i];
                        const key = f ? f.key : null;
                        const val = key ? r[key] : null;
                        const isFirst = i === 0;
                        const extraClass =
                          " col-ded" + (isFirst ? " col-ded-first" : "");
                        return (
                          <td
                            key={`ded-${e.id}-${rowIdx}-${i}`}
                            className={`edit ded${extraClass}`}
                          >
                            {f ? (
                              <EditableCell
                                type="number"
                                value={val}
                                onCommit={(v) => updateCell(e.id, key, v)}
                                placeholder="0"
                                editable={editMode}
                                colKey={key}
                                colIndex={`ded-${i}`}
                              />
                            ) : null}
                          </td>
                        );
                      })}

                      {/* 공제 합계 / 차인지급액 (첫 줄만 표시) */}
                      {rowIdx === 0 && (
                        <>
                          <td
                            className="sum ded-total col-dedtotal"
                            rowSpan={rowSpan}
                          >
                            {WONS(r.dedTotal)}
                          </td>
                          <td className="sum net col-net" rowSpan={rowSpan}>
                            {WONS(r.netPay)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                });
              })}
            </tbody>

            {/* 합계 행 (필드 줄 수만큼 여러 줄) */}
            <tfoot>
              {Array.from({ length: fieldRowCount }).map((_, rowIdx) => {
                const paySlice = payFields.slice(
                  rowIdx * PAY_COLS,
                  rowIdx * PAY_COLS + PAY_COLS
                );
                const dedSlice = dedFields.slice(
                  rowIdx * DED_COLS,
                  rowIdx * DED_COLS + DED_COLS
                );

                return (
                  <tr
                    key={`total-${rowIdx}`}
                    className={`total-row ${rowIdx > 0 ? "sub" : ""}`}
                  >
                    {/* 인적사항/근무 합계: 근무일수/근무시간 합계는 표시하지 않고 병합 */}
                    {rowIdx === 0 && (
                      <>
                        <td
                          className="sum-cell left-total col-empno"
                          colSpan={5}
                          rowSpan={fieldRowCount}
                        >
                          합계 (총 {sortedEmployees.length}명)
                        </td>
                      </>
                    )}

                    {/* 급여 항목 합계 (해당 줄에 해당하는 6개) */}
                    {Array.from({ length: PAY_COLS }).map((__, i) => {
                      const f = paySlice[i];
                      const sum = f
                        ? Object.values(rows).reduce(
                            (s, r) => s + toNum(r[f.key]),
                            0
                          )
                        : 0;
                      const isLast = i === PAY_COLS - 1;
                      const extraClass =
                        " col-pay" + (isLast ? " col-pay-last" : "");
                      return (
                        <td
                          key={`pay-total-${rowIdx}-${i}`}
                          className={`sum-cell gray${extraClass}`}
                        >
                          {f ? WONS(sum) : ""}
                        </td>
                      );
                    })}

                    {/* 지급합계 총합 (첫 줄만) */}
                    {rowIdx === 0 && (
                      <td
                        className="sum gross col-gross"
                        rowSpan={fieldRowCount}
                      >
                        {WONS(
                          Object.values(rows).reduce(
                            (s, r) => s + toNum(r.grossTotal),
                            0
                          )
                        )}
                      </td>
                    )}

                    {/* 공제 항목 합계 (해당 줄에 해당하는 6개) */}
                    {Array.from({ length: DED_COLS }).map((__, i) => {
                      const f = dedSlice[i];
                      const sum = f
                        ? Object.values(rows).reduce(
                            (s, r) => s + toNum(r[f.key]),
                            0
                          )
                        : 0;
                      const isFirst = i === 0;
                      const extraClass =
                        " col-ded" + (isFirst ? " col-ded-first" : "");
                      return (
                        <td
                          key={`ded-total-${rowIdx}-${i}`}
                          className={`sum-cell gray${extraClass}`}
                        >
                          {f ? WONS(sum) : ""}
                        </td>
                      );
                    })}

                    {/* 공제 총합 / 차인지급 총합 (첫 줄만) */}
                    {rowIdx === 0 && (
                      <>
                        <td
                          className="sum ded-total col-dedtotal"
                          rowSpan={fieldRowCount}
                        >
                          {WONS(
                            Object.values(rows).reduce(
                              (s, r) => s + toNum(r.dedTotal),
                              0
                            )
                          )}
                        </td>
                        <td
                          className="sum net col-net"
                          rowSpan={fieldRowCount}
                        >
                          {WONS(
                            Object.values(rows).reduce(
                              (s, r) => s + toNum(r.netPay),
                              0
                            )
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tfoot>
          </table>
        </div>
      </div>

      {/* 연간 통계 모달 */}
      {statsOpen && (
        <div
          className="pb-modal"
          onClick={(e) => e.target === e.currentTarget && setStatsOpen(false)}
        >
          <div className="pb-modal-panel pb-modal-panel-stats">
            <div className="pb-modal-head pb-modal-head-stats">
              <div className="pb-modal-title">
                {year}년 급여지급 통계
                <span className="pb-modal-subtitle">
                  연간 지급 현황
                </span>
              </div>
              <button className="pb-close" onClick={() => setStatsOpen(false)}>
                ×
              </button>
            </div>
            <div className="pb-modal-body pb-modal-body-stats">
              <table className="pb-stats-table">
                <thead>
                  <tr>
                    <th>월</th>
                    <th>지급합계</th>
                    <th>공제합계</th>
                    <th>차인지급액</th>
                    <th className="w-graph">월별 추이</th>
                  </tr>
                </thead>
                <tbody>
                  {yearStats.map((it) => {
                    const max = Math.max(1, ...yearStats.map((x) => x.net));
                    const width = Math.round((it.net / max) * 100);
                    return (
                      <tr key={it.month}>
                        <td>{it.month}월</td>
                        <td className="num">{WONS(it.gross)}</td>
                        <td className="num">{WONS(it.ded)}</td>
                        <td className="num hi">{WONS(it.net)}</td>
                        <td>
                          <div className="bar">
                            <div
                              className="bar-fill"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {/* 합계 행 */}
                  <tr className="stats-total-row">
                    <td>합계</td>
                    <td className="num">{WONS(totalGross)}</td>
                    <td className="num">{WONS(totalDed)}</td>
                    <td className="num hi">{WONS(totalNet)}</td>
                    <td>
                      <div className="bar bar-total">
                        <div className="bar-fill" style={{ width: "100%" }} />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* 하단 닫기 버튼 없음 */}
          </div>
        </div>
      )}

      {/* 필드 추가 모달 */}
      {fieldModalOpen && (
        <div
          className="pb-modal"
          onClick={(e) =>
            e.target === e.currentTarget && setFieldModalOpen(false)
          }
        >
          <div className="pb-modal-panel pb-field-panel">
            <div className="pb-modal-head pb-modal-head-field">
              <div className="pb-modal-title">
                급여/공제 항목 설정
              </div>
              <button
                className="pb-close"
                onClick={() => setFieldModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="pb-modal-body pb-field-body">
              <div className="pb-field-type-tabs">
                <button
                  className={`pb-field-type ${
                    fieldType === "pay" ? "on" : ""
                  }`}
                  onClick={() => setFieldType("pay")}
                >
                  급여목록
                </button>
                <button
                  className={`pb-field-type ${
                    fieldType === "ded" ? "on" : ""
                  }`}
                  onClick={() => setFieldType("ded")}
                >
                  공제
                </button>
              </div>

              <div className="pb-field-current">
                <div className="pb-field-label">
                  현재 설정된 목록
                  <span className="pb-field-count">
                    (
                    {fieldType === "pay"
                      ? payFields.length
                      : dedFields.length}
                    개)
                  </span>
                </div>
                <div className="pb-field-list">
                  {(fieldType === "pay" ? payFields : dedFields).map((f) => (
                    <span key={f.key} className="pb-field-chip">
                      <span className="pb-field-chip-label">{f.label}</span>
                      <span className="pb-field-chip-actions">
                        <button
                          type="button"
                          className="pb-field-chip-btn edit"
                          onClick={() =>
                            handleRenameField(fieldType, f.key)
                          }
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="pb-field-chip-btn del"
                          onClick={() =>
                            handleDeleteField(fieldType, f.key)
                          }
                        >
                          삭제
                        </button>
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="pb-field-add-row">
                <input
                  className="pb-field-input"
                  placeholder={
                    fieldType === "pay"
                      ? "추가할 급여 항목명을 입력하세요."
                      : "추가할 공제 항목명을 입력하세요."
                  }
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddField();
                    }
                  }}
                />
                <button
                  className="pb-btn pb-field-add-btn"
                  onClick={handleAddField}
                >
                  추가
                </button>
              </div>
            </div>
            {/* 하단 닫기 버튼 없음 */}
          </div>
        </div>
      )}
    </div>
  );
}
