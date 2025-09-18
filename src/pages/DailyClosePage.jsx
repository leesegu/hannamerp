// ==================================
// 관리비회계 · 일마감 페이지 (Storage JSON 버전)
// - 날짜 선택 → 해당 일자의 수입/지출 상세 + 대분류/소분류별 합계
// - 수입 JSON: acct_income_json/<YYYY-MM>.json
// - 지출 JSON: acct_expense_json/<YYYY-MM>.json
// - 디자인은 DailyClosePage.css 분리
// ==================================

import React, { useEffect, useMemo, useState } from "react";
import "./DailyClosePage.css";

// ✅ firebase 인스턴스: app 말고 storage를 직접 사용
import { ref as sRef, getBytes } from "firebase/storage";
import { storage } from "../firebase"; // (possible exports: auth, db, storage)

const toYMD = (d) => {
  const z = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, "0");
  const day = String(z.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const monthKeyFromYMD = (ymd) => ymd.slice(0, 7); // YYYY-MM

const safeParse = (buf) => {
  try {
    const txt = new TextDecoder().decode(buf);
    const obj = JSON.parse(txt);
    if (obj && obj.days && typeof obj.days === "object") return obj;
  } catch (e) {}
  return { meta: {}, days: {} };
};

const fetchMonthJson = async (baseFolder, monthKey) => {
  const path = `${baseFolder}/${monthKey}.json`;
  try {
    const bytes = await getBytes(sRef(storage, path));
    return safeParse(bytes);
  } catch (e) {
    return { meta: {}, days: {} };
  }
};

const pickAmount = (row) => {
  for (const k of ["inAmt", "outAmt", "amount", "amt", "money", "value"]) {
    const v = row?.[k];
    if (v != null && v !== "") {
      const n = Number(String(v).replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
};

const s = (v) => String(v ?? "").trim();
const dash = (v, alt = "-") => (s(v) ? s(v) : alt);

const normalizeRow = (row, kind /* "income" | "expense" */) => {
  const amt = pickAmount(row);
  const big = s(row.category || row.main || row.mainCategory || row.categoryMain || row.type);
  const sub = s(
    row.subCategory ||
      row.sub ||
      row.subType ||
      row.categorySub ||
      row.smallCategory
  );
  const content = s(row.record || row.content || row.memo || row.desc || row.note);

  return {
    kind,
    amount: amt,
    big: big || (kind === "income" ? "수입" : "지출"),
    sub: sub || "(소분류없음)",
    content: content || "",
    raw: row,
  };
};

const aggregateByBigSub = (rows) => {
  const map = new Map(); // big -> Map(sub -> sum)
  let total = 0;
  rows.forEach((r) => {
    const curBig = r.big || "(분류없음)";
    const curSub = r.sub || "(소분류없음)";
    const m = map.get(curBig) || new Map();
    m.set(curSub, (m.get(curSub) || 0) + r.amount);
    map.set(curBig, m);
    total += r.amount;
  });

  const groups = [];
  for (const [big, subMap] of map.entries()) {
    const subs = [];
    let sumBig = 0;
    for (const [sub, sum] of subMap.entries()) {
      subs.push({ sub, sum });
      sumBig += sum;
    }
    subs.sort((a, b) => b.sum - a.sum);
    groups.push({ big, sumBig, subs });
  }
  groups.sort((a, b) => b.sumBig - a.sumBig);
  return { groups, total };
};

const fmt = (n) => (Number.isFinite(n) ? n : 0).toLocaleString("ko-KR");

export default function DailyClosePage() {
  const [date, setDate] = useState(() => toYMD(new Date()));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [incomeRows, setIncomeRows] = useState([]);
  const [expenseRows, setExpenseRows] = useState([]);

  const monthKey = monthKeyFromYMD(date);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const [incomeJson, expenseJson] = await Promise.all([
        fetchMonthJson("acct_income_json", monthKey),
        fetchMonthJson("acct_expense_json", monthKey),
      ]);

      const dIncome = incomeJson.days?.[date]?.rows || [];
      const dExpense = expenseJson.days?.[date]?.rows || [];

      const inNorm = dIncome.map((r) => normalizeRow(r, "income")).filter((r) => r.amount);
      const exNorm = dExpense.map((r) => normalizeRow(r, "expense")).filter((r) => r.amount);

      setIncomeRows(inNorm);
      setExpenseRows(exNorm);
    } catch (e) {
      setErr("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const incomeAgg = useMemo(() => aggregateByBigSub(incomeRows), [incomeRows]);
  const expenseAgg = useMemo(() => aggregateByBigSub(expenseRows), [expenseRows]);
  const net = useMemo(() => incomeAgg.total - expenseAgg.total, [incomeAgg.total, expenseAgg.total]);

  return (
    <div className="dc-page">
      <div className="dc-top">
        <div className="dc-top-left">
          <div className="dc-title">
            <i className="ri-calendar-check-line" />
            <span>일마감</span>
          </div>
          <div className="dc-date-picker">
            <label className="dc-label">마감일 선택</label>
            <input
              className="dc-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button className="dc-refresh" onClick={load} disabled={loading}>
              <i className="ri-refresh-line" />
              새로고침
            </button>
          </div>
        </div>

        <div className="dc-cards">
          <div className="dc-card income">
            <div className="dc-card-title">총 수입</div>
            <div className="dc-card-amount">{fmt(incomeAgg.total)} 원</div>
            <div className="dc-card-sub">Income</div>
          </div>
          <div className="dc-card expense">
            <div className="dc-card-title">총 지출</div>
            <div className="dc-card-amount">{fmt(expenseAgg.total)} 원</div>
            <div className="dc-card-sub">Expense</div>
          </div>
          <div className={`dc-card net ${net >= 0 ? "pos" : "neg"}`}>
            <div className="dc-card-title">당일 차액</div>
            <div className="dc-card-amount">{fmt(net)} 원</div>
            <div className="dc-card-sub">{net >= 0 ? "Surplus" : "Deficit"}</div>
          </div>
        </div>
      </div>

      {err ? <div className="dc-error">{err}</div> : null}

      <div className="dc-sections">
        <section className="dc-section">
          <header className="dc-section-head income">
            <div className="dc-section-title">
              <i className="ri-arrow-down-circle-line" />
              <span>수입 상세</span>
            </div>
            <div className="dc-section-total">합계 <strong>{fmt(incomeAgg.total)}</strong> 원</div>
          </header>

          <div className="dc-table-wrap">
            <table className="dc-table">
              <thead>
                <tr>
                  <th style={{width: "22%"}}>대분류</th>
                  <th style={{width: "22%"}}>소분류</th>
                  <th style={{width: "18%"}} className="right">금액</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {incomeAgg.groups.length === 0 && (
                  <tr><td colSpan={4} className="muted">데이터가 없습니다.</td></tr>
                )}
                {incomeAgg.groups.map((g, gi) => {
                  const groupRows = incomeRows.filter(r => r.big === g.big);
                  return (
                    <React.Fragment key={`in-g-${gi}`}>
                      <tr className="row-group">
                        <td className="bold">{g.big}</td>
                        <td className="muted">소계</td>
                        <td className="right bold">{fmt(g.sumBig)}</td>
                        <td className="muted">—</td>
                      </tr>
                      {g.subs.map((sobj, si) => (
                        <tr key={`in-g-${gi}-s-${si}`} className="row-sub">
                          <td className="muted">↳</td>
                          <td>{sobj.sub}</td>
                          <td className="right">{fmt(sobj.sum)}</td>
                          <td className="muted">—</td>
                        </tr>
                      ))}
                      {groupRows.map((r, ri) => (
                        <tr key={`in-r-${gi}-${ri}`} className="row-detail">
                          <td className="muted"> </td>
                          <td className="muted"> </td>
                          <td className="right">{fmt(r.amount)}</td>
                          <td className="ellipsis" title={dash(r.content)}>{dash(r.content)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dc-section">
          <header className="dc-section-head expense">
            <div className="dc-section-title">
              <i className="ri-arrow-up-circle-line" />
              <span>지출 상세</span>
            </div>
            <div className="dc-section-total">합계 <strong>{fmt(expenseAgg.total)}</strong> 원</div>
          </header>

          <div className="dc-table-wrap">
            <table className="dc-table">
              <thead>
                <tr>
                  <th style={{width: "22%"}}>대분류</th>
                  <th style={{width: "22%"}}>소분류</th>
                  <th style={{width: "18%"}} className="right">금액</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {expenseAgg.groups.length === 0 && (
                  <tr><td colSpan={4} className="muted">데이터가 없습니다.</td></tr>
                )}
                {expenseAgg.groups.map((g, gi) => {
                  const groupRows = expenseRows.filter(r => r.big === g.big);
                  return (
                    <React.Fragment key={`ex-g-${gi}`}>
                      <tr className="row-group">
                        <td className="bold">{g.big}</td>
                        <td className="muted">소계</td>
                        <td className="right bold">{fmt(g.sumBig)}</td>
                        <td className="muted">—</td>
                      </tr>
                      {g.subs.map((sobj, si) => (
                        <tr key={`ex-g-${gi}-s-${si}`} className="row-sub">
                          <td className="muted">↳</td>
                          <td>{sobj.sub}</td>
                          <td className="right">{fmt(sobj.sum)}</td>
                          <td className="muted">—</td>
                        </tr>
                      ))}
                      {groupRows.map((r, ri) => (
                        <tr key={`ex-r-${gi}-${ri}`} className="row-detail">
                          <td className="muted"> </td>
                          <td className="muted"> </td>
                          <td className="right">{fmt(r.amount)}</td>
                          <td className="ellipsis" title={dash(r.content)}>{dash(r.content)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {loading && (
        <div className="dc-loading">
          <div className="dc-spinner" />
          <div>불러오는 중…</div>
        </div>
      )}
    </div>
  );
}
