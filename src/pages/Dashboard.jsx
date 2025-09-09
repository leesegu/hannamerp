// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { format, parseISO, isValid, differenceInDays, addDays } from "date-fns";
import { ko } from "date-fns/locale";

/** ✅ 경로 후보: 실제 필드명에 맞게 필요 시 1~2개만 정정하세요. */
const DATE_SECTIONS = [
  {
    key: "telco",
    title: "통신사 약정만료",
    icon: "ri-signal-tower-line",
    route: "/telco",
    paths: ["telco.contractEnd", "telcoContractEnd"],
  },
  {
    key: "elevInspect",
    title: "승강기 검사만료",
    icon: "ri-bar-chart-line",
    route: "/elevator",
    paths: ["elevator.regularExpire", "elevatorInspectionExpire", "elevatorInspectionDate"],
  },
  {
    key: "elevInsurance",
    title: "승강기 보험만료",
    icon: "ri-shield-check-line",
    route: "/elevator",
    paths: ["elevator.insuranceExpire", "elevatorInsuranceExpiry", "elevatorContractEnd"],
  },
  {
    key: "septic",
    title: "정화조",
    icon: "ri-recycle-line",
    route: "/septic",
    paths: ["septic.workDate", "septic.nextWorkDate", "septicWorkDate"],
  },
  {
    key: "fireTraining",
    title: "소방교육 만료",
    icon: "ri-fire-line",
    route: "/fire-safety",
    paths: ["fire.trainingDate", "fire.trainingExpire", "fireTrainingDate", "fireTrainingExpiry"],
  },
];

/** 다양한 타입의 날짜를 Date로 안전 변환 */
function toDateSafe(v) {
  if (!v) return null;
  if (v?.toDate) {
    try { return v.toDate(); } catch { return null; }
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "string") {
    // "YYYY-MM-DD" 또는 ISO
    const d = parseISO(v.length <= 10 ? v : v);
    return isValid(d) ? d : null;
  }
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  return null;
}

/** a.b.c 경로 접근 */
function getByPath(obj, path) {
  return path.split(".").reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
}

export default function Dashboard({ userId, userName }) {
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
    // 컬렉션명은 프로젝트에 따라 moveInCleanings / moveInCleaning 등일 수 있음
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
        const days = differenceInDays(d0, today0);
        const status = days < 0 ? "overdue" : days === 0 ? "today" : found <= soonEdge ? "soon" : "later";

        if (status === "overdue" || status === "today" || status === "soon") {
          items.push({
            id: v.id,
            villaName: v.name || v.villaName || "",
            district: v.district || "",
            address: v.address || "",
            date: found,
            days,
            status,
          });
        }
      });

      items.sort((a, b) => a.date - b.date);
      return { ...sec, items };
    });
  }, [villas, horizonDays]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 하단 섹션(업무 컬렉션) */
  const todayStr = format(now, "yyyy-MM-dd");

  const sectionMoveoutWait = useMemo(() => {
    // 진행현황: 정산대기 & moveDate == 오늘
    return moveouts
      .filter((m) => {
        const prog = (m.progress || m.status || "").trim();
        const md = (m.moveDate || "").slice(0, 10);
        return prog === "정산대기" && md === todayStr;
      })
      .sort((a, b) => String(a.villaName).localeCompare(String(b.villaName)));
  }, [moveouts, todayStr]);

  const sectionMoveoutDeposit = useMemo(() => {
    // 진행현황: 입금대기 전체
    return moveouts
      .filter((m) => (m.progress || m.status || "").trim() === "입금대기")
      .sort((a, b) => String(a.moveDate || "").localeCompare(String(b.moveDate || "")));
  }, [moveouts]);

  const sectionCleaningUnconfirmed = useMemo(() => {
    // 진행현황: 미확인 전체
    return cleanings
      .filter((c) => (c.progress || c.status || "").trim() === "미확인")
      .sort((a, b) => String(a.createdAt || 0) - String(b.createdAt || 0));
  }, [cleanings]);

  /** UI 유틸 */
  const ddText = (days) =>
    days < 0 ? `D${days}` : days === 0 ? "D-Day" : `D+${days}`;

  const ddColor = (status) =>
    status === "overdue"
      ? "text-red-600"
      : status === "today"
      ? "text-amber-700"
      : "text-yellow-700";

  /** 컴팩트 리스트 카드 */
  const TopCard = ({ title, icon, items, onOpen }) => (
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="px-4 py-2 font-medium border-b flex items-center gap-2">
        <i className={`${icon} text-lg text-purple-600`} />
        <span>{title}</span>
        <span className="ml-auto text-xs text-gray-400">{items.length}건</span>
      </div>
      <ul className="max-h-80 overflow-auto divide-y">
        {items.map((it) => (
          <li key={it.id} className="px-4 py-2 text-sm flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-medium truncate">{it.villaName || "-"}</div>
              <div className="text-xs text-gray-500 truncate">
                {(it.district || "") + (it.address ? ` · ${it.address}` : "")}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">
                {format(it.date, "yyyy-MM-dd (EEE)", { locale: ko })}
              </div>
              <div className={`text-xs ${ddColor(it.status)}`}>{ddText(it.days)}</div>
            </div>
          </li>
        ))}
        {!items.length && (
          <li className="px-4 py-6 text-sm text-gray-500">표시할 항목이 없습니다.</li>
        )}
      </ul>
      <div className="px-4 py-2 border-t">
        <button
          onClick={onOpen}
          className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50"
        >
          관련 페이지 열기
        </button>
      </div>
    </div>
  );

  const BottomCard = ({ title, items, renderRow, onOpen }) => (
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="px-4 py-2 font-medium border-b">{title} <span className="ml-1 text-xs text-gray-400">{items.length}건</span></div>
      <ul className="max-h-80 overflow-auto divide-y">
        {items.map((it) => (
          <li key={it.id} className="px-4 py-2 text-sm">{renderRow(it)}</li>
        ))}
        {!items.length && (
          <li className="px-4 py-6 text-sm text-gray-500">표시할 항목이 없습니다.</li>
        )}
      </ul>
      {onOpen && (
        <div className="px-4 py-2 border-t">
          <button
            onClick={onOpen}
            className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50"
          >
            관련 페이지 열기
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* 🔧 상단 타이틀/설명 제거, 임박 기준만 우측 정렬 */}
      <div className="flex items-center justify-end">
        <label className="text-sm text-gray-500 mr-2">임박 기준</label>
        <select
          value={horizonDays}
          onChange={(e) => setHorizonDays(parseInt(e.target.value || "30", 10))}
          className="border rounded-lg px-2 py-1 text-sm"
        >
          <option value={14}>14일</option>
          <option value={30}>30일</option>
          <option value={45}>45일</option>
        </select>
      </div>

      {/* 상단: 빌라 기반 임박 섹션 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {dateSections.map((sec) => (
          <TopCard
            key={sec.key}
            title={sec.title}
            icon={sec.icon}
            items={sec.items}
            onOpen={() => navigate(sec.route)}
          />
        ))}
      </div>

      {/* 하단: 업무 섹션 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BottomCard
          title="이사정산대기"
          items={sectionMoveoutWait}
          onOpen={() => navigate("/list")}
          renderRow={(m) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{m.villaName || "-"}</div>
                <div className="text-xs text-gray-500 truncate">
                  {(m.unitNumber ? `${m.unitNumber} · ` : "")}
                  {(m.moveDate || "").slice(0, 10)}
                </div>
              </div>
              <span className="text-xs text-amber-700">정산대기</span>
            </div>
          )}
        />
        <BottomCard
          title="이사정산 입금확인"
          items={sectionMoveoutDeposit}
          onOpen={() => navigate("/list")}
          renderRow={(m) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{m.villaName || "-"}</div>
                <div className="text-xs text-gray-500 truncate">
                  {(m.unitNumber ? `${m.unitNumber} · ` : "")}
                  {(m.moveDate || "").slice(0, 10)}
                </div>
              </div>
              <span className="text-xs text-blue-700">입금대기</span>
            </div>
          )}
        />
        <BottomCard
          title="입주청소 접수확인"
          items={sectionCleaningUnconfirmed}
          onOpen={() => navigate("/septic")} // 필요 시 MoveInCleaningPage 경로로 변경
          renderRow={(c) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{c.villaName || "-"}</div>
                <div className="text-xs text-gray-500 truncate">
                  {c.unitNumber || "-"}
                </div>
              </div>
              <span className="text-xs text-red-600">미확인</span>
            </div>
          )}
        />
      </div>
    </div>
  );
}
