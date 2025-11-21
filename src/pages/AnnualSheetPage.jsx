// src/pages/AnnualSheetPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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

const MONTH_LABELS = [
  "1월","2월","3월","4월","5월","6월",
  "7월","8월","9월","10월","11월","12월"
];

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

/* 날짜 유틸 */
const daysInMonth = (y, m /*1-12*/) => new Date(y, m, 0).getDate();
const parseDate = (s) => {
  if (!s) return null;
  const [Y, M, D] = String(s).split("-").map(Number);
  if (!Y || !M || !D) return null;
  // 정오 기준으로 생성 (타임존 이슈 최소화)
  return new Date(Y, M - 1, D, 12);
};

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

/* ✅ 결제방법 정규화 */
const PAY_LABELS = ["356계좌","352계좌","지로계좌","선수금계좌","기업카드","현금"];
function normalizePayLabel(v) {
  const txt = String(v || "").trim();
  if (!txt) return "";
  const t = txt.toLowerCase();

  if (t.includes("356")) return "356계좌";
  if (t.includes("352")) return "352계좌";

  if (t.includes("지로") || t.includes("giro")) return "지로계좌";
  if (t.includes("선수")) return "선수금계좌";

  if (t.includes("기업카드") || t.includes("법인카드") || t.includes("카드") || t.includes("credit"))
    return "기업카드";

  if (t === "현" || t.includes("현금") || t.includes("cash")) return "현금";

  if (PAY_LABELS.includes(txt)) return txt;

  if (t.includes("nh") || t.includes("농협")) {
    if (t.includes("356")) return "356계좌";
    if (t.includes("352")) return "352계좌";
  }

  return "";
}

function inferPayFromText(r) {
  const txt = [r?.memo, r?.desc, r?.record, r?.content, r?.note]
    .map((v) => String(v || ""))
    .join(" ");
  return normalizePayLabel(txt);
}

function pickPayField(r) {
  const direct =
    r?.["출금방법"] ??
    r?.["결제방법"] ??
    r?.outMethod ??
    r?.payMethod ??
    r?.paymentMethod ??
    r?.payment ??
    r?.method ??
    r?.pay ??
    r?.withdrawMethod ??
    r?.["출금"] ??
    r?.["방법"] ??
    r?.["결제수단"];
  return direct;
}

function pickWithdrawAccount(r) {
  return (
    r?.["출금계좌"] ??
    r?.outMethod ??
    r?.withdrawAccount ??
    r?.account ??
    r?.accountName ??
    r?.bankAccount ??
    r?.bank ??
    r?.accountNo ??
    r?.["계좌"] ??
    r?.["계좌번호"] ??
    ""
  );
}

function normalizeExpenseFromStorageJson(json) {
  const rows = [];
  const pick = (r, ks) => {
    for (const k of ks) if (r && r[k] != null && r[k] !== "") return r[k];
    return "";
  };
  const push = (r, dateOverride) => {
    const date = ymd(dateOverride ?? r.date);
    const big =
      pick(r, ["mainName", "대분류", "main", "mainCategory", "big", "category"]) ||
      "(미지정)";
    const sub =
      pick(r, ["subName", "소분류", "sub", "subCategory", "smallCategory"]) ||
      "(소분류없음)";
    const amount = toNum(r.amount ?? r.outAmt);
    const memo = r.memo || r.record || r.desc || r.content || "";

    const withdrawAccount = String(pickWithdrawAccount(r) || "").trim();

    let pay = normalizePayLabel(pickPayField(r));
    if (!pay) pay = inferPayFromText(r);

    if (date)
      rows.push({
        date,
        big,
        sub,
        amount,
        memo,
        payMethod: pay,
        withdrawAccount,
      });
  };
  if (json && typeof json === "object") {
    if (Array.isArray(json.items)) json.items.forEach((r) => push(r));
    else if (json.items && typeof json.items === "object")
      Object.values(json.items).forEach((r) => push(r));
    if (json.days && typeof json.days === "object") {
      for (const d of Object.keys(json.days)) {
        const list = Array.isArray(json.days[d]?.rows)
          ? json.days[d].rows
          : [];
        list.forEach((r) => push(r, d));
      }
    }
  }
  return rows;
}

/* 수입: 카테고리 월별 합계 */
function categoryMonthMatrixByBuckets(rows, getBucketIdx) {
  const map = new Map();
  for (const r of rows) {
    const b = getBucketIdx(r.date);
    if (!b) continue;
    const key = r.category || "(미지정)";
    if (!map.has(key))
      map.set(key, { total: 0, months: Array(12).fill(0) });
    const obj = map.get(key);
    obj.total += toNum(r.amount);
    obj.months[b - 1] += toNum(r.amount);
  }
  return Array.from(map.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.total - a.total);
}

/* 지출: 대/소분류 월별 합계 */
function expenseBigSubGroupsByBuckets(rows, getBucketIdx) {
  const map = new Map();
  for (const r of rows) {
    const b = getBucketIdx(r.date);
    if (!b) continue;
    const big = r.big || "(미지정)";
    const sub = r.sub || "(소분류없음)";
    if (!map.has(big)) map.set(big, new Map());
    const subMap = map.get(big);
    if (!subMap.has(sub))
      subMap.set(sub, { total: 0, months: Array(12).fill(0) });
    const obj = subMap.get(sub);
    obj.total += toNum(r.amount);
    obj.months[b - 1] += toNum(r.amount);
  }
  const groups = [];
  map.forEach((subMap, big) => {
    const rowsArr = [];
    const bigMonths = Array(12).fill(0);
    subMap.forEach((data, sub) => {
      rowsArr.push({ sub, ...data });
      data.months.forEach(
        (v, i) => (bigMonths[i] += toNum(v))
      );
    });
    rowsArr.sort((a, b) => b.total - a.total);
    const bigTotal = rowsArr.reduce(
      (s, r) => s + toNum(r.total),
      0
    );
    groups.push({
      big,
      rows: rowsArr,
      total: bigTotal,
      months: bigMonths,
    });
  });
  groups.sort((a, b) =>
    String(a.big).localeCompare(String(b.big))
  );
  return groups;
}

/* ✅ 출금계좌별 월별 합계 */
function withdrawAccountMatrixByBuckets(rows, getBucketIdx) {
  const map = new Map();
  for (const r of rows) {
    const b = getBucketIdx(r.date);
    if (!b) continue;

    let label = String(r.withdrawAccount || "").trim();
    if (!label) {
      const pay = normalizePayLabel(r.payMethod || "");
      label = pay || "기타";
    }

    if (!map.has(label))
      map.set(label, { total: 0, months: Array(12).fill(0) });
    const obj = map.get(label);
    obj.total += toNum(r.amount);
    obj.months[b - 1] += toNum(r.amount);
  }
  return Array.from(map.entries())
    .map(([name, data]) => ({ name, ...data }))

    .sort((a, b) => b.total - a.total);
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
    ...income.map((x, i) =>
      Math.abs(toNum(x) - toNum(expense[i] || 0))
    )
  );
  const yScale = (v) =>
    padT + innerH - (innerH * toNum(v)) / maxVal;
  const xStep = innerW / 12;

  const net = income.map(
    (v, i) => toNum(v) - toNum(expense[i] || 0)
  );
  const netPts = net.map((v, i) => [
    padL + xStep * (i + 0.5),
    yScale(Math.max(0, v)),
  ]);

  return (
    <svg
      className="as-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="월별 수입/지출/순수익"
    >
      <g
        className="legend-left"
        transform={`translate(10, ${height - padB - 66})`}
      >
        <rect
          x="0"
          y="0"
          width="12"
          height="12"
          className="bar-inc"
          rx="2"
        />
        <text x="18" y="10" className="tick">
          수입
        </text>
        <rect
          x="0"
          y="22"
          width="12"
          height="12"
          className="bar-exp"
          rx="2"
        />
        <text x="18" y="32" className="tick">
          지출
        </text>
        <line
          x1="1"
          y1="54"
          x2="13"
          y2="54"
          className="line-net"
        />
        <circle
          cx="7"
          cy="54"
          r="2.5"
          className="net-point"
        />
        <text x="18" y="56" className="tick">
          순수익
        </text>
      </g>

      {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
        const y = padT + innerH * (1 - t);
        const val = Math.round(maxVal * t);
        return (
          <g key={`gy${idx}`}>
            <line
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              className="grid"
            />
            <text
              x={padL - 10}
              y={y}
              textAnchor="end"
              alignmentBaseline="middle"
              className="tick"
            >
              {fmtWon(val)}
            </text>
          </g>
        );
      })}

      {[...Array(13).keys()].map((i) => {
        const x = padL + xStep * i;
        return (
          <line
            key={`gx${i}`}
            x1={x}
            y1={padT}
            x2={x}
            y2={padT + innerH}
            className="grid-v"
          />
        );
      })}

      {income.map((v, i) => {
        const x = padL + xStep * i + xStep * 0.1;
        const w = xStep * 0.28;
        const y = yScale(v);
        const h = padT + innerH - y;
        return (
          <rect
            key={`inc${i}`}
            x={x}
            y={y}
            width={w}
            height={h}
            className="bar-inc"
            rx="4"
          />
        );
      })}
      {expense.map((v, i) => {
        const x = padL + xStep * i + xStep * 0.6;
        const w = xStep * 0.28;
        const y = yScale(v);
        const h = padT + innerH - y;
        return (
          <rect
            key={`exp${i}`}
            x={x}
            y={y}
            width={w}
            height={h}
            className="bar-exp"
            rx="4"
          />
        );
      })}

      <polyline
        points={netPts
          .map(([x, y]) => `${x},${y}`)
          .join(" ")}
        className="line-net"
        fill="none"
      />
      {netPts.map(([x, y], i) => (
        <circle
          key={`netp${i}`}
          cx={x}
          cy={y}
          r="3.5"
          className="net-point"
        />
      ))}

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
    </svg>
  );
}

/* ============ 메인 ============ */
export default function AnnualSheetPage() {
  const storage = getStorage();
  const now = new Date();

  const [year, setYear] = useState(
    Math.max(2025, now.getFullYear())
  );
  const [anchorDay, setAnchorDay] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [incomeRows, setIncomeRows] = useState([]);
  const [expenseRows, setExpenseRows] = useState([]);

  /* ✅ 섹션 스크롤용 ref */
  const incomeSectionRef = useRef(null);
  const expenseSectionRef = useRef(null);

  /* =========================
     ✅ 버킷 경계 생성 로직 (요청하신 집계 규칙으로 구현)
  ========================== */
  const bucketBoundaries = useMemo(() => {
    const bd = [];
    let prevEnd = null;

    for (let m = 1; m <= 12; m++) {
      let start;
      let end;

      if (anchorDay === 1) {
        const ld = daysInMonth(year, m);
        start = new Date(year, m - 1, 1, 0, 0, 0, 0);
        end = new Date(
          year,
          m - 1,
          ld,
          23,
          59,
          59,
          999
        );
      } else {
        const ldThis = daysInMonth(year, m);
        const startDay = Math.min(anchorDay, ldThis);
        start = new Date(
          year,
          m - 1,
          startDay,
          0,
          0,
          0,
          0
        );

        let nextYear = year;
        let nextMonth = m + 1;
        if (nextMonth === 13) {
          nextYear = year + 1;
          nextMonth = 1;
        }
        const ldNext = daysInMonth(nextYear, nextMonth);

        let endDay;
        if (anchorDay <= ldNext) {
          endDay = anchorDay - 1;
          if (endDay < 1) endDay = 1;
        } else {
          endDay = ldNext;
        }

        end = new Date(
          nextYear,
          nextMonth - 1,
          endDay,
          23,
          59,
          59,
          999
        );

        if (prevEnd && start <= prevEnd) {
          const s = new Date(prevEnd);
          s.setDate(s.getDate() + 1);
          start = new Date(
            s.getFullYear(),
            s.getMonth(),
            s.getDate(),
            0,
            0,
            0,
            0
          );
        }
        if (end < start) {
          end = new Date(
            start.getFullYear(),
            start.getMonth(),
            start.getDate(),
            23,
            59,
            59,
            999
          );
        }
      }

      bd.push({ start, end });
      prevEnd = end;
    }

    return bd;
  }, [year, anchorDay]);

  const getBucketIdx = useMemo(() => {
    return (dateStr) => {
      const d = parseDate(dateStr);
      if (!d) return null;
      for (let i = 0; i < 12; i++) {
        const { start, end } = bucketBoundaries[i];
        if (d >= start && d <= end) return i + 1;
      }
      return null;
    };
  }, [bucketBoundaries]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const months = Array.from(
          { length: 12 },
          (_, i) => i + 1
        );
        const incPromises = months.map((m) =>
          readJson(
            storage,
            `acct_income_json/${toMonthKey(year, m)}.json`
          )
        );
        const expPromises = months.map((m) =>
          readJson(
            storage,
            `acct_expense_json/${toMonthKey(year, m)}.json`
          )
        );

        incPromises.push(
          readJson(
            storage,
            `acct_income_json/${toMonthKey(year + 1, 1)}.json`
          )
        );
        expPromises.push(
          readJson(
            storage,
            `acct_expense_json/${toMonthKey(year + 1, 1)}.json`
          )
        );

        const [incs, exps] = await Promise.all([
          Promise.all(incPromises),
          Promise.all(expPromises),
        ]);
        if (cancelled) return;

        const incAll = incs.flatMap((j) =>
          normalizeIncomeFromStorageJson(j)
        );
        const expAll = exps.flatMap((j) =>
          normalizeExpenseFromStorageJson(j)
        );

        const globalStart = bucketBoundaries[0].start;
        const globalEnd = bucketBoundaries[11].end;

        const inRange = (r) => {
          const d = parseDate(r.date);
          return d && d >= globalStart && d <= globalEnd;
        };

        setIncomeRows(incAll.filter(inRange));
        setExpenseRows(expAll.filter(inRange));
      } catch (e) {
        console.error(e);
        if (!cancelled)
          setError("연간 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, storage, bucketBoundaries]);

  const monthIncome = useMemo(() => {
    const arr = Array(12).fill(0);
    for (const r of incomeRows) {
      const b = getBucketIdx(r.date);
      if (b) arr[b - 1] += toNum(r.amount);
    }
    return arr;
  }, [incomeRows, getBucketIdx]);

  const monthExpense = useMemo(() => {
    const arr = Array(12).fill(0);
    for (const r of expenseRows) {
      const b = getBucketIdx(r.date);
      if (b) arr[b - 1] += toNum(r.amount);
    }
    return arr;
  }, [expenseRows, getBucketIdx]);

  const totalIncome = useMemo(
    () => sum(monthIncome),
    [monthIncome]
  );
  const totalExpense = useMemo(
    () => sum(monthExpense),
    [monthExpense]
  );
  const netIncome = totalIncome - totalExpense;

  const incomeMatrix = useMemo(
    () =>
      categoryMonthMatrixByBuckets(
        incomeRows,
        getBucketIdx
      ),
    [incomeRows, getBucketIdx]
  );
  const expenseGroups = useMemo(
    () =>
      expenseBigSubGroupsByBuckets(
        expenseRows,
        getBucketIdx
      ),
    [expenseRows, getBucketIdx]
  );
  const withdrawAccountMatrix = useMemo(
    () =>
      withdrawAccountMatrixByBuckets(
        expenseRows,
        getBucketIdx
      ),
    [expenseRows, getBucketIdx]
  );

  const summaryRows = useMemo(() => {
    const rows = [
      {
        label: "수입",
        values: monthIncome,
        className: "sum-inc",
      },
      {
        label: "지출",
        values: monthExpense,
        className: "sum-exp",
      },
      {
        label: "순수익",
        values: monthIncome.map(
          (v, i) =>
            toNum(v) - toNum(monthExpense[i] || 0)
        ),
        className: "sum-net",
      },
      {
        label: "수익률",
        values: monthIncome.map((v, i) => {
          const inc = toNum(v),
            exp = toNum(monthExpense[i] || 0);
          if (inc === 0) return 0;
          return clamp(
            Math.round(((inc - exp) / inc) * 100),
            -999,
            999
          );
        }),
        isPercent: true,
        className: "sum-rate",
      },
    ];
    return rows;
  }, [monthIncome, monthExpense]);

  /* ✅ 연도 옵션: 2025 ~ 현재연도+5 */
  const yearOptions = useMemo(() => {
    const yNow = now.getFullYear();
    const YEARS_AHEAD = 5;
    const list = [];
    for (let y = 2025; y <= yNow + YEARS_AHEAD; y++)
      list.push(y);
    return list;
  }, [now]);

  const incomeMonthTotals = useMemo(() => {
    const arr = Array(12).fill(0);
    incomeMatrix.forEach((row) =>
      row.months.forEach(
        (v, i) => (arr[i] += toNum(v))
      )
    );
    return arr;
  }, [incomeMatrix]);
  const incomeGrandTotal = useMemo(
    () => sum(incomeMonthTotals),
    [incomeMonthTotals]
  );
  const incomeMonthlyAvg = useMemo(
    () =>
      Math.round(incomeGrandTotal / 12),
    [incomeGrandTotal]
  );

  const withdrawAccountMonthTotals = useMemo(() => {
    const arr = Array(12).fill(0);
    withdrawAccountMatrix.forEach((r) =>
      r.months.forEach(
        (v, i) => (arr[i] += toNum(v))
      )
    );
    return arr;
  }, [withdrawAccountMatrix]);
  const withdrawAccountGrandTotal = useMemo(
    () => sum(withdrawAccountMonthTotals),
    [withdrawAccountMonthTotals]
  );
  const withdrawAccountMonthlyAvg = useMemo(
    () =>
      Math.round(withdrawAccountGrandTotal / 12),
    [withdrawAccountGrandTotal]
  );

  /* ✅ 수입/지출 섹션 스크롤 버튼 핸들러 */
  const scrollToIncome = () => {
    incomeSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };
  const scrollToExpense = () => {
    expenseSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="annual-sheet as-wrap">
      {/* 헤더 */}
      <header className="as-header fancy as-header-sticky">
        <div className="as-header-row">
          {/* 현재 연도 */}
          <div className="as-year-block">
            <div className="as-year">
              <span className="as-year-num glam-year">
                {year}
              </span>
              <span className="as-year-sub glam-sub">
                Annual Closing
              </span>
            </div>
          </div>

          {/* 총수입/총지출/순수익 패널 */}
          <div className="as-metrics glam-metrics">
            <div className="metric inc glam-card">
              <div className="m-title glam-title">
                <i
                  className="ri-arrow-up-circle-line"
                  aria-hidden="true"
                />
                총 수입
              </div>
              <div className="m-value glam-value nowrap">
                ₩ {fmtWon(totalIncome)}
              </div>
            </div>
            <div className="metric exp glam-card">
              <div className="m-title glam-title">
                <i
                  className="ri-arrow-down-circle-line"
                  aria-hidden="true"
                />
                총 지출
              </div>
              <div className="m-value glam-value nowrap">
                ₩ {fmtWon(totalExpense)}
              </div>
            </div>
            <div
              className={`metric net glam-card ${
                netIncome >= 0 ? "good" : "bad"
              }`}
            >
              <div className="m-title glam-title">
                <i
                  className="ri-line-chart-line"
                  aria-hidden="true"
                />
                순 수익
              </div>
              <div className="m-value glam-value nowrap">
                ₩ {fmtWon(netIncome)}
              </div>
            </div>
          </div>

          {/* 수입이동/지출이동 버튼 (세로) */}
          <div className="as-nav-buttons">
            <button
              type="button"
              className="as-nav-btn inc-btn"
              onClick={scrollToIncome}
            >
              수입이동
            </button>
            <button
              type="button"
              className="as-nav-btn exp-btn"
              onClick={scrollToExpense}
            >
              지출이동
            </button>
          </div>

          {/* 연도 / 집계 (제목 위, 드롭다운 아래) */}
          <div className="as-controls-inline glam-controls">
            <div className="ctrl-block">
              <span className="sel-label">연도</span>
              <label className="year-select glam-select">
                <select
                  value={year}
                  onChange={(e) =>
                    setYear(Number(e.target.value))
                  }
                  aria-label="연도 선택"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="ctrl-block">
              <span className="sel-label">집계</span>
              <label className="year-select glam-select">
                <select
                  value={anchorDay}
                  onChange={(e) =>
                    setAnchorDay(
                      clamp(
                        Number(e.target.value),
                        1,
                        31
                      )
                    )
                  }
                  aria-label="집계 기준일 선택"
                  title="집계 기준일"
                >
                  {Array.from(
                    { length: 31 },
                    (_, i) => i + 1
                  ).map((d) => (
                    <option key={d} value={d}>
                      {d}일
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </header>

      {/* 차트 */}
      <section className="as-section">
        <div className="as-sec-title glam-sec">
          월별 수입 / 지출 / 순수익
        </div>
        <div className="as-chart-card">
          <AnnualChart
            income={monthIncome}
            expense={monthExpense}
          />
        </div>
      </section>

      {/* 요약표 */}
      <section className="as-section">
        <div className="as-sec-title glam-sec">
          수입/지출/순수익/수익률 정리
        </div>
        <div className="as-table-card">
          <div className="as-table-wrap">
            <table className="as-table sticky as-summary">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>항목</th>
                  <th className="num total">합계</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="num">
                      {m}
                    </th>
                  ))}
                  <th className="num">월평균</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row) => {
                  const total = sum(row.values);
                  const avg = Math.round(total / 12);
                  return (
                    <tr
                      key={row.label}
                      className={row.className}
                    >
                      <td className="label nowrap">
                        {row.label}
                      </td>
                      <td className="num total nowrap m-num-sm">
                        {row.isPercent
                          ? `${total}%`
                          : `₩ ${fmtWon(total)}`}
                      </td>
                      {row.values.map((v, i) => (
                        <td
                          key={i}
                          className="num nowrap m-num-sm"
                        >
                          {row.isPercent
                            ? `${v}%`
                            : `₩ ${fmtWon(v)}`}
                        </td>
                      ))}
                      <td className="num nowrap m-num-sm">
                        {row.isPercent
                          ? `${avg}%`
                          : `₩ ${fmtWon(avg)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 수입 정리 */}
      <section
        className="as-section"
        ref={incomeSectionRef}
      >
        <div className="as-sec-title glam-sec">
          수입 정리
        </div>
        <div className="as-table-card">
          <div className="as-table-wrap as-table-wrap-full">
            <table className="as-table sticky as-income">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>분류</th>
                  <th className="num total">합계</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="num">
                      {m}
                    </th>
                  ))}
                  <th className="num">평균</th>
                </tr>
              </thead>
              <tbody>
                {incomeMatrix.map((row) => {
                  const avg = Math.round(
                    toNum(row.total) / 12
                  );
                  return (
                    <tr key={row.category}>
                      <td className="label nowrap">
                        {row.category}
                      </td>
                      <td className="num total nowrap m-num-sm">
                        ₩ {fmtWon(row.total)}
                      </td>
                      {row.months.map((v, i) => (
                        <td
                          key={i}
                          className="num nowrap m-num-sm"
                        >
                          ₩ {fmtWon(v)}
                        </td>
                      ))}
                      <td className="num nowrap m-num-sm">
                        ₩ {fmtWon(avg)}
                      </td>
                    </tr>
                  );
                })}
                {!incomeMatrix.length && (
                  <tr>
                    <td
                      colSpan={15}
                      className="empty"
                    >
                      표시할 수입 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="label nowrap">
                    월별 합계
                  </td>
                  <td className="num total nowrap m-num-sm">
                    ₩ {fmtWon(incomeGrandTotal)}
                  </td>
                  {incomeMonthTotals.map((v, i) => (
                    <td
                      key={i}
                      className="num nowrap m-num-sm"
                    >
                      ₩ {fmtWon(v)}
                    </td>
                  ))}
                  <td className="num nowrap m-num-sm">
                    ₩ {fmtWon(incomeMonthlyAvg)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      {/* 지출 정리 */}
      <section
        className="as-section"
        ref={expenseSectionRef}
      >
        <div className="as-sec-title glam-sec">
          지출 정리
        </div>
        <div className="as-table-card">
          <div className="as-table-wrap as-table-wrap-full">
            <table className="as-table sticky as-expense">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>대분류</th>
                  <th style={{ width: 180 }}>소분류</th>
                  <th className="num total">합계</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="num">
                      {m}
                    </th>
                  ))}
                  <th className="num">평균</th>
                </tr>
              </thead>
              <tbody>
                {expenseGroups.map((g, gi) => {
                  if (!g.rows.length) {
                    return (
                      <tr key={`g_${gi}`}>
                        <td className="label nowrap">
                          {g.big}
                        </td>
                        <td className="label nowrap">
                          -
                        </td>
                        <td className="num total nowrap m-num-sm">
                          ₩ 0
                        </td>
                        {MONTH_LABELS.map((_, i) => (
                          <td
                            key={i}
                            className="num nowrap m-num-sm"
                          >
                            ₩ 0
                          </td>
                        ))}
                        <td className="num nowrap m-num-sm">
                          ₩ 0
                        </td>
                      </tr>
                    );
                  }
                  const body = g.rows.map((r, idx) => {
                    const avg = Math.round(
                      toNum(r.total) / 12
                    );
                    return (
                      <tr
                        key={`g_${gi}_${idx}`}
                      >
                        {idx === 0 ? (
                          <td
                            className="label nowrap"
                            rowSpan={g.rows.length + 1}
                          >
                            {g.big}
                          </td>
                        ) : null}
                        <td className="label nowrap">
                          {r.sub}
                        </td>
                        <td className="num total nowrap m-num-sm">
                          ₩ {fmtWon(r.total)}
                        </td>
                        {r.months.map((v, i) => (
                          <td
                            key={i}
                            className="num nowrap m-num-sm"
                          >
                            ₩ {fmtWon(v)}
                          </td>
                        ))}
                        <td className="num nowrap m-num-sm">
                          ₩ {fmtWon(avg)}
                        </td>
                      </tr>
                    );
                  });

                  const bigAvg = Math.round(
                    toNum(g.total) / 12
                  );
                  body.push(
                    <tr
                      key={`g_${gi}_subtotal`}
                      className="as-subtotal"
                    >
                      <td className="label nowrap">
                        합계
                      </td>
                      <td className="num total nowrap m-num-sm">
                        ₩ {fmtWon(g.total)}
                      </td>
                      {g.months.map((v, i) => (
                        <td
                          key={i}
                          className="num nowrap m-num-sm"
                        >
                          ₩ {fmtWon(v)}
                        </td>
                      ))}
                      <td className="num nowrap m-num-sm">
                        ₩ {fmtWon(bigAvg)}
                      </td>
                    </tr>
                  );
                  return body;
                })}
                {!expenseGroups.length && (
                  <tr>
                    <td
                      colSpan={16}
                      className="empty"
                    >
                      표시할 지출 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 지출 결제방법 → 출금계좌 기준 */}
      <section className="as-section">
        <div className="as-sec-title glam-sec">
          지출 결제방법
        </div>
        <div className="as-table-card">
          <div className="as-table-wrap">
            <table className="as-table sticky as-pay">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>분류</th>
                  <th className="num total">합계</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="num">
                      {m}
                    </th>
                  ))}
                  <th className="num">평균</th>
                </tr>
              </thead>
              <tbody>
                {withdrawAccountMatrix.map((row) => {
                  const avg = Math.round(
                    toNum(row.total) / 12
                  );
                  return (
                    <tr key={row.name}>
                      <td className="label nowrap">
                        {row.name}
                      </td>
                      <td className="num total nowrap m-num-sm">
                        ₩ {fmtWon(row.total)}
                      </td>
                      {row.months.map((v, i) => (
                        <td
                          key={i}
                          className="num nowrap m-num-sm"
                        >
                          ₩ {fmtWon(v)}
                        </td>
                      ))}
                      <td className="num nowrap m-num-sm">
                        ₩ {fmtWon(avg)}
                      </td>
                    </tr>
                  );
                })}
                {!withdrawAccountMatrix.length && (
                  <tr>
                    <td
                      colSpan={16}
                      className="empty"
                    >
                      표시할 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="label nowrap">
                    합계
                  </td>
                  <td className="num total nowrap m-num-sm">
                    ₩ {fmtWon(
                      withdrawAccountGrandTotal
                    )}
                  </td>
                  {withdrawAccountMonthTotals.map(
                    (v, i) => (
                      <td
                        key={i}
                        className="num nowrap m-num-sm"
                      >
                        ₩ {fmtWon(v)}
                      </td>
                    )
                  )}
                  <td className="num nowrap m-num-sm">
                    ₩ {fmtWon(
                      withdrawAccountMonthlyAvg
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      {loading && (
        <div className="as-overlay">
          <div className="as-loader">
            <span className="spin" /> 불러오는 중…
          </div>
        </div>
      )}
      {!!error && (
        <div className="as-overlay err">
          <div className="as-loader">
            <i className="ri-alert-line" /> {error}
          </div>
        </div>
      )}
    </div>
  );
}
