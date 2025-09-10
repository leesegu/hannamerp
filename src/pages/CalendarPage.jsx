// src/pages/CalendarPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * 요청 반영
 * - 팝오버: 클릭한 요소의 실제 rect 기준 + 뷰포트 클램프(우/하단에서도 절대 가리지 않음)
 * - 더보기 목록: 드래그로 날짜 이동/동일 날짜 재정렬, 전역 events 반영으로 순서 실시간 갱신
 * - 동일 날짜 재정렬 UX: 대상 위에 '빈 공간' 플레이스홀더가 나타나며 자연스럽게 밀리는 느낌
 * - 이전/다음 달 셀에도 해당 날짜 이벤트가 있으면 항상 표시
 */

const STATUS_COLORS = [
  { key: "darkgray", label: "짙은 회색", hex: "#374151" },
  { key: "deepblue", label: "진한 파랑색", hex: "#1e3a8a" },
  { key: "sky",      label: "하늘색",     hex: "#38bdf8" }, // 기본
  { key: "red",      label: "빨간색",     hex: "#ef4444" },
  { key: "purple",   label: "보라색",     hex: "#8b5cf6" },
  { key: "amber",    label: "노란색",     hex: "#f59e0b" },
  { key: "green",    label: "녹색",       hex: "#22c55e" },
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

  // ‘N건 더보기’ 팝업(⚠️ items 스냅샷 대신 날짜만 보관 → 렌더 시 실시간 필터)
  const [moreList, setMoreList] = useState({ open: false, x: 0, y: 0, w: 260, ymd: null, anchorRect: null });

  // 하이라이트
  const [highlightId, setHighlightId] = useState(null);

  // 드래그 상태(플레이스홀더용)
  // dragId: 끌리는 항목 id, overId: 같은 날짜에서 '앞에 끼울' 타겟 id, overYMD: {y,m,d}
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
    // 작은 투명 드래그 이미지
    const ghost = document.createElement("div");
    ghost.style.width = "1px"; ghost.style.height = "1px"; ghost.style.opacity = "0";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };
  const clearDragState = () => setDragState({ dragId: null, overId: null, overYMD: null });

  // 셀로 드롭 → 다른 날짜 이동(끝으로) / 같은 날짜면 맨 끝
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

  // 타겟 pill 위로 드롭 → 같은 날짜면 '앞'으로 재정렬 (다른 날짜면 타겟 날짜로 옮기며 앞에 삽입)
  const onDropBeforeTarget = (e, targetEvent) => {
    e.preventDefault();
    const payload = safeParseDrag(e.dataTransfer.getData("text/plain"));
    if (!payload?.id) return;
    setEvents((prev) => reorderBefore(prev, payload.id, targetEvent));
    clearDragState();
  };

  // 드래그가 타겟 pill 위에 올라왔을 때(같은 날짜면 플레이스홀더 표시)
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

  /** ====================== 팝오버 위치 계산(강화) ====================== */
  const placePopoverNearRect = (rect, popW, popH) => {
    const M = 12;

    const leftSpace   = rect.left - M;
    const rightSpace  = window.innerWidth  - rect.right - M;
    const aboveSpace  = rect.top  - M;
    const belowSpace  = window.innerHeight - rect.bottom - M;

    // 가로/세로 모두 더 넓은 쪽 우선
    const placeRight = rightSpace >= leftSpace;
    const placeBelow = belowSpace >= aboveSpace;

    let x = placeRight ? rect.right + M : rect.left - popW - M;
    let y = placeBelow ? rect.top       : rect.bottom - popH;

    // 최종 클램프(뷰포트 밖 불가)
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
  const openPopoverAtRect = (ev, rect) => {
    const popW = 300, popH = 252;
    const pos = placePopoverNearRect(rect, popW, popH);
    setPopover({ open: true, id: ev.id, w: popW, h: popH, ...pos });
  };
  const closePopover = () => setPopover({ open: false, id: null, x: 0, y: 0, w: 300, h: 252 });

  /** ====================== 더보기 팝업 ====================== */
  const openMoreForCell = (cellEvents, anchorEl) => {
    const any = cellEvents[0];
    if (!any) return;
    const rect = anchorEl.getBoundingClientRect();
    const w = 260;
    const maxH = 360;
    const preferredH = Math.min(maxH, 8 + cellEvents.length * 34);
    let y = rect.top - preferredH - 8;
    if (y < 8) y = Math.min(window.innerHeight - preferredH - 8, rect.bottom + 8);
    const x = Math.min(window.innerWidth - w - 8, Math.max(8, rect.left));
    setMoreList({ open: true, x, y, w, ymd: { y: any.y, m: any.m, d: any.d }, anchorRect: rect });
  };
  const closeMore = () => setMoreList({ open: false, x: 0, y: 0, w: 260, ymd: null, anchorRect: null });

  /** ====================== 리사이즈 ====================== */
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
    <div className="calendar-page flex flex-col w-full h-full overflow-hidden bg-white">
      <style>{`
        .no-scrollbar::-webkit-scrollbar{ display:none; }
        .no-scrollbar{ scrollbar-width:none; -ms-overflow-style:none; }
        .drop-spacer{ height:22px; border-radius:6px; outline:1px dashed rgba(99,102,241,.45); background:rgba(99,102,241,.08); transition:all .12s ease; }
      `}</style>

      {/* 헤더 */}
      <div className="shrink-0 flex items-center justify-between px-1 pt-2 pb-[2px] border-b border-gray-200 bg-white z-[1]">
        <div className="flex items-center gap-1.5">
          <button className="h-9 px-3 rounded-md text-[13px] ring-1 ring-gray-300 hover:bg-gray-100" onClick={goPrev}>◀</button>
          <select className="h-9 rounded-md px-3 text-[13px] ring-1 ring-gray-300" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
            {yearOptions().map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="h-9 rounded-md px-3 text-[13px] ring-1 ring-gray-300" value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
            {Array.from({ length: 12 }, (_, i) => i).map((m) => <option key={m} value={m}>{m + 1}월</option>)}
          </select>
          <button className="h-9 px-3 rounded-md text-[13px] ring-1 ring-gray-300 hover:bg-gray-100" onClick={goNext}>▶</button>
          <button className="h-9 px-3 rounded-md text-[13px] bg-violet-600 text-white hover:bg-violet-700" onClick={goToday}>오늘</button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="검색어 입력"
          aria-label="검색"
          className="h-9 rounded-md px-3 text-[13px] ring-1 ring-gray-300 outline-none focus:ring-violet-400"
          style={{ width: 320 }}
        />
      </div>

      {/* 달력 본문 */}
      <div className="flex-1 min-h-0 flex bg-white">
        <div className="flex-1 min-h-0">
          <div className="px-0 py-0 h-full flex flex-col">
            {/* 요일 헤더 */}
            <div className="shrink-0 grid grid-cols-7 text-center text-[12px] font-medium bg-gray-50 border border-gray-200 border-b-0">
              {["일","월","화","수","목","금","토"].map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>

            {/* 날짜 그리드 */}
            <div className="flex-1 min-h-0">
              <div className="grid grid-cols-7 gap-px p-0 bg-white border border-gray-200 h-full" style={{ gridTemplateRows: "repeat(6, 1fr)" }}>
                {daysGrid.map((cell, idx) => {
                  const isCurrentMonth = cell.m === month;
                  const key = makeKey(cell);
                  // 해당 날짜 이벤트(정렬 포함)
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
                      className={`relative rounded border border-gray-200 bg-white overflow-hidden ${isToday ? "ring-2 ring-violet-400" : ""}`}
                    >
                      {/* 상단 날짜바 */}
                      <div className="h-5 px-1 flex items-center justify-between bg-white/80">
                        <div className={`text-[11px] select-none ${isCurrentMonth ? "text-gray-700" : "text-gray-300"}`}>{cell.d}</div>
                      </div>

                      {/* 이벤트 영역 */}
                      <div
                        ref={setContentRef(key)}
                        className="absolute left-0 right-0 bottom-0 no-scrollbar"
                        style={{ top: 18, padding: "2px", overflow: "auto" }}
                        onScroll={(e) => updateOverflowForKey(key, e.currentTarget)}
                        onDoubleClick={(e) => { e.stopPropagation(); }}
                      >
                        <div className="space-y-1 text-[11px]">
                          {cellEvents.map((e) => (
                            <React.Fragment key={e.id}>
                              {/* 플레이스홀더: 같은 날에서 타겟 위에 빈 공간 */}
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

                      {/* 하단 'N건 더보기' */}
                      {ov.hiddenBelow > 0 && (
                        <div className="absolute left-0 right-0 bottom-0 p-1 bg-gradient-to-t from-white/90 to-transparent">
                          <button
                            className="w-full rounded-md text-[10px] px-2 py-[3px] ring-1 ring-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                            onClick={(evt) => {
                              evt.stopPropagation();
                              openMoreForCell(cellEvents, evt.currentTarget);
                            }}
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
          </div>
        </div>

        <div className="w-0" />
      </div>

      {/* ‘N건 더보기’ 팝업 (헤더/닫기 제거, 색상 유지, 드래그 재정렬 + 실시간 반영) */}
      {moreList.open && moreList.ymd && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMore} />
          <div
            className="fixed z-50 rounded-md border bg-white shadow-lg overflow-auto"
            style={{ left: moreList.x, top: moreList.y, width: moreList.w, maxHeight: 360 }}
          >
            <div className="p-2 space-y-1">
              {sortByOrder(events.filter((e) =>
                e.y === moreList.ymd.y && e.m === moreList.ymd.m && e.d === moreList.ymd.d
              )).map((e) => {
                const color = STATUS_COLORS.find((c) => c.key === e.statusKey)?.hex || "#38bdf8";
                const isDragSameDay =
                  dragState.dragId &&
                  dragState.overYMD &&
                  dragState.overYMD.y === moreList.ymd.y &&
                  dragState.overYMD.m === moreList.ymd.m &&
                  dragState.overYMD.d === moreList.ymd.d;

                return (
                  <React.Fragment key={e.id}>
                    {/* 플레이스홀더(팝업 목록용) */}
                    {isDragSameDay && dragState.overId === e.id && <div className="drop-spacer" />}
                    <button
                      draggable
                      onDragStart={(evt) => onDragStart(evt, e)}
                      onDragOver={(evt) => onDragOverTarget(evt, e)}
                      onDrop={(evt) => onDropBeforeTarget(evt, e)}
                      className="w-full text-left rounded px-2 py-1 text-[12px] flex items-center justify-between gap-2"
                      style={{ backgroundColor: color, color: "#fff" }}
                      title={`${e.villa} ${e.amount}`}
                      onClick={(evt) => {
                        // ✅ 더보기 내 '해당 항목 버튼'의 실제 rect 기준으로 팝오버 위치
                        openPopoverAtRect(e, evt.currentTarget.getBoundingClientRect());
                        closeMore();
                      }}
                    >
                      <span className="truncate">{e.villa}</span>
                      <span className="shrink-0">{e.amount}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* 항목 수정 팝오버 */}
      {popover.open && (() => {
        const selected = events.find((e) => e.id === popover.id);
        if (!selected) return null;
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={closePopover} />
            <div className="fixed z-50 rounded-md border bg-white shadow-lg" style={{ left: popover.x, top: popover.y, width: popover.w }}>
              <div className="flex items-center justify-between border-b px-2 py-2">
                <div className="text-[13px] font-semibold">항목 수정</div>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded px-2 py-0.5 text-[12px] ring-1 ring-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => { deleteEvent(selected.id); closePopover(); }}
                    title="삭제"
                  >
                    삭제
                  </button>
                  <button className="text-gray-600 hover:text-gray-800 px-1 text-[20px]" onClick={closePopover} title="닫기">✕</button>
                </div>
              </div>

              <div className="p-3 space-y-2">
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
          <div className="grid grid-cols-2 gap-2">
            <Field label="빌라명/호수" value={form.villa} onChange={(v) => setForm((s) => ({ ...s, villa: v }))} onEnter={() => amountRef.current?.focus()} inputRef={villaRef} />
            <Field label="금액" value={form.amount}
              onChange={(v) => setForm((s) => ({ ...s, amount: v.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") }))}
              onEnter={() => descRef.current?.focus()} inputRef={amountRef}
            />
            <StatusPicker value={form.statusKey} onChange={(key) => setForm((s) => ({ ...s, statusKey: key }))} />
            <TextArea label="설명" value={form.desc} onChange={(v) => setForm((s) => ({ ...s, desc: v }))} inputRef={descRef} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={saveEvent} className="rounded px-3 py-1 text-[12px] bg-violet-600 text-white hover:bg-violet-700">저장</button>
            <button onClick={() => setModalOpen(false)} className="rounded px-3 py-1 text-[12px] ring-1 ring-gray-300 hover:bg-gray-50">닫기</button>
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
  const color = STATUS_COLORS.find((c) => c.key === event.statusKey)?.hex || "#38bdf8";
  return (
    <div
      data-evpill="1"
      draggable
      onDragStart={(e) => onDragStart(e, event)}
      onClick={(e) => { e.stopPropagation(); onOpenPopover(e); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(); }}
      onDragOver={(e) => onDragOver(e, event)}
      onDrop={(e) => onDropBefore(e, event)}
      className={`w-full rounded-md border cursor-pointer ${highlight ? "ring-2 ring-white/70" : ""}`}
      style={{ backgroundColor: color, borderColor: color, padding: "2px 6px", color: "#fff" }}
      title={`${event.villa}    ${event.amount}`}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="truncate">{event.villa}</span>
        <span className="shrink-0">{event.amount}</span>
      </div>
    </div>
  );
}

function Modal({ children, onClose, title, width = 560, showClose = true }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="rounded-lg bg-white shadow-lg max-h-[80vh] overflow-auto" style={{ width }}>
        <div className="flex items-center justify-between border-b px-3 py-2 sticky top-0 bg-white">
          <div className="text-[13px] font-semibold">{title}</div>
          {showClose && (
            <button className="text-gray-600 hover:text-gray-800 text-[16px]" onClick={onClose}>✕</button>
          )}
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, onEnter, inputRef }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-semibold text-gray-800">{label}</div>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className="w-full rounded border px-2 py-1 text-[12px] ring-1 ring-gray-200 outline-none focus:ring-violet-400"
      />
    </div>
  );
}
function TextArea({ label, value, onChange, inputRef }) {
  return (
    <div className="col-span-2">
      <div className="mb-1 text-[12px] font-semibold text-gray-800">{label}</div>
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded border px-2 py-1 text-[12px] ring-1 ring-gray-200 outline-none focus:ring-violet-400"
      />
    </div>
  );
}

function StatusPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = STATUS_COLORS.find((c) => c.key === value) || STATUS_COLORS[2];
  return (
    <div>
      <div className="mb-1 text-[12px] font-semibold text-gray-800">진행현황</div>
      <div className="relative">
        <button type="button" className="flex items-center gap-2 rounded border px-2 py-1 text-[12px] ring-1 ring-gray-200" onClick={() => setOpen((v) => !v)} title="진행현황 색상">
          <ColorDot hex={current.hex} size={20} />
        </button>
        {open && (
          <div className="absolute z-10 mt-1 rounded border bg-white p-2 shadow">
            <div className="grid grid-cols-7 gap-2">
              {STATUS_COLORS.map((c) => (
                <button key={c.key} className="flex items-center justify-center" onClick={() => { onChange(c.key); setOpen(false); }} title={c.label}>
                  <ColorDot hex={c.hex} size={16} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function ColorDot({ hex, size = 14 }) {
  return <span className="inline-block rounded-full border-2" style={{ width: size, height: size, backgroundColor: hex, borderColor: hex }} />;
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
