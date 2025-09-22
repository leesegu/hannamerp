// ==================================
// 관리비회계 · 일마감 (Storage JSON · 정확집계 & 새 달력)
// 디자인 리뉴얼: 스타일만 변경 (로직·마크업 동일)
// ==================================

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import "./DailyClosePage.css";
import { ref as sRef, getBytes } from "firebase/storage";
import { storage } from "../firebase";

/* ===== 공통 유틸 ===== */
const s = (v) => String(v ?? "").trim();
const onlyDigits = (txt) => (txt && typeof txt === "string" ? txt.replace(/[^0-9]/g, "") : "");
const toNumber = (v) => {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n) => (Number.isFinite(n) ? n : 0).toLocaleString("ko-KR");
const toYMD = (d) => {
  const z = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
};
const monthKeyFromYMD = (ymd) => ymd.slice(0, 7);

/* ===== Storage JSON 읽기 ===== */
const safeParse = (buf) => {
  try {
    const txt = new TextDecoder().decode(buf);
    const obj = JSON.parse(txt);
    if (obj && typeof obj === "object") return obj;
  } catch {}
  return {};
};
const fetchMonthJson = async (base, monthKey) => {
  try {
    const bytes = await getBytes(sRef(storage, `${base}/${monthKey}.json`));
    return safeParse(bytes);
  } catch {
    return {};
  }
};

/* ===== 필드 매핑 ===== */
// 수입
const INCOME_MAIN_KEYS = ["category", "구분", "main", "mainCategory", "type"];
const INCOME_AMOUNT_KEYS = ["inAmt", "입금금액", "income", "amount", "money", "value"];
const INCOME_WITHDRAW_KEYS = ["outAmt", "withdraw", "withdrawAmt", "withAmt", "출금금액"];
const INCOME_ACCOUNT_KEYS = ["accountNo", "계좌번호", "account", "bankAccount"];
const INCOME_CONTENT_KEYS = ["record", "거래기록사항", "memo", "메모", "content", "desc", "note"];

// 지출
const EXPENSE_BIG_KEYS = ["mainName", "대분류", "main", "mainCategory"];
const EXPENSE_SUB_KEYS = ["subName", "소분류", "sub", "subCategory", "smallCategory"];
const EXPENSE_DESC_KEYS = ["desc", "내용", "record", "memo", "메모", "note"];
const EXPENSE_AMOUNT_KEYS = ["amount", "outAmt", "지출금액", "money", "value"];
const EXPENSE_ACCOUNT_KEYS = ["outMethod", "출금계좌", "account", "accountNo"];

const pick = (row, keys) => {
  for (const k of keys) if (row && row[k] != null && row[k] !== "") return row[k];
  return undefined;
};

/* ===== 수입/지출 정규화 ===== */
const normIncome = (r) => {
  const big = s(pick(r, INCOME_MAIN_KEYS)) || "수입";
  const amount = toNumber(pick(r, INCOME_AMOUNT_KEYS));
  const content = s(pick(r, INCOME_CONTENT_KEYS)) || "";
  const accRaw = s(pick(r, INCOME_ACCOUNT_KEYS));
  const account = onlyDigits(accRaw) || accRaw || "(미지정)";
  const withdraw = toNumber(pick(r, INCOME_WITHDRAW_KEYS));
  return { kind: "income", big, amount, content, account, incomeWithdraw: withdraw, raw: r };
};

const normExpense = (r) => {
  const big = s(pick(r, EXPENSE_BIG_KEYS)) || "지출";
  const sub = s(pick(r, EXPENSE_SUB_KEYS)) || "(소분류없음)";
  const descFrom = s(pick(r, EXPENSE_DESC_KEYS)) || "";
  const content = descFrom || sub;
  const amount = toNumber(pick(r, EXPENSE_AMOUNT_KEYS));
  const outAccRaw = s(pick(r, EXPENSE_ACCOUNT_KEYS));
  const account = onlyDigits(outAccRaw) || outAccRaw || "(미지정)";
  return { kind: "expense", big, sub, content, amount, account, raw: r };
};

/* ===== 집계 ===== */
const aggIncomeByBig = (rows) => {
  const map = new Map();
  let total = 0;
  rows.forEach((r) => {
    if (!r.amount) return;
    const k = r.big || "(분류없음)";
    map.set(k, (map.get(k) || 0) + r.amount);
    total += r.amount;
  });
  const list = Array.from(map.entries())
    .map(([big, sum]) => ({ big, sum }))
    .sort((a, b) => b.sum - a.sum);
  return { list, total };
};

const aggExpense = (rows) => {
  const map = new Map();
  let total = 0;
  rows.forEach((r) => {
    if (!r.amount) return;
    total += r.amount;
    const b = r.big || "(분류없음)";
    const sname = r.sub || "(소분류없음)";
    const content = r.content || sname;

    const bucket = map.get(b) || { sumBig: 0, subs: new Map() };
    bucket.sumBig += r.amount;
    const subInfo = bucket.subs.get(sname) || { sum: 0, content };
    subInfo.sum += r.amount;
    if (!subInfo.content) subInfo.content = content;
    bucket.subs.set(sname, subInfo);
    map.set(b, bucket);
  });

  const groups = [];
  for (const [big, { sumBig, subs }] of map.entries()) {
    const list = Array.from(subs.entries())
      .map(([sub, v]) => ({ sub, sum: v.sum, content: v.content || sub }))
      .sort((a, b) => b.sum - a.sum);
    groups.push({ big, sumBig, subs: list });
  }
  groups.sort((a, b) => b.sumBig - a.sumBig);
  return { groups, total };
};

const aggByAccount = (rows, getAmt) => {
  const map = new Map();
  rows.forEach((r) => {
    const amt = getAmt(r);
    if (amt > 0) {
      const acc = r.account || "(미지정)";
      map.set(acc, (map.get(acc) || 0) + amt);
    }
  });
  return Array.from(map.entries())
    .map(([account, sum]) => ({ account, sum }))
    .sort((a, b) => b.sum - a.sum);
};

/* ===== 커스텀 달력 ===== */
function useOutsideClick(ref, cb) {
  useEffect(() => {
    const on = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) cb?.();
    };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [ref, cb]);
}
function getMonthGrid(y, mIdx) {
  const first = new Date(y, mIdx, 1);
  const start = new Date(y, mIdx, 1 - first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}
function CalendarPopover({ anchorRef, open, valueYMD, onPick, onClose }) {
  const popRef = useRef(null);
  useOutsideClick(popRef, onClose);

  const base = valueYMD ? new Date(valueYMD) : new Date();
  const [y, setY] = useState(base.getFullYear());
  const [m, setM] = useState(base.getMonth());

  useEffect(() => {
    if (!open && valueYMD) {
      const d = new Date(valueYMD);
      setY(d.getFullYear());
      setM(d.getMonth());
    }
  }, [open, valueYMD]);

  const grid = useMemo(() => getMonthGrid(y, m), [y, m]);
  const isSameYMD = (a, b) => a && b && toYMD(a) === toYMD(b);
  const today = new Date();

  if (!open) return null;
  return (
    <div className="cal-pop" ref={popRef}>
      <div className="cal-head">
        <button className="cal-nav" onClick={() => setM((mm) => (mm === 0 ? (setY(y - 1), 11) : mm - 1))}>
          <i className="ri-arrow-left-s-line" />
        </button>
        <div className="cal-title">
          <span className="mm">{m + 1}월</span>
          <span className="yy">{y}</span>
        </div>
        <button className="cal-nav" onClick={() => setM((mm) => (mm === 11 ? (setY(y + 1), 0) : mm + 1))}>
          <i className="ri-arrow-right-s-line" />
        </button>
      </div>
      <div className="cal-week">
        {["일","월","화","수","목","금","토"].map((w) => <div key={w} className="w">{w}</div>)}
      </div>
      <div className="cal-grid">
        {grid.map((d, i) => {
          const inMonth = d.getMonth() === m;
          const cls = [
            "cell",
            inMonth ? "" : "muted",
            isSameYMD(d, new Date(valueYMD)) ? "sel" : "",
            isSameYMD(d, today) ? "today" : "",
          ].join(" ");
          return (
            <button key={i} className={cls} onClick={() => { onPick?.(toYMD(d)); onClose?.(); }}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ===== 메인 ===== */
export default function DailyClosePage() {
  const [date, setDate] = useState(() => toYMD(new Date()));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [incomeRows, setIncomeRows] = useState([]);
  const [expenseRows, setExpenseRows] = useState([]);

  const monthKey = monthKeyFromYMD(date);

  const extractRowsForDate = useCallback((obj, dateStr) => {
    if (obj?.days && typeof obj.days === "object") {
      const dpack = obj.days[dateStr];
      if (dpack?.rows && Array.isArray(dpack.rows)) return dpack.rows;
    }
    if (obj?.items && typeof obj.items === "object") {
      const arr = Object.values(obj.items);
      return arr.filter((r) => s(r.date) === s(dateStr));
    }
    return [];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [incomeJson, expenseJson] = await Promise.all([
        fetchMonthJson("acct_income_json", monthKey),
        fetchMonthJson("acct_expense_json", monthKey),
      ]);

      const inRaw = extractRowsForDate(incomeJson, date);
      const exRaw = extractRowsForDate(expenseJson, date);

      const finalIncome = inRaw.map(normIncome).filter((r) => r.amount || r.incomeWithdraw);
      const finalExpense = exRaw.map(normExpense).filter((r) => r.amount);

      setIncomeRows(finalIncome);
      setExpenseRows(finalExpense);
    } catch (e) {
      console.error(e);
      setErr("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [date, monthKey, extractRowsForDate]);

  useEffect(() => { load(); }, [load]);

  const incomeAgg = useMemo(() => aggIncomeByBig(incomeRows), [incomeRows]);
  const expenseAgg = useMemo(() => aggExpense(expenseRows), [expenseRows]);
  const totalIncome = incomeAgg.total;
  const totalExpense = expenseAgg.total;
  const net = totalIncome - totalExpense;

  const expenseByAcc = useMemo(() => aggByAccount(expenseRows, (r) => r.amount), [expenseRows]);
  const incomeWithdrawByAcc = useMemo(
    () => aggByAccount(incomeRows, (r) => r.incomeWithdraw || 0),
    [incomeRows]
  );
  const totalExpenseByAcc = useMemo(() => expenseByAcc.reduce((a, c) => a + c.sum, 0), [expenseByAcc]);
  const totalIncomeWithdraw = useMemo(
    () => incomeWithdrawByAcc.reduce((a, c) => a + c.sum, 0),
    [incomeWithdrawByAcc]
  );
  const reconciliation = useMemo(() => {
    const map = new Map();
    expenseByAcc.forEach(({ account, sum }) => map.set(account, { expense: sum, incomeW: 0, diff: -sum }));
    incomeWithdrawByAcc.forEach(({ account, sum }) => {
      const prev = map.get(account) || { expense: 0, incomeW: 0, diff: 0 };
      const m = { expense: prev.expense, incomeW: sum, diff: sum - prev.expense };
      map.set(account, m);
    });
    return Array.from(map.entries())
      .map(([account, v]) => ({ account, ...v }))
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [expenseByAcc, incomeWithdrawByAcc]);

  const [calOpen, setCalOpen] = useState(false);
  const dateAnchorRef = useRef(null);

  return (
    <div className="dcx-page dcx-compact">
      {/* 헤더/툴바 */}
      <div className="dcx-toolbar">
        <div className="left">
          <span className="mark">일마감</span>
          <span className="sub">Daily Closing</span>
        </div>
        <div className="right">
          <label className="dcx-label">마감일</label>

          <div className="datebox" ref={dateAnchorRef}>
            <button className="datepill" onClick={() => setCalOpen((v) => !v)} title="날짜 선택">
              <i className="ri-calendar-2-line" />
              <span>{date}</span>
            </button>
            <CalendarPopover
              anchorRef={dateAnchorRef}
              open={calOpen}
              valueYMD={date}
              onPick={(ymd) => setDate(ymd)}
              onClose={() => setCalOpen(false)}
            />
          </div>

          <button className="dcx-btn ghost" onClick={load} disabled={loading}>
            <i className="ri-refresh-line" />
            새로고침
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="dcx-kpis-row">
        <div className="dcx-kpi income">
          <div className="title">총 수입</div>
          <div className="amount"><span className="num">{fmt(totalIncome)}</span> 원</div>
          <div className="bar"><span style={{ width: totalIncome ? "100%" : "0%" }} /></div>
        </div>
        <div className="dcx-kpi expense">
          <div className="title">총 지출</div>
          <div className="amount"><span className="num">{fmt(totalExpense)}</span> 원</div>
          <div className="bar"><span style={{ width: totalExpense ? "100%" : "0%" }} /></div>
        </div>
        <div className={`dcx-kpi net ${net >= 0 ? "pos" : "neg"}`}>
          <div className="title">차액</div>
          <div className="amount"><span className="num">{fmt(net)}</span> 원</div>
          <div className="bar"><span /></div>
        </div>
      </div>

      {err ? <div className="dcx-error">{err}</div> : null}

      {/* 본문 3열 */}
      <div className="dcx-grid">
        {/* 수입(대분류 합계) */}
        <section className="dcx-card table">
          <header className="head income">
            <div className="title"><i className="ri-download-2-line" /><span>수입 (대분류 합계)</span></div>
            <div className="sum">합계 <b>{fmt(totalIncome)}</b> 원</div>
          </header>
          <div className="wrap">
            <table className="dcx-table compact">
              <thead>
                <tr>
                  <th>대분류</th>
                  <th className="right" style={{ width: "34%" }}>금액</th>
                </tr>
              </thead>
              <tbody>
                {incomeAgg.list.length === 0 ? (
                  <tr><td colSpan={2} className="center muted">데이터 없음</td></tr>
                ) : (
                  incomeAgg.list.map((g) => (
                    <tr key={g.big}>
                      <td className="bold">{g.big}</td>
                      <td className="right">{fmt(g.sum)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 지출(대분류/소분류/내용) */}
        <section className="dcx-card table">
          <header className="head expense">
            <div className="title"><i className="ri-upload-2-line" /><span>지출 (대분류/소분류/내용)</span></div>
            <div className="sum">합계 <b>{fmt(totalExpense)}</b> 원</div>
          </header>
          <div className="wrap">
            <table className="dcx-table compact">
              <thead>
                <tr>
                  <th style={{ width: "28%" }}>대분류</th>
                  <th style={{ width: "28%" }}>소분류</th>
                  <th>내용</th>
                  <th className="right" style={{ width: "20%" }}>합계</th>
                </tr>
              </thead>
              <tbody>
                {expenseAgg.groups.length === 0 ? (
                  <tr><td colSpan={4} className="center muted">데이터 없음</td></tr>
                ) : (
                  expenseAgg.groups.map((g) => (
                    <React.Fragment key={g.big}>
                      <tr className="row-group noarrow">
                        <td className="bold">{g.big}</td>
                        <td className="muted"></td>
                        <td className="muted"></td>
                        <td className="right bold">{fmt(g.sumBig)}</td>
                      </tr>
                      {g.subs.map((ss) => (
                        <tr key={`${g.big}-${ss.sub}`} className="row-sub clean">
                          <td className="muted"></td>
                          <td>{ss.sub}</td>
                          <td className="ellipsis" title={ss.content}>{ss.content}</td>
                          <td className="right">{fmt(ss.sum)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 출금계좌 대조 */}
        <section className="dcx-card recon">
          <header className="head neutral">
            <div className="title"><i className="ri-bank-card-line" /><span>출금계좌 대조</span></div>
            <div className="sum">
              <span className="tag">수입 출금합계 <b>{fmt(totalIncomeWithdraw)}</b></span>
              <span className="sep">·</span>
              <span className="tag">지출 합계 <b>{fmt(totalExpenseByAcc)}</b></span>
            </div>
          </header>
          <div className="wrap">
            <table className="dcx-table compact recon-table">
              <thead>
                <tr>
                  <th>계좌</th>
                  <th className="right">수입 출금</th>
                  <th className="right">지출 합계</th>
                  <th className="right">차액</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.length === 0 ? (
                  <tr><td colSpan={5} className="center muted">대조 데이터 없음</td></tr>
                ) : (
                  reconciliation.map((r) => {
                    const ok = Math.abs(r.diff) < 1;
                    return (
                      <tr key={r.account}>
                        <td className="mono">{r.account}</td>
                        <td className="right">{fmt(r.incomeW)}</td>
                        <td className="right">{fmt(r.expense)}</td>
                        <td className={`right ${ok ? "ok" : "warn"}`}>{fmt(r.diff)}</td>
                        <td><span className={`badge ${ok ? "ok" : "warn"}`}>{ok ? "일치" : "불일치"}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <div className="hint">* 지출의 356/352 등 계좌 합계는 해당 날짜 수입의 <b>출금금액</b>(계좌별)과 일치해야 합니다.</div>
          </div>
        </section>
      </div>

      {loading && (
        <div className="dcx-loading">
          <div className="dcx-spinner" />
          <div>불러오는 중…</div>
        </div>
      )}
    </div>
  );
}
