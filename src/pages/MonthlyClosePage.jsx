import React, { useEffect, useMemo, useState } from "react";
import "./MonthlyClosePage.css";

/** ========================================
 *  Firebase Storage JSON ←→ 월마감 통합 페이지
 *  - 수입 JSON:  acct_income_json/<YYYY-MM>.json
 *  - 지출 JSON:  acct_expense_json/<YYYY-MM>.json
 *  - days / items 포맷 모두 지원
 *  - 실사용: IncomeImportPage / ExpensePage가 저장한 JSON 그대로 읽어 합산
 * ======================================== */

import { getStorage, ref as sRef, getBytes } from "firebase/storage";

/* ───────────── 유틸 ───────────── */
const td = new TextDecoder("utf-8");
const fmtWon = (n) => (Number(n) || 0).toLocaleString("ko-KR");
const ymd = (d) => (String(d || "").split("T")[0] || d || "");
const toMonthKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};
const sum = (arr, pick = (x) => x) => arr.reduce((s, v) => s + (Number(pick(v)) || 0), 0);

/** Storage JSON 포맷 → 통합 rows 변환기
 *  - Storage JSON(days)  : { days: { 'YYYY-MM-DD': { rows:[{category, amount, memo}], total } } }
 *  - Storage JSON(items) : { items: [{ date, category, amount, memo }, ...] }
 */
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

/** Storage에서 JSON 읽기 (없으면 빈 객체 반환) */
async function readJson(storage, path) {
  try {
    const ab = await getBytes(sRef(storage, path));
    const text = td.decode(ab);
    return JSON.parse(text);
  } catch (e) {
    // 파일 없거나 권한 문제 → 빈 데이터로 처리
    return {};
  }
}

/** 카테고리 합계 계산 */
function groupByCategory(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.category || "(미지정)";
    map.set(key, (map.get(key) || 0) + (Number(r.amount) || 0));
  }
  return Array.from(map.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** 일자별 상세(카테고리 필터 적용 후) */
function buildDetails(rows, category) {
  const filtered = category ? rows.filter((r) => r.category === category) : rows;
  return [...filtered].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount));
}

/* ───────────── 컴포넌트 ───────────── */
export default function MonthlyClosePage() {
  const storage = getStorage();
  const [monthKey, setMonthKey] = useState(toMonthKey());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [incomeRows, setIncomeRows] = useState([]);   // [{date, category, amount, memo}]
  const [expenseRows, setExpenseRows] = useState([]); // [{date, category, amount, memo}]
  const [tab, setTab] = useState("income");           // 'income' | 'expense'
  const [pickedCategory, setPickedCategory] = useState("");
  const [search, setSearch] = useState("");

  // 월 변경 시 실제 Storage JSON 읽어오기
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setPickedCategory("");
      try {
        const [incJson, expJson] = await Promise.all([
          readJson(storage, `acct_income_json/${monthKey}.json`),
          readJson(storage, `acct_expense_json/${monthKey}.json`),
        ]);
        if (cancelled) return;
        setIncomeRows(normalizeFromStorageJson(incJson));
        setExpenseRows(normalizeFromStorageJson(expJson));
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [monthKey, storage]);

  // 검색 필터
  const rows = tab === "income" ? incomeRows : expenseRows;
  const filteredRows = useMemo(() => {
    if (!search) return rows;
    const q = search.trim();
    if (!q) return rows;
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    return rows.filter((r) => rx.test(r.category) || rx.test(r.memo));
  }, [rows, search]);

  const categoryTotals = useMemo(() => groupByCategory(filteredRows), [filteredRows]);
  const details = useMemo(() => buildDetails(filteredRows, pickedCategory), [filteredRows, pickedCategory]);
  const totalMonthIncome = useMemo(() => sum(incomeRows, (r) => r.amount), [incomeRows]);
  const totalMonthExpense = useMemo(() => sum(expenseRows, (r) => r.amount), [expenseRows]);
  const totalThisTab = useMemo(() => sum(filteredRows, (r) => r.amount), [filteredRows]);

  const diff = totalMonthIncome - totalMonthExpense;

  return (
    <div className="mc2-wrap">
      {/* 상단 헤더바 */}
      <header className="mc2-header">
        <div className="mc2-title">
          <i className="ri-pie-chart-2-line" />
          월마감
        </div>

        <div className="mc2-controls">
          <label className="mc2-month">
            <span>월 선택</span>
            <input
              type="month"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
            />
          </label>

          <div className="mc2-tabs">
            <button
              className={`mc2-tab ${tab === "income" ? "is-on" : ""}`}
              onClick={() => {
                setTab("income");
                setPickedCategory("");
              }}
            >
              수입
            </button>
            <button
              className={`mc2-tab ${tab === "expense" ? "is-on" : ""}`}
              onClick={() => {
                setTab("expense");
                setPickedCategory("");
              }}
            >
              지출
            </button>
          </div>

          <div className="mc2-search">
            <i className="ri-search-line" />
            <input
              type="text"
              placeholder="항목/메모 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="mc2-clear" onClick={() => setSearch("")} title="지우기">
                <i className="ri-close-circle-line" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 합계 카드 */}
      <section className="mc2-cards">
        <div className="mc2-card">
          <div className="mc2-card-label">월 수입 합계</div>
          <div className="mc2-card-value inc">₩ {fmtWon(totalMonthIncome)}</div>
        </div>
        <div className="mc2-card">
          <div className="mc2-card-label">월 지출 합계</div>
          <div className="mc2-card-value exp">₩ {fmtWon(totalMonthExpense)}</div>
        </div>
        <div className={`mc2-card ${diff >= 0 ? "good" : "bad"}`}>
          <div className="mc2-card-label">차액</div>
          <div className="mc2-card-value">₩ {fmtWon(diff)}</div>
        </div>
      </section>

      {/* 본문 2컬럼 */}
      <section className="mc2-body">
        {/* 좌: 카테고리 합계 */}
        <div className="mc2-left">
          <div className="mc2-box">
            <div className="mc2-box-title">
              {tab === "income" ? "수입" : "지출"} · 항목 합계
              <span className="mc2-sub"> (표시중 합계 ₩ {fmtWon(totalThisTab)})</span>
            </div>
            <div className="mc2-table-wrap">
              <table className="mc2-table">
                <thead>
                  <tr>
                    <th>항목</th>
                    <th className="num">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryTotals.map((c) => (
                    <tr
                      key={c.category}
                      className={pickedCategory === c.category ? "is-picked" : ""}
                      onClick={() =>
                        setPickedCategory((prev) => (prev === c.category ? "" : c.category))
                      }
                    >
                      <td className="cat">
                        <span className="dot" />
                        {c.category || "(미지정)"}
                      </td>
                      <td className="num">₩ {fmtWon(c.amount)}</td>
                    </tr>
                  ))}
                  {!categoryTotals.length && (
                    <tr>
                      <td colSpan={2} className="empty">데이터가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {pickedCategory && (
              <button className="mc2-chip-clear" onClick={() => setPickedCategory("")}>
                선택 해제: {pickedCategory} ✕
              </button>
            )}
          </div>
        </div>

        {/* 우: 일자 상세 */}
        <div className="mc2-right">
          <div className="mc2-box">
            <div className="mc2-box-title">
              {pickedCategory ? `"${pickedCategory}" · 일자별 상세` : "일자별 상세"}
              <span className="mc2-sub"> (건수 {details.length}건)</span>
            </div>

            <div className="mc2-table-wrap">
              <table className="mc2-table sticky">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>일자</th>
                    <th>항목</th>
                    <th className="num" style={{ width: 140 }}>금액</th>
                    <th>메모</th>
                  </tr>
                </thead>
                <tbody>
                  {details.map((r, i) => (
                    <tr key={i}>
                      <td>{ymd(r.date)}</td>
                      <td className="cat">{r.category || "(미지정)"}</td>
                      <td className="num">₩ {fmtWon(r.amount)}</td>
                      <td className="memo">{r.memo || ""}</td>
                    </tr>
                  ))}
                  {!details.length && (
                    <tr>
                      <td colSpan={4} className="empty">표시할 내역이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>합계</td>
                    <td className="num">₩ {fmtWon(sum(details, (r) => r.amount))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* 로딩/에러 */}
      {loading && (
        <div className="mc2-overlay">
          <div className="mc2-loader">
            <span className="spinner" />
            불러오는 중…
          </div>
        </div>
      )}
      {!!error && (
        <div className="mc2-overlay error">
          <div className="mc2-loader">
            <i className="ri-alert-line" />
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
