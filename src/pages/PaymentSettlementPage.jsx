// src/pages/PaymentSettlementPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./PaymentSettlementPage.css";

/* ⬇︎ 추가: 코드별 빌라(villas)에서 거래처명 자동 수집 */
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";

/**
 * 대금결제 관리 (v4 - 요청 반영)
 * - 상단 한 줄에: 제목 + 대상월 + 주기(말일/10일) + 검색 + 버튼(결제등록/달표보기/관리) + 예정/미납누계 칩
 * - "전체주기" 옵션 제거 → 주기 드롭다운은 "말일/10일"만
 * - 결제등록 모달: 가로폭 축소, 상단 X 제거, 하단 저장/닫기 버튼 동일 사이즈
 * - 관리 모달: 가로폭 축소, 상단 X 제거, 하단 버튼 동일 사이즈
 * - 달표보기 모달: 가로폭 확대(가로 스크롤 방지), 필터 드롭다운의 "전체구분/전체거래처" 표기 제거
 *   · 우측에 "금액수정" 버튼 → 눌러서 금액컬럼 인라인 입력 → 입력 시 해당 행 1~12월 자동 채우기
 *   · 테이블 컬럼: ... 거래처명, [금액], 1월~12월
 * - 초기 데이터: 결제처 0건(표시 0원), 달표만 샘플 1건
 */

/* ───────────────── 초기 데이터 ───────────────── */
const initialCategoryOptions = [];                // 관리에서 직접 추가(초기엔 비움)
const initialVendorOptionsByCat = {};            // 관리에서 직접 추가(초기엔 비움)

// 결제처: 초기 0건 (요청사항)
const initialVendors = [];

/* ⬇︎ 변경: 달표 샘플 데이터 제거(빈 배열) → 저장/설정 없음이면 아무것도 표시되지 않도록 */
const initialSites = [];

const toCurrency = (n) => (Number(n || 0)).toLocaleString("ko-KR");
const ymKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthIndex = (d) => d.getMonth() + 1;
const monthsBetweenYM = (startY, startM, targetY, targetM) => {
  if (!startY || !startM) return 0;
  return (targetY - startY) * 12 + (targetM - startM) + 1;
};

/* ───────── 외부 클릭 닫기 ───────── */
function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const fn = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      handler?.();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [ref, handler]);
}

/* ───────── 커스텀 MonthPicker (연/월) ───────── */
function MonthPicker({ valueDate, onChange }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(valueDate.getFullYear());
  const ref = useRef(null);
  useOnClickOutside(ref, () => setOpen(false));
  useEffect(() => setYear(valueDate.getFullYear()), [valueDate]);

  const selectMonth = (m) => {
    const d = new Date(year, m - 1, 1);
    onChange?.(d);
    setOpen(false);
  };
  const years = [];
  const base = new Date().getFullYear();
  for (let y = base - 2; y <= base + 2; y++) years.push(y);

  return (
    <div className="mp-wrap" ref={ref}>
      <button className="select like-input with-icon" onClick={() => setOpen((v) => !v)} aria-label="대상월 선택">
        <i className="ri-calendar-event-line"></i>
        <span>{ymKey(valueDate)}</span>
        <i className={`ri-arrow-down-s-line caret ${open ? "open" : ""}`}></i>
      </button>
      {open && (
        <div className="mp-panel">
          <div className="mp-head">
            <i className="ri-sparkling-2-line"></i>
            <select className="select bare" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
          <div className="mp-grid">
            {Array.from({ length: 12 }).map((_, i) => {
              const m = i + 1;
              const isNow = valueDate.getFullYear() === year && valueDate.getMonth() + 1 === m;
              return (
                <button key={m} className={`mp-cell ${isNow ? "now" : ""}`} onClick={() => selectMonth(m)}>
                  {m}월
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── 공통 모달 ───────── */
function Modal({ open, onClose, title, width = 980, children, footer, hideCloseIcon = false }) {
  if (!open) return null;
  return (
    <div className="psp-modal-backdrop" onClick={onClose}>
      <div className="psp-modal glam" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="psp-modal-head">
          <div className="headline">
            <i className="ri-flashlight-line"></i>
            <h3>{title}</h3>
          </div>
          {!hideCloseIcon && (
            <button className="icon-btn" onClick={onClose} aria-label="닫기">
              <i className="ri-close-line" />
            </button>
          )}
        </div>
        <div className="psp-modal-body">{children}</div>
        {footer && <div className="psp-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ───────── 옵션 관리 모달 ───────── */
function ManageOptionsModal({ open, onClose, categories, setCategories, vendorNamesByCat, setVendorNamesByCat }) {
  const [catInput, setCatInput] = useState("");
  const [selectedCat, setSelectedCat] = useState(categories[0] || "");
  const [vendorInput, setVendorInput] = useState("");

  useEffect(() => {
    if (!selectedCat && categories.length) setSelectedCat(categories[0]);
  }, [categories, selectedCat]);

  const addCat = () => {
    const n = catInput.trim();
    if (!n || categories.includes(n)) return;
    setCategories([...categories, n]);
    setVendorNamesByCat({ ...vendorNamesByCat, [n]: vendorNamesByCat[n] || [] });
    setCatInput("");
    if (!selectedCat) setSelectedCat(n);
  };
  const removeCat = (name) => {
    if (!window.confirm(`구분 "${name}"을(를) 삭제할까요? 연결된 거래처명 목록도 함께 제거됩니다.`)) return;
    const { [name]: _, ...rest } = vendorNamesByCat;
    setVendorNamesByCat(rest);
    setCategories(categories.filter((c) => c !== name));
    if (selectedCat === name) setSelectedCat("");
  };

  const addVendor = () => {
    if (!selectedCat) return alert("먼저 구분을 선택하세요.");
    const n = vendorInput.trim();
    if (!n) return;
    const list = vendorNamesByCat[selectedCat] || [];
    if (list.includes(n)) return;
    setVendorNamesByCat({ ...vendorNamesByCat, [selectedCat]: [...list, n] });
    setVendorInput("");
  };
  const removeVendor = (name) => {
    const list = vendorNamesByCat[selectedCat] || [];
    setVendorNamesByCat({ ...vendorNamesByCat, [selectedCat]: list.filter((x) => x !== name) });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="구분 · 거래처명 관리"
      width={760}           /* ⬅ 가로 사이즈 축소 유지 */
      hideCloseIcon         /* ⬅ 상단 X 제거 유지 */
      footer={
        /* ⬇ 좌우로 '저장/닫기' 순서 고정(가로 배치) */
        <div className="foot-actions">
          <button className="btn-eq primary" onClick={onClose}>
            <i className="ri-check-line" /> 저장
          </button>
          <button className="btn-eq ghost" onClick={onClose}>
            <i className="ri-close-circle-line" /> 닫기
          </button>
        </div>
      }
    >
      <div className="mgr-grid">
        {/* 좌: 구분 */}
        <section className="mgr-card">
          <header><i className="ri-shapes-line"></i> 구분</header>
          <div className="row add">
            <input
              className="mgr-input"
              placeholder="구분 추가"
              value={catInput}
              onChange={(e) => setCatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCat()}
            />
            <button className="btn-primary mini" onClick={addCat}><i className="ri-add-line" /> 추가</button>
          </div>
          <ul className="pill-list">
            {categories.map((c) => (
              <li key={c} className={`pill ${selectedCat === c ? "active" : ""}`} onClick={() => setSelectedCat(c)}>
                <span>{c}</span>
                <button className="x" onClick={(e) => { e.stopPropagation(); removeCat(c); }} aria-label="삭제"><i className="ri-close-line" /></button>
              </li>
            ))}
            {!categories.length && <div className="empty">등록된 구분이 없습니다.</div>}
          </ul>
        </section>

        {/* 우: 거래처명 */}
        <section className="mgr-card">
          <header><i className="ri-building-line"></i> 거래처명 {selectedCat ? <em>({selectedCat})</em> : null}</header>
          <div className="row add">
            <input
              className="mgr-input"
              placeholder="거래처명 추가"
              value={vendorInput}
              onChange={(e) => setVendorInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addVendor()}
              disabled={!selectedCat}
            />
            <button className="btn-primary mini" onClick={addVendor} disabled={!selectedCat}><i className="ri-add-line" /> 추가</button>
          </div>
          <ul className="pill-list">
            {(vendorNamesByCat[selectedCat] || []).map((v) => (
              <li key={v} className="pill">
                <span>{v}</span>
                <button className="x" onClick={() => removeVendor(v)} aria-label="삭제"><i className="ri-close-line" /></button>
              </li>
            ))}
            {selectedCat && !(vendorNamesByCat[selectedCat] || []).length && <div className="empty">등록된 거래처명이 없습니다.</div>}
            {!selectedCat && <div className="empty">좌측에서 구분을 선택하세요.</div>}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

/* ───────── 결제등록 모달 ───────── */
function RegisterModal({ open, onClose, onSubmit, categories, vendorNamesByCat }) {
  const [form, setForm] = useState({
    category: "",
    vendorName: "",
    bank: "",
    accountHolder: "",
    accountNo: "",
    amount: "",
    note: "",
    startYear: new Date().getFullYear(),
    startMonth: 1,
    cycle: "말일",
  });

  useEffect(() => {
    setForm((f) => ({ ...f, vendorName: "" }));
  }, [form.category]); // eslint-disable-line

  const years = [];
  const base = new Date().getFullYear();
  for (let y = base - 2; y <= base + 2; y++) years.push(y);

  const submit = () => {
    if (!form.category) return alert("구분을 선택하세요.");
    if (!form.vendorName) return alert("거래처명을 선택하세요.");
    onSubmit?.({
      id: `v_${Date.now()}`,
      category: form.category,
      vendorName: form.vendorName,
      bank: form.bank.trim(),
      accountHolder: form.accountHolder.trim(),
      accountNo: form.accountNo.trim(),
      note: form.note.trim(),
      cycle: form.cycle,
      startYear: Number(form.startYear),
      startMonth: Number(form.startMonth),
      amount: Number(String(form.amount).replace(/[^\d]/g, "")) || 0,
      payments: [],
    });
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="결제등록"
      width={720}              /* ⬅ 가로 사이즈 축소 유지 */
      hideCloseIcon            /* ⬅ 상단 X 제거 유지 */
      footer={
        /* ⬇ 좌우로 '저장/닫기' 순서 고정(가로 배치) */
        <div className="foot-actions">
          <button className="btn-eq primary" onClick={submit}><i className="ri-save-3-line" /> 저장</button>
          <button className="btn-eq ghost" onClick={onClose}><i className="ri-close-circle-line" /> 닫기</button>
        </div>
      }
    >
      <div className="reg-grid">
        <label>
          <span><i className="ri-shapes-line"></i> 구분</span>
          <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value=""></option>  {/* ⬅ 플레이스홀더: 표시 텍스트 없음 */}
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label>
          <span><i className="ri-building-line"></i> 거래처명</span>
          <select
            className="select"
            value={form.vendorName}
            onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
          >
            <option value=""></option> {/* ⬅ 표시 텍스트 없음 */}
            {(vendorNamesByCat[form.category] || []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>

        <label>
          <span><i className="ri-bank-line"></i> 은행</span>
          <input className="input" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
        </label>

        <label>
          <span><i className="ri-user-3-line"></i> 예금주</span>
          <input className="input" value={form.accountHolder} onChange={(e) => setForm({ ...form, accountHolder: e.target.value })} />
        </label>

        <label className="wide">
          <span><i className="ri-hashtag"></i> 계좌번호</span>
          <input className="input" placeholder="예: 356-0000-000000" value={form.accountNo} onChange={(e) => setForm({ ...form, accountNo: e.target.value })} />
        </label>

        <label>
          <span><i className="ri-cash-line"></i> 금액</span>
          <input className="input" inputMode="numeric" placeholder="숫자만" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </label>

        <label>
          <span><i className="ri-sticky-note-line"></i> 비고</span>
          <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>

        <label>
          <span><i className="ri-hourglass-line"></i> 결제시작(연)</span>
          <select className="select" value={form.startYear} onChange={(e) => setForm({ ...form, startYear: e.target.value })}>
            {years.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
        </label>

        <label>
          <span><i className="ri-timer-line"></i> 결제시작(월)</span>
          <select className="select" value={form.startMonth} onChange={(e) => setForm({ ...form, startMonth: e.target.value })}>
            {Array.from({ length: 12 }).map((_, i) => <option key={i+1} value={i+1}>{i+1}월</option>)}
          </select>
        </label>

        <label>
          <span><i className="ri-calendar-2-line"></i> 주기</span>
          <select className="select" value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })}>
            {/* ⬇ 전체주기 제거 → "말일/10일"만 */}
            <option value="말일">말일</option>
            <option value="10일">10일</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}

/* ───────── 달표 보기(필터 + 금액수정) ───────── */
function SitesViewer({ targetDate, sites }) {
  const [cat, setCat] = useState("");
  const [vendor, setVendor] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [rows, setRows] = useState(() =>
    sites.map((s) => ({ ...s, baseAmount: s.months?.[1] || 0 })) // 금액 컬럼(대표 금액) 기본값
  );
  const m = monthIndex(targetDate);

  const cats = Array.from(new Set(rows.map((s) => s.category)));
  const vendors = Array.from(new Set(rows.filter((s) => !cat || s.category === cat).map((s) => s.vendorName)));
  const list = rows.filter((s) => (!cat || s.category === cat) && (!vendor || s.vendorName === vendor));

  const setRowAmount = (id, val) => {
    const num = Number(String(val).replace(/[^\d]/g, "")) || 0;
    setRows((arr) =>
      arr.map((r) => {
        if (r.id !== id) return r;
        const newMonths = {};
        for (let i = 1; i <= 12; i++) newMonths[i] = num;
        return { ...r, baseAmount: num, months: newMonths };
      })
    );
  };

  return (
    <div className="sites-viewer">
      <div className="sites-controls">
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value=""></option> {/* ⬅ '전체구분' 텍스트 제거 */}
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value=""></option> {/* ⬅ '전체거래처' 텍스트 제거 */}
          {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <button className="btn tiny" onClick={() => setEditMode((v) => !v)}>
          <i className="ri-edit-2-line"></i> 금액수정
        </button>
      </div>

      <div className="table-scroll">
        {/* ⬇ 가로 스크롤 방지: 넓은 폭 + 줄바꿈 금지(nowrap) */}
        <table className="table light sticky-first nowrap">
          <thead>
            <tr>
              <th>현장(빌라)</th>
              <th>구분</th>
              <th>거래처명</th>
              <th className="ar">금액</th>
              {Array.from({ length: 12 }).map((_, i) => (
                <th key={i + 1} className="ar">{i + 1}월</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td className="em">{s.villa}</td>
                <td>{s.category}</td>
                <td>{s.vendorName}</td>
                <td className="ar">
                  {editMode ? (
                    <input
                      className="input input-mini ar"
                      inputMode="numeric"
                      value={s.baseAmount || ""}
                      onChange={(e) => setRowAmount(s.id, e.target.value)}
                      placeholder="0"
                    />
                  ) : (
                    s.baseAmount ? `₩${toCurrency(s.baseAmount)}` : "-"
                  )}
                </td>
                {Array.from({ length: 12 }).map((_, i) => {
                  const mm = i + 1;
                  const val = s.months?.[mm] || 0;
                  return (
                    <td key={mm} className={`ar ${mm === m ? "highlight-lite" : ""}`}>
                      {val ? `₩${toCurrency(val)}` : "-"}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={16} className="empty">표시할 데이터가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────── 메인 페이지 ───────── */
export default function PaymentSettlementPage() {
  const [targetDate, setTargetDate] = useState(() => new Date());
  const [cycleFilter, setCycleFilter] = useState("말일"); // ⬅ 기본 '말일'
  const [search, setSearch] = useState("");

  const [vendors, setVendors] = useState(initialVendors);

  /* ⬇ 구분/거래처명: villas에서 자동 수집 */
  const [categories, setCategories] = useState(initialCategoryOptions);
  const [vendorNamesByCat, setVendorNamesByCat] = useState(initialVendorOptionsByCat);

  const [openRegister, setOpenRegister] = useState(false);
  const [openManage, setOpenManage] = useState(false);
  const [openSites, setOpenSites] = useState(false);

  /* ⬇ 테스트 공지 배너(5초) */
  const [showTestBanner, setShowTestBanner] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowTestBanner(false), 5000);
    return () => clearTimeout(t);
  }, []);

  /* ⬇ 진입 시 '승강기/소방안전/전기안전/건물청소' 고정 세팅 + villas 로부터 거래처명 자동 로드 */
  useEffect(() => {
    const DEFAULT_CATS = ["승강기", "소방안전", "전기안전", "건물청소"];
    setCategories(DEFAULT_CATS);

    const unsub = onSnapshot(collection(db, "villas"), (snap) => {
      const acc = {
        승강기: [],
        소방안전: [],
        전기안전: [],
        건물청소: [],
      };

      const pushIf = (cat, val) => {
        const s = String(val ?? "").trim();
        if (s) acc[cat].push(s);
      };

      snap.docs.forEach((doc) => {
        const v = doc.data() || {};
        /* 가능한 필드명들을 폭넓게 커버 */
        pushIf("승강기", v.elevator ?? v.elevatorVendor ?? v.elevatorCompany);
        pushIf("소방안전", v.fireSafety ?? v.fireSafetyVendor ?? v.fireSafetyCompany);
        pushIf("전기안전", v.electricSafety ?? v.electricSafetyVendor ?? v.electricSafetyCompany);
        pushIf("건물청소", v.cleaning ?? v.buildingCleaning ?? v.cleaningVendor ?? v.cleaningCompany);
      });

      const uniqSorted = Object.fromEntries(
        Object.entries(acc).map(([k, arr]) => [k, Array.from(new Set(arr)).sort()])
      );
      setVendorNamesByCat(uniqSorted);
    });

    return () => unsub();
  }, []);

  const targetYM = ymKey(targetDate);
  const targetM = monthIndex(targetDate);
  const targetY = targetDate.getFullYear();

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors
      .filter((v) => v.cycle === cycleFilter) // ⬅ 주기 필터(말일/10일만)
      .filter((v) => {
        if (!q) return true;
        const hay = `${v.category} ${v.vendorName} ${v.bank} ${v.accountHolder} ${v.accountNo} ${v.note}`.toLowerCase();
        return hay.includes(q);
      })
      .map((v) => {
        const months = monthsBetweenYM(v.startYear, v.startMonth, targetY, targetM);
        const base = Number(v.amount || 0);
        const paidSum = (v.payments || []).filter((p) => p.ym <= targetYM).reduce((a, b) => a + Number(b.amount || 0), 0);
        const should = Math.max(months, 0) * base;
        const unpaidAcc = Math.max(should - paidSum, 0);
        return { ...v, unpaidAcc };
      });
  }, [vendors, cycleFilter, search, targetM, targetY, targetYM]);

  const totals = useMemo(() => ({
    planned: filteredRows.reduce((a, r) => a + Number(r.amount || 0), 0),
    unpaidAcc: filteredRows.reduce((a, r) => a + Number(r.unpaidAcc || 0), 0),
  }), [filteredRows]);

  const addVendor = (item) => {
    setVendors((arr) => [item, ...arr]);
    // TODO: Firestore add
  };

  return (
    <div className="psp wrap light">
      {/* ⬇ 테스트 배너(5초 노출, 하이라이트) */}
      {showTestBanner && (
        <div className="psp-banner warn">
          <i className="ri-alert-line"></i>
          현재 테스트 중이라 이용이 제한됩니다.
        </div>
      )}

      {/* 상단 한 줄 레이아웃 */}
      <header className="psp-hero single-line">
        <div className="title">
          <i className="ri-bank-card-2-line"></i>
          <h1>대금결제 관리</h1>
        </div>

        <div className="hero-controls">
          <MonthPicker valueDate={targetDate} onChange={setTargetDate} />

          {/* ⬇ 전체주기 제거 */}
          <select className="select with-icon" value={cycleFilter} onChange={(e) => setCycleFilter(e.target.value)}>
            <option value="말일">말일</option>
            <option value="10일">10일</option>
          </select>

          <div className="search-wrap">
            <i className="ri-search-line"></i>
            <input
              className="search"
              placeholder="검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button className="btn glam" onClick={() => setOpenRegister(true)}>
            <i className="ri-add-circle-line"></i> 결제등록
          </button>
          <button className="btn pale" onClick={() => setOpenSites(true)}>
            <i className="ri-table-2"></i> 달표보기
          </button>
          <button className="btn ghost" onClick={() => setOpenManage(true)}>
            <i className="ri-settings-5-line"></i> 관리
          </button>

          {/* ⬇ 동일 라인 우측에 예정/미납 칩 표시 */}
          <div className="metrics inline">
            <div className="chip">
              <i className="ri-bill-line"></i> 예정 ₩{toCurrency(totals.planned)}
            </div>
            <div className="chip warn">
              <i className="ri-alarm-warning-line"></i> 미납누계 ₩{toCurrency(totals.unpaidAcc)}
            </div>
          </div>
        </div>
      </header>

      {/* 리스트 */}
      <section className="card light psp-list">
        <div className="table-scroll">
          <table className="table light">
            <thead>
              <tr>
                <th>구분</th>
                <th>거래처명</th>
                <th>은행</th>
                <th>예금주</th>
                <th>계좌번호</th>
                <th className="ar">금액</th>
                <th>비고</th>
                <th className="ar">미납누계</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.category}</td>
                  <td className="em">{r.vendorName}</td>
                  <td>{r.bank}</td>
                  <td>{r.accountHolder}</td>
                  <td className="mono">{r.accountNo}</td>
                  <td className="ar strong">₩{toCurrency(r.amount)}</td>
                  <td className="muted">{r.note}</td>
                  <td className="ar danger">₩{toCurrency(r.unpaidAcc)}</td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 모달들 */}
      <RegisterModal
        open={openRegister}
        onClose={() => setOpenRegister(false)}
        onSubmit={addVendor}
        categories={categories}
        vendorNamesByCat={vendorNamesByCat}
      />

      <ManageOptionsModal
        open={openManage}
        onClose={() => setOpenManage(false)}
        categories={categories}
        setCategories={setCategories}
        vendorNamesByCat={vendorNamesByCat}
        setVendorNamesByCat={setVendorNamesByCat}
      />

      <Modal
        open={openSites}
        onClose={() => setOpenSites(false)}
        title="달표보기"
        width={1800}            /* ⬅ 가로 사이즈 크게 확장: 가로 스크롤 방지 */
        footer={
          <div className="foot-actions">
            <button className="btn-eq ghost" onClick={() => setOpenSites(false)}>
              <i className="ri-close-circle-line" /> 닫기
            </button>
          </div>
        }
      >
        <SitesViewer targetDate={targetDate} sites={initialSites} />
      </Modal>
    </div>
  );
}
