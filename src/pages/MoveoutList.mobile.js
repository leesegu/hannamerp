import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc,
} from "firebase/firestore";
import * as htmlToImage from "html-to-image";
import PageTitle from "../components/PageTitle";
import ReceiptTemplate from "../components/ReceiptTemplate";
import "./MoveoutList.mobile.css";

/* ✅ Auth */
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

/* =========================
   안드로이드 저장/공유/SMS 유틸
========================= */
const isHybrid = () => {
  try {
    const w = typeof window !== "undefined" ? window : {};
    if (w.Capacitor?.isNativePlatform) return w.Capacitor.isNativePlatform();
    return !!(w.Capacitor || w.cordova);
  } catch { return false; }
};

// dataURL → base64 본문
const dataURLToBase64 = (dataUrl) => {
  if (!dataUrl) return "";
  const parts = String(dataUrl).split(",");
  return parts.length > 1 ? parts[1] : parts[0];
};

// Capacitor 모듈 로딩 (Filesystem만)
async function loadCapacitorMods() {
  const core = await import("@capacitor/core");
  const fs = await import("@capacitor/filesystem");
  return {
    Capacitor: core.Capacitor,
    registerPlugin: core.registerPlugin,
    Filesystem: fs.Filesystem,
    Directory: fs.Directory,
  };
}

/** 갤러리 저장(저장 버튼 전용): ExternalStorage/Pictures/HannamReceipts/..jpg */
async function saveToGalleryWithFilesystem(b64, fileName) {
  const { Capacitor, Filesystem, Directory } = await loadCapacitorMods();
  try { await Filesystem.requestPermissions(); } catch {}
  const path = `Pictures/HannamReceipts/${fileName}`;
  await Filesystem.writeFile({
    path, data: b64, directory: Directory.ExternalStorage, recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.ExternalStorage });
  const fileUriNative = uri; // file:///... (갤러리 노출)
  const fileUriView = Capacitor.convertFileSrc ? Capacitor.convertFileSrc(uri) : uri;
  return { fileUriNative, fileUriView };
}

/** 전송 전용(권한 無): Cache/receipts/..jpg → FileProvider로 첨부 */
async function saveForMms(b64, fileName) {
  const { Filesystem, Directory } = await loadCapacitorMods();
  const path = `receipts/${fileName}`;
  await Filesystem.writeFile({
    path, data: b64, directory: Directory.Cache, recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  return uri; // file:///... 캐시 경로
}

/** 저장 버튼에서 호출 */
async function saveReceiptToGalleryHybrid(dataUrl, baseName = "receipt") {
  const b64 = dataURLToBase64(dataUrl);
  if (!b64) throw new Error("Invalid dataUrl");
  const safeBase = String(baseName).replace(/[\\/:*?"<>|]/g, "") || "receipt";
  const fileName = `${safeBase}.jpg`;
  return await saveToGalleryWithFilesystem(b64, fileName);
}

/** 전송 버튼에서 호출 (캐시 저장) */
async function saveReceiptForMmsHybrid(dataUrl, baseName = "receipt") {
  const b64 = dataURLToBase64(dataUrl);
  if (!b64) throw new Error("Invalid dataUrl");
  const safeBase = String(baseName).replace(/[\\/:*?"<>|]/g, "") || "receipt";
  const fileName = `${safeBase}.jpg`;
  const fileUriNative = await saveForMms(b64, fileName);
  return { fileUriNative, fileName };
}

/** MMS 컴포저(네이티브 플러그인) 호출 */
async function openMmsComposer({ phone, fileUriNative, mimeType = "image/jpeg" }) {
  const { registerPlugin } = await loadCapacitorMods();
  const MmsComposer = registerPlugin("MmsComposer");
  // ⚠️ 본문 텍스트는 절대 전달하지 않음(자동 문구 방지)
  return MmsComposer.compose({ phone, fileUri: fileUriNative, mimeType });
}

/* ===== 유틸 ===== */
const toNum = (v) => v === "" || v == null ? 0 : (Number(String(v).replace(/[,\s]/g, "")) || 0);
const fmtAmount = (val) => { const n = toNum(val); return n ? n.toLocaleString() : (val === 0 ? "0" : ""); };
const sumExtrasFromArray = (extras) => (extras || []).reduce((a, it) => a + (Number(it?.amount || 0) || 0), 0);
const getExtraTotal = (x) => { const sx = Array.isArray(x.extras) ? sumExtrasFromArray(x.extras) : 0; return sx || toNum(x.extraAmount); };
const sumTotal = (x) => toNum(x.arrears)+toNum(x.currentMonth)+toNum(x.waterFee)+toNum(x.electricity)+toNum(x.tvFee)+toNum(x.cleaningFee)+getExtraTotal(x);

/* ===== 진행현황 셀렉트 ===== */
const STATUS = ["정산대기","입금대기","정산완료"];
const statusColor = (v) => v==="입금대기" ? "#ef4444" : v==="정산완료" ? "#10b981" : "#9ca3af";

function usePortalMenuPosition() {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const place = (el, width = 180) => {
    const r = el?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 6, left: Math.max(8, r.right - width), width });
  };
  return { pos, place };
}

function StatusSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const trigRef = useRef(null);
  const { pos, place } = usePortalMenuPosition();

  useEffect(() => {
    const onDocClick = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);
  useEffect(() => {
    const reflow = () => place(trigRef.current, 180);
    if (open) {
      reflow();
      window.addEventListener("resize", reflow);
      window.addEventListener("scroll", reflow, true);
      return () => {
        window.removeEventListener("resize", reflow);
        window.removeEventListener("scroll", reflow, true);
      };
    }
  }, [open, place]);

  return (
    <div className={`statusbox ${open ? "open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        ref={trigRef}
        className="status-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen(p => !p); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="진행현황 변경"
      >
        <i className="dot" style={{ background: statusColor(value) }} />
        <span className="label">{value || "정산대기"}</span>
        <span className="caret" />
      </button>

      {open && ReactDOM.createPortal(
        <div className="status-menu fixed" style={{ top: pos.top, left: pos.left, width: pos.width }} role="listbox">
          {STATUS.map(s => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={value === s}
              className={`status-item ${value === s ? "selected" : ""}`}
              onClick={() => { onChange?.(s); setOpen(false); }}
            >
              <i className="dot" style={{ background: statusColor(s) }} />
              <span className="txt">{s}</span>
              {value === s && <span className="check">✓</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

/* ===== 조회(필터) 셀렉트 ===== */
const FILTERS = ["ALL","정산대기","입금대기","정산완료"];
const filterLabel = (v) => v === "ALL" ? "전체" : v;

function FilterSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const trigRef = useRef(null);
  const { pos, place } = usePortalMenuPosition();

  useEffect(() => {
    const onDocClick = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);
  useEffect(() => {
    const reflow = () => place(trigRef.current, 160);
    if (open) {
      reflow();
      window.addEventListener("resize", reflow);
      window.addEventListener("scroll", reflow, true);
      return () => {
        window.removeEventListener("resize", reflow);
        window.removeEventListener("scroll", reflow, true);
      };
    }
  }, [open, place]);

  return (
    <div className={`filterbox ${open ? "open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        ref={trigRef}
        className="filter-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen(p => !p); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="조회 조건"
      >
        <span className="f-label">{filterLabel(value)}</span>
        <span className="f-caret" />
      </button>

      {open && ReactDOM.createPortal(
        <div className="filter-menu fixed" style={{ top: pos.top, left: pos.left, width: pos.width }} role="listbox">
          {FILTERS.map(opt => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={value === opt}
              className={`filter-item ${value === opt ? "selected" : ""}`}
              onClick={() => { onChange?.(opt); setOpen(false); }}
            >
              <span className="txt">{filterLabel(opt)}</span>
              {value === opt && <span className="check">✓</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

/* ===== 상단 계정/메뉴 (등록 · 달력 · 개인장부 · 로그아웃) ===== */
function TopKebabMenu({ onRegister, onCalendar, onLedger, onLogout }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const trigRef = useRef(null);
  const { pos, place } = usePortalMenuPosition();

  useEffect(() => {
    const onDocClick = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);
  useEffect(() => {
    const reflow = () => place(trigRef.current, 180);
    if (open) {
      reflow();
      window.addEventListener("resize", reflow);
      window.addEventListener("scroll", reflow, true);
      return () => {
        window.removeEventListener("resize", reflow);
        window.removeEventListener("scroll", reflow, true);
      };
    }
  }, [open, place]);

  return (
    <div className={`mo-topmenu ${open ? "open" : ""}`} ref={wrapRef}>
    <button
      type="button"
      ref={trigRef}
      className="mo-menu-trigger"
      onClick={(e) => { e.stopPropagation(); setOpen(p => !p); }}
      aria-haspopup="true"
      aria-expanded={open}
      aria-label="메뉴 열기"
      title="메뉴"
    >
      <span className="dots" />
    </button>

    {open && ReactDOM.createPortal(
      <div className="mo-menu-panel" style={{ top: pos.top, left: pos.left, width: pos.width }}>
        <button type="button" className="mo-menu-item" onClick={() => { setOpen(false); onRegister?.(); }}>
          <span className="mi mi-add" aria-hidden />
          <span>등록</span>
        </button>
        {/* ✅ 달력 */}
        <button type="button" className="mo-menu-item" onClick={() => { setOpen(false); onCalendar?.(); }}>
          <span className="mi mi-calendar" aria-hidden />
          <span>달력</span>
        </button>
        {/* ✅ 개인장부 (MobilePersonalLedgerPage) — 달력 아래에 배치 */}
        <button type="button" className="mo-menu-item" onClick={() => { setOpen(false); onLedger?.(); }}>
          <span className="mi mi-ledger" aria-hidden />
          <span>개인장부</span>
        </button>
        <button type="button" className="mo-menu-item" onClick={() => { setOpen(false); onLogout?.(); }}>
          <span className="mi mi-logout" aria-hidden />
          <span style={{ color: "#ef4444" }}>로그아웃</span>
        </button>
      </div>,
      document.body
    )}
  </div>
  );
}

/* ===== 문자 수신번호 후보 ===== */
/* ▶ 유틸: 값 → 전화번호 정규화(숫자/문자/숫자형 모두 OK), 선두 '+' 허용 */
function normalizePhone(v) {
  if (v == null) return "";
  const s = String(v);
  const hasPlus = /^\s*\+/.test(s);
  const digits = s.replace(/\D+/g, "");
  if (!digits) return "";
  return hasPlus ? ("+" + digits) : digits;
}

/* ▶ 유틸: 한국형 전화번호로 “그럴듯한지” 검증 (날짜/계좌 등 배제) */
function isLikelyKoreanPhone(p) {
  if (!p) return false;
  const digitsOnly = p.replace(/\D/g, "");
  // 일반적 길이: 9~12자리 (지역번호/휴대폰/내선 변형 포함)
  const lenOk = digitsOnly.length >= 9 && digitsOnly.length <= 12;
  const startOk = p.startsWith("+82") || p.startsWith("0");
  return lenOk && startOk;
}

/* ▶ 재귀 탐색: 객체/배열 어디든 'phone/tel/mobile' 계열 키 또는 문자열 속 번호를 찾음
   ⛔ 날짜/타임스탬프 등의 필드는 스킵 */
function findPhoneDeep(input, depth = 0, keyHint = "") {
  if (input == null || depth > 4) return "";

  // 숫자/문자 값 자체가 번호인 경우
  if (typeof input === "number" || typeof input === "string") {
    const s = String(input);
    // ISO 날짜 패턴이면 제외 (예: 2025-10-10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    // 타임스탬프 같은 8자리/14자리 등도 배제
    if (/^\d{8}(\d{6})?$/.test(s)) return "";

    const match = s.match(/(\+?\d[\d\s\-()]{6,}\d)/);
    const cand = match ? match[1] : s;
    const p = normalizePhone(cand);
    return isLikelyKoreanPhone(p) ? p : "";
  }

  // 배열: 각 요소 재귀
  if (Array.isArray(input)) {
    for (const item of input) {
      const p = findPhoneDeep(item, depth + 1);
      if (p) return p;
    }
    return "";
  }

  // 객체
  if (typeof input === "object") {
    const EXCLUDE_KEYS = new Set([
      "moveDate","moveOutDate","createdAt","updatedAt","created_at","updated_at",
      "date","ymd","ym","timestamp","ts"
    ]);

    const PRIORITY_KEYS = [
      "payerPhone", // ✅ PC가 저장하는 기본 키
      "smsPhone","recipientPhone","phone","phoneNumber","tel","telephone",
      "mobile","mobilePhone","tenantPhone","tenantTel",
      "contactPhone","contactTel","managerPhone","managerTel",
      "ownerPhone","landlordPhone","customerPhone",
    ];

    // 1) 우선키 직격
    for (const k of PRIORITY_KEYS) {
      if (k in input && input[k] != null) {
        const p = findPhoneDeep(input[k], depth + 1, k);
        if (p) return p;
      }
    }

    // 2) 'contact/tenant/manager/owner/landlord/customer/recipient' 루트
    const ROOTS = ["contact","tenant","manager","owner","landlord","customer","recipient"];
    const LEAFS = ["phone","tel","mobile","phoneNumber","mobilePhone"];
    for (const r of ROOTS) {
      const node = input[r];
      if (node && typeof node === "object") {
        for (const l of LEAFS) {
          if (node[l] != null) {
            const p = findPhoneDeep(node[l], depth + 1, `${r}.${l}`);
            if (p) return p;
          }
        }
        const pNode = findPhoneDeep(node, depth + 1, r);
        if (pNode) return pNode;
      }
    }

    // 3) contacts/phones/mobiles 배열 패턴
    const ARR_KEYS = ["contacts","phones","mobiles"];
    for (const ak of ARR_KEYS) {
      if (Array.isArray(input[ak])) {
        const p = findPhoneDeep(input[ak], depth + 1, ak);
        if (p) return p;
      }
    }

    // 4) 일반 문자열 필드(note/memo/remarks/description 등)에서 번호 추출
    const TEXT_KEYS = ["note","memo","remark","remarks","description","contact"];
    for (const tk of TEXT_KEYS) {
      if (input[tk] != null) {
        const p = findPhoneDeep(input[tk], depth + 1, tk);
        if (p) return p;
      }
    }

    // 5) 기타 키 전체 순회 (제외키는 스킵)
    for (const key of Object.keys(input)) {
      if (EXCLUDE_KEYS.has(key) || PRIORITY_KEYS.includes(key) || ROOTS.includes(key) || ARR_KEYS.includes(key) || TEXT_KEYS.includes(key)) continue;
      const p = findPhoneDeep(input[key], depth + 1, key);
      if (p) return p;
    }
  }

  return "";
}

/* ▶ 최종 엔트리 */
function pickSmsNumber(row) {
  return findPhoneDeep(row);
}

/* ✅ 복귀 시 위치·펼침 상태 복원용 키 */
const SS_KEY_ID = "mo.keepId";
const SS_KEY_SCROLL = "mo.scrollTop";

export default function MoveoutListMobile() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [keyword, setKeyword] = useState("");
  const [openId, setOpenId] = useState(null);

  const [centerOpen, setCenterOpen] = useState(false);
  const [centerType, setCenterType] = useState(null);
  const [centerRow, setCenterRow] = useState(null);
  const [photoIdx, setPhotoIdx] = useState(0);

  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptRow, setReceiptRow] = useState(null);

  const receiptRef = useRef(null);
  const PAGE_SIZE = 8;
  const [page, setPage] = useState(1);
  const listRef = useRef(null);

  /* ✅ 모바일 인증 가드 + 인증 후 구독 */
  useEffect(() => {
    let unsubFs = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        navigate("/login", { replace: true });
        if (unsubFs) { unsubFs(); unsubFs = null; }
        return;
      }
      const qy = query(collection(db, "moveouts"), orderBy("moveDate", "desc"));
      unsubFs = onSnapshot(
        qy,
        (snap) => {
          setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (err) => {
          console.error("moveouts subscribe error:", err);
        }
      );
    });

    return () => {
      if (unsubFs) unsubFs();
      if (typeof unsubAuth === "function") unsubAuth();
    };
  }, [navigate]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "ALL") list = list.filter(r => String(r.status || "") === statusFilter);
    if (keyword.trim()) {
      const k = keyword.trim();
      list = list.filter(r =>
        [r.moveDate, r.villaName, r.unitNumber, r.status, r.note]
          .map(x => String(x || ""))
          .some(s => s.includes(k))
      );
    }
    return list;
  }, [rows, statusFilter, keyword]);

  /* ===== 🔄 정렬: 오늘 → 어제 → 내일 → 모레 → 나머지(원래 순서) ===== */
  const displayRows = useMemo(() => {
    const today = new Date();
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);

    // 다양한 moveDate 형태(Date/Timestamp/ISO/문자열) 대응
    const dayDiff = (val) => {
      if (!val) return null;

      // Firestore Timestamp
      if (typeof val === "object" && typeof val.toDate === "function") {
        const d = val.toDate();
        const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        return Math.round((dd.getTime() - base.getTime()) / 86400000);
      }
      // Date
      if (val instanceof Date && !isNaN(val)) {
        const dd = new Date(val.getFullYear(), val.getMonth(), val.getDate(), 0, 0, 0, 0);
        return Math.round((dd.getTime() - base.getTime()) / 86400000);
      }
      // String (구분자 다양)
      const s = String(val).trim();
      const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
      if (!m) return null;
      const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
      if (!y || !mo || !d) return null;
      const dd = new Date(y, mo - 1, d, 0, 0, 0, 0);
      if (isNaN(dd)) return null;
      return Math.round((dd.getTime() - base.getTime()) / 86400000);
    };

    // 원본 순서는 Firestore orderBy("moveDate","desc") 결과이므로 유지
    const todayList   = [];
    const ydayList    = [];
    const tmrwList    = [];
    const dayAfterList= [];
    const rest        = [];

    for (const r of filtered) {
      const d = dayDiff(r.moveDate);
      if (d === 0)  { todayList.push(r);    continue; }
      if (d === -1) { ydayList.push(r);     continue; }
      if (d === 1)  { tmrwList.push(r);     continue; }
      if (d === 2)  { dayAfterList.push(r); continue; }
      rest.push(r); // 그 외는 원래 정렬 유지
    }

    return [...todayList, ...ydayList, ...tmrwList, ...dayAfterList, ...rest];
  }, [filtered]);

  useEffect(() => {
    setPage(1);
    setOpenId(null);
    listRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [statusFilter, keyword]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return displayRows.slice(start, start + PAGE_SIZE);
  }, [displayRows, page]);

  const scrollTopSmooth = () => {
    if (listRef.current) {
      try { listRef.current.scrollTo({ top: 0, behavior: "smooth" }); }
      catch { listRef.current.scrollTop = 0; }
    }
  };
  const goPrev = () => { if (page > 1) { setPage(p => p - 1); scrollTopSmooth(); } };
  const goNext = () => { if (page < totalPages) { setPage(p => p + 1); scrollTopSmooth(); } };

  /* ✅ 목록 위치/펼침 복원 도우미 */
  const restoredRef = useRef(false);
  const saveListScrollState = (rowId) => {
    try {
      if (rowId) sessionStorage.setItem(SS_KEY_ID, rowId);
      if (listRef.current) sessionStorage.setItem(SS_KEY_SCROLL, String(listRef.current.scrollTop || 0));
    } catch {}
  };
  const clearListScrollState = () => {
    try {
      sessionStorage.removeItem(SS_KEY_ID);
      sessionStorage.removeItem(SS_KEY_SCROLL);
    } catch {}
  };

  // 🔁 rows/filter/paging 계산 완료 후 1회만 복원
  useEffect(() => {
    if (restoredRef.current) return;
    const keepId = sessionStorage.getItem(SS_KEY_ID);
    if (!keepId || displayRows.length === 0) return;

    const idx = displayRows.findIndex(r => r.id === keepId);
    if (idx === -1) {
      clearListScrollState();
      restoredRef.current = true;
      return;
    }

    const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
    if (page !== targetPage) {
      setPage(targetPage);
      return; // 페이지 세팅 후 다음 렌더에서 이어서 처리
    }

    // 페이지가 맞으면 펼치고 스크롤 복원
    setOpenId(keepId);
    const saved = Number(sessionStorage.getItem(SS_KEY_SCROLL) || NaN);
    setTimeout(() => {
      try {
        if (Number.isFinite(saved) && listRef.current) {
          listRef.current.scrollTo({ top: saved, behavior: "auto" });
        } else if (listRef.current) {
          const el = listRef.current.querySelector(`.card[data-id="${keepId}"]`);
          if (el) {
            const relTop = el.offsetTop - 8;
            listRef.current.scrollTo({ top: relTop, behavior: "auto" });
          }
        }
      } catch {}
      restoredRef.current = true;
      clearListScrollState();
    }, 0);
  }, [displayRows, page, PAGE_SIZE]);

  const handleAdd = () => navigate("/mobile/form");

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login", { replace: true });
    } catch (e) {
      console.error(e);
      alert("로그아웃 중 오류가 발생했습니다.");
    }
  };

  const handleEdit = (row) => {
    // ✅ 복귀용 상태 저장(카드ID + 스크롤)
    saveListScrollState(row?.id);
    navigate(`/mobile/form?id=${row.id}`);
  };

  const handleDeleteRow = async (row) => {
    if (!row?.id) return;
    if (!window.confirm("해당 이사정산 내역을 삭제할까요?")) return;
    await deleteDoc(doc(db, "moveouts", row.id));
  };
  const toggleOpen = (id) => setOpenId(p => p === id ? null : id);

  const updateStatus = async (row, s) => {
    try { await updateDoc(doc(db,"moveouts",row.id), { status: s }); }
    catch(e){ console.error(e); alert("진행현황 변경 중 오류가 발생했습니다."); }
  };

  const [centerRowStateHack, setCenterRowStateHack] = useState(0); // 원본 유지
  const openCenter = (row, type) => { setCenterRow(row); setCenterType(type); setPhotoIdx(0); setCenterOpen(true); setCenterRowStateHack(x=>x+1); };
  const openReceiptModal = (row) => { setReceiptRow(row); setReceiptModalOpen(true); };
  const closeReceiptModal = () => { setReceiptRow(null); setReceiptModalOpen(false); };

  const buildBase = (r) =>
    `${String(r.moveDate||"").replace(/-/g,"")}${String(r.villaName||"")}${String(r.unitNumber||"")}`
      .replace(/[\\/:*?"<>|]/g,"");

  /** ReceiptTemplate 캡쳐: 렌더 한 프레임 대기 후 캡쳐 */
  const ensureReceiptDataUrl = async () => {
    const node = receiptRef.current;
    if (!node) throw new Error("Receipt not ready");
    await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
    return htmlToImage.toJpeg(node, { backgroundColor:"#fff", quality:0.95, pixelRatio:2 });
  };

  const dataURLToBlob = (d) => {
    const [h,b]=d.split(","); const m=h.match(/:(.*?);/)[1];
    const bin=atob(b); const u8=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
    return new Blob([u8],{type:m});
  };

  /* ===== 저장: 갤러리 저장 ===== */
  const saveReceipt = async () => {
    try {
      const baseName = buildBase(receiptRow);
      const dataUrl = await ensureReceiptDataUrl();

      if (isHybrid()) {
        await saveReceiptToGalleryHybrid(dataUrl, baseName);
        alert("갤러리(HannamReceipts)에 저장되었습니다.");
      } else {
        const a = document.createElement("a");
        a.href = dataUrl; a.download = `${baseName}.jpg`; a.click();
      }
    } catch(e){
      console.error(e);
      alert("영수증 저장 중 오류가 발생했습니다.");
    } finally {
      closeReceiptModal();
    }
  };

  /* ===== 전송: 갤러리 저장 + 캐시에 전송본 저장 + 문자앱 열기 ===== */
  const shareReceipt = async () => {
    try {
      const to = pickSmsNumber(receiptRow);
      if (!to) {
        alert("수신 번호를 찾을 수 없습니다. 연락처를 먼저 등록해주세요.");
        return;
      }

      const baseName = buildBase(receiptRow);
      const dataUrl = await ensureReceiptDataUrl();

      if (isHybrid()) {
        await saveReceiptToGalleryHybrid(dataUrl, baseName);
        const { fileUriNative } = await saveReceiptForMmsHybrid(dataUrl, baseName);
        try {
          await openMmsComposer({ phone: to, fileUriNative, mimeType: "image/jpeg" });
        } catch (err) {
          console.error("MmsComposer failed:", err);
          window.location.href = `sms:${to}`;
        }
      } else {
        const file = new File([dataURLToBlob(dataUrl)], `${baseName}.jpg`, { type:"image/jpeg" });
        if (navigator.canShare && navigator.canShare({ files:[file] })) {
          await navigator.share({ files:[file], title: "" });
        } else if (navigator.share) {
          await navigator.share({ title: "" });
        } else {
          const w = window.open(dataUrl, "_blank");
          if (!w) alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.");
        }
      }
    } catch (e) {
      console.error(e);
      alert("영수증 전송 중 오류가 발생했습니다.");
    } finally {
      closeReceiptModal();
    }
  };

  return (
    <div className="mo-page">
      {/* 상단 */}
      <div className="mo-topbar">
        <PageTitle>이사정산 조회</PageTitle>
        <TopKebabMenu
          onRegister={handleAdd}
          onCalendar={() => navigate("/calendar-mobile")}
          onLedger={() => navigate("/mobile/personal-ledger")}
          onLogout={handleLogout}
        />
      </div>

      {/* 필터 */}
      <div className="mo-filters">
        <FilterSelect value={statusFilter} onChange={setStatusFilter} />
        <input
          className="search search--purple"
          placeholder="검색어 입력"
          value={keyword}
          onChange={(e)=>setKeyword(e.target.value)}
        />
      </div>

      {/* 리스트 */}
      <div className="card-list" ref={listRef}>
        {pagedRows.map((row) => {
          const opened = openId === row.id;
          const hasNote = String(row.note || "").trim().length > 0;
          const hasPhotos = Array.isArray(row.photos) && row.photos.filter(Boolean).length > 0;

          return (
            <div className={`card ${opened ? "opened" : ""}`} key={row.id} data-id={row.id}>
              <div className="card-head" onClick={()=>toggleOpen(row.id)}>
                <div className="head-line">
                  <div className="head-left"><span className="emoji">📅</span><span className="date">{row.moveDate || "-"}</span></div>
                  <div className="head-right" onClick={(e)=>e.stopPropagation()}>
                    <StatusSelect value={row.status || "정산대기"} onChange={(s)=>updateStatus(row,s)} />
                  </div>
                </div>
                <div className="head-3col">
                  <div className="h-left ellipsis" title={row.villaName || ""}>🏢 {row.villaName || "-"}</div>
                  <div className="h-center unit-chip unit-narrow" title={row.unitNumber || ""}>{row.unitNumber || "-"}</div>
                  <div className="h-right total">💰 {fmtAmount(row.totalAmount)}원</div>
                </div>
              </div>

              {opened && (
                <div className="card-body">
                  <div className="amounts-stack">
                    <div className="a-item"><div className="a-label ellipsis">미납관리비</div><div className="a-value ellipsis">{fmtAmount(row.arrears)}원</div></div>
                    <div className="a-item"><div className="a-label ellipsis">당월관리비</div><div className="a-value ellipsis">{fmtAmount(row.currentMonth)}원</div></div>
                    <div className="a-item"><div className="a-label ellipsis">수도요금</div><div className="a-value ellipsis">{fmtAmount(row.waterFee)}원</div></div>
                    <div className="a-item"><div className="a-label ellipsis">전기요금</div><div className="a-value ellipsis">{fmtAmount(row.electricity)}원</div></div>
                    <div className="a-item"><div className="a-label ellipsis">TV수신료</div><div className="a-value ellipsis">{fmtAmount(row.tvFee)}원</div></div>
                    <div className="a-item"><div className="a-label ellipsis">청소비용</div><div className="a-value ellipsis">{fmtAmount(row.cleaningFee)}원</div></div>
                  </div>

                  {(() => {
                    const extrasArr = Array.isArray(row.extras) ? row.extras : null;
                    const hasPair = String(row.extraItems || "").trim().length > 0 && toNum(row.extraAmount) > 0;
                    if (!(extrasArr?.length || hasPair)) return null;
                    return (
                      <div className="extras-inline">
                        <div className="extras-title">🧾 추가내역</div>
                        <div className="extras-grid">
                          {extrasArr?.length ? (
                            extrasArr.map((e,i)=>(
                              <div key={i} className="x-item">
                                <div className="x-label ellipsis" title={e.desc}>{e.desc}</div>
                                <div className="x-value ellipsis">{fmtAmount(e.amount)}원</div>
                              </div>
                            ))
                          ) : (
                            <div className="x-item">
                              <div className="x-label ellipsis" title={row.extraItems || ""}>{String(row.extraItems || "").trim() || "-"}</div>
                              <div className="x-value ellipsis">{fmtAmount(row.extraAmount)}원</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="actions-fixed">
                    <div className="act-row top">
                      <button
                        className={`i-btn note ${hasNote ? "" : "disabled"}`}
                        onClick={() => hasNote && (setCenterRow(row), setCenterType("note"), setPhotoIdx(0), setCenterOpen(true))}
                        disabled={!hasNote}
                        title={hasNote ? "비고 보기" : "비고 없음"}
                      >
                        <span className="i">📝</span><span className="t">{hasNote ? "내용있음" : "내용없음"}</span>
                      </button>
                      <button
                        className={`i-btn photos ${hasPhotos ? "" : "disabled"}`}
                        onClick={() => hasPhotos && (setCenterRow(row), setCenterType("photos"), setPhotoIdx(0), setCenterOpen(true))}
                        disabled={!hasPhotos}
                        title={hasPhotos ? "사진 보기" : "사진 없음"}
                      >
                        <span className="i">🖼️</span><span className="t">{hasPhotos ? "사진있음" : "사진없음"}</span>
                      </button>
                      <button className="i-btn receipt" onClick={() => openReceiptModal(row)} title="영수증 저장/전송">
                        <span className="i">🧾</span><span className="t">영수증</span>
                      </button>
                    </div>

                    <div className="act-row bottom">
                      <button className="pill-btn" onClick={() => handleEdit(row)}>수정</button>
                      <button className="pill-btn danger" onClick={() => handleDeleteRow(row)}>삭제</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 하단 페이지네이션 */}
      <div className="mo-pager">
        <button
          className="pager-btn"
          onClick={goPrev}
          disabled={page <= 1}
          aria-label="이전 페이지"
          title="이전"
        >
          <span className="pager-ico pager-left" aria-hidden />
          이전
        </button>

        <div className="pager-status" aria-live="polite" aria-atomic="true">
          {page} / {totalPages}
        </div>

        <button
          className="pager-btn"
          onClick={goNext}
          disabled={page >= totalPages}
          aria-label="다음 페이지"
          title="다음"
        >
          다음
          <span className="pager-ico pager-right" aria-hidden />
        </button>
      </div>

      {/* 비고/사진 모달 */}
      {centerOpen && centerRow && (
        <div className="overlay center" onClick={()=>setCenterOpen(false)}>
          <div className="modal" onClick={(e)=>e.stopPropagation()}>
            {centerType === "note" && (
              <div className="note" style={{ whiteSpace:"pre-wrap", lineHeight:1.6 }}>{centerRow.note}</div>
            )}
            {centerType === "photos" && (
              <div className="photos">
                {Array.isArray(centerRow.photos) && centerRow.photos.filter(Boolean).length > 0 ? (
                  <>
                    <img src={centerRow.photos[photoIdx]} alt="사진" className="photo" />
                    <button type="button" onClick={()=>setPhotoIdx(p=>(p-1+centerRow.photos.length)%centerRow.photos.length)} className="nav left" aria-label="이전">‹</button>
                    <button type="button" onClick={()=>setPhotoIdx(p=>(p+1)%centerRow.photos.length)} className="nav right" aria-label="다음">›</button>
                    <div className="pager">{photoIdx+1} / {centerRow.photos.length}</div>
                  </>
                ) : <div>사진 없음</div>}
              </div>
            )}
            <div className="actions center" style={{ display:"flex", justifyContent:"center", marginTop:16 }}>
              <button className="pill-btn danger" onClick={()=>setCenterOpen(false)} style={{ fontSize:14, padding:"10px 14px", borderRadius:10 }} aria-label="닫기">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 영수증 모달 */}
      {receiptModalOpen && receiptRow && (
        <div className="overlay center" onClick={closeReceiptModal}>
          <div className="modal" onClick={(e)=>e.stopPropagation()}>
            <div className="actions center receipt-actions" style={{ display:"flex", flexDirection:"column", gap:14, padding:"24px 20px" }}>
              <button className="pill-btn" onClick={saveReceipt} style={{ fontSize:16, fontWeight:700, padding:"16px 18px", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }} aria-label="영수증 저장">
                <span role="img" aria-hidden="true">💾</span>
                <span>영수증저장</span>
              </button>
              <button className="pill-btn light" onClick={shareReceipt} style={{ fontSize:16, fontWeight:700, padding:"16px 18px", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }} aria-label="영수증 전송">
                <span role="img" aria-hidden="true">📤</span>
                <span>영수증전송</span>
              </button>
              <button className="pill-btn danger" onClick={closeReceiptModal} style={{ fontSize:14, padding:"10px 14px", borderRadius:10, marginTop:2 }} aria-label="닫기">닫기</button>
            </div>

            {/* 오프스크린 캡처 타깃 */}
            <div style={{ position:"absolute", left:-99999, top:-99999 }}>
              <div id="receipt-capture" ref={receiptRef}>
                <ReceiptTemplate
                  item={{
                    moveOutDate: receiptRow.moveDate || "",
                    name: receiptRow.villaName || "",
                    roomNumber: receiptRow.unitNumber || "",
                    arrears: toNum(receiptRow.arrears),
                    currentFee: toNum(receiptRow.currentMonth),
                    waterCost: toNum(receiptRow.waterFee),
                    electricity: toNum(receiptRow.electricity),
                    tvFee: toNum(receiptRow.tvFee),
                    cleaning: toNum(receiptRow.cleaningFee),
                    defects: (Array.isArray(receiptRow.extras) ? receiptRow.extras : []).map((e) => ({ desc: e.desc, amount: toNum(e.amount) })),
                    total: toNum(receiptRow.arrears)+toNum(receiptRow.currentMonth)+toNum(receiptRow.waterFee)+toNum(receiptRow.electricity)+toNum(receiptRow.tvFee)+toNum(receiptRow.cleaningFee)+(
                      Array.isArray(receiptRow.extras) ? sumExtrasFromArray(receiptRow.extras) : toNum(receiptRow.extraAmount)
                    ),
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
