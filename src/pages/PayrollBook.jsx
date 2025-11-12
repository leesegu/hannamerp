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
  updateDoc,
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
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const PAY_FIELDS = [
  { key: "basePay", label: "기본급" },
  { key: "bonus", label: "상여" },
  { key: "dutyAllowance", label: "업무수당" },
  { key: "carAllowance", label: "차량보조금" },
  { key: "positionAllowance", label: "직책수당" },
  { key: "longServiceAllowance", label: "근속수당" },
];
const DED_FIELDS = [
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
function EditableCell({ value, onCommit, placeholder, type = "text", className }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!editing) return;
    setDraft(type === "number" ? (value ? String(value) : "") : (value || ""));
  }, [editing, type, value]);

  const ref = useRef(null);

  const commit = () => {
    setEditing(false);
    if (type === "number") {
      onCommit?.(toNum(draft));
    } else {
      onCommit?.(draft.trim());
    }
  };

  return (
    <div
      className={`cell ${className || ""}`}
      onDoubleClick={() => setEditing(true)}
      onBlur={() => editing && commit()}
    >
      {editing ? (
        <input
          ref={ref}
          className="cell-input"
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setEditing(false);
            }
          }}
          placeholder={placeholder}
          autoFocus
        />
      ) : (
        <span className="cell-text">
          {type === "number" ? (value ? WONS(value) : "") : value || ""}
          {!value && <span className="placeholder">{placeholder || "더블클릭하여 입력"}</span>}
        </span>
      )}
    </div>
  );
}

export default function PayrollBook() {
  /** 선택된 연/월 */
  const [year, setYear] = useState(THIS_YEAR);
  const [month, setMonth] = useState(THIS_MONTH);

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
    for (let y = THIS_YEAR - 3; y <= THIS_YEAR + 1; y++) arr.push(y);
    return arr;
  }, []);

  /** 셀 값 변경 → 합계 재계산 → Firestore 반영 */
  const updateCell = async (empId, field, rawValue) => {
    const v =
      field.endsWith("Allowance") ||
      [
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
      ].includes(field)
        ? toNum(rawValue)
        : rawValue;

    const prev = rows[empId] || {};
    const next = { ...prev, [field]: v };

    // 합계 갱신
    const gross = PAY_FIELDS.reduce((sum, f) => sum + toNum(next[f.key]), 0);
    const ded = DED_FIELDS.reduce((sum, f) => sum + toNum(next[f.key]), 0);
    next.grossTotal = Math.round(gross);
    next.dedTotal = Math.round(ded);
    next.netPay = Math.max(0, Math.round(gross - ded));

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

  // 직원행 구성 (employees 기준으로 정렬)
  const sortedEmployees = useMemo(() => {
    const byNo = (a, b) => String(a.empNo || "").localeCompare(String(b.empNo || ""));
    return [...employees].sort(byNo);
  }, [employees]);

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
          <button className="pb-btn stats" onClick={loadYearStats}>
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
                <th rowSpan="2" className="idx">
                  No
                </th>
                <th colSpan="6" className="hdr-block">
                  인적 사항
                </th>
                <th colSpan="2" className="hdr-block">
                  근무
                </th>
                <th colSpan={PAY_FIELDS.length} className="hdr-block">
                  기본급여 및 제수당
                </th>
                <th rowSpan="2" className="sum gross">
                  지급합계
                </th>
                <th colSpan={DED_FIELDS.length} className="hdr-block">
                  공제 및 차인지급금액
                </th>
                <th rowSpan="2" className="sum net">
                  차인지급액
                </th>
                <th rowSpan="2" className="sign">
                  영수인
                </th>
              </tr>
              <tr className="hdr-2">
                <th className="auto">사원번호</th>
                <th className="auto">성명</th>
                <th className="auto">주민등록번호</th>
                <th className="auto">주소</th>
                <th className="auto">부서명</th>
                <th className="auto">입사일</th>

                <th>근무일수</th>
                <th>근무시간</th>

                {PAY_FIELDS.map((f) => (
                  <th key={f.key} className="pay">
                    {f.label}
                  </th>
                ))}

                {DED_FIELDS.map((f) => (
                  <th key={f.key} className="ded">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {sortedEmployees.map((e, idx) => {
                const r = rows[e.id] || {};
                return (
                  <tr key={e.id}>
                    <td className="idx">{idx + 1}</td>

                    {/* 인적사항 (자동) */}
                    <td className="auto">{e.empNo || ""}</td>
                    <td className="auto">{e.name || ""}</td>
                    <td className="auto">{e.resRegNo || ""}</td>
                    <td className="auto">{e.address || ""}</td>
                    <td className="auto">{e.dept || ""}</td>
                    <td className="auto">{e.joinDate || ""}</td>

                    {/* 근무 */}
                    <td className="edit">
                      <EditableCell
                        type="number"
                        value={r.workDays}
                        onCommit={(v) => updateCell(e.id, "workDays", v)}
                        placeholder="0"
                      />
                    </td>
                    <td className="edit">
                      <EditableCell
                        type="number"
                        value={r.workHours}
                        onCommit={(v) => updateCell(e.id, "workHours", v)}
                        placeholder="0"
                      />
                    </td>

                    {/* 급여 항목 (숫자 입력) */}
                    {PAY_FIELDS.map((f) => (
                      <td key={f.key} className="edit pay">
                        <EditableCell
                          type="number"
                          value={r[f.key]}
                          onCommit={(v) => updateCell(e.id, f.key, v)}
                          placeholder="0"
                        />
                      </td>
                    ))}

                    {/* 지급합계 (자동) */}
                    <td className="sum gross">{WONS(r.grossTotal)}</td>

                    {/* 공제 항목 */}
                    {DED_FIELDS.map((f) => (
                      <td key={f.key} className="edit ded">
                        <EditableCell
                          type="number"
                          value={r[f.key]}
                          onCommit={(v) => updateCell(e.id, f.key, v)}
                          placeholder="0"
                        />
                      </td>
                    ))}

                    {/* 차인지급액 (자동) */}
                    <td className="sum net">{WONS(r.netPay)}</td>

                    <td className="sign"></td>
                  </tr>
                );
              })}
            </tbody>

            {/* 합계 행 */}
            <tfoot>
              <tr className="total-row">
                <td className="idx" colSpan={1}>
                  합계 (총 {sortedEmployees.length}명)
                </td>
                <td colSpan={6}></td>
                <td className="sum-cell">
                  {WONS(Object.values(rows).reduce((s, r) => s + toNum(r.workDays), 0))}
                </td>
                <td className="sum-cell">
                  {WONS(Object.values(rows).reduce((s, r) => s + toNum(r.workHours), 0))}
                </td>

                {PAY_FIELDS.map((f) => (
                  <td key={f.key} className="sum-cell">
                    {WONS(Object.values(rows).reduce((s, r) => s + toNum(r[f.key]), 0))}
                  </td>
                ))}
                <td className="sum gross">
                  {WONS(Object.values(rows).reduce((s, r) => s + toNum(r.grossTotal), 0))}
                </td>
                {DED_FIELDS.map((f) => (
                  <td key={f.key} className="sum-cell gray">
                    {WONS(Object.values(rows).reduce((s, r) => s + toNum(r[f.key]), 0))}
                  </td>
                ))}
                <td className="sum net">
                  {WONS(Object.values(rows).reduce((s, r) => s + toNum(r.netPay), 0))}
                </td>
                <td className="sign"></td>
              </tr>
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
          <div className="pb-modal-panel">
            <div className="pb-modal-head">
              <div className="pb-modal-title">{year}년 급여지급 통계</div>
              <button className="pb-close" onClick={() => setStatsOpen(false)}>
                ×
              </button>
            </div>
            <div className="pb-modal-body">
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
                            <div className="bar-fill" style={{ width: `${width}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pb-modal-foot">
              <button className="pb-btn" onClick={() => setStatsOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
