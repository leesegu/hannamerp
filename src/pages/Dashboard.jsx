// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, onSnapshot, query, orderBy, where } from "firebase/firestore";
import { format, parseISO, isValid, differenceInDays, addDays } from "date-fns";
import { ko } from "date-fns/locale";
import "./Dashboard.css";

/** ✅ 상단 카드 정의 (표시 순서 고정) */
const DATE_SECTIONS = [
  {
    key: "telco",
    title: "통신사 약정만료",
    icon: "ri-signal-tower-line",
    route: "/telco",
    paths: [
      "telco.contractEnd",
      "telco.contractExpire",
      "telco.expire",
      "telco.expireDate",
      "telco.expiryDate",
      "telco.contractEndDate",
      "telco.contractUntil",
      "telcoContract",
      "telcoContractDate",
      "telcoContractEnd",
      "telcoContract.expire",
      "telcoContract.expireDate",
      "telcoContract.expiryDate",
      "telcoContract.end",
      "telcoContract.endDate",
      "telcoContract.until",
      "telcoContractEnd",
      "telcoExpire",
      "telcoExpireDate",
    ],
  },
  {
    key: "elevInspect",
    title: "승강기 검사만료",
    icon: "ri-bar-chart-line",
    route: "/elevator",
    paths: ["regularExpire", "elevator.regularExpire", "elevatorInspectionExpire", "elevatorInspectionDate"],
  },
  {
    key: "elevInsurance",
    title: "승강기 보험만료",
    icon: "ri-shield-check-line",
    route: "/elevator",
    paths: ["contractEnd", "elevator.insuranceExpire", "elevatorInsuranceExpiry", "elevatorContractEnd"],
  },
  {
    key: "septic",
    title: "정화조",
    icon: "ri-recycle-line",
    route: "/septic",
    paths: ["septicDate", "septic.workDate", "septic.nextWorkDate", "septicWorkDate"],
  },
  {
    key: "fireTraining",
    title: "소방교육 만료",
    icon: "ri-fire-line",
    route: "/fire-safety",
    paths: ["fireSafetyTrainingDate", "fire.trainingDate", "fire.trainingExpire", "fireTrainingDate", "fireTrainingExpiry"],
  },
];

/** 다양한 타입의 날짜를 Date로 안전 변환 */
function toDateSafe(v) {
  if (!v) return null;
  if (v?.toDate) { try { return v.toDate(); } catch { return null; } }
  if (typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    const s = v.trim();
    let m = s.match(/^(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/); // YY-MM-DD
    if (m) {
      const d = new Date(2000 + +m[1], +m[2] - 1, +m[3]);
      return isNaN(d.getTime()) ? null : d;
    }
    m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/); // YYYY-MM-DD
    if (m) {
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      return isNaN(d.getTime()) ? null : d;
    }
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/); // YYYYMMDD
    if (m) {
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = parseISO(s); // ISO
    return isValid(d) ? d : null;
  }
  return null;
}

/** a.b.c 경로 접근 */
function getByPath(obj, path) {
  return path.split(".").reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
}

/** ✅ 불리언 체크 통합 */
function isChecked(v) {
  if (v === true) return true;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return ["y", "yes", "true", "1", "on", "checked"].includes(s);
  }
  return false;
}

/** ✅ 여러 경로 중 최초 truthy 불리언 찾기 */
function truthyByPaths(obj, paths) {
  for (const p of paths) {
    const v = getByPath(obj, p);
    if (isChecked(v)) return true;
  }
  return false;
}

/** ✅ 영수증 ‘입금날짜’ 후보 키들 중 첫 번째 유효 날짜 반환 */
function getDepositDate(obj) {
  const candidates = [
    "depositDate",
    "paidAt",
    "paymentDate",
    "deposit_at",
    "dates.deposit",
    "pay.depositDate",
  ];
  for (const p of candidates) {
    const d = toDateSafe(getByPath(obj, p));
    if (d) return d;
  }
  return null;
}

/** ✅ 금액 추출(여러 후보키 허용) */
function getAmount(obj) {
  const candidates = [
    "amount",
    "total",
    "totalAmount",
    "finalAmount",
    "settlementAmount",
    "sum",
    "pay.amount",
    "money.total",
  ];
  for (const p of candidates) {
    const raw = getByPath(obj, p);
    const v = parseInt(String(raw ?? "").replace(/[^0-9-]/g, ""), 10);
    if (Number.isFinite(v)) return v;
  }
  return 0;
}

/** ✅ 빌라명 / 나머지주소 / 전체주소 추출(미수금 카드용) */
function getVillaName(obj) {
  const candidates = ["villaName", "buildingName", "빌라명", "houseName", "name"];
  for (const p of candidates) {
    const v = getByPath(obj, p);
    if (v) return String(v);
  }
  return "-";
}
function getRestAddress(obj) {
  const candidates = ["restAddress","addressRest","addr2","address2","detailAddress","나머지주소","추가주소"];
  for (const p of candidates) {
    const v = getByPath(obj, p);
    if (v) return String(v);
  }
  return "";
}
function getFullAddress(obj) {
  const candidates = ["address","addr","fullAddress","address1","주소","buildingAddress","addr1"];
  for (const p of candidates) {
    const v = getByPath(obj, p);
    if (v) return String(v);
  }
  const a2 = getByPath(obj, "addressDetail") || "";
  return String(a2 || "");
}

/** 금액 포맷 */
const fmtComma = (n) => {
  const v = parseInt(String(n ?? "").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(v) ? v.toLocaleString() : "0";
};

/* ===== 🔹 이사정산 총액 계산 유틸(입금확인 카드용) ===== */
const toNum = (v) => (v === "" || v == null ? 0 : (Number(String(v).replace(/[,\s]/g, "")) || 0));
const sumExtrasFromArray = (extras) => (extras || []).reduce((acc, it) => acc + (Number(it?.amount || 0) || 0), 0);
const getExtraTotal = (x) => {
  const sx = Array.isArray(x.extras) ? sumExtrasFromArray(x.extras) : 0;
  return sx || toNum(x.extraAmount);
};
const sumMoveoutTotal = (x) =>
  toNum(x.arrears) +
  toNum(x.currentMonth) +
  toNum(x.waterFee) +
  toNum(x.electricity) +
  toNum(x.tvFee) +
  toNum(x.cleaningFee) +
  getExtraTotal(x);

/* === 일정 유틸 ===================== */
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export default function Dashboard() {
  const navigate = useNavigate();

  /** 임박 기준: 14/30/45, 기본 30 */
  const [horizonDays, setHorizonDays] = useState(30);

  /** 데이터 구독 */
  const [villas, setVillas] = useState([]);
  const [moveouts, setMoveouts] = useState([]);
  const [cleanings, setCleanings] = useState([]);
  const [receipts, setReceipts] = useState([]);

  // ✅ 일정(어제/오늘 미완료)
  const [todoSchedules, setTodoSchedules] = useState([]);
  const [openTodoPop, setOpenTodoPop] = useState(false);

  useEffect(() => {
    const qV = query(collection(db, "villas"), orderBy("name", "asc"));
    const unsubV = onSnapshot(qV, (snap) => {
      setVillas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubV();
  }, []);

  useEffect(() => {
    const qM = query(collection(db, "moveouts"), orderBy("moveDate", "desc"));
    const unsubM = onSnapshot(qM, (snap) => {
      setMoveouts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubM();
  }, []);

  useEffect(() => {
    const qC = query(collection(db, "moveInCleanings"));
    const unsubC = onSnapshot(qC, (snap) => {
      setCleanings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubC();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "receipts"), (snap) => {
      setReceipts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // ✅ 일정(어제/오늘) 미완료
  useEffect(() => {
    const today = new Date();
    const y = new Date(today); y.setDate(today.getDate() - 1);
    const ymdToday = ymd(today);
    const ymdYesterday = ymd(y);
    const col = collection(db, "schedules");
    const qSch = query(
      col,
      where("date", "in", [ymdYesterday, ymdToday]),
      where("completed", "==", false)
    );
    const unsub = onSnapshot(qSch, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time || "").localeCompare(String(b.time || "")));
      setTodoSchedules(rows);
    });
    return () => unsub();
  }, []);

  /** 상단 섹션(빌라 기반 날짜) 계산 */
  const now = new Date();
  const soonEdge = addDays(now, horizonDays);

  const dateSections = useMemo(() => {
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const UPCOMING_ONLY_KEYS = new Set(["elevInspect", "elevInsurance", "septic", "fireTraining"]);

    return DATE_SECTIONS.map((sec) => {
      const items = [];

      villas.forEach((v) => {
        let found = null;
        for (const p of sec.paths) {
          const raw = getByPath(v, p);
          const d = toDateSafe(raw);
          if (d) { found = d; break; }
        }
        if (!found) return;

        const d0 = new Date(found.getFullYear(), found.getMonth(), found.getDate());
        const diff = differenceInDays(d0, today0);
        const isOverdue = diff < 0;
        const isToday = diff === 0;

        const withinHorizon = found <= soonEdge;
        let include = false;

        if (sec.key === "telco") {
          include = (isOverdue || isToday || diff > 0) && withinHorizon;
        } else if (UPCOMING_ONLY_KEYS.has(sec.key)) {
          include = (diff >= 0) && withinHorizon;
        }

        if (include) {
          items.push({
            id: v.id,
            villaName: v.name || v.villaName || "",
            district: v.district || "",
            address: v.address || "",
            date: found,
            diff,
            isOverdue,
            isToday,
          });
        }
      });

      if (sec.key === "telco") {
        items.sort((a, b) => {
          if (a.isOverdue !== b.isOverdue) return a.isOverdue ? 1 : -1;
          if (!a.isOverdue && !b.isOverdue) {
            if (a.isToday && !b.isToday) return 1;
            if (!a.isToday && b.isToday) return -1;
            return a.diff - b.diff;
          }
          if (a.isToday && b.isToday) return 0;
          return b.diff - a.diff;
        });
      } else {
        items.sort((a, b) => a.date - b.date);
      }

      let summary = null;
      if (sec.key === "telco") {
        const overdueCount = items.filter((x) => x.isOverdue).length;
        const upcomingCount = items.length - overdueCount;
        const totalCount = items.length;
        summary = `지남 ${overdueCount} · 예정 ${upcomingCount} · 총 ${totalCount}건`;
      }

      return { ...sec, items, summary };
    });
  }, [villas, horizonDays]);

  /** 하단 섹션(업무 컬렉션) */
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const isFirstAndExclude = (m) => {
    const firstOk = truthyByPaths(m, [
      "firstSettlement", "firstSettle", "first", "isFirstSettlement", "firstCheck", "정산1차", "flags.firstSettlement",
    ]);
    const excludeOk = truthyByPaths(m, [
      "excludeDeposit", "withoutDeposit", "depositExcluded", "보증금제외", "flags.excludeDeposit",
    ]);
    return firstOk && excludeOk;
  };

  const sectionMoveoutWait = useMemo(() => {
    return moveouts
      .filter((m) => {
        const prog = (m.progress || m.status || "").trim();
        if (prog !== "정산대기") return false;
        const d = toDateSafe(m.moveDate ?? m.movedate);
        if (!d) return true;
        const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return d0.getTime() <= today0.getTime();
      })
      .sort((a, b) => String(a.villaName).localeCompare(String(b.villaName)));
  }, [moveouts]);

  const sectionMoveoutDeposit = useMemo(() => {
    const items = moveouts
      .filter((m) => (m.progress || m.status || "").trim() === "입금대기")
      .sort((a, b) => String(a.moveDate || "").localeCompare(String(b.movedate || "")));
    const sum = items.reduce((acc, m) => acc + getAmount(m), 0);
    return { items, sum };
  }, [moveouts]);

  const sectionCleaningUnconfirmed = useMemo(() => {
    return cleanings
      .filter((c) => (c.progress || c.status || "").trim() === "미접수")
      .sort((a, b) => String(a.createdAt || 0) - String(b.createdAt || 0));
  }, [cleanings]);

  const sectionReceivables = useMemo(() => {
    const items = receipts
      .filter((r) => !getDepositDate(r))
      .map((r) => ({
        id: r.id,
        villaName: getVillaName(r),
        restAddr: getRestAddress(r),
        fullAddr: getFullAddress(r),
        amount: getAmount(r),
        issueDate: toDateSafe(r.issueDate ?? r.issuedAt ?? r.date),
      }))
      .sort((a, b) => {
        const ad = a.issueDate ? a.issueDate.getTime() : 0;
        const bd = b.issueDate ? b.issueDate.getTime() : 0;
        return bd - ad;
      });
    const sum = items.reduce((acc, r) => acc + (r.amount || 0), 0);
    return { items, sum };
  }, [receipts]);

  const ddTextTelco = (diff) => (diff < 0 ? `D+${Math.abs(diff)}` : diff === 0 ? "D-Day" : `D-${diff}`);
  const ddClassTelco = (diff) =>
    diff === 0 ? "dash-dd dash-dd--day" : diff < 0 ? "dash-dd dash-dd--plus" : "dash-dd dash-dd--minus";
  const ddTextDefault = (diff) => (diff === 0 ? "D-Day" : `D-${diff}`);
  const ddClassDefault = (diff) => (diff === 0 ? "dash-dd dash-dd--day" : "dash-dd dash-dd--minus");

  /** 상단 항목 클릭(빌라기반) → 빌라정보로 */
  const onItemClick = (secKey, villaId) => {
    const map = {
      telco: { go: "빌라정보", sub: "통신사" },
      elevInspect: { go: "빌라정보", sub: "승강기" },
      elevInsurance: { go: "빌라정보", sub: "승강기" },
      septic: { go: "빌라정보", sub: "정화조" },
      fireTraining: { go: "빌라정보", sub: "소방안전" },
    };
    const m = map[secKey];
    if (!m) return;
    const url = `/main?go=${encodeURIComponent(m.go)}&sub=${encodeURIComponent(m.sub)}&villa=${encodeURIComponent(villaId)}`;
    navigate(url);
  };

  /** ✅ 기준 드롭다운(커스텀 메뉴) */
  const [openMenu, setOpenMenu] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setOpenMenu(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const HorizonDropdown = () => (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="dash-chip pr-2 pl-3"
        onClick={() => setOpenMenu((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={openMenu}
      >
        <i className="ri-equalizer-line" />
        기준
        <span className="ml-2 font-semibold text-gray-800">{horizonDays}일</span>
        <i className={`ri-arrow-down-s-line ml-1 transition-transform ${openMenu ? "rotate-180" : ""}`} />
      </button>

      {openMenu && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 w-36 bg-white border border-purple-100 rounded-xl shadow-2xl z-50 overflow-hidden"
        >
          {[14, 30, 45].map((d) => (
            <div
              key={d}
              role="option"
              aria-selected={horizonDays === d}
              className={`px-3 py-2.5 text-[13px] cursor-pointer flex items-center justify-between
                hover:bg-purple-50 ${horizonDays === d ? "bg-purple-50 font-semibold text-gray-900" : "text-gray-700"}`}
              onClick={() => {
                setHorizonDays(d);
                setOpenMenu(false);
              }}
            >
              <span>{d}일</span>
              {horizonDays === d && <i className="ri-check-line text-purple-600 text-[16px]" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /** 상단 라인 미니 칩(일정 미완료만 유지) */
  const InlineChipSchedule = () => (
    <div className="mini-chip" onClick={() => setOpenTodoPop((v) => !v)} title="어제/오늘 미완료 일정">
      <i className="ri-calendar-check-line mini-icon" />
      <span className="mini-label">일정 미완료</span>
      <span className="mini-count">{todoSchedules.length}건</span>
      {openTodoPop && (
        <div
          className="chip-pop"
          onMouseDown={(e)=>e.stopPropagation()}
          onClick={(e)=>e.stopPropagation()}
        >
          <div className="chip-pop-head">어제/오늘 추가 · 미완료</div>
          <ul className="chip-pop-list">
            {todoSchedules.length === 0 ? (
              <li className="empty">모든 일정이 완료되었습니다.</li>
            ) : (
              todoSchedules.slice(0, 12).map((s) => (
                <li key={s.id} className="item">
                  <span className="date">{s.date.slice(5)}</span>
                  <span className="time">{s.time || "—"}</span>
                  <span className="title" title={s.title}>{s.title}</span>
                </li>
              ))
            )}
          </ul>
          {/* 이동 버튼 제거: 표시만 합니다 */}
        </div>
      )}
    </div>
  );

  /** 카드 컴포넌트 (CSS 적용) */
  const TopCard = ({ title, icon, items, summary, isTelco, secKey }) => (
    <div className="dash-card">
      <div className="dash-card__head">
        <i className={`${icon} dash-card__icon`} />
        <span className="dash-card__title">{title}</span>
        <span className="dash-card__meta text-[13.5px] font-semibold">
          {isTelco && summary ? summary : `${items.length}건`}
        </span>
      </div>
      <ul className="dash-list">
        {items.map((it) => (
          <li
            key={it.id}
            className="dash-list__item"
            onClick={() => onItemClick(secKey, it.id)}
            title="클릭하여 해당 페이지로 이동"
          >
            <div className="dash-item__left min-w-0">
              <div className="title">{it.villaName || "-"}</div>
              <div className="sub">
                {(it.district || "") + (it.address ? ` · ${it.address}` : "")}
              </div>
            </div>
            <div className="dash-item__right">
              <div className="date">
                {format(it.date, "yyyy-MM-dd (EEE)", { locale: ko })}
              </div>
              {isTelco ? (
                <div className={ddClassTelco(it.diff)}>{ddTextTelco(it.diff)}</div>
              ) : (
                <div className={ddClassDefault(it.diff)}>{ddTextDefault(it.diff)}</div>
              )}
            </div>
          </li>
        ))}
        {!items.length && <li className="dash-empty">표시할 항목이 없습니다.</li>}
      </ul>
    </div>
  );

  /** 하단 카드 */
  const BottomCard = ({ title, items, renderRow, tone = "default", amountText = null, onRowClick }) => (
    <div className="dash-card">
      <div
        className={
          "dash-card__head " +
          (tone === "blue" ? "dash-head--blue" : tone === "amber" ? "dash-head--amber" : "")
        }
      >
        <span className="dash-card__title">{title}</span>
        {amountText && <span className="dash-head-sum">{amountText}</span>}
        <span className="dash-card__meta text-[13.5px] font-semibold">{items.length}건</span>
      </div>
      <ul className="dash-list">
        {items.map((it) => (
          <li
            key={it.id}
            className={`dash-list__item ${onRowClick ? "dash-list__item--clickable" : ""}`}
            onClick={onRowClick ? () => onRowClick(it) : undefined}
            title={onRowClick ? "클릭하여 해당 페이지로 이동" : undefined}
          >
            {renderRow(it)}
          </li>
        ))}
        {!items.length && <li className="dash-empty">표시할 항목이 없습니다.</li>}
      </ul>
    </div>
  );

  /** 배지 */
  const Badge = ({ children, kind }) => (
    <span className={`tag ${kind === "first" ? "tag--first" : "tag--exclude"}`}>{children}</span>
  );

  return (
    <div className="dash w-full h-full px-3 py-4 sharp-text bg-white">
      <style>{`
        :root { color-scheme: light; }
        html, body, #root { background: #ffffff !important; }
      `}</style>

      {/* 상단: 기준 + 미니 칩들 (출금대조 불일치 칩 제거) */}
      <div className="dash-topbar mb-3">
        <div className="dash-topbar-left">
          <InlineChipSchedule />
        </div>
        <div className="dash-topbar-right">
          <HorizonDropdown />
        </div>
      </div>

      {/* 상단: 5개 섹션 */}
      <div className="dash-grid top" style={{ gap: 10 }}>
        {DATE_SECTIONS.map((sec) => (
          <TopCard
            key={sec.key}
            title={sec.title}
            icon={sec.icon}
            items={dateSections.find((s) => s.key === sec.key)?.items || []}
            summary={dateSections.find((s) => s.key === sec.key)?.summary}
            isTelco={sec.key === "telco"}
            secKey={sec.key}
          />
        ))}
      </div>

      {/* 하단: 4개 섹션 */}
      <div className="dash-grid bottom mt-6" style={{ gap: 10 }}>
        {/* 이사정산대기 */}
        <BottomCard
          title="이사정산대기"
          items={sectionMoveoutWait}
          tone="amber"
          onRowClick={(m) => {
            const effectiveGo = "이사정산 조회";
            const params = new URLSearchParams({ go: effectiveGo, villa: m.villaName || "" });
            navigate(`/main?${params.toString()}`);
          }}
          renderRow={(m) => {
            const showBadges = isFirstAndExclude(m);
            return (
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="min-w-0">
                  <div className="title">
                    {m.villaName || "-"}
                    {m.unitNumber ? ` ${m.unitNumber}` : ""}
                    {showBadges && (
                      <>
                        {" "}
                        <Badge kind="first">1차정산</Badge>
                        {" "}
                        <Badge kind="exclude">보증금제외</Badge>
                      </>
                    )}
                  </div>
                  <div className="sub">
                    {String(m.moveDate || m.movedate || "").slice(0, 10)}
                  </div>
                </div>
                <span className="text-amber-700 font-medium text-[13px]">정산대기</span>
              </div>
            );
          }}
        />

        {/* 이사정산 입금확인 */}
        <BottomCard
          title="이사정산 입금확인"
          items={sectionMoveoutDeposit.items}
          tone="blue"
          amountText={`${fmtComma(sectionMoveoutDeposit.sum)}원`}
          onRowClick={(m) => {
            const effectiveGo = "이사정산 조회";
            const params = new URLSearchParams({ go: effectiveGo, villa: m.villaName || "" });
            navigate(`/main?${params.toString()}`);
          }}
          renderRow={(m) => {
            const showBadges = isFirstAndExclude(m);
            const total = sumMoveoutTotal(m);
            return (
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="min-w-0">
                  <div className="title">
                    {m.villaName || "-"}
                    {m.unitNumber ? ` ${m.unitNumber}` : ""}
                    {showBadges && (
                      <>
                        {" "}
                        <Badge kind="first">1차정산</Badge>
                        {" "}
                        <Badge kind="exclude">보증금제외</Badge>
                      </>
                    )}
                  </div>
                  <div className="sub">총 이사정산금액: {fmtComma(total)}원</div>
                </div>
                <span className="text-blue-700 font-medium text-[13px]">입금대기</span>
              </div>
            );
          }}
        />

        {/* 입주청소 접수확인 */}
        <BottomCard
          title="입주청소 접수확인"
          items={sectionCleaningUnconfirmed}
          onRowClick={(c) => {
            navigate(`/main?go=${encodeURIComponent("입주청소")}&row=${encodeURIComponent(c.id)}`);
          }}
          renderRow={(c) => (
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="min-w-0">
                <div className="title">{c.villaName || "-"}</div>
                <div className="sub">{c.unitNumber || "-"}</div>
              </div>
              <span className="text-red-600 font-medium text-[13px]">미접수</span>
            </div>
          )}
        />

        {/* 미수금 */}
        <BottomCard
          title="미수금"
          items={sectionReceivables.items}
          amountText={`${fmtComma(sectionReceivables.sum)}원`}
          onRowClick={(r) => {
            navigate(`/main?go=${encodeURIComponent("영수증발행")}&row=${encodeURIComponent(r.id)}`);
          }}
          renderRow={(r) => (
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="min-w-0">
                <div className="title">
                  {r.villaName}{r.restAddr ? ` ${r.restAddr}` : ""}
                </div>
                <div className="sub">
                  {r.fullAddr || "-"}
                </div>
              </div>
              <span className="text-rose-700 font-semibold text:[13px]">
                {fmtComma(r.amount)}원
              </span>
            </div>
          )}
        />
      </div>
    </div>
  );
}
