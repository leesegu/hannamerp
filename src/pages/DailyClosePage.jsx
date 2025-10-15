// ==================================
// 관리비회계 · 일마감 (Storage JSON · 정확집계 & 새 달력)
// 디자인 리뉴얼: 스타일만 변경 (로직·마크업 동일) + 요청사항 반영
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
const EXPENSE_ACCOUNT_KEYS = ["outMethod", "출금계좌", "account", "accountNo"]; // 결제방법
// 🔧 출금확인(드롭다운) — 지출정리 JSON에서는 'paid'로 저장됨
const EXPENSE_STATUS_KEYS = ["paid", "출금확인", "withdrawStatus", "status"];

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

// 지출의 결제방법 라벨은 그대로 보이도록 account에 원문 보존
const normExpense = (r) => {
  const big = s(pick(r, EXPENSE_BIG_KEYS)) || "지출";
  const sub = s(pick(r, EXPENSE_SUB_KEYS)) || "(소분류없음)";
  const descFrom = s(pick(r, EXPENSE_DESC_KEYS)) || "";
  const content = descFrom || sub;
  const amount = toNumber(pick(r, EXPENSE_AMOUNT_KEYS));
  const methodRaw = s(pick(r, EXPENSE_ACCOUNT_KEYS)); // 결제방법(출금계좌) 이름 그대로
  const account = methodRaw || "(미지정)";
  const status = s(pick(r, EXPENSE_STATUS_KEYS)) || ""; // ← 'paid' 포함해서 읽음
  return { kind: "expense", big, sub, content, amount, account, status, raw: r };
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

/** ✅ 수정: 지출은 '대분류'로만 묶고, 각 행을 그대로 items에 보관(내용/금액/소분류) */
const aggExpense = (rows) => {
  const map = new Map();
  let total = 0;
  rows.forEach((r) => {
    if (!r.amount) return;
    total += r.amount;
    const b = r.big || "(분류없음)";
    const bucket = map.get(b) || { sumBig: 0, items: [] };
    bucket.sumBig += r.amount;
    // 원본 순서대로 보관
    bucket.items.push({ sub: r.sub || "(소분류없음)", content: r.content || r.sub || "", amount: r.amount });
    map.set(b, bucket);
  });

  const groups = [];
  for (const [big, { sumBig, items }] of map.entries()) {
    groups.push({ big, sumBig, items }); // items: [{sub, content, amount}, ...]
  }
  // 대분류 합계 기준 내림차순(기존 정렬 유지)
  groups.sort((a, b) => b.sumBig - a.sumBig);
  return { groups, total };
};

/* ===== 356/352 전용 매핑 & 대조 ===== */

// 수입 출금: 계좌번호 앞 3자리 → '356계좌' / '352계좌'
const prefixTag356352 = (accountDigits) => {
  const p = String(accountDigits || "").slice(0, 3);
  if (p === "356") return "356계좌";
  if (p === "352") return "352계좌";
  return null;
};

// 지출 결제방법: 표시 이름 그대로 사용하되, 비교를 위해 356/352 키로 매핑
const methodTag356352 = (methodLabel) => {
  const dig = onlyDigits(methodLabel);
  return prefixTag356352(dig);
};

const sumBy = (rows, keyFn, amountFn) => {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    const amt = amountFn(r);
    if (!k || !(amt > 0)) return;
    m.set(k, (m.get(k) || 0) + amt);
  });
  return m;
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

      // 🔑 지출은 출금확인 = '출금완료'만 반영 (키에 'paid' 추가됨)
      const finalExpense = exRaw
        .map(normExpense)
        .filter((r) => r.amount && r.status === "출금완료");

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

  /* ===== 수입/지출 집계 ===== */
  const incomeAgg = useMemo(() => aggIncomeByBig(incomeRows), [incomeRows]);
  const expenseAgg = useMemo(() => aggExpense(expenseRows), [expenseRows]);
  const totalIncome = incomeAgg.total;
  const totalExpense = expenseAgg.total;
  const net = totalIncome - totalExpense;

  /* ===== 356/352 전용 출금계좌 대조 ===== */
  const incomeWithdrawMap = useMemo(() => {
    return sumBy(
      incomeRows,
      (r) => prefixTag356352(onlyDigits(r.account)),
      (r) => r.incomeWithdraw || 0
    );
  }, [incomeRows]);
  const iw356 = incomeWithdrawMap.get("356계좌") || 0;
  const iw352 = incomeWithdrawMap.get("352계좌") || 0;

  const expenseByMethodAll = useMemo(() => {
    const m = new Map();
    expenseRows.forEach((r) => {
      const label = r.account || "(미지정)";
      const prev = m.get(label) || 0;
      m.set(label, prev + (r.amount || 0));
    });
    return m;
  }, [expenseRows]);

  const expenseByMethodFull = useMemo(() => {
    const m = new Map();
    expenseRows.forEach((r) => {
      const tag = methodTag356352(r.account);
      if (!tag) return;
      const shownAccountName = r.account;
      const prev = m.get(tag) || { label: shownAccountName, sum: 0 };
      const label = prev.label || shownAccountName;
      m.set(tag, { label, sum: prev.sum + (r.amount || 0) });
    });
    return m;
  }, [expenseRows]);
  const ex356 = expenseByMethodFull.get("356계좌")?.sum || 0;
  const ex352 = expenseByMethodFull.get("352계좌")?.sum || 0;
  const ex356Label = expenseByMethodFull.get("356계좌")?.label || "356계좌";
  const ex352Label = expenseByMethodFull.get("352계좌")?.label || "352계좌";

  const reconciliation = useMemo(() => {
    const rows = [];
    expenseByMethodAll.forEach((sum, label) => {
      const tag = methodTag356352(label);
      const incomeW = tag ? (incomeWithdrawMap.get(tag) || 0) : 0;
      rows.push({ account: label, incomeW, expense: sum, diff: incomeW - sum });
    });
    ["356계좌", "352계좌"].forEach((tag) => {
      const incomeW = incomeWithdrawMap.get(tag) || 0;
      if (incomeW > 0) {
        const present = rows.some((r) => methodTag356352(r.account) === tag);
        if (!present) {
          rows.push({ account: tag, incomeW, expense: 0, diff: incomeW - 0 });
        }
      }
    });
    rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return rows;
  }, [expenseByMethodAll, incomeWithdrawMap]);

  const totalIncomeWithdraw = useMemo(() => iw356 + iw352, [iw356, iw352]);
  const totalExpenseByAcc = useMemo(() => ex356 + ex352, [ex356, ex352]);

  const [calOpen, setCalOpen] = useState(false);
  const dateAnchorRef = useRef(null);

  /* --------------------------------------------
   * ✅ 추가: "최근 10일 불일치" 스캔 & 버튼/펼침 패널(오버레이)
   *  - 버튼 바로 아래에 겹쳐서 펼쳐짐(레이아웃 밀어내지 않음)
   *  - 패널 폭 축소
   *  - 제목 문구: "출금계좌 대조 불일치"
   * -------------------------------------------- */
  const [recentMismatches, setRecentMismatches] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [showMismatch, setShowMismatch] = useState(false);
  const mismatchWrapRef = useRef(null);      // ✅ 추가: 오버레이 닫기용 외부클릭
  useOutsideClick(mismatchWrapRef, () => setShowMismatch(false)); // ✅ 추가

  // 재사용: 날짜별 대조 행 계산
  const computeReconciliationRows = useCallback((inRows, exRows) => {
    const iwMap = sumBy(
      inRows,
      (r) => prefixTag356352(onlyDigits(r.account)),
      (r) => r.incomeWithdraw || 0
    );
    const expByMethodAll = new Map();
    exRows.forEach((r) => {
      const label = r.account || "(미지정)";
      expByMethodAll.set(label, (expByMethodAll.get(label) || 0) + (r.amount || 0));
    });

    const rows = [];
    expByMethodAll.forEach((sum, label) => {
      const tag = methodTag356352(label);
      const incomeW = tag ? (iwMap.get(tag) || 0) : 0;
      rows.push({ account: label, incomeW, expense: sum, diff: incomeW - sum });
    });
    ["356계좌", "352계좌"].forEach((tag) => {
      const incomeW = iwMap.get(tag) || 0;
      if (incomeW > 0) {
        const present = rows.some((r) => methodTag356352(r.account) === tag);
        if (!present) rows.push({ account: tag, incomeW, expense: 0, diff: incomeW - 0 });
      }
    });
    rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return rows;
  }, []);

  const loadRecentMismatches = useCallback(async () => {
    setRecentLoading(true);
    try {
      const today = new Date();
      const dates = [];
      for (let i = 0; i <= 10; i++) { // 오늘 포함 ~ 10일 전 (포함)
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        dates.push(toYMD(d));
      }

      // 필요한 monthKey 미리 모아 한 번만 가져오기 (월 경계 대응)
      const needMonths = Array.from(new Set(dates.map(monthKeyFromYMD)));
      const [incomePacks, expensePacks] = await Promise.all([
        Promise.all(needMonths.map((mk) => fetchMonthJson("acct_income_json", mk))),
        Promise.all(needMonths.map((mk) => fetchMonthJson("acct_expense_json", mk))),
      ]);
      const incomeByMonth = new Map(needMonths.map((mk, i) => [mk, incomePacks[i] || {}]));
      const expenseByMonth = new Map(needMonths.map((mk, i) => [mk, expensePacks[i] || {}]));

      const results = [];
      for (const ymd of dates) {
        const mk = monthKeyFromYMD(ymd);
        const incomeJson = incomeByMonth.get(mk) || {};
        const expenseJson = expenseByMonth.get(mk) || {};

        const inRaw = extractRowsForDate(incomeJson, ymd);
        const exRaw = extractRowsForDate(expenseJson, ymd);

        const inRows = inRaw.map(normIncome).filter((r) => r.amount || r.incomeWithdraw);
        const exRows = exRaw.map(normExpense).filter((r) => r.amount && r.status === "출금완료");

        const recRows = computeReconciliationRows(inRows, exRows);
        recRows.forEach((r, idx) => {
          if (Math.abs(r.diff) >= 1) {
            results.push({ date: ymd, account: r.account, incomeW: r.incomeW, expense: r.expense, diff: r.diff, idx });
          }
        });
      }

      // 정렬: 날짜 내림차순 → 차액 절대값 큰 순
      results.sort((a, b) => (a.date === b.date ? Math.abs(b.diff) - Math.abs(a.diff) : b.date.localeCompare(a.date)));
      setRecentMismatches(results);
    } catch (e) {
      console.error(e);
      setRecentMismatches([]);
    } finally {
      setRecentLoading(false);
    }
  }, [computeReconciliationRows, extractRowsForDate]);

  // 최초 진입 시 10일 스캔
  useEffect(() => { loadRecentMismatches(); }, [loadRecentMismatches]);

  return (
    <div className="dcx-page dcx-compact">
      {/* 헤더/툴바 */}
      <div className="dcx-toolbar">
        <div className="left">
          <span className="mark">일마감</span>
          <span className="sub">Daily Closing</span>

          {/* ✅ 추가: 버튼 + 오버레이 래퍼 (겹쳐서 펼쳐짐) */}
          <span className="mismatch-wrap" ref={mismatchWrapRef}>
            <button
              className={`dcx-mismatch-btn ${recentMismatches.length > 0 ? "warn" : "ok"}`}
              onClick={() => setShowMismatch((v) => !v)}
              title="최근 10일 출금계좌 대조 불일치 확인"
            >
              <i className="ri-error-warning-line" />
              <span className="txt">불일치</span>
              <span className="cnt">{recentLoading ? "..." : `${recentMismatches.length}건`}</span>
              <i className={`ri-arrow-${showMismatch ? "up" : "down"}-s-line caret`} />
            </button>

            {/* ✅ 수정: 아래 패널들을 밀지 않고 버튼 아래로 '겹쳐서' 펼쳐지는 팝오버 */}
            {showMismatch && (
              <section className="dcx-alert-pop">
                <header className="alert-head">
                  <div className="lh">
                    <i className="ri-error-warning-line" />
                    <span>출금계좌 대조 불일치</span> {/* ✅ 수정: 명칭 변경 */}
                    {!recentLoading && recentMismatches.length === 0 && <em className="oktext">모두 일치</em>}
                  </div>
                  <div className="rh">
                    <button className="dcx-btn tiny ghost" onClick={loadRecentMismatches} disabled={recentLoading}>
                      <i className="ri-refresh-line" />
                      {recentLoading ? "확인 중…" : "다시 확인"}
                    </button>
                  </div>
                </header>
                <div className="alert-list">
                  {recentLoading ? (
                    <div className="alert-loading">
                      <div className="dcx-spinner" />
                      <span>최근 10일 대조 결과 확인 중…</span>
                    </div>
                  ) : (
                    recentMismatches.map((m, i) => (
                      <button
                        key={`${m.date}-${m.account}-${i}`}
                        className="alert-item"
                        title="해당 날짜로 이동"
                        onClick={() => { setDate(m.date); setShowMismatch(false); }}
                      >
                        <span className="d">{m.date}</span>
                        <span className="acc">{m.account}</span>
                        <span className="amt">
                          <b>{fmt(m.incomeW)}</b> / {fmt(m.expense)}
                        </span>
                        <span className={`diff ${Math.abs(m.diff) < 1 ? "ok" : "warn"}`}>{fmt(m.diff)}</span>
                      </button>
                    ))
                  )}
                </div>
              </section>
            )}
          </span>
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
            <div className="title"><i className="ri-download-2-line" /><span>수입</span></div>
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

        {/* 지출(대분류/소분류/내용) — 각 행을 원본대로 표시 */}
        <section className="dcx-card table">
          <header className="head expense">
            <div className="title"><i className="ri-upload-2-line" /><span>지출</span></div>
            <div className="sum">합계 <b>{fmt(totalExpense)}</b> 원</div>
          </header>
          <div className="wrap">
            <table className="dcx-table compact">
              <thead>
                <tr>
                  <th style={{ width: "28%" }}>대분류</th>
                  <th style={{ width: "28%" }}>소분류</th>
                  <th>내용</th>
                  <th className="right" style={{ width: "20%" }}>금액</th>
                </tr>
              </thead>
              <tbody>
                {expenseAgg.groups.length === 0 ? (
                  <tr><td colSpan={4} className="center muted">데이터 없음</td></tr>
                ) : (
                  expenseAgg.groups.map((g) => (
                    <React.Fragment key={g.big}>
                      {g.items.length === 0 ? (
                        <tr>
                          <td className="bold">
                            <div className="bigcell">
                              <div className="name">{g.big}</div>
                              <div className="sumline">{fmt(g.sumBig)} 원</div>
                            </div>
                          </td>
                          <td className="muted"></td>
                          <td className="muted"></td>
                          <td className="right">{fmt(g.sumBig)}</td>
                        </tr>
                      ) : (
                        g.items.map((ss, idx) => (
                          <tr key={`${g.big}-${idx}`} className="row-sub clean">
                            <td>
                              {idx === 0 ? (
                                <div className="bigcell">
                                  <div className="name">{g.big}</div>
                                  <div className="sumline">{fmt(g.sumBig)} 원</div>
                                </div>
                              ) : (
                                <span className="muted"></span>
                              )}
                            </td>
                            <td>{ss.sub}</td>
                            <td className="ellipsis" title={ss.content}>{ss.content}</td>
                            <td className="right">{fmt(ss.amount)}</td>
                          </tr>
                        ))
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 출금계좌 대조 — 모든 지출 결제방법 라벨 표시, 356/352는 수입 출금과 비교 */}
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
                  reconciliation.map((r, i) => {
                    const ok = Math.abs(r.diff) < 1;
                    return (
                      <tr key={`${r.account}-${i}`}>
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
            <div className="hint">* 356/352 계좌 지출 합계는 같은 날 수입의 <b>출금금액</b>(356/352)과 일치해야 합니다.</div>
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