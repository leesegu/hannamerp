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

export default function MobilePersonalLedgerPage() {
  const navigate = useNavigate();
  const user = auth.currentUser;
  const uid = user?.uid || null;

  // ===== 월/일 선택(달력 선택 시 갱신) =====
  const [monthKey, setMonthKey] = useState(ymStr());
  const [date, setDate] = useState(todayStr()); // ✅ 이 날짜에 해당하는 항목만 리스트에 노출

  // ===== 입력 폼 =====
  const [type, setType] = useState("expense"); // 기본: 지출
  const [party, setParty] = useState(""); // 거래처/현장
  const [title, setTitle] = useState(""); // 내용
  const [amount, setAmount] = useState(""); // 문자열(콤마표시)
  const [memo, setMemo] = useState("");

  // ☑️ 수정 모드(ID 보관)
  const [editingId, setEditingId] = useState(null);

  const amountNumber = useMemo(() => toNumber(amount), [amount]);

  // ☑️ reset 시 선택한 날짜/월은 유지(즉시 반영 문제 해결)
  const resetForm = () => {
    setType("expense");
    setParty("");
    setTitle("");
    setAmount("");
    setMemo("");
    setEditingId(null);
  };

  // ☑️ 저장: 신규/수정 분기 + 스냅샷 즉시 반영(선택일/월 유지)
  const onSubmit = async () => {
    if (!uid) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (!amountNumber) {
      alert("금액을 입력해 주세요.");
      return;
    }
    const data = {
      type, // "income" | "expense"
      date, // "YYYY-MM-DD"
      monthKey: date.slice(0, 7),
      title: title.trim() || (type === "income" ? "수입" : "지출"),
      party: party.trim(),
      amount: amountNumber,
      memo: memo.trim(),
      updatedAt: Date.now(),
      uid,
    };

    try {
      if (editingId) {
        // 수정
        await updateDoc(doc(db, "users", uid, "personal_ledger", editingId), data);
      } else {
        // 신규
        await addDoc(collection(db, "users", uid, "personal_ledger"), {
          ...data,
          createdAt: Date.now(),
        });
      }
      resetForm(); // 폼만 리셋. date/monthKey 그대로 유지 → 리스트가 즉시 보임
      // onSnapshot으로 즉시 반영됨
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  // ===== 월별 내역(합계 카드용) 구독 =====
  const [rowsMonth, setRowsMonth] = useState([]);
  useEffect(() => {
    if (!uid) return;
    const ref = collection(db, "users", uid, "personal_ledger");
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
  }, [uid, monthKey]);

  // ===== 일별 내역(리스트용) 구독 — ✅ 선택한 'date'만 표시 =====
  const [rowsDay, setRowsDay] = useState([]);
  useEffect(() => {
    if (!uid || !date) return;
    const ref = collection(db, "users", uid, "personal_ledger");
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
  }, [uid, date]);

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

  const onDelete = async (id) => {
    if (!uid || !id) return;
    const ok = window.confirm("삭제하시겠습니까?");
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "users", uid, "personal_ledger", id));
      // onSnapshot으로 즉시 반영됨
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
    setDate(r.date); // 선택일과 동일해야 리스트 유지
    setParty(r.party || "");
    setTitle(r.title || "");
    setAmount(r.amount ? comma(r.amount) : "");
    setMemo(r.memo || "");
    const mk = (r.date || "").slice(0, 7);
    if (mk && mk !== monthKey) setMonthKey(mk);
    // 스크롤 상단으로
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ===== 커스텀 달력 =====
  const [calOpen, setCalOpen] = useState(false);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth()); // 0~11
  const dateInputRef = useRef(null);

  const openCalendar = () => {
    const d = new Date(date || todayStr());
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
    setCalOpen(true);
  };
  const closeCalendar = () => setCalOpen(false);

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y, m) => new Date(y, m, 1).getDay(); // 0=Sun
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

  // ===== 연간 요약 모달 =====
  const [yearOpen, setYearOpen] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [yearRows, setYearRows] = useState([]); // 해당 연도 모든 데이터
  const [loadingYear, setLoadingYear] = useState(false);

  useEffect(() => {
    if (!uid || !yearOpen) return;
    setLoadingYear(true);
    const ref = collection(db, "users", uid, "personal_ledger");
    // monthKey가 문자열 "YYYY-MM" 이므로 범위 쿼리 사용
    const start = `${year}-01`;
    const end = `${year}-12`;
    const q = query(
      ref,
      orderBy("monthKey"),
      startAt(start),
      endAt(end + "\uf8ff") // 안전한 상한
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setYearRows(list);
      setLoadingYear(false);
    });
    return () => unsub();
  }, [uid, yearOpen, year]);

  const monthlyAgg = useMemo(() => {
    // 1~12월 집계
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

  // ===== UI =====
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

        {/* ☑️ 다이아 아이콘 제거 + 중앙 정렬 텍스트만 */}
        <div className="mplg-title">
          <span>개인 장부</span>
        </div>

        {/* 우측 상단 연간 요약 버튼 */}
        <div className="top-right">
          <button className="year-btn" onClick={() => setYearOpen(true)} aria-label="연간 요약">
            연간 요약
          </button>
        </div>
      </div>

      {/* 합계 카드 (월 기준) */}
      <div className="mplg-cards">
        <div className="mplg-card income">
          <div className="label">월 수입</div>
          <div className="value">{comma(incomeSum)}원</div>
        </div>
        <div className="mplg-card expense">
          <div className="label">월 지출</div>
          <div className="value">{comma(expenseSum)}원</div>
        </div>
        <div className={`mplg-card diff ${diff >= 0 ? "pos" : "neg"}`}>
          <div className="label">월 차액</div>
          <div className="value">{comma(diff)}원</div>
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

        {/* 날짜: 어디를 눌러도 달력이 열리도록 */}
        <div
          className="row row-calendar"
          onClick={openCalendar}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openCalendar()}
        >
          <label>날짜</label>
          {/* 실제 값은 input에 유지하되 화면상은 프리뷰로 표시 */}
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
            <span className="date-caret" aria-hidden>
              ▾
            </span>
          </div>
        </div>

        {/* 거래처/현장 — ☑️ 설명(placeholder) 제거 */}
        <div className="row">
          <label>거래처/현장</label>
          <input
            value={party}
            onChange={(e) => setParty(e.target.value)}
            className="inp"
          />
        </div>

        {/* 내용 — ☑️ 설명(placeholder) 제거 */}
        <div className="row">
          <label>내용</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="inp"
          />
        </div>

        {/* 금액 */}
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

        {/* 메모 */}
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

      {/* 내역 리스트 — ☑️ 레이아웃 변경 & 수정 버튼 추가 & 삭제 버튼 크기 축소/동일폭 */}
      <div className="mplg-list">
        {rowsDay.length === 0 ? (
          <div className="empty">선택한 날짜의 내역이 없습니다.</div>
        ) : (
          rowsDay.map((r) => (
            <div key={r.id} className={`item compact ${r.type} ${editingId === r.id ? "editing" : ""}`}>
              {/* 1행: 수입/지출 태그 / 날짜 ..... 금액 */}
              <div className="line1 alt">
                <div className="l1-left">
                  <span className="ty">{r.type === "income" ? "수입" : "지출"}</span>
                  <span className="date">{r.date}</span>
                </div>
                <div className="l1-right amt">{comma(r.amount || 0)}원</div>
              </div>
              {/* 2행: 거래처/현장, 내용 ..... 수정/삭제 */}
              <div className="line2 alt">
                <div className="l2-left">
                  <span className="party-strong">{r.party || "-"}</span>
                  <span className="comma">, </span>
                  <span className="title">{r.title || "-"}</span>
                </div>
                <div className="l2-right">
                  <button className="mini-btn edit" onClick={() => onEditLoad(r)} aria-label="수정">
                    수정
                  </button>
                  <button className="mini-btn del" onClick={() => onDelete(r.id)} aria-label="삭제">
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 하단 여백 */}
      <div style={{ height: 40 }} />

      {/* 커스텀 달력 모달 */}
      {calOpen && (
        <div className="cal-overlay" onClick={closeCalendar}>
          <div className="cal" onClick={(e) => e.stopPropagation()}>
            <div className="cal-header">
              <button className="nav prev" onClick={prevMonth} aria-label="이전 달">
                ‹
              </button>
              <div className="ym">
                {calYear}.{pad2(calMonth + 1)}
              </div>
              <button className="nav next" onClick={nextMonth} aria-label="다음 달">
                ›
              </button>
            </div>
            <div className="cal-grid">
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                <div key={d} className="wd">
                  {d}
                </div>
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
              <button className="pill close" onClick={closeCalendar}>
                닫기
              </button>
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

      {/* 연간 요약 모달 */}
      {yearOpen && (
        <div className="year-overlay" onClick={() => setYearOpen(false)}>
          <div className="year-modal" onClick={(e) => e.stopPropagation()}>
            {/* ☑️ 헤더: '연간 요약'(흰색) / 연도 드롭다운(상단, 가로 축소) / X 정렬 */}
            <div className="year-head trio">
              <div className="title white">연간 요약</div>
              <select
                className="year-select year-select-small"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="연도 선택"
                title="연도"
              >
                {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(
                  (y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  )
                )}
              </select>
              <button className="x" onClick={() => setYearOpen(false)} aria-label="닫기">
                ✕
              </button>
            </div>

            {/* (기존 연도 레이블/컨트롤 영역 제거됨) */}

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
                monthlyAgg.map((m) => (
                  <div className="y-row" key={m.m}>
                    <div>{m.m}월</div>
                    <div className="pos">{comma(m.income)}원</div>
                    <div className="neg">{comma(m.expense)}원</div>
                    <div className={`diff ${m.diff >= 0 ? "pos" : "neg"}`}>
                      {comma(m.diff)}원
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="year-foot">
              <button className="pill close" onClick={() => setYearOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
