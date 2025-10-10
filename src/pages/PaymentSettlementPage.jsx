// src/pages/PaymentSettlementPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./PaymentSettlementPage.css";

import { db } from "../firebase";
import {
  collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp,
  arrayUnion, arrayRemove
} from "firebase/firestore";

/* ───────────────── 유틸 ───────────────── */
const toCurrency = (n) => (Number(n || 0)).toLocaleString("ko-KR");
const ymKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthIndex = (d) => d.getMonth() + 1;
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
      <button
        className="select like-input month-trigger slim with-iconless center-text"
        onClick={() => setOpen(v=>!v)}
        aria-label="대상월 선택"
        type="button"
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
                <button key={m} className={`mp-cell ${isNow ? "now" : ""}`} onClick={()=>selectMonth(m)} type="button">{m}월</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── 공통 모달 ───────── */
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
            <button className="icon-btn" onClick={onClose} aria-label="닫기" type="button">
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

/* ───────── (간단 구현) 결제 등록 모달 ───────── */
/* 기존에 별도 파일이 있다면 이 블록 제거 후 import 하세요. */
function RegisterModal({
  open, onClose, onSubmit, categories, vendorNamesByCat,
  mode = "create",
  initial = {
    category: "", vendorName: "", bank: "", accountHolder: "", accountNo: "",
    amount: "", note: "", cycle: "말일", addToSites: false,
  },
}) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [open, initial]);

  const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const vendorOptions = vendorNamesByCat?.[form.category] || [];

  const handleSubmit = async () => {
    const payload = {
      category: s(form.category),
      vendorName: s(form.vendorName),
      bank: s(form.bank),
      accountHolder: s(form.accountHolder),
      accountNo: s(form.accountNo),
      amount: Number(String(form.amount).replace(/[^\d]/g, "")) || 0,
      note: s(form.note),
      cycle: form.cycle || "말일",
      updatedAt: serverTimestamp(),
    };
    await onSubmit?.(payload, form.addToSites);
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="결제등록"
      width={820}
      hideCloseIcon
      showIcon={false}
      headCompact
      footer={
        <div className="foot-actions">
          <button className="btn-eq primary" onClick={handleSubmit} type="button">
            <i className="ri-check-line" /> {mode === "edit" ? "수정" : "저장"}
          </button>
          <button className="btn-eq ghost" onClick={onClose} type="button">
            <i className="ri-close-circle-line" /> 닫기
          </button>
        </div>
      }
    >
      <div className="reg-grid">
        <div className="row two">
          <div className="field">
            <label>구분</label>
            <select className="select" value={form.category} onChange={(e)=>onChange("category", e.target.value)}>
              <option value="">선택</option>
              {categories.map((c)=> <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>거래처명</label>
            <input className="input" value={form.vendorName} onChange={(e)=>onChange("vendorName", e.target.value)} list="vendorOptions" />
            <datalist id="vendorOptions">
              {vendorOptions.map(v => <option key={v} value={v} />)}
            </datalist>
          </div>
        </div>

        <div className="row three">
          <div className="field">
            <label>은행</label>
            <input className="input" value={form.bank} onChange={(e)=>onChange("bank", e.target.value)} />
          </div>
          <div className="field">
            <label>예금주</label>
            <input className="input" value={form.accountHolder} onChange={(e)=>onChange("accountHolder", e.target.value)} />
          </div>
          <div className="field">
            <label>계좌번호</label>
            <input className="input mono" value={form.accountNo} onChange={(e)=>onChange("accountNo", e.target.value)} />
          </div>
        </div>

        <div className="row two">
          <div className="field">
            <label>금액</label>
            <input
              className="input ar"
              inputMode="numeric"
              value={form.amount}
              onChange={(e)=>onChange("amount", e.target.value.replace(/[^\d]/g, ""))}
              placeholder="0"
            />
          </div>
          <div className="field">
            <label>결제주기</label>
            <select className="select" value={form.cycle} onChange={(e)=>onChange("cycle", e.target.value)}>
              <option value="말일">말일</option>
              <option value="10일">10일</option>
            </select>
          </div>
        </div>

        <div className="row one">
          <div className="field">
            <label>비고</label>
            <input className="input" value={form.note} onChange={(e)=>onChange("note", e.target.value)} />
          </div>
        </div>

        <div className="row one">
          <label className="check">
            <input type="checkbox" checked={!!form.addToSites} onChange={(e)=>onChange("addToSites", e.target.checked)} />
            <span>달표(거래처별 사이트)에 함께 추가</span>
          </label>
        </div>
      </div>
    </Modal>
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
          <button className="btn-eq primary" onClick={onClose} type="button"><i className="ri-check-line" /> 저장</button>
          <button className="btn-eq ghost" onClick={onClose} type="button"><i className="ri-close-circle-line" /> 닫기</button>
        </div>
      }
    >
      <div className="mgr-grid">
        <section className="mgr-card">
          <header><i className="ri-shapes-line"></i> 구분</header>
          <div className="row add">
            <input className="mgr-input" placeholder="구분 추가" value={catInput}
              onChange={(e)=>setCatInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&addCat()} />
            <button className="btn-primary mini" onClick={addCat} type="button"><i className="ri-add-line" /> 추가</button>
          </div>
          <ul className="pill-list">
            {categories.map((c) => (
              <li key={c} className={`pill ${selectedCat === c ? "active" : ""}`} onClick={()=>setSelectedCat(c)}>
                  <span>{c}</span>
                  <button className="x" onClick={(e)=>{e.stopPropagation(); removeCat(c);}} aria-label="삭제" type="button"><i className="ri-close-line" /></button>
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
            <button className="btn-primary mini" onClick={addVendor} disabled={!selectedCat} type="button"><i className="ri-add-line" /> 추가</button>
          </div>
          <ul className="pill-list">
            {(vendorNamesByCat[selectedCat] || []).map((v) => (
              <li key={v} className="pill">
                <span>{v}</span>
                <button className="x" onClick={()=>removeVendor(v)} aria-label="삭제" type="button"><i className="ri-close-line" /></button>
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

/* ───────── 달표 보기 ───────── */
function SitesViewer({
  sites, vendors, targetDate,
  cat, vendor, year, editMode
}) {
  // monthsByYear: { "2025": {1:..., 12:...} } 를 우선 사용, 없으면 기존 months fallback
  const normalizeRow = (s) => {
    const monthsByYear = s.monthsByYear || {};
    const current = monthsByYear[year] || s.months || {};
    return {
      ...s,
      monthsByYear,
      months: current,
      baseAmount: s.baseAmount || current[1] || 0,
      startMonth: s.startMonth || 1,
    };
  };

  const [rows, setRows] = useState(() => sites.map(normalizeRow));
  useEffect(() => { setRows(sites.map(normalizeRow)); }, [sites, year]);

  const now = new Date();
  const currentMonthForYear = (year === now.getFullYear()) ? (now.getMonth() + 1) : 12;
  const m = currentMonthForYear;

  const list = (!cat || !vendor) ? [] : rows.filter((s) => s.category === cat && s.vendorName === vendor);

  const monthTotals = Array.from({ length: 12 }).map((_, i) => {
    const mm = i + 1;
    if (mm > m) return 0;
    return list.reduce((sum, r) => sum + Number((r.monthsByYear?.[year]?.[mm]) || 0), 0);
  });

  const saveRow = async (row) => {
    try {
      const monthsByYear = { ...(row.monthsByYear || {}) };
      monthsByYear[year] = row.months || {};
      // 호환성 유지를 위해 현재 year 데이터는 months에도 반영
      await updateDoc(doc(db, "paymentSites", row.id), {
        baseAmount: row.baseAmount || 0,
        startMonth: row.startMonth || 1,
        monthsByYear,
        months: monthsByYear[year],
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
        const sm = Number(r.startMonth || 1);
        const newMonths = {};
        for (let i = 1; i <= 12; i++) newMonths[i] = (i >= sm && i <= m ? num : 0);
        const updated = { ...r, baseAmount: num, months: newMonths, monthsByYear: { ...(r.monthsByYear||{}), [year]: newMonths } };
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
        const updated = { ...r, startMonth: sm, months: newMonths, monthsByYear: { ...(r.monthsByYear||{}), [year]: newMonths } };
        saveRow(updated);
        return updated;
      })
    );
  };

  // ✅ 납부 완료된 월(헤더/셀) 표시
  const paidMonthsByVendor = useMemo(() => {
    const map = {};
    if (!vendors || !list.length) return map;
    const vendorId = list[0].vendorId;
    const vendorDoc = vendors.find(v => v.id === vendorId);
    if (vendorDoc?.payments) {
      vendorDoc.payments.forEach(p => { map[p.ym] = true; });
    }
    return map;
  }, [vendors, list]);

  // ✅ 이월 & 이월취소
  const rolloverToNextYear = async () => {
    const next = year + 1;
    const targets = list.map(r => {
      const decVal = (r.monthsByYear?.[year]?.[12]) || 0;
      const nextJan = { ...(r.monthsByYear?.[next] || {}) };
      nextJan[1] = decVal;
      const monthsByYear = { ...(r.monthsByYear||{}), [next]: nextJan };
      return { ...r, monthsByYear };
    });
    setRows(prev => prev.map(r => {
      const t = targets.find(x => x.id === r.id);
      return t ? t : r;
    }));
    await Promise.all(targets.map(async (t) => {
      await updateDoc(doc(db, "paymentSites", t.id), {
        monthsByYear: t.monthsByYear,
        // 호환성: 현재 모달 year가 next면 months도 반영
        ...(next === year ? { months: t.monthsByYear[next] } : {}),
        updatedAt: serverTimestamp(),
      });
    }));
    alert(`${year}년 12월 → ${next}년 1월 이월 완료`);
  };

  const cancelRollover = async () => {
    const next = year + 1;
    const targets = list.map(r => {
      const nextJan = { ...(r.monthsByYear?.[next] || {}) };
      // 단순 되돌리기: 1월 금액을 0으로
      nextJan[1] = 0;
      const monthsByYear = { ...(r.monthsByYear||{}), [next]: nextJan };
      return { ...r, monthsByYear };
    });
    setRows(prev => prev.map(r => {
      const t = targets.find(x => x.id === r.id);
      return t ? t : r;
    }));
    await Promise.all(targets.map(async (t) => {
      await updateDoc(doc(db, "paymentSites", t.id), {
        monthsByYear: t.monthsByYear,
        ...(next === year ? { months: t.monthsByYear[next] } : {}),
        updatedAt: serverTimestamp(),
      });
    }));
    alert(`${year + 1}년 1월 이월 취소 완료`);
  };

  return (
    <div className="sites-viewer">
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
                const ym = `${year}-${String(mm).padStart(2, '0')}`;
                const isPaid = paidMonthsByVendor[ym];
                return (
                  <th key={mm} className={`ar head-month ${isPaid ? "paid" : ""}`}>
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
                    disabled={!editMode}
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
                  const val = s.monthsByYear?.[year]?.[mm] || 0;
                  const show = mm <= m;
                  const ym = `${year}-${String(mm).padStart(2, '0')}`;
                  const isPaid = paidMonthsByVendor[ym];
                  return (
                    <td key={mm} className={`ar ${mm === m ? "highlight-lite" : ""} ${isPaid ? "paid" : ""}`}>
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

      {/* 달표 상단 컨트롤(이월/이월취소) - 상단 extra에 배치되지만 editMode 토글은 부모에서 */}
      <div style={{display:"none"}}>
        <button onClick={rolloverToNextYear} />
        <button onClick={cancelRollover} />
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

  // ✅ SitesViewer 제어 상태
  const [sitesCat, setSitesCat] = useState("");
  const [sitesVendor, setSitesVendor] = useState("");
  const [sitesEditMode, setSitesEditMode] = useState(false);
  const [sitesYear, setSitesYear] = useState(targetDate.getFullYear());

  // ✅ 메인 테이블: (년-별) 결제달 선택/금액 계산/입금확인 표시
  const [paymentMonths, setPaymentMonths] = useState({});
  const [calculatedAmounts, setCalculatedAmounts] = useState({});
  const [paidStatuses, setPaidStatuses] = useState({});
  // ✅ 메인 리스트 수정모드 스위치
  const [inlineEditMode, setInlineEditMode] = useState(false);

  useEffect(() => {
    const statuses = {};
    vendors.forEach(v => {
      (v.payments || []).forEach(p => {
        statuses[`${v.id}-${p.ym}`] = true;
      });
    });
    setPaidStatuses(statuses);
  }, [vendors]);

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
      });
  }, [vendors, cycleFilter, search]);

  const totals = useMemo(() => ({
    planned: filteredRows.reduce((a, r) => a + Number(r.amount || 0), 0),
    unpaidAcc: filteredRows.reduce((a, r) => {
      const calc = calculatedAmounts[r.id];
      if (calc) return a + calc.unpaid;
      const vendorData = vendors.find(v => v.id === r.id);
      const months = Math.max(0, (targetY - (vendorData?.startYear || targetY)) * 12 + (targetM - (vendorData?.startMonth || 1)) + 1);
      const base = Number(vendorData?.amount || 0);
      const paidSum = (vendorData?.payments || []).filter(p => p.ym <= targetYM).reduce((sum, p) => sum + p.amount, 0);
      return a + Math.max(0, months * base - paidSum);
    }, 0),
  }), [filteredRows, vendors, targetY, targetM, targetYM, calculatedAmounts]);

  const handleCreate = async (item, addToSites) => {
    try {
      const ref = await addDoc(collection(db, "paymentVendors"), {
        ...item,
        startYear: new Date().getFullYear(),
        startMonth: new Date().getMonth() + 1,
        payments: [],
        selectedMonths: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (addToSites) {
        await addDoc(collection(db, "paymentSites"), {
          vendorId: ref.id,
          vendorName: item.vendorName,
          category: item.category,
          villa: "-", // 필요시 수정
          baseAmount: item.amount || 0,
          startMonth: 1,
          monthsByYear: { [new Date().getFullYear()]: {} },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error(e);
      alert("결제 등록 중 오류가 발생했습니다.");
    }
  };

  const handleUpdate = async (id, patch) => {
    try {
      await updateDoc(doc(db, "paymentVendors", id), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert("수정 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("이 결제 항목을 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, "paymentVendors", id));
    } catch (e) {
      console.error(e);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  // ✅ 키를 "vendorId:year" 형태로 관리 (년도별 저장)
  const pmKey = (vendorId, year) => `${vendorId}:${year}`;

  // ✅ 결제달 선택 시: 중복 검사(동년도의 해당 월에 결제 기록이 이미 있으면 확인창), 그리고 즉시 저장
  const handlePaymentMonthChange = async (vendorId, selectedMonth) => {
    const year = targetY;
    const key = pmKey(vendorId, year);
    setPaymentMonths(prev => ({ ...prev, [key]: selectedMonth }));

    if (!selectedMonth) {
      setCalculatedAmounts(prev => {
        const { [vendorId]: _, ...rest } = prev;
        return rest;
      });
      // 빈 값 저장(해당 연도 선택 해제)
      try {
        await updateDoc(doc(db, "paymentVendors", vendorId), {
          [`selectedMonths.${year}`]: null,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.error(e);
      }
      return;
    }

    const monthNum = parseInt(selectedMonth, 10);
    const vendorSites = sites.filter(s => s.vendorId === vendorId);

    let amountForMonth = 0;
    vendorSites.forEach(site => {
      const byYear = site.monthsByYear || {};
      const months = byYear[year] || site.months || {};
      amountForMonth += months[monthNum] || 0;
    });

    let unpaidAmount = 0;
    for (let m = monthNum + 1; m <= targetM; m++) {
      vendorSites.forEach(site => {
        const byYear = site.monthsByYear || {};
        const months = byYear[year] || site.months || {};
        unpaidAmount += months[m] || 0;
      });
    }

    setCalculatedAmounts(prev => ({
      ...prev,
      [vendorId]: { amount: amountForMonth, unpaid: unpaidAmount }
    }));

    // ✅ 중복확인
    const vDoc = vendors.find(v => v.id === vendorId);
    const ym = `${year}-${String(monthNum).padStart(2, '0')}`;
    const alreadyPaid = (vDoc?.payments || []).some(p => p.ym === ym);
    if (alreadyPaid) {
      const ok = window.confirm(`${ym}에 이미 입금확인 기록이 있습니다. 결제달로 선택하시겠어요?`);
      if (!ok) return;
    }

    // ✅ 즉시 저장(자동 저장)
    try {
      await updateDoc(doc(db, "paymentVendors", vendorId), {
        [`selectedMonths.${year}`]: monthNum,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("selectedMonth save failed:", e);
      alert("결제달 저장 중 오류가 발생했습니다.");
    }
  };

  // ✅ 입금확인 핸들러 (수정모드에서만 활성화). 즉시 저장/삭제
  const handlePaymentConfirm = async (vendorId, isChecked) => {
    const year = targetY;
    const key = pmKey(vendorId, year);
    const selectedMonth = paymentMonths[key]
      ?? vendors.find(v=>v.id===vendorId)?.selectedMonths?.[year]
      ?? null;

    if (!selectedMonth) return;

    const amount = calculatedAmounts[vendorId]?.amount || 0;
    const ym = `${year}-${String(selectedMonth).padStart(2, '0')}`;
    const paymentRecord = { ym, amount };

    const docRef = doc(db, "paymentVendors", vendorId);
    try {
      if (isChecked) {
        await updateDoc(docRef, { payments: arrayUnion(paymentRecord), updatedAt: serverTimestamp() });
      } else {
        await updateDoc(docRef, { payments: arrayRemove(paymentRecord), updatedAt: serverTimestamp() });
      }
    } catch (e) {
      console.error("Payment confirmation update failed:", e);
      alert("입금 확인 상태 변경 중 오류가 발생했습니다.");
    }
  };

  // ✅ 달표보기 헤더 컨트롤
  const sitesHeaderControls = (
    <div className="sites-header-controls">
      <div className="sites-header-controls-left">
        <select className="select mini" value={sitesCat} onChange={(e) => setSitesCat(e.target.value)}>
          <option value="">구분 전체</option>
          {Array.from(new Set(sites.map(s => s.category))).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select mini" value={sitesVendor} onChange={(e) => setSitesVendor(e.target.value)}>
          <option value="">거래처 전체</option>
          {Array.from(new Set(sites.filter(s => !sitesCat || s.category === sitesCat).map(s => s.vendorName))).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="select mini" value={sitesYear} onChange={(e)=>setSitesYear(Number(e.target.value))}>
          {Array.from({length:5}).map((_,i)=>{
            const y = new Date().getFullYear()-2+i;
            return <option key={y} value={y}>{y}년</option>;
          })}
        </select>

        {/* 달표보기 금액 수정 모드 스위치 */}
        <label className="switch luxe" style={{marginLeft:8}}>
          <input
            type="checkbox"
            checked={!!sitesEditMode}
            onChange={(e)=>setSitesEditMode(e.target.checked)}
          />
          <span className="slider" />
          <span className="label">금액수정</span>
        </label>

        {/* 이월 / 이월취소 버튼 */}
        <button
          className="btn tiny"
          onClick={async ()=>{
            window.dispatchEvent(new CustomEvent("PSP_ROLLOVER", { detail: { year: sitesYear, cat: sitesCat, vendor: sitesVendor } }));
          }}
          type="button"
        >
          <i className="ri-arrow-right-circle-line"></i> 이월
        </button>
        <button
          className="btn tiny"
          onClick={async ()=>{
            window.dispatchEvent(new CustomEvent("PSP_ROLLOVER_CANCEL", { detail: { year: sitesYear, cat: sitesCat, vendor: sitesVendor } }));
          }}
          type="button"
        >
          <i className="ri-arrow-go-back-line"></i> 이월취소
        </button>
      </div>
      <button className="btn-eq ghost" onClick={()=>setOpenSites(false)} type="button">
        <i className="ri-close-circle-line" /> 닫기
      </button>
    </div>
  );

  // ✅ SitesViewer 이월/취소 부모 위임
  useEffect(() => {
    const onRoll = async (e) => {
      const y = e.detail?.year;
      const c = e.detail?.cat;
      const v = e.detail?.vendor;
      const filtered = sites.filter(s => (!c || s.category===c) && (!v || s.vendorName===v));
      const next = (y || targetY) + 1;
      await Promise.all(filtered.map(async (r) => {
        const monthsByYear = { ...(r.monthsByYear || {}) };
        const dec = monthsByYear[y]?.[12] ?? (r.months?.[12] || 0);
        const nextJan = { ...(monthsByYear[next] || {}) };
        nextJan[1] = dec;
        monthsByYear[next] = nextJan;
        await updateDoc(doc(db, "paymentSites", r.id), {
          monthsByYear,
          updatedAt: serverTimestamp(),
        });
      }));
      alert(`${y}년 12월 → ${next}년 1월 이월 완료`);
    };
    const onRollCancel = async (e) => {
      const y = e.detail?.year;
      const c = e.detail?.cat;
      const v = e.detail?.vendor;
      const filtered = sites.filter(s => (!c || s.category===c) && (!v || s.vendorName===v));
      const next = (y || targetY) + 1;
      await Promise.all(filtered.map(async (r) => {
        const monthsByYear = { ...(r.monthsByYear || {}) };
        const nextJan = { ...(monthsByYear[next] || {}) };
        nextJan[1] = 0;
        monthsByYear[next] = nextJan;
        await updateDoc(doc(db, "paymentSites", r.id), {
          monthsByYear,
          updatedAt: serverTimestamp(),
        });
      }));
      alert(`${next}년 1월 이월 취소 완료`);
    };
    window.addEventListener("PSP_ROLLOVER", onRoll);
    window.addEventListener("PSP_ROLLOVER_CANCEL", onRollCancel);
    return () => {
      window.removeEventListener("PSP_ROLLOVER", onRoll);
      window.removeEventListener("PSP_ROLLOVER_CANCEL", onRollCancel);
    };
  }, [sites, targetY]);

  return (
    <div className="psp-container psp wrap light">
      {/* 상단 (sticky) */}
      <header className="psp-hero single-line sticky">
        <div className="title">
          <i className="ri-bank-card-2-line"></i>
          <h1>대금결제 관리</h1>
        </div>

        <div className="hero-controls">
          <MonthPicker valueDate={targetDate} onChange={(d)=>{ setTargetDate(d); setSitesYear(d.getFullYear()); }} />

          <div className="cycle-toggle">
            <button
              className={cycleFilter === '말일' ? 'active' : ''}
              onClick={() => setCycleFilter('말일')}
              type="button"
            >
              말일
            </button>
            <button
              className={cycleFilter === '10일' ? 'active' : ''}
              onClick={() => setCycleFilter('10일')}
              type="button"
            >
              10일
            </button>
          </div>

          <div className="search-wrap">
            <i className="ri-search-line" aria-hidden="true"></i>
            <input
              className="search"
              placeholder=""
              value={search}
              onChange={(e)=>setSearch(e.target.value)}
            />
          </div>

          <button className="btn glam" onClick={()=>{ setEditTarget(null); setOpenRegister(true); }} type="button">
            <i className="ri-add-circle-line"></i> 결제등록
          </button>
          <button className="btn pale" onClick={()=>setOpenSites(true)} type="button">
            <i className="ri-table-2"></i> 달표보기
          </button>
          <button className="btn ghost" onClick={()=>setOpenManage(true)} type="button">
            <i className="ri-settings-5-line"></i> 관리
          </button>

          {/* ✅ 메인 리스트 수정모드 스위치(결제달/입금확인 편집 허용) */}
          <label className="switch luxe" title="수정모드" style={{marginLeft:8}}>
            <input
              type="checkbox"
              checked={!!inlineEditMode}
              onChange={(e)=>setInlineEditMode(e.target.checked)}
            />
            <span className="slider" />
            <span className="label">수정모드</span>
          </label>

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
          <table className="table light centered body-mini">
            <thead>
              <tr>
                <th>구분</th>
                <th>거래처명</th>
                {/* ✅ 결제달 */}
                <th>결제달</th>
                <th>은행</th>
                <th>예금주</th>
                <th>계좌번호</th>
                <th className="ar">금액</th>
                {/* ✅ 입금확인 */}
                <th>입금확인</th>
                <th className="tc">비고</th>
                <th className="ar">미납누계</th>
                <th className="tc">관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const key = pmKey(r.id, targetY);
                const selectedMonth =
                  paymentMonths[key] ??
                  r.selectedMonths?.[targetY] ??
                  "";
                const calc = calculatedAmounts[r.id];
                const displayAmount = calc ? calc.amount : r.amount;
                const ym = selectedMonth ? `${targetY}-${String(selectedMonth).padStart(2,'0')}` : '';
                const isPaid = paidStatuses[`${r.id}-${ym}`];

                const vendorData = vendors.find(v => v.id === r.id);
                const months = Math.max(0, (targetY - (vendorData?.startYear || targetY)) * 12 + (targetM - (vendorData?.startMonth || 1)) + 1);
                const base = Number(vendorData?.amount || 0);
                const paidSum = (vendorData?.payments || []).filter(p => p.ym <= ymKey(targetDate)).reduce((sum, p) => sum + p.amount, 0);
                const originalUnpaid = Math.max(0, months * base - paidSum);

                const displayUnpaid = calc ? calc.unpaid : originalUnpaid;

                return (
                  <tr key={r.id}>
                    <td>{r.category}</td>
                    <td className="em">{r.vendorName}</td>

                    {/* ✅ 결제달 선택 (수정모드에서만 활성화) */}
                    <td>
                      <select
                        className="select mini"
                        value={selectedMonth}
                        onChange={(e) => handlePaymentMonthChange(r.id, e.target.value)}
                        disabled={!inlineEditMode}
                      >
                        <option value="">-</option>
                        {Array.from({length: 12}).map((_, i) => <option key={i+1} value={i+1}>{i+1}월</option>)}
                      </select>
                    </td>

                    <td>{r.bank}</td>
                    <td>{r.accountHolder}</td>
                    <td className="mono">{r.accountNo}</td>
                    <td className="ar strong">₩{toCurrency(displayAmount)}</td>

                    {/* ✅ 입금확인 스위치 */}
                    <td>
                      <label className="switch mini-switch">
                        <input
                          type="checkbox"
                          disabled={!inlineEditMode || !selectedMonth}
                          checked={!!isPaid}
                          onChange={(e) => handlePaymentConfirm(r.id, e.target.checked)}
                        />
                        <span className="slider"></span>
                      </label>
                    </td>

                    <td className="muted">{r.note}</td>
                    <td className="ar danger">₩{toCurrency(displayUnpaid)}</td>
                    <td className="tc">
                      <span className="row-actions">
                        <button className="icon-btn ghost" title="수정"
                          onClick={()=>{ setEditTarget(r); setOpenRegister(true); }} type="button">
                          <i className="ri-pencil-line"></i>
                        </button>
                        <button className="icon-btn ghost" title="삭제" onClick={()=>handleDelete(r.id)} type="button">
                          <i className="ri-delete-bin-6-line"></i>
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="empty">데이터가 없습니다.</td>
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

      <Modal
        open={openSites}
        onClose={()=>setOpenSites(false)}
        title="거래처별 달표"
        width={1800}
        hideCloseIcon
        showIcon={false}
        headCompact={true}
        headerExtra={sitesHeaderControls}
      >
        <SitesViewer
          sites={sites}
          vendors={vendors}
          targetDate={targetDate}
          cat={sitesCat}
          vendor={sitesVendor}
          year={sitesYear}
          editMode={sitesEditMode}
        />
      </Modal>
    </div>
  );
}
