import React, { useEffect, useMemo, useRef, useState } from "react";
import "./PaymentSettlementPage.css";

import { db } from "../firebase";
import {
  collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp
} from "firebase/firestore";

/* ───────────────── 유틸 ───────────────── */
const toCurrency = (n) => (Number(n || 0)).toLocaleString("ko-KR");
const ymKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthIndex = (d) => d.getMonth() + 1;
const monthsBetweenYM = (startY, startM, targetY, targetM) => {
  if (!startY || !startM) return 0;
  return (targetY - startY) * 12 + (targetM - startM) + 1;
};
const s = (v) => String(v ?? "").trim();

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
      {/* ▼ 표시 텍스트 가운데 정렬, 화살표 없음, 폭 살짝 축소 */}
      <button
        className="select like-input month-trigger slim with-iconless center-text"
        onClick={() => setOpen(v=>!v)}
        aria-label="대상월 선택"
      >
        <i className="ri-calendar-event-line"></i>
        <span className="ym-label">{ymKey(valueDate)}</span>
      </button>
      {open && (
        <div className="mp-panel">
          <div className="mp-head">
            <i className="ri-sparkling-2-line"></i>
            <select className="select bare" value={year} onChange={(e)=>setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
          </div>
          <div className="mp-grid">
            {Array.from({ length: 12 }).map((_, i) => {
              const m = i + 1;
              const isNow = valueDate.getFullYear() === year && valueDate.getMonth() + 1 === m;
              return (
                <button key={m} className={`mp-cell ${isNow ? "now" : ""}`} onClick={()=>selectMonth(m)}>{m}월</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── 공통 모달 ─────────
   - 요청 반영: fixedWidth 적용을 위해 style.width 지정 가능하도록 확장
   - 요청 반영: showIcon(번개 아이콘 표시 여부), headCompact(헤더 세로 여백 축소) 지원
*/
function Modal({
  open, onClose, title, width = 980, children, footer,
  hideCloseIcon = false, headerExtra = null,
  showIcon = true, headCompact = false
}) {
  if (!open) return null;
  return (
    <div className="psp-modal-backdrop" onClick={onClose}>
      <div
        className={`psp-modal glam ${headCompact ? "head-compact" : ""}`}
        style={{ maxWidth: width, width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="psp-modal-head">
          <div className="headline">
            {showIcon ? <i className="ri-flashlight-line"></i> : null}
            <h3>{title}</h3>
          </div>
          <div className="head-extra">{headerExtra}</div>
          {!hideCloseIcon && (
            <button className="icon-btn" onClick={onClose} aria-label="닫기">
              <i className="ri-close-line" />
            </button>
          )}
        </div>
        <div className="psp-modal-body">{children}</div>
        {footer && <div className="psp-modal-foot sticky-foot">{footer}</div>}
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
    const n = s(catInput);
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
    const n = s(vendorInput);
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
      width={760}
      hideCloseIcon
      footer={
        <div className="foot-actions">
          <button className="btn-eq primary" onClick={onClose}><i className="ri-check-line" /> 저장</button>
          <button className="btn-eq ghost" onClick={onClose}><i className="ri-close-circle-line" /> 닫기</button>
        </div>
      }
    >
      <div className="mgr-grid">
        <section className="mgr-card">
          <header><i className="ri-shapes-line"></i> 구분</header>
          <div className="row add">
            <input className="mgr-input" placeholder="구분 추가" value={catInput}
              onChange={(e)=>setCatInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&addCat()} />
            <button className="btn-primary mini" onClick={addCat}><i className="ri-add-line" /> 추가</button>
          </div>
          <ul className="pill-list">
            {categories.map((c) => (
              <li key={c} className={`pill ${selectedCat === c ? "active" : ""}`} onClick={()=>setSelectedCat(c)}>
                <span>{c}</span>
                <button className="x" onClick={(e)=>{e.stopPropagation(); removeCat(c);}} aria-label="삭제"><i className="ri-close-line" /></button>
              </li>
            ))}
            {!categories.length && <div className="empty">등록된 구분이 없습니다.</div>}
          </ul>
        </section>

        <section className="mgr-card">
          <header><i className="ri-building-line"></i> 거래처명 {selectedCat ? <em>({selectedCat})</em> : null}</header>
          <div className="row add">
            <input className="mgr-input" placeholder="거래처명 추가" value={vendorInput}
              onChange={(e)=>setVendorInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&addVendor()} disabled={!selectedCat} />
            <button className="btn-primary mini" onClick={addVendor} disabled={!selectedCat}><i className="ri-add-line" /> 추가</button>
          </div>
          <ul className="pill-list">
            {(vendorNamesByCat[selectedCat] || []).map((v) => (
              <li key={v} className="pill">
                <span>{v}</span>
                <button className="x" onClick={()=>removeVendor(v)} aria-label="삭제"><i className="ri-close-line" /></button>
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

/* ───────── 결제등록/수정 모달 ───────── */
function RegisterModal({
  open, onClose, onSubmit, categories, vendorNamesByCat,
  mode = "create", initial = null
}) {
  const inputsOrder = useRef([]);
  const setRef = (idx) => (el) => { inputsOrder.current[idx] = el; };
  const goNext = (idx) => {
    const next = inputsOrder.current[idx + 1];
    if (next) next.focus();
  };

  const initialForm = initial || {
    category: "",
    vendorName: "",
    bank: "",
    accountHolder: "",
    accountNo: "",
    amount: "",
    note: "",
    cycle: "말일",
    addToSites: false,
  };

  const [form, setForm] = useState(initialForm);
  useEffect(() => { if (open) setForm(initial || { ...initialForm }); }, [open]); // eslint-disable-line
  useEffect(() => { setForm((f) => ({ ...f, vendorName: "" })); }, [form.category]); // eslint-disable-line

  const submit = () => {
    if (!form.category) return alert("구분을 선택하세요.");
    if (!form.vendorName) return alert("거래처명을 선택하세요.");
    const numAmount = Number(String(form.amount).replace(/[^\d]/g, "")) || 0;
    onSubmit?.({
      ...form,
      category: s(form.category),
      vendorName: s(form.vendorName),
      bank: s(form.bank),
      accountHolder: s(form.accountHolder),
      accountNo: s(form.accountNo),
      amount: numAmount,
      note: s(form.note),
      cycle: form.cycle,
      addToSites: !!form.addToSites,
    });
    onClose?.();
  };

  const headerExtra = (
    <label className="switch luxe" title="달표추가">
      <input
        type="checkbox"
        checked={!!form.addToSites}
        onChange={(e)=>setForm({...form, addToSites: e.target.checked})}
      />
      <span className="slider" />
      <span className="label">달표추가</span>
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "결제수정" : "결제등록"}
      width={760}
      hideCloseIcon
      headerExtra={headerExtra}
    >
      <div className="reg-grid">
        <label>
          <span><i className="ri-shapes-line"></i> 구분</span>
          <select ref={setRef(0)} className="select" value={form.category}
            onChange={(e)=>setForm({...form, category:e.target.value})}
            onKeyDown={(e)=>e.key==="Enter"&&goNext(0)}>
            <option value=""></option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label>
          <span><i className="ri-building-line"></i> 거래처명</span>
          <select ref={setRef(1)} className="select" value={form.vendorName}
            onChange={(e)=>setForm({...form, vendorName:e.target.value})}
            onKeyDown={(e)=>e.key==="Enter"&&goNext(1)}>
            <option value=""></option>
            {(vendorNamesByCat[form.category] || []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>

        <label>
          <span><i className="ri-bank-line"></i> 은행</span>
          <input ref={setRef(2)} className="input" value={form.bank}
            onChange={(e)=>setForm({...form, bank:e.target.value})}
            onKeyDown={(e)=>e.key==="Enter"&&goNext(2)} />
        </label>

        <label>
          <span><i className="ri-user-3-line"></i> 예금주</span>
          <input ref={setRef(3)} className="input" value={form.accountHolder}
            onChange={(e)=>setForm({...form, accountHolder:e.target.value})}
            onKeyDown={(e)=>e.key==="Enter"&&goNext(3)} />
        </label>

        <label>
          <span><i className="ri-hashtag"></i> 계좌번호</span>
          <input ref={setRef(4)} className="input" placeholder="예: 356-0000-000000" value={form.accountNo}
            onChange={(e)=>setForm({...form, accountNo:e.target.value})}
            onKeyDown={(e)=>e.key==="Enter"&&goNext(4)} />
        </label>

        <label>
          <span><i className="ri-cash-line"></i> 금액</span>
          <input ref={setRef(5)} className="input" inputMode="numeric" placeholder="숫자만"
            value={form.amount}
            onChange={(e)=>setForm({...form, amount:e.target.value})}
            onKeyDown={(e)=>e.key==="Enter"&&goNext(5)} />
        </label>

        <label className="wide">
          <span><i className="ri-sticky-note-line"></i> 비고</span>
          <input ref={setRef(6)} className="input" value={form.note}
            onChange={(e)=>setForm({...form, note:e.target.value})}
            onKeyDown={(e)=>e.key==="Enter"&&goNext(6)} />
        </label>

        <label>
          <span><i className="ri-calendar-2-line"></i> 주기</span>
          <select ref={setRef(7)} className="select" value={form.cycle}
            onChange={(e)=>setForm({...form, cycle:e.target.value})}
            onKeyDown={(e)=>e.key==="Enter"&&goNext(7)}>
            <option value="말일">말일</option>
            <option value="10일">10일</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}

/* ───────── 달표 보기(구분/거래처 선택 → 테이블에 per-row 결제시작) ───────── */
function SitesViewer({ targetDate, sites }) {
  const [cat, setCat] = useState("");
  const [vendor, setVendor] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [year, setYear] = useState(targetDate.getFullYear());

  const [rows, setRows] = useState(() =>
    sites.map((s) => ({
      ...s,
      baseAmount: s.baseAmount || s.months?.[1] || 0,
      startMonth: s.startMonth || 1,
    }))
  );
  useEffect(() => {
    setRows(sites.map((s) => ({
      ...s,
      baseAmount: s.baseAmount || s.months?.[1] || 0,
      startMonth: s.startMonth || 1,
    })));
  }, [sites]);

  const now = new Date();
  const currentMonthForYear = (year === now.getFullYear()) ? (now.getMonth() + 1) : 12;
  const m = currentMonthForYear;

  const cats = Array.from(new Set(rows.map((s) => s.category)));
  const vendors = Array.from(new Set(rows.filter((s) => !cat || s.category === cat).map((s) => s.vendorName)));

  const list = (!cat || !vendor) ? [] : rows.filter((s) => s.category === cat && s.vendorName === vendor);

  const monthTotals = Array.from({ length: 12 }).map((_, i) => {
    const mm = i + 1;
    if (mm > m) return 0;
    return list.reduce((sum, r) => sum + Number(r.months?.[mm] || 0), 0);
  });

  const saveRow = async (row) => {
    try {
      await updateDoc(doc(db, "paymentSites", row.id), {
        baseAmount: row.baseAmount || 0,
        startMonth: row.startMonth || 1,
        months: row.months || {},
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("paymentSites update failed:", e);
    }
  };

  const setRowAmount = (id, val) => {
    const num = Number(String(val).replace(/[^\d]/g, "")) || 0;
    setRows((arr) =>
      arr.map((r) => {
        if (r.id !== id) return r;
        const newMonths = {};
        const sm = Number(r.startMonth || 1);
        for (let i = 1; i <= 12; i++) newMonths[i] = (i >= sm && i <= m ? num : 0);
        const updated = { ...r, baseAmount: num, months: newMonths };
        saveRow(updated);
        return updated;
      })
    );
  };

  const setRowStartMonth = (id, smVal) => {
    const sm = Number(smVal);
    setRows((arr) =>
      arr.map((r) => {
        if (r.id !== id) return r;
        const num = Number(r.baseAmount || 0);
        const newMonths = {};
        for (let i = 1; i <= 12; i++) newMonths[i] = (i >= sm && i <= m ? num : 0);
        const updated = { ...r, startMonth: sm, months: newMonths };
        saveRow(updated);
        return updated;
      })
    );
  };

  return (
    <div className="sites-viewer">
      {/* 상단 컨트롤 */}
      <div className="sites-controls">
        <select className="select mini" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value=""></option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select className="select mini" value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value=""></option>
          {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <select className="select mini" value={year} onChange={(e)=>setYear(Number(e.target.value))}>
          {Array.from({length:5}).map((_,i)=>{
            const y = new Date().getFullYear()-2+i;
            return <option key={y} value={y}>{y}년</option>;
          })}
        </select>

        <button className="btn tiny" onClick={() => setEditMode((v) => !v)}>
          <i className="ri-edit-2-line"></i> 금액수정
        </button>
      </div>

      {/* ▼ 헤더는 고정, 내용만 스크롤 */}
      <div className="table-scroll sites-scroll-fixed">
        <table className="table light sticky-first nowrap header-sum sites-centercols sites-tiny more-tight">
          <thead>
            <tr>
              <th className="villa-col">빌라명</th>
              <th className="tc">구분</th>
              <th className="tc">거래처명</th>
              <th className="tc">결제시작</th>
              <th className="ar">금액</th>
              {Array.from({ length: 12 }).map((_, i) => {
                const mm = i + 1;
                const show = mm <= m;
                const sum = monthTotals[i] || 0;
                return (
                  <th key={mm} className="ar head-month">
                    <div className="head-month-wrap">
                      <span className="mon">{mm}월</span>
                      <span className="mon-sum">{show ? (sum ? `₩${toCurrency(sum)}` : "-") : "-"}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className="fixed-row-height">
                <td className="em villa-col">{s.villa}</td>
                <td className="tc">{s.category}</td>
                <td className="tc">{s.vendorName}</td>
                <td className="tc">
                  <select
                    className="select mini"
                    value={s.startMonth || 1}
                    onChange={(e)=>setRowStartMonth(s.id, e.target.value)}
                    title="결제시작(월)"
                  >
                    {Array.from({length:12}).map((_,i)=> <option key={i+1} value={i+1}>{i+1}월</option>)}
                  </select>
                </td>
                <td className="ar">
                  {editMode ? (
                    <input
                      className="input input-mini narrow ar sites-amount-input"
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
                  const show = mm <= m;
                  return (
                    <td key={mm} className={`ar ${mm === m ? "highlight-lite" : ""}`}>
                      {show ? (val ? `₩${toCurrency(val)}` : "-") : "-"}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!list.length && (
              <tr className="fixed-row-height">
                <td colSpan={17} className="empty">표시할 데이터가 없습니다.</td>
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
  const [cycleFilter, setCycleFilter] = useState("말일");
  const [search, setSearch] = useState("");

  const [vendors, setVendors] = useState([]);
  const [sites, setSites] = useState([]);

  const [categories, setCategories] = useState([]);
  const [vendorNamesByCat, setVendorNamesByCat] = useState({});
  const [villasDocs, setVillasDocs] = useState([]);

  const [openRegister, setOpenRegister] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const [openManage, setOpenManage] = useState(false);
  const [openSites, setOpenSites] = useState(false);

  useEffect(() => {
    const DEFAULT_CATS = ["승강기", "소방안전", "전기안전", "건물청소"];
    setCategories(DEFAULT_CATS);

    const unsubVillas = onSnapshot(collection(db, "villas"), (snap) => {
      const acc = { 승강기: [], 소방안전: [], 전기안전: [], 건물청소: [] };
      const docs = [];
      const pushIf = (cat, val) => { const t = s(val); if (t) acc[cat].push(t); };

      snap.docs.forEach((d) => {
        const v = d.data() || {};
        docs.push({ id: d.id, ...v });
        pushIf("승강기", v.elevator ?? v.elevatorVendor ?? v.elevatorCompany);
        pushIf("소방안전", v.fireSafety ?? v.fireSafetyVendor ?? v.fireSafetyCompany);
        pushIf("전기안전", v.electricSafety ?? v.electricSafetyVendor ?? v.electricSafetyCompany);
        pushIf("건물청소", v.cleaning ?? v.buildingCleaning ?? v.cleaningVendor ?? v.cleaningCompany);
      });

      setVillasDocs(docs);
      const uniqSorted = Object.fromEntries(Object.entries(acc).map(([k, arr]) => [k, Array.from(new Set(arr)).sort()]));
      setVendorNamesByCat(uniqSorted);
    });

    const unsubVendors = onSnapshot(collection(db, "paymentVendors"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setVendors(list.sort((a,b)=> (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    });

    const unsubSites = onSnapshot(collection(db, "paymentSites"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSites(list);
    });

    return () => { unsubVillas(); unsubVendors(); unsubSites(); };
  }, []);

  const targetYM = ymKey(targetDate);
  const targetM = monthIndex(targetDate);
  const targetY = targetDate.getFullYear();

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors
      .filter((v) => v.cycle === cycleFilter)
      .filter((v) => {
        if (!q) return true;
        const hay = `${v.category} ${v.vendorName} ${v.bank} ${v.accountHolder} ${v.accountNo} ${v.note}`.toLowerCase();
        return hay.includes(q);
      })
      .map((v) => {
        const months = monthsBetweenYM(v.startYear, v.startMonth, targetY, targetM);
        const base = Number(v.amount || 0);
        const paidSum = (v.payments || []).filter((p) => p.ym <= targetYM)
          .reduce((a, b) => a + Number(b.amount || 0), 0);
        const should = Math.max(months, 0) * base;
        const unpaidAcc = Math.max(should - paidSum, 0);
        return { ...v, unpaidAcc };
      });
  }, [vendors, cycleFilter, search, targetM, targetY, targetYM]);

  const totals = useMemo(() => ({
    planned: filteredRows.reduce((a, r) => a + Number(r.amount || 0), 0),
    unpaidAcc: filteredRows.reduce((a, r) => a + Number(r.unpaidAcc || 0), 0),
  }), [filteredRows]);

  const getVillaName = (v) =>
    v.villaName || v.name || v.buildingName || v.title || v.villa || v.codeName || v?.billa || "";

  const vendorFieldsByCat = {
    "승강기": ["elevator", "elevatorVendor", "elevatorCompany"],
    "소방안전": ["fireSafety", "fireSafetyVendor", "fireSafetyCompany"],
    "전기안전": ["electricSafety", "electricSafetyVendor", "electricSafetyCompany"],
    "건물청소": ["cleaning", "buildingCleaning", "cleaningVendor", "cleaningCompany"],
  };
  const collectVillasFor = (cat, vendorName) => {
    const fields = vendorFieldsByCat[cat] || [];
    const names = [];
    villasDocs.forEach((v) => {
      const match = fields.some((f) => s(v?.[f]) === s(vendorName));
      if (match) {
        const nm = getVillaName(v);
        if (nm) names.push(nm);
      }
    });
    return Array.from(new Set(names));
  };

  const handleCreate = async (item) => {
    const docRef = await addDoc(collection(db, "paymentVendors"), {
      ...item,
      payments: [],
      createdAt: serverTimestamp(),
    });

    if (item.addToSites) {
      const villas = collectVillasFor(item.category, item.vendorName);
      for (const villaName of villas) {
        await addDoc(collection(db, "paymentSites"), {
          villa: villaName,
          category: item.category,
          vendorName: item.vendorName,
          months: {},
          baseAmount: Number(item.amount || 0),
          startMonth: 1,
          vendorId: docRef.id,
          createdAt: serverTimestamp(),
        });
      }
    }
  };

  const handleUpdate = async (id, patch) => {
    await updateDoc(doc(db, "paymentVendors", id), {
      category: patch.category,
      vendorName: patch.vendorName,
      bank: patch.bank,
      accountHolder: patch.accountHolder,
      accountNo: patch.accountNo,
      amount: Number(patch.amount || 0),
      note: patch.note,
      cycle: patch.cycle,
      updatedAt: serverTimestamp(),
    });

    if (patch.addToSites) {
      const villas = collectVillasFor(patch.category, patch.vendorName);
      for (const villaName of villas) {
        await addDoc(collection(db, "paymentSites"), {
          villa: villaName,
          category: patch.category,
          vendorName: patch.vendorName,
          months: {},
          baseAmount: Number(patch.amount || 0),
          startMonth: 1,
          vendorId: id,
          createdAt: serverTimestamp(),
        });
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("이 결제 항목을 삭제할까요?")) return;
    await deleteDoc(doc(db, "paymentVendors", id));
  };

  return (
    <div className="psp wrap light">
      {/* 상단 (sticky) */}
      <header className="psp-hero single-line sticky">
        <div className="title">
          <i className="ri-bank-card-2-line"></i>
          <h1>대금결제 관리</h1>
        </div>

        <div className="hero-controls">
          <MonthPicker valueDate={targetDate} onChange={setTargetDate} />

          {/* ▼ 말일/10일: 폭 축소, 화살표 제거, 가운데 정렬 */}
          <select
            className="select cycle-narrow center-text"
            value={cycleFilter}
            onChange={(e)=>setCycleFilter(e.target.value)}
          >
            <option value="말일">말일</option>
            <option value="10일">10일</option>
          </select>

          <div className="search-wrap">
            <i className="ri-search-line" aria-hidden="true"></i>
            <input
              className="search"
              placeholder=""
              value={search}
              onChange={(e)=>setSearch(e.target.value)}
            />
          </div>

          <button className="btn glam" onClick={()=>{ setEditTarget(null); setOpenRegister(true); }}>
            <i className="ri-add-circle-line"></i> 결제등록
          </button>
          <button className="btn pale" onClick={()=>setOpenSites(true)}>
            <i className="ri-table-2"></i> 달표보기
          </button>
          <button className="btn ghost" onClick={()=>setOpenManage(true)}>
            <i className="ri-settings-5-line"></i> 관리
          </button>

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

      {/* 리스트: 헤더 그대로, 내용만 세로폭·폰트 축소 */}
      <section className="card light psp-list">
        <div className="table-scroll">
          <table className="table light centered body-mini">
            <thead>
              <tr>
                <th>구분</th>
                <th>거래처명</th>
                <th>은행</th>
                <th>예금주</th>
                <th>계좌번호</th>
                <th className="ar">금액</th>
                <th className="tc">비고</th>
                <th className="ar">미납누계</th>
                <th className="tc">관리</th>
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
                  <td className="tc">
                    <span className="row-actions">
                      <button className="icon-btn ghost" title="수정"
                        onClick={()=>{ setEditTarget(r); setOpenRegister(true); }}>
                        <i className="ri-pencil-line"></i>
                      </button>
                      <button className="icon-btn ghost" title="삭제" onClick={()=>handleDelete(r.id)}>
                        <i className="ri-delete-bin-6-line"></i>
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 모달들 */}
      {!editTarget && (
        <RegisterModal
          open={openRegister}
          onClose={()=>setOpenRegister(false)}
          onSubmit={handleCreate}
          categories={categories}
          vendorNamesByCat={vendorNamesByCat}
          mode="create"
        />
      )}
      {editTarget && (
        <RegisterModal
          open={openRegister}
          onClose={()=>{ setOpenRegister(false); setEditTarget(null); }}
          onSubmit={(patch)=>handleUpdate(editTarget.id, patch)}
          categories={categories}
          vendorNamesByCat={vendorNamesByCat}
          mode="edit"
          initial={{
            category: editTarget.category,
            vendorName: editTarget.vendorName,
            bank: editTarget.bank,
            accountHolder: editTarget.accountHolder,
            accountNo: editTarget.accountNo,
            amount: editTarget.amount ?? "",
            note: editTarget.note,
            cycle: editTarget.cycle,
            addToSites: false,
          }}
        />
      )}

      <ManageOptionsModal
        open={openManage}
        onClose={()=>setOpenManage(false)}
        categories={categories}
        setCategories={setCategories}
        vendorNamesByCat={vendorNamesByCat}
        setVendorNamesByCat={setVendorNamesByCat}
      />

      {/* ▼ 달표보기: 고정 폭 큰 창 + 상단 헤더 아이콘 제거 + 타이틀 변경 + 헤더 높이 축소 */}
      <Modal
        open={openSites}
        onClose={()=>setOpenSites(false)}
        title="거래처별 달표"
        width={1400}
        hideCloseIcon
        showIcon={false}
        headCompact={true}
        footer={
          <div className="foot-actions">
            <button className="btn-eq ghost" onClick={()=>setOpenSites(false)}>
              <i className="ri-close-circle-line" /> 닫기
            </button>
          </div>
        }
      >
        <SitesViewer targetDate={targetDate} sites={sites} />
      </Modal>
    </div>
  );
}
