// src/pages/MoveoutForm.mobile.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";
import { format } from "date-fns";
import { db, storage } from "../firebase";
import {
  addDoc, collection, doc, getDoc, serverTimestamp, updateDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import "./MoveoutForm.mobile.css";

/* ===== 유틸 ===== */
const onlyDigits = (s) => String(s ?? "").replace(/[^\d]/g, "");
const toNum = (v) => (v === "" || v == null) ? 0 : (Number(onlyDigits(v)) || 0);
const addCommas = (n) => {
  const s = onlyDigits(n);
  if (!s) return "";
  return Number(s).toLocaleString();
};

/* 전화번호: 010-1234-5678 */
const formatPhone = (v) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0,3)}-${d.slice(3)}`;
  return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
};

const useQuery = () => new URLSearchParams(useLocation().search);

/* 진행현황 색상 */
const statusDot = (st) => {
  if (st === "정산완료") return "#10b981";
  if (st === "입금대기") return "#dc2626";
  return "#94a3b8"; // 정산대기
};

export default function MoveoutFormMobile() {
  const q = useQuery();
  const id = q.get("id"); // 있으면 수정모드
  const navigate = useNavigate();

  /* ===== 상태 ===== */
  const [moveDate, setMoveDate] = useState(null);
  const [moveDateOpen, setMoveDateOpen] = useState(false); // ▼ 펼침 제어

  const [villaName, setVillaName] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [phone, setPhone] = useState("");

  // 금액(쉼표 문자열 상태 유지)
  const [arrears, setArrears] = useState("");
  const [currentMonth, setCurrentMonth] = useState("");
  const [electricity, setElectricity] = useState("");
  const [tvFee, setTvFee] = useState("");
  const [cleaningFee, setCleaningFee] = useState("");

  // 지침/수도
  const [currentReading, setCurrentReading] = useState("");
  const [previousReading, setPreviousReading] = useState("");
  const [waterUnit, setWaterUnit] = useState("");

  // 진행현황(커스텀 드롭다운)
  const [status, setStatus] = useState("정산대기");
  const [statusOpen, setStatusOpen] = useState(false);
  const statusBtnRef = useRef(null);
  const [statusMenuPos, setStatusMenuPos] = useState({ top: 0, left: 0, width: 0 });

  // 자동 계산 수도요금
  const waterFeeAuto = useMemo(() => {
    const used = Math.max(0, toNum(currentReading) - toNum(previousReading));
    return used * toNum(waterUnit);
  }, [currentReading, previousReading, waterUnit]);

  // 추가내역
  const [extras, setExtras] = useState([]); // {desc, amount:number}
  const [xDesc, setXDesc] = useState("");
  const [xAmount, setXAmount] = useState("");
  const [editIndex, setEditIndex] = useState(null);

  // 비고
  const [note, setNote] = useState("");
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  // 사진
  const [photos, setPhotos] = useState([]); // 최신이 앞
  const [photoIdx, setPhotoIdx] = useState(0);

  // 저장 중
  const [saving, setSaving] = useState(false);

  /* ===== refs (Enter 이동 순서 관리) ===== */
  const refVilla = useRef(null);
  const refUnit = useRef(null);
  const refArrears = useRef(null);
  const refCurrentMonth = useRef(null);
  const refCurrentReading = useRef(null);
  const refElectricity = useRef(null);
  const refTvFee = useRef(null);
  const refCleaningFee = useRef(null);
  const refXDesc = useRef(null);
  const refXAmount = useRef(null);

  /* ===== 수정 모드 로딩 (PC 스키마 → 폼 매핑) ===== */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!id) return;
      const snap = await getDoc(doc(db, "moveouts", id));
      if (!snap.exists() || !alive) return;
      const d = snap.data();

      setMoveDate(d.moveDate ? new Date(d.moveDate) : null);
      setVillaName(d.villaName || "");
      setUnitNumber(d.unitNumber || "");
      setPhone(formatPhone(d.payerPhone || d.phone || ""));

      setArrears(addCommas(d.arrears));
      setCurrentMonth(addCommas(d.currentMonth));
      setElectricity(addCommas(d.electricity));
      setTvFee(addCommas(d.tvFee));
      setCleaningFee(addCommas(d.cleaningFee));

      setCurrentReading(onlyDigits(d.currentReading));
      setPreviousReading(onlyDigits(d.previousReading));
      setWaterUnit(addCommas(d.unitPrice));

      setStatus(d.status || "정산대기");

      const ex = Array.isArray(d.extras)
        ? d.extras.map((x) => ({ desc: x.desc, amount: Number(x.amount) || 0 }))
        : (d.extraItems && d.extraAmount
            ? [{ desc: d.extraItems, amount: Number(d.extraAmount) || 0 }]
            : []);
      setExtras(ex);

      setNote(d.note || "");

      const ph = Array.isArray(d.photos) ? d.photos.filter(Boolean) : [];
      setPhotos(ph);
      setPhotoIdx(0);
    })();
    return () => { alive = false; };
  }, [id]);

  /* ===== 합계 ===== */
  const extrasSum = useMemo(
    () => extras.reduce((a, x) => a + (Number(x.amount) || 0), 0),
    [extras]
  );
  const totalAmount = useMemo(
    () =>
      toNum(arrears) +
      toNum(currentMonth) +
      toNum(electricity) +
      waterFeeAuto +
      toNum(tvFee) +
      toNum(cleaningFee) +
      extrasSum,
    [arrears, currentMonth, electricity, waterFeeAuto, tvFee, cleaningFee, extrasSum]
  );

  /* ===== 연락처 Enter → 달력 펼치기 ===== */
  const onPhoneKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setMoveDateOpen(true);
    }
  };

  /* ===== Enter 이동 헬퍼 ===== */
  const focusNext = (ref) =>
    ref?.current && typeof ref.current.focus === "function" && ref.current.focus();

  /* ===== 사진 업로드/뷰어 ===== */
  const handleImageChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const uploaded = [];
    for (const f of files) {
      const storageRef = ref(storage, `moveout_photos/${uuidv4()}_${f.name}`);
      await uploadBytes(storageRef, f);
      const url = await getDownloadURL(storageRef);
      uploaded.unshift(url);
    }
    const newList = [...uploaded, ...photos];
    setPhotos(newList);
    setPhotoIdx(0);
  };
  const deleteCurrentPhoto = () => {
    if (!photos.length) return;
    const idx = photoIdx;
    const arr = photos.filter((_, i) => i !== idx);
    setPhotos(arr);
    setPhotoIdx(arr.length ? Math.min(idx, arr.length - 1) : 0);
  };
  const prevPhoto = () => photos.length && setPhotoIdx((p) => (p - 1 + photos.length) % photos.length);
  const nextPhoto = () => photos.length && setPhotoIdx((p) => (p + 1) % photos.length);

  /* ===== 추가내역: 엔터로 추가/수정 ===== */
  const resetExtraInputs = () => { setXDesc(""); setXAmount(""); setEditIndex(null); };
  const commitExtra = () => {
    const d = String(xDesc || "").trim();
    const a = toNum(xAmount);
    if (!d || !a) return false;
    if (editIndex == null) setExtras((arr) => [...arr, { desc: d, amount: a }]);
    else setExtras((arr) => arr.map((it, i) => (i === editIndex ? { desc: d, amount: a } : it)));
    return true;
  };
  const onEnterXDesc = (e) => { if (e.key === "Enter") { e.preventDefault(); focusNext(refXAmount); } };
  const onEnterXAmount = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const ok = commitExtra();
    if (ok) { resetExtraInputs(); setTimeout(() => focusNext(refXDesc), 0); }
  };
  const onEditExtra = (idx) => {
    const item = extras[idx];
    setEditIndex(idx);
    setXDesc(item.desc);
    setXAmount(addCommas(item.amount));
    setTimeout(() => focusNext(refXDesc), 0);
  };
  const onDeleteExtra = (idx) => {
    setExtras((arr) => arr.filter((_, i) => i !== idx));
    if (editIndex === idx) resetExtraInputs();
  };

  /* ===== 진행현황 드롭다운: 위치/외부클릭 ===== */
  const openStatusMenu = () => {
    const el = statusBtnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setStatusMenuPos({
      top: Math.round(r.bottom + window.scrollY + 6),
      left: Math.round(r.left + window.scrollX),
      width: Math.round(r.width),
    });
    setStatusOpen(true);
  };
  useEffect(() => {
    if (!statusOpen) return;
    const onClick = (e) => {
      if (!statusBtnRef.current) return;
      if (!statusBtnRef.current.contains(e.target)) {
        setStatusOpen(false);
      }
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [statusOpen]);

  /* ===== 저장 (PC 스키마로 저장) ===== */
  const onSave = async () => {
    if (!moveDate) return alert("이사날짜를 선택하세요.");
    if (!villaName.trim()) return alert("빌라명을 입력하세요.");
    if (!unitNumber.trim()) return alert("호수를 입력하세요.");

    const payload = {
      moveDate: format(moveDate, "yyyy-MM-dd"),
      villaName: villaName.trim(),
      unitNumber: unitNumber.trim(),

      payerPhone: phone.trim(),
      phone: phone.trim(),

      arrears: toNum(arrears),
      currentMonth: toNum(currentMonth),

      currentReading: onlyDigits(currentReading),
      previousReading: onlyDigits(previousReading),
      unitPrice: toNum(waterUnit),
      waterFee: waterFeeAuto,

      electricity: toNum(electricity),
      tvFee: toNum(tvFee),
      cleaningFee: toNum(cleaningFee),

      extras: extras.map((x) => ({ desc: x.desc, amount: Number(x.amount) || 0 })),
      note,
      photos,
      totalAmount,
      status,

      ...(id ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    };

    try {
      setSaving(true);
      if (id) await updateDoc(doc(db, "moveouts", id), payload);
      else     await addDoc(collection(db, "moveouts"), payload);
      alert("저장되었습니다.");
      navigate(-1);
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mf-page">
      {/* 상단 고정 헤더 */}
      <div className="mf-topbar">
        <button className="mf-back" onClick={() => navigate(-1)} aria-label="돌아가기">
          <svg className="ico" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="label">돌아가기</span>
        </button>

        {/* 절대 중앙 타이틀 */}
        <div className="mf-title">{id ? "이사정산 수정" : "이사정산 등록"}</div>

        <button className="mf-save mf-save--lg" onClick={onSave} disabled={saving}>
          {saving ? "저장중…" : "저장"}
        </button>
      </div>

      {/* 본문 */}
      <div className="mf-body">
        {/* 연락처 */}
        <div className="mf-field">
          <label>연락처</label>
          <input
            className="mf-input"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            onKeyDown={onPhoneKeyDown}
            inputMode="tel"
          />
        </div>

        {/* 이사날짜 (펼침형 인라인 달력) */}
        <div className="mf-field">
          <label>이사날짜</label>

          {/* 인풋처럼 보이는 컨트롤 (중복 문구 제거: 한 줄만 표시) */}
          <button
            type="button"
            className={`mf-date-control ${moveDate ? "has-value" : "is-placeholder"}`}
            onClick={() => setMoveDateOpen((v) => !v)}
            aria-expanded={moveDateOpen}
            aria-controls="move-date-calendar"
          >
            <div className="date-main">
              {moveDate ? format(moveDate, "yyyy-MM-dd") : "날짜 선택"}
            </div>
            <span className="chev" aria-hidden>▾</span>
          </button>

          {/* 펼쳐지는 인라인 달력 */}
          {moveDateOpen && (
            <div id="move-date-calendar" className="mf-calendar" role="dialog" aria-label="달력">
              <DatePicker
                selected={moveDate}
                onChange={(d) => { setMoveDate(d); setMoveDateOpen(false); }}
                inline
                locale={ko}
                monthsShown={1}
                renderCustomHeader={({
                  date, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled
                }) => (
                  <div className="cal-header">
                    <button
                      type="button"
                      onClick={decreaseMonth}
                      disabled={prevMonthButtonDisabled}
                      className="nav-btn"
                      aria-label="이전 달"
                    >‹</button>
                    <div className="cal-title">
                      {format(date, "yyyy년 MM월")}
                    </div>
                    <button
                      type="button"
                      onClick={increaseMonth}
                      disabled={nextMonthButtonDisabled}
                      className="nav-btn"
                      aria-label="다음 달"
                    >›</button>
                  </div>
                )}
                dayClassName={(d) => {
                  const isToday = format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                  return isToday ? "is-today" : undefined;
                }}
              />
            </div>
          )}
        </div>

        {/* 1: 빌라명 · 호수 */}
        <div className="mf-grid2">
          <div className="mf-field">
            <label>빌라명</label>
            <input
              ref={refVilla}
              className="mf-input"
              value={villaName}
              onChange={(e) => setVillaName(e.target.value)}
              onKeyDown={(e)=>{ if(e.key==="Enter"){ e.preventDefault(); focusNext(refUnit); } }}
              lang="ko"
            />
          </div>
          <div className="mf-field">
            <label>호수</label>
            <input
              ref={refUnit}
              className="mf-input"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              onKeyDown={(e)=>{ if(e.key==="Enter"){ e.preventDefault(); focusNext(refArrears); } }}
            />
          </div>
        </div>

        {/* 2: 미납관리비 · 당월관리비 */}
        <div className="mf-grid2">
          <div className="mf-field">
            <label>미납관리비</label>
            <input
              ref={refArrears}
              className="mf-input"
              value={arrears}
              onChange={(e)=>setArrears(addCommas(e.target.value))}
              inputMode="numeric"
              onKeyDown={(e)=>{ if(e.key==="Enter"){ e.preventDefault(); focusNext(refCurrentMonth); } }}
            />
          </div>
          <div className="mf-field">
            <label>당월관리비</label>
            <input
              ref={refCurrentMonth}
              className="mf-input"
              value={currentMonth}
              onChange={(e)=>setCurrentMonth(addCommas(e.target.value))}
              inputMode="numeric"
              onKeyDown={(e)=>{ if(e.key==="Enter"){ e.preventDefault(); focusNext(refCurrentReading); } }}
            />
          </div>
        </div>

        {/* 3: 당월지침 · 전월지침 */}
        <div className="mf-grid2">
          <div className="mf-field">
            <label>당월지침</label>
            <input
              ref={refCurrentReading}
              className="mf-input"
              value={currentReading}
              onChange={(e)=>setCurrentReading(onlyDigits(e.target.value))}
              inputMode="numeric"
              onKeyDown={(e)=>{ if(e.key==="Enter"){ e.preventDefault(); focusNext(refElectricity); } }}
            />
          </div>
          <div className="mf-field">
            <label>전월지침</label>
            <input
              className="mf-input"
              value={previousReading}
              onChange={(e)=>setPreviousReading(onlyDigits(e.target.value))}
              inputMode="numeric"
            />
          </div>
        </div>

        {/* 4: 수도요금(자동) · 수도단가 */}
        <div className="mf-grid2">
          <div className="mf-field">
            <label>수도요금</label>
            <input
              className="mf-input mf-readonly"
              value={waterFeeAuto ? waterFeeAuto.toLocaleString() : ""}
              readOnly
              tabIndex={-1}
            />
          </div>
          <div className="mf-field">
            <label>수도단가</label>
            <input
              className="mf-input"
              value={waterUnit}
              onChange={(e)=>setWaterUnit(addCommas(e.target.value))}
              inputMode="numeric"
            />
          </div>
        </div>

        {/* 5: 전기요금 · TV수신료 */}
        <div className="mf-grid2">
          <div className="mf-field">
            <label>전기요금</label>
            <input
              ref={refElectricity}
              className="mf-input"
              value={electricity}
              onChange={(e)=>setElectricity(addCommas(e.target.value))}
              inputMode="numeric"
              onKeyDown={(e)=>{ if(e.key==="Enter"){ e.preventDefault(); focusNext(refTvFee); } }}
            />
          </div>
          <div className="mf-field">
            <label>TV수신료</label>
            <input
              ref={refTvFee}
              className="mf-input"
              value={tvFee}
              onChange={(e)=>setTvFee(addCommas(e.target.value))}
              inputMode="numeric"
              onKeyDown={(e)=>{ if(e.key==="Enter"){ e.preventDefault(); focusNext(refCleaningFee); } }}
            />
          </div>
        </div>

        {/* 6: 청소비용 · 정산진행현황(드롭다운) */}
        <div className="mf-grid2">
          <div className="mf-field">
            <label>청소비용</label>
            <input
              ref={refCleaningFee}
              className="mf-input"
              value={cleaningFee}
              onChange={(e)=>setCleaningFee(addCommas(e.target.value))}
              inputMode="numeric"
              onKeyDown={(e)=>{ if(e.key==="Enter"){ e.preventDefault(); focusNext(refXDesc); } }}
            />
          </div>

          {/* 진행현황 드롭다운 */}
          <div className="mf-field">
            <label>정산진행현황</label>
            <div
              className={`statusbox ${statusOpen ? "open" : ""}`}
              ref={statusBtnRef}
            >
              <button
                type="button"
                className="status-trigger"
                onClick={openStatusMenu}
              >
                <span className="dot" style={{ background: statusDot(status) }} />
                <span className="label">{status}</span>
                <span className="caret" />
              </button>

              {statusOpen && (
                <div
                  className="status-menu fixed"
                  style={{
                    top: statusMenuPos.top,
                    left: statusMenuPos.left,
                    minWidth: Math.max(180, statusMenuPos.width),
                    position: "fixed",
                  }}
                >
                  {[
                    { v: "정산대기", color: statusDot("정산대기") },
                    { v: "입금대기", color: statusDot("입금대기") },
                    { v: "정산완료", color: statusDot("정산완료") },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      className={`status-item ${status === opt.v ? "selected" : ""}`}
                      onClick={() => { setStatus(opt.v); setStatusOpen(false); }}
                    >
                      <span className="dot" style={{ background: opt.color }} />
                      <span className="txt">{opt.v}</span>
                      {status === opt.v && <span className="check">✔</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 추가내역 */}
        <div className="mf-section">
          <div className="mf-grid2">
            <div className="mf-field">
              <label>추가내역</label>
              <input
                ref={refXDesc}
                className="mf-input"
                value={xDesc}
                onChange={(e)=>setXDesc(e.target.value)}
                onKeyDown={onEnterXDesc}
                lang="ko"
              />
            </div>
            <div className="mf-field">
              <label>추가금액</label>
              <input
                ref={refXAmount}
                className="mf-input"
                value={xAmount}
                onChange={(e)=>setXAmount(addCommas(e.target.value))}
                onKeyDown={onEnterXAmount}
                inputMode="numeric"
              />
            </div>
          </div>

          {extras.length > 0 && (
            <div className="mf-extras">
              {extras.map((x, i) => (
                <div className="x" key={i}>
                  <div className="d">{x.desc}</div>
                  <div className="a">{(Number(x.amount)||0).toLocaleString()}원</div>
                  <div className="actions">
                    <button className="edit" onClick={()=>onEditExtra(i)}>수정</button>
                    <button className="r" onClick={()=>onDeleteExtra(i)}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 사진첨부 / 비고 */}
        <div className="mf-actions">
          <label className="mf-action mf-action--primary">
            <input type="file" accept="image/*" hidden multiple onChange={handleImageChange} />
            <svg className="ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h3l2-2h6l2 2h3v12H4V7z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
              <circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
            <span>사진첨부</span>
          </label>

          <button className="mf-action mf-action--note" type="button" onClick={()=>{ setNoteDraft(note); setNoteModalOpen(true); }}>
            <svg className="ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 4h12v14l-4-3H6z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
            <span>{note && note.trim() ? "내용있음" : "내용없음"}</span>
          </button>
        </div>

        {/* 사진 뷰어 */}
        {photos.length > 0 && (
          <div className="mf-photo-viewer">
            <div className="viewer">
              <img src={photos[photoIdx]} alt="사진" className="viewer-img" />
              {photos.length > 1 && (
                <>
                  <button type="button" className="nav left" onClick={prevPhoto} aria-label="이전">‹</button>
                  <button type="button" className="nav right" onClick={nextPhoto} aria-label="다음">›</button>
                </>
              )}
            </div>
            <div className="viewer-bar">
              <span className="pager">{photoIdx + 1} / {photos.length}</span>
              <button type="button" className="del" onClick={deleteCurrentPhoto}>현재 사진 삭제</button>
            </div>
          </div>
        )}

        {/* 하단 고정바에 가리지 않도록 여백 */}
        <div style={{ height: 120 }} />
      </div>

      {/* 하단 고정 총액 바 */}
      <div className="mf-total-bar" role="region" aria-label="총 이사정산금액">
        <div className="wrap">
          <span className="label">총 이사정산금액</span>
          <span className="amt">{totalAmount.toLocaleString()}원</span>
        </div>
      </div>

      {/* 비고 모달 */}
      {noteModalOpen && (
        <div className="overlay center" onClick={()=>setNoteModalOpen(false)}>
          <div className="modal" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header">
              <b>비고</b>
            </div>
            <div className="mf-field">
              <textarea
                className="mf-textarea" rows={8}
                value={noteDraft} onChange={(e)=>setNoteDraft(e.target.value)} lang="ko"
              />
            </div>
            <div className="modal-actions">
              <button className="pill-btn" onClick={()=>{ setNote(noteDraft); setNoteModalOpen(false); }}>저장</button>
              <button className="pill-btn light" onClick={()=>setNoteModalOpen(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
