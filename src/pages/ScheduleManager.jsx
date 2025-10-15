// src/pages/ScheduleManager.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import './ScheduleManager.css';

/* ===== ✅ Firebase ===== */
import { auth, db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, query, where, serverTimestamp
} from 'firebase/firestore';

/* ===== 아이콘 ===== */
const IconCalendar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);
const IconPlus = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);
const IconEdit = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);
const IconTrash = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
);
const IconClock = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);
const IconChevronLeft = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
);
const IconChevronRight = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);
const IconBell = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 01-3.46 0"></path>
  </svg>
);
const IconType = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="7" height="7" rx="1"></rect>
    <rect x="14" y="7" width="7" height="7" rx="1"></rect>
    <rect x="3" y="16" width="7" height="5" rx="1"></rect>
    <rect x="14" y="16" width="7" height="5" rx="1"></rect>
  </svg>
);
const IconNote = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15V5a2 2 0 0 0-2-2H8l-5 5v12a2 2 0 0 0 2 2h11"></path>
    <path d="M7 3v5H2"></path>
    <path d="M15 22l6-6"></path>
    <path d="M22 16h-4v4"></path>
  </svg>
);

/* ===== 유틸 ===== */
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => {
  const nd = new Date(d);
  return `${nd.getFullYear()}-${pad2(nd.getMonth() + 1)}-${pad2(nd.getDate())}`;
};

/** =========================================================
 *  🇰🇷 한국 공휴일 유틸 (간단 버전)
 * ========================================================= */
const FIXED_SOLAR_HOLIDAYS = new Set([
  '01-01', // 신정
  '03-01', // 삼일절
  '05-05', // 어린이날
  '06-06', // 현충일
  '08-15', // 광복절
  '10-03', // 개천절
  '10-09', // 한글날
  '12-25', // 성탄절
]);
const HOLIDAY_OVERRIDES = {
  // '2025-01-28': '설연휴',
  // '2025-01-29': '설날',
  // '2025-01-30': '설연휴',
  // '2025-05-06': '대체공휴일(어린이날)',
};

/* ===== 바깥 클릭 닫기 ===== */
function useOutsideClose(ref, onClose) {
  useEffect(() => {
    const handler = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [ref, onClose]);
}

/* ===== Date Popover ===== */
function DatePopover({ value, onChange, onClose }) {
  const boxRef = useRef(null);
  useOutsideClose(boxRef, onClose);

  const selDate = value ? new Date(value) : new Date();
  const [viewDate, setViewDate] = useState(selDate);

  const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const endOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
  const startDay = startOfMonth.getDay();

  const monthDays = [];
  for (let i = 1; i <= endOfMonth.getDate(); i++) {
    monthDays.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), i));
  }
  const leading = Array(startDay).fill(null);
  const baseCells = [...leading, ...monthDays];
  const trailing = Array(42 - baseCells.length).fill(null);
  const calendarDays = [...baseCells, ...trailing];

  const pick = (d, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    const next = fmtDate(d);
    onChange?.(next);
    onClose?.();
  };

  return (
    <div className="pop-calendar" ref={boxRef} onMouseDown={(e)=>e.stopPropagation()}>
      <div className="pop-cal-head">
        <button type="button" className="nav-btn ghost" onMouseDown={(e)=>e.stopPropagation()} onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}>
          <IconChevronLeft />
        </button>
        <div className="ym-pill">{viewDate.getFullYear()}년 {viewDate.toLocaleString('ko-KR', { month: 'long' })}</div>
        <button type="button" className="nav-btn ghost" onMouseDown={(e)=>e.stopPropagation()} onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}>
          <IconChevronRight />
        </button>
      </div>

      <div className="pop-cal-grid head">
        {['일','월','화','수','목','금','토'].map((d) => (
          <div key={d} className="dow">{d}</div>
        ))}
      </div>

      <div className="pop-cal-grid body">
        {calendarDays.map((d, i) => (
          <button
            type="button"
            key={i}
            className={`pop-day ${!d ? 'empty' : ''} ${d && fmtDate(d) === value ? 'selected' : ''}`}
            disabled={!d}
            onMouseDown={(e)=>e.stopPropagation()}
            onClick={(e) => d && pick(d, e)}
          >
            {d ? d.getDate() : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ===== Time Popover ===== */
function TimePopover({ value, onChange, onClose, align = 'left' }) {
  const boxRef = useRef(null);
  useOutsideClose(boxRef, onClose);

  /* ✅ 기본 시간: 현재시각에 가장 가까운 5분 단위 */
  const parseInit = (val) => {
    if (!val) {
      const now = new Date();
      const rawMin = now.getMinutes();
      const nearest5 = Math.round(rawMin / 5) * 5;
      let h24 = now.getHours();
      let m5 = nearest5;
      if (nearest5 === 60) { h24 = (h24 + 1) % 24; m5 = 0; }
      const ap = h24 >= 12 ? '오후' : '오전';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return { ap, h: String(h12).padStart(2, '0'), m: String(m5).padStart(2, '0') };
    }
    const [HH, MM] = val.split(':');
    let ap = '오전';
    let h = Number(HH);
    if (h >= 12) { ap = '오후'; if (h > 12) h -= 12; }
    if (h === 0) h = 12;
    return { ap, h: String(h).padStart(2, '0'), m: String(Number(MM) - (Number(MM) % 5)).padStart(2, '0') };
  };

  const init = parseInit(value);
  const [ap, setAp] = useState(init.ap);
  const [h, setH] = useState(init.h);
  const [m, setM] = useState(init.m);

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

  const to24h = (ap_, h_) => {
    const hh = Number(h_);
    if (ap_ === '오전') return hh === 12 ? '00' : String(hh).padStart(2, '0');
    return hh === 12 ? '12' : String(hh + 12).padStart(2, '0');
  };

  const apply = (e) => {
    e?.preventDefault();
    e?.stopPropagation?.();
    const HH = to24h(ap, h);
    const MM = m;
    onChange?.(`${HH}:${MM}`);
    onClose?.();
  };

  const closeOnly = (e) => {
    e?.preventDefault();
    e?.stopPropagation?.();
    onClose?.();
  };

  return (
    <div className={`pop-time ampm ${align === 'right' ? 'align-right' : ''}`} ref={boxRef} onMouseDown={(e)=>e.stopPropagation()}>
      <div className="pop-time-head">시간 선택</div>

      <div className="ampm-row">
        <button type="button" className={`ampm-btn ${ap === '오전' ? 'active' : ''}`} onMouseDown={(e)=>e.stopPropagation()} onClick={() => setAp('오전')}>오전</button>
        <button type="button" className={`ampm-btn ${ap === '오후' ? 'active' : ''}`} onMouseDown={(e)=>e.stopPropagation()} onClick={() => setAp('오후')}>오후</button>
      </div>

      <div className="time-columns">
        <div className="time-col">
          <div className="col-title">시간</div>
          <div className="col-list">
            {hours.map((it) => (
              <button type="button" key={it} className={`col-item ${h === it ? 'selected' : ''}`} onMouseDown={(e)=>e.stopPropagation()} onClick={() => setH(it)}>{it}</button>
            ))}
          </div>
        </div>
        <div className="time-col">
          <div className="col-title">분</div>
          <div className="col-list">
            {minutes.map((it) => (
              <button type="button" key={it} className={`col-item ${m === it ? 'selected' : ''}`} onMouseDown={(e)=>e.stopPropagation()} onClick={() => setM(it)}>{it}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="time-actions">
        <button type="button" className="time-btn primary small" onMouseDown={(e)=>e.stopPropagation()} onClick={apply}>적용</button>
        <button type="button" className="time-btn ghost" onMouseDown={(e)=>e.stopPropagation()} onClick={closeOnly}>닫기</button>
      </div>
    </div>
  );
}

/* ===== 모달 (함수 선언문으로 변경: ESLint/TDZ 이슈 회피) ===== */
function ScheduleModal({ schedule, onSave, onClose }) {
  const [title, setTitle] = useState(schedule?.title || '');
  const [date, setDate] = useState(schedule?.date || fmtDate(new Date()));
  const [time, setTime] = useState(schedule?.time || '');
  const [type, setType] = useState(schedule?.type || 'shared'); // 기본: 공유
  const [alarm, setAlarm] = useState(schedule?.alarm || false);
  const [memo, setMemo] = useState(schedule?.memo || '');

  const [openDate, setOpenDate] = useState(false);
  const [openTime, setOpenTime] = useState(false);

  const dateWrapRef = useRef(null);
  const timeWrapRef = useRef(null);

  useOutsideClose(dateWrapRef, () => setOpenDate(false));
  useOutsideClose(timeWrapRef, () => setOpenTime(false));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title || !date) {
      alert('제목과 날짜를 입력해주세요.');
      return;
    }
    onSave({ title, date, time, type, alarm, memo });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e)=>e.stopPropagation()}>
      <div className="modal-content modal-tall-narrow">
        <div className="modal-head gradient">
          <h2>{schedule ? '일정 수정' : '새 일정 추가'}</h2>
        </div>

        <form onSubmit={handleSubmit} className="schedule-form modal-grid">
          <div className="form-group span-2 mt-header-gap">
            <label htmlFor="title"><span className="label-icon"><IconEdit /></span>일정 제목</label>
            <input type="text" id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="form-group picker-wrap" ref={dateWrapRef}>
            <label><span className="label-icon"><IconCalendar /></span>날짜</label>
            <div className="picker-input picker-compact" tabIndex={0} onMouseDown={(e)=>{ e.stopPropagation(); setOpenDate(true); }}>
              <span>{date || '날짜 선택'}</span>
            </div>
            {openDate && <DatePopover value={date} onChange={setDate} onClose={() => setOpenDate(false)} />}
          </div>

          <div className="form-group picker-wrap" ref={timeWrapRef}>
            <label><span className="label-icon"><IconClock /></span>시간</label>
            <div className="picker-input picker-compact" tabIndex={0} onMouseDown={(e)=>{ e.stopPropagation(); setOpenTime(true); }}>
              <span>{time || '시간 선택'}</span>
            </div>
            {openTime && <TimePopover value={time} onChange={setTime} onClose={() => setOpenTime(false)} align="right" />}
          </div>

          <div className="form-group">
            <label><span className="label-icon"><IconType /></span>종류</label>
            <div className="segmented">
              <button type="button" className={`seg-btn ${type === 'shared' ? 'active' : ''}`} onClick={() => setType('shared')}>공유</button>
              <button type="button" className={`seg-btn ${type === 'personal' ? 'active' : ''}`} onClick={() => setType('personal')}>개인</button>
            </div>
          </div>

          <div className="form-group notify-inline">
            <label><span className="label-icon"><IconBell /></span>알림</label>
            <div className="toggle-switch xsmall">
              <input type="checkbox" id="alarm" checked={alarm} onChange={(e) => setAlarm(e.target.checked)} />
              <label htmlFor="alarm">알림</label>
            </div>
          </div>

          <div className="form-group span-2">
            <label htmlFor="memo"><span className="label-icon"><IconNote /></span>메모</label>
            <textarea id="memo" rows={6} className="memo-input" value={memo} onChange={(e)=>setMemo(e.target.value)} />
          </div>

          <div className="form-actions span-2 dual">
            <button type="submit" className="form-submit-btn small">{schedule ? '수정하기' : '추가'}</button>
            <button type="button" className="form-cancel-btn small" onClick={onClose}>닫기</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ===== 전체 달력 ===== */
function CalendarView({ schedules, onClose, onDropMove, onOpenEdit }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [query, setQuery] = useState(''); // ✅ 검색어 상태

  /* === 🔎 달 간 검색 & 순환을 위한 유틸/상태 추가 (요청 반영) === */
  const norm = (s) => String(s || '').toLowerCase();
  const yyyymm = (d) => {
    const nd = new Date(d);
    return `${nd.getFullYear()}-${pad2(nd.getMonth() + 1)}`;
  };
  const firstDayOfKey = (key) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1);
  };

  // 입력한 검색어와 매칭되는 전체 일정(모든 달)
  const matchedAll = useMemo(() => {
    const q = norm(query);
    if (!q) return [];
    return schedules.filter(it =>
      norm(it.title).includes(q) || norm(it.memo).includes(q)
    );
  }, [schedules, query]);

  // 매칭된 달 키 목록(중복 제거) — 현재 달을 맨 앞으로 우선
  const matchedMonths = useMemo(() => {
    if (!matchedAll.length) return [];
    const set = new Set(matchedAll.map(it => yyyymm(it.date)));
    const arr = Array.from(set).sort(); // 기본 오름차순
    const curKey = yyyymm(currentDate);
    if (arr.includes(curKey)) {
      return [curKey, ...arr.filter(k => k !== curKey)];
    }
    return arr;
  }, [matchedAll, currentDate]);

  // 검색어 변경 시: 현재 달에 매칭이 없고, 다른 달에 매칭이 있으면 첫 매칭 달로 자동 이동
  useEffect(() => {
    if (!query) return;
    const curKey = yyyymm(currentDate);
    const curHas = matchedMonths.includes(curKey);
    if (!curHas && matchedMonths.length > 0) {
      setCurrentDate(firstDayOfKey(matchedMonths[0]));
    }
  }, [query, matchedMonths, currentDate]);

  // Enter 키로 다음 매칭 달로 순환 이동
  const onSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (!matchedMonths.length) return;
    const curKey = yyyymm(currentDate);
    const idx = matchedMonths.indexOf(curKey);
    const nextIdx = (idx === -1 ? 0 : (idx + 1) % matchedMonths.length);
    setCurrentDate(firstDayOfKey(matchedMonths[nextIdx]));
  };

  /* === 기존 달 렌더 로직 === */
  const matches = (it) => {
    const q = norm(query);
    if (!q) return true;
    return norm(it.title).includes(q) || norm(it.memo).includes(q);
  };

  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const startDay = startOfMonth.getDay();

  const daysInMonth = [];
  for (let i = 1; i <= endOfMonth.getDate(); i++) {
    daysInMonth.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
  }
  const leading = Array(startDay).fill(null);
  const baseCells = [...leading, ...daysInMonth];
  const trailing = Array(42 - baseCells.length).fill(null);
  const calendarDays = [...baseCells, ...trailing];

  /* 🇰🇷 공휴일/일요일 체크 */
  const isKoreanHoliday = (day) => {
    if (!day) return false;
    const ymd = fmtDate(day);
    if (HOLIDAY_OVERRIDES[ymd]) return true;
    const md = ymd.slice(5); // 'MM-DD'
    return FIXED_SOLAR_HOLIDAYS.has(md);
  };
  const holidayName = (day) => {
    if (!day) return '';
    const ymd = fmtDate(day);
    if (HOLIDAY_OVERRIDES[ymd]) return HOLIDAY_OVERRIDES[ymd];
    const names = {
      '01-01': '신정',
      '03-01': '삼일절',
      '05-05': '어린이날',
      '06-06': '현충일',
      '08-15': '광복절',
      '10-03': '개천절',
      '10-09': '한글날',
      '12-25': '성탄절',
    };
    const md = ymd.slice(5);
    return names[md] || '';
  };
  const isSunday = (day) => !!day && day.getDay() === 0;

  const getSchedulesForDay = (day) => {
    if (!day) return [];
    const dateString = fmtDate(day);
    return schedules
      .filter((s) => s.date === dateString)
      .filter(matches)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  };

  const changeMonth = (offset) => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + offset);
    setCurrentDate(d);
  };

  const onDropDay = (e, day) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id && day) onDropMove(id, fmtDate(day));
  };

  const goToday = () => {
    setCurrentDate(new Date());
  };

  /* 검색 하이라이트 */
  const highlight = (text) => {
    if (!query) return text;
    const q = query.toLowerCase();
    const idx = String(text).toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="hl">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="modal-backdrop calendar-backdrop" onMouseDown={(e)=>e.stopPropagation()}>
      <div className="calendar-view fixed-size bigger">
        {/* ✅ 오늘 버튼 (닫기 왼쪽) */}
        <button
          type="button"
          onClick={goToday}
          className="calendar-today-btn"
          aria-label="오늘로 이동"
          title="오늘"
        >
          오늘
        </button>

        {/* 닫기 */}
        <button
          type="button"
          onClick={onClose}
          className="calendar-close-text"
          aria-label="달력 닫기"
          title="닫기"
        >
          닫기
        </button>

        {/* 검색창: Enter로 매칭 달 순환 이동 (가로폭 유지) */}
        <div className="calendar-search-abs">
          <input
            type="text"
            placeholder="일정 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />
        </div>

        {/* 타이틀 영역 */}
        <div className="calendar-header compact">
          <div className="cal-title-group">
            <button type="button" className="nav-btn" onClick={() => changeMonth(-1)} aria-label="이전 달"><IconChevronLeft /></button>
            <h2 className="cal-title">
              <span className="title-icon"><IconCalendar /></span>
              {currentDate.getFullYear()}년 {currentDate.toLocaleString('ko-KR', { month: 'long' })}
            </h2>
            <button type="button" className="nav-btn" onClick={() => changeMonth(1)} aria-label="다음 달"><IconChevronRight /></button>
          </div>
        </div>

        <div className="calendar-grid fixed-rows clamp">
          {['일','월','화','수','목','금','토'].map((d) => (
            <div key={d} className="day-name">{d}</div>
          ))}

          {calendarDays.map((day, index) => {
            const items = getSchedulesForDay(day);
            const sharedCount = items.filter(i => i.type === 'shared').length;
            const personalCount = items.filter(i => i.type === 'personal').length;
            const isHol = isKoreanHoliday(day);
            const holName = isHol ? holidayName(day) : '';

            return (
              <div
                key={index}
                className={`calendar-day ${!day ? 'empty' : ''} ${day && day.toDateString() === new Date().toDateString() ? 'today' : ''} ${isHol ? 'holiday' : ''} ${isSunday(day) ? 'sunday' : ''}`}
                onDragOver={(e)=>e.preventDefault()}
                onDrop={(e)=>onDropDay(e, day)}
              >
                {day && (
                  <>
                    <div className="day-number" title={holName || undefined}>
                      <span className="num">{day.getDate()}</span>
                      <span className="count-badge count-shared" title="공유 일정">공유 {sharedCount}</span>
                      <span className="count-badge count-personal" title="개인 일정">개인 {personalCount}</span>
                    </div>

                    {/* 공휴일 문구: 공유/개인 배지 아래 표시 */}
                    {isHol && holName && (
                      <div className="holiday-line" aria-label="공휴일">{holName}</div>
                    )}
                  </>
                )}

                {/* 일정 목록 */}
                <div className="day-items">
                  {day && items.map((s) => (
                    <div
                      key={s.id}
                      className={`day-chip ultra-tiny ${s.type} ${s.completed ? 'completed' : ''}`}
                      draggable
                      onDragStart={(e)=>{ e.dataTransfer.setData('text/plain', String(s.id)); }}
                      onClick={()=>onOpenEdit(s)}
                      title={`${s.time || '—'} ${s.title}`}
                    >
                      <span className="chip-time ultra-tiny">{s.time || '—'}</span>
                      <span className="chip-title ultra-tiny">{highlight(s.title)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
  메인 페이지
========================================================= */
function SchedulePage() {
  const [schedules, setSchedules] = useState([]);          // 전체(공유 + 내 개인)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [currentSchedule, setCurrentSchedule] = useState(null);

  /* ✅ 로그인 사용자 */
  const [uid, setUid] = useState(() => auth.currentUser?.uid || null);
  const [displayName, setDisplayName] = useState(() => auth.currentUser?.displayName || '');

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUid(u?.uid || null);
      setDisplayName(u?.displayName || '');
    });
    return () => unsub();
  }, []);

  /* ✅ Firestore 실시간 구독: 공유 + 내 개인 */
  useEffect(() => {
    const col = collection(db, 'schedules');

    // (1) shared 모두
    const qShared = query(col, where('type', '==', 'shared'));
    const unsubShared = onSnapshot(qShared, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setSchedules((prev) => {
        const personalOnly = prev.filter((v) => v.type === 'personal');
        const merged = [...personalOnly, ...list];
        return dedupById(merged);
      });
    });

    // (2) 내 personal
    let unsubPersonal = () => {};
    if (uid) {
      const qPersonal = query(col, where('type', '==', 'personal'), where('ownerUid', '==', uid));
      unsubPersonal = onSnapshot(qPersonal, (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setSchedules((prev) => {
          const sharedOnly = prev.filter((v) => v.type === 'shared');
          const merged = [...sharedOnly, ...list];
          return dedupById(merged);
        });
      });
    } else {
      setSchedules((prev) => prev.filter((v) => v.type === 'shared'));
    }

    return () => {
      unsubShared();
      unsubPersonal && unsubPersonal();
    };
  }, [uid]);

  /* ✅ 중복 제거 유틸 */
  const dedupById = (arr) => {
    const map = new Map();
    arr.forEach((it) => map.set(it.id, it));
    return Array.from(map.values());
  };

  /* 알림 */
  useEffect(() => {
    const checkAlarms = () => {
      const now = new Date();
      schedules.forEach((schedule) => {
        if (schedule.alarm && !schedule.completed) {
          const scheduleTime = new Date(`${schedule.date}T${schedule.time || '00:00'}`);
          if (scheduleTime > now && scheduleTime - now < 60000) {
            const delay = scheduleTime - now;
            setTimeout(() => {
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification(`일정 알림: ${schedule.title}`, {
                  body: `오늘 ${schedule.time || '시간 미지정'} 일정이 있습니다.`,
                });
              }
              try {
                const audio = new Audio('/sounds/notify.mp3');
                audio.play().catch(() => {});
              } catch {}
            }, delay);
          }
        }
      });
    };
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
    const interval = setInterval(checkAlarms, 30000);
    return () => clearInterval(interval);
  }, [schedules]);

  /* 날짜별 필터 (미완료 먼저, 완료는 아래로) */
  const getSchedulesByDate = (date) => {
    const dateString = fmtDate(date);
    return schedules
      .filter((s) => s.date === dateString)
      .sort((a, b) => {
        if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1; // 완료는 아래
        return (a.time || '').localeCompare(b.time || '');
      });
  };

  const today = new Date();
  const yesterday = useMemo(() => new Date(new Date().setDate(today.getDate() - 1)), [today]);
  const tomorrow = useMemo(() => new Date(new Date().setDate(today.getDate() + 1)), [today]);

  const yesterdaySchedules = getSchedulesByDate(yesterday);
  const todaySchedules = getSchedulesByDate(today);
  const tomorrowSchedules = getSchedulesByDate(tomorrow);

  /* DnD */
  const onDragStartItem = (e, id) => {
    e.dataTransfer.setData('text/plain', String(id));
  };
  const moveItemToDate = async (id, dateStr) => {
    try {
      await updateDoc(doc(db, 'schedules', String(id)), { date: dateStr, updatedAt: serverTimestamp() });
    } catch (err) {
      console.error('[moveItemToDate] failed:', err);
      alert('날짜 이동 중 오류가 발생했습니다.');
    }
  };

  /* 아이템 */
  const ScheduleItem = ({ schedule }) => (
    <div
      className={`schedule-item compact ${schedule.completed ? 'completed' : ''}`}
      draggable
      onDragStart={(e) => onDragStartItem(e, schedule.id)}
      title={schedule.title}
    >
      <div className="checkbox-container" onClick={(e)=>e.stopPropagation()}>
        <input
          type="checkbox"
          id={`schedule-${schedule.id}`}
          checked={!!schedule.completed}
          onChange={() => handleToggleComplete(schedule.id, !!schedule.completed)}
        />
        <label htmlFor={`schedule-${schedule.id}`}></label>
      </div>
      <div className="schedule-details">
        <p className="schedule-title small">{schedule.title}</p>
        <div className="schedule-meta smaller">
          <span className="schedule-time">
            <IconClock /> {schedule.time || '—'}
          </span>
          <span className={`schedule-type ${schedule.type}`}>{schedule.type === 'personal' ? '개인' : '공유'}</span>
        </div>
      </div>
      <div className="schedule-actions" onClick={(e)=>e.stopPropagation()}>
        <button type="button" onClick={() => handleOpenModal(schedule)} className="action-btn" title="수정">
          <IconEdit />
        </button>
        <button type="button" onClick={() => handleDeleteSchedule(schedule.id)} className="action-btn" title="삭제">
          <IconTrash />
        </button>
      </div>
    </div>
  );

  const droppableHandlers = (targetDate) => ({
    onDragOver: (e) => e.preventDefault(),
    onDrop: (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      if (id) moveItemToDate(id, fmtDate(targetDate));
    },
  });

  const TitleWithIcon = ({ icon, text, sub }) => (
    <h2 className="column-title">
      <span className="title-icon">{icon}</span>
      {text} <span className="column-date">{sub}</span>
    </h2>
  );

  const ScheduleColumn = ({ title, date, schedules }) => (
    <div className="schedule-column taller" {...droppableHandlers(date)}>
      <TitleWithIcon
        icon={<IconCalendar />}
        text={title}
        sub={date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
      />
      <div className="schedule-list">
        {schedules.length > 0 ? schedules.map((s) => <ScheduleItem key={s.id} schedule={s} />) : <p className="no-schedules">예정된 일정이 없습니다.</p>}
      </div>
    </div>
  );

  /* 핸들러 */
  const handleOpenModal = (schedule = null) => {
    setCurrentSchedule(schedule);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentSchedule(null);
  };

  const handleSaveSchedule = async (scheduleData) => {
    if (!scheduleData?.title || !scheduleData?.date) {
      alert('제목과 날짜를 입력해주세요.');
      return;
    }
    try {
      if (currentSchedule?.id) {
        await updateDoc(doc(db, 'schedules', String(currentSchedule.id)), {
          ...scheduleData,
          updatedAt: serverTimestamp()
        });
      } else {
        const ownerFields =
          scheduleData.type === 'personal'
            ? { ownerUid: uid || null, ownerName: displayName || null }
            : { ownerUid: null, ownerName: null };
        await addDoc(collection(db, 'schedules'), {
          ...scheduleData,
          completed: false,
          ...ownerFields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      handleCloseModal();
    } catch (err) {
      console.error('[handleSaveSchedule] failed:', err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteSchedule = async (id) => {
    if (!id) return;
    if (!window.confirm('정말로 이 일정을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'schedules', String(id)));
    } catch (err) {
      console.error('[handleDeleteSchedule] failed:', err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleToggleComplete = async (id, current) => {
    try {
      await updateDoc(doc(db, 'schedules', String(id)), {
        completed: !current,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('[handleToggleComplete] failed:', err);
      alert('상태 변경 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="schedule-app">
      {/* ✅ 헤더도 우측으로 살짝 이동 */}
      <header className="app-header shift-right">
        <h1 className="app-title"><span className="title-icon"><IconCalendar /></span>My Schedule</h1>
        <button type="button" onClick={() => setIsCalendarOpen(true)} className="calendar-toggle-btn">
          <span className="btn-icon"><IconCalendar /></span>
          <span>전체 달력 보기</span>
        </button>
      </header>

      {/* ✅ 어제/오늘/내일 그리드도 동일한 오프셋 적용 */}
      <main className="main-view shift-right">
        <ScheduleColumn title="Yesterday" date={yesterday} schedules={yesterdaySchedules} />
        <ScheduleColumn title="Today" date={today} schedules={todaySchedules} />
        <ScheduleColumn title="Tomorrow" date={tomorrow} schedules={tomorrowSchedules} />
      </main>

      <button type="button" onClick={() => handleOpenModal()} className="add-schedule-fab" title="새 일정 추가">
        <IconPlus />
      </button>

      {isModalOpen && <ScheduleModal schedule={currentSchedule} onSave={handleSaveSchedule} onClose={handleCloseModal} />}
      {isCalendarOpen && (
        <CalendarView
          schedules={schedules}
          onClose={() => setIsCalendarOpen(false)}
          onDropMove={moveItemToDate}
          onOpenEdit={(s)=>{ setCurrentSchedule(s); setIsModalOpen(true); }}
        />
      )}
    </div>
  );
}

export default SchedulePage;
