import React, { useEffect, useMemo, useState } from "react";
import "./AnnualSheetPage.css";

/**
 * 연간시트 (Annual Sheet)
 * - 수입 JSON:   gs://.../acct_income_json/<YYYY-MM>.json
 * - 지출 JSON:   gs://.../acct_expense_json/<YYYY-MM>.json
 * - days / items 포맷 모두 지원
 * - 외부 차트 라이브러리 없이 SVG로 월별 막대(수입/지출) + 순수익 라인 표시
 */

import { getStorage, ref as sRef, getBytes } from "firebase/storage";

/* ============ 유틸 ============ */
const td = new TextDecoder("utf-8");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const zpad2 = (n) => String(n).padStart(2, "0");
const fmtWon = (n) => (Number(n) || 0).toLocaleString("ko-KR");
const ymd = (d) => (String(d || "").split("T")[0] || d || "");

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

/** Storage JSON → rows[{date,category,amount,memo}] 변환 */
function normalizeFromStorageJson(json) {
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json.items)) {
    return json.items.map((r) => ({
      date: ymd(r.date),
      category: r.category || "",
      amount: Number(r.amount) || 0,
      memo: r.memo || "",
    }));
  }
  if (json.days && typeof json.days === "object") {
    const rows = [];
    for (const d of Object.keys(json.days)) {
      const day = json.days[d] || {};
      const list = Array.isArray(day.rows) ? day.rows : [];
      list.forEach((r) =>
        rows.push({
          date: ymd(d),
          category: r.category || "",
          amount: Number(r.amount) || 0,
          memo: r.memo || "",
        })
      );
    }
    return rows;
  }
  return [];
}

const toMonthKey = (year, m) => `${year}-${zpad2(m)}`;
const sum = (arr, pick = (x) => x) => arr.reduce((s, v) => s + (Number(pick(v)) || 0), 0);

/* 카테고리별 월별 합계 맵 {category: { total, months[12] }} */
function categoryMonthMatrix(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!r.date) continue;
    const m = Number((r.date || "").slice(5, 7)) || 0;
    if (!m) continue;
    const key = r.category || "(미지정)";
    if (!map.has(key)) map.set(key, { total: 0, months: Array(12).fill(0) });
    const obj = map.get(key);
    obj.total += Number(r.amount) || 0;
    obj.months[m - 1] += Number(r.amount) || 0;
  }
  // 금액 순 정렬
  return Array.from(map.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.total - a.total);
}

/* ============ SVG Chart ============ */
function AnnualChart({ income, expense }) {
  // income/expense: number[12]
  const width = 1200;
  const height = 320;
  const padL = 60;
  const padR = 20;
  const padT = 20;
  const padB = 40;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const maxVal = Math.max(
    1,
    ...income,
    ...expense,
    ...income.map((x, i) => Math.abs(x - (expense[i] || 0)))
  );
  const yScale = (v) => padT + innerH - (innerH * v) / maxVal;
  const xStep = innerW / 12;

  // 순수익(수입-지출) 라인 좌표
  const net = income.map((v, i) => v - (expense[i] || 0));
  const netPts = net.map((v, i) => [padL + xStep * (i + 0.5), yScale(Math.max(0, v))]);

  return (
    <svg className="as-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="연간 수입/지출/순수익 차트">
      {/* grid y */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
        const y = padT + innerH * (1 - t);
        const val = Math.round(maxVal * t);
        return (
          <g key={idx}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} className="grid" />
            <text x={padL - 8} y={y} textAnchor="end" alignmentBaseline="middle" className="tick">
              {fmtWon(val)}
            </text>
          </g>
        );
      })}

      {/* bars */}
      {income.map((v, i) => {
        const x = padL + xStep * i + xStep * 0.05;
        const w = xStep * 0.35;
        const y = yScale(v);
        const h = padT + innerH - y;
        return <rect key={`inc${i}`} x={x} y={y} width={w} height={h} className="bar-inc" rx="4" />;
      })}
      {expense.map((v, i) => {
        const x = padL + xStep * i + xStep * 0.6;
        const w = xStep * 0.35;
        const y = yScale(v);
        const h = padT + innerH - y;
        return <rect key={`exp${i}`} x={x} y={y} width={w} height={h} className="bar-exp" rx="4" />;
      })}

      {/* net line */}
      <polyline
        points={netPts.map(([x, y]) => `${x},${y}`).join(" ")}
        className="line-net"
        fill="none"
      />
      {netPts.map(([x, y], i) => (
        <circle key={`netp${i}`} cx={x} cy={y} r="3.5" className="net-point" />
      ))}

      {/* x labels */}
      {MONTH_LABELS.map((m, i) => (
        <text
          key={m}
          x={padL + xStep * (i + 0.5)}
          y={height - 12}
          textAnchor="middle"
          className="tick"
        >
          {m}
        </text>
      ))}

      {/* legend */}
      <g className="legend" transform={`translate(${padL + 6}, ${padT + 8})`}>
        <rect x="0" y="-10" width="10" height="10" className="bar-inc" rx="2" />
        <text x="16" y="-2" className="tick">연간 수입</text>
        <rect x="96" y="-10" width="10" height="10" className="bar-exp" rx="2" />
        <text x="112" y="-2" className="tick">연간 지출</text>
        <line x1="200" y1="-5" x2="212" y2="-5" className="line-net"/>
        <text x="220" y="-2" className="tick">연간 순수익</text>
      </g>
    </svg>
  );
}

/* ============ 메인 컴포넌트 ============ */
export default function AnnualSheetPage() {
  const storage = getStorage();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [incomeRows, setIncomeRows] = useState([]);   // 12개월 전체 수입 rows
  const [expenseRows, setExpenseRows] = useState([]); // 12개월 전체 지출 rows

  // 연도 변경 시 12개월 JSON 병렬 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const months = Array.from({ length: 12 }, (_, i) => i + 1);
        const incPromises = months.map((m) =>
          readJson(storage, `acct_income_json/${toMonthKey(year, m)}.json`)
        );
        const expPromises = months.map((m) =>
          readJson(storage, `acct_expense_json/${toMonthKey(year, m)}.json`)
        );
        const [incs, exps] = await Promise.all([Promise.all(incPromises), Promise.all(expPromises)]);
        if (cancelled) return;

        const incAll = incs.flatMap((j) => normalizeFromStorageJson(j));
        const expAll = exps.flatMap((j) => normalizeFromStorageJson(j));

        // 선택한 연도 외의 date가 섞여있다면 필터 (예: 파일 형식이 items로 섞여 있을 때)
        const incFiltered = incAll.filter((r) => String(r.date).startsWith(String(year)));
        const expFiltered = expAll.filter((r) => String(r.date).startsWith(String(year)));

        setIncomeRows(incFiltered);
        setExpenseRows(expFiltered);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("연간 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [year, storage]);

  // 월별 합계
  const monthIncome = useMemo(() => {
    const arr = Array(12).fill(0);
    for (const r of incomeRows) {
      const m = Number((r.date || "").slice(5, 7)) || 0;
      if (m) arr[m - 1] += Number(r.amount) || 0;
    }
    return arr;
  }, [incomeRows]);

  const monthExpense = useMemo(() => {
    const arr = Array(12).fill(0);
    for (const r of expenseRows) {
      const m = Number((r.date || "").slice(5, 7)) || 0;
      if (m) arr[m - 1] += Number(r.amount) || 0;
    }
    return arr;
  }, [expenseRows]);

  const totalIncome = useMemo(() => sum(monthIncome), [monthIncome]);
  const totalExpense = useMemo(() => sum(monthExpense), [monthExpense]);
  const netIncome = totalIncome - totalExpense;

  // 카테고리 매트릭스 (수입/지출)
  const incomeMatrix = useMemo(() => categoryMonthMatrix(incomeRows), [incomeRows]);
  const expenseMatrix = useMemo(() => categoryMonthMatrix(expenseRows), [expenseRows]);

  // 월 요약 테이블 데이터
  const summaryRows = useMemo(() => {
    const rows = [
      { label: "연간 수입", values: monthIncome, className: "sum-inc" },
      { label: "연간 지출", values: monthExpense, className: "sum-exp" },
      {
        label: "연간 순수익",
        values: monthIncome.map((v, i) => v - (monthExpense[i] || 0)),
        className: "sum-net",
      },
      {
        label: "연간 수익률",
        values: monthIncome.map((v, i) => {
          const e = monthExpense[i] || 0;
          if (v === 0) return 0;
          return clamp(Math.round(((v - e) / (v || 1)) * 100), -999, 999);
        }),
        isPercent: true,
        className: "sum-rate",
      },
    ];
    return rows;
  }, [monthIncome, monthExpense]);

  // 연도 선택 옵션 (최근 6년)
  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 6 }, (_, i) => y - i);
  }, [now]);

  return (
    <div className="as-wrap">
      {/* 헤더 */}
      <header className="as-header">
        <div className="as-year">
          <span className="as-year-num">{year}</span>
          <span className="as-year-sub">Dashboard</span>
        </div>

        <div className="as-metrics">
          <div className="metric inc">
            <div className="m-title">총 수입</div>
            <div className="m-value">₩ {fmtWon(totalIncome)}</div>
          </div>
          <div className="metric exp">
            <div className="m-title">총 지출</div>
            <div className="m-value">₩ {fmtWon(totalExpense)}</div>
          </div>
          <div className={`metric net ${netIncome >= 0 ? "good" : "bad"}`}>
            <div className="m-title">순 수익</div>
            <div className="m-value">₩ {fmtWon(netIncome)}</div>
          </div>
        </div>

        <div className="as-controls">
          <label className="year-select">
            연도
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
        <div className="as-sec-title">월별 수입 / 지출 / 순수익</div>
        <div className="as-chart-card">
          <AnnualChart income={monthIncome} expense={monthExpense} />
        </div>
      </section>

      {/* 요약표 */}
      <section className="as-section">
        <div className="as-sec-title">수입/지출/순수익/수익률 정리</div>
        <div className="as-table-card">
          <div className="as-table-wrap">
            <table className="as-table sticky">
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
                      <td className="label">{row.label}</td>
                      <td className="num total">{row.isPercent ? `${total}%` : `₩ ${fmtWon(total)}`}</td>
                      {row.values.map((v, i) => (
                        <td key={i} className="num">
                          {row.isPercent ? `${v}%` : `₩ ${fmtWon(v)}`}
                        </td>
                      ))}
                      <td className="num">{row.isPercent ? `${avg}%` : `₩ ${fmtWon(avg)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 수입 매트릭스 */}
      <section className="as-section">
        <div className="as-sec-title">수입 정리</div>
        <div className="as-table-card">
          <div className="as-table-wrap">
            <table className="as-table sticky">
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
                  const avg = Math.round(row.total / 12);
                  return (
                    <tr key={row.category}>
                      <td className="label">{row.category}</td>
                      <td className="num total">₩ {fmtWon(row.total)}</td>
                      {row.months.map((v, i) => (
                        <td key={i} className="num">₩ {fmtWon(v)}</td>
                      ))}
                      <td className="num">₩ {fmtWon(avg)}</td>
                    </tr>
                  );
                })}
                {!incomeMatrix.length && (
                  <tr>
                    <td colSpan={15} className="empty">표시할 수입 데이터가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 지출 매트릭스 */}
      <section className="as-section">
        <div className="as-sec-title">지출 정리</div>
        <div className="as-table-card">
          <div className="as-table-wrap">
            <table className="as-table sticky">
              <thead>
                <tr>
                  <th style={{width:180}}>분류</th>
                  <th className="num total">합계</th>
                  {MONTH_LABELS.map((m) => <th key={m} className="num">{m}</th>)}
                  <th className="num">평균</th>
                </tr>
              </thead>
              <tbody>
                {expenseMatrix.map((row) => {
                  const avg = Math.round(row.total / 12);
                  return (
                    <tr key={row.category}>
                      <td className="label">{row.category}</td>
                      <td className="num total">₩ {fmtWon(row.total)}</td>
                      {row.months.map((v, i) => (
                        <td key={i} className="num">₩ {fmtWon(v)}</td>
                      ))}
                      <td className="num">₩ {fmtWon(avg)}</td>
                    </tr>
                  );
                })}
                {!expenseMatrix.length && (
                  <tr>
                    <td colSpan={15} className="empty">표시할 지출 데이터가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 로딩/에러 오버레이 */}
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
