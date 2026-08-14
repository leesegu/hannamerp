import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import {
  FiAlertTriangle,
  FiCamera,
  FiCheckCircle,
  FiChevronRight,
  FiClipboard,
  FiFileText,
  FiImage,
  FiPrinter,
  FiSave,
  FiSearch,
  FiX,
} from "react-icons/fi";
import "./ManagementLog.css";

const STORAGE_KEY = "hannam.managementLog.v1";

const INSPECTION_ITEMS = [
  { key: "cleaning", label: "공용부 청소상태" },
  { key: "entrance", label: "출입구·로비" },
  { key: "corridor", label: "복도·계단" },
  { key: "lighting", label: "공용 조명" },
  { key: "elevator", label: "승강기" },
  { key: "fire", label: "소방시설" },
  { key: "electrical", label: "전기시설" },
  { key: "water", label: "급·배수 / 누수" },
  { key: "septic", label: "정화조 · 오수" },
  { key: "parking", label: "주차·외부환경" },
  { key: "cctv", label: "CCTV·보안" },
  { key: "signage", label: "안내판·게시물" },
];

const STATUS_OPTIONS = ["미확인", "정상", "보완필요", "이상", "없음"];


const PAPER_INSPECTION_SECTIONS = [
  {
    title: "공용부 청소 및 위생",
    items: [
      "공동현관·로비·로비폰 청결",
      "각 층 복도·계단·난간·창틀 청결",
      "천장·벽면·모서리 거미줄 여부",
      "우편함·게시판·소화기 주변 청결",
      "공용부 악취·담배냄새·하수구 냄새 발생 여부",
      "복도·계단·현관 내 개인물품 및 불필요 적치물 여부",
    ],
  },
  {
    title: "출입구·로비·공동현관",
    items: [
      "공동현관문 개폐상태·작동상태",
      "공동현관 입구 파손·누수흔적 여부",
      "입구 미끄럼·안전위험 요소 여부",
    ],
  },
  {
    title: "공용 조명·전기시설",
    items: [
      "현관·로비 조명 정상 점등 여부",
      "복도·계단 센서등 작동 및 오작동 여부",
      "외부·주차장·간판 주변 조명 작동 여부",
      "분전함·계량기함 파손 여부",
      "전기함 내부 배선 피복손상·누수 여부",
      "주차차단기 작동·파손 여부",
    ],
  },
  {
    title: "승강기",
    items: [
      "승강기 운행·정지·층도착 상태 및 이상진동 여부",
      "내·외부 호출버튼 및 층표시기 정상 작동 여부",
      "승강기 문 개폐·문닫힘·안전센서 작동상태",
      "카 내부 조명·환기·거울·바닥·벽체 상태",
      "비상통화장치·비상벨 작동상태",
      "운행 중 소음·마찰음·충격 등 이상징후 여부",
      "승강기 검사표지·검사만료일 확인",
      "승강기 내부 및 문틀·레일 주변 청결상태",
    ],
  },
  {
    title: "소방시설·피난안전",
    items: [
      "소화기 비치위치·수량·봉인·압력게이지 상태",
      "소화기 사용기한 및 외관 부식·파손 여부",
      "비상구 유도등·통로유도등 정상 점등 여부",
      "감지기·발신기·비상벨 외관 및 탈락 여부",
      "소방수신기 경고·고장 표시 여부",
      "옥내소화전함·호스·관창·표지 상태",
      "방화문·방화셔터 개폐 및 고정물 설치 여부",
      "피난계단·비상통로 적치물 및 통행방해 여부",
    ],
  },
  {
    title: "급수·배수·누수",
    items: [
      "공용 수도계량기 및 주변 누수 여부",
      "노출 급수배관·밸브 부식·누수·동파 흔적 여부",
      "공용 배수구·트렌치 막힘 및 배수상태",
      "맨홀·배수구 주변 역류·오수·악취 여부",
      "천장·벽체·계단실 누수자국 또는 습기 여부",
      "우수관·배수관 이탈·파손·누수 여부",
      "동절기 보온재·열선 등 동파예방 상태",
    ],
  },
  {
    title: "정화조·오수시설",
    items: [
      "정화조·오수 맨홀 뚜껑 파손·들뜸·안전상태",
      "정화조 주변 오수 넘침·역류·누수 여부",
      "정화조·오수시설 주변 심한 악취 발생 여부",
      "오수배관·맨홀 연결부 파손 또는 막힘 징후 여부",
      "펌프·제어반이 있는 경우 이상표시 및 작동상태",
      "최근 작업일·작업예정일 및 청소주기 확인",
    ],
  },
  {
    title: "주차장·외부환경",
    items: [
      "주차금지 안내표지 식별상태",
      "폐기물·불법 적치물 및 장기방치물 여부",
      "건물 전면·측면·후면 쓰레기 무단투기 여부",
      "분리수거장 정리·용기파손·오염·악취 여부",
      "외벽·담장·기둥 균열·파손·낙하위험 여부",
      "화단·배수로 관리상태",
      "우천 시 물고임·배수불량 여부",
    ],
  },
  {
    title: "CCTV·보안",
    items: [
      "CCTV 카메라 외관·방향·렌즈오염 또는 가림 여부",
      "녹화장치 전원상태 여부",
      "CCTV 모니터 작동 여부",
      "사각지대 또는 추가 보안조치 필요 여부",
    ],
  },
  {
    title: "안내판·게시물·표지",
    items: [
      "건물 안내판·호수 표기 훼손 여부",
      "주차금지·쓰레기배출·금연 등 안내문 상태",
      "게시판 오래된 공지·불필요 광고물 정리 여부",
      "소방·전기·승강기 등 법정표지 부착 여부",
      "스티커·표지판 오염·내용변경 필요 여부",
    ],
  },
  {
    title: "옥상·기타시설",
    items: [
      "옥상 출입문 잠금 및 출입 가능 여부",
      "옥상 바닥 방수·균열·물고임 여부",
      "옥상 배수구 막힘·낙엽·이물질 여부",
      "옥상 적치물·쓰레기·악취·위험요소 여부",
      "기타 즉시 조치 또는 건물주 보고가 필요한 사항",
    ],
  },
];


const pad2 = (v) => String(v).padStart(2, "0");
const ymKey = (year, month) => `${year}-${pad2(month)}`;

const todayText = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
};

const monthsBetween = (from, to = new Date()) => {
  if (!from) return 999;
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return 999;
  return (to.getFullYear() - d.getFullYear()) * 12 + (to.getMonth() - d.getMonth());
};


const toDateSafe = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const s = raw.replace(/[./]/g, "-");
  const m = s.match(/^(\d{2}|\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    let y = Number(m[1]);
    if (m[1].length === 2) y += 2000;
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const out = new Date(y, mo - 1, d, 12, 0, 0, 0);
    return Number.isNaN(out.getTime()) ? null : out;
  }
  if (/^\d{8}$/.test(raw)) {
    return new Date(Number(raw.slice(0,4)), Number(raw.slice(4,6))-1, Number(raw.slice(6,8)), 12);
  }
  if (/^\d{6}$/.test(raw)) {
    return new Date(2000 + Number(raw.slice(0,2)), Number(raw.slice(2,4))-1, Number(raw.slice(4,6)), 12);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDateDot = (value) => {
  const d = toDateSafe(value);
  if (!d) return "-";
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
};

const addMonthsSafe = (date, months) => {
  if (!date) return null;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  d.setMonth(d.getMonth() + months);
  return d;
};

const addYearsSafe = (date, years) => {
  if (!date) return null;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  d.setFullYear(d.getFullYear() + years);
  return d;
};

const endOfReportMonth = (year, month) => new Date(year, month, 0, 23, 59, 59, 999);

const normalizeVillaName = (value) =>
  String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();

const isSameVillaName = (a, b) =>
  !!normalizeVillaName(a) && normalizeVillaName(a) === normalizeVillaName(b);

const isWithinPastMonths = (value, referenceDate, months) => {
  const d = toDateSafe(value);
  if (!d) return false;
  const min = addMonthsSafe(referenceDate, -months);
  return d >= min && d <= referenceDate;
};

const isWithinTwoMonthsBefore = (value, baseDate = new Date()) => {
  const target = toDateSafe(value);
  if (!target) return false;
  const from = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const to = addMonthsSafe(from, 2);
  return target >= from && target <= to;
};

const computeSepticReviewDate = (value) => {
  const work = toDateSafe(value);
  if (!work) return null;
  const d = addYearsSafe(work, 1);
  d.setDate(d.getDate() - 1);
  return d;
};

const buildRelatedReportData = ({ villa, year, month, moveouts, paperings, moveInCleanings }) => {
  const referenceDate = endOfReportMonth(year, month);
  const regularExpire = toDateSafe(villa?.regularExpire);
  const inspectionApply = toDateSafe(villa?.inspectionApply);
  const elevatorExists = !!String(villa?.elevator ?? "").trim();

  const elevatorLines = [];
  if (elevatorExists) {
    // ✅ 승강기 검사 관련 날짜는 값 유무와 관계없이 항상 표시
    elevatorLines.push(
      `승강기 검사만료 날짜: ${regularExpire ? formatDateDot(regularExpire) : "-"}`
    );
    elevatorLines.push(
      `승강기 검사예정 날짜: ${inspectionApply ? formatDateDot(inspectionApply) : "-"}`
    );
    elevatorLines.push(`승강기 보험사: ${String(villa?.insuranceCompany ?? "").trim() || "-"}`);
    elevatorLines.push(`보험기간: ${formatDateDot(villa?.contractStart)} ~ ${formatDateDot(villa?.contractEnd)}`);
  }

  const septicLines = [];
  if (villa?.septicDate) septicLines.push(`정화조 작업날짜: ${formatDateDot(villa.septicDate)}`);
  const septicReview = computeSepticReviewDate(villa?.septicDate);
  if (septicReview) septicLines.push(`정화조 작업예정: ${formatDateDot(septicReview)}`);

  const fireLines = [];
  const fireCompany = String(villa?.fireSafety ?? "").trim();
  const fireManager = String(villa?.fireSafetyManager ?? "").trim();
  const fireTraining = toDateSafe(villa?.fireSafetyTrainingDate);
  if (fireCompany || fireManager || fireTraining) {
    fireLines.push(`소방안전 업체: ${fireCompany || "-"}`);
    fireLines.push(`안전관리자: ${fireManager || "-"}`);
    fireLines.push(`소방안전 교육일자: ${formatDateDot(fireTraining)}`);
    fireLines.push(
      fireTraining
        ? `소방안전 재교육 안내: 교육일자를 기준으로 2년 이내 재교육을 받아야 하며 이후에도 2년마다 교육이 필요합니다. 다음 재교육 기준일 ${formatDateDot(addYearsSafe(fireTraining, 2))}`
        : "소방안전 재교육 안내: 교육일자를 기준으로 2년 이내 재교육을 받아야 하며 이후에도 2년마다 교육이 필요합니다."
    );
  }

  const moveoutRows = (moveouts || [])
    .filter((x) => isSameVillaName(x?.villaName, villa?.name))
    .filter((x) => isWithinPastMonths(x?.moveDate, referenceDate, 1));

  const recentPaperings = (paperings || [])
    .filter((x) => isSameVillaName(x?.villaName, villa?.name))
    .filter((x) => isWithinPastMonths(x?.receivedDate || x?.settleDate || x?.completedDate, referenceDate, 3));

  const recentCleanings = (moveInCleanings || [])
    .filter((x) => isSameVillaName(x?.villaName, villa?.name))
    .filter((x) => isWithinPastMonths(x?.receivedDate || x?.settleDate || x?.completedDate, referenceDate, 3));

  const autoLines = [...elevatorLines, ...septicLines, ...fireLines];
  moveoutRows.forEach((x) =>
    autoLines.push(`${x.villaName || villa.name} ${x.unitNumber || "-"}호 / ${formatDateDot(x.moveDate)} 퇴실 / 진행현황: ${String(x.status ?? "").trim() || "-"}`)
  );
  recentPaperings.forEach((x) =>
    autoLines.push(`도배: ${x.villaName || villa.name} ${x.unitNumber || "-"}호 / 접수 ${formatDateDot(x.receivedDate)} / 진행현황 ${String(x.status ?? "").trim() || "-"} / 완료 ${formatDateDot(x.completedDate)}`)
  );
  recentCleanings.forEach((x) =>
    autoLines.push(`입주청소: ${x.villaName || villa.name} ${x.unitNumber || "-"}호 / 접수 ${formatDateDot(x.receivedDate)} / 진행현황 ${String(x.status ?? "").trim() || "-"} / 완료 ${formatDateDot(x.completedDate)}`)
  );

  return {
    elevatorExists,
    elevatorLines,
    septicLines,
    fireLines,
    moveouts: moveoutRows,
    paperings: recentPaperings,
    cleanings: recentCleanings,
    autoOwnerReportNote: autoLines.join("\n"),
  };
};

const makeItemMap = () =>
  Object.fromEntries(
    INSPECTION_ITEMS.map((item) => [item.key, { status: "미확인", note: "" }])
  );



const emptyLog = (villa) => ({
  villaId: villa.id,
  villaName: villa.name,
  villaCode: villa.code,
  address: villa.address,
  checkedAt: "",
  checkedBy: "",
  items: makeItemMap(),
  issueSummary: "",
  actionSummary: "",
  ownerReportNote: "",
  internalMemo: "",
  photos: [],
  updatedAt: "",
});

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function findPersistentNoneItems(store, villaId, currentYm) {
  const result = new Set();
  Object.entries(store || {})
    .filter(([ym]) => ym !== currentYm)
    .forEach(([, monthData]) => {
      const items = monthData?.[villaId]?.items || {};
      Object.entries(items).forEach(([key, value]) => {
        if (value?.status === "없음") result.add(key);
      });
    });
  return result;
}

function normalizeLog(villa, source, store, currentYm) {
  const base = emptyLog(villa);
  const merged = {
    ...base,
    ...(source || {}),
    items: {
      ...base.items,
      ...(source?.items || {}),
    },
  };

  const persistentNone = findPersistentNoneItems(store, villa.id, currentYm);
  persistentNone.forEach((key) => {
    if (!source?.items?.[key] || source.items[key].status === "미확인") {
      merged.items[key] = { ...merged.items[key], status: "없음" };
    }
  });

  // 승강기 페이지 목록 기준과 동일하게 elevator 값이 없으면
  // 관리일지의 승강기 항목은 항상 "없음"으로 고정합니다.
  if (!String(villa?.elevator ?? "").trim()) {
    merged.items.elevator = {
      ...(merged.items.elevator || { note: "" }),
      status: "없음",
    };
  }

  return merged;
}

function getOverallStatus(log) {
  const values = Object.values(log?.items || {}).map((v) => v.status);
  const actualChecked = values.filter((v) => !["미확인", "없음"].includes(v));

  if (!actualChecked.length) return "미확인";
  if (values.includes("이상")) return "이상";
  if (values.includes("보완필요")) return "보완필요";
  if (values.some((v) => v === "미확인")) return "점검중";
  return "정상";
}

function getProgress(log) {
  const values = Object.values(log?.items || {});
  const applicable = values.filter((v) => v.status !== "없음");
  if (!applicable.length) return 100;
  const done = applicable.filter((v) => v.status !== "미확인").length;
  return Math.round((done / applicable.length) * 100);
}

function hasActualInspection(log) {
  return Object.values(log?.items || {}).some((v) =>
    ["정상", "보완필요", "이상"].includes(v.status)
  );
}

export default function ManagementLog() {
  const now = new Date();
  // ✅ 관리일지 화면은 월 선택 개념을 제거하고 현재 날짜 기준으로만 동작
  // 기존 localStorage 월별 저장 구조는 내부적으로 유지하여 과거 점검 이력을 보존합니다.
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const [villas, setVillas] = useState([]);
  const [villasLoading, setVillasLoading] = useState(true);
  const [villasError, setVillasError] = useState("");
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState("전체");
  const [store, setStore] = useState(() => readStore());
  const [selectedVillaId, setSelectedVillaId] = useState(null);
  const [reportVillaId, setReportVillaId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [inspectionSheetOpen, setInspectionSheetOpen] = useState(false);
  const [moveouts, setMoveouts] = useState([]);
  const [paperings, setPaperings] = useState([]);
  const [moveInCleanings, setMoveInCleanings] = useState([]);

  const currentYm = ymKey(year, month);
  const monthStore = store[currentYm] || {};

  useEffect(() => {
    let alive = true;

    const fetchAll = async () => {
      setVillasLoading(true);
      setVillasError("");

      try {
        const [villaSnap, moveoutSnap, paperingSnap, cleaningSnap] = await Promise.all([
          getDocs(collection(db, "villas")),
          getDocs(collection(db, "moveouts")),
          getDocs(collection(db, "paperings")),
          getDocs(collection(db, "moveInCleanings")),
        ]);

        const villaList = villaSnap.docs
          .map((d) => {
            const raw = d.data() || {};
            return {
              id: d.id,
              ...raw,
              code: String(raw.code ?? d.id ?? "").trim(),
              name: String(raw.name ?? "").trim(),
              address: String(raw.address ?? "").trim(),
            };
          })
          .filter((villa) => villa.name || villa.code || villa.address)
          .sort((a, b) =>
            a.code.localeCompare(b.code, "ko", { numeric: true, sensitivity: "base" })
          );

        if (!alive) return;

        setVillas(villaList);
        setMoveouts(moveoutSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setPaperings(paperingSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setMoveInCleanings(cleaningSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("[ManagementLog] 연동 데이터 로딩 실패:", error);
        if (alive) {
          setVillas([]);
          setMoveouts([]);
          setPaperings([]);
          setMoveInCleanings([]);
          setVillasError("관리일지 연동 데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
        }
      } finally {
        if (alive) setVillasLoading(false);
      }
    };

    fetchAll();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  const rows = useMemo(() => {
    return villas.map((villa) => {
      const latestSaved = monthStore[villa.id] || findLatestSavedLog(store, villa.id);
      const log = normalizeLog(villa, latestSaved, store, currentYm);
      const overallStatus = getOverallStatus(log);
      const progress = getProgress(log);
      const checkedDates = findCheckedDates(store, villa.id);
      const latestChecked = checkedDates[0] || "";
      const previousChecked = checkedDates[1] || "";
      const overdueMonths = monthsBetween(latestChecked);
      return {
        villa,
        log,
        overallStatus,
        progress,
        latestChecked,
        previousChecked,
        overdue: overdueMonths >= 3,
        overdueMonths,
      };
    });
  }, [villas, monthStore, store, currentYm]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const text = `${row.villa.name} ${row.villa.code} ${row.villa.address}`.toLowerCase();
      const matchesSearch = !q || text.includes(q);
      let matchesQuick = true;
      if (quickFilter === "점검완료") {
        matchesQuick = ["정상", "보완필요", "이상"].includes(row.overallStatus);
      }
      if (quickFilter === "진행중") matchesQuick = row.overallStatus === "점검중";
      if (quickFilter === "미확인") matchesQuick = row.overallStatus === "미확인";
      if (quickFilter === "보완·이상") matchesQuick = ["보완필요", "이상"].includes(row.overallStatus);
      if (quickFilter === "장기미확인") matchesQuick = row.overdue;

      return matchesSearch && matchesQuick;
    });
  }, [rows, search, quickFilter]);

  const summary = useMemo(() => {
    const checked = rows.filter((r) =>
      ["정상", "보완필요", "이상"].includes(r.overallStatus)
    ).length;
    const inProgress = rows.filter((r) => r.overallStatus === "점검중").length;
    const unchecked = rows.filter((r) => r.overallStatus === "미확인").length;
    const normal = rows.filter((r) => r.overallStatus === "정상").length;
    const issue = rows.filter((r) => ["보완필요", "이상"].includes(r.overallStatus)).length;
    const overdue = rows.filter((r) => r.overdue).length;

    return {
      total: rows.length,
      checked,
      inProgress,
      unchecked,
      normal,
      issue,
      overdue,
      progress: rows.length ? Math.round((checked / rows.length) * 100) : 0,
    };
  }, [rows]);

  const selectedReportRow = useMemo(
    () => rows.find((row) => row.villa.id === reportVillaId) || null,
    [rows, reportVillaId]
  );

  const selectedReportRelated = useMemo(() => {
    if (!selectedReportRow) return null;
    return buildRelatedReportData({
      villa: selectedReportRow.villa,
      year,
      month,
      moveouts,
      paperings,
      moveInCleanings,
    });
  }, [selectedReportRow, year, month, moveouts, paperings, moveInCleanings]);

  const openEditor = (villaId) => {
    const villa = villas.find((v) => v.id === villaId);
    if (!villa) return;

    const latestSaved = monthStore[villaId] || findLatestSavedLog(store, villaId);
    const source = normalizeLog(villa, latestSaved, store, currentYm);
    const related = buildRelatedReportData({
      villa,
      year,
      month,
      moveouts,
      paperings,
      moveInCleanings,
    });

    setSelectedVillaId(villaId);
    setDraft(
      JSON.parse(
        JSON.stringify({
          ...source,
          ownerReportNote:
            source.ownerReportNote?.trim()
              ? source.ownerReportNote
              : related.autoOwnerReportNote,
        })
      )
    );
  };

  const closeEditor = () => {
    setSelectedVillaId(null);
    setDraft(null);
  };

  const updateItem = (key, patch) => {
    const currentVilla = villas.find((v) => v.id === selectedVillaId);

    if (
      key === "elevator" &&
      !String(currentVilla?.elevator ?? "").trim() &&
      patch?.status &&
      patch.status !== "없음"
    ) {
      window.alert("여기는 승강기 없는 건물입니다. 승강기 항목은 '없음'으로 유지해 주세요.");
      return;
    }

    setDraft((prev) => {
      const next = {
        ...prev,
        items: {
          ...prev.items,
          [key]: { ...prev.items[key], ...patch },
        },
      };

      if (patch.status && ["정상", "보완필요", "이상"].includes(patch.status) && !next.checkedAt) {
        next.checkedAt = todayText();
      }

      return next;
    });
  };

  const setAllNormal = () => {
    setDraft((prev) => ({
      ...prev,
      checkedAt: prev.checkedAt || todayText(),
      items: Object.fromEntries(
        INSPECTION_ITEMS.map((item) => [
          item.key,
          {
            ...prev.items[item.key],
            status: prev.items[item.key]?.status === "없음" ? "없음" : "정상",
          },
        ])
      ),
    }));
  };

  const setAllUnchecked = () => {
    setDraft((prev) => ({
      ...prev,
      checkedAt: "",
      checkedBy: "",
      items: Object.fromEntries(
        INSPECTION_ITEMS.map((item) => [
          item.key,
          {
            ...prev.items[item.key],
            status: prev.items[item.key]?.status === "없음" ? "없음" : "미확인",
          },
        ])
      ),
    }));
  };

  const saveDraft = () => {
    if (!draft || !selectedVillaId) return;

    if (hasActualInspection(draft) && !draft.checkedBy.trim()) {
      window.alert("점검한 내용이 있는 경우 점검자 이름을 입력해야 저장할 수 있습니다.");
      return;
    }

    const payload = {
      ...draft,
      checkedBy: draft.checkedBy.trim(),
      updatedAt: new Date().toISOString(),
    };

    setStore((prev) => ({
      ...prev,
      [currentYm]: {
        ...(prev[currentYm] || {}),
        [selectedVillaId]: payload,
      },
    }));
    closeEditor();
  };

  const addPhotos = async (files) => {
    const list = Array.from(files || []).slice(0, Math.max(0, 6 - (draft?.photos?.length || 0)));
    if (!list.length) return;
    const photos = await Promise.all(
      list.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: file.name,
                dataUrl: reader.result,
                caption: "",
              });
            reader.readAsDataURL(file);
          })
      )
    );
    setDraft((prev) => ({ ...prev, photos: [...(prev.photos || []), ...photos] }));
  };

  const removePhoto = (id) => {
    setDraft((prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== id) }));
  };

  const updatePhotoCaption = (id, caption) => {
    setDraft((prev) => ({
      ...prev,
      photos: prev.photos.map((p) => (p.id === id ? { ...p, caption } : p)),
    }));
  };

  const openInspectionSheet = () => {
    setInspectionSheetOpen(true);
  };

  const printInspectionSheet = () => {
    setInspectionSheetOpen(true);
    setTimeout(() => window.print(), 100);
  };

  const openReport = () => {
    if (!selectedReportRow) {
      window.alert("월간보고서를 확인할 건물을 목록에서 먼저 선택해 주세요.");
      return;
    }
    setReportOpen(true);
  };

  const printReport = () => {
    if (!selectedReportRow) return;
    setReportOpen(true);
    setTimeout(() => window.print(), 100);
  };

  const toggleReportVilla = (villaId) => {
    setReportVillaId((prev) => (prev === villaId ? null : villaId));
  };

  const applyQuickFilter = (filter) => {
    setQuickFilter(filter);
  };

  return (
    <div className="ml-page">
      <header className="ml-header">
        <div className="ml-title-block">
          <div className="ml-eyebrow">FACILITY MANAGEMENT LOG</div>
          <h1>관리일지</h1>
          <p>건물별 시설점검·청소상태·이상사항과 조치현황을 누적 관리합니다.</p>
        </div>

        <div className="ml-header-actions">
          {summary.overdue > 0 && (
            <div className="ml-overdue-banner ml-overdue-inline">
              <div className="ml-overdue-icon"><FiAlertTriangle /></div>
              <div>
                <strong>3개월 이상 점검 확인이 없는 건물이 {summary.overdue}곳 있습니다.</strong>
                <span>장기 미확인 건물을 우선 점검해 주세요.</span>
              </div>
            </div>
          )}

          <div className="ml-search-box">
            <FiSearch />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="빌라명·주소·코드 검색"
            />
          </div>

          <div className="ml-progress-total ml-progress-top">
            <span>전체 진행률</span>
            <strong>{summary.progress}%</strong>
          </div>

          <button className="ml-inspection-sheet-btn" onClick={openInspectionSheet}>
            <FiClipboard /> 점검일지
          </button>

          <button className="ml-report-btn" onClick={openReport}>
            <FiFileText /> 월간보고서
          </button>
        </div>
      </header>

      <section className="ml-summary-grid">
        <SummaryCard
          label="전체 관리건물"
          value={`${summary.total}곳`}
          sub="관리 대상 건물"
          active={quickFilter === "전체"}
          onClick={() => applyQuickFilter("전체")}
        />
        <SummaryCard
          label="점검 완료"
          value={`${summary.checked}곳`}
          sub={`진행률 ${summary.progress}%`}
          accent="blue"
          active={quickFilter === "점검완료"}
          onClick={() => applyQuickFilter("점검완료")}
        />
        <SummaryCard
          label="진행중"
          value={`${summary.inProgress}곳`}
          sub="일부 항목 점검 중"
          accent="purple"
          active={quickFilter === "진행중"}
          onClick={() => applyQuickFilter("진행중")}
        />
        <SummaryCard
          label="미확인"
          value={`${summary.unchecked}곳`}
          sub="미점검 건물"
          accent="gray"
          active={quickFilter === "미확인"}
          onClick={() => applyQuickFilter("미확인")}
        />
        <SummaryCard
          label="보완·이상"
          value={`${summary.issue}곳`}
          sub="조치 확인 필요"
          accent="orange"
          active={quickFilter === "보완·이상"}
          onClick={() => applyQuickFilter("보완·이상")}
        />
        <SummaryCard
          label="3개월 이상 장기 미확인"
          value={`${summary.overdue}곳`}
          sub="우선 확인 대상"
          accent="red"
          active={quickFilter === "장기미확인"}
          onClick={() => applyQuickFilter("장기미확인")}
        />
      </section>

      <section className="ml-list-card">
        <div className="ml-table-wrap">
          <table className="ml-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>코드</th>
                <th className="ml-align-left">건물명 / 주소</th>
                <th>점검상태</th>
                <th>진행률</th>
                <th>마지막 점검일</th>
                <th>최종 확인일</th>
                <th>사진</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr
                  key={row.villa.id}
                  className={`${row.overdue ? "ml-row-overdue" : ""} ${reportVillaId === row.villa.id ? "ml-row-selected" : ""}`}
                  onClick={() => toggleReportVilla(row.villa.id)}
                  title={
                    reportVillaId === row.villa.id
                      ? "클릭하면 월간보고서 선택이 해제됩니다."
                      : "클릭하면 월간보고서 대상 건물로 선택됩니다."
                  }
                >
                  <td>{index + 1}</td>
                  <td className="ml-code">{row.villa.code}</td>
                  <td className="ml-align-left">
                    <div className="ml-villa-name-row">
                      <strong>{row.villa.name}</strong>
                      {reportVillaId === row.villa.id && <span className="ml-selected-badge">보고서 선택</span>}
                      {row.overdue && <span className="ml-mini-warning">장기 미확인</span>}
                    </div>
                    <span className="ml-address">{row.villa.address}</span>
                  </td>
                  <td><StatusBadge status={row.overallStatus} /></td>
                  <td>
                    <div className="ml-progress-cell">
                      <div className="ml-progress-track"><i style={{ width: `${row.progress}%` }} /></div>
                      <span>{row.progress}%</span>
                    </div>
                  </td>
                  <td>{formatDate(row.previousChecked)}</td>
                  <td>{formatDate(row.latestChecked)}</td>
                  <td><span className="ml-photo-count"><FiImage /> {row.log.photos?.length || 0}</span></td>
                  <td>
                    <button
                      className="ml-open-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditor(row.villa.id);
                      }}
                    >
                      점검하기 <FiChevronRight />
                    </button>
                  </td>
                </tr>
              ))}
              {villasLoading && (
                <tr><td colSpan="9" className="ml-empty">코드별빌라 목록을 불러오는 중입니다.</td></tr>
              )}
              {!villasLoading && villasError && (
                <tr><td colSpan="9" className="ml-empty ml-empty-error">{villasError}</td></tr>
              )}
              {!villasLoading && !villasError && !filteredRows.length && (
                <tr><td colSpan="9" className="ml-empty">조건에 맞는 건물이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {draft && (
        <div className="ml-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeEditor()}>
          <div className="ml-modal">
            <div className="ml-modal-head">
              <div>
                <span>시설·환경 점검 기록</span>
                <h2>{draft.villaName}</h2>
                <p>{draft.address}</p>
              </div>
            </div>

            <div className="ml-modal-body">
              <section className="ml-form-section">
                <div className="ml-section-title-row">
                  <div>
                    <h3>점검 기본정보</h3>
                    <p>실제 현장 확인일과 담당자를 기록합니다.</p>
                  </div>
                  <div className="ml-section-actions">
                    <button className="ml-all-unchecked-btn" onClick={setAllUnchecked}>전체 미확인</button>
                    <button className="ml-all-normal-btn" onClick={setAllNormal}><FiCheckCircle /> 전체 정상</button>
                  </div>
                </div>
                <div className="ml-form-grid two">
                  <label
                    className="ml-date-field"
                    onClick={(e) => {
                      const input = e.currentTarget.querySelector("input");
                      if (input && e.target !== input) input.showPicker?.();
                    }}
                  >
                    점검일
                    <input
                      type="date"
                      value={draft.checkedAt}
                      onChange={(e) => setDraft({ ...draft, checkedAt: e.target.value })}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                    />
                  </label>
                  <label>
                    점검자
                    <input
                      value={draft.checkedBy}
                      onChange={(e) => setDraft({ ...draft, checkedBy: e.target.value })}
                      placeholder="예: 이용진"
                    />
                  </label>
                </div>
              </section>

              <section className="ml-form-section">
                <div className="ml-section-title-row">
                  <div>
                    <h3>시설·환경 점검</h3>
                    <p>각 항목별 상태를 선택하고 필요할 때만 세부내용을 작성합니다.</p>
                  </div>
                  <span className="ml-section-progress">진행률 {getProgress(draft)}%</span>
                </div>
                <div className="ml-inspection-grid">
                  {INSPECTION_ITEMS.map((item) => (
                    <div className="ml-inspection-item" key={item.key}>
                      <div className="ml-inspection-top">
                        <strong>{item.label}</strong>
                        <div className="ml-segmented">
                          {STATUS_OPTIONS.map((status) => (
                            <button
                              type="button"
                              key={status}
                              className={draft.items[item.key]?.status === status ? `active status-${status}` : ""}
                              onClick={() => updateItem(item.key, { status })}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        value={draft.items[item.key]?.note || ""}
                        onChange={(e) => updateItem(item.key, { note: e.target.value })}
                        placeholder="특이사항이 있을 경우 입력"
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="ml-form-section">
                <h3>이상사항 및 조치현황</h3>
                <div className="ml-form-grid two">
                  <label>
                    이상사항 요약
                    <textarea
                      rows="4"
                      value={draft.issueSummary}
                      onChange={(e) => setDraft({ ...draft, issueSummary: e.target.value })}
                      placeholder="발견된 이상사항을 요약해 주세요."
                    />
                  </label>
                  <label>
                    조치내용 / 진행상황
                    <textarea
                      rows="4"
                      value={draft.actionSummary}
                      onChange={(e) => setDraft({ ...draft, actionSummary: e.target.value })}
                      placeholder="완료, 조치예정, 업체접수 등 진행상황을 기록해 주세요."
                    />
                  </label>
                </div>
              </section>

              <section className="ml-form-section">
                <h3>사진 첨부</h3>
                <label className="ml-photo-upload">
                  <FiCamera />
                  <strong>사진 추가</strong>
                  <span>점검사진 또는 이상부위 사진을 선택하세요.</span>
                  <input type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} />
                </label>
                {!!draft.photos?.length && (
                  <div className="ml-photo-grid">
                    {draft.photos.map((photo) => (
                      <div className="ml-photo-card" key={photo.id}>
                        <img src={photo.dataUrl} alt={photo.name} />
                        <button onClick={() => removePhoto(photo.id)}><FiX /></button>
                        <input
                          value={photo.caption || ""}
                          onChange={(e) => updatePhotoCaption(photo.id, e.target.value)}
                          placeholder="사진 설명"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="ml-form-section ml-report-separation">
                <div>
                  <h3>월간보고서 기재내용</h3>
                  <p>건물주에게 전달할 수 있는 문구입니다.</p>
                  <textarea
                    rows="4"
                    value={draft.ownerReportNote}
                    onChange={(e) => setDraft({ ...draft, ownerReportNote: e.target.value })}
                    placeholder="예: 공용부 상태 양호. 3층 센서등 교체 예정."
                  />
                </div>
                <div>
                  <h3>내부 메모 <span>보고서 미출력</span></h3>
                  <p>직원 간 공유용으로만 사용합니다.</p>
                  <textarea
                    rows="4"
                    value={draft.internalMemo}
                    onChange={(e) => setDraft({ ...draft, internalMemo: e.target.value })}
                    placeholder="건물주 전달 제외 내부 메모"
                  />
                </div>
              </section>
            </div>

            <div className="ml-modal-foot">
              <button className="ml-save-btn" onClick={saveDraft}><FiSave /> 저장</button>
              <button className="ml-cancel-btn" onClick={closeEditor}>취소</button>
            </div>
          </div>
        </div>
      )}

      {inspectionSheetOpen && (
        <div className="ml-report-overlay ml-inspection-overlay">
          <div className="ml-report-toolbar no-print">
            <div>
              <strong>공용 현장 점검일지</strong>
              <span>빌라명·주소·점검자·점검일자를 현장에서 직접 기입하는 A4 수기용 체크리스트</span>
            </div>
            <div>
              <button onClick={() => setInspectionSheetOpen(false)}>닫기</button>
              <button className="primary" onClick={printInspectionSheet}>
                <FiPrinter /> 출력 / PDF 저장
              </button>
            </div>
          </div>

          <InspectionSheet />
        </div>
      )}

      {reportOpen && selectedReportRow && (
        <div className="ml-report-overlay">
          <div className="ml-report-toolbar no-print">
            <div>
              <strong>{selectedReportRow.villa.name} · {year}년 {month}월 월간 관리보고서</strong>
              <span>단일 건물 보고서 미리보기</span>
            </div>
            <div>
              <button onClick={() => setReportOpen(false)}>닫기</button>
              <button className="primary" onClick={printReport}><FiPrinter /> 인쇄 / PDF 저장</button>
            </div>
          </div>

          <MonthlyReport
            year={year}
            month={month}
            row={selectedReportRow}
            related={selectedReportRelated}
          />
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, accent = "default", active = false, onClick }) {
  return (
    <button
      type="button"
      className={`ml-summary-card accent-${accent} ${active ? "is-active" : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </button>
  );
}

function StatusBadge({ status }) {
  return <span className={`ml-status status-${status}`}>{status}</span>;
}

function findLatestSavedLog(store, villaId) {
  let latestYm = "";
  let latestLog = null;

  Object.entries(store || {}).forEach(([ym, monthData]) => {
    const log = monthData?.[villaId];
    if (!log) return;

    const sortKey = String(log.updatedAt || log.checkedAt || ym || "");
    const currentKey = latestLog
      ? String(latestLog.updatedAt || latestLog.checkedAt || latestYm || "")
      : "";

    if (!latestLog || sortKey > currentKey) {
      latestYm = ym;
      latestLog = log;
    }
  });

  return latestLog;
}

function findCheckedDates(store, villaId) {
  const uniqueDates = new Set();

  Object.values(store || {}).forEach((monthData) => {
    const log = monthData?.[villaId];
    if (!log || getOverallStatus(log) === "미확인") return;

    const date = String(log.checkedAt || "").trim();
    if (date) uniqueDates.add(date);
  });

  return Array.from(uniqueDates).sort((a, b) => {
    const ad = new Date(a).getTime();
    const bd = new Date(b).getTime();
    return bd - ad;
  });
}


function PaperCheckBoxes() {
  return (
    <div className="ml-paper-statuses">
      <span><i /> 정상</span>
      <span><i /> 보완</span>
      <span><i /> 이상</span>
      <span><i /> 해당없음</span>
    </div>
  );
}

function InspectionSheet() {
  const page1Sections = PAPER_INSPECTION_SECTIONS.slice(0, 4);
  const page2Sections = PAPER_INSPECTION_SECTIONS.slice(4, 8);
  const page3Sections = PAPER_INSPECTION_SECTIONS.slice(8);

  const renderSection = (section, sectionIndex) => (
    <section className="ml-paper-section" key={section.title}>
      <div className="ml-paper-section-head">
        <strong>{String(sectionIndex + 1).padStart(2, "0")}</strong>
        <h2>{section.title}</h2>
      </div>
      <table className="ml-paper-table">
        <thead>
          <tr>
            <th>세부 점검사항</th>
            <th>상태 체크</th>
            <th>비고 / 조치 필요사항</th>
          </tr>
        </thead>
        <tbody>
          {section.items.map((item) => (
            <tr key={item}>
              <td>{item}</td>
              <td><PaperCheckBoxes /></td>
              <td className="ml-paper-write-cell" />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );

  const PageHeader = ({ compact = false }) => (
    <header className={`ml-paper-header ${compact ? "ml-paper-header-small" : ""}`}>
      <div>
        <span>{compact ? "BUILDING INSPECTION CHECKLIST" : "HANNAM PROPERTY MANAGEMENT"}</span>
        <h1>건물 현장 점검일지</h1>
        {!compact && <p>공용부 청소 · 시설안전 · 유지보수 · 이상사항 확인용</p>}
      </div>
      <strong>한남주택관리</strong>
    </header>
  );

  const PageFooter = ({ page }) => (
    <footer className="ml-paper-page-footer">
      <span>현장 점검일지 {page} / 3</span>
      <strong>한남주택관리 · 042-489-8555</strong>
    </footer>
  );

  return (
    <main className="ml-inspection-sheet">
      <section className="ml-paper-page">
        <PageHeader />

        <div className="ml-paper-basic ml-paper-basic-manual">
          <div><span>빌라명</span><b /></div>
          <div><span>점검자</span><b /></div>
          <div className="wide"><span>주소</span><b /></div>
          <div><span>점검일자</span><b>20&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일</b></div>
          <div><span>점검시간</span><b>&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;&nbsp;&nbsp; ~ &nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;&nbsp;&nbsp;</b></div>
          <div><span>날씨</span><b /></div>
          <div><span>현장 특이사항</span><b /></div>
        </div>

        <div className="ml-paper-guide">
          현장에서 해당 건물의 빌라명과 주소를 직접 작성한 후 각 세부 항목을 확인합니다.
          상태란에 체크하고, 보완·이상 항목은 비고란에 위치·원인·조치 필요내용을 구체적으로 기록합니다.
        </div>

        {page1Sections.map((section, index) => renderSection(section, index))}
        <PageFooter page={1} />
      </section>

      <section className="ml-paper-page ml-paper-page-break">
        <PageHeader compact />

        <div className="ml-paper-repeat-info">
          <span>빌라명</span><b />
          <span>점검일자</span><b>20&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일</b>
        </div>

        {page2Sections.map((section, index) =>
          renderSection(section, index + page1Sections.length)
        )}
        <PageFooter page={2} />
      </section>

      <section className="ml-paper-page ml-paper-page-break">
        <PageHeader compact />

        <div className="ml-paper-repeat-info">
          <span>빌라명</span><b />
          <span>점검일자</span><b>20&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일</b>
        </div>

        {page3Sections.map((section, index) =>
          renderSection(section, index + page1Sections.length + page2Sections.length)
        )}

        <section className="ml-paper-free-section">
          <h2>종합 점검의견 및 추가 확인사항</h2>
          <div className="ml-paper-lines">
            {Array.from({ length: 5 }, (_, i) => <i key={i} />)}
          </div>
        </section>

        <section className="ml-paper-free-section ml-paper-action-section">
          <h2>보완·수리·업체접수 등 조치 필요사항</h2>
          <table>
            <thead>
              <tr>
                <th>위치 / 항목</th>
                <th>확인내용</th>
                <th>조치계획 / 업체</th>
                <th>완료확인</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }, (_, i) => (
                <tr key={i}>
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ml-paper-sign">
          <div><span>점검자 서명</span><b /></div>
          <div><span>확인자 / 관리자</span><b /></div>
          <div><span>건물주 보고 필요</span><em>□ 필요 &nbsp;&nbsp; □ 불필요 &nbsp;&nbsp; □ 추후확인</em></div>
        </section>

        <PageFooter page={3} />
      </section>
    </main>
  );
}

function MonthlyReport({ year, month, row, related }) {
  const { villa, log, overallStatus, progress } = row;
  const inspectionNotes = INSPECTION_ITEMS
    .map((item) => {
      const current = log.items?.[item.key] || { status: "미확인", note: "" };
      return {
        label: item.label,
        status: current.status,
        note: current.note || "",
      };
    });

  const issueExists = ["보완필요", "이상"].includes(overallStatus) || !!log.issueSummary || !!log.actionSummary;

  return (
    <main className="ml-report-sheet">
      <section className="ml-report-cover">
        <div className="ml-report-brand">한남주택관리</div>
        <div className="ml-report-title-group">
          <span>MONTHLY PROPERTY MANAGEMENT REPORT</span>
          <h1>{year}년 {month}월 월간 관리보고서</h1>
          <p>시설점검 · 공용부 환경관리 · 이상사항 및 조치현황</p>
        </div>
        <div className="ml-report-meta">
          <div><span>관리건물</span><strong>{villa.name}</strong></div>
          <div><span>보고기간</span><strong>{year}년 {month}월</strong></div>
          <div><span>작성일</span><strong>{formatDate(todayText())}</strong></div>
        </div>
      </section>

      <section className="ml-report-section">
        <div className="ml-report-section-title"><span>01</span><h2>건물 관리 현황</h2></div>
        <div className="ml-report-kpis">
          <div><span>건물명</span><strong className="text-kpi">{villa.name}</strong></div>
          <div><span>점검상태</span><strong className="text-kpi">{overallStatus}</strong></div>
          <div><span>점검진행률</span><strong>{progress}</strong><small>%</small></div>
          <div><span>점검일</span><strong className="text-kpi">{formatDate(log.checkedAt)}</strong></div>
        </div>
        <p className="ml-report-comment">
          {log.ownerReportNote ||
            related?.autoOwnerReportNote ||
            `${villa.name}의 ${year}년 ${month}월 정기 관리·점검 결과입니다.`}
        </p>
      </section>

      <section className="ml-report-section">
        <div className="ml-report-section-title"><span>02</span><h2>건물별 점검 결과</h2></div>
        <table className="ml-report-table ml-report-single-table">
          <thead>
            <tr><th>점검항목</th><th>상태</th><th>확인내용</th></tr>
          </thead>
          <tbody>
            {inspectionNotes.map((item) => (
              <tr key={item.label}>
                <td><strong>{item.label}</strong></td>
                <td><StatusBadge status={item.status} /></td>
                <td>{item.note || (item.status === "없음" ? "해당 시설 없음" : "특이사항 없음")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ml-report-section">
        <div className="ml-report-section-title"><span>03</span><h2>이상사항 및 조치현황</h2></div>
        {issueExists ? (
          <div className="ml-report-issues">
            <article>
              <div className="ml-report-issue-head">
                <div><strong>{villa.name}</strong><span>{villa.address}</span></div>
                <StatusBadge status={overallStatus} />
              </div>
              <div className="ml-report-issue-body">
                <div><span>이상사항</span><p>{log.issueSummary || "별도 이상사항 기록 없음"}</p></div>
                <div><span>조치현황</span><p>{log.actionSummary || "별도 조치내용 기록 없음"}</p></div>
              </div>
              {!!log.photos?.length && (
                <div className="ml-report-photo-grid">
                  {log.photos.slice(0, 6).map((photo) => (
                    <figure key={photo.id}>
                      <img src={photo.dataUrl} alt={photo.name} />
                      <figcaption>{photo.caption || "현장 점검사진"}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </article>
          </div>
        ) : (
          <div className="ml-report-good">
            <FiCheckCircle />
            <strong>주요 이상사항 없음</strong>
            <span>현재 입력된 관리일지 기준으로 별도 보고가 필요한 주요 이상사항이 없습니다.</span>
          </div>
        )}
      </section>

      {related &&
        (related.elevatorExists ||
          related.septicLines.length ||
          related.fireLines.length ||
          related.moveouts.length ||
          related.paperings.length ||
          related.cleanings.length) && (
        <section className="ml-report-section">
          <div className="ml-report-section-title"><span>04</span><h2>정기관리 및 최근 업무 현황</h2></div>

          <div className="ml-report-related-grid">
            {related.elevatorExists && (
              <article className="ml-report-related-card">
                <h3>승강기</h3>
                <p><strong>검사만료</strong><span>{related.elevatorLines.find((x) => x.startsWith("승강기 검사만료"))?.replace("승강기 검사만료 날짜: ", "") || "-"}</span></p>
                <p><strong>검사예정</strong><span>{related.elevatorLines.find((x) => x.startsWith("승강기 검사예정"))?.replace("승강기 검사예정 날짜: ", "") || "-"}</span></p>
                <p><strong>보험사</strong><span>{String(villa.insuranceCompany ?? "").trim() || "-"}</span></p>
                <p><strong>보험기간</strong><span>{formatDateDot(villa.contractStart)} ~ {formatDateDot(villa.contractEnd)}</span></p>
              </article>
            )}

            {!!related.septicLines.length && (
              <article className="ml-report-related-card">
                <h3>정화조</h3>
                <p><strong>작업날짜</strong><span>{formatDateDot(villa.septicDate)}</span></p>
                <p><strong>작업예정</strong><span>{formatDateDot(computeSepticReviewDate(villa.septicDate))}</span></p>
              </article>
            )}

            {!!related.fireLines.length && (
              <article className="ml-report-related-card">
                <h3>소방안전</h3>
                <p><strong>업체</strong><span>{String(villa.fireSafety ?? "").trim() || "-"}</span></p>
                <p><strong>안전관리자</strong><span>{String(villa.fireSafetyManager ?? "").trim() || "-"}</span></p>
                <p><strong>교육일자</strong><span>{formatDateDot(villa.fireSafetyTrainingDate)}</span></p>
                <p className="wide"><strong>재교육</strong><span>교육일자 기준 2년 이내 재교육, 이후 2년 주기</span></p>
              </article>
            )}
          </div>

          {!!related.moveouts.length && (
            <div className="ml-report-subsection">
              <h3>최근 1개월 퇴실 현황</h3>
              <table className="ml-report-table ml-report-work-table">
                <thead><tr><th>빌라명</th><th>호수</th><th>이사날짜</th><th>구분</th><th>진행현황</th></tr></thead>
                <tbody>
                  {related.moveouts.map((item) => (
                    <tr key={item.id}>
                      <td>{item.villaName || villa.name}</td>
                      <td>{item.unitNumber || "-"}</td>
                      <td>{formatDateDot(item.moveDate)}</td>
                      <td>퇴실</td>
                      <td>{String(item.status ?? "").trim() || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!!related.paperings.length && (
            <div className="ml-report-subsection">
              <h3>최근 3개월 도배 현황</h3>
              <table className="ml-report-table ml-report-work-table">
                <thead><tr><th>빌라명</th><th>호수</th><th>접수날짜</th><th>진행현황</th><th>완료날짜</th></tr></thead>
                <tbody>
                  {related.paperings.map((item) => (
                    <tr key={item.id}>
                      <td>{item.villaName || villa.name}</td>
                      <td>{item.unitNumber || "-"}</td>
                      <td>{formatDateDot(item.receivedDate)}</td>
                      <td>{String(item.status ?? "").trim() || "-"}</td>
                      <td>{formatDateDot(item.completedDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!!related.cleanings.length && (
            <div className="ml-report-subsection">
              <h3>최근 3개월 입주청소 현황</h3>
              <table className="ml-report-table ml-report-work-table">
                <thead><tr><th>빌라명</th><th>호수</th><th>접수날짜</th><th>진행현황</th><th>완료날짜</th></tr></thead>
                <tbody>
                  {related.cleanings.map((item) => (
                    <tr key={item.id}>
                      <td>{item.villaName || villa.name}</td>
                      <td>{item.unitNumber || "-"}</td>
                      <td>{formatDateDot(item.receivedDate)}</td>
                      <td>{String(item.status ?? "").trim() || "-"}</td>
                      <td>{formatDateDot(item.completedDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!!log.photos?.length && !issueExists && (
        <section className="ml-report-section">
          <div className="ml-report-section-title"><span>05</span><h2>현장 점검사진</h2></div>
          <div className="ml-report-photo-grid ml-report-photo-grid-standalone">
            {log.photos.slice(0, 6).map((photo) => (
              <figure key={photo.id}>
                <img src={photo.dataUrl} alt={photo.name} />
                <figcaption>{photo.caption || "현장 점검사진"}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <footer className="ml-report-footer">
        <div><strong>한남주택관리</strong><span>체계적인 주택관리와 지속적인 현장 점검으로 관리 품질을 유지합니다.</span></div>
        <div><span>대표전화</span><strong>042-489-8555</strong></div>
      </footer>
    </main>
  );
}