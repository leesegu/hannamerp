import React, { useEffect, useMemo, useRef, useState } from "react";
import "./MobilePersonalLedgerPage.css";
import { useNavigate } from "react-router-dom";

import { auth, db } from "../firebase";
import {
  collection, addDoc, onSnapshot, query, orderBy, where, doc, deleteDoc, updateDoc,
  startAt, endAt
} from "firebase/firestore";

/** =========================
 * 설계 요약
 * - 사용자별 분리: users/{uid}/personal_ledger 서브컬렉션
 * - 입력 폼: 수입/지출 토글, 날짜(기본 오늘), 거래처/현장, 내용, 금액(천단위 콤마), 메모
 * - 월 선택: 날짜 선택 시 monthKey 자동 갱신
 * - 내역 리스트: 가능한 2줄로 압축표시 → ☑️ (요청에 따라 리스트는 '선택한 날짜'만 노출)
 * - 모바일 전용 레이아웃(네온/글로시), 페이지 스코프 CSS
 * - ☑️ 우측 상단 연간 요약 모달: 연도 선택 → 1~12월 수입/지출/차액 표시
 * ========================= */

const pad2 = (n) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const ymStr = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const toNumber = (v) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const comma = (n) => Number(n || 0).toLocaleString();

const TYPE_OPTIONS = [
  { key: "income", label: "수입" },
  { key: "expense", label: "지출" },
];

/* ===== ★ 낙관적 업데이트 유틸 (중복 없이 즉시 반영) ===== */
const upsertById = (arr, item) => {
  const i = arr.findIndex((v) => v.id === item.id);
  if (i === -1) return [item, ...arr];
  const next = arr.slice();
  next[i] = { ...arr[i], ...item };
  return next;
};
const removeById = (arr, id) => arr.filter((v) => v.id !== id);

export default function MobilePersonalLedgerPage() {
  const navigate = useNavigate();
  const user = auth.currentUser;
  const uid = user?.uid || null;

  /* ★ auth 상태 구독 → 실시간 uid */
  const [liveUid, setLiveUid] = useState(uid);
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setLiveUid(u?.uid || null));
    return () => unsub();
  }, []);

  // ===== 월/일 선택 =====
  const [monthKey, setMonthKey] = useState(ymStr());
  const [date, setDate] = useState(todayStr());

  // ===== 입력 폼 =====
  const [type, setType] = useState("expense");
  const [party, setParty] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  // ☑️ 수정 모드(ID 보관)
  const [editingId, setEditingId] = useState(null);

  const amountNumber = useMemo(() => toNumber(amount), [amount]);

  const resetForm = () => {
    setType("expense");
    setParty("");
    setTitle("");
    setAmount("");
    setMemo("");
    setEditingId(null);
  };

  // ===== 실시간 데이터 상태 =====
  const [rowsMonth, setRowsMonth] = useState([]); // 선택 월 전체(합계 카드용)
  const [rowsDay, setRowsDay] = useState([]);     // 선택 일 리스트

  // ☑️ 저장/수정 — 낙관적 업데이트 + 스냅샷 동기화
  const onSubmit = async () => {
    const uidUse = liveUid || uid;
    if (!uidUse) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (!amountNumber) {
      alert("금액을 입력해 주세요.");
      return;
    }
    const data = {
      type,
      date,
      monthKey: date.slice(0, 7),
      title: title.trim() || (type === "income" ? "수입" : "지출"),
      party: party.trim(),
      amount: amountNumber,
      memo: memo.trim(),
      updatedAt: Date.now(),
      uid: uidUse,
    };

    try {
      if (editingId) {
        /* ★ 낙관적 업데이트 (수정) */
        setRowsDay((prev) => upsertById(prev, { id: editingId, ...data }));
        if (data.monthKey === monthKey) {
          setRowsMonth((prev) => upsertById(prev, { id: editingId, ...data }));
        }
        await updateDoc(doc(db, "users", uidUse, "personal_ledger", editingId), data);
      } else {
        /* ★ 낙관적 업데이트 (신규) — 임시 ID */
        const tempId = "__temp__" + Date.now();
        const tempDoc = { id: tempId, createdAt: Date.now(), ...data };
        if (date === data.date) setRowsDay((prev) => upsertById(prev, tempDoc));
        if (data.monthKey === monthKey) setRowsMonth((prev) => upsertById(prev, tempDoc));

        const ref = await addDoc(collection(db, "users", uidUse, "personal_ledger"), {
          ...data,
          createdAt: Date.now(),
        });

        /* 스냅샷이 오면 실제 ID로 대체되지만, 혹시 늦어질 경우를 대비해 즉시 교체 */
        setRowsDay((prev) =>
          prev.map((r) => (r.id === tempId ? { ...r, id: ref.id } : r))
        );
        setRowsMonth((prev) =>
          prev.map((r) => (r.id === tempId ? { ...r, id: ref.id } : r))
        );
      }

      resetForm();

      // 저장 후 리스트 쪽으로 자연 스크롤
      requestAnimationFrame(() => {
        const list = document.querySelector(".mplg .mplg-list");
        if (list) list.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  const onDelete = async (id) => {
    const uidUse = liveUid || uid;
    if (!uidUse || !id) return;
    const ok = window.confirm("삭제하시겠습니까?");
    if (!ok) return;
    try {
      /* ★ 낙관적 업데이트 (삭제) */
      setRowsDay((prev) => removeById(prev, id));
      setRowsMonth((prev) => removeById(prev, id));

      await deleteDoc(doc(db, "users", uidUse, "personal_ledger", id));

      if (editingId === id) resetForm();
    } catch (err) {
      console.error(err);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  // ☑️ 수정 버튼: 폼으로 로드
  const onEditLoad = (r) => {
    setEditingId(r.id);
    setType(r.type || "expense");
    setDate(r.date);
    setParty(r.party || "");
    setTitle(r.title || "");
    setAmount(r.amount ? comma(r.amount) : "");
    setMemo(r.memo || "");
    const mk = (r.date || "").slice(0, 7);
    if (mk && mk !== monthKey) setMonthKey(mk);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ===== 월별 내역(합계 카드용) 실시간 구독 =====
  useEffect(() => {
    const uidUse = liveUid || uid;
    if (!uidUse) return;
    const ref = collection(db, "users", uidUse, "personal_ledger");
    const q = query(
      ref,
      where("monthKey", "==", monthKey),
      orderBy("date", "desc"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRowsMonth(list);
    });
    return () => unsub();
  }, [liveUid, uid, monthKey]);

  // ===== 일별 내역(리스트용) 실시간 구독 =====
  useEffect(() => {
    const uidUse = liveUid || uid;
    if (!uidUse || !date) return;
    const ref = collection(db, "users", uidUse, "personal_ledger");
    const q = query(
      ref,
      where("date", "==", date),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRowsDay(list);
    });
    return () => unsub();
  }, [liveUid, uid, date]);

  // ===== 월 합계(상단 카드) =====
  const { incomeSum, expenseSum, diff } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    rowsMonth.forEach((r) => {
      if (r.type === "income") inc += r.amount || 0;
      else exp += r.amount || 0;
    });
    return { incomeSum: inc, expenseSum: exp, diff: inc - exp };
  }, [rowsMonth]);

  // ===== 커스텀 달력 =====
  const [calOpen, setCalOpen] = useState(false);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const dateInputRef = useRef(null);

  const openCalendar = () => {
    const d = new Date(date || todayStr());
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
    setCalOpen(true);
  };
  const closeCalendar = () => setCalOpen(false);

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();
  const prevMonth = () => {
    const m = calMonth - 1;
    if (m < 0) {
      setCalYear(calYear - 1);
      setCalMonth(11);
    } else setCalMonth(m);
  };
  const nextMonth = () => {
    const m = calMonth + 1;
    if (m > 11) {
      setCalYear(calYear + 1);
      setCalMonth(0);
    } else setCalMonth(m);
  };
  const selectDate = (dnum) => {
    const y = calYear;
    const m = calMonth + 1;
    const ds = `${y}-${pad2(m)}-${pad2(dnum)}`;
    setDate(ds);
    const mk = ds.slice(0, 7);
    if (mk !== monthKey) setMonthKey(mk);
    setCalOpen(false);
  };

  // ===== 요약(연간) =====
  const [yearOpen, setYearOpen] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [yearRows, setYearRows] = useState([]);
  const [loadingYear, setLoadingYear] = useState(false);

  useEffect(() => {
    const uidUse = liveUid || uid;
    if (!uidUse || !yearOpen) return;
    setLoadingYear(true);
    const ref = collection(db, "users", uidUse, "personal_ledger");
    const start = `${year}-01`;
    const end = `${year}-12`;
    const q = query(
      ref,
      orderBy("monthKey"),
      startAt(start),
      endAt(end + "\uf8ff")
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setYearRows(list);
      setLoadingYear(false);
    });
    return () => unsub();
  }, [liveUid, uid, yearOpen, year]);

  const monthlyAgg = useMemo(() => {
    const base = Array.from({ length: 12 }, (_, i) => ({
      m: i + 1,
      income: 0,
      expense: 0,
      diff: 0,
    }));
    yearRows.forEach((r) => {
      if (!r?.monthKey) return;
      const mm = Number(String(r.monthKey).slice(5, 7));
      if (!mm || mm < 1 || mm > 12) return;
      if (r.type === "income") base[mm - 1].income += r.amount || 0;
      else base[mm - 1].expense += r.amount || 0;
    });
    base.forEach((b) => (b.diff = b.income - b.expense));
    return base;
  }, [yearRows]);

  /* 월 클릭 시 일자별 집계 펼침 */
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const yearsList = useMemo(
    () => Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i),
    []
  );

  const dailyAggByMonth = useMemo(() => {
    const map = {};
    for (let i = 1; i <= 12; i++) map[i] = [];
    const bucket = {};
    yearRows.forEach((r) => {
      const mk = r.monthKey;
      if (!mk) return;
      const mm = Number(String(mk).slice(5, 7));
      if (!mm) return;
      const key = r.date || `${mk}-01`;
      if (!bucket[key]) bucket[key] = { date: key, income: 0, expense: 0, diff: 0 };
      if (r.type === "income") bucket[key].income += r.amount || 0;
      else bucket[key].expense += r.amount || 0;
    });
    Object.values(bucket).forEach((d) => {
      d.diff = d.income - d.expense;
      const mm = Number(String(d.date).slice(5, 7));
      if (!map[mm]) map[mm] = [];
      map[mm].push(d);
    });
    for (let i = 1; i <= 12; i++) {
      map[i].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
    return map;
  }, [yearRows]);

  return (
    <div className="mplg">
      {/* 상단 헤더 */}
      <div className="mplg-top">
        <button
          className="back-btn luxe"
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate("/mobile/list", { replace: true });
          }}
          aria-label="뒤로가기"
          title="뒤로가기"
        >
          <span className="back-icon">←</span>
          <span className="back-text">뒤로가기</span>
        </button>

        {/* 중앙 타이틀 */}
        <div className="mplg-title">
          <span>개인 장부</span>
        </div>

        {/* 우측 상단 요약 버튼 */}
        <div className="top-right">
          <button className="year-btn" onClick={() => setYearOpen(true)} aria-label="요약">
            요약
          </button>
        </div>
      </div>

      {/* 합계 카드 (월 기준) */}
      <div className="mplg-cards">
        <div className="mplg-card income">
          <div className="label">월 수입</div>
          <div className="value nowrap small">{comma(incomeSum)}원</div>
        </div>
        <div className="mplg-card expense">
          <div className="label">월 지출</div>
          <div className="value nowrap small">{comma(expenseSum)}원</div>
        </div>
        <div className={`mplg-card diff ${diff >= 0 ? "pos" : "neg"}`}>
          <div className="label">월 차액</div>
          <div className="value nowrap small">{comma(diff)}원</div>
        </div>
      </div>

      {/* 입력 폼 */}
      <div className="mplg-form">
        <div className="seg">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.key}
              className={`seg-btn ${type === t.key ? "on" : ""}`}
              onClick={() => setType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 날짜(클릭으로 달력 오픈) */}
        <div
          className="row row-calendar"
          onClick={openCalendar}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openCalendar()}
        >
          <label>날짜</label>
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            onChange={(e) => {
              const ds = e.target.value;
              setDate(ds);
              const mk = ds?.slice(0, 7);
              if (mk && mk !== monthKey) setMonthKey(mk);
            }}
            className="inp date-hidden"
          />
          <div className="date-display">
            {date || "-"}
            <span className="date-caret" aria-hidden>▾</span>
          </div>
        </div>

        <div className="row">
          <label>거래처/현장</label>
          <input value={party} onChange={(e) => setParty(e.target.value)} className="inp" />
        </div>

        <div className="row">
          <label>내용</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="inp" />
        </div>

        <div className="row">
          <label>금액</label>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={amount}
            onChange={(e) => {
              const n = toNumber(e.target.value);
              setAmount(n ? comma(n) : "");
            }}
            placeholder="0"
            className="inp amt"
          />
        </div>

        <div className="row">
          <label>메모</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="추가 메모를 입력하세요"
            className="inp textarea"
            rows={3}
          />
        </div>

        <div className="actions">
          <button className="btn save" onClick={onSubmit}>
            {editingId ? "수정 저장" : "저장하기"}
          </button>
          <button className="btn reset" onClick={resetForm}>
            초기화
          </button>
        </div>
      </div>

      {/* 내역 리스트 */}
      <div className="mplg-list">
        {rowsDay.length === 0 ? (
          <div className="empty">선택한 날짜의 내역이 없습니다.</div>
        ) : (
          rowsDay.map((r) => (
            <div key={r.id} className={`item compact ${r.type} ${editingId === r.id ? "editing" : ""}`}>
              <div className="line1 alt">
                <div className="l1-left">
                  <span className="ty">{r.type === "income" ? "수입" : "지출"}</span>
                  <span className="date">{r.date}</span>
                </div>
                <div className="l1-right amt nowrap">{comma(r.amount || 0)}원</div>
              </div>
              <div className="line2 alt">
                <div className="l2-left">
                  <span className="party-strong">{r.party || "-"}</span>
                  <span className="comma">, </span>
                  <span className="title">{r.title || "-"}</span>
                </div>
                <div className="l2-right">
                  <button className="mini-btn edit" onClick={() => onEditLoad(r)} aria-label="수정">수정</button>
                  <button className="mini-btn del" onClick={() => onDelete(r.id)} aria-label="삭제">삭제</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ height: 40 }} />

      {/* 커스텀 달력 모달 */}
      {calOpen && (
        <div className="cal-overlay" onClick={closeCalendar}>
          <div className="cal" onClick={(e) => e.stopPropagation()}>
            <div className="cal-header">
              <button className="nav prev" onClick={prevMonth} aria-label="이전 달">‹</button>
              <div className="ym">{calYear}.{pad2(calMonth + 1)}</div>
              <button className="nav next" onClick={nextMonth} aria-label="다음 달">›</button>
            </div>
            <div className="cal-grid">
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                <div key={d} className="wd">{d}</div>
              ))}
              {Array.from({ length: firstDayOfMonth(calYear, calMonth) }).map((_, i) => (
                <div key={`emp-${i}`} className="emp" />
              ))}
              {Array.from({ length: daysInMonth(calYear, calMonth) }).map((_, i) => {
                const dnum = i + 1;
                const current = `${calYear}-${pad2(calMonth + 1)}-${pad2(dnum)}`;
                const isSel = current === date;
                return (
                  <button
                    key={`d-${dnum}`}
                    className={`day ${isSel ? "sel" : ""}`}
                    onClick={() => selectDate(dnum)}
                  >
                    {dnum}
                  </button>
                );
              })}
            </div>
            <div className="cal-actions">
              <button className="pill close" onClick={closeCalendar}>닫기</button>
              <button
                className="pill today"
                onClick={() => {
                  const t = new Date();
                  setCalYear(t.getFullYear());
                  setCalMonth(t.getMonth());
                  const ds = todayStr();
                  setDate(ds);
                  const mk = ds.slice(0, 7);
                  if (mk !== monthKey) setMonthKey(mk);
                  setCalOpen(false);
                }}
              >
                오늘로
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 요약 모달 */}
      {yearOpen && (
        <div className="year-overlay" onClick={() => setYearOpen(false)}>
          <div className="year-modal" onClick={(e) => e.stopPropagation()}>
            {/* 헤더: 제목 '요약' + 커스텀 드롭다운 + X */}
            <div className="year-head trio">
              <div className="title white">요약</div>

              <div className="year-head-controls">
                {/* 접근성용 실제 select (시각적으로 숨김) */}
                <select
                  className="sr-only"
                  value={year}
                  onChange={(e) => {
                    setExpandedMonth(null);
                    setYear(Number(e.target.value));
                  }}
                  aria-label="연도 선택(숨김)"
                  title="연도"
                >
                  {yearsList.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>

                {/* 커스텀 드롭다운 */}
                <div className="year-dd" data-open={yearMenuOpen ? "1" : "0"}>
                  <button
                    type="button"
                    className="year-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={yearMenuOpen}
                    onClick={() => setYearMenuOpen((v) => !v)}
                  >
                    <span className="year-trigger-label">{year}</span>
                    <span className="caret">▾</span>
                  </button>

                  {yearMenuOpen && (
                    <div className="year-menu" role="listbox" tabIndex={-1}>
                      {yearsList.map((y) => (
                        <button
                          key={y}
                          role="option"
                          aria-selected={y === year}
                          className={`year-option ${y === year ? "sel" : ""}`}
                          onClick={() => {
                            setExpandedMonth(null);
                            setYear(y);
                            setYearMenuOpen(false);
                          }}
                        >
                          <span className="opt-year">{y}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button className="x square" onClick={() => setYearOpen(false)} aria-label="닫기">✕</button>
              </div>
            </div>

            {/* 본문(스크롤 영역) */}
            <div className="year-body">
              <div className="year-table">
                <div className="y-row y-head">
                  <div>월</div>
                  <div>수입</div>
                  <div>지출</div>
                  <div>차액</div>
                </div>

                {loadingYear ? (
                  <div className="loading">불러오는 중…</div>
                ) : (
                  monthlyAgg.map((m) => {
                    const isOpen = expandedMonth === m.m;
                    return (
                      <React.Fragment key={m.m}>
                        <button
                          className={`y-row y-month clickable ${isOpen ? "open" : ""}`}
                          onClick={() => setExpandedMonth(isOpen ? null : m.m)}
                          aria-expanded={isOpen}
                          aria-controls={`m-${m.m}-days`}
                        >
                          <div>{m.m}월</div>
                          <div className="pos nowrap">{comma(m.income)}원</div>
                          <div className="neg nowrap">{comma(m.expense)}원</div>
                          <div className={`diff ${m.diff >= 0 ? "pos" : "neg"} nowrap`}>{comma(m.diff)}원</div>
                        </button>

                        {isOpen && (
                          <div id={`m-${m.m}-days`} className="y-days">
                            <div className="y-days-head">
                              <div>일자</div>
                              <div>수입</div>
                              <div>지출</div>
                              <div>차액</div>
                            </div>
                            {dailyAggByMonth[m.m].length === 0 ? (
                              <div className="y-days-empty">해당 월 데이터가 없습니다.</div>
                            ) : (
                              dailyAggByMonth[m.m].map((d) => (
                                <div className="y-days-row nowrap-rows small-rows" key={d.date}>
                                  <div className="nowrap">{d.date}</div>
                                  <div className="pos nowrap">{comma(d.income)}원</div>
                                  <div className="neg nowrap">{comma(d.expense)}원</div>
                                  <div className={`diff ${d.diff >= 0 ? "pos" : "neg"} nowrap`}>
                                    {comma(d.diff)}원
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </div>

            <div className="year-foot">
              <button className="pill close" onClick={() => setYearOpen(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
