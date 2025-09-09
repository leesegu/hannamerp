// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
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

export default function Dashboard() {
  const navigate = useNavigate();

  /** 임박 기준: 14/30/45, 기본 30 */
  const [horizonDays, setHorizonDays] = useState(30);

  /** 데이터 구독 */
  const [villas, setVillas] = useState([]);
  const [moveouts, setMoveouts] = useState([]);
  const [cleanings, setCleanings] = useState([]);

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
        const diff = differenceInDays(d0, today0); // 미래+: n, 과거-: -n
        const isOverdue = diff < 0;
        const isToday = diff === 0;

        const withinHorizon = found <= soonEdge;
        let include = false;

        if (sec.key === "telco") {
          // 통신사: 과거/오늘/미래 모두(임박 범위)
          include = (isOverdue || isToday || diff > 0) && withinHorizon;
        } else if (UPCOMING_ONLY_KEYS.has(sec.key)) {
          // 나머지 4개: 오늘 포함 미래만(과거 제외) + 임박 범위
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

      // 정렬
      if (sec.key === "telco") {
        // 예정(가까운 순) → 오늘 → 지난 항목(가까운 과거 순)
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

      // 통신사 요약
      let summary = null;
      if (sec.key === "telco") {
        const overdueCount = items.filter((x) => x.isOverdue).length;
        const upcomingCount = items.length - overdueCount; // 오늘 포함
        const totalCount = items.length;
        summary = `지남 ${overdueCount} · 예정 ${upcomingCount} · 총 ${totalCount}건`;
      }

      return { ...sec, items, summary };
    });
  }, [villas, horizonDays]);

  /** 하단 섹션(업무 컬렉션) */
  const todayStr = format(now, "yyyy-MM-dd");

  // 이사정산대기: 오늘 + status=정산대기
  const sectionMoveoutWait = useMemo(() => {
    return moveouts
      .filter((m) => {
        const prog = (m.progress || m.status || "").trim();
        const md = String(m.moveDate || "").slice(0, 10);
        return prog === "정산대기" && md === todayStr;
      })
      .sort((a, b) => String(a.villaName).localeCompare(String(b.villaName)));
  }, [moveouts, todayStr]);

  // 이사정산 입금확인: status=입금대기 (✅ 날짜 제거 대상)
  const sectionMoveoutDeposit = useMemo(() => {
    return moveouts
      .filter((m) => (m.progress || m.status || "").trim() === "입금대기")
      .sort((a, b) => String(a.moveDate || "").localeCompare(String(b.movedate || "")));
  }, [moveouts]);

  // 입주청소 접수확인: **미접수** 인 모든 날짜
  const sectionCleaningUnconfirmed = useMemo(() => {
    return cleanings
      .filter((c) => (c.progress || c.status || "").trim() === "미접수")
      .sort((a, b) => String(a.createdAt || 0) - String(b.createdAt || 0));
  }, [cleanings]);

  /** D-Day 텍스트/색상 규칙 */
  // 통신사: 과거는 D+N, 오늘 D-Day, 미래는 D-N
  const ddTextTelco = (diff) =>
    diff < 0 ? `D+${Math.abs(diff)}` : diff === 0 ? "D-Day" : `D-${diff}`;
  const ddClassTelco = (diff) =>
    diff === 0 ? "dash-dd dash-dd--day" : diff < 0 ? "dash-dd dash-dd--plus" : "dash-dd dash-dd--minus";

  // 나머지: 과거 제외 → 오늘 D-Day, 미래 D-N
  const ddTextDefault = (diff) => (diff === 0 ? "D-Day" : `D-${diff}`);
  const ddClassDefault = (diff) => (diff === 0 ? "dash-dd dash-dd--day" : "dash-dd dash-dd--minus");

  /** 항목 클릭 이동 */
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

  /** 카드 컴포넌트 (CSS 적용) */
  const TopCard = ({ title, icon, items, summary, isTelco, secKey }) => (
    <div className="dash-card">
      <div className="dash-card__head">
        <i className={`${icon} dash-card__icon`} />
        <span className="dash-card__title">{title}</span>
        {/* ✅ 요약(summary) 폰트 더 크게 */}
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

  const BottomCard = ({ title, items, renderRow, tone = "default" }) => (
    <div className="dash-card">
      <div
        className={
          "dash-card__head " +
          (tone === "blue" ? "dash-head--blue" : tone === "amber" ? "dash-head--amber" : "")
        }
      >
        <span className="dash-card__title">{title}</span>
        {/* ✅ 건수 폰트 살짝 키움 */}
        <span className="dash-card__meta text-[13.5px] font-semibold">{items.length}건</span>
      </div>
      <ul className="dash-list">
        {items.map((it) => (
          <li key={it.id} className="dash-list__item" style={{ cursor: "default" }}>
            {renderRow(it)}
          </li>
        ))}
        {!items.length && <li className="dash-empty">표시할 항목이 없습니다.</li>}
      </ul>
    </div>
  );

  return (
    // ✅ 사이드바 오른쪽 전체 채움: 좌우 여백 더 좁게(px-3), 가득 채우기
    <div className="dash w-full h-full px-3 py-4 sharp-text bg-white">
      {/* 전역: 바탕 흰색 고정 */}
      <style>{`
        :root { color-scheme: light; }
        html, body, #root { background: #ffffff !important; }
      `}</style>

      {/* 상단: 기준 → 우측 상단 배치 (범례 삭제) */}
      <div className="flex items-center justify-end mb-3">
        <HorizonDropdown />
      </div>

      {/* 상단: 5개 섹션 (순서 고정) — gap 약간 줄여서 가로 폭 확보 */}
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

      {/* 하단: 3개 섹션 (순서 고정) — gap 약간 줄이기 */}
      <div className="dash-grid bottom mt-6" style={{ gap: 10 }}>
        <BottomCard
          title="이사정산대기"
          items={sectionMoveoutWait}
          tone="amber"
          renderRow={(m) => (
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="min-w-0">
                <div className="title">{m.villaName || "-"}</div>
                <div className="sub">
                  {(m.unitNumber ? `${m.unitNumber} · ` : "")}
                  {(m.moveDate || "").slice(0, 10)}
                </div>
              </div>
              <span className="text-amber-700 font-medium text-[13px]">정산대기</span>
            </div>
          )}
        />
        <BottomCard
          title="이사정산 입금확인"
          items={sectionMoveoutDeposit}
          tone="blue"
          renderRow={(m) => (
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="min-w-0">
                <div className="title">{m.villaName || "-"}</div>
                {/* ✅ 날짜 제거: 호수만 표시 */}
                <div className="sub">{m.unitNumber || "-"}</div>
              </div>
              <span className="text-blue-700 font-medium text-[13px]">입금대기</span>
            </div>
          )}
        />
        <BottomCard
          title="입주청소 접수확인"
          items={sectionCleaningUnconfirmed}
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
      </div>
    </div>
  );
}
