// src/pages/CalendarPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * 커스텀 캘린더 (구글 느낌)
 * - 날짜 숫자/이벤트 간섭 제거: 셀 상단 날짜바 + 하단 이벤트 영역 구조
 * - 빈공간 '한 번 클릭': 등록 모달(저장/닫기)
 * - 더블클릭(이벤트): 수정 모달(프리필, 저장 시 업데이트)
 * - 단일 클릭(이벤트): 옆 팝오버로 바로 수정/삭제 (하단 날짜에서도 잘리지 않게 위치 보정)
 * - 검색: 모든 달 이벤트 검색 → Enter를 누를 때마다 다음 일치로 이동(순환)
 * - 오늘 날짜 테두리 강조, 드래그&드롭으로 날짜 이동
 * - 페이지 스크롤 없음, 좌우/상하 여백 최소화, 셀 내부만 스크롤(스크롤바 공간 고정으로 움찔 방지)
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
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]); // {id,y,m,d,villa,amount,desc,statusKey}
  const [query, setQuery] = useState("");

  // 검색 순회 인덱스
  const [searchIndex, setSearchIndex] = useState(0);

  // 등록/수정 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState({ y: year, m: month, d: today.getDate() });
  const [form, setForm] = useState({ villa: "", amount: "", desc: "", statusKey: "sky" });
  const [editId, setEditId] = useState(null); // null이면 신규, 있으면 수정
  const villaRef = useRef(null);
  const amountRef = useRef(null);
  const descRef = useRef(null);

  // 이벤트 팝오버
  const [popover, setPopover] = useState({ open: false, id: null, x: 0, y: 0 });

  // 하이라이트
  const [highlightId, setHighlightId] = useState(null);

  const daysGrid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  // 빈칸 클릭 → 신규 등록
  const openModalForNew = (y, m, d) => {
    setModalDate({ y, m, d });
    setForm({ villa: "", amount: "", desc: "", statusKey: "sky" });
    setEditId(null);
    setModalOpen(true);
    setTimeout(() => villaRef.current?.focus(), 0);
  };

  // 이벤트 더블클릭 → 수정 모달
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

  const saveEvent = () => {
    if (editId) {
      // 수정
      setEvents((prev) =>
        prev.map((e) =>
          e.id === editId
            ? {
                ...e,
                ...form,
                villa: form.villa.trim(),
                amount: form.amount.trim(),
                desc: form.desc.trim(),
                y: modalDate.y,
                m: modalDate.m,
                d: modalDate.d,
              }
            : e
        )
      );
    } else {
      // 신규
      const id = `${modalDate.y}-${modalDate.m}-${modalDate.d}-${Date.now()}`;
      setEvents((prev) => [
        ...prev,
        {
          id,
          y: modalDate.y,
          m: modalDate.m,
          d: modalDate.d,
          ...form,
          villa: form.villa.trim(),
          amount: form.amount.trim(),
          desc: form.desc.trim(),
        },
      ]);
    }
    setModalOpen(false);
  };

  // 달 이동
  const goPrev = () => { const d = new Date(year, month - 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); };
  const goNext = () => { const d = new Date(year, month + 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); };
  const goToday = () => { const t = new Date(); setYear(t.getFullYear()); setMonth(t.getMonth()); };

  // 드래그앤드롭 (이벤트 → 날짜 셀)
  const onDragStart = (e, id) => { e.dataTransfer.setData("text/plain", id); };
  const onDropToDate = (e, targetCell) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, y: targetCell.y, m: targetCell.m, d: targetCell.d } : ev)));
  };

  // 현재 보이는 달의 이벤트만 표시
  const monthEvents = useMemo(
    () => events.filter((e) => e.y === year && e.m === month),
    [events, year, month]
  );

  // 검색: 입력 변화 시 첫 일치로 이동/하이라이트 & 인덱스 초기화
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

  // Enter로 다음 일치로 이동(순환)
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

  // 팝오버 열기(단일 클릭) — 하단 날짜에서도 화면 밖으로 나가지 않게 위치 보정
  const openPopover = (ev, domEvent) => {
    const rect = domEvent.currentTarget.getBoundingClientRect();
    const popW = 280;
    const popH = 260; // 예상 높이(고정으로 계산하여 오버플로우 방지)
    const x = Math.min(window.innerWidth - popW - 8, rect.right + 8);
    // 아래쪽이 부족하면 위로 배치
    const idealTop = rect.top;
    const maxTop = window.innerHeight - popH - 8;
    const y = Math.max(8, Math.min(maxTop, idealTop));
    setPopover({ open: true, id: ev.id, x, y });
  };
  const closePopover = () => setPopover({ open: false, id: null, x: 0, y: 0 });

  const selected = popover.open ? events.find((e) => e.id === popover.id) : null;

  return (
    <div className="fixed inset-0">
      <div className="absolute inset-0 bg-white overflow-hidden">
        {/* 헤더 (여백 최소화) */}
        <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200">
          <div className="flex items-center gap-1">
            <button className="rounded px-2 py-0.5 text-[11px] ring-1 ring-gray-300 hover:bg-gray-100" onClick={goPrev} title="이전 달">◀</button>
            <select className="rounded px-2 py-0.5 text-[12px] ring-1 ring-gray-300" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
              {yearOptions().map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="rounded px-1.5 py-0.5 text-[12px] ring-1 ring-gray-300" value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
              {Array.from({ length: 12 }, (_, i) => i).map((m) => <option key={m} value={m}>{m + 1}월</option>)}
            </select>
            <button className="rounded px-2 py-0.5 text-[11px] ring-1 ring-gray-300 hover:bg-gray-100" onClick={goNext} title="다음 달">▶</button>
            <button className="ml-1 rounded px-2 py-0.5 text-[11px] ring-1 ring-gray-300 hover:bg-gray-100" onClick={goToday}>오늘</button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="검색(모든 달: 빌라/금액/설명) — Enter로 다음 결과"
            className="rounded px-2 py-0.5 text-[12px] ring-1 ring-gray-300 outline-none"
            style={{ width: 260 }}
          />
        </div>

        {/* 달력 (페이지 스크롤 없음, 내부 여백 극소화) */}
        <div className="flex w-full" style={{ height: "calc(100% - 30px)" }}>
          <div className="flex-1">
            <div className="px-1.5 py-1 h-full">
              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 text-center text-[12px] font-medium bg-gray-50 border border-gray-200 border-b-0">
                {["일","월","화","수","목","금","토"].map((d) => <div key={d} className="py-1">{d}</div>)}
              </div>

              {/* 날짜 그리드 */}
              <div
                className="grid grid-cols-7 gap-[2px] p-[2px] bg-white border border-gray-200"
                style={{ height: "calc(100% - 26px)", gridTemplateRows: "repeat(6, 1fr)" }}
              >
                {daysGrid.map((cell, idx) => {
                  const isCurrentMonth = cell.m === month;
                  // ✅ 중복표시 버그 수정: 현재 달 셀에서만 해당 달 이벤트를 필터링
                  const cellEvents = isCurrentMonth
                    ? monthEvents.filter((e) => e.d === cell.d)
                    : [];
                  const isToday =
                    cell.y === today.getFullYear() &&
                    cell.m === today.getMonth() &&
                    cell.d === today.getDate();

                  return (
                    <div
                      key={idx}
                      onClick={(e) => {
                        // 셀 빈공간 '한 번 클릭'으로 추가 (이벤트 클릭은 내부에서 stopPropagation)
                        openModalForNew(cell.y, cell.m, cell.d);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onDropToDate(e, cell)}
                      className={`relative rounded border border-gray-200 bg-white overflow-hidden ${isToday ? "ring-2 ring-violet-400" : ""}`}
                    >
                      {/* 상단 날짜바 */}
                      <div className="h-5 px-1.5 flex items-center justify-between bg-white/80">
                        <div className={`text-[11px] select-none ${isCurrentMonth ? "text-gray-700" : "text-gray-300"}`}>{cell.d}</div>
                      </div>

                      {/* 이벤트 영역: 셀 내부 스크롤(움찔 방지: scrollbar-gutter) */}
                      <div
                        className="absolute left-0 right-0 bottom-0"
                        style={{
                          top: 20, // 날짜바 높이(5px line-height + 여유)
                          padding: "4px 6px",
                          overflow: "auto",
                          scrollbarGutter: "stable both-edges",
                          // 여유공간으로 스크롤바 등장 시 레이아웃 변동 최소화
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          // 이벤트 영역에서의 더블클릭은 무시 (요청은 '한 번 클릭'으로 추가)
                        }}
                      >
                        <div className="space-y-1 text-[11px]">
                          {cellEvents.map((e) => (
                            <EventPill
                              key={e.id}
                              event={e}
                              highlight={highlightId === e.id || (query && isMatch(e, query))}
                              onClick={(domEvent) => openPopover(e, domEvent)}
                              onDoubleClick={() => openModalForEdit(e)}
                              onDragStart={onDragStart}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 우측 여백 최소 */}
          <div className="w-[2px] bg-white" />
        </div>

        {/* 이벤트 팝오버 */}
        {popover.open && selected && (
          <>
            <div className="fixed inset-0 z-40" onClick={closePopover} />
            <div
              className="fixed z-50 w-[280px] rounded-md border bg-white shadow-lg"
              style={{ left: popover.x, top: popover.y, maxHeight: 260 }}
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="text-[13px] font-semibold">항목 수정</div>
                <button className="text-gray-500 hover:text-gray-700" onClick={closePopover}>✕</button>
              </div>
              <div className="p-3 space-y-2 overflow-auto" style={{ maxHeight: 220 }}>
                <Field label="빌라명" value={selected.villa} onChange={(v) => patchEvent(selected.id, { villa: v })} />
                <Field
                  label="금액"
                  value={selected.amount}
                  onChange={(v) => patchEvent(selected.id, { amount: v.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") })}
                />
                <StatusPicker value={selected.statusKey || "sky"} onChange={(key) => patchEvent(selected.id, { statusKey: key })} />
                <TextArea label="설명" value={selected.desc || ""} onChange={(v) => patchEvent(selected.id, { desc: v })} />
                <div className="pt-1">
                  <button
                    onClick={() => { deleteEvent(selected.id); closePopover(); }}
                    className="flex items-center gap-1 rounded px-3 py-1 text-[12px] ring-1 ring-red-300 text-red-600 hover:bg-red-50"
                  >
                    <span>🗑️</span> 삭제
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 등록/수정 모달 */}
        {modalOpen && (
          <Modal onClose={() => setModalOpen(false)} title={`${modalDate.y}.${modalDate.m + 1}.${modalDate.d}`}>
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="빌라명"
                value={form.villa}
                onChange={(v) => setForm((s) => ({ ...s, villa: v }))}
                onEnter={() => amountRef.current?.focus()}
                inputRef={villaRef}
              />
              <Field
                label="금액"
                value={form.amount}
                onChange={(v) => setForm((s) => ({ ...s, amount: v.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") }))}
                onEnter={() => descRef.current?.focus()}
                inputRef={amountRef}
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
    </div>
  );

  // 로컬 헬퍼들
  function patchEvent(id, patch) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function deleteEvent(id) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }
}

/* -------------------- 하위/공통 컴포넌트 -------------------- */

function EventPill({ event, highlight, onClick, onDoubleClick, onDragStart }) {
  const color = STATUS_COLORS.find((c) => c.key === event.statusKey)?.hex || "#38bdf8";
  const bg = hexToRgba(color, 0.16);
  const border = hexToRgba(color, 0.6);
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, event.id)}
      onClick={(e) => { e.stopPropagation(); onClick(e); }} // 셀 클릭 전파 방지
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(); }}
      className={`w-full truncate rounded-md px-1 py-[2px] border cursor-pointer ${highlight ? "ring-2 ring-violet-400" : ""}`}
      style={{ backgroundColor: bg, borderColor: border }}
      title={`${event.villa}    ${event.amount}`}
    >
      <span className="truncate">{event.villa}</span>
      <span className="float-right">{event.amount}</span>
    </div>
  );
}

function Modal({ children, onClose, title }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[560px] rounded-lg bg-white shadow-lg max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between border-b px-3 py-2 sticky top-0 bg-white">
          <div className="text-[13px] font-semibold">{title}</div>
          <button className="text-gray-500 hover:text-gray-700" onClick={onClose}>✕</button>
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, onEnter, inputRef }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-gray-600">{label}</div>
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
      <div className="mb-1 text-[11px] text-gray-600">{label}</div>
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
      <div className="mb-1 text-[11px] text-gray-600">진행현황</div>
      <div className="relative">
        {/* ✅ 둥근 아이콘만 표시 */}
        <button
          type="button"
          className="flex items-center gap-2 rounded border px-2 py-1 text-[12px] ring-1 ring-gray-200"
          onClick={() => setOpen((v) => !v)}
          title={current.label}
        >
          <ColorDot hex={current.hex} size={16} />
        </button>
        {open && (
          <div className="absolute z-10 mt-1 grid w-[180px] grid-cols-7 gap-2 rounded border bg-white p-2 shadow">
            {STATUS_COLORS.map((c) => (
              <button
                key={c.key}
                className="flex items-center justify-center"
                title={c.label}
                onClick={() => { onChange(c.key); setOpen(false); }}
              >
                <ColorDot hex={c.hex} size={20} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function ColorDot({ hex, size = 14 }) {
  return <span className="inline-block rounded-full border" style={{ width: size, height: size, backgroundColor: hex, borderColor: hex }} />;
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
function hexToRgba(hex, alpha = 1) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function isMatch(e, q) {
  return [e.villa, e.amount, e.desc].some((s) => (s || "").toLowerCase().includes(q.toLowerCase()));
}
// 모든 달에서 일치 항목을 날짜순으로 정렬해 반환
function allMatches(events, q) {
  const m = events.filter((e) => isMatch(e, q));
  return m.sort((a, b) => {
    const da = new Date(a.y, a.m, a.d).getTime();
    const db = new Date(b.y, b.m, b.d).getTime();
    return da - db;
  });
}
