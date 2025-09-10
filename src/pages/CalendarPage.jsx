// src/pages/CalendarPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./CalendarPage.css";

/**
 * 변경 요약
 * - 팝오버: 하단 셀에서도 가려지지 않도록 강제 상단 배치 + 동적 상향 부스트 로직 강화
 * - 더보기: 표시는 유지, 클릭해도 아무 동작 없음 + 커서 변화 없음
 * - 레이아웃 여백 축소: 헤더/요일/그리드/셀 내부 여백 최소화
 */

const STATUS_COLORS = [
  { key: "darkgray", label: "짙은 회색" },
  { key: "deepblue", label: "진한 파랑색" },
  { key: "sky",      label: "하늘색" }, // 기본
  { key: "red",      label: "빨간색" },
  { key: "purple",   label: "보라색" },
  { key: "amber",    label: "노란색" },
  { key: "green",    label: "녹색" },
];

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  // 이벤트: {id,y,m,d,villa,amount,desc,statusKey,order?}
  const [events, setEvents] = useState([]);
  const [query, setQuery]   = useState("");

  // 검색 순회 인덱스
  const [searchIndex, setSearchIndex] = useState(0);

  // 등록/수정 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState({ y: year, m: month, d: today.getDate() });
  const [form, setForm] = useState({ villa: "", amount: "", desc: "", statusKey: "sky" });
  const [editId, setEditId] = useState(null);
  const villaRef  = useRef(null);
  const amountRef = useRef(null);
  const descRef   = useRef(null);

  // 항목 수정 팝오버
  const [popover, setPopover] = useState({ open: false, id: null, x: 0, y: 0, w: 300, h: 252 });

  // 하이라이트
  const [highlightId, setHighlightId] = useState(null);

  // 드래그 상태(플레이스홀더용)
  const [dragState, setDragState] = useState({ dragId: null, overId: null, overYMD: null });

  // 날짜 셀 오버플로우 측정
  const contentRefs = useRef({});
  const [overflowMap, setOverflowMap] = useState({});
  const makeKey = (c) => `${c.y}-${c.m}-${c.d}`;
  const setContentRef = (key) => (el) => {
    if (el) {
      contentRefs.current[key] = el;
      updateOverflowForKey(key, el);
    }
  };
  const updateOverflowForKey = (key, el = contentRefs.current[key]) => {
    if (!el) return;
    const items = el.querySelectorAll('[data-evpill="1"]');
    const visibleBottom = el.scrollTop + el.clientHeight;
    let visible = 0;
    items.forEach((it) => {
      if (it.offsetTop + it.offsetHeight <= visibleBottom) visible++;
    });
    const hiddenBelow = Math.max(0, items.length - visible);
    const top = el.scrollTop > 1;
    const bottom = hiddenBelow > 0;
    setOverflowMap((prev) => {
      const pv = prev[key] || {};
      if (pv.top === top && pv.bottom === bottom && pv.hiddenBelow === hiddenBelow) return prev;
      return { ...prev, [key]: { top, bottom, hiddenBelow } };
    });
  };

  // 그리드
  const daysGrid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  // 신규 등록
  const openModalForNew = (y, m, d) => {
    setModalDate({ y, m, d });
    setForm({ villa: "", amount: "", desc: "", statusKey: "sky" });
    setEditId(null);
    setModalOpen(true);
    setTimeout(() => villaRef.current?.focus(), 0);
  };

  // 수정 모달
  const openModalForEdit = (ev) => {
    setModalDate({ y: ev.y, m: ev.m, d: ev.d });
    setForm({
      villa: ev.villa || "",
      amount: ev.amount || "",
      desc: ev.desc || "",
      statusKey: ev.statusKey || "sky",
    });
    setEditId(ev.id);
    setModalOpen(true);
    setTimeout(() => villaRef.current?.focus(), 0);
  };

  // 저장
  const saveEvent = () => {
    if (editId) {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === editId
            ? {
                ...e,
                ...form,
                villa: (form.villa || "").trim(),
                amount: (form.amount || "").trim(),
                desc: (form.desc || "").trim(),
                y: modalDate.y, m: modalDate.m, d: modalDate.d,
              }
            : e
        )
      );
    } else {
      const id = `${modalDate.y}-${modalDate.m}-${modalDate.d}-${Date.now()}`;
      const endOrder = nextOrderForDate(events, modalDate.y, modalDate.m, modalDate.d);
      setEvents((prev) => ([
        ...prev,
        {
          id,
          y: modalDate.y, m: modalDate.m, d: modalDate.d,
          villa: (form.villa || "").trim(),
          amount: (form.amount || "").trim(),
          desc: (form.desc || "").trim(),
          statusKey: form.statusKey || "sky",
          order: endOrder,
        },
      ]));
    }
    setModalOpen(false);
  };

  // 달 이동
  const goPrev = () => { const d = new Date(year, month - 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); };
  const goNext = () => { const d = new Date(year, month + 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); };
  const goToday = () => { const t = new Date(); setYear(t.getFullYear()); setMonth(t.getMonth()); };

  /** ====================== 드래그/드롭 (이동 + 재정렬) ====================== */
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

  const onDropToDate = (e, targetCell) => {
    e.preventDefault();
    const payload = safeParseDrag(e.dataTransfer.getData("text/plain"));
    if (!payload?.id) return;
    setEvents((prev) => {
      const dragged = prev.find((x) => x.id === payload.id);
      if (!dragged) return prev;
      if (dragged.y !== targetCell.y || dragged.m !== targetCell.m || dragged.d !== targetCell.d) {
        const newOrder = nextOrderForDate(prev, targetCell.y, targetCell.m, targetCell.d);
        return prev.map((x) =>
          x.id === dragged.id ? { ...x, y: targetCell.y, m: targetCell.m, d: targetCell.d, order: newOrder } : x
        );
      }
      const last = nextOrderForDate(prev, dragged.y, dragged.m, dragged.d);
      return prev.map((x) => (x.id === dragged.id ? { ...x, order: last } : x));
    });
    clearDragState();
  };

  const onDropBeforeTarget = (e, targetEvent) => {
    e.preventDefault();
    const payload = safeParseDrag(e.dataTransfer.getData("text/plain"));
    if (!payload?.id) return;
    setEvents((prev) => reorderBefore(prev, payload.id, targetEvent));
    clearDragState();
  };

  const onDragOverTarget = (e, targetEvent) => {
    e.preventDefault();
    const payload = safeParseDrag(e.dataTransfer.getData("text/plain"));
    if (!payload?.id || payload.id === targetEvent.id) return;
    if (payload.y === targetEvent.y && payload.m === targetEvent.m && payload.d === targetEvent.d) {
      setDragState((s) => ({ dragId: payload.id, overId: targetEvent.id, overYMD: { y: targetEvent.y, m: targetEvent.m, d: targetEvent.d } }));
    } else {
      setDragState((s) => ({ ...s, overId: null }));
    }
  };

  /** ====================== 검색 이동 ====================== */
  useEffect(() => {
    const q = query.trim();
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
  }, [query, events]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSearchKeyDown = (e) => {
    if (e.key !== "Enter") return;
    const q = query.trim();
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

  /** ====================== 팝오버 위치 계산(더 강하게 상향) ====================== */
  // 조건:
  // - 아래 공간(belowSpace)이 popH보다 작거나
  // - 클릭 지점(rect.bottom)이 화면 높이의 70% 이상(하단 30% 구간)
  // => 무조건 '위쪽' 배치. 위쪽 공간이 부족하면 동적 부스트(EXTRA + 부족분)를 더해 최대한 끌어올림.
  const placePopoverNearRect = (rect, popW, popH) => {
    const M = 10; // 기본 여백(더 좁게)
    const BASE_EXTRA = 24; // 기본 상향 오프셋(증가)
    const bottomZoneCutoff = window.innerHeight * 0.70; // 하단 30% 구간
    const leftSpace   = rect.left - M;
    const rightSpace  = window.innerWidth  - rect.right - M;
    const aboveSpace  = rect.top  - M;
    const belowSpace  = window.innerHeight - rect.bottom - M;

    // 가로 배치: 넓은 쪽
    const placeRight = rightSpace >= leftSpace;
    let x = placeRight ? (rect.right + M) : (rect.left - popW - M);

    // 세로 배치 판단
    let forceAbove = false;
    if (belowSpace < popH + M) forceAbove = true;
    if (rect.bottom >= bottomZoneCutoff) forceAbove = true;

    let y;
    if (forceAbove) {
      // 위로 올리되, 위쪽 공간이 부족하면 부족분만큼 추가로 더 끌어올림(동적 부스트)
      const shortage = Math.max(0, (popH + M) - aboveSpace); // 위쪽 공간 부족분
      const EXTRA = BASE_EXTRA + shortage;                    // 상황에 따른 추가 상향
      y = rect.top - popH - M - EXTRA;
    } else if (aboveSpace < popH + M) {
      // 위쪽도 좁으면 아래로
      y = rect.bottom + M;
    } else {
      // 둘 다 가능하면 넓은 쪽
      y = belowSpace >= aboveSpace ? (rect.bottom + M) : (rect.top - popH - M);
    }

    // 최종 클램프(뷰포트 밖 방지)
    x = Math.max(M, Math.min(x, window.innerWidth  - popW - M));
    y = Math.max(M, Math.min(y, window.innerHeight - popH - M));

    return { x, y };
  };

  const openPopover = (ev, domEvent) => {
    const rect = domEvent.currentTarget.getBoundingClientRect();
    const popW = 300, popH = 252;
    const pos = placePopoverNearRect(rect, popW, popH);
    setPopover({ open: true, id: ev.id, w: popW, h: popH, ...pos });
  };
  const closePopover = () => setPopover({ open: false, id: null, x: 0, y: 0, w: 300, h: 252 });

  /** ====================== 리사이즈: 위치 재계산 ====================== */
  useEffect(() => {
    const onResize = () => {
      Object.keys(contentRefs.current).forEach((k) => updateOverflowForKey(k));
      if (popover.open) {
        const rect = { left: popover.x, top: popover.y, right: popover.x + popover.w, bottom: popover.y + popover.h };
        const pos = placePopoverNearRect(rect, popover.w, popover.h);
        setPopover((p) => ({ ...p, ...pos }));
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [popover.open, popover.w, popover.h]);

  // 오버플로우 계산 갱신
  useEffect(() => {
    daysGrid.forEach((c) => updateOverflowForKey(makeKey(c)));
  }, [events, daysGrid]); // eslint-disable-line react-hooks/exhaustive-deps

  /** ====================== 렌더 ====================== */
  return (
    <div className="calendar-page">
      {/* 헤더 */}
      <div className="calendar-header">
        <div className="calendar-nav">
          <button className="btn-plain" onClick={goPrev}>◀</button>
          <select className="inp-sel" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
            {yearOptions().map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="inp-sel" value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
            {Array.from({ length: 12 }, (_, i) => i).map((m) => <option key={m} value={m}>{m + 1}월</option>)}
          </select>
          <button className="btn-plain" onClick={goNext}>▶</button>
          <button className="btn-primary" onClick={goToday}>오늘</button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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

            return (
              <div
                key={idx}
                onClick={() => openModalForNew(cell.y, cell.m, cell.d)}
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
                  onScroll={(e) => updateOverflowForKey(key, e.currentTarget)}
                  onDoubleClick={(e) => { e.stopPropagation(); }}
                >
                  <div className="event-stack">
                    {cellEvents.map((e) => (
                      <React.Fragment key={e.id}>
                        {isDragSameDay && dragState.overId === e.id && <div className="drop-spacer" />}
                        <EventPill
                          event={e}
                          highlight={highlightId === e.id || (query && isMatch(e, query))}
                          onOpenPopover={(domEvent) => openPopover(e, domEvent)}
                          onDoubleClick={() => openModalForEdit(e)}
                          onDragStart={(evt) => onDragStart(evt, e)}
                          onDragOver={(evt) => onDragOverTarget(evt, e)}
                          onDropBefore={(evt) => onDropBeforeTarget(evt, e)}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* 하단 'N건 더보기' (표시만, 클릭 동작 없음 + 커서 변화 없음) */}
                {ov.hiddenBelow > 0 && (
                  <div className="more-gradient">
                    <button
                      className="more-button"
                      title="가려진 항목 수 표시 (열리지 않음)"
                      onClick={(evt) => { evt.stopPropagation(); /* no-op */ }}
                    >
                      가려진 항목 {ov.hiddenBelow}건 더보기
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 항목 수정 팝오버 */}
      {popover.open && (() => {
        const selected = events.find((e) => e.id === popover.id);
        if (!selected) return null;
        return (
          <>
            <div className="screen-dim" onClick={closePopover} />
            <div className="popover" style={{ left: popover.x, top: popover.y }}>
              <div className="popover-head">
                <div className="popover-title">항목 수정</div>
                <div className="popover-actions">
                  <button
                    className="btn-danger"
                    onClick={() => { deleteEvent(selected.id); closePopover(); }}
                    title="삭제"
                  >
                    삭제
                  </button>
                  <button className="btn-x" onClick={closePopover} title="닫기">✕</button>
                </div>
              </div>

              <div className="popover-body">
                <Field label="빌라명/호수" value={selected.villa} onChange={(v) => patchEvent(selected.id, { villa: v })} />
                <Field
                  label="금액"
                  value={selected.amount}
                  onChange={(v) => patchEvent(selected.id, { amount: v.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") })}
                />
                <StatusPicker value={selected.statusKey || "sky"} onChange={(key) => patchEvent(selected.id, { statusKey: key })} />
                <TextArea label="설명" value={selected.desc || ""} onChange={(v) => patchEvent(selected.id, { desc: v })} />
              </div>
            </div>
          </>
        );
      })()}

      {/* 등록/수정 모달 */}
      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} title={`${modalDate.y}.${modalDate.m + 1}.${modalDate.d}`} width={editId ? 560 : 420} showClose={!!editId}>
          <div className="form-grid">
            <Field label="빌라명/호수" value={form.villa} onChange={(v) => setForm((s) => ({ ...s, villa: v }))} onEnter={() => amountRef.current?.focus()} inputRef={villaRef} />
            <Field label="금액" value={form.amount}
              onChange={(v) => setForm((s) => ({ ...s, amount: v.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") })) }
              onEnter={() => descRef.current?.focus()} inputRef={amountRef}
            />
            <StatusPicker value={form.statusKey} onChange={(key) => setForm((s) => ({ ...s, statusKey: key }))} />
            <TextArea label="설명" value={form.desc} onChange={(v) => setForm((s) => ({ ...s, desc: v }))} inputRef={descRef} />
          </div>
          <div className="modal-actions">
            <button onClick={saveEvent} className="btn-primary">저장</button>
            <button onClick={() => setModalOpen(false)} className="btn-plain">닫기</button>
          </div>
        </Modal>
      )}
    </div>
  );

  /** ============== 로컬 헬퍼 ============== */
  function patchEvent(id, patch) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function deleteEvent(id) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }
}

/* -------------------- 하위/공통 컴포넌트 -------------------- */

function EventPill({ event, highlight, onOpenPopover, onDoubleClick, onDragStart, onDragOver, onDropBefore }) {
  const colorClass = `pill--${event.statusKey || "sky"}`;
  return (
    <div
      data-evpill="1"
      draggable
      onDragStart={(e) => onDragStart(e, event)}
      onClick={(e) => { e.stopPropagation(); onOpenPopover(e); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(); }}
      onDragOver={(e) => onDragOver(e, event)}
      onDrop={(e) => onDropBefore(e, event)}
      className={`event-pill ${colorClass} ${highlight ? "event-pill--hl" : ""}`}
      title={`${event.villa}    ${event.amount}`}
    >
      <div className="pill-row">
        <span className="pill-villa">{event.villa}</span>
        <span className="pill-amt">{event.amount}</span>
      </div>
    </div>
  );
}

function Modal({ children, onClose, title, width = 560, showClose = true }) {
  return (
    <div className="modal-wrap">
      <div className="modal-panel" style={{ width }}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          {showClose && (
            <button className="btn-x" onClick={onClose}>✕</button>
          )}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, onEnter, inputRef }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
        <button type="button" className="status-btn" onClick={() => setOpen((v) => !v)} title="진행현황 색상">
          <ColorDot keyName={current.key} size={20} />
        </button>
        {open && (
          <div className="status-pop">
            <div className="status-grid">
              {STATUS_COLORS.map((c) => (
                <button key={c.key} className="status-cell" onClick={() => { onChange(c.key); setOpen(false); }} title={c.label}>
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
function isMatch(e, q) {
  return [e.villa, e.amount, e.desc].some((s) => (s || "").toLowerCase().includes(q.toLowerCase()));
}
function allMatches(events, q) {
  const m = events.filter((e) => isMatch(e, q));
  return m.sort((a, b) => {
    const da = new Date(a.y, a.m, a.d).getTime();
    const db = new Date(b.y, b.m, b.d).getTime();
    return da - db;
  });
}

// 날짜별 다음 order 값
function nextOrderForDate(list, y, m, d) {
  const same = list.filter((e) => e.y === y && e.m === m && e.d === d);
  const max = same.reduce((acc, cur) => Math.max(acc, Number.isFinite(cur.order) ? cur.order : -1), -1);
  return max + 1;
}

// order 정렬(없으면 안정 보정)
function sortByOrder(arr) {
  const withOrder = arr.map((e, idx) => ({
    ...e,
    _orderTmp: Number.isFinite(e.order) ? e.order : idx,
  }));
  withOrder.sort((a, b) => a._orderTmp - b._orderTmp || a.id.localeCompare(b.id));
  return withOrder;
}

// 안전 파싱
function safeParseDrag(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// 같은 날짜에서 'target 앞'으로 재정렬 (다른 날짜면 target 날짜로 이동하며 앞에 삽입)
function reorderBefore(prev, draggedId, target) {
  const dragged = prev.find((x) => x.id === draggedId);
  if (!dragged) return prev;

  // 타겟 날짜 목록
  const dayList = sortByOrder(prev.filter((e) => e.y === target.y && e.m === target.m && e.d === target.d));
  const targetIdx = dayList.findIndex((x) => x.id === target.id);

  // 다른 날짜면 타겟 날짜로 이동하며 '앞'으로 삽입
  if (dragged.y !== target.y || dragged.m !== target.m || dragged.d !== target.d) {
    const beforeOrder = targetIdx === 0 ? -1 : (dayList[targetIdx - 1].order ?? targetIdx - 1);
    const afterOrder  = (dayList[targetIdx].order ?? targetIdx);
    const newOrder = (beforeOrder + afterOrder) / 2;
    const moved = prev.map((x) =>
      x.id === dragged.id ? { ...x, y: target.y, m: target.m, d: target.d, order: newOrder } : x
    );
    return normalizeOrders(moved, target.y, target.m, target.d);
  }

  // 같은 날짜면 target 앞 삽입
  const beforeOrder = targetIdx === 0 ? -1 : (dayList[targetIdx - 1].order ?? targetIdx - 1);
  const afterOrder  = (dayList[targetIdx].order ?? targetIdx);
  const newOrder = (beforeOrder + afterOrder) / 2;

  const updated = prev.map((x) =>
    x.id === dragged.id ? { ...x, order: newOrder, y: target.y, m: target.m, d: target.d } : x
  );
  return normalizeOrders(updated, target.y, target.m, target.d);
}

// 해당 날짜의 order를 0..n-1 로 재배치
function normalizeOrders(list, y, m, d) {
  const indices = list
    .filter((e) => e.y === y && e.m === m && e.d === d)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((e, i) => ({ id: e.id, order: i }));
  const map = new Map(indices.map(({ id, order }) => [id, order]));
  return list.map((e) => (map.has(e.id) ? { ...e, order: map.get(e.id) } : e));
}
