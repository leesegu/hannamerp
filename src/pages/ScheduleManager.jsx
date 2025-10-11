import React, { useState, useEffect, useMemo } from 'react';
import './ScheduleManager.css';

// 아이콘 SVG 컴포넌트들 (코드 가독성을 위해 분리)
const IconCalendar = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
const IconPlus = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
const IconEdit = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>;
const IconTrash = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>;
const IconX = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const IconClock = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>;


// 목업 데이터 (초기 샘플 데이터)
const initialSchedules = [
    { id: 1, title: "오전 9시 팀 회의", date: new Date().toISOString().split('T')[0], time: "09:00", type: "shared", completed: true, alarm: false },
    { id: 2, title: "디자인 시안 A/B 테스트", date: new Date().toISOString().split('T')[0], time: "11:00", type: "shared", completed: false, alarm: true },
    { id: 3, title: "점심 약속 (김이사님)", date: new Date().toISOString().split('T')[0], time: "12:30", type: "personal", completed: false, alarm: true },
    { id: 4, title: "프로젝트 기획서 초안 작성", date: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0], time: "14:00", type: "personal", completed: true, alarm: false },
    { id: 5, title: "파트너사 미팅 준비", date: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0], time: "10:00", type: "shared", completed: false, alarm: true },
    { id: 6, title: "운동 - 헬스장", date: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0], time: "19:00", type: "personal", completed: false, alarm: false },
];

const SchedulePage = () => {
    const [schedules, setSchedules] = useState(initialSchedules);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [currentSchedule, setCurrentSchedule] = useState(null);

    // 알림 기능
    useEffect(() => {
        const checkAlarms = () => {
            const now = new Date();
            schedules.forEach(schedule => {
                if (schedule.alarm && !schedule.completed) {
                    const scheduleTime = new Date(`${schedule.date}T${schedule.time}`);
                    // 1분 이내에 예정된 알림을 확인
                    if (scheduleTime > now && scheduleTime - now < 60000) {
                        setTimeout(() => {
                            if (Notification.permission === "granted") {
                                new Notification(`일정 알림: ${schedule.title}`, {
                                    body: `오늘 ${schedule.time}에 예정된 일정이 있습니다.`,
                                });
                                // 알림음 재생 (실제 파일 경로 필요)
                                // new Audio('/path/to/notification.mp3').play();
                            }
                        }, scheduleTime - now);
                    }
                }
            });
        };

        // 최초 1회 알림 권한 요청
        if (Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        const interval = setInterval(checkAlarms, 30000); // 30초마다 알림 체크
        return () => clearInterval(interval);
    }, [schedules]);

    // 날짜별 일정 필터링
    const getSchedulesByDate = (date) => {
        const dateString = date.toISOString().split('T')[0];
        return schedules
            .filter(s => s.date === dateString)
            .sort((a, b) => a.time.localeCompare(b.time));
    };

    const today = new Date();
    const yesterday = useMemo(() => new Date(new Date().setDate(today.getDate() - 1)), [today]);
    const tomorrow = useMemo(() => new Date(new Date().setDate(today.getDate() + 1)), [today]);

    const yesterdaySchedules = getSchedulesByDate(yesterday);
    const todaySchedules = getSchedulesByDate(today);
    const tomorrowSchedules = getSchedulesByDate(tomorrow);

    // 핸들러 함수들
    const handleOpenModal = (schedule = null) => {
        setCurrentSchedule(schedule);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setCurrentSchedule(null);
    };

    const handleSaveSchedule = (scheduleData) => {
        if (currentSchedule) { // 수정
            setSchedules(schedules.map(s => s.id === currentSchedule.id ? { ...s, ...scheduleData } : s));
        } else { // 추가
            setSchedules([...schedules, { id: Date.now(), ...scheduleData, completed: false }]);
        }
        handleCloseModal();
    };

    const handleDeleteSchedule = (id) => {
        if (window.confirm("정말로 이 일정을 삭제하시겠습니까?")) {
            setSchedules(schedules.filter(s => s.id !== id));
        }
    };
    
    const handleToggleComplete = (id) => {
        setSchedules(schedules.map(s => s.id === id ? { ...s, completed: !s.completed } : s));
    };


    // 컴포넌트 렌더링
    const ScheduleItem = ({ schedule }) => (
        <div className={`schedule-item ${schedule.completed ? 'completed' : ''}`}>
            <div className="checkbox-container">
                <input
                    type="checkbox"
                    id={`schedule-${schedule.id}`}
                    checked={schedule.completed}
                    onChange={() => handleToggleComplete(schedule.id)}
                />
                <label htmlFor={`schedule-${schedule.id}`}></label>
            </div>
            <div className="schedule-details">
                <p className="schedule-title">{schedule.title}</p>
                <div className="schedule-meta">
                    <span className="schedule-time"><IconClock /> {schedule.time}</span>
                    <span className={`schedule-type ${schedule.type}`}>{schedule.type === 'personal' ? '개인' : '공유'}</span>
                </div>
            </div>
            <div className="schedule-actions">
                <button onClick={() => handleOpenModal(schedule)} className="action-btn"><IconEdit /></button>
                <button onClick={() => handleDeleteSchedule(schedule.id)} className="action-btn"><IconTrash /></button>
            </div>
        </div>
    );

    const ScheduleColumn = ({ title, date, schedules }) => (
        <div className="schedule-column">
            <h2 className="column-title">{title} <span className="column-date">{date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</span></h2>
            <div className="schedule-list">
                {schedules.length > 0 ? (
                    schedules.map(s => <ScheduleItem key={s.id} schedule={s} />)
                ) : (
                    <p className="no-schedules">예정된 일정이 없습니다.</p>
                )}
            </div>
        </div>
    );

    return (
        <div className="schedule-app">
            <header className="app-header">
                <h1>My Schedule</h1>
                <button onClick={() => setIsCalendarOpen(true)} className="calendar-toggle-btn">
                    <IconCalendar />
                    <span>전체 달력 보기</span>
                </button>
            </header>

            <main className="main-view">
                <ScheduleColumn title="어제" date={yesterday} schedules={yesterdaySchedules} />
                <ScheduleColumn title="오늘" date={today} schedules={todaySchedules} />
                <ScheduleColumn title="내일" date={tomorrow} schedules={tomorrowSchedules} />
            </main>

            <button onClick={() => handleOpenModal()} className="add-schedule-fab">
                <IconPlus />
            </button>
            
            {isModalOpen && <ScheduleModal schedule={currentSchedule} onSave={handleSaveSchedule} onClose={handleCloseModal} />}
            {isCalendarOpen && <CalendarView schedules={schedules} onClose={() => setIsCalendarOpen(false)} />}
        </div>
    );
};


const ScheduleModal = ({ schedule, onSave, onClose }) => {
    const [title, setTitle] = useState(schedule?.title || '');
    const [date, setDate] = useState(schedule?.date || new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState(schedule?.time || '');
    const [type, setType] = useState(schedule?.type || 'personal');
    const [alarm, setAlarm] = useState(schedule?.alarm || false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title || !date || !time) {
            alert("제목, 날짜, 시간을 모두 입력해주세요.");
            return;
        }
        onSave({ title, date, time, type, alarm });
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <button onClick={onClose} className="modal-close-btn"><IconX /></button>
                <h2>{schedule ? '일정 수정' : '새 일정 추가'}</h2>
                <form onSubmit={handleSubmit} className="schedule-form">
                    <div className="form-group">
                        <label htmlFor="title">일정 제목</label>
                        <input type="text" id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 프로젝트 회의" required />
                    </div>
                    <div className="form-group-row">
                        <div className="form-group">
                            <label htmlFor="date">날짜</label>
                            <input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="time">시간</label>
                            <input type="time" id="time" value={time} onChange={e => setTime(e.target.value)} required />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>종류</label>
                        <div className="radio-group">
                            <label><input type="radio" name="type" value="personal" checked={type === 'personal'} onChange={e => setType(e.target.value)} /> 개인</label>
                            <label><input type="radio" name="type" value="shared" checked={type === 'shared'} onChange={e => setType(e.target.value)} /> 공유</label>
                        </div>
                    </div>
                     <div className="form-group">
                        <div className="toggle-switch">
                            <input type="checkbox" id="alarm" checked={alarm} onChange={e => setAlarm(e.target.checked)} />
                            <label htmlFor="alarm">알림 설정</label>
                        </div>
                    </div>
                    <button type="submit" className="form-submit-btn">{schedule ? '수정하기' : '추가하기'}</button>
                </form>
            </div>
        </div>
    );
};

const CalendarView = ({ schedules, onClose }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDay = startOfMonth.getDay(); // 0 for Sunday, 1 for Monday...

    const daysInMonth = [];
    for (let i = 1; i <= endOfMonth.getDate(); i++) {
        daysInMonth.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
    }
    const emptyDays = Array(startDay).fill(null);
    const calendarDays = [...emptyDays, ...daysInMonth];

    const getSchedulesForDay = (day) => {
        if (!day) return [];
        const dateString = day.toISOString().split('T')[0];
        return schedules.filter(s => s.date === dateString);
    };
    
    const changeMonth = (offset) => {
      setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + offset)));
    };


    return (
        <div className="modal-backdrop calendar-backdrop">
            <div className="calendar-view">
                <button onClick={onClose} className="modal-close-btn calendar-close-btn"><IconX /></button>
                <div className="calendar-header">
                    <button onClick={() => changeMonth(-1)}>&lt;</button>
                    <h2>{currentDate.getFullYear()}년 {currentDate.toLocaleString('default', { month: 'long' })}</h2>
                    <button onClick={() => changeMonth(1)}>&gt;</button>
                </div>
                <div className="calendar-grid">
                    <div className="day-name">일</div>
                    <div className="day-name">월</div>
                    <div className="day-name">화</div>
                    <div className="day-name">수</div>
                    <div className="day-name">목</div>
                    <div className="day-name">금</div>
                    <div className="day-name">토</div>
                    {calendarDays.map((day, index) => (
                        <div key={index} className={`calendar-day ${!day ? 'empty' : ''} ${day && day.toDateString() === new Date().toDateString() ? 'today' : ''}`}>
                            {day && <span>{day.getDate()}</span>}
                             {day && getSchedulesForDay(day).length > 0 && 
                                <div className="schedule-dots">
                                    {getSchedulesForDay(day).slice(0,3).map(s => <div key={s.id} className={`dot ${s.type}`}></div>)}
                                    {getSchedulesForDay(day).length > 3 && <div className="dot more">+{getSchedulesForDay(day).length - 3}</div>}
                                </div>
                             }
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};


export default SchedulePage;