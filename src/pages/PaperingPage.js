// src/pages/PaperingPage.js
import React, { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import PageTitle from "../components/PageTitle";

/* ✅ 날짜 선택용 */
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";

/* ✅ 스타일 */
import "./PaperingPage.css";

/* ===== 유틸 ===== */
const s = (v) => String(v ?? "").trim();
const parseNumber = (v) =>
  parseInt(String(v ?? "").replace(/[^0-9\-]/g, ""), 10) || 0;
const fmtComma = (n) => {
  const num = parseNumber(n);
  return num === 0 ? "" : num.toLocaleString();
};
const fmtDate = (v) => {
  if (!v) return "";
  try {
    if (typeof v?.toDate === "function") {
      const d = v.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
    if (v instanceof Date) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, "0");
      const dd = String(v.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
    return s(v);
  } catch {
    return s(v);
  }
};
const strToDate = (str) => {
  const v = s(str);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [yy, mm, dd] = v.split("-").map((x) => parseInt(x, 10));
  const d = new Date(yy, mm - 1, dd);
  return isNaN(d.getTime()) ? null : d;
};
/* yyyy-MM-dd → 20250909 같은 정렬용 숫자 */
const dateToNum = (v) => {
  const d = strToDate(v);
  if (!d) return 0;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return parseInt(`${y}${m}${dd}`, 10);
};

/* ===== '도배/벽지' 판별 & 합계 =====
   ✅ 수정된 부분: 적는 사람마다 "도배", "도배비", "도배비용", "벽지", "벽지비용" 등
   다르게 적더라도 모두 도배 관련 항목으로 인식하도록 키워드 목록 방식으로 변경.
   나중에 다른 표현이 추가로 발견되면 PAPERING_KEYWORDS 배열에만 단어를 추가하면 됩니다. */
const PAPERING_KEYWORDS = ["도배", "벽지"];

const isPaperingDesc = (desc) => {
  const t = s(desc).replace(/\s+/g, "");
  return PAPERING_KEYWORDS.some((kw) => t.includes(kw));
};
const sumPaperingAmount = (extras) => {
  if (!Array.isArray(extras)) return 0;
  return extras.reduce((acc, it) => {
    if (isPaperingDesc(it?.desc)) {
      const amt = parseNumber(it?.amount);
      return acc + (amt || 0);
    }
    return acc;
  }, 0);
};

/* ===== 진행현황 색상/배지 (도배 전용) ===== */
const statusMeta = (status) => {
  switch (status) {
    case "미접수":
      return { dot: "#EF4444", icon: "🔴" };
    case "접수완료":
      return { dot: "#F59E0B", icon: "🟡" };
    case "도배완료":
      return { dot: "#10B981", icon: "🟢" };
    case "도배보류":
      return { dot: "#9CA3AF", icon: "⚪" };
    default:
      return { dot: "#9CA3AF", icon: "⚪" };
  }
};
const StatusCell = ({ value }) => {
  const v = String(value || "미접수").trim();
  const { dot, icon } = statusMeta(v);
  return (
    <span className="mic-status-cell">
      <span
        aria-hidden
        className="mic-status-dot"
        style={{ backgroundColor: dot }}
      />
      <span className="mic-status-icon">{icon}</span>
      {v}
    </span>
  );
};

/* ===== 인라인 DatePicker용 커스텀 인풋 ===== */
/* ✅ 빈칸일 때는 버튼처럼, 값 있을 때는 테두리 없이 텍스트만 보이도록 */
const InlineDateInput = forwardRef(
  ({ value, className = "", ...rest }, ref) => {
    const hasValue = !!value;
    const composedClassName = [
      "mic-table-input",
      "mic-table-input-date-inline",
      hasValue ? "mic-table-input-date-inline--has-value" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        type="button"
        ref={ref}
        className={composedClassName}
        {...rest}
      >
        {value || ""}
      </button>
    );
  }
);

/* ===== 모달 ===== */
function SimpleModal({
  open,
  title,
  children,
  onClose,
  size = "lg", // 'lg' | 'sm'
  headerRight = null,
}) {
  if (!open) return null;
  const panelClass =
    size === "sm" ? "mic-modal-panel mic-modal-panel--sm" : "mic-modal-panel";
  return (
    <div className="mic-modal-overlay">
      <div className="mic-modal-backdrop" onClick={onClose} />
      <div className={panelClass}>
        <div className="mic-modal-header">
          <h3 className="mic-modal-title">{title}</h3>
          <div className="mic-modal-header-right">{headerRight}</div>
        </div>
        <div className="mic-modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ===== 등록 폼 (새로 등록만 사용) ===== */
function EditForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState(() => ({
    id: initial?.id ?? "",
    settleDate: fmtDate(initial?.settleDate) || "",
    receivedDate: fmtDate(initial?.receivedDate) || "",
    villaName: s(initial?.villaName) || "",
    unitNumber: s(initial?.unitNumber) || "",
    depositIn: fmtComma(initial?.depositIn) || "",
    payoutOut: fmtComma(initial?.payoutOut) || "",
    depositor: s(initial?.depositor) || "",
    vendor: s(initial?.vendor) || "",
    status: s(initial?.status) || "미접수",
    note: s(initial?.note) || "",
    sourceMoveoutId: s(initial?.sourceMoveoutId) || "",
  }));

  const linked = !!form.sourceMoveoutId;

  const [depositorOptions, setDepositorOptions] = useState([]);
  const [vendorOptions, setVendorOptions] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const depositorSnap = await getDoc(doc(db, "serviceSettings", "입금자"));
        const vendorSnap = await getDoc(doc(db, "serviceSettings", "거래처"));
        const depositorArr = Array.isArray(depositorSnap.data()?.items)
          ? depositorSnap.data().items.filter((x) => s(x) !== "")
          : [];
        const vendorArr = Array.isArray(vendorSnap.data()?.items)
          ? vendorSnap.data().items.filter((x) => s(x) !== "")
          : [];
        setDepositorOptions(depositorArr);
        setVendorOptions(vendorArr);
      } catch (e) {
        console.error("serviceSettings 불러오기 오류:", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (form.depositor && !depositorOptions.includes(form.depositor)) {
      setDepositorOptions((prev) => [...prev, form.depositor]);
    }
  }, [form.depositor, depositorOptions]);
  useEffect(() => {
    if (form.vendor && !vendorOptions.includes(form.vendor)) {
      setVendorOptions((prev) => [...prev, form.vendor]);
    }
  }, [form.vendor, vendorOptions]);

  const villaRef = useRef(null);
  const unitRef = useRef(null);
  const depositRef = useRef(null);
  const payoutRef = useRef(null);

  const handleChange = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const handleAmount = (key, val) =>
    handleChange(key, fmtComma(parseNumber(val)));

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      settleDate: s(form.settleDate),
      receivedDate: s(form.receivedDate),
      villaName: s(form.villaName),
      unitNumber: s(form.unitNumber),
      depositIn: parseNumber(form.depositIn),
      payoutOut: parseNumber(form.payoutOut),
      depositor: s(form.depositor),
      vendor: s(form.vendor),
      status: s(form.status),
      note: s(form.note),
      updatedAt: serverTimestamp(),
    };

    try {
      if (form.id) {
        await updateDoc(doc(db, "paperings", form.id), payload);
      } else {
        await addDoc(collection(db, "paperings"), {
          ...payload,
          createdAt: serverTimestamp(),
          sourceMoveoutId: "",
        });
      }
      onSaved?.();
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  const enterTo = (e, nextRef) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nextRef?.current?.focus();
    }
  };

  const dateInputClass = "mic-input mic-input-date";

  const ro = {
    readOnly: true,
    className: "mic-input mic-input-text mic-input-readonly",
  };
  const roDp = { disabled: true };

  return (
    <form onSubmit={handleSubmit} className="mic-form">
      {/* 1) 정산날짜 · 접수날짜 */}
      <div className="mic-form-row">
        <div className="mic-form-field">
          <label className="mic-form-label">정산날짜</label>
          <DatePicker
            locale={ko}
            dateFormat="yyyy-MM-dd"
            selected={strToDate(form.settleDate)}
            onChange={(d) => handleChange("settleDate", d ? fmtDate(d) : "")}
            className={dateInputClass}
            calendarClassName="!text-sm"
            isClearable
            onKeyDown={(e) => {
              if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                handleChange("settleDate", "");
              }
            }}
            {...(linked ? roDp : {})}
          />
        </div>
        <div className="mic-form-field">
          <label className="mic-form-label">접수날짜</label>
          <DatePicker
            locale={ko}
            dateFormat="yyyy-MM-dd"
            selected={strToDate(form.receivedDate)}
            onChange={(d) =>
              handleChange("receivedDate", d ? fmtDate(d) : "")
            }
            className={dateInputClass}
            calendarClassName="!text-sm"
            isClearable
            onKeyDown={(e) => {
              if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                handleChange("receivedDate", "");
              }
            }}
          />
        </div>
      </div>

      {/* 2) 빌라명 · 호수 */}
      <div className="mic-form-row">
        <div className="mic-form-field">
          <label className="mic-form-label">빌라명</label>
          <input
            ref={villaRef}
            type="text"
            value={form.villaName}
            onChange={(e) => handleChange("villaName", e.target.value)}
            onKeyDown={(e) => enterTo(e, unitRef)}
            className="mic-input mic-input-text"
            {...(linked ? ro : {})}
          />
        </div>
        <div className="mic-form-field">
          <label className="mic-form-label">호수</label>
          <input
            ref={unitRef}
            type="text"
            value={form.unitNumber}
            onChange={(e) => handleChange("unitNumber", e.target.value)}
            onKeyDown={(e) => enterTo(e, depositRef)}
            className="mic-input mic-input-text"
            {...(linked ? ro : {})}
          />
        </div>
      </div>

      {/* 3) 입금금액 · 출금금액 */}
      <div className="mic-form-row">
        <div className="mic-form-field">
          <label className="mic-form-label">입금금액</label>
          <input
            ref={depositRef}
            type="text"
            placeholder="0"
            value={form.depositIn}
            onChange={(e) => handleAmount("depositIn", e.target.value)}
            onKeyDown={(e) => enterTo(e, payoutRef)}
            className="mic-input mic-input-number"
            {...(linked ? ro : {})}
          />
        </div>
        <div className="mic-form-field">
          <label className="mic-form-label">출금금액</label>
          <input
            ref={payoutRef}
            type="text"
            placeholder="0"
            value={form.payoutOut}
            onChange={(e) => handleAmount("payoutOut", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            className="mic-input mic-input-number"
          />
        </div>
      </div>

      {/* 4) 입금자 · 거래처 */}
      <div className="mic-form-row">
        <div className="mic-form-field">
          <label className="mic-form-label">입금자</label>
          <select
            value={form.depositor}
            onChange={(e) => handleChange("depositor", e.target.value)}
            className="mic-input mic-input-select"
          >
            <option value="">선택</option>
            {depositorOptions.map((opt, i) => (
              <option key={`${opt}-${i}`} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="mic-form-field">
          <label className="mic-form-label">거래처</label>
          <select
            value={form.vendor}
            onChange={(e) => handleChange("vendor", e.target.value)}
            className="mic-input mic-input-select"
          >
            <option value="">선택</option>
            {vendorOptions.map((opt, i) => (
              <option key={`${opt}-${i}`} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 5) 진행현황 · 비고 (도배 상태값) */}
      <div className="mic-form-row">
        <div className="mic-form-field">
          <label className="mic-form-label">진행현황</label>
          <select
            value={form.status}
            onChange={(e) => handleChange("status", e.target.value)}
            className="mic-input mic-input-select"
          >
            <option value="미접수">🔴 미접수</option>
            <option value="접수완료">🟡 접수완료</option>
            <option value="도배완료">🟢 도배완료</option>
            <option value="도배보류">⚪ 도배보류</option>
          </select>
        </div>
        <div className="mic-form-field">
          <label className="mic-form-label">비고</label>
          <input
            type="text"
            value={form.note}
            onChange={(e) => handleChange("note", e.target.value)}
            className="mic-input mic-input-text"
          />
        </div>
      </div>

      {/* 버튼: 저장/닫기 */}
      <div className="mic-form-actions">
        <button type="submit" className="mic-btn mic-btn-primary">
          저장
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="mic-btn mic-btn-ghost"
        >
          닫기
        </button>
      </div>
    </form>
  );
}

/* ===== 메인 페이지 ===== */
export default function PaperingPage() {
  const [rows, setRows] = useState([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchText, setSearchText] = useState("");

  const [sumOpen, setSumOpen] = useState(false);
  const [sumYear, setSumYear] = useState("");
  const [sumMonth, setSumMonth] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [depositorOptions, setDepositorOptions] = useState([]);
  const [vendorOptions, setVendorOptions] = useState([]);

  const cellRefs = useRef({});
  const initializedPageRef = useRef(false);
  const editingCellRef = useRef(null);

  // 🔽 정렬 상태
  const [sortState, setSortState] = useState({
    key: "settleDate",
    dir: "asc",
  });
  const { key: sortKey, dir: sortDir } = sortState;

  const setCellRef = (rowId, key, el) => {
    const k = `${rowId}:${key}`;
    if (el) cellRefs.current[k] = el;
    else delete cellRefs.current[k];
  };

  const editableKeys = [
    "receivedDate",
    "completedDate", // ✅ 완료날짜도 인라인 편집/네비 대상
    "villaName",
    "unitNumber",
    "depositIn",
    "payoutOut",
    "depositor",
    "vendor",
    "status",
    "note",
  ];

  /* 인라인 select용 옵션도 미리 불러오기 (MoveInCleaning과 동일 구조) */
  useEffect(() => {
    (async () => {
      try {
        const depositorSnap = await getDoc(doc(db, "serviceSettings", "입금자"));
        const vendorSnap = await getDoc(doc(db, "serviceSettings", "거래처"));
        const depositorArr = Array.isArray(depositorSnap.data()?.items)
          ? depositorSnap.data().items.filter((x) => s(x) !== "")
          : [];
        const vendorArr = Array.isArray(vendorSnap.data()?.items)
          ? vendorSnap.data().items.filter((x) => s(x) !== "")
          : [];
        setDepositorOptions(depositorArr);
        setVendorOptions(vendorArr);
      } catch (e) {
        console.error("serviceSettings(인라인) 불러오기 오류:", e);
      }
    })();
  }, []);

  /* 🔁 A. paperings 목록 구독 */
  useEffect(() => {
    const qy = query(
      collection(db, "paperings"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRows((prev) => {
          const prevMap = new Map(prev.map((r) => [r.id, r]));

          const list = snap.docs.map((d) => {
            const x = d.data() || {};
            const deposit = parseNumber(x.depositIn);
            const payout = parseNumber(x.payoutOut);

            const settle = fmtDate(x.settleDate);
            const ym = /^\d{4}-\d{2}-\d{2}$/.test(settle)
              ? settle.slice(0, 7)
              : "";

            return {
              id: d.id,
              settleDate: settle,
              receivedDate: fmtDate(x.receivedDate),
              villaName: s(x.villaName),
              unitNumber: s(x.unitNumber),
              depositIn: fmtComma(deposit),
              payoutOut: fmtComma(payout),
              diff: fmtComma(deposit - payout),
              depositor: s(x.depositor),
              vendor: s(x.vendor),
              status: s(x.status),
              completedDate: fmtDate(x.completedDate), // ✅ 완료날짜
              note: s(x.note),
              sourceMoveoutId: s(x.sourceMoveoutId || ""),
              __depositNum: deposit,
              __payoutNum: payout,
              __settleYm: ym,
              __settleNum: dateToNum(settle),
            };
          });

          // 인라인 편집 중인 셀 보호
          const editing = editingCellRef.current;
          if (editing && editing.rowId && editing.key) {
            const idx = list.findIndex((r) => r.id === editing.rowId);
            const prevRow = prevMap.get(editing.rowId);
            if (idx >= 0 && prevRow) {
              const key = editing.key;
              const updated = { ...list[idx] };
              updated[key] = prevRow[key];

              if (key === "depositIn") {
                updated.__depositNum = prevRow.__depositNum;
                updated.diff = prevRow.diff;
              } else if (key === "payoutOut") {
                updated.__payoutNum = prevRow.__payoutNum;
                updated.diff = prevRow.diff;
              }
              list[idx] = updated;
            }
          }

          return list;
        });
      },
      (err) => {
        console.error("[paperings listen error]", err);
        alert("도배 목록 조회 중 오류가 발생했습니다.\n콘솔을 확인하세요.");
      }
    );
    return () => unsub();
  }, []);

  /* 🔁 B. 이사정산 → 도배 자동 동기화 */
  useEffect(() => {
    const moQ = collection(db, "moveouts");
    const unsub = onSnapshot(
      moQ,
      async (snap) => {
        for (const d of snap.docs) {
          try {
            const x = d.data() || {};
            const extras = Array.isArray(x.extras) ? x.extras : [];
            const amountSum = sumPaperingAmount(extras);
            const moStatus = s(x.status);

            const ref = doc(db, "paperings", `mo_${d.id}`);
            const prev = await getDoc(ref);
            const exists = prev.exists();

            if (amountSum > 0) {
              const payload = {
                sourceMoveoutId: d.id,
                settleDate: fmtDate(x.moveDate),
                villaName: s(x.villaName),
                unitNumber: s(x.unitNumber),
                // 정산완료일 때만 자동 입금 반영
                depositIn: moStatus === "정산완료" ? amountSum : 0,
                // 상태/비고는 유지
                status: s(prev.data()?.status) || "미접수",
                note: s(prev.data()?.note) || "",
                updatedAt: serverTimestamp(),
              };
              if (!exists) payload.createdAt = serverTimestamp();

              await setDoc(ref, payload, { merge: true });
            } else {
              // 도배 항목 없으면 삭제
              if (exists) await deleteDoc(ref);
            }
          } catch (e) {
            console.error("moveouts → paperings 동기화 오류:", e);
          }
        }
      },
      (err) => {
        console.error("[moveouts listen error]", err);
      }
    );
    return () => unsub();
  }, []);

  /* 연/월 옵션 (차액 모달용) */
  const yearOptions = useMemo(() => {
    const years = new Set();
    rows.forEach((r) => {
      if (r.__settleYm) years.add(r.__settleYm.slice(0, 4));
    });
    const arr = Array.from(years).sort((a, b) => b.localeCompare(a));
    return arr.length ? arr : [String(new Date().getFullYear())];
  }, [rows]);

  useEffect(() => {
    if (!sumYear && yearOptions.length) setSumYear(yearOptions[0]);
  }, [yearOptions, sumYear]);

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")),
    []
  );

  useEffect(() => {
    if (!sumMonth) {
      const m = String(new Date().getMonth() + 1).padStart(2, "0");
      setSumMonth(m);
    }
  }, [sumMonth]);

  /* 검색 + 상태 필터 적용 */
  const searchableKeys = [
    "receivedDate",
    "completedDate",
    "villaName",
    "unitNumber",
    "depositIn",
    "payoutOut",
    "depositor",
    "vendor",
    "note",
  ];

  const filteredRows = useMemo(() => {
    let base = rows;
    if (statusFilter !== "ALL") {
      base = base.filter((r) => String(r.status || "") === statusFilter);
    }
    const qRaw = s(searchText);
    const q = qRaw.toLowerCase();
    const isNumQuery = /^\d+$/.test(qRaw);

    if (!qRaw) return base;

    return base.filter((r) =>
      searchableKeys.some((key) => {
        const v = r[key];
        if (v == null || v === "") return false;
        const str = String(v);

        if (key === "depositIn" || key === "payoutOut") {
          if (!isNumQuery) {
            return str.toLowerCase().includes(q);
          }
          const plain = str.replace(/[^\d]/g, "");
          return plain.includes(qRaw);
        }

        return str.toLowerCase().includes(q);
      })
    );
  }, [rows, statusFilter, searchText]);

  /* 정렬용 값 */
  const getSortValue = (row, key) => {
    switch (key) {
      case "settleDate":
        return row.__settleNum || 0;
      case "receivedDate":
        return dateToNum(row.receivedDate);
      case "completedDate":
        return dateToNum(row.completedDate);
      case "depositIn":
        return row.__depositNum || 0;
      case "payoutOut":
        return row.__payoutNum || 0;
      case "diff":
        return parseNumber(row.diff);
      default:
        return String(row[key] ?? "");
    }
  };

  /* 정렬 */
  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    return list.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);

      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        const sa = String(va);
        const sb = String(vb);
        cmp = sa.localeCompare(sb, "ko", { numeric: true });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortKey, sortDir]);

  /* 헤더 클릭 시 정렬 토글 */
  const handleSort = (key) => {
    setSortState((prev) => {
      if (prev.key === key) {
        return {
          key,
          dir: prev.dir === "asc" ? "desc" : "asc",
        };
      }
      return {
        key,
        dir: "asc",
      };
    });
  };

  /* 최초 진입 시 오늘과 가까운 정산날짜 페이지로 이동 (MoveInCleaning과 동일) */
  useEffect(() => {
    if (initializedPageRef.current) return;
    if (!sortedRows.length) return;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const todayNum = dateToNum(todayStr);

    let closestIdx = -1;
    let minDiff = Infinity;

    sortedRows.forEach((r, idx) => {
      const n = r.__settleNum || 0;
      if (!n) return;
      const diff = Math.abs(n - todayNum);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    const targetIdx = closestIdx >= 0 ? closestIdx : 0;
    const page = Math.floor(targetIdx / itemsPerPage) + 1;

    setCurrentPage(page || 1);
    initializedPageRef.current = true;
  }, [sortedRows, itemsPerPage]);

  /* 페이지네이션 */
  const totalPages = Math.max(
    1,
    Math.ceil((sortedRows.length || 1) / itemsPerPage)
  );
  const currentPageSafe = Math.min(Math.max(currentPage, 1), totalPages);
  useEffect(() => {
    if (currentPage !== currentPageSafe) setCurrentPage(currentPageSafe);
  }, [totalPages, currentPage, currentPageSafe]);

  const pageRows = useMemo(() => {
    const start = (currentPageSafe - 1) * itemsPerPage;
    return sortedRows.slice(start, start + itemsPerPage);
  }, [sortedRows, currentPageSafe, itemsPerPage]);

  /* 월별 합계 */
  const targetYm = sumYear && sumMonth ? `${sumYear}-${sumMonth}` : "";
  const monthlyTotals = useMemo(() => {
    if (!targetYm) return { deposit: 0, payout: 0, diff: 0 };
    return rows.reduce(
      (acc, r) => {
        if (r.__settleYm === targetYm) {
          acc.deposit += r.__depositNum || 0;
          acc.payout += r.__payoutNum || 0;
        }
        return acc;
      },
      { deposit: 0, payout: 0, diff: 0 }
    );
  }, [rows, targetYm]);
  monthlyTotals.diff =
    (monthlyTotals.deposit || 0) - (monthlyTotals.payout || 0);

  /* 진행현황 카운트 */
  const statusCounts = useMemo(() => {
    const all = rows.length;
    const result = {
      all,
      미접수: 0,
      접수완료: 0,
      도배완료: 0,
      도배보류: 0,
    };
    rows.forEach((r) => {
      const st = String(r.status || "");
      if (st === "미접수") result.미접수 += 1;
      else if (st === "접수완료") result.접수완료 += 1;
      else if (st === "도배완료") result.도배완료 += 1;
      else if (st === "도배보류") result.도배보류 += 1;
    });
    return result;
  }, [rows]);

  /* 인라인 수정 핸들러 */
  const handleInlineChange = (rowId, key, value) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const next = { ...r };

        if (key === "depositIn") {
          const num = parseNumber(value);
          next.depositIn = fmtComma(value);
          next.__depositNum = num;
          const diff = (num || 0) - (next.__payoutNum || 0);
          next.diff = fmtComma(diff);
          return next;
        }

        if (key === "payoutOut") {
          const num = parseNumber(value);
          next.payoutOut = fmtComma(value);
          next.__payoutNum = num;
          const diff = (next.__depositNum || 0) - (num || 0);
          next.diff = fmtComma(diff);
          return next;
        }

        if (key === "settleDate") {
          next.settleDate = value;
          next.__settleNum = dateToNum(value);
          return next;
        }

        if (key === "receivedDate") {
          next.receivedDate = value;
          return next;
        }

        if (key === "status") {
          next.status = value;
          return next;
        }

        if (key === "villaName") {
          next.villaName = value;
          return next;
        }

        if (key === "unitNumber") {
          next.unitNumber = value;
          return next;
        }

        if (key === "depositor") {
          next.depositor = value;
          return next;
        }

        if (key === "vendor") {
          next.vendor = value;
          return next;
        }

        if (key === "note") {
          next.note = value;
          return next;
        }

        if (key === "completedDate") {
          next.completedDate = value;
          return next;
        }

        return next;
      })
    );
  };

  /* 인라인 저장 */
  const handleInlineSave = async (rowId, patch = {}) => {
    const base = rows.find((r) => r.id === rowId);
    if (!base) return;
    const row = { ...base, ...patch };

    const payload = {
      settleDate: s(row.settleDate),
      receivedDate: s(row.receivedDate),
      completedDate: s(row.completedDate), // ✅ 완료날짜 저장
      villaName: s(row.villaName),
      unitNumber: s(row.unitNumber),
      depositIn: parseNumber(row.depositIn),
      payoutOut: parseNumber(row.payoutOut),
      depositor: s(row.depositor),
      vendor: s(row.vendor),
      status: s(row.status),
      note: s(row.note),
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, "paperings", row.id), payload);
    } catch (e) {
      console.error("도배 인라인 저장 오류:", e);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  /* 키보드 네비게이션 */
  const handleKeyDown = (e, rowId, key, rowIndex, colIndex) => {
    const { key: k } = e;

    const targetTag = (e.target && e.target.tagName) || "";
    if (
      targetTag === "SELECT" &&
      (k === "ArrowUp" ||
        k === "ArrowDown" ||
        k === "Up" ||
        k === "Down" ||
        k === "Enter")
    ) {
      return;
    }

    const rowCount = pageRows.length;
    const colCount = columns.length;

    const isEditableCell = (rIdx, cIdx) => {
      if (rIdx < 0 || rIdx >= rowCount) return false;
      if (cIdx < 0 || cIdx >= colCount) return false;
      const colKey = columns[cIdx].key;
      if (!editableKeys.includes(colKey)) return false;
      if (colKey === "settleDate") return false;
      if (colKey === "diff") return false;
      return true;
    };

    const focusCell = (rIdx, cIdx) => {
      if (!isEditableCell(rIdx, cIdx)) return;
      const row = pageRows[rIdx];
      if (!row) return;
      const colKey = columns[cIdx].key;
      const refKey = `${row.id}:${colKey}`;
      const el = cellRefs.current[refKey];
      if (el && typeof el.focus === "function") {
        el.focus();
        if (typeof el.select === "function") {
          try {
            el.select();
          } catch {}
        }
      }
    };

    if (k === "Enter") {
      e.preventDefault();
      for (let r = rowIndex; r < rowCount; r += 1) {
        const startC = r === rowIndex ? colIndex + 1 : 0;
        for (let c = startC; c < colCount; c += 1) {
          if (isEditableCell(r, c)) {
            focusCell(r, c);
            return;
          }
        }
      }
      return;
    }

    if (k === "ArrowRight" || k === "Right") {
      e.preventDefault();
      for (let c = colIndex + 1; c < colCount; c += 1) {
        if (isEditableCell(rowIndex, c)) {
          focusCell(rowIndex, c);
          return;
        }
      }
      return;
    }

    if (k === "ArrowLeft" || k === "Left") {
      e.preventDefault();
      for (let c = colIndex - 1; c >= 0; c -= 1) {
        if (isEditableCell(rowIndex, c)) {
          focusCell(rowIndex, c);
          return;
        }
      }
      return;
    }

    if (k === "ArrowUp" || k === "Up") {
      e.preventDefault();
      for (let r = rowIndex - 1; r >= 0; r -= 1) {
        if (isEditableCell(r, colIndex)) {
          focusCell(r, colIndex);
          return;
        }
      }
      return;
    }

    if (k === "ArrowDown" || k === "Down") {
      e.preventDefault();
      for (let r = rowIndex + 1; r < rowCount; r += 1) {
        if (isEditableCell(r, colIndex)) {
          focusCell(r, colIndex);
          return;
        }
      }
      return;
    }
  };

  /* 마우스 휠로 페이지 이동 */
  const handleWheel = (e) => {
    if (e.deltaY > 0 && currentPageSafe < totalPages) {
      setCurrentPage((p) => Math.min(totalPages, p + 1));
    } else if (e.deltaY < 0 && currentPageSafe > 1) {
      setCurrentPage((p) => Math.max(1, p - 1));
    }
  };

  /* 테이블 컬럼 정의 (완료날짜 포함: 진행현황 오른쪽) */
  const columns = [
    { key: "settleDate", label: "정산날짜", width: 90 },
    { key: "receivedDate", label: "접수날짜", width: 90 },
    { key: "villaName", label: "빌라명", width: 130 },
    { key: "unitNumber", label: "호수", width: 70 },
    { key: "depositIn", label: "입금금액", width: 90 },
    { key: "payoutOut", label: "출금금액", width: 90 },
    { key: "diff", label: "차액", width: 90 },
    { key: "depositor", label: "입금자", width: 90 },
    { key: "vendor", label: "거래처", width: 90 },
    { key: "status", label: "진행현황", width: 90 },
    { key: "completedDate", label: "완료날짜", width: 90 }, // ✅ 진행현황 오른쪽
    { key: "note", label: "비고", width: 260, align: "left" },
  ];

  const handleAdd = () => {
    setEditingRow(null);
    setFormOpen(true);
  };

  const handleDeleteRow = async (row) => {
    const raw = rows.find((r) => r.id === row.id) || row;
    if (!raw?.id) return;
    if (raw.sourceMoveoutId) {
      alert("이 항목은 이사정산과 연동되었습니다. 이사정산 페이지에서 도배 내역을 제거해 주세요.");
      return;
    }
    if (!window.confirm("해당 도배 내역을 삭제할까요?")) return;
    await deleteDoc(doc(db, "paperings", raw.id));
  };

  const handleSaved = () => {
    setFormOpen(false);
    setEditingRow(null);
  };

  /* 셀 렌더링 */
  const renderCell = (row, col, rowIndex, colIndex) => {
    const key = col.key;
    const linked = !!row.sourceMoveoutId;
    const lockedFields = ["settleDate"];
    const isLocked = linked && lockedFields.includes(key);

    const commonProps = {
      onBlur: () => {
        handleInlineSave(row.id);
        editingCellRef.current = null;
      },
      onKeyDown: (e) => handleKeyDown(e, row.id, key, rowIndex, colIndex),
      onFocus: () => {
        editingCellRef.current = { rowId: row.id, key };
      },
    };

    if (key === "diff" || isLocked) {
      return key === "status" ? <StatusCell value={row.status} /> : row[key] || "";
    }

    if (key === "status") {
      return (
        <select
          className="mic-table-input mic-table-select"
          value={row.status || "미접수"}
          onChange={(e) => handleInlineChange(row.id, "status", e.target.value)}
          ref={(el) => setCellRef(row.id, key, el)}
          {...commonProps}
        >
          <option value="미접수">🔴 미접수</option>
          <option value="접수완료">🟡 접수완료</option>
          <option value="도배완료">🟢 도배완료</option>
          <option value="도배보류">⚪ 도배보류</option>
        </select>
      );
    }

    if (key === "depositIn" || key === "payoutOut") {
      return (
        <input
          type="text"
          className="mic-table-input mic-table-input-number"
          value={row[key] || ""}
          onChange={(e) => handleInlineChange(row.id, key, e.target.value)}
          ref={(el) => setCellRef(row.id, key, el)}
          {...commonProps}
        />
      );
    }

    if (key === "receivedDate") {
      return (
        <DatePicker
          locale={ko}
          dateFormat="yyyy-MM-dd"
          selected={strToDate(row.receivedDate)}
          onChange={(d) => {
            const v = d ? fmtDate(d) : "";
            handleInlineChange(row.id, "receivedDate", v);
            handleInlineSave(row.id, { receivedDate: v });
          }}
          customInput={
            <InlineDateInput
              value={row.receivedDate || ""}
              ref={(el) => setCellRef(row.id, key, el)}
            />
          }
          onKeyDown={(e) => {
            if (e.key === "Backspace" || e.key === "Delete") {
              e.preventDefault();
              handleInlineChange(row.id, "receivedDate", "");
              handleInlineSave(row.id, { receivedDate: "" });
            } else {
              handleKeyDown(e, row.id, key, rowIndex, colIndex);
            }
          }}
          calendarClassName="!text-xs"
          popperPlacement="bottom"
        />
      );
    }

    // ✅ 완료날짜: 날짜 선택 시 도배완료, 삭제 시 접수완료/미접수 자동
    if (key === "completedDate") {
      return (
        <DatePicker
          locale={ko}
          dateFormat="yyyy-MM-dd"
          selected={strToDate(row.completedDate)}
          onChange={(d) => {
            const v = d ? fmtDate(d) : "";
            let newStatus = row.status || "미접수";

            if (v) {
              // 날짜 선택 → 도배완료
              newStatus = "도배완료";
            } else {
              // (이론상 여기 들어올 일은 거의 없음, 삭제는 onKeyDown 처리)
              newStatus = row.receivedDate ? "접수완료" : "미접수";
            }

            handleInlineChange(row.id, "completedDate", v);
            handleInlineChange(row.id, "status", newStatus);
            handleInlineSave(row.id, {
              completedDate: v,
              status: newStatus,
            });
          }}
          customInput={
            <InlineDateInput
              value={row.completedDate || ""}
              ref={(el) => setCellRef(row.id, key, el)}
            />
          }
          onKeyDown={(e) => {
            if (e.key === "Backspace" || e.key === "Delete") {
              // 완료날짜 삭제 → 접수날짜 유무에 따라 상태 변경
              e.preventDefault();
              const newStatus = row.receivedDate ? "접수완료" : "미접수";
              handleInlineChange(row.id, "completedDate", "");
              handleInlineChange(row.id, "status", newStatus);
              handleInlineSave(row.id, {
                completedDate: "",
                status: newStatus,
              });
            } else {
              handleKeyDown(e, row.id, key, rowIndex, colIndex);
            }
          }}
          calendarClassName="!text-xs"
          popperPlacement="bottom"
        />
      );
    }

    if (key === "depositor") {
      return (
        <select
          className="mic-table-input mic-table-select"
          value={row.depositor || ""}
          onChange={(e) =>
            handleInlineChange(row.id, "depositor", e.target.value)
          }
          ref={(el) => setCellRef(row.id, key, el)}
          {...commonProps}
        >
          <option value=""></option>
          {depositorOptions.map((opt, i) => (
            <option key={`${opt}-${i}`} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (key === "vendor") {
      return (
        <select
          className="mic-table-input mic-table-select"
          value={row.vendor || ""}
          onChange={(e) =>
            handleInlineChange(row.id, "vendor", e.target.value)
          }
          ref={(el) => setCellRef(row.id, key, el)}
          {...commonProps}
        >
          <option value=""></option>
          {vendorOptions.map((opt, i) => (
            <option key={`${opt}-${i}`} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (key === "settleDate") {
      return row.settleDate || "";
    }

    const isNote = key === "note";
    return (
      <input
        type="text"
        className={
          "mic-table-input" + (isNote ? " mic-table-input-left" : "")
        }
        value={row[key] || ""}
        onChange={(e) => handleInlineChange(row.id, key, e.target.value)}
        ref={(el) => setCellRef(row.id, key, el)}
        {...commonProps}
      />
    );
  };

  /* 헤더 정렬 표시 */
  const renderSortIndicator = (key) => {
    if (sortKey !== key) return null;
    return (
      <span className="mic-sort-indicator">
        {sortDir === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  return (
    <div className="page-wrapper mic-page">
      <PageTitle>도배</PageTitle>

      <div className="mic-card">
        {/* 상단 툴바 */}
        <div className="mic-toolbar">
          <div className="mic-toolbar-left">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="mic-toolbar-select"
              title="진행현황 필터"
            >
              <option value="ALL">전체</option>
              <option value="미접수">미접수</option>
              <option value="접수완료">접수완료</option>
              <option value="도배완료">도배완료</option>
              <option value="도배보류">도배보류</option>
            </select>

            <div className="mic-search">
              <input
                type="text"
                className="mic-search-input"
                placeholder="검색"
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          <div className="mic-toolbar-right">
            <button
              type="button"
              onClick={() => setSumOpen(true)}
              className="mic-btn mic-btn-secondary"
            >
              차액
            </button>
            <button
              type="button"
              onClick={handleAdd}
              className="mic-btn mic-btn-primary"
            >
              + 등록
            </button>
          </div>
        </div>

        {/* 테이블 */}
        <div className="mic-table-wrapper" onWheel={handleWheel}>
          <table className="mic-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="mic-th mic-th-center mic-th-sortable"
                    style={col.width ? { width: col.width } : undefined}
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="mic-th-label">
                      {col.label}
                      {renderSortIndicator(col.key)}
                    </span>
                  </th>
                ))}
                <th className="mic-th mic-th-center mic-th-actions">
                  관리
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="mic-empty">
                    등록된 도배 내역이 없습니다.
                  </td>
                </tr>
              )}
              {pageRows.map((row, rowIndex) => (
                <tr key={row.id} className="mic-tr">
                  {columns.map((col, colIndex) => (
                    <td
                      key={col.key}
                      className={
                        col.align === "left"
                          ? "mic-td mic-td-left"
                          : "mic-td"
                      }
                      style={col.width ? { width: col.width } : undefined}
                    >
                      {renderCell(row, col, rowIndex, colIndex)}
                    </td>
                  ))}
                  <td className="mic-td mic-td-actions">
                    <button
                      type="button"
                      className="mic-row-delete-btn"
                      onClick={() => handleDeleteRow(row)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 + 진행현황 요약 */}
        <div className="mic-pagination">
          <div className="mic-pagination-info">
            <span className="mic-pagination-main">
              총 <strong>{filteredRows.length}</strong>건 /{" "}
              <span>
                {currentPageSafe}/{totalPages}
              </span>{" "}
              페이지
            </span>
            <span className="mic-status-summary">
              진행현황: 전체 {statusCounts.all}건 · 미접수 {statusCounts.미접수}건 ·
              접수완료 {statusCounts.접수완료}건 · 도배완료 {statusCounts.도배완료}건 ·
              도배보류 {statusCounts.도배보류}건
            </span>
          </div>
          <div className="mic-pagination-controls">
            <button
              type="button"
              className="mic-page-btn"
              disabled={currentPageSafe === 1}
              onClick={() => setCurrentPage(1)}
            >
              ⏮
            </button>
            <button
              type="button"
              className="mic-page-btn"
              disabled={currentPageSafe === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              ◀
            </button>
            <button
              type="button"
              className="mic-page-btn"
              disabled={currentPageSafe === totalPages}
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
            >
              ▶
            </button>
            <button
              type="button"
              className="mic-page-btn"
              disabled={currentPageSafe === totalPages}
              onClick={() => setCurrentPage(totalPages)}
            >
              ⏭
            </button>
          </div>
        </div>
      </div>

      {/* 등록/수정 모달 */}
      <SimpleModal
        open={formOpen}
        title={editingRow ? "도배 수정" : "도배 등록"}
        onClose={() => {
          setFormOpen(false);
          setEditingRow(null);
        }}
      >
        <EditForm
          initial={editingRow}
          onCancel={() => {
            setFormOpen(false);
            setEditingRow(null);
          }}
          onSaved={handleSaved}
        />
      </SimpleModal>

      {/* 🔹 차액 합계 모달 */}
      <SimpleModal
        open={sumOpen}
        title="월별 차액 합계"
        size="sm"
        onClose={() => setSumOpen(false)}
      >
        <div className="mic-sum-modal">
          <div className="mic-form-row">
            <div className="mic-form-field">
              <label className="mic-form-label">년도</label>
              <select
                value={sumYear}
                onChange={(e) => setSumYear(e.target.value)}
                className="mic-input mic-input-select"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="mic-form-field">
              <label className="mic-form-label">월</label>
              <select
                value={sumMonth}
                onChange={(e) => setSumMonth(e.target.value)}
                className="mic-input mic-input-select"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mic-sum-cards">
            <div className="mic-sum-card">
              <div className="mic-sum-label">입금액</div>
              <div className="mic-sum-value">
                {fmtComma(monthlyTotals.deposit)}원
              </div>
            </div>
            <div className="mic-sum-card">
              <div className="mic-sum-label">출금액</div>
              <div className="mic-sum-value">
                {fmtComma(monthlyTotals.payout)}원
              </div>
            </div>
            <div className="mic-sum-card mic-sum-card--accent">
              <div className="mic-sum-label">차액</div>
              <div className="mic-sum-value">
                {fmtComma(monthlyTotals.diff)}원
              </div>
            </div>
          </div>

          <div className="mic-form-actions mic-form-actions-right">
            <button
              type="button"
              onClick={() => setSumOpen(false)}
              className="mic-btn mic-btn-ghost"
            >
              닫기
            </button>
          </div>
        </div>
      </SimpleModal>
    </div>
  );
}