// src/pages/MonthlyClosePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./MonthlyClosePage.css";
import { getStorage, ref as sRef, getBytes } from "firebase/storage";

/* ── 유틸 ── */
const td = new TextDecoder("utf-8");
const toNum = (v) => {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmtWon = (n) => toNum(n).toLocaleString("ko-KR");
const ymd = (d) => (String(d || "").split("T")[0] || d || "");
const toMonthKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};
const sum = (arr, pick = (x) => x) => arr.reduce((s, v) => s + toNum(pick(v)), 0);
const yearOf = (mk) => Number((mk || "").slice(0, 4)) || new Date().getFullYear();

/* Storage JSON → 표준화 */
function normalizeFromStorageJson(json, kind) {
  const pickAmount = (r) => (kind === "income" ? toNum(r.amount ?? r.inAmt) : toNum(r.amount ?? r.outAmt));
  const pickBig = (r) => r.big ?? r.mainName ?? r.main ?? r.mainCategory ?? r["대분류"] ?? r.type ?? r.category ?? "";
  const pickSub = (r) => r.sub ?? r.subName ?? r.subCategory ?? r.smallCategory ?? r["소분류"] ?? "";

  const makeIncome = (r) => ({
    date: ymd(r.date),
    category: r.category || r.main || r.type || "",
    amount: pickAmount(r),
    memo: r.memo || r.record || r.desc || r.content || "",
  });
  const makeExpense = (r) => ({
    date: ymd(r.date),
    big: pickBig(r),
    sub: pickSub(r),
    category: pickBig(r),
    amount: pickAmount(r),
    memo: r.memo || r.record || r.desc || r.content || "",
  });

  const maker = kind === "income" ? makeIncome : makeExpense;
  if (!json || typeof json !== "object") return [];

  if (json.items) {
    const arr = Array.isArray(json.items) ? json.items : Object.values(json.items);
    return (arr || []).map(maker);
  }
  if (json.days && typeof json.days === "object") {
    const out = [];
    for (const d of Object.keys(json.days)) {
      const list = Array.isArray(json.days[d]?.rows) ? json.days[d].rows : [];
      list.forEach((r) => out.push({ ...maker(r), date: ymd(d) }));
    }
    return out;
  }
  return [];
}

/* Storage 읽기 */
async function readJson(storage, path) {
  try {
    const ab = await getBytes(sRef(storage, path));
    return JSON.parse(td.decode(ab));
  } catch {
    return {};
  }
}

/* 그룹핑 */
function groupByCategory(rows) {
  const m = new Map();
  rows.forEach((r) => {
    const key = r.category || "(미지정)";
    m.set(key, (m.get(key) || 0) + toNum(r.amount));
  });
  return [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}
function groupExpenseBigSub(rows) {
  const bigMap = new Map();
  rows.forEach((r) => {
    const big = r.big || "(미지정)";
    const sub = r.sub || "(소분류없음)";
    const amt = toNum(r.amount);
    if (!bigMap.has(big)) bigMap.set(big, { sum: 0, subs: new Map() });
    const b = bigMap.get(big);
    b.sum += amt;
    b.subs.set(sub, (b.subs.get(sub) || 0) + amt);
  });
  const list = [];
  bigMap.forEach(({ sum, subs }, big) => {
    list.push({
      big,
      sum,
      subs: [...subs.entries()].map(([sub, amount]) => ({ sub, amount })).sort((a, b) => b.amount - a.amount),
    });
  });
  return list.sort((a, b) => b.sum - a.sum);
}

/* 일자별 합계 */
function dailyTotalsIncome(rows, selectedCat) {
  const m = new Map();
  rows.forEach((r) => {
    if (selectedCat && (r.category || "(미지정)") !== selectedCat) return;
    m.set(r.date, (m.get(r.date) || 0) + toNum(r.amount));
  });
  return [...m.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .filter((x) => toNum(x.amount) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}
function dailyTotalsExpense(rows, selBig, selSub) {
  const map = new Map(); // date -> Map(big -> { sum, subs: Map(sub -> sum) })
  rows.forEach((r) => {
    const d = r.date, big = r.big || "(미지정)", sub = r.sub || "(소분류없음)", amt = toNum(r.amount);
    if (!map.has(d)) map.set(d, new Map());
    const m = map.get(d);
    if (!m.has(big)) m.set(big, { sum: 0, subs: new Map() });
    const b = m.get(big);
    b.sum += amt; b.subs.set(sub, (b.subs.get(sub) || 0) + amt);
  });

  const out = [];
  [...map.keys()].sort().forEach((d) => {
    const m = map.get(d);
    if (selBig && selSub) {
      const v = m.get(selBig)?.subs?.get(selSub) || 0;
      if (toNum(v) > 0) out.push({ date: d, mode: "sub", big: selBig, sub: selSub, sum: v });
    } else if (selBig) {
      const v = m.get(selBig)?.sum || 0;
      if (toNum(v) > 0) out.push({ date: d, mode: "big", big: selBig, sum: v });
    } else {
      const bigs = [...m.entries()].map(([big, { sum }]) => ({ big, sum })).filter(x=>toNum(x.sum)>0).sort((a,b)=>b.sum-a.sum);
      if (bigs.length) out.push({ date: d, mode: "all", bigs });
    }
  });
  return out;
}

/* ── 커스텀 MonthPicker ── */
function MonthPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number((value || "").slice(0, 4)) || new Date().getFullYear());
  const ref = useRef(null);

  useEffect(() => {
    const esc = (e) => e.key === "Escape" && setOpen(false);
    const out = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) { document.addEventListener("keydown", esc); document.addEventListener("mousedown", out); }
    return () => { document.removeEventListener("keydown", esc); document.removeEventListener("mousedown", out); };
  }, [open]);

  useEffect(() => {
    const y = Number((value || "").slice(0, 4));
    if (y) setYear(y);
  }, [value]);

  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const close = () => { setOpen(false); if (document.activeElement?.blur) document.activeElement.blur(); };
  const pick = (mm) => { onChange?.(`${year}-${mm}`); close(); };

  return (
    <div className={`mp-wrap ${open ? "is-open" : ""}`} ref={ref}>
      <button type="button" className="mp-trigger" onClick={() => setOpen(v => !v)} title="월 선택">
        <i className="ri-calendar-event-line" /><span>{value || toMonthKey()}</span><i className="ri-arrow-down-s-line caret" />
      </button>
      {open && (
        <div className="mp-pop" role="dialog" aria-modal="true" aria-label="월 선택" onClick={(e)=>e.stopPropagation()}>
          {/* 상단 헤더: 전년도(좌) - 현재년도(가운데) - 내년도(우) */}
          <div className="mp-head grid">
            <button
              className="nav nav-prev"
              onClick={(e)=>{e.stopPropagation(); setYear(y=>y-1);}}
              title="전년도"
              aria-label="전년도"
            >
              <i className="ri-arrow-left-s-line" />
            </button>
            <div className="yr">{year}</div>
            <button
              className="nav nav-next"
              onClick={(e)=>{e.stopPropagation(); setYear(y=>y+1);}}
              title="내년도"
              aria-label="내년도"
            >
              <i className="ri-arrow-right-s-line" />
            </button>
          </div>

          <div className="mp-grid">
            {months.map(mm => (
              <button
                key={mm}
                type="button"
                className={`mm ${value === `${year}-${mm}` ? "is-picked" : ""}`}
                onClick={(e)=>{e.stopPropagation(); pick(mm);}}
              >
                {year}.{mm}
              </button>
            ))}
          </div>

          <div className="mp-foot">
            <button type="button" className="mp-today" onClick={(e)=>{e.stopPropagation(); onChange?.(toMonthKey()); setYear(new Date().getFullYear()); close();}}>
              <i className="ri-time-line" /> 이번 달
            </button>
            <button type="button" className="mp-close" onClick={(e)=>{e.stopPropagation(); close();}}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 메인 ── */
export default function MonthlyClosePage() {
  const storage = getStorage();
  const [monthKey, setMonthKey] = useState(toMonthKey());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [incomeRows, setIncomeRows] = useState([]);
  const [expenseRows, setExpenseRows] = useState([]);

  const [tab, setTab] = useState("income");
  const [search, setSearch] = useState("");

  // 좌→우 선택 상태
  const [pickedIncomeCat, setPickedIncomeCat] = useState("");
  const [pickedExpenseBig, setPickedExpenseBig] = useState("");
  const [pickedExpenseSub, setPickedExpenseSub] = useState("");
  const [expandedBig, setExpandedBig] = useState({});

  // 연간 월별 합계
  const [yearMonthly, setYearMonthly] = useState([]); // [{mk,income,expense}]

  const clickTab = (next) => {
    if (tab === next && (pickedIncomeCat || pickedExpenseBig || pickedExpenseSub)) {
      setPickedIncomeCat(""); setPickedExpenseBig(""); setPickedExpenseSub(""); setExpandedBig({});
      return;
    }
    setTab(next);
    if (next === "income") { setPickedExpenseBig(""); setPickedExpenseSub(""); }
    else { setPickedIncomeCat(""); }
  };

  // 현재 월 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const [incJs, expJs] = await Promise.all([
          readJson(storage, `acct_income_json/${monthKey}.json`),
          readJson(storage, `acct_expense_json/${monthKey}.json`),
        ]);
        if (cancelled) return;
        setIncomeRows(normalizeFromStorageJson(incJs, "income"));
        setExpenseRows(normalizeFromStorageJson(expJs, "expense"));
      } catch (e) {
        if (!cancelled) setError("데이터를 불러오지 못했습니다.");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [monthKey, storage]);

  // 선택 연도 12개월 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const y = yearOf(monthKey);
      const months = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
      try {
        const inc = await Promise.all(months.map(mk => readJson(storage, `acct_income_json/${mk}.json`)));
        const exp = await Promise.all(months.map(mk => readJson(storage, `acct_expense_json/${mk}.json`)));
        if (cancelled) return;
        setYearMonthly(months.map((mk, i) => ({
          mk,
          income: sum(normalizeFromStorageJson(inc[i], "income"), r=>r.amount),
          expense: sum(normalizeFromStorageJson(exp[i], "expense"), r=>r.amount),
        })));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [monthKey, storage]);

  // 검색 필터
  const baseRows = tab === "income" ? incomeRows : expenseRows;
  const filteredRows = useMemo(() => {
    const q = search.trim();
    if (!q) return baseRows;
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    return baseRows.filter((r) => rx.test(r.category || r.big || "") || rx.test(r.memo || ""));
  }, [baseRows, search]);

  // 합계
  const totalIncome = useMemo(() => sum(incomeRows, r=>r.amount), [incomeRows]);
  const totalExpense = useMemo(() => sum(expenseRows, r=>r.amount), [expenseRows]);
  const net = totalIncome - totalExpense;

  // 좌/우 데이터
  const categoryTotals = useMemo(() => groupByCategory(filteredRows), [filteredRows]);
  const expenseBigSub = useMemo(() => (tab === "expense" ? groupExpenseBigSub(filteredRows) : []), [filteredRows, tab]);

  const dailyIncome = useMemo(() => (tab === "income" ? dailyTotalsIncome(filteredRows, pickedIncomeCat) : []),
    [filteredRows, tab, pickedIncomeCat]);
  const dailyExpense = useMemo(() => (tab === "expense" ? dailyTotalsExpense(filteredRows, pickedExpenseBig, pickedExpenseSub) : []),
    [filteredRows, tab, pickedExpenseBig, pickedExpenseSub]);

  // 비율 기준
  const maxCategory = useMemo(() => categoryTotals.length ? Math.max(...categoryTotals.map(c=>toNum(c.amount))) : 0,
    [categoryTotals]);

  // 연간 패널 바 기준
  const maxInc = Math.max(1, ...yearMonthly.map(m=>toNum(m.income)));
  const maxExp = Math.max(1, ...yearMonthly.map(m=>toNum(m.expense)));

  return (
    <div className="mc4-wrap">
      {/* 상단 헤더(애니메이션 제거, 정적 그라디언트 강화) */}
      <header className="mc4-header fancy static-gradient">
        <div className="mc4-title"><i className="ri-sparkling-2-line" />월마감</div>
        <div className="mc4-controls">
          <MonthPicker value={monthKey} onChange={setMonthKey} />
          <div className="mc4-tabs">
            <button className={`mc4-tab ${tab === "income" ? "is-on" : ""}`} onClick={()=>clickTab("income")}><i className="ri-arrow-up-circle-line" /> 수입</button>
            <button className={`mc4-tab ${tab === "expense" ? "is-on" : ""}`} onClick={()=>clickTab("expense")}><i className="ri-arrow-down-circle-line" /> 지출</button>
          </div>
          <div className="mc4-search gap-left">
            <i className="ri-search-line" />
            <input type="text" placeholder="검색" value={search} onChange={(e)=>setSearch(e.target.value)} />
            {search && <button className="mc4-clear" onClick={()=>setSearch("")} title="지우기"><i className="ri-close-circle-line" /></button>}
          </div>
        </div>
      </header>

      {/* KPI */}
      <section className="mc4-kpis tight">
        <div className="mc4-kpi inc glam">
          <div className="kpi-label big"><i className="ri-coin-line" /> 수입합계</div>
          <div className="kpi-value giant income-blue">₩ {fmtWon(totalIncome)}</div>
        </div>
        <div className="mc4-kpi exp glam">
          <div className="kpi-label big"><i className="ri-bank-card-line" /> 지출합계</div>
          <div className="kpi-value giant">₩ {fmtWon(totalExpense)}</div>
        </div>
        <div className={`mc4-kpi glam ${net >= 0 ? "good":"bad"}`}>
          <div className="kpi-label big"><i className="ri-equalizer-line" /> 차액</div>
          <div className="kpi-value giant">₩ {fmtWon(net)}</div>
        </div>
      </section>

      {/* 본문 3열 */}
      <section className="mc4-body mc4-3col equal">
        {/* (1) 월마감 데이터 — 동일 높이(tall) */}
        <div className="mc4-pane">
          <div className="mc4-box">
            <div className="monthly-wrap tall scroll-soft">
              <table className="monthly-table">
                <thead>
                  <tr><th>월</th><th>수입</th><th>지출</th></tr>
                </thead>
                <tbody>
                  {yearMonthly.map(({ mk, income, expense }) => {
                    const [y, m] = mk.split("-");
                    const wInc = Math.round((toNum(income)/maxInc)*100);
                    const wExp = Math.round((toNum(expense)/maxExp)*100);
                    return (
                      <tr key={mk} className={`${mk===monthKey?"is-current":""}`}>
                        <td className="mono">{y} {m}</td>
                        <td className="bar-cell">
                          <div className="bar blue" style={{ width: `${wInc}%` }}>
                            {/* ▶ 게이지 위(오버레이) 검정 글자, 짧아도 표시됨 */}
                            <span className="val onbar">₩ {fmtWon(income)}</span>
                          </div>
                        </td>
                        <td className="bar-cell">
                          <div className="bar pink" style={{ width: `${wExp}%` }}>
                            <span className="val onbar">₩ {fmtWon(expense)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* (2) 항목별 */}
        <div className="mc4-pane">
          <div className="mc4-box">
            <div className="mc4-table-wrap tall scroll-soft">
              {tab === "income" ? (
                <table className="mc4-table compact">
                  <thead><tr><th>항목</th><th className="num">금액</th><th style={{width:140}}>비율</th></tr></thead>
                  <tbody>
                    {categoryTotals.map((c)=>{
                      const ratio = maxCategory ? Math.round((toNum(c.amount)/maxCategory)*100) : 0;
                      const picked = pickedIncomeCat === c.category;
                      return (
                        <tr key={c.category} className={picked?"is-picked":""}
                            onClick={()=>setPickedIncomeCat(p=>p===c.category?"":c.category)}>
                          <td className="cat"><span className="dot" />{c.category || "(미지정)"}</td>
                          <td className="num">₩ {fmtWon(c.amount)}</td>
                          <td><div className="bar bar-tall"><div className="bar-fill" style={{width:`${ratio}%`}} /><div className="bar-txt">{ratio}%</div></div></td>
                        </tr>
                      );
                    })}
                    {!categoryTotals.length && <tr><td colSpan={3} className="empty">데이터가 없습니다.</td></tr>}
                  </tbody>
                </table>
              ) : (
                <table className="mc4-table compact">
                  <thead><tr><th>대분류</th><th className="num" style={{width:160}}>금액</th><th style={{width:140}}>비율</th></tr></thead>
                  <tbody>
                    {(() => {
                      const maxBig = expenseBigSub.length ? Math.max(...expenseBigSub.map(g=>toNum(g.sum))) : 0;
                      return expenseBigSub.map((g)=>{
                        const ratio = maxBig ? Math.round((toNum(g.sum)/maxBig)*100) : 0;
                        const picked = pickedExpenseBig === g.big && !pickedExpenseSub;
                        return (
                          <React.Fragment key={g.big}>
                            <tr className={`row-big ${picked?"is-picked":""}`}
                                onClick={()=>{ setPickedExpenseBig(p=>p===g.big?"":g.big); setPickedExpenseSub(""); setExpandedBig(e=>({...e,[g.big]:!e[g.big]})); }}>
                              <td className="cat">
                                <button className={`accordion ${expandedBig[g.big]?"open":""}`} type="button" aria-label="펼치기"
                                        onClick={(e)=>{e.stopPropagation(); setExpandedBig(e2=>({...e2,[g.big]:!e2[g.big]}));}} />
                                {g.big}
                              </td>
                              <td className="num">₩ {fmtWon(g.sum)}</td>
                              <td><div className="bar bar-tall"><div className="bar-fill" style={{width:`${ratio}%`}} /><div className="bar-txt">{ratio}%</div></div></td>
                            </tr>
                            {expandedBig[g.big] && g.subs.map((s)=>(
                              <tr className={`row-sub ${pickedExpenseSub===s.sub?"is-picked":""}`} key={`${g.big}::${s.sub}`}
                                  onClick={()=>{ setPickedExpenseBig(g.big); setPickedExpenseSub(p=>p===s.sub?"":s.sub); }}>
                                <td className="cat subindent"><span className="dot small" />{s.sub}</td>
                                <td className="num">₩ {fmtWon(s.amount)}</td>
                                <td />
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      });
                    })()}
                    {!expenseBigSub.length && <tr><td colSpan={3} className="empty">데이터가 없습니다.</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* (3) 일자별 */}
        <div className="mc4-pane">
          <div className="mc4-box">
            <div className="mc4-table-wrap tall scroll-soft">
              {tab === "income" ? (
                <table className="mc4-table sticky">
                  <thead><tr><th style={{width:120}}>일자</th><th className="num" style={{width:180}}>합계</th></tr></thead>
                  <tbody>
                    {dailyIncome.map(r=> (<tr key={r.date}><td>{r.date}</td><td className="num">₩ {fmtWon(r.amount)}</td></tr>))}
                    {!dailyIncome.length && <tr><td colSpan={2} className="empty">표시할 내역이 없습니다.</td></tr>}
                  </tbody>
                </table>
              ) : (
                <table className="mc4-table sticky">
                  <thead><tr><th style={{width:120}}>일자</th><th>{pickedExpenseSub?"대분류 / 소분류":"대분류"}</th><th className="num" style={{width:160}}>합계</th></tr></thead>
                  <tbody>
                    {dailyExpense.map(d=>{
                      if (d.mode==="sub") return <tr key={`${d.date}-sub`}><td>{d.date}</td><td className="cat">{d.big} / {d.sub}</td><td className="num">₩ {fmtWon(d.sum)}</td></tr>;
                      if (d.mode==="big") return <tr key={`${d.date}-big`}><td>{d.date}</td><td className="cat">{d.big}</td><td className="num">₩ {fmtWon(d.sum)}</td></tr>;
                      return (
                        <React.Fragment key={`${d.date}-all`}>
                          <tr className="date-row">
                            <td className="date-cell" rowSpan={Math.max(1,d.bigs.length)}>{d.date}</td>
                            {d.bigs.length ? (<><td className="cat">{d.bigs[0].big}</td><td className="num">₩ {fmtWon(d.bigs[0].sum)}</td></>) : (<><td className="muted">-</td><td className="num">₩ 0</td></>)}
                          </tr>
                          {d.bigs.slice(1).map(b=> (<tr key={`${d.date}-${b.big}`}><td className="cat">{b.big}</td><td className="num">₩ {fmtWon(b.sum)}</td></tr>))}
                        </React.Fragment>
                      );
                    })}
                    {!dailyExpense.length && <tr><td colSpan={3} className="empty">표시할 내역이 없습니다.</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </section>

      {loading && (
        <div className="mc4-loading">
          <div className="sk-cards"><div className="sk-card"/><div className="sk-card"/><div className="sk-card"/></div>
          <div className="sk-panels"><div className="sk-panel"/><div className="sk-panel"/><div className="sk-panel"/></div>
        </div>
      )}
      {!!error && <div className="mc4-toast error"><i className="ri-error-warning-line" />{error}</div>}
    </div>
  );
}
