import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { db } from "../firebase";
import {
  getDoc,
  getDocs,
  query,
  where,
  doc,
  collection,
  addDoc,
  setDoc,
} from "firebase/firestore";

/* ===========================
   커스텀 드롭다운 (FancySelect)
=========================== */
function FancySelect({
  name,
  value,
  options = [],
  onChange,
  onEnterNext,
  inputRef,
}) {
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const portalElRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  useEffect(() => {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.zIndex = "9999";
    el.style.left = "0px";
    el.style.top = "0px";
    document.body.appendChild(el);
    portalElRef.current = el;
    return () => {
      document.body.removeChild(el);
    };
  }, []);

  useEffect(() => {
    if (typeof inputRef === "function") inputRef(btnRef.current);
  }, [inputRef]);

  const close = useCallback(() => {
    setOpen(false);
    setHoverIdx(-1);
  }, []);

  const positionMenu = useCallback(() => {
    if (!btnRef.current || !portalElRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();

    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const width = rect.width;
    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    const estItemH = 40;
    const estH = Math.min(options.length + 1, 8) * estItemH + 8;

    const openUp = estH > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(150, openUp ? spaceAbove : spaceBelow);

    const left = Math.max(8, Math.min(rect.left, vw - width - 8));
    const top = openUp ? rect.top - margin : rect.bottom + margin;

    setMenuStyle({
      left: `${left}px`,
      width: `${width}px`,
      top: `${top}px`,
      maxHeight: `${Math.max(150, Math.min(maxHeight, 420))}px`,
      transform: openUp ? "translateY(-100%)" : "translateY(0)",
    });
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    positionMenu();

    const onScroll = () => positionMenu();
    const onResize = () => positionMenu();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    const onDocMouseDown = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener("mousedown", onDocMouseDown);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [open, positionMenu, close]);

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setOpen(true);
      setHoverIdx(Math.max(0, options.findIndex((o) => o === value)));
      return;
    }
    if (!open && e.key === "Enter") {
      e.preventDefault();
      onEnterNext?.();
      return;
    }
    if (!open) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHoverIdx((i) => (i + 1) % options.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHoverIdx((i) => (i - 1 + options.length) % options.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (hoverIdx >= 0 && options[hoverIdx] != null) {
        const next = options[hoverIdx];
        onChange?.({ target: { name, value: next } });
      }
      close();
      onEnterNext?.();
    }
  };

  const currentText = value || "";

  const Menu =
    open && portalElRef.current
      ? createPortal(
          <div
            ref={menuRef}
            className="vrm-menu-portal"
            style={{
              position: "fixed",
              left: menuStyle.left,
              top: menuStyle.top,
              width: menuStyle.width,
              transform: menuStyle.transform,
            }}
          >
            <div
              className="vrm-menu-portal-inner"
              style={{ maxHeight: menuStyle.maxHeight }}
              role="listbox"
              tabIndex={-1}
            >
              <div
                className={`vrm-menu-item ${value === "" ? "active" : ""}`}
                onMouseEnter={() => setHoverIdx(-1)}
                onClick={() => {
                  onChange?.({ target: { name, value: "" } });
                  close();
                  btnRef.current?.focus();
                }}
                role="option"
                aria-selected={value === ""}
              >
                선택 안 함
              </div>
              {options.map((opt, i) => {
                const active = value === opt;
                const hover = hoverIdx === i;
                return (
                  <div
                    key={`${opt}-${i}`}
                    className={`vrm-menu-item ${active ? "active" : ""} ${
                      hover ? "hover" : ""
                    }`}
                    onMouseEnter={() => setHoverIdx(i)}
                    onClick={() => {
                      onChange?.({ target: { name, value: opt } });
                      close();
                      btnRef.current?.focus();
                    }}
                    role="option"
                    aria-selected={active}
                  >
                    {opt}
                  </div>
                );
              })}
            </div>
          </div>,
          portalElRef.current
        )
      : null;

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={`vrm-field vrm-select-trigger ${
          currentText ? "text-[#2e2b4a]" : "text-[#2e2b4a]"
        }`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{currentText}</span>
        <span className={`vrm-select-arrow ${open ? "open" : ""}`} />
      </button>
      {Menu}
    </>
  );
}

export default function VillaRegisterModal({ onClose, onSaved, editItem }) {
  useEffect(() => {
    const styleId = "vrm-btn-styles";
    if (!document.getElementById(styleId)) {
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = `
        .save-btn, .close-btn { font-size: 14px; padding: 10px 20px; border-radius: 6px; border: none; cursor: pointer; font-weight: 600; }
        .save-btn { background-color: #7A5FFF; color: white; border: 2px solid transparent; transition: all 0.2s ease; }
        .save-btn:hover { background-color: #9B7DFF; border: 2px solid #BFAEFF; box-shadow: 0 0 0 3px rgba(122, 95, 255, 0.3); }
        .close-btn { background-color: #ccc; color: black; border: 2px solid transparent; transition: all 0.2s ease; }
        .close-btn:hover { background-color: #e0e0e0; border: 2px solid #aaa; box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1); }
      `;
      document.head.appendChild(s);
    }
  }, []);

  /* ★ 요청 부분만 수정한 스타일: 가로 스크롤 제거 + 중간 선 제거 */
  useEffect(() => {
    const STYLE_ID = "vrm-dropdown-fixes";
    if (document.getElementById(STYLE_ID)) return;
    const css = document.createElement("style");
    css.id = STYLE_ID;
    css.textContent = `
      /* 드롭다운 목록 컨테이너: 세로만 스크롤, 가로 스크롤 완전 제거 */
      .vrm-menu-portal-inner{
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }
      /* WebKit 가로 스크롤 채널도 제거 */
      .vrm-menu-portal-inner::-webkit-scrollbar:horizontal{ height: 0 !important; }
      .vrm-menu-portal-inner::-webkit-scrollbar-track { background: transparent; }

      /* 스크롤 시 생기던 중간 선(의사보더) 제거 */
      .vrm-menu-portal-inner:before{ content: none !important; }
    `;
    document.head.appendChild(css);
  }, []);

  /* === 아래는 기존 코드 (변경 없음) === */

  useEffect(() => {
    const STYLE_ID = "vrm-beauty-strong-borders";
    if (document.getElementById(STYLE_ID)) return;
    const css = document.createElement("style");
    css.id = STYLE_ID;
    css.textContent = `
      .vrm-backdrop{
        background:
          radial-gradient(1200px 800px at 18% 12%, rgba(255, 234, 250, .60) 0%, transparent 60%),
          radial-gradient(1100px 800px at 82% 22%, rgba(235, 245, 255, .58) 0%, transparent 60%),
          linear-gradient(135deg, rgba(255,247,255,.50) 0%, rgba(246,251,255,.50) 100%);
        backdrop-filter: blur(2.5px);
      }
      .no-scroll { overflow: hidden !important; }

      .vrm-card{
        position:relative; background:rgba(255,255,255,.96); backdrop-filter: blur(8px);
        border-radius:22px; box-shadow:0 24px 60px rgba(150,120,255,.18), 0 6px 16px rgba(0,0,0,.06);
        overflow:hidden;
      }
      .vrm-card:before{
        content:""; position:absolute; inset:-1px; border-radius:24px; padding:1px;
        background:linear-gradient(135deg,#ffd6f3,#c3b4ff,#aee4ff);
        -webkit-mask:linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite:xor; mask-composite: exclude; pointer-events:none;
      }

      .vrm-title-chip {
        display:inline-flex; align-items:center; gap:10px;
        font-weight:900; color:#322873;
        background:linear-gradient(90deg,#fff1fb, #eef4ff);
        border:1px solid #efe6ff; border-radius:999px; padding:10px 16px;
        box-shadow:0 1px 0 rgba(255,255,255,.85) inset, 0 10px 22px rgba(180,160,255,.2);
      }
      .vrm-subtle { color:#8a87a3; font-weight:600; font-size:12px; letter-spacing:.3px; text-transform:uppercase; }
      .vrm-label { font-weight:800; color:#3a2f7a; letter-spacing:.2px; }

      .vrm-field{
        width:100%; height:44px;
        border-radius:12px;
        border:2px solid #b3a6ff;
        background:#ffffff;
        padding:10px 14px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 1px rgba(16,24,40,0.04);
        transition: box-shadow .18s ease, border-color .18s ease, transform .05s ease;
      }
      .vrm-field:hover{ border-color:#9f8dff; }
      .vrm-field:focus, .vrm-select-trigger:focus{
        outline:none;
        border-color:#7A5FFF;
        box-shadow:0 0 0 4px rgba(122,95,255,0.18);
      }

      .vrm-select-trigger{
        position:relative; text-align:left; font-size:14px;
        display:inline-flex; align-items:center; justify-content:space-between;
      }
      .vrm-select-arrow{
        position:absolute; right:12px; top:50%; width:20px; height:20px; transform: translateY(-50%) rotate(0deg);
        background-image:url("data:image/svg+xml;utf8,<svg width='20' height='20' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%237A5FFF'/><stop offset='100%' stop-color='%23FF7AD1'/></linearGradient></defs><path d='M7 10l5 5 5-5' stroke='url(%23g)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>");
        background-repeat:no-repeat; background-position:center; transition:transform .18s ease; pointer-events:none;
      }
      .vrm-select-arrow.open{ transform: translateY(-50%) rotate(180deg); }

      .vrm-menu-portal{
        filter: drop-shadow(0 14px 28px rgba(100,80,180,.18));
      }
      .vrm-menu-portal-inner{
        position:relative;
        border-radius:14px;
        background:#ffffff;
        border:2px solid #b3a6ff;
        overflow:auto;
      }
      .vrm-menu-portal-inner::-webkit-scrollbar{ width:10px; }
      .vrm-menu-portal-inner::-webkit-scrollbar-thumb{
        background: linear-gradient(180deg, #d9ccff, #b399ff);
        border-radius:10px; border:2px solid #ffffff;
      }
      /* 기존 :before는 삭제(아티팩트 방지) — 위 fix 스타일에서 강제 제거됨 */

      .vrm-menu-item{
        padding:10px 12px; font-size:14px; color:#2f2b4a;
        background:linear-gradient(180deg,#fff 0%, #fcfbff 100%);
        transition: background .12s ease, color .12s ease;
        user-select:none; cursor:pointer;
      }
      .vrm-menu-item + .vrm-menu-item{ border-top:1px solid #f0edff; }
      .vrm-menu-item.hover{ background: linear-gradient(180deg,#f6f1ff 0%, #fff0fb 100%); }
      .vrm-menu-item.active{ color:#7A5FFF; font-weight:700; }
    `;
    document.head.appendChild(css);
  }, []);

  // 뒤 화면 스크롤 방지
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = prev; };
  }, []);

  const cardRef = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const el = cardRef.current;
      if (!el) return;
      const maxW = window.innerWidth - 32;
      const maxH = window.innerHeight - 32;
      const rect = el.getBoundingClientRect();
      const s = Math.min(1, maxW / rect.width, maxH / rect.height);
      setScale(s > 0 ? s : 1);
    };
    const t = setTimeout(fit, 0);
    const ro = new ResizeObserver(fit);
    if (cardRef.current) ro.observe(cardRef.current);
    window.addEventListener("resize", fit);
    return () => { clearTimeout(t); window.removeEventListener("resize", fit); ro.disconnect(); };
  }, []);

  /* ===== 상태/로직 (변경 없음) ===== */
  const [form, setForm] = useState({
    code: "",
    name: "",
    district: "",
    address: "",
    telco: "",
    elevator: "",
    septic: "",
    fireSafety: "",
    electricSafety: "",
    water: "",
    publicElectric: "",
    cleaning: "",
    cctv: "",
  });

  const inputOrder = [
    "code", "name", "district", "address", "telco", "elevator", "septic",
    "fireSafety", "electricSafety", "water", "publicElectric", "cleaning", "cctv"
  ];

  const fieldLabels = {
    code: "코드번호",
    name: "빌라명",
    district: "구",
    address: "주소",
    telco: "통신사",
    elevator: "승강기",
    septic: "정화조",
    fireSafety: "소방안전",
    electricSafety: "전기안전",
    water: "상수도",
    publicElectric: "공용전기",
    cleaning: "건물청소",
    cctv: "CCTV",
  };

  const dropdownFields = ["district","telco","elevator","septic","fireSafety","electricSafety","cleaning","cctv"];

  const firebaseKeys = {
    telco: "통신사", elevator: "승강기", septic: "정화조",
    fireSafety: "소방안전", electricSafety: "전기안전",
    cleaning: "건물청소", cctv: "CCTV",
  };

  const [dropdownOptions, setDropdownOptions] = useState({
    district: ["대덕구", "동구", "서구", "유성구", "중구"],
  });

  const inputRefs = useRef([]);

  useEffect(() => {
    if (editItem) setForm((prev) => ({ ...prev, ...editItem }));
  }, [editItem]);

  useEffect(() => {
    const fetchDropdownData = async () => {
      const options = { district: dropdownOptions.district };
      for (const key of dropdownFields) {
        if (key === "district") continue;
        try {
          const snap = await getDoc(doc(db, "vendors", firebaseKeys[key]));
          if (snap.exists()) {
            const items = snap.data().items;
            options[key] = Array.isArray(items)
              ? items.filter((item) => String(item).trim() !== "")
              : [];
          } else {
            options[key] = [];
          }
        } catch (e) {
          console.error(`${key} 항목 로드 실패`, e);
          options[key] = [];
        }
      }
      setDropdownOptions(options);
    };
    fetchDropdownData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const focusNext = (index) => {
    const next = inputRefs.current[index + 1];
    if (next) next.focus();
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Enter") {
      e.preventDefault();
      focusNext(index);
    }
  };

  const handleSelectChange = (e, index) => {
    handleChange(e);
    focusNext(index);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      alert("코드번호와 빌라명은 필수 항목입니다.");
      return;
    }
    try {
      const q = query(collection(db, "villas"), where("code", "==", form.code));
      const snap = await getDocs(q);

      if (
        (!editItem && !snap.empty) ||
        (editItem && !snap.empty && snap.docs[0].id !== editItem.id)
      ) {
        alert("❌ 해당 코드번호는 이미 등록되어 있습니다.");
        return;
      }

      let savedItem;
      if (editItem?.id) {
        await setDoc(doc(db, "villas", editItem.id), form);
        savedItem = { id: editItem.id, ...form };
      } else {
        const docRef = await addDoc(collection(db, "villas"), form);
        savedItem = { id: docRef.id, ...form };
      }

      alert("✅ 저장되었습니다.");
      onSaved(savedItem);
      onClose();
    } catch (error) {
      console.error("🔥 저장 실패:", error);
      alert("❌ 저장에 실패했습니다.");
    }
  };

  return (
    <div
      className="
        fixed inset-0 z-50
        flex items-center justify-center
        vrm-backdrop no-scroll
      "
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={cardRef}
        className="vrm-card w-[920px] px-7 py-6"
        style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
      >
        {/* 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <div className="vrm-title-chip">
            <span className="text-[13px] vrm-subtle">Villa</span>
            <span className="text-[15px]">코드별 빌라 {editItem ? "수정" : "등록"}</span>
          </div>
          <div className="text-[12px] vrm-subtle">
            필수: <span className="font-bold text-[#6a54ff]">코드번호/빌라명</span>
          </div>
        </div>

        {/* 제목 */}
        <h3 className="text-xl font-extrabold tracking-tight text-[#2b2455] mb-2">
          {editItem ? "빌라 정보 수정" : "신규 빌라 등록"}
        </h3>

        {/* 폼 */}
        <div className="grid grid-cols-3 gap-x-6 gap-y-6 text-sm">
          {inputOrder.map((key, idx) => {
            const label = fieldLabels[key];
            const isSelect = ["district","telco","elevator","septic","fireSafety","electricSafety","cleaning","cctv"].includes(key);
            const options = dropdownOptions[key] || [];

            return (
              <div key={key} className="flex flex-col">
                <label className="mb-2 vrm-label">{label}</label>

                {isSelect ? (
                  <FancySelect
                    name={key}
                    value={form[key]}
                    options={options}
                    onChange={(e) => handleSelectChange(e, idx)}
                    onEnterNext={() => focusNext(idx)}
                    inputRef={(el) => (inputRefs.current[idx] = el)}
                  />
                ) : (
                  <input
                    name={key}
                    value={form[key]}
                    onChange={handleChange}
                    onKeyDown={(e) => handleKeyDown(e, idx)}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    className="vrm-field text-[#2e2b4a]"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-2 mt-10">
          <button onClick={handleSave} className="save-btn">저장</button>
          <button onClick={onClose} className="close-btn">닫기</button>
        </div>
      </div>
    </div>
  );
}
