import React, { useEffect, useMemo, useState } from "react";
import "./AnnualSheetPage.css";
import { getStorage, ref as sRef, getBytes } from "firebase/storage";

/* ── 유틸 ── */
const td = new TextDecoder("utf-8");
const zpad2 = (n) => String(n).padStart(2, "0");
const fmtWon = (n) => (Number(n) || 0).toLocaleString("ko-KR");
const ymd = (d) => (String(d || "").split("T")[0] || d || "");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const toNum = (v) => {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

const readJson = async (storage, path) => {
  try {
    const ab = await getBytes(sRef(storage, path));
    const text = td.decode(ab);
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const toMonthKey = (year, m) => `${year}-${zpad2(m)}`;
const sum = (arr, pick = (x) => x) => arr.reduce((s, v) => s + toNum(pick(v)), 0);

/* ========= 정규화 ========= */
function normalizeIncomeFromStorageJson(json) {
  const rows = [];
  const push = (r, dateOverride) => {
    const date = ymd(dateOverride ?? r.date);
    const category = r.category || r.main || r.mainCategory || r.type || "";
    const amount = toNum(r.inAmt ?? r.amount);
    const memo = r.memo || r.record || r.desc || r.content || "";
    if (date) rows.push({ date, category, amount, memo });
  };
  if (json && typeof json === "object") {
    if (Array.isArray(json.items)) json.items.forEach((r) => push(r));
    else if (json.items && typeof json.items === "object") Object.values(json.items).forEach((r) => push(r));
    if (json.days && typeof json.days === "object") {
      for (const d of Object.keys(json.days)) {
        const list = Array.isArray(json.days[d]?.rows) ? json.days[d].rows : [];
        list.forEach((r) => push(r, d));
      }
    }
  }
  return rows;
}

/* ✅ 결제방법 정규화: 다양한 표기를 6개 표준 라벨로 통일 */
const PAY_LABELS = ["356계좌","352계좌","지로계좌","선수금계좌","기업카드","현금"];
function normalizePayLabel(v) {
  const txt = String(v || "").trim();
  if (!txt) return "";
  const t = txt.toLowerCase();

  // 숫자/키워드 포착
  if (t.includes("356")) return "356계좌";
  if (t.includes("352")) return "352계좌";

  if (t.includes("지로")) return "지로계좌";
  if (t.includes("선수")) return "선수금계좌";

  if (t.includes("기업카드") || t.includes("법인카드") || t.includes("카드")) return "기업카드";

  if (t === "현" || t.includes("현금")) return "현금";

  // 정확히 이미 표준 라벨이면 그대로
  if (PAY_LABELS.includes(txt)) return txt;

  return ""; // 인식 실패
}

/* ✅ 메모/내용에서 보조 추정 */
function inferPayFromText(r) {
  const txt = [r?.memo, r?.desc, r?.record, r?.content, r?.note]
    .map(v => String(v || "")).join(" ");
  return normalizePayLabel(txt);
}

/* ✅ 우선순위: 출금방법 > 결제방법 > 기타 동의어들 */
function pickPayField(r) {
  const direct =
    r?.["출금방법"] ?? r?.["결제방법"] ??
    r?.payMethod ?? r?.paymentMethod ?? r?.payment ?? r?.method ?? r?.pay;
  return direct;
}

function normalizeExpenseFromStorageJson(json) {
  const rows = [];
  const pick = (r, ks) => {
    for (const k of ks) if (r && r[k] != null && r[k] !== "") return r[k];
    return "";
  };
  const push = (r, dateOverride) => {
    const date = ymd(dateOverride ?? r.date);
    const big = pick(r, ["mainName","대분류","main","mainCategory","big","category"]) || "(미지정)";
    const sub = pick(r, ["subName","소분류","sub","subCategory","smallCategory"]) || "(소분류없음)";
    const amount = toNum(r.amount ?? r.outAmt);
    const memo = r.memo || r.record || r.desc || r.content || "";

    // ✅ 1) 저장된 출금/결제 방법을 최우선 사용 → 표준 라벨로 정규화
    let pay = normalizePayLabel(pickPayField(r));

    // ✅ 2) 없으면 메모/내용에서 보조 추정
    if (!pay) pay = inferPayFromText(r);

    if (date) rows.push({ date, big, sub, amount, memo, payMethod: pay });
  };
  if (json && typeof json === "object") {
    if (Array.isArray(json.items)) json.items.forEach((r) => push(r));
    else if (json.items && typeof json.items === "object") Object.values(json.items).forEach((r) => push(r));
    if (json.days && typeof json.days === "object") {
      for (const d of Object.keys(json.days)) {
        const list = Array.isArray(json.days[d]?.rows) ? json.days[d].rows : [];
        list.forEach((r) => push(r, d));
      }
    }
  }
  return rows;
}

/* 수입: 카테고리 월별 합계 [{category,total,months[12]}] */
function categoryMonthMatrix(rows) {
  const map = new Map();
  for (const r of rows) {
    const m = Number((r.date || "").slice(5, 7)) || 0;
    if (!m) continue;
    const key = r.category || "(미지정)";
    if (!map.has(key)) map.set(key, { total: 0, months: Array(12).fill(0) });
    const obj = map.get(key);
    obj.total += toNum(r.amount);
    obj.months[m - 1] += toNum(r.amount);
  }
  return Array.from(map.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.total - a.total);
}

/* 지출: 대분류/소분류 월별 합계 [{big, rows:[{sub,total,months[12]}], total, months}] */
function expenseBigSubGroups(rows) {
  const map = new Map(); // big -> sub -> {total, months[12]}
  for (const r of rows) {
    const m = Number((r.date || "").slice(5, 7)) || 0;
    if (!m) continue;
    const big = r.big || "(미지정)";
    const sub = r.sub || "(소분류없음)";
    if (!map.has(big)) map.set(big, new Map());
    const subMap = map.get(big);
    if (!subMap.has(sub)) subMap.set(sub, { total: 0, months: Array(12).fill(0) });
    const obj = subMap.get(sub);
    obj.total += toNum(r.amount);
    obj.months[m - 1] += toNum(r.amount);
  }
  // to array + big별 months 합계 계산
  const groups = [];
  map.forEach((subMap, big) => {
    const rowsArr = [];
    const bigMonths = Array(12).fill(0);
    subMap.forEach((data, sub) => {
      rowsArr.push({ sub, ...data });
      data.months.forEach((v, i) => (bigMonths[i] += toNum(v)));
    });
    rowsArr.sort((a, b) => b.total - a.total);
    const bigTotal = rowsArr.reduce((s, r) => s + toNum(r.total), 0);
    groups.push({ big, rows: rowsArr, total: bigTotal, months: bigMonths });
  });
  groups.sort((a, b) => String(a.big).localeCompare(String(b.big)));
  return groups;
}

/* ✅ 결제방법 월별 합계: 저장된 라벨(정규화된 6개)만 집계 */
function paymentMethodMatrix(rows){
  const map = new Map(PAY_LABELS.map(n=>[n,{ total:0, months:Array(12).fill(0) }]));
  for(const r of rows){
    const m = Number((r.date || "").slice(5,7)) || 0;
    if(!m) continue;
    const key = normalizePayLabel(r.payMethod || ""); // 이미 정규화되어 있어도 재확인
    if(!key) continue;
    const obj = map.get(key);
    obj.total += toNum(r.amount);
    obj.months[m-1] += toNum(r.amount);
  }
  return Array.from(map.entries()).map(([name, data]) => ({ name, ...data }));
}

/* ================= SVG 차트 ================= */
function AnnualChart({ income, expense }) {
  const width = 1400;
  const height = 340;
  const padL = 180;
  const padR = 2;
  const padT = 18;
  const padB = 38;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const maxVal = Math.max(
    1,
    ...income.map(toNum),
    ...expense.map(toNum),
    ...income.map((x, i) => Math.abs(toNum(x) - toNum(expense[i] || 0)))
  );
  const yScale = (v) => padT + innerH - (innerH * toNum(v)) / maxVal;
  const xStep = innerW / 12;

  const net = income.map((v, i) => toNum(v) - toNum(expense[i] || 0));
  const netPts = net.map((v, i) => [padL + xStep * (i + 0.5), yScale(Math.max(0, v))]);

  return (
    <svg className="as-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="월별 수입/지출/순수익">
      <g className="legend-left" transform={`translate(10, ${height - padB - 66})`}>
        <rect x="0" y="0" width="12" height="12" className="bar-inc" rx="2" />
        <text x="18" y="10" className="tick">수입</text>
        <rect x="0" y="22" width="12" height="12" className="bar-exp" rx="2" />
        <text x="18" y="32" className="tick">지출</text>
        <line x1="1" y1="54" x2="13" y2="54" className="line-net" />
        <circle cx="7" cy="54" r="2.5" className="net-point" />
        <text x="18" y="56" className="tick">순수익</text>
      </g>

      {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
        const y = padT + innerH * (1 - t);
        const val = Math.round(maxVal * t);
        return (
          <g key={`gy${idx}`}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} className="grid" />
            <text x={padL - 10} y={y} textAnchor="end" alignmentBaseline="middle" className="tick">
              {fmtWon(val)}
            </text>
          </g>
        );
      })}

      {[...Array(13).keys()].map((i) => {
        const x = padL + xStep * i;
        return <line key={`gx${i}`} x1={x} y1={padT} x2={x} y2={padT + innerH} className="grid-v" />;
      })}

      {income.map((v, i) => {
        const x = padL + xStep * i + xStep * 0.10;
        const w = xStep * 0.28;
        const y = yScale(v);
        const h = padT + innerH - y;
        return <rect key={`inc${i}`} x={x} y={y} width={w} height={h} className="bar-inc" rx="4" />;
      })}
      {expense.map((v, i) => {
        const x = padL + xStep * i + xStep * 0.60;
        const w = xStep * 0.28;
        const y = yScale(v);
        const h = padT + innerH - y;
        return <rect key={`exp${i}`} x={x} y={y} width={w} height={h} className="bar-exp" rx="4" />;
      })}

      <polyline points={netPts.map(([x, y]) => `${x},${y}`).join(" ")} className="line-net" fill="none" />
      {netPts.map(([x, y], i) => <circle key={`netp${i}`} cx={x} cy={y} r="3.5" className="net-point" />)}

      {MONTH_LABELS.map((m, i) => (
        <text key={m} x={padL + xStep * (i + 0.5)} y={height - 12} textAnchor="middle" className="tick">
          {m}
        </text>
      ))}
    </svg>
  );
}

/* ============ 메인 ============ */
export default function AnnualSheetPage() {
  const storage = getStorage();
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [incomeRows, setIncomeRows] = useState([]);
  const [expenseRows, setExpenseRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const months = Array.from({ length: 12 }, (_, i) => i + 1);
        const incPromises = months.map((m) => readJson(storage, `acct_income_json/${toMonthKey(year, m)}.json`));
        const expPromises = months.map((m) => readJson(storage, `acct_expense_json/${toMonthKey(year, m)}.json`));
        const [incs, exps] = await Promise.all([Promise.all(incPromises), Promise.all(expPromises)]);
        if (cancelled) return;

        const incAll = incs.flatMap((j) => normalizeIncomeFromStorageJson(j));
        const expAll = exps.flatMap((j) => normalizeExpenseFromStorageJson(j));

        const prefix = String(year) + "-";
        setIncomeRows(incAll.filter((r) => String(r.date).startsWith(prefix)));
        setExpenseRows(expAll.filter((r) => String(r.date).startsWith(prefix)));
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("연간 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [year, storage]);

  const monthIncome = useMemo(() => {
    const arr = Array(12).fill(0);
    for (const r of incomeRows) {
      const m = Number((r.date || "").slice(5, 7)) || 0;
      if (m) arr[m - 1] += toNum(r.amount);
    }
    return arr;
  }, [incomeRows]);

  const monthExpense = useMemo(() => {
    const arr = Array(12).fill(0);
    for (const r of expenseRows) {
      const m = Number((r.date || "").slice(5, 7)) || 0;
      if (m) arr[m - 1] += toNum(r.amount);
    }
    return arr;
  }, [expenseRows]);

  const totalIncome = useMemo(() => sum(monthIncome), [monthIncome]);
  const totalExpense = useMemo(() => sum(monthExpense), [monthExpense]);
  const netIncome = totalIncome - totalExpense;

  const incomeMatrix = useMemo(() => categoryMonthMatrix(incomeRows), [incomeRows]);
  const expenseGroups = useMemo(() => expenseBigSubGroups(expenseRows), [expenseRows]);
  const payMethodMatrix = useMemo(() => paymentMethodMatrix(expenseRows), [expenseRows]); /* ✅ */

  const summaryRows = useMemo(() => {
    const rows = [
      { label: "수입", values: monthIncome, className: "sum-inc" },
      { label: "지출", values: monthExpense, className: "sum-exp" },
      { label: "순수익", values: monthIncome.map((v, i) => toNum(v) - toNum(monthExpense[i] || 0)), className: "sum-net" },
      {
        label: "수익률",
        values: monthIncome.map((v, i) => {
          const inc = toNum(v), exp = toNum(monthExpense[i] || 0);
          if (inc === 0) return 0;
          return clamp(Math.round(((inc - exp) / inc) * 100), -999, 999);
        }),
        isPercent: true,
        className: "sum-rate",
      },
    ];
    return rows;
  }, [monthIncome, monthExpense]);

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 6 }, (_, i) => y - i);
  }, [now]);

  /* 수입정리 월별 합계 (tfoot) */
  const incomeMonthTotals = useMemo(()=>{
    const arr = Array(12).fill(0);
    incomeMatrix.forEach(row => row.months.forEach((v,i)=> arr[i]+=toNum(v)));
    return arr;
  },[incomeMatrix]);
  const incomeGrandTotal = useMemo(()=>sum(incomeMonthTotals),[incomeMonthTotals]);
  const incomeMonthlyAvg = useMemo(()=>Math.round(incomeGrandTotal/12),[incomeGrandTotal]);

  return (
    <div className="as-wrap">
      {/* 헤더 */}
      <header className="as-header fancy">
        <div className="as-year">
          <span className="as-year-num glam-year">{year}</span>
          <span className="as-year-sub glam-sub">Annual Closing</span>
        </div>

        {/* KPI */}
        <div className="as-metrics glam-metrics">
          <div className="metric inc glam-card">
            <div className="m-title glam-title">
              <i className="ri-arrow-up-circle-line" aria-hidden="true" />
              총 수입
            </div>
            <div className="m-value glam-value nowrap">₩ {fmtWon(totalIncome)}</div>
          </div>
          <div className="metric exp glam-card">
            <div className="m-title glam-title">
              <i className="ri-arrow-down-circle-line" aria-hidden="true" />
              총 지출
            </div>
            <div className="m-value glam-value nowrap">₩ {fmtWon(totalExpense)}</div>
          </div>
          <div className={`metric net glam-card ${netIncome >= 0 ? "good" : "bad"}`}>
            <div className="m-title glam-title">
              <i className="ri-line-chart-line" aria-hidden="true" />
              순 수익
            </div>
            <div className="m-value glam-value nowrap">₩ {fmtWon(netIncome)}</div>
          </div>
        </div>

        {/* 연도 선택 */}
        <div className="as-controls glam-controls">
          <label className="year-select glam-select">
            <span className="sel-label">연도</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* 차트 */}
      <section className="as-section">
        <div className="as-sec-title glam-sec">월별 수입 / 지출 / 순수익</div>
        <div className="as-chart-card">
          <AnnualChart income={monthIncome} expense={monthExpense} />
        </div>
      </section>

      {/* 요약표 */}
      <section className="as-section">
        <div className="as-sec-title glam-sec">수입/지출/순수익/수익률 정리</div>
        <div className="as-table-card">
          <div className="as-table-wrap">
            <table className="as-table sticky as-summary">
              <thead>
                <tr>
                  <th style={{width:180}}>항목</th>
                  <th className="num total">합계</th>
                  {MONTH_LABELS.map((m) => <th key={m} className="num">{m}</th>)}
                  <th className="num">월평균</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row) => {
                  const total = sum(row.values);
                  const avg = Math.round(total / 12);
                  return (
                    <tr key={row.label} className={row.className}>
                      <td className="label nowrap">{row.label}</td>
                      <td className="num total nowrap m-num-sm">{row.isPercent ? `${total}%` : `₩ ${fmtWon(total)}`}</td>
                      {row.values.map((v, i) => (
                        <td key={i} className="num nowrap m-num-sm">
                          {row.isPercent ? `${v}%` : `₩ {fmtWon(v)}`.replace("{fmtWon(v)}", fmtWon(v))}
                        </td>
                      ))}
                      <td className="num nowrap m-num-sm">{row.isPercent ? `${avg}%` : `₩ ${fmtWon(avg)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 수입 정리 */}
      <section className="as-section">
        <div className="as-sec-title glam-sec">수입 정리</div>
        <div className="as-table-card">
          <div className="as-table-wrap">
            <table className="as-table sticky as-income">
              <thead>
                <tr>
                  <th style={{width:180}}>분류</th>
                  <th className="num total">합계</th>
                  {MONTH_LABELS.map((m) => <th key={m} className="num">{m}</th>)}
                  <th className="num">평균</th>
                </tr>
              </thead>
              <tbody>
                {incomeMatrix.map((row) => {
                  const avg = Math.round(toNum(row.total) / 12);
                  return (
                    <tr key={row.category}>
                      <td className="label nowrap">{row.category}</td>
                      <td className="num total nowrap m-num-sm">₩ {fmtWon(row.total)}</td>
                      {row.months.map((v, i) => (
                        <td key={i} className="num nowrap m-num-sm">₩ {fmtWon(v)}</td>
                      ))}
                      <td className="num nowrap m-num-sm">₩ {fmtWon(avg)}</td>
                    </tr>
                  );
                })}
                {!incomeMatrix.length && (
                  <tr>
                    <td colSpan={15} className="empty">표시할 수입 데이터가 없습니다.</td>
                  </tr>
                )}
              </tbody>
              {/* 월별 합계(tfoot) */}
              <tfoot>
                <tr>
                  <td className="label nowrap">월별 합계</td>
                  <td className="num total nowrap m-num-sm">₩ {fmtWon(incomeGrandTotal)}</td>
                  {incomeMonthTotals.map((v,i)=>(
                    <td key={i} className="num nowrap m-num-sm">₩ {fmtWon(v)}</td>
                  ))}
                  <td className="num nowrap m-num-sm">₩ {fmtWon(incomeMonthlyAvg)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      {/* 지출 정리 */}
      <section className="as-section">
        <div className="as-sec-title glam-sec">지출 정리</div>
        <div className="as-table-card">
          <div className="as-table-wrap">
            <table className="as-table sticky as-expense">
              <thead>
                <tr>
                  <th style={{width:180}}>대분류</th>
                  <th style={{width:180}}>소분류</th>
                  <th className="num total">합계</th>
                  {MONTH_LABELS.map((m) => <th key={m} className="num">{m}</th>)}
                  <th className="num">평균</th>
                </tr>
              </thead>
              <tbody>
                {expenseGroups.map((g, gi) => {
                  if (!g.rows.length) {
                    return (
                      <tr key={`g_${gi}`}>
                        <td className="label nowrap">{g.big}</td>
                        <td className="label nowrap">-</td>
                        <td className="num total nowrap m-num-sm">₩ 0</td>
                        {MONTH_LABELS.map((_, i) => <td key={i} className="num nowrap m-num-sm">₩ 0</td>)}
                        <td className="num nowrap m-num-sm">₩ 0</td>
                      </tr>
                    );
                  }
                  const body = g.rows.map((r, idx) => {
                    const avg = Math.round(toNum(r.total) / 12);
                    return (
                      <tr key={`g_${gi}_${idx}`}>
                        {idx === 0 ? (
                          <td className="label nowrap" rowSpan={g.rows.length + 1 /* 소계 포함 */}>{g.big}</td>
                        ) : null}
                        <td className="label nowrap">{r.sub}</td>
                        <td className="num total nowrap m-num-sm">₩ {fmtWon(r.total)}</td>
                        {r.months.map((v, i) => (
                          <td key={i} className="num nowrap m-num-sm">₩ {fmtWon(v)}</td>
                        ))}
                        <td className="num nowrap m-num-sm">₩ {fmtWon(avg)}</td>
                      </tr>
                    );
                  });

                  const bigAvg = Math.round(toNum(g.total)/12);
                  body.push(
                    <tr key={`g_${gi}_subtotal`} className="as-subtotal">
                      <td className="label nowrap">합계</td>
                      <td className="num total nowrap m-num-sm">₩ {fmtWon(g.total)}</td>
                      {g.months.map((v,i)=>(
                        <td key={i} className="num nowrap m-num-sm">₩ {fmtWon(v)}</td>
                      ))}
                      <td className="num nowrap m-num-sm">₩ {fmtWon(bigAvg)}</td>
                    </tr>
                  );
                  return body;
                })}
                {!expenseGroups.length && (
                  <tr>
                    <td colSpan={16} className="empty">표시할 지출 데이터가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 지출 결제방법 (출금방법 기반) */}
      <section className="as-section">
        <div className="as-sec-title glam-sec">지출 결제방법</div>
        <div className="as-table-card">
          <div className="as-table-wrap">
            <table className="as-table sticky as-pay">
              <thead>
                <tr>
                  <th style={{width:180}}>분류</th>
                  <th className="num total">합계</th>
                  {MONTH_LABELS.map((m) => <th key={m} className="num">{m}</th>)}
                  <th className="num">평균</th>
                </tr>
              </thead>
              <tbody>
                {payMethodMatrix.map((row)=> {
                  const avg = Math.round(toNum(row.total)/12);
                  return (
                    <tr key={row.name}>
                      <td className="label nowrap">{row.name}</td>
                      <td className="num total nowrap m-num-sm">₩ {fmtWon(row.total)}</td>
                      {row.months.map((v,i)=>(
                        <td key={i} className="num nowrap m-num-sm">₩ {fmtWon(v)}</td>
                      ))}
                      <td className="num nowrap m-num-sm">₩ {fmtWon(avg)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {loading && (
        <div className="as-overlay">
          <div className="as-loader"><span className="spin" /> 불러오는 중…</div>
        </div>
      )}
      {!!error && (
        <div className="as-overlay err">
          <div className="as-loader"><i className="ri-alert-line" /> {error}</div>
        </div>
      )}
    </div>
  );
}
