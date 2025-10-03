// src/pages/MobileCalendarPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./MobileCalendarPage.css";
import { db } from "../firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

/** ===== 공용 유틸(PC 버전과 동일) ===== */
const STATUS_COLORS = [
  { key: "darkgray", label: "짙은 회색" }, // 정산완료
  { key: "deepblue", label: "진한 파랑색" }, // 입금대기
  { key: "sky",      label: "하늘색" },     // 정산대기
  { key: "red",      label: "빨간색" },     // 보증금제외
  { key: "purple",   label: "보라색" },
  { key: "amber",    label: "노란색" },
  { key: "green",    label: "녹색" },       // 1차정산
];

const toNum = (v) => v === "" || v == null ? 0 : (Number(String(v).replace(/[,\s]/g, "")) || 0);
const sumExtrasFromArray = (extras) => (extras || []).reduce((acc, it) => acc + (Number(it?.amount || 0) || 0), 0);
const getExtraTotal = (x) => {
  const sx = Array.isArray(x.extras) ? sumExtrasFromArray(x.extras) : 0;
  return sx || toNum(x.extraAmount);
};
const sumTotal = (x) =>
  toNum(x.arrears) +
  toNum(x.currentMonth) +
  toNum(x.waterFee) +
  toNum(x.electricity) +
  toNum(x.tvFee) +
  toNum(x.cleaningFee) +
  getExtraTotal(x);
const fmtAmount = (n) => {
  const v = toNum(n);
  return v ? v.toLocaleString() : "0";
};

function pickColorKey(r) {
  const s = String(r.status || "");
  if (s === "정산완료") return "darkgray";
  if (s === "정산대기") {
    if (r.excludeDeposit) return "red";
    if (r.firstSettlement) return "green";
    return "sky";
  }
  if (s === "입금대기") {
    if (r.excludeDeposit) return "red";
    if (r.firstSettlement) return "green";
    return "deepblue";
  }
  return "sky";
}

function buildMonthGrid(y, m) {
  const first = new Date(y, m, 1);
  const firstDay = first.getDay();
  const start = new Date(y, m, 1 - firstDay);
  const grid = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    grid.push({ y: d.getFullYear(), m: d.getMonth(), d: d.getDate() });
  }
  return grid;
}
function yearOptions() {
  const t = new Date().getFullYear();
  const list = [];
  for (let y = t - 5; y <= t + 5; y++) list.push(y);
  return list;
}
const monthOptions = Array.from({ length: 12 }, (_, i) => i);

function isMatch(e, q) {
  const hay = [e.villaName, e.unitNumber, e.amount, e.note].map(s => (s || "").toLowerCase());
  const needle = q.toLowerCase();
  return hay.some(s => s.includes(needle));
}
function allMatches(events, q) {
  const m = events.filter((e) => isMatch(e, q));
  return m.sort((a, b) => {
    const da = new Date(a.y, a.m, a.d).getTime();
    const db = new Date(b.y, b.m, b.d).getTime();
    return da - db;
  });
}
const ORDER_STEP = 1000;
function sortByOrder(arr) {
  const withOrder = arr.map((e, idx) => ({
    ...e,
    _orderTmp: Number.isFinite(e.order) ? e.order : (idx + 1) * ORDER_STEP,
  }));
  withOrder.sort((a, b) => a._orderTmp - b._orderTmp || a.id.localeCompare(b.id));
  return withOrder;
}

/** ===== 모바일 읽기전용 캘린더 ===== */
export default function MobileCalendarPage() {
  const navigate = useNavigate();

  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [events, setEvents] = useState([]);
  const [queryText, setQueryText] = useState("");

  const contentRefs = useRef({});
  const cellRefs = useRef({});
  const setContentRef = (key) => (el) => {
    if (el) {
      contentRefs.current[key] = el;
      updateOverflowForKey(key, el);
    }
  };
  const setCellRef = (key) => (el) => {
    if (el) cellRefs.current[key] = el;
  };

  const [overflowMap, setOverflowMap] = useState({});
  const makeKey = (c) => `${c.y}-${c.m}-${c.d}`;

  const [moreOverlay, setMoreOverlay] = useState({
    open: false, key: null, x: 0, y: 0, w: 0, events: []
  });

  // ✅ 하단 상세 패널용 선택된 날짜 키
  const [selectedKey, setSelectedKey] = useState(null);
  // ✅ 하단 목록 아코디언(펼침) 제어
  const [expandedIds, setExpandedIds] = useState({});

  // ✅ 커스텀 드롭다운 상태
  const [openYear, setOpenYear] = useState(false);
  const [openMonth, setOpenMonth] = useState(false);

  const daysGrid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  // ✅ 주 단위로 분리, 현재달이 하나도 없는 주는 삭제
  const weeks = useMemo(() => {
    const arr = [];
    for (let i = 0; i < daysGrid.length; i += 7) arr.push(daysGrid.slice(i, i + 7));
    return arr.filter((wk) => wk.some((c) => c.m === month));
  }, [daysGrid, month]);

  /** Firestore 구독(읽기전용) */
  useEffect(() => {
    const q = query(collection(db, "moveouts"), orderBy("moveDate", "asc"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const mapped = list.map((r) => {
        const ymd = String(r.moveDate || "");
        let y = year, m = month, d = 1;
        if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
          y = parseInt(ymd.slice(0,4), 10);
          m = parseInt(ymd.slice(5,7), 10) - 1;
          d = parseInt(ymd.slice(8,10), 10);
        }
        const total = sumTotal(r);
        const colorKey = pickColorKey(r);
        return {
          id: r.id,
          y, m, d,
          villaName: r.villaName || "",
          unitNumber: r.unitNumber || "",
          amount: fmtAmount(total),
          statusKey: colorKey,
          note: r.note || "",
          raw: r,
          order: typeof r._order === "number" ? r._order : 0,
        };
      });
      setEvents(mapped);
    });
  }, []); // eslint-disable-line

  /** 검색 매치 하이라이트용 ID 집합 */
  const [matchedIdSet, setMatchedIdSet] = useState(() => new Set());

  /** 검색: Enter로 다음 결과로 이동(읽기전용) + 매치 하이라이트 */
  const [searchIndex, setSearchIndex] = useState(0);
  useEffect(() => {
    const q = queryText.trim();
    setSearchIndex(0);

    // 매치 집합 갱신 (달력 시각적 표시용)
    if (!q) {
      setMatchedIdSet(new Set());
      return;
    }
    const matches = allMatches(events, q);
    setMatchedIdSet(new Set(matches.map((m) => m.id)));

    // 첫 매치 달/연도로 이동
    if (matches.length > 0) {
      const first = matches[0];
      setYear(first.y);
      setMonth(first.m);
    }
  }, [queryText, events]);

  const onSearchKeyDown = (e) => {
    if (e.key !== "Enter") return;
    const q = queryText.trim();
    if (!q) return;
    const matches = allMatches(events, q);
    if (matches.length === 0) return;
    const nextIdx = (searchIndex + 1) % matches.length;
    const target = matches[nextIdx];
    setSearchIndex(nextIdx);
    setYear(target.y);
    setMonth(target.m);
  };

  /** 오버플로우 측정 → ‘N건 더보기’ */
  const updateOverflowForKey = (key, el = contentRefs.current[key]) => {
    if (!el) return;
    const items = el.querySelectorAll('[data-evpill="1"]');
    const visibleBottom = el.clientHeight;
    let visible = 0;
    items.forEach((it) => {
      if (it.offsetTop + it.offsetHeight <= visibleBottom) visible++;
    });
    const hiddenBelow = Math.max(0, items.length - visible);
    const bottom = hiddenBelow > 0;
    setOverflowMap((prev) => {
      const pv = prev[key] || {};
      if (pv.bottom === bottom && pv.hiddenBelow === hiddenBelow) return prev;
      return { ...prev, [key]: { bottom, hiddenBelow } };
    });
  };

  useEffect(() => {
    // 날짜/월 바뀌면 하단/오버레이 상태 초기화 + 드롭다운 닫기
    setSelectedKey(null);
    setExpandedIds({});
    setMoreOverlay({ open: false, key: null, x: 0, y: 0, w: 0, events: [] });
    setOpenYear(false);
    setOpenMonth(false);
  }, [year, month]);

  const openMoreOverlay = (key, cellObj, cellEvents) => {
    const el = cellRefs.current[key];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMoreOverlay({
      open: true,
      key,
      x: rect.left,
      y: rect.bottom + 6,
      w: rect.width,
      events: cellEvents,
    });
  };
  const closeMoreOverlay = () => setMoreOverlay({ open: false, key: null, x: 0, y: 0, w: 0, events: [] });

  // ✅ 선택된 날짜의 이벤트 목록(달력 표기용 내용)
  const selectedEvents = useMemo(() => {
    if (!selectedKey) return [];
    const [sy, sm, sd] = selectedKey.split("-").map((n) => parseInt(n, 10));
    return sortByOrder(events.filter((e) => e.y === sy && e.m === sm && e.d === sd));
  }, [selectedKey, events]);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /** 렌더 */
  return (
    <div className="mcal-page">
      {/* 헤더: 좌(뒤로가기) · 중앙(연/월 컨트롤) · 우(오늘) */}
      <div className="mcal-header mcal-header--3col">
        <button
          className="m-btn-back m-btn-back--pretty m-btn-back--small"
          onClick={() => navigate("/mobile/list")}
          aria-label="뒤로가기"
          title="뒤로가기"
        >
          ← 뒤로가기
        </button>

        <div className="mcal-header-center">
          <button
            className="m-btn-plain"
            onClick={() => { const d = new Date(year, month - 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); }}
            aria-label="이전달"
          >◀</button>

          {/* 커스텀 연/월 드롭다운 */}
          <div className="m-dd-wrap">
            <button
              type="button"
              className={`m-dd-trigger m-dd-trigger--year ${openYear ? "open" : ""}`}
              onClick={() => { setOpenYear(v => !v); setOpenMonth(false); }}
            >
              {year}년 <span className="m-dd-caret" />
            </button>
            {openYear && (
              <div className="m-dd-panel">
                <div className="m-dd-panel-inner">
                  {yearOptions().map((y) => (
                    <button
                      key={`yy-${y}`}
                      type="button"
                      className={`m-dd-item ${y === year ? "sel" : ""}`}
                      onClick={() => { setYear(y); setOpenYear(false); }}
                    >
                      {y}년
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="m-dd-wrap">
            <button
              type="button"
              className={`m-dd-trigger m-dd-trigger--month ${openMonth ? "open" : ""}`}
              onClick={() => { setOpenMonth(v => !v); setOpenYear(false); }}
            >
              {month + 1}월 <span className="m-dd-caret" />
            </button>
            {openMonth && (
              <div className="m-dd-panel">
                {/* 월: 1열 세로 목록 + 스크롤 없음 */}
                <div className="m-dd-panel-inner no-scroll">
                  {monthOptions.map((m) => (
                    <button
                      key={`mm-${m}`}
                      type="button"
                      className={`m-dd-item ${m === month ? "sel" : ""}`}
                      onClick={() => { setMonth(m); setOpenMonth(false); }}
                    >
                      {m + 1}월
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            className="m-btn-plain"
            onClick={() => { const d = new Date(year, month + 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); }}
            aria-label="다음달"
          >▶</button>
        </div>

        <div className="mcal-header-right">
          <button
            className="m-btn-primary"
            onClick={() => { const t = new Date(); setYear(t.getFullYear()); setMonth(t.getMonth()); }}
          >오늘</button>
        </div>

        {/* 검색은 전체 폭(다음 행) */}
        <input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="검색어"
          aria-label="검색"
          className="m-inp-search"
        />
      </div>

      {/* 요일 */}
      <div className="mcal-week-header">
        {["일","월","화","수","목","금","토"].map((d) => (
          <div key={d} className="mcal-week-cell">{d}</div>
        ))}
      </div>

      {/* 달력 그리드(주 단위) */}
      <div className="mcal-grid">
        {weeks.map((wk, widx) => (
          <React.Fragment key={`w-${widx}`}>
            {wk.map((cell) => {
              const key = makeKey(cell);
              const isCurrentMonth = cell.m === month;
              const cellEvents = sortByOrder(events.filter((e) => e.y === cell.y && e.m === cell.m && e.d === cell.d));

              const isToday =
                cell.y === today.getFullYear() &&
                cell.m === today.getMonth() &&
                cell.d === today.getDate();

              const ov = overflowMap[key] || { bottom: false, hiddenBelow: 0 };
              const isSelected = selectedKey === key;

              return (
                <div
                  key={key}
                  ref={setCellRef(key)}
                  className={`m-day ${isToday ? "m-day--today" : ""} ${isSelected ? "m-day--selected" : ""}`}
                  onClick={() => setSelectedKey(key)}
                >
                  <div className="m-daybar">
                    <div className={`m-daybar-date ${isCurrentMonth ? "m-daybar-date--curr" : "m-daybar-date--dim"}`}>
                      {cell.d}
                    </div>
                  </div>

                  {/* 이벤트 스택 */}
                  <div ref={setContentRef(key)} className="m-event-area">
                    <div className="m-event-stack">
                      {cellEvents.map((ev) => {
                        const isMatchHit = matchedIdSet.has(ev.id);
                        return (
                          <div
                            key={ev.id}
                            data-evpill="1"
                            className={`m-pill m-pill--${ev.statusKey || "sky"} ${isMatchHit ? "is-match" : ""}`}
                            title={`${(ev.villaName || "").trim()} ${(ev.unitNumber || "").trim()}   ${ev.amount}`}
                          >
                            <div className="m-pill-row">
                              <span className="m-pill-villa">{`${ev.villaName || ""} ${ev.unitNumber || ""}`.trim()}</span>
                              <span className="m-pill-amt">{ev.amount}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 더보기 */}
                  {ov.hiddenBelow > 0 && (
                    <div className="m-more-gradient">
                      <button
                        className="m-more-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (moreOverlay.open && moreOverlay.key === key) {
                            closeMoreOverlay();
                          } else {
                            openMoreOverlay(key, cell, cellEvents);
                          }
                        }}
                      >
                        {moreOverlay.open && moreOverlay.key === key ? "접기" : "더보기"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* 오버레이: 가려진 항목 목록 */}
      {moreOverlay.open && (
        <div
          id="mcal-more-overlay"
          className="m-more-overlay"
          style={{ left: moreOverlay.x, top: moreOverlay.y, width: moreOverlay.w }}
        >
          <div className="m-more-body">
            <div className="m-event-stack m-event-stack--overlay">
              {moreOverlay.events.map((ev) => {
                const isMatchHit = matchedIdSet.has(ev.id);
                return (
                  <div
                    key={`ov-${ev.id}`}
                    className={`m-pill m-pill--${ev.statusKey || "sky"} ${isMatchHit ? "is-match" : ""}`}
                    title={`${(ev.villaName || "").trim()} ${(ev.unitNumber || "").trim()}   ${ev.amount}`}
                  >
                    <div className="m-pill-row">
                      <span className="m-pill-villa">{`${ev.villaName || ""} ${ev.unitNumber || ""}`.trim()}</span>
                      <span className="m-pill-amt">{ev.amount}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 하단: 선택 날짜 목록(달력 표기 내용) + 클릭 시 아코디언(비고) */}
      {selectedKey && (
        <div className="mcal-bottom">
          <div className="mcal-bottom-head">
            <div className="mcal-bottom-title">
              {(() => {
                const [sy, sm, sd] = selectedKey.split("-").map((n)=>parseInt(n,10));
                return `${sy}-${String(sm+1).padStart(2,"0")}-${String(sd).padStart(2,"0")}`;
              })()}
            </div>
            <button className="m-btn-plain m-btn-plain--small" onClick={() => setSelectedKey(null)}>닫기</button>
          </div>
          <div className="mcal-bottom-list">
            {selectedEvents.length === 0 ? (
              <div className="mcal-bottom-empty">표시할 항목이 없습니다.</div>
            ) : (
              selectedEvents.map((ev) => {
                const opened = !!expandedIds[ev.id];
                return (
                  <div key={`sel-${ev.id}`} className="m-bottom-item">
                    <button
                      className={`m-bottom-pill m-pill m-pill--${ev.statusKey || "sky"} ${opened ? "open" : ""}`}
                      onClick={() => toggleExpand(ev.id)}
                      title="상세 펼치기"
                    >
                      <div className="m-pill-row">
                        <span className="m-pill-villa">{`${ev.villaName || ""} ${ev.unitNumber || ""}`.trim()}</span>
                        <span className="m-pill-amt">{ev.amount}</span>
                      </div>
                    </button>
                    {opened && ev.note && (
                      <div className="m-bottom-note">
                        {ev.note}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
