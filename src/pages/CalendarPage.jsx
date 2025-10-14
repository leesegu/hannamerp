// src/pages/CalendarPage.jsx
import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import "./CalendarPage.css";
import { db } from "../firebase";
import {
  collection, onSnapshot, query, orderBy,
  updateDoc, doc, writeBatch,
} from "firebase/firestore";

/**
 * 변경 요약
 * - 등록 기능 제거 (날짜 셀 클릭 시 신규 모달 없음)
 * - Firestore `moveouts`와 실시간 양방향 연동 (수정/날짜 이동/동일 날짜 재정렬)
 * - 팝오버: 빌라명/호수 2열 + 금액 입력창은 읽기전용
 * - 삭제 버튼/기능 제거
 * - 진행현황 드롭다운 펼침 시 팝오버 스크롤 안생김(overflow: visible)
 * - ✅ 같은 날짜에서 임의 위치로 재정렬 (앞/중간/마지막) + _order 평균값/리넘버링
 * - ✅ "가려진 항목 더보기"는 오버레이로 펼침 (오버레이 항목 사이즈/폰트 = 달력과 동일)
 *
 * 추가 수정(요청 반영):
 * - ✅ "가려진 항목 더보기" 버튼을 토글로 동작: 펼친 상태에서 다시 클릭하면 접힘
 * - ✅ 오버레이 하단 잘림 방지: 아래쪽에서도 잘리지 않도록 화면 하단에 고정 배치(조건부) + 컨테이너 overflow:auto
 * - ✅ 오버레이의 X 버튼으로도 닫기 가능
 * - ✅ 팝오버의 제목 헤더 제거
 * - ✅ (이번 요청) 검색:
 *      · 한 단어 → 부분 일치(contains)
 *      · 두 단어 이상 → (빌라명 + 공백 + 호수) "완전 일치"만
 *   그리고 가려진 항목 버튼에 "숨은 일치 개수" 배지 표시
 */

const STATUS_COLORS = [
  { key: "darkgray", label: "짙은 회색" }, // 정산완료
  { key: "deepblue", label: "진한 파랑색" }, // 입금대기
  { key: "sky",      label: "하늘색" },     // 정산대기
  { key: "red",      label: "빨간색" },     // 보증금제외 플래그
  { key: "purple",   label: "보라색" },
  { key: "amber",    label: "노란색" },
  { key: "green",    label: "녹색" },       // 1차정산 플래그
];

/* ===== 공통 유틸 (총액 계산) ===== */
const toNum = (v) =>
  v === "" || v == null ? 0 : (Number(String(v).replace(/[,\s]/g, "")) || 0);
const sumExtrasFromArray = (extras) =>
  (extras || []).reduce((acc, it) => acc + (Number(it?.amount || 0) || 0), 0);
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

/* ===== 정렬 관련 상수 ===== */
const ORDER_STEP = 1000;
const ORDER_EPS = 1e-6; // 간격이 너무 좁을 때 판단용

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  // Firestore moveouts → 캘린더 이벤트로 매핑
  const [events, setEvents] = useState([]);
  const [queryText, setQueryText] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);

  // 팝오버
  const containerRef = useRef(null);
  const popoverRef = useRef(null);
  const anchorElRef = useRef(null);
  const [popover, setPopover] = useState({ open: false, id: null, x: 0, y: 0, w: 0, h: 0, positioned: false });

  // 하이라이트
  const [highlightId, setHighlightId] = useState(null);

  // 드래그 상태
  const [dragState, setDragState] = useState({ dragId: null, overId: null, overYMD: null });

  // 날짜 셀/콘텐츠 레퍼런스
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

  // 오버플로우/더보기
  const [overflowMap, setOverflowMap] = useState({});
  const makeKey = (c) => `${c.y}-${c.m}-${c.d}`;

  // 가려진 항목 오버레이 상태
  const [moreOverlay, setMoreOverlay] = useState({
    open: false, key: null, x: 0, y: 0, w: 0, events: [],
    useBottom: false, // true면 bottom 고정 배치
    b: 0,             // bottom 값(px)
  });

  const updateOverflowForKey = (key, el = contentRefs.current[key]) => {
    if (!el) return;
    const items = el.querySelectorAll('[data-evpill="1"]');
    const visibleBottom = el.clientHeight;
    let visible = 0;
    items.forEach((it) => {
      if (it.offsetTop + it.offsetHeight <= visibleBottom) visible++;
    });
    const hiddenBelow = Math.max(0, items.length - visible);
    const top = false;
    const bottom = hiddenBelow > 0;
    setOverflowMap((prev) => {
      const pv = prev[key] || {};
      if (pv.top === top && pv.bottom === bottom && pv.hiddenBelow === hiddenBelow) return prev;
      return { ...prev, [key]: { top, bottom, hiddenBelow } };
    });
  };

  // 월 그리드
  const daysGrid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  /* ================= Firestore 구독 ================= */
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
          amount: fmtAmount(total), // 총액 표시
          statusKey: colorKey,
          note: r.note || "",
          raw: r, // 원본 필드 접근용
          order: typeof r._order === "number" ? r._order : 0, // 정렬용
        };
      });
      setEvents(mapped);
    });
  }, []); // eslint-disable-line

  /* ===== 색상 규칙 결정(표시용) ===== */
  function pickColorKey(r) {
    const s = String(r.status || "");

    // 정산완료는 항상 회색
    if (s === "정산완료") return "darkgray";

    // 정산대기: 기본 하늘색, 플래그 반영
    if (s === "정산대기") {
      if (r.excludeDeposit) return "red";
      if (r.firstSettlement) return "green";
      return "sky";
    }

    // 입금대기: 기본 진한파랑, 플래그 반영
    if (s === "입금대기") {
      if (r.excludeDeposit) return "red";
      if (r.firstSettlement) return "green";
      return "deepblue";
    }

    // 그 외/미지정 상태는 하늘색
    return "sky";
  }

  /* ===== 검색 ===== */
  useEffect(() => {
    const q = queryText.trim();
    setSearchIndex(0);
    if (!q) { setHighlightId(null); return; }
    const matches = allMatches(events, q);
    if (matches.length > 0) {
      const first = matches[0];
      if (first.y !== year || first.m !== month) {
        setYear(first.y);
        setMonth(first.m);
      }
      setHighlightId(first.id);
      const timer = setTimeout(() => setHighlightId(null), 2500);
      return () => clearTimeout(timer);
    } else {
      setHighlightId(null);
    }
  }, [queryText, events]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setHighlightId(target.id);
    setTimeout(() => setHighlightId(null), 2500);
  };

  /* ===== 팝오버 배치 ===== */
  const clampToContainer = (x, y, w, h, M = 10) => {
    const rect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const minX = rect.left + M;
    const maxX = rect.right - w - M;
    const minY = rect.top + M;
    const maxY = rect.bottom - h - M;
    return { x: Math.max(minX, Math.min(x, maxX)), y: Math.max(minY, Math.min(y, maxY)) };
  };
  const placePopoverNearRect = (anchorRect, popW, popH) => {
    const M = 10;
    const BASE_EXTRA = 24;
    const cont = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const leftSpace   = anchorRect.left - cont.left - M;
    const rightSpace  = cont.right - anchorRect.right - M;
    const aboveSpace  = anchorRect.top - cont.top - M;
    const belowSpace  = cont.bottom - anchorRect.bottom - M;
    const bottomZoneCutoff = cont.top + (cont.bottom - cont.top) * 0.70;

    const placeRight = rightSpace >= leftSpace;
    let x = placeRight ? (anchorRect.right + M) : (anchorRect.left - popW - M);

    let forceAbove = false;
    if (belowSpace < popH + M) forceAbove = true;
    if (anchorRect.bottom >= bottomZoneCutoff) forceAbove = true;

    let y;
    if (forceAbove) {
      const shortage = Math.max(0, (popH + M) - aboveSpace);
      const EXTRA = BASE_EXTRA + shortage;
      y = anchorRect.top - popH - M - EXTRA;
    } else if (aboveSpace < popH + M) {
      y = anchorRect.bottom + M;
    } else {
      y = belowSpace >= aboveSpace ? (anchorRect.bottom + M) : (anchorRect.top - popH - M);
    }
    return clampToContainer(x, y, popW, popH, M);
  };
  const measureAndPlacePopover = () => {
    if (!popover.open) return;
    const el = popoverRef.current;
    if (!el) return;
    const popRect = el.getBoundingClientRect();
    const anchorRect = anchorElRef.current?.getBoundingClientRect() || popRect;
    const { x, y } = placePopoverNearRect(anchorRect, popRect.width, popRect.height);
    setPopover((p) => ({ ...p, x, y, w: popRect.width, h: popRect.height, positioned: true }));
  };
  const openPopover = (ev, domEvent) => {
    anchorElRef.current = domEvent.currentTarget;
    setPopover({ open: true, id: ev.id, x: -9999, y: -9999, w: 0, h: 0, positioned: false });
  };
  const closePopover = () => {
    setPopover({ open: false, id: null, x: 0, y: 0, w: 0, h: 0, positioned: false });
    anchorElRef.current = null;
  };
  useLayoutEffect(() => {
    if (popover.open && !popover.positioned) {
      const r = requestAnimationFrame(measureAndPlacePopover);
      return () => cancelAnimationFrame(r);
    }
  }, [popover.open, popover.positioned, popover.id]);
  useEffect(() => {
    if (!popover.open) return;
    const handler = () => measureAndPlacePopover();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [popover.open]);

  /* ===== 드래그 앤 드롭 ===== */
  const onDragStart = (e, ev) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: ev.id, y: ev.y, m: ev.m, d: ev.d }));
    setDragState({ dragId: ev.id, overId: null, overYMD: { y: ev.y, m: ev.m, d: ev.d } });
    const ghost = document.createElement("div");
    ghost.style.width = "1px"; ghost.style.height = "1px"; ghost.style.opacity = "0";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };
  const clearDragState = () => setDragState({ dragId: null, overId: null, overYMD: null });

  // 날짜 변경 (셀 바닥으로 드롭)
  const onDropToDate = async (e, targetCell) => {
    e.preventDefault();
    const payload = safeParseDrag(e.dataTransfer.getData("text/plain"));
    if (!payload?.id) return;

    const dragged = events.find(x => x.id === payload.id);
    if (!dragged) return;

    // 날짜가 바뀌면 moveDate 업데이트 (순서값은 그 날짜의 맨 끝으로)
    if (dragged.y !== targetCell.y || dragged.m !== targetCell.m || dragged.d !== targetCell.d) {
      const y = targetCell.y;
      const m = targetCell.m + 1;
      const d = targetCell.d;
      const ymd = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

      const dayEvts = dayEvents(events, y, targetCell.m, d).sort((a,b)=>a.order-b.order);
      const last = dayEvts[dayEvts.length-1];
      const newOrder = last ? last.order + ORDER_STEP : ORDER_STEP;

      try {
        await updateDoc(doc(db, "moveouts", dragged.id), { moveDate: ymd, _order: newOrder });
        setEvents(prev => prev.map(e => e.id===dragged.id ? { ...e, y: y, m: targetCell.m, d: d, order: newOrder, raw: { ...e.raw, moveDate: ymd, _order: newOrder } } : e));
      } catch (err) {
        console.error("moveDate 변경 실패:", err);
        alert("날짜 이동 중 오류가 발생했습니다.");
      }
    }
    clearDragState();
  };

  // 동일 날짜 내, targetEvent "앞"에 떨어뜨리기
  const onDropBeforeTarget = async (e, targetEvent) => {
    e.preventDefault();
    const payload = safeParseDrag(e.dataTransfer.getData("text/plain"));
    if (!payload?.id) return;

    const dragged = events.find(x => x.id === payload.id);
    if (!dragged) return;

    if (!(dragged.y === targetEvent.y && dragged.m === targetEvent.m && dragged.d === targetEvent.d)) {
      setDragState({ dragId: null, overId: null, overYMD: null });
      return;
    }

    const y = dragged.y, m = dragged.m, d = dragged.d;
    const day = dayEvents(events, y, m, d).sort((a,b)=>a.order-b.order);
    const tIdx = day.findIndex(x => x.id === targetEvent.id);
    if (tIdx < 0) { clearDragState(); return; }

    const prevEvt = day[tIdx - 1]?.id === dragged.id ? day[tIdx - 2] : day[tIdx - 1];
    const nextEvt = day[tIdx]?.id === dragged.id ? day[tIdx + 1] : day[tIdx];

    let newOrder;
    if (!prevEvt && nextEvt) newOrder = (nextEvt.order ?? 0) - ORDER_STEP;
    else if (prevEvt && !nextEvt) newOrder = (prevEvt.order ?? 0) + ORDER_STEP;
    else if (prevEvt && nextEvt) {
      const gap = (nextEvt.order - prevEvt.order);
      if (gap > ORDER_EPS) {
        newOrder = prevEvt.order + gap / 2;
      } else {
        await renumberDayOrders(y, m, d);
        const day2 = dayEvents(events, y, m, d).sort((a,b)=>a.order-b.order);
        const t2 = day2.findIndex(x => x.id === targetEvent.id);
        const p2 = day2[t2 - 1];
        const n2 = day2[t2];
        if (!p2 && n2) newOrder = n2.order - ORDER_STEP;
        else if (p2 && !n2) newOrder = p2.order + ORDER_STEP;
        else newOrder = p2.order + (n2.order - p2.order) / 2;
      }
    } else {
      newOrder = ORDER_STEP;
    }

    try {
      await updateDoc(doc(db, "moveouts", dragged.id), { _order: newOrder });
      setEvents(prev => prev.map(ev => ev.id === dragged.id ? { ...ev, order: newOrder, raw: { ...ev.raw, _order: newOrder } } : ev));
    } catch (err) {
      console.error("순서 변경 실패:", err);
      alert("순서 변경 중 오류가 발생했습니다.");
    }

    setDragState({ dragId: null, overId: null, overYMD: null });
  };

  /* ✅ 동일 날짜 내 항목 위로 드래그할 때 스페이서 표시를 위한 오버 핸들러 */
  const onDragOverTarget = (e, targetEvent) => {
    e.preventDefault();
    const payload = safeParseDrag(e.dataTransfer.getData("text/plain"));
    if (!payload?.id || payload.id === targetEvent.id) return;

    if (
      payload.y === targetEvent.y &&
      payload.m === targetEvent.m &&
      payload.d === targetEvent.d
    ) {
      setDragState((s) => ({
        dragId: payload.id,
        overId: targetEvent.id,
        overYMD: { y: targetEvent.y, m: targetEvent.m, d: targetEvent.d },
      }));
    } else {
      setDragState((s) => ({ ...s, overId: null }));
    }
  };

  // 동일 날짜 내, 맨 끝으로 이동 (End Dropzone)
  const onDropToEnd = async (e, cell) => {
    e.preventDefault();
    const payload = safeParseDrag(e.dataTransfer.getData("text/plain"));
    if (!payload?.id) return;

    const dragged = events.find(x => x.id === payload.id);
    if (!dragged) return;

    if (!(dragged.y === cell.y && dragged.m === cell.m && dragged.d === cell.d)) {
      setDragState({ dragId: null, overId: null, overYMD: null });
      return;
    }

    const day = dayEvents(events, cell.y, cell.m, cell.d).sort((a,b)=>a.order-b.order);
    const last = day[day.length - 1];
    const newOrder = last ? last.order + ORDER_STEP : ORDER_STEP;

    try {
      await updateDoc(doc(db, "moveouts", dragged.id), { _order: newOrder });
      setEvents(prev => prev.map(ev => ev.id === dragged.id ? { ...ev, order: newOrder, raw: { ...ev.raw, _order: newOrder } } : ev));
    } catch (err) {
      console.error("끝으로 이동 실패:", err);
      alert("순서 변경 중 오류가 발생했습니다.");
    }

    setDragState({ dragId: null, overId: null, overYMD: null });
  };

  /* ===== 오버플로우 갱신 ===== */
  useEffect(() => {
    daysGrid.forEach((c) => updateOverflowForKey(makeKey(c)));
  }, [events, daysGrid]); // eslint-disable-line

  /* ===== "가려진 항목 더보기" 오버레이 열기/닫기 ===== */
  const openMoreOverlay = (key, cellObj, cellEvents) => {
    const el = cellRefs.current[key];
    if (!el) return;
    const rect = el.getBoundingClientRect();

    const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
    const belowSpace = viewportH - rect.bottom - 8;
    const needBottomPin = belowSpace < 200;

    if (needBottomPin) {
      setMoreOverlay({
        open: true,
        key,
        x: rect.left,
        y: 0,
        w: rect.width,
        events: cellEvents,
        useBottom: true,
        b: 8,
      });
    } else {
      setMoreOverlay({
        open: true,
        key,
        x: rect.left,
        y: rect.bottom + 4,
        w: rect.width,
        events: cellEvents,
        useBottom: false,
        b: 0,
      });
    }
  };
  const closeMoreOverlay = () => setMoreOverlay({ open: false, key: null, x: 0, y: 0, w: 0, events: [], useBottom: false, b: 0 });

  useEffect(() => {
    if (!moreOverlay.open) return;
    const onDocClick = (e) => {
      const overlay = document.getElementById("calendar-more-overlay");
      if (!overlay) return;
      if (!overlay.contains(e.target)) closeMoreOverlay();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [moreOverlay.open]);

  /* ===== 렌더 ===== */
  return (
    <div className="calendar-page" ref={containerRef}>
      {/* 헤더 */}
      <div className="calendar-header">
        <div className="calendar-nav">
          <button className="btn-plain" onClick={() => { const d = new Date(year, month - 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); }}>◀</button>
          <select className="inp-sel" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
            {yearOptions().map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="inp-sel" value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
            {Array.from({ length: 12 }, (_, i) => i).map((m) => <option key={m} value={m}>{m + 1}월</option>)}
          </select>
          <button className="btn-plain" onClick={() => { const d = new Date(year, month + 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); }}>▶</button>
          <button className="btn-primary" onClick={() => { const t = new Date(); setYear(t.getFullYear()); setMonth(t.getMonth()); }}>오늘</button>
        </div>

        <input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="검색어 입력"
          aria-label="검색"
          className="inp-search"
        />
      </div>

      {/* 달력 본문 */}
      <div className="calendar-body">
        <div className="weekday-row">
          {["일","월","화","수","목","금","토"].map((d) => <div key={d} className="weekday-cell">{d}</div>)}
        </div>

        <div className="calendar-grid">
          {daysGrid.map((cell, idx) => {
            const isCurrentMonth = cell.m === month;
            const key = makeKey(cell);
            const cellEvents = sortByOrder(events.filter((e) => e.y === cell.y && e.m === cell.m && e.d === cell.d));

            const isToday =
              cell.y === today.getFullYear() &&
              cell.m === today.getMonth() &&
              cell.d === today.getDate();

            const ov = overflowMap[key] || { top: false, bottom: false, hiddenBelow: 0 };

            const isDragSameDay =
              dragState.dragId &&
              dragState.overYMD &&
              dragState.overYMD.y === cell.y &&
              dragState.overYMD.m === cell.m &&
              dragState.overYMD.d === cell.d;

            // 🔎 가려진 영역 내 "일치 개수" 계산
            const visibleCount = Math.max(0, cellEvents.length - (ov.hiddenBelow || 0));
            const hiddenEvents = cellEvents.slice(visibleCount);
            const hiddenMatchCount = queryText.trim()
              ? hiddenEvents.filter((e) => isMatch(e, queryText)).length
              : 0;

            return (
              <div
                key={idx}
                ref={setCellRef(key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropToDate(e, cell)}
                className={`day-cell ${isToday ? "day-cell--today" : ""}`}
              >
                {/* 상단 날짜바 */}
                <div className="daybar">
                  <div className={`daybar-date ${isCurrentMonth ? "daybar-date--curr" : "daybar-date--dim"}`}>{cell.d}</div>
                </div>

                {/* 이벤트 영역 */}
                <div
                  ref={setContentRef(key)}
                  className="event-area no-scrollbar"
                  onDoubleClick={(e) => { e.stopPropagation(); }}
                >
                  <div className="event-stack">
                    {cellEvents.map((e) => (
                      <React.Fragment key={e.id}>
                        {/* 동일 날짜 + 드래그 중일 때, 현재 항목 앞에 드롭스페이서 */}
                        {isDragSameDay && dragState.overId === e.id && <div className="drop-spacer" />}
                        <EventPill
                          event={e}
                          highlight={highlightId === e.id || (queryText && isMatch(e, queryText))}
                          onOpenPopover={(domEvent) => openPopover(e, domEvent)}
                          onDoubleClick={null}
                          onDragStart={(evt) => onDragStart(evt, e)}
                          onDragOver={(evt) => onDragOverTarget(evt, e)}
                          onDropBefore={(evt) => onDropBeforeTarget(evt, e)}
                        />
                      </React.Fragment>
                    ))}

                    {/* 동일 날짜 끝 드롭존: 맨 끝으로 이동 */}
                    {isDragSameDay && (
                      <div
                        className="drop-end"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => onDropToEnd(e, cell)}
                        title="끝으로 이동"
                      />
                    )}
                  </div>
                </div>

                {/* 하단 'N건 더보기' (+ 숨은 일치 배지) */}
                {ov.hiddenBelow > 0 && (
                  <div className="more-gradient">
                    <button
                      className="more-button"
                      title="가려진 항목 펼치기"
                      onClick={(evt) => {
                        evt.stopPropagation();
                        if (moreOverlay.open && moreOverlay.key === key) {
                          closeMoreOverlay();
                        } else {
                          openMoreOverlay(key, cell, cellEvents);
                        }
                      }}
                    >
                      가려진 항목 {ov.hiddenBelow}건 더보기
                      {hiddenMatchCount > 0 && (
                        <span className="match-badge">일치 {hiddenMatchCount}건</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 항목 보기/부분 수정 팝오버 */}
      {popover.open && (() => {
        const selected = events.find((e) => e.id === popover.id);
        if (!selected) return null;
        return (
          <>
            <div className="screen-dim" onClick={closePopover} />
            <div
              ref={popoverRef}
              className="popover"
              style={{ left: `${popover.x}px`, top: `${popover.y}px` }}
            >
              {/* 헤더 제거 */}
              <div className="popover-body">
                <div className="two-col">
                  <Field label="빌라명" value={selected.villaName} readOnly />
                  <Field label="호수" value={selected.unitNumber} readOnly />
                </div>
                <Field label="금액" value={selected.amount} readOnly />
                <StatusPicker
                  value={selected.statusKey}
                  onChange={(key) => {
                    const patch = applyColorTransition(selected.statusKey, key, selected.raw);
                    patchEvent(selected, { ...patch, statusKey: key });
                  }}
                />
                <TextArea
                  label="비고"
                  value={selected.note || ""}
                  onChange={(v) => patchEvent(selected, { note: v })}
                />
              </div>
            </div>
          </>
        );
      })()}

      {/* 가려진 항목 오버레이 */}
      {moreOverlay.open && (
        <div
          id="calendar-more-overlay"
          className="more-overlay"
          style={{
            left: moreOverlay.x,
            width: moreOverlay.w,
            ...(moreOverlay.useBottom ? { bottom: moreOverlay.b } : { top: moreOverlay.y }),
            position: "fixed",
          }}
        >
          <div className="more-overlay-head">
            <div className="more-overlay-title">가려진 항목</div>
            <button className="btn-x" onClick={closeMoreOverlay} title="닫기">✕</button>
          </div>

          {/* 달력과 동일한 스택/간격/폰트/사이즈 */}
          <div className="more-overlay-body">
            <div className="event-stack">
              {moreOverlay.events.map((e) => (
                <EventPill
                  key={`ov-${e.id}`}
                  event={e}
                  highlight={highlightId === e.id || (queryText && isMatch(e, queryText))}
                  onOpenPopover={(domEvent) => openPopover(e, domEvent)}
                  onDoubleClick={null}
                  onDragStart={(evt) => onDragStart(evt, e)}
                  onDragOver={(evt) => onDragOverTarget(evt, e)}
                  onDropBefore={(evt) => onDropBeforeTarget(evt, e)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /* ===== Firestore 패치 ===== */
  async function patchEvent(selected, patch) {
    setEvents((prev) => prev.map((e) => {
      if (e.id !== selected.id) return e;
      const nextRaw = { ...e.raw };
      if (patch.status != null) nextRaw.status = patch.status;
      if (patch.firstSettlement != null) nextRaw.firstSettlement = patch.firstSettlement;
      if (patch.excludeDeposit != null) nextRaw.excludeDeposit = patch.excludeDeposit;
      return { ...e, ...("statusKey" in patch ? { statusKey: patch.statusKey } : {}), raw: nextRaw, ...(patch.note != null ? { note: patch.note } : {}) };
    }));

    const update = {};
    if (patch.note != null) update.note = patch.note;
    if (patch.status != null) update.status = patch.status;
    if (patch.firstSettlement != null) update.firstSettlement = patch.firstSettlement;
    if (patch.excludeDeposit != null) update.excludeDeposit = patch.excludeDeposit;

    if (Object.keys(update).length > 0) {
      try {
        await updateDoc(doc(db, "moveouts", selected.id), update);
      } catch (err) {
        console.error("업데이트 실패:", err);
        alert("수정 중 오류가 발생했습니다.");
      }
    }
  }

  /**
   * 색 전환 규칙 → DB 필드 패치 계산
   * oldKey, newKey ∈ {"sky","deepblue","darkgray","green","red"}
   */
  function applyColorTransition(oldKey, newKey, raw) {
    let status = raw?.status ?? null;
    let first = !!raw?.firstSettlement;
    let excl  = !!raw?.excludeDeposit;

    const setStatus = (s) => { status = s; };
    const setFirst  = (v) => { first  = !!v; };
    const setExcl   = (v) => { excl   = !!v; };

    const OK = oldKey || "sky";
    const NK = newKey;

    if (OK === "sky") {
      if (NK === "green") { setFirst(true); }
      else if (NK === "red") { setExcl(true); }
      else if (NK === "deepblue") { setStatus("입금대기"); }
      else if (NK === "darkgray") { setStatus("정산완료"); }
    }
    else if (OK === "darkgray") {
      if (NK === "green") { setFirst(true); setStatus("입금대기"); }
      else if (NK === "red") { setExcl(true); setStatus("입금대기"); }
      else if (NK === "deepblue") { setStatus("입금대기"); }
      else if (NK === "sky") { setStatus("정산대기"); }
    }
    else if (OK === "red") {
      if (NK === "sky") { setExcl(false); setStatus("정산대기"); }
      else if (NK === "green") { setExcl(false); setFirst(true); }
      else if (NK === "deepblue") { setExcl(false); setStatus("입금대기"); }
      else if (NK === "darkgray") { setExcl(true); setStatus("정산완료"); }
    }
    else if (OK === "green") {
      if (NK === "red") { setFirst(false); setExcl(true); }
      else if (NK === "sky") { setFirst(false); setStatus("정산대기"); }
      else if (NK === "deepblue") { setFirst(false); setStatus("입금대기"); }
      else if (NK === "darkgray") { setFirst(true); setStatus("정산완료"); }
    }
    else if (OK === "deepblue") {
      if (NK === "sky") { setStatus("정산대기"); }
      else if (NK === "red") { setExcl(true); }
      else if (NK === "green") { setFirst(true); }
      else if (NK === "darkgray") { setStatus("정산완료"); }
    }

    const patch = {};
    if (status !== (raw?.status ?? null)) patch.status = status;
    if (first !== !!raw?.firstSettlement) patch.firstSettlement = first;
    if (excl  !== !!raw?.excludeDeposit)  patch.excludeDeposit  = excl;

    return patch;
  }

  function dayEvents(all, y, m, d) {
    return all.filter(e => e.y===y && e.m===m && e.d===d);
  }

  async function renumberDayOrders(y, m, d) {
    const day = dayEvents(events, y, m, d).sort((a,b)=>a.order-b.order);
    const batch = writeBatch(db);
    day.forEach((ev, idx) => {
      const newOrder = (idx + 1) * ORDER_STEP;
      batch.update(doc(db, "moveouts", ev.id), { _order: newOrder });
    });
    await batch.commit();
    setEvents(prev => prev.map(ev => {
      if (ev.y===y && ev.m===m && ev.d===d) {
        const idx = day.findIndex(dv => dv.id===ev.id);
        return { ...ev, order: (idx + 1) * ORDER_STEP, raw: { ...ev.raw, _order: (idx + 1) * ORDER_STEP } };
      }
      return ev;
    }));
  }
}

/* -------------------- 하위 컴포넌트 -------------------- */
function EventPill({ event, highlight, onOpenPopover, onDoubleClick, onDragStart, onDragOver, onDropBefore }) {
  const colorClass = `pill--${event.statusKey || "sky"}`;
  const title = `${(event.villaName || "").trim()} ${(event.unitNumber || "").trim()}    ${event.amount}`;
  return (
    <div
      data-evpill="1"
      draggable
      onDragStart={(e) => onDragStart(e, event)}
      onClick={(e) => { e.stopPropagation(); onOpenPopover(e); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(); }}
      onDragOver={(e) => onDragOver(e, event)}
      onDrop={(e) => onDropBefore(e, event)}
      className={`event-pill ${colorClass} ${highlight ? "search-hit event-pill--hl" : ""}`}
      title={title}
    >
      <div className="pill-row">
        <span className="pill-villa">{`${event.villaName || ""} ${event.unitNumber || ""}`.trim()}</span>
        <span className="pill-amt">{event.amount}</span>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, onEnter, inputRef, readOnly = false }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <input
        ref={inputRef}
        value={value}
        readOnly={true}
        onChange={(e) => {
          if (readOnly) return;
          onChange?.(e.target.value);
        }}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className="field-input"
      />
    </div>
  );
}
function TextArea({ label, value, onChange, inputRef }) {
  return (
    <div className="field field--full">
      <div className="field-label">{label}</div>
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="field-textarea"
      />
    </div>
  );
}

function StatusPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = STATUS_COLORS.find((c) => c.key === value) || STATUS_COLORS[2];
  return (
    <div className="field">
      <div className="field-label">진행현황</div>
      <div className="status-picker">
        <button
          type="button"
          className="status-btn"
          onClick={() => setOpen((v) => !v)}
          title="진행현황 색상"
        >
          <ColorDot keyName={current.key} size={20} />
        </button>
        {open && (
          <div className="status-pop">
            <div className="status-grid">
              {STATUS_COLORS.map((c) => (
                <button
                  key={c.key}
                  className="status-cell"
                  onClick={() => { onChange(c.key); setOpen(false); }}
                  title={c.label}
                >
                  <ColorDot keyName={c.key} size={16} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function ColorDot({ keyName, size = 14 }) {
  return <span className={`color-dot color-${keyName}`} style={{ width: size, height: size }} />;
}

/* ----------------------- 유틸 ----------------------- */
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

/* ====== 🔧 검색 로직 수정 ======
 * - 한 단어: 부분 일치(contains)
 * - 두 단어 이상: (빌라명 + 공백 + 호수) 완전 일치만
 * - 금액/메모는 기존 부분 일치 + 숫자 연속 매칭 유지
 */
function isMatch(e, q) {
  const qRaw = String(q || "");
  const qTrim = qRaw.trim();
  if (!qTrim) return false;

  const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

  const combined = norm(`${e.villaName || ""} ${e.unitNumber || ""}`); // "빌라명 호수"
  const qNorm = norm(qTrim);

  const hasSpace = /\s/.test(qTrim);

  if (hasSpace) {
    // 두 단어 이상 → 완전 일치만 (빌라명+공백+호수)
    return combined === qNorm;
  }

  // 한 단어 → 부분 일치
  const fields = [
    String(e.villaName || ""),
    String(e.unitNumber || ""),
    String(e.amount || ""),
    String(e.note || ""),
    `${e.villaName || ""} ${e.unitNumber || ""}`,
  ];

  const needleLower = qNorm;
  const needleDigits = digitsOnly(qTrim);

  // 일반 부분일치
  const textHit = fields.some((f) => String(f).toLowerCase().includes(needleLower));

  if (textHit) return true;

  // "10000" ↔ "10,000" 같은 숫자연속 매칭
  if (needleDigits) {
    return fields.some((f) => digitsOnly(f).includes(needleDigits));
  }
  return false;
}

function digitsOnly(v) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function allMatches(events, q) {
  const m = events.filter((e) => isMatch(e, q));
  return m.sort((a, b) => {
    const da = new Date(a.y, a.m, a.d).getTime();
    const db = new Date(b.y, b.m, b.d).getTime();
    return da - db;
  });
}

/* ====== 🔧 정렬 규칙: 'darkgray'는 항상 맨 아래 ====== */
function sortByOrder(arr) {
  const withOrder = arr.map((e, idx) => ({
    ...e,
    _orderTmp: Number.isFinite(e.order) ? e.order : (idx + 1) * ORDER_STEP,
  }));
  const weight = (k) => (k === "darkgray" ? 1 : 0); // 회색이면 뒤로
  withOrder.sort((a, b) => {
    const cw = weight(a.statusKey) - weight(b.statusKey);
    if (cw !== 0) return cw;
    return a._orderTmp - b._orderTmp || a.id.localeCompare(b.id);
  });
  return withOrder;
}

function safeParseDrag(text) {
  try { return JSON.parse(text); } catch { return null; }
}
