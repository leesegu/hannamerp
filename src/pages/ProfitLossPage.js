// src/pages/ProfitLossPage.js
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import {
  FiBarChart2,
  FiChevronDown,
  FiDollarSign,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiTrendingDown,
  FiTrendingUp,
  FiUploadCloud,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import "./ProfitLossPage.css";

const COLLECTIONS = {
  villas: "villas",
  profitLoss: "profitLoss",
  profitLossTop: "profitLossTop",

  telco: "telco",
  elevator: "elevator",
  fireSafety: "fireSafety",
  electricSafety: "electricSafety",
  cleaning: "cleaning",
};


const MONTHS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, "0")
);

// "기타" 항목 전용 키. 기존 "난방온수(heatingRepair)" 필드를 그대로 재사용해서
// (문서 구조/기존 저장 데이터를 그대로 유지하기 위해) 화면 라벨만 "기타"로 바꿨습니다.
const ETC_KEY = "heatingRepair";
const ETC_NOTE_KEY = `${ETC_KEY}Note`;

// 숫자로 파싱하지 않고 문자열 그대로 저장해야 하는 필드들
// ("마이너스 주요항목" 사유, "기타" 항목 메모)
const TEXT_FIELD_KEYS = new Set(["minusReason", ETC_NOTE_KEY]);

const ITEMS = [
  { key: "chargeFee", label: "부과관리비" },
  { key: "waterFee", label: "수도요금" },
  { key: "publicElectric", label: "공용전기", auto: true },
  { key: "communicationFee", label: "인터넷비", auto: true },
  { key: "elevatorFee", label: "승강기", auto: true },
  { key: "fireSafety", label: "소방안전", auto: true },
  { key: "electricSafety", label: "전기안전", auto: true },
  { key: "cleaningFee", label: "청소비", auto: true },
  { key: "septicFee", label: "정화조" },
  { key: "elevatorInspect", label: "승강기검사" },
  { key: ETC_KEY, label: "기타" },
];

const EXPENSE_KEYS = [
  "waterFee",
  "publicElectric",
  "communicationFee",
  "elevatorFee",
  "fireSafety",
  "electricSafety",
  ETC_KEY,
  "cleaningFee",
  "septicFee",
  "elevatorInspect",
];

const MINUS_REASON_OPTIONS = [
  { value: "", label: "선택" },
  { value: "공실", label: "공실" },
  { value: "경매", label: "경매" },
  ...ITEMS.filter((item) => EXPENSE_KEYS.includes(item.key)).map((item) => ({
    value: item.label,
    label: item.label,
  })),
];

const AUTO_KEYS = new Set(
  ITEMS.filter((item) => item.auto).map((item) => item.key)
);

// 자동입력 항목 중 "저장 후에는 값이 고정되고, 새로고침 버튼을 눌러야만
// 최신 데이터로 다시 채워지는" 항목들 (공용전기 제외).
// 공용전기는 peCalc 데이터 자체가 이미 "선택한 연/월" 기준으로 저장되어 있어서
// 매번 최신값을 그대로 보여줘도 문제가 없기 때문에 고정 대상에서 뺐습니다.
const FREEZE_AUTO_KEYS = new Set(
  ["communicationFee", "elevatorFee", "fireSafety", "electricSafety", "cleaningFee"]
);

const parseNum = (v) =>
  Number(String(v ?? "").replace(/[^0-9-]/g, "")) || 0;

const fmt = (v) => {
  const n = parseNum(v);
  return n === 0 ? "" : n.toLocaleString();
};

const fmtZero = (v) => parseNum(v).toLocaleString();

const getMonthKey = (year, month) =>
  `${year}-${String(month).padStart(2, "0")}`;

const getYyyymm = (year, month) =>
  `${year}${String(month).padStart(2, "0")}`;

const getPrevMonthKey = (monthKey) => {
  const [y, m] = String(monthKey).split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const compareMonthKey = (a, b) => String(a).localeCompare(String(b));

const getNextMonthKey = (monthKey) => {
  const [y, m] = String(monthKey).split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const getMonthKeyFromDate = (date) => {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const toDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const getMonthField = (row, keys = []) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value === undefined || value === null || value === "") continue;

    if (/^\d{4}-\d{2}$/.test(String(value))) return String(value);

    const date = toDate(value);
    const monthKey = getMonthKeyFromDate(date);
    if (monthKey) return monthKey;
  }

  return "";
};

const getVillaStartMonthKey = (row) => {
  return (
    getMonthField(row, [
      "profitLossStartMonth",
      "startMonth",
      "activeFromMonth",
      "createdMonth",
      "createdMonthKey",
      "등록월",
      "createdAt",
      "createdDate",
      "등록일",
    ]) || "2026-01"
  );
};

const getVillaEndExclusiveMonthKey = (row) => {
  const explicitEnd = getMonthField(row, [
    "profitLossEndMonth",
    "endMonthExclusive",
    "inactiveFromMonth",
    "deletedFromMonth",
    "hiddenFromMonth",
    "closedFromMonth",
  ]);

  if (explicitEnd) return explicitEnd;

  const deletedMonth = getMonthField(row, [
    "deletedMonth",
    "deletedMonthKey",
    "deletedAt",
    "deletedDate",
    "inactiveAt",
    "closedAt",
    "삭제일",
  ]);

  return deletedMonth ? getNextMonthKey(deletedMonth) : "";
};

const isVillaVisibleInMonth = (row, targetMonthKey) => {
  const startMonth = getVillaStartMonthKey(row);
  const endExclusiveMonth = getVillaEndExclusiveMonthKey(row);

  if (startMonth && compareMonthKey(targetMonthKey, startMonth) < 0) return false;
  if (endExclusiveMonth && compareMonthKey(targetMonthKey, endExclusiveMonth) >= 0) return false;

  return true;
};

const getElapsedMonthKeys = (year, currentMonthKey) => {
  const result = [];
  const currentYear = String(currentMonthKey).slice(0, 4);
  const maxMonth = String(year) === currentYear ? Number(String(currentMonthKey).slice(5, 7)) : 12;

  for (let i = 1; i <= maxMonth; i += 1) {
    const monthKey = `${year}-${String(i).padStart(2, "0")}`;
    if (compareMonthKey(monthKey, currentMonthKey) <= 0) result.push(monthKey);
  }

  return result;
};

const normalize = (v) => String(v ?? "").trim();

const normalizeLoose = (v) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .toLowerCase();

const normalizeCode = (v) => {
  const raw = String(v ?? "").trim();
  const firstPart = raw.split("-")[0];
  const onlyNum = String(firstPart ?? "").replace(/[^0-9]/g, "");
  if (!onlyNum) return raw;
  return onlyNum.padStart(3, "0");
};

const getFirstValue = (obj, keys = []) => {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && obj?.[key] !== "") {
      return obj[key];
    }
  }
  return "";
};

const getRawCode = (row) =>
  String(
    getFirstValue(row, [
      "codeNumber",
      "codeNo",
      "code",
      "villaCode",
      "villa_code",
      "buildingCode",
      "aptCode",
      "코드번호",
      "코드",
    ]) ?? ""
  ).trim();

const isSubCodeRow = (row) => {
  const rawCode = getRawCode(row);
  return /^\d+\s*-\s*\d+/.test(rawCode);
};

const getCode = (row) => normalizeCode(getRawCode(row));

const getVillaName = (row) =>
  getFirstValue(row, [
    "villaName",
    "name",
    "buildingName",
    "villa",
    "aptName",
    "빌라명",
    "건물명",
  ]);

const getAmountFromRow = (row, keys = []) =>
  parseNum(getFirstValue(row, keys));

const makeFullKey = (code, villaName) =>
  `${normalizeLoose(normalizeCode(code))}__${normalizeLoose(villaName)}`;

const makeIndexedMapByVilla = (list = []) => {
  const map = {
    full: {},
    code: {},
    name: {},
    id: {},
  };

  list.forEach((row) => {
    if (isSubCodeRow(row)) return;

    const idKey = normalizeLoose(row.id);
    const code = getCode(row);
    const villaName = getVillaName(row);

    const fullKey = makeFullKey(code, villaName);
    const codeKey = normalizeLoose(code);
    const nameKey = normalizeLoose(villaName);

    if (idKey) map.id[idKey] = row;
    if (fullKey !== "__") map.full[fullKey] = row;
    if (codeKey) map.code[codeKey] = row;
    if (nameKey) map.name[nameKey] = row;
  });

  return map;
};

const getSourceByVilla = (map, code, villaName, id = "") => {
  if (!map) return null;

  const idKey = normalizeLoose(id);
  const fullKey = makeFullKey(code, villaName);
  const codeKey = normalizeLoose(normalizeCode(code));
  const nameKey = normalizeLoose(villaName);

  return (
    map.id?.[idKey] ||
    map.full?.[fullKey] ||
    map.code?.[codeKey] ||
    map.name?.[nameKey] ||
    null
  );
};

const getSourceByCode = (map, code) => {
  if (!map) return null;
  const codeKey = normalizeLoose(normalizeCode(code));
  return map.code?.[codeKey] || null;
};

const makePeCalcMap = (rows = []) => {
  const map = {
    byId: {},
    byCode: {},
  };

  rows.forEach((row) => {
    if (isSubCodeRow(row)) return;

    const docKey = normalizeLoose(row.id);
    const codeKey = normalizeLoose(normalizeCode(row.code));

    if (docKey) map.byId[docKey] = row;
    if (codeKey) map.byCode[codeKey] = row;
  });

  return map;
};

const getPublicElectricAmount = (peCalcMap, villa) => {
  const villaIdKey = normalizeLoose(villa.id);
  const codeKey = normalizeLoose(getCode(villa));

  const source =
    peCalcMap.byId?.[villaIdKey] || peCalcMap.byCode?.[codeKey] || null;

  return parseNum(source?.billed);
};

const getExcelCellValue = (sheet, address) => {
  const cell = sheet?.[address];
  if (!cell) return "";
  return cell.v ?? cell.w ?? "";
};

const parseWaterExcelRows = (workbook) => {
  const result = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:D1");

    for (let rowNumber = 11; rowNumber <= range.e.r + 1; rowNumber += 7) {
      const codeRaw = getExcelCellValue(sheet, `A${rowNumber}`);
      const waterRaw = getExcelCellValue(sheet, `D${rowNumber}`);

      const rawText = String(codeRaw ?? "").trim();
      if (/^\d+\s*-\s*\d+/.test(rawText)) continue;

      const codeOnly = rawText.replace(/[^0-9]/g, "");
      const codeNumber = Number(codeOnly);
      const waterText = String(waterRaw ?? "").trim();

      if (!codeOnly) continue;
      if (!Number.isInteger(codeNumber)) continue;
      if (codeNumber < 1 || codeNumber > 999) continue;
      if (waterText === "") continue;

      result.push({
        code: normalizeCode(codeOnly),
        waterFee: parseNum(waterRaw),
        excelRowNumber: rowNumber,
      });
    }
  });

  return result;
};


const getRate = (profit, base) => {
  const b = parseNum(base);
  if (!b) return 0;
  return (parseNum(profit) / b) * 100;
};

// 아래 4개 함수는 컴포넌트 state를 전혀 참조하지 않는 순수 계산 함수라서
// 컴포넌트 바깥(모듈 스코프)으로 옮겼음. 계산 로직 자체는 한 글자도 바꾸지 않았고,
// 매 렌더링마다 새로 만들어지지 않게 되어(참조가 항상 동일) 아래에서 만드는
// ProfitTableRow의 React.memo가 정상적으로 "변경 없는 행은 다시 그리지 않기"를
// 할 수 있게 해주는 준비 작업입니다.
// (입금관리비/입금수입 삭제 요청에 따라 depositIncome 계산은 완전히 제거했습니다.)
const getRowCalcByMonth = (row, targetMonthKey) => {
  const data = row.monthly?.[targetMonthKey] || {};

  const totalExpense = EXPENSE_KEYS.reduce(
    (sum, key) => sum + parseNum(data[key]),
    0
  );

  const chargeIncome = parseNum(data.chargeFee) - totalExpense;

  return {
    totalExpense,
    chargeIncome,
  };
};

const getColumnTotals = (rows, targetMonthKey) => {
  const totals = {};

  ITEMS.forEach((item) => {
    totals[item.key] = 0;
  });

  const result = {
    ...totals,
    totalExpense: 0,
    chargeIncome: 0,
  };

  rows.forEach((row) => {
    const data = row.monthly?.[targetMonthKey] || {};
    const calc = getRowCalcByMonth(row, targetMonthKey);

    ITEMS.forEach((item) => {
      result[item.key] += parseNum(data[item.key]);
    });

    result.totalExpense += calc.totalExpense;
    result.chargeIncome += calc.chargeIncome;
  });

  return result;
};

const getTopCalc = (payments = {}) => {
  const totalExpense = EXPENSE_KEYS.reduce(
    (sum, key) => sum + parseNum(payments[key]),
    0
  );

  const chargeIncome = parseNum(payments.chargeFee) - totalExpense;

  return {
    totalExpense,
    chargeIncome,
  };
};

const getBalanceCalc = (columnData = {}, payments = {}) => {
  const result = {};

  ITEMS.forEach((item) => {
    result[item.key] =
      parseNum(payments[item.key]) - parseNum(columnData[item.key]);
  });

  result.totalExpense = EXPENSE_KEYS.reduce(
    (sum, key) => sum + parseNum(result[key]),
    0
  );

  result.chargeIncome =
    parseNum(result.chargeFee) - parseNum(result.totalExpense);

  return result;
};


const MoneyInput = React.memo(function MoneyInput({
  value,
  className = "",
  readOnly = false,
  onSave,
  onKeyDown,
  placeholder = "-",
  title = "",
  inputRef,
}) {
  const [localValue, setLocalValue] = useState(fmt(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setLocalValue(fmt(value));
    }
  }, [value]);

  const handleBlur = (e) => {
    focusedRef.current = false;
    const nextValue = e.target.value;
    setLocalValue(fmt(nextValue));
    onSave?.(nextValue);
  };

  return (
    <input
      ref={inputRef}
      className={className}
      value={localValue}
      readOnly={readOnly}
      onChange={(e) => setLocalValue(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      title={title}
    />
  );
});

// 아래쪽 데이터테이블(빌라별 손익계산 행) 전용 컴포넌트입니다.
// React.memo로 감싸서, "값이 실제로 바뀐 행"만 다시 그리고 나머지 수백 개 행은
// 건드리지 않도록 했습니다. 이게 입력 시 버벅거림을 없애는 핵심 변경사항입니다.
// (내부 로직/계산식/렌더링 결과는 기존 코드와 완전히 동일합니다. 위치만 옮겼습니다.)
const ProfitTableRow = React.memo(function ProfitTableRow({
  row,
  rowIndex,
  monthKey,
  onSaveCell,
  onKeyDownCell,
  onMinusReasonChange,
  onOpenEtcNote,
  registerInputRef,
}) {
  const data = row.monthly?.[monthKey] || {};
  const calc = getRowCalcByMonth(row, monthKey);

  // 자동입력 항목(공용전기/인터넷비/승강기/소방안전/전기안전/청소비)은
  // 기본적으로 읽기전용이고, "더블클릭"했을 때만 그 칸만 잠깐 입력 가능하게
  // 풀어줍니다. 포커스가 빠지면(onBlur) 다시 읽기전용으로 잠깁니다.
  // 이 상태는 이 행(row) 안에서만 의미가 있는 화면 표시용 상태라
  // 행 컴포넌트 내부에 두었습니다. (다른 행의 리렌더링과는 무관)
  const [unlockedKeys, setUnlockedKeys] = useState(null);

  const unlockAutoCell = (key) => {
    setUnlockedKeys((prev) => new Set([...(prev || []), key]));
  };

  const relockAutoCell = (key) => {
    setUnlockedKeys((prev) => {
      if (!prev || !prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next.size ? next : null;
    });
  };

  return (
    <tr>
      <td>{rowIndex + 1}</td>
      <td>{row.code}</td>
      <td className="pl-villa">{row.villaName}</td>

      {ITEMS.map((item, colIndex) => {
        const isAuto = AUTO_KEYS.has(item.key);
        const isEditableAuto = FREEZE_AUTO_KEYS.has(item.key);
        const isEtc = item.key === ETC_KEY;
        const isUnlocked = unlockedKeys?.has(item.key);
        const isReadOnly = isAuto && !isUnlocked;
        const etcNote = isEtc ? data[ETC_NOTE_KEY] || "" : "";

        return (
          <td
            key={item.key}
            className={`pl-item-col pl-col-${item.key}`}
            data-tooltip={etcNote || undefined}
            onDoubleClick={
              isEditableAuto ? () => unlockAutoCell(item.key) : undefined
            }
          >
            <MoneyInput
              inputRef={(el) => registerInputRef(rowIndex, colIndex, el)}
              className={[
                "pl-money-input",
                isReadOnly ? "pl-auto-input" : "",
                isUnlocked ? "pl-auto-unlocked" : "",
                item.key === "waterFee" ? "pl-water-input" : "",
                isEtc && etcNote ? "pl-has-note" : "",
              ].join(" ")}
              value={data[item.key]}
              readOnly={isReadOnly}
              onSave={(value) => {
                onSaveCell(row, item.key, value);
                if (isEditableAuto) relockAutoCell(item.key);
              }}
              onKeyDown={(e) => {
                if (isEtc && e.key === "Enter") {
                  e.preventDefault();
                  const rect = e.target.getBoundingClientRect();
                  e.target.blur();
                  onOpenEtcNote(row, rect, etcNote);
                  return;
                }
                onKeyDownCell(e, rowIndex, colIndex);
              }}
              placeholder="-"
              title={
                isReadOnly && isEditableAuto
                  ? "자동 입력 항목입니다. 더블클릭하면 수정할 수 있습니다."
                  : isReadOnly
                  ? "자동 입력 항목입니다 (공용전기는 선택한 월의 데이터를 항상 그대로 반영합니다)."
                  : isEtc
                  ? "금액 입력 후 Enter를 누르면 메모를 남길 수 있습니다."
                  : ""
              }
            />
          </td>
        );
      })}

      <td className="pl-total">{fmtZero(calc.totalExpense)}</td>
      <td
        className={
          calc.chargeIncome >= 0
            ? "pl-profit plus-text"
            : "pl-profit minus-text"
        }
      >
        {fmtZero(calc.chargeIncome)}
      </td>
      <td className="pl-reason">
        <select
          className={[
            "pl-reason-select",
            data.minusReason ? "is-selected" : "",
          ].join(" ")}
          value={data.minusReason || ""}
          onChange={(e) => onMinusReasonChange(row, e.target.value)}
        >
          {MINUS_REASON_OPTIONS.map((option) => (
            <option key={option.value || "empty"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
});

export default function ProfitLossPage() {
  const now = new Date();

  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(
    String(now.getMonth() + 1).padStart(2, "0")
  );

  const [statsYear, setStatsYear] = useState(String(now.getFullYear()));
  const [statsMonth, setStatsMonth] = useState(
    String(now.getMonth() + 1).padStart(2, "0")
  );

  const [villaRows, setVillaRows] = useState([]);
  const [profitRows, setProfitRows] = useState([]);
  const [topRows, setTopRows] = useState([]);

  const [telcoRows, setTelcoRows] = useState([]);
  const [elevatorRows, setElevatorRows] = useState([]);
  const [fireSafetyRows, setFireSafetyRows] = useState([]);
  const [electricSafetyRows, setElectricSafetyRows] = useState([]);
  const [cleaningRows, setCleaningRows] = useState([]);

  const [peCalcRows, setPeCalcRows] = useState([]);
  const [statsPeCalcRows, setStatsPeCalcRows] = useState([]);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [uploadingWater, setUploadingWater] = useState(false);
  const [refreshingAuto, setRefreshingAuto] = useState(false);

  const [statsModalOpen, setStatsModalOpen] = useState(false);

  // "기타" 항목 메모 입력 팝업. null이 아니면 화면에 팝업이 표시됩니다.
  // { rowKey, row, top, left, value }
  const [etcNoteEditor, setEtcNoteEditor] = useState(null);

  const [draftCells, setDraftCells] = useState({});
  const [draftTopCells, setDraftTopCells] = useState({});
  const [savingDrafts, setSavingDrafts] = useState(false);

  const draftCellsRef = useRef({});
  const draftTopCellsRef = useRef({});
  const dirtyRef = useRef(false);
  const savingDraftsRef = useRef(false);

  const inputRefs = useRef({});
  const topInputRefs = useRef({});
  const waterFileRef = useRef(null);
  const monthSnapshotSignatureRef = useRef("");
  const monthSnapshotSavingRef = useRef(false);

  const years = Array.from({ length: 11 }, (_, i) => String(2026 + i));
  const monthKey = getMonthKey(year, month);
  const currentMonthKey = getMonthKey(
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0")
  );
  const yyyymm = getYyyymm(year, month);
  const prevMonthKey = getPrevMonthKey(monthKey);

  const statsMonthKey = getMonthKey(statsYear, statsMonth);
  const statsYyyymm = getYyyymm(statsYear, statsMonth);

  useEffect(() => {
    const unsubs = [];

    const listen = (collectionName, setter) => {
      const unsub = onSnapshot(
        collection(db, collectionName),
        (snap) => {
          setter(
            snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }))
          );
        },
        (error) => {
          console.error(`${collectionName} 불러오기 오류:`, error);
          setter([]);
        }
      );

      unsubs.push(unsub);
    };

    listen(COLLECTIONS.villas, setVillaRows);
    listen(COLLECTIONS.profitLoss, setProfitRows);
    listen(COLLECTIONS.profitLossTop, setTopRows);

    listen(COLLECTIONS.telco, setTelcoRows);
    listen(COLLECTIONS.elevator, setElevatorRows);
    listen(COLLECTIONS.fireSafety, setFireSafetyRows);
    listen(COLLECTIONS.electricSafety, setElectricSafetyRows);
    listen(COLLECTIONS.cleaning, setCleaningRows);

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "peCalcs", String(yyyymm), "rows"),
      (snap) => {
        setPeCalcRows(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      },
      (error) => {
        console.error(`peCalcs/${yyyymm}/rows 불러오기 오류:`, error);
        setPeCalcRows([]);
      }
    );

    return () => unsub();
  }, [yyyymm]);

  useEffect(() => {
    if (!statsModalOpen) return undefined;

    const unsub = onSnapshot(
      collection(db, "peCalcs", String(statsYyyymm), "rows"),
      (snap) => {
        setStatsPeCalcRows(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      },
      (error) => {
        console.error(`peCalcs/${statsYyyymm}/rows 불러오기 오류:`, error);
        setStatsPeCalcRows([]);
      }
    );

    return () => unsub();
  }, [statsModalOpen, statsYyyymm]);



  const profitMap = useMemo(() => {
    const map = {};

    profitRows.forEach((row) => {
      if (isSubCodeRow(row)) return;

      const code = getCode(row);
      const villaName = getVillaName(row);
      const key = makeFullKey(code, villaName);

      if (key !== "__") {
        map[key] = row;
      }
    });

    return map;
  }, [profitRows]);

  const profitCodeMap = useMemo(() => {
    const map = {};

    profitRows.forEach((row) => {
      if (isSubCodeRow(row)) return;

      const codeKey = normalizeLoose(getCode(row));
      if (codeKey) map[codeKey] = row;
    });

    return map;
  }, [profitRows]);

  const getTopDocByMonth = (targetMonthKey) => {
    return (
      topRows.find(
        (row) => row.id === targetMonthKey || row.monthKey === targetMonthKey
      ) || {}
    );
  };

  const topDoc = useMemo(() => getTopDocByMonth(monthKey), [topRows, monthKey]);

  const topPayments = useMemo(() => {
    return topDoc.payments || {};
  }, [topDoc]);

  const getEffectiveTopPayments = (targetMonthKey) => {
    const docData = getTopDocByMonth(targetMonthKey);
    return docData.payments || {};
  };

  const topDisplayPayments = useMemo(() => {
    return {
      ...(topPayments || {}),
      ...(draftTopCells[monthKey] || {}),
    };
  }, [topPayments, draftTopCells, monthKey]);

  const telcoMap = useMemo(() => makeIndexedMapByVilla(telcoRows), [telcoRows]);

  const elevatorMap = useMemo(
    () => makeIndexedMapByVilla(elevatorRows),
    [elevatorRows]
  );

  const fireSafetyMap = useMemo(
    () => makeIndexedMapByVilla([...fireSafetyRows, ...villaRows]),
    [fireSafetyRows, villaRows]
  );

  const electricSafetyMap = useMemo(
    () => makeIndexedMapByVilla([...electricSafetyRows, ...villaRows]),
    [electricSafetyRows, villaRows]
  );

  const cleaningMap = useMemo(
    () => makeIndexedMapByVilla(cleaningRows),
    [cleaningRows]
  );

  const peCalcMap = useMemo(() => makePeCalcMap(peCalcRows), [peCalcRows]);
  const statsPeCalcMap = useMemo(
    () => makePeCalcMap(statsPeCalcRows),
    [statsPeCalcRows]
  );

  const getAutoAmount = (baseRow, key, targetPeCalcMap = peCalcMap) => {
    const code = getCode(baseRow);
    const villaName = getVillaName(baseRow);

    if (key === "communicationFee") {
      const source =
        getSourceByVilla(telcoMap, code, villaName, baseRow.id) || baseRow;

      return getAmountFromRow(source, [
        "communicationFee",
        "telcoAmount",
        "internetFee",
        "internetAmount",
        "amount",
        "fee",
        "price",
        "금액",
      ]);
    }

    if (key === "elevatorFee") {
      const source =
        getSourceByVilla(elevatorMap, code, villaName, baseRow.id) || baseRow;

      return getAmountFromRow(source, [
        "elevatorFee",
        "elevatorAmount",
        "amount",
        "fee",
        "price",
        "금액",
      ]);
    }

    if (key === "fireSafety") {
      const source = getSourceByCode(fireSafetyMap, code) || baseRow;

      return getAmountFromRow(source, [
        "fireSafetyFee",
        "fireSafetyAmount",
        "fireSafetyPrice",
        "fireSafetyCost",
        "safetyFee",
        "safetyAmount",
        "inspectionFee",
        "inspectionAmount",
        "regularFee",
        "monthlyFee",
        "amount",
        "fee",
        "price",
        "cost",
        "금액",
        "관리금액",
        "점검금액",
        "소방안전금액",
      ]);
    }

    if (key === "electricSafety") {
      const source = getSourceByCode(electricSafetyMap, code) || baseRow;

      return getAmountFromRow(source, [
        "electricSafetyFee",
        "electricSafetyAmount",
        "electricSafetyPrice",
        "electricSafetyCost",
        "safetyFee",
        "safetyAmount",
        "inspectionFee",
        "inspectionAmount",
        "regularFee",
        "monthlyFee",
        "amount",
        "fee",
        "price",
        "cost",
        "금액",
        "관리금액",
        "점검금액",
        "전기안전금액",
      ]);
    }

    if (key === "cleaningFee") {
      const source =
        getSourceByVilla(cleaningMap, code, villaName, baseRow.id) || baseRow;

      return getAmountFromRow(source, [
        "cleaningFee",
        "cleaningAmount",
        "buildingCleaningFee",
        "buildingCleaningAmount",
        "amount",
        "fee",
        "price",
        "금액",
      ]);
    }

    if (key === "publicElectric") {
      return getPublicElectricAmount(targetPeCalcMap, baseRow);
    }

    return 0;
  };

  const makeMergedRowsByMonth = (targetMonthKey, targetPeCalcMap, options = {}) => {
    const { forceLiveAuto = false } = options;

    const activeVillaRows = villaRows
      .filter((villa) => !isSubCodeRow(villa))
      .filter((villa) => isVillaVisibleInMonth(villa, targetMonthKey));
    const activeVillaMap = makeIndexedMapByVilla(activeVillaRows);

    const savedRowsForMonth = profitRows.filter((row) => {
      if (isSubCodeRow(row)) return false;
      return row.monthly?.[targetMonthKey] !== undefined;
    });

    const hasSavedRowsForMonth = savedRowsForMonth.length > 0;
    const isLiveMonth = targetMonthKey === currentMonthKey;
    const shouldKeepSavedRows = compareMonthKey(targetMonthKey, currentMonthKey) <= 0;

    const sourceRowMap = new Map();

    activeVillaRows.forEach((row) => {
      const key = makeFullKey(getCode(row), getVillaName(row));
      if (key !== "__") sourceRowMap.set(key, row);
    });

    if (shouldKeepSavedRows || (!isLiveMonth && hasSavedRowsForMonth)) {
      savedRowsForMonth.forEach((row) => {
        const key = makeFullKey(getCode(row), getVillaName(row));
        if (key !== "__" && !sourceRowMap.has(key)) sourceRowMap.set(key, row);
      });
    }

    const sourceRows = Array.from(sourceRowMap.values());
    const rowMap = new Map();

    sourceRows.forEach((sourceRow) => {
      const code = getCode(sourceRow);
      const villaName = getVillaName(sourceRow);
      const key = makeFullKey(code, villaName);
      if (key === "__") return;

      const saved =
        profitMap[key] || profitCodeMap[normalizeLoose(code)] || sourceRow || {};

      const activeVilla =
        getSourceByVilla(
          activeVillaMap,
          code,
          villaName,
          sourceRow.baseVillaId || sourceRow.id
        ) || null;

      const baseVilla = activeVilla || sourceRow;
      const savedMonthData = saved.monthly?.[targetMonthKey] || {};
      const autoMonthData = {};

      if (activeVilla || !hasSavedRowsForMonth || isLiveMonth || forceLiveAuto) {
        ITEMS.forEach((item) => {
          if (item.auto) {
            autoMonthData[item.key] = getAutoAmount(
              baseVilla,
              item.key,
              targetPeCalcMap
            );
          }
        });
      }

      // 자동입력 항목 병합 규칙:
      // - 공용전기(publicElectric)는 선택한 연/월의 공용전기계산 데이터를
      //   항상 그대로 반영합니다 (이미 월별로 구분 저장되어 있어 고정할 필요 없음).
      // - 그 외 자동입력 항목(인터넷비/승강기/소방안전/전기안전/청소비)은
      //   한 번 저장된 값이 있으면 그 값을 그대로 유지(고정)하고,
      //   저장된 값이 아직 없거나(최초 1회) 새로고침(forceLiveAuto)일 때만
      //   지금 실제 데이터로 채웁니다.
      // - 자동입력이 아닌 나머지 항목은 항상 저장된 값을 그대로 사용합니다.
      const monthData = { ...savedMonthData };

      ITEMS.forEach((item) => {
        if (!item.auto) return;
        const itemKey = item.key;

        if (itemKey === "publicElectric") {
          monthData[itemKey] = autoMonthData[itemKey];
          return;
        }

        if (forceLiveAuto || savedMonthData[itemKey] === undefined) {
          monthData[itemKey] = autoMonthData[itemKey];
        }
      });

      rowMap.set(key, {
        ...saved,
        id: saved.id,
        code,
        codeNumber: code,
        villaName,
        baseVillaId: activeVilla?.id || sourceRow.baseVillaId || sourceRow.id || "",
        snapshotByMonth: {
          ...(saved.snapshotByMonth || {}),
          [targetMonthKey]: true,
        },
        monthly: {
          ...(saved.monthly || {}),
          [targetMonthKey]: monthData,
        },
      });
    });

    return Array.from(rowMap.values())
      .filter((row) => normalize(row.code) || normalize(row.villaName))
      .sort((a, b) => {
        const codeA = normalize(a.code);
        const codeB = normalize(b.code);

        if (codeA !== codeB) {
          return codeA.localeCompare(codeB, "ko", { numeric: true });
        }

        return normalize(a.villaName).localeCompare(
          normalize(b.villaName),
          "ko"
        );
      });
  };

  useEffect(() => {
    if (!villaRows.length) return;
    if (!year || !currentMonthKey) return;

    const activeVillaRows = villaRows.filter((villa) => !isSubCodeRow(villa));
    if (!activeVillaRows.length) return;

    const elapsedMonthKeys = getElapsedMonthKeys(year, currentMonthKey);
    if (!elapsedMonthKeys.length) return;

    const tasks = [];
    const signatureParts = [];

    activeVillaRows.forEach((villa) => {
      const code = getCode(villa);
      const villaName = getVillaName(villa);
      const rowKey = makeFullKey(code, villaName);
      if (rowKey === "__") return;

      const saved = profitMap[rowKey] || profitCodeMap[normalizeLoose(code)] || null;
      const savedMonthly = saved?.monthly || {};

      elapsedMonthKeys.forEach((targetMonthKey) => {
        if (!isVillaVisibleInMonth(villa, targetMonthKey)) return;
        if (savedMonthly[targetMonthKey] !== undefined) return;

        tasks.push({
          villa,
          saved,
          rowKey,
          targetMonthKey,
          code,
          villaName,
        });

        signatureParts.push(`${rowKey}:${targetMonthKey}`);
      });
    });

    if (!tasks.length) return;

    const signature = signatureParts.sort().join("|");
    if (monthSnapshotSignatureRef.current === signature) return;
    if (monthSnapshotSavingRef.current) return;

    monthSnapshotSignatureRef.current = signature;
    monthSnapshotSavingRef.current = true;

    const run = async () => {
      try {
        const limitedTasks = tasks.slice(0, 450);
        const batch = writeBatch(db);

        limitedTasks.forEach((task) => {
          const ref = task.saved?.id
            ? doc(db, COLLECTIONS.profitLoss, task.saved.id)
            : doc(collection(db, COLLECTIONS.profitLoss));

          batch.set(
            ref,
            {
              code: task.code || "",
              codeNumber: task.code || "",
              villaName: task.villaName || "",
              baseVillaId: task.villa.id || task.saved?.baseVillaId || "",
              snapshotByMonth: {
                [task.targetMonthKey]: true,
              },
              monthly: {
                [task.targetMonthKey]: task.saved?.monthly?.[task.targetMonthKey] || {},
              },
              updatedAt: serverTimestamp(),
              ...(task.saved?.id ? {} : { createdAt: serverTimestamp() }),
            },
            { merge: true }
          );
        });

        await batch.commit();
      } catch (error) {
        console.error("손익계산 월별 빌라 스냅샷 저장 오류:", error);
        monthSnapshotSignatureRef.current = "";
      } finally {
        monthSnapshotSavingRef.current = false;
      }
    };

    run();
  }, [villaRows, profitMap, profitCodeMap, year, currentMonthKey]);

  const mergedRows = useMemo(() => {
    return makeMergedRowsByMonth(monthKey, peCalcMap);
  }, [
    villaRows,
    profitMap,
    profitCodeMap,
    monthKey,
    telcoMap,
    elevatorMap,
    fireSafetyMap,
    electricSafetyMap,
    cleaningMap,
    peCalcMap,
    currentMonthKey,
  ]);

  const displayMergedRows = useMemo(() => {
    const monthDrafts = draftCells[monthKey] || {};

    if (!Object.keys(monthDrafts).length) return mergedRows;

    return mergedRows.map((row) => {
      const rowKey = makeFullKey(row.code, row.villaName);
      const draft = monthDrafts[rowKey];

      if (!draft?.values) return row;

      return {
        ...row,
        monthly: {
          ...(row.monthly || {}),
          [monthKey]: {
            ...(row.monthly?.[monthKey] || {}),
            ...draft.values,
          },
        },
      };
    });
  }, [mergedRows, draftCells, monthKey]);

  const filteredRows = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase();

    if (!keyword) return displayMergedRows;

    return displayMergedRows.filter((r) => {
      return (
        String(r.code ?? "").toLowerCase().includes(keyword) ||
        String(r.villaName ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [displayMergedRows, deferredSearch]);

  const columnTotals = useMemo(() => {
    return getColumnTotals(filteredRows, monthKey);
  }, [filteredRows, monthKey]);

  const topCalc = useMemo(
    () => getTopCalc(topDisplayPayments),
    [topDisplayPayments]
  );

  const balanceCalc = useMemo(() => {
    return getBalanceCalc(columnTotals, topDisplayPayments);
  }, [topDisplayPayments, columnTotals]);

  const currentDraftCellCount = useMemo(() => {
    const rows = draftCells[monthKey] || {};
    return Object.values(rows).reduce(
      (sum, row) => sum + Object.keys(row?.values || {}).length,
      0
    );
  }, [draftCells, monthKey]);

  const currentDraftTopCount = useMemo(() => {
    return Object.keys(draftTopCells[monthKey] || {}).length;
  }, [draftTopCells, monthKey]);

  const hasUnsavedChanges = currentDraftCellCount + currentDraftTopCount > 0;

  useEffect(() => {
    draftCellsRef.current = draftCells;
  }, [draftCells]);

  useEffect(() => {
    draftTopCellsRef.current = draftTopCells;
  }, [draftTopCells]);

  useEffect(() => {
    dirtyRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    savingDraftsRef.current = savingDrafts;
  }, [savingDrafts]);

  const statsRows = useMemo(() => {
    if (!statsModalOpen) return [];
    return makeMergedRowsByMonth(statsMonthKey, statsPeCalcMap);
  }, [
    statsModalOpen,
    villaRows,
    profitMap,
    profitCodeMap,
    statsMonthKey,
    telcoMap,
    elevatorMap,
    fireSafetyMap,
    electricSafetyMap,
    cleaningMap,
    statsPeCalcMap,
  ]);

  const statsColumnTotals = useMemo(() => {
    if (!statsModalOpen) return getColumnTotals([], statsMonthKey);
    return getColumnTotals(statsRows, statsMonthKey);
  }, [statsModalOpen, statsRows, statsMonthKey]);

  // 통계창의 "부과수입"은 항상 "부과관리비 합계 − 총지출 합계"로 계산합니다.
  // (예전에는 상단 테이블 수기입력값과 뒤섞은 계산이 들어있어서 숫자가 어긋났습니다)
  const statsChargeIncome =
    parseNum(statsColumnTotals.chargeFee) - parseNum(statsColumnTotals.totalExpense);

  const statsData = useMemo(() => {
    if (!statsModalOpen) {
      return {
        villaStats: [],
        minusRows: [],
        monthlyStats: [],
        yearlySummary: {
          chargeFee: 0,
          totalExpense: 0,
          chargeIncome: 0,
          profitRate: 0,
        },
      };
    }

    const villaStats = statsRows
      .map((row) => {
        const calc = getRowCalcByMonth(row, statsMonthKey);

        return {
          code: row.code,
          villaName: row.villaName,
          totalExpense: calc.totalExpense,
          chargeIncome: calc.chargeIncome,
          positiveChargeIncome: Math.max(0, calc.chargeIncome),
        };
      })
      .sort((a, b) => b.positiveChargeIncome - a.positiveChargeIncome)
      .slice(0, 18);

    const minusRows = statsRows
      .map((row) => {
        const calc = getRowCalcByMonth(row, statsMonthKey);
        const data = row.monthly?.[statsMonthKey] || {};

        return {
          code: row.code,
          villaName: row.villaName,
          chargeIncome: calc.chargeIncome,
          minusReason: data.minusReason || "",
        };
      })
      .filter((row) => row.chargeIncome < 0)
      .sort((a, b) => a.chargeIncome - b.chargeIncome)
      .slice(0, 10);

    // 월별 통계는 "빌라별로 실제 집계된 부과관리비/총지출 합계"를 그대로 사용합니다.
    // (이전에는 상단 테이블 수기입력값과의 "차액"을 총지출로 잘못 사용하고 있어서
    //  실제 지출 합계와 다른 숫자가 나오는 버그가 있었습니다 — 이번에 고쳤습니다.)
    const monthlyStats = MONTHS.map((m) => {
      const mk = getMonthKey(statsYear, m);
      const monthRows = makeMergedRowsByMonth(mk, mk === statsMonthKey ? statsPeCalcMap : {});
      const monthColumnTotals = getColumnTotals(monthRows, mk);

      const chargeFee = parseNum(monthColumnTotals.chargeFee);
      const totalExpense = parseNum(monthColumnTotals.totalExpense);
      const chargeIncome = chargeFee - totalExpense;
      const profitRate = getRate(chargeIncome, chargeFee);

      return {
        month: m,
        monthKey: mk,
        chargeFee,
        totalExpense,
        chargeIncome,
        profitRate,
      };
    });

    const yearlySummary = monthlyStats.reduce(
      (acc, row) => {
        acc.chargeFee += parseNum(row.chargeFee);
        acc.totalExpense += parseNum(row.totalExpense);
        acc.chargeIncome += parseNum(row.chargeIncome);
        return acc;
      },
      {
        chargeFee: 0,
        totalExpense: 0,
        chargeIncome: 0,
      }
    );

    yearlySummary.profitRate = getRate(
      yearlySummary.chargeIncome,
      yearlySummary.chargeFee
    );

    return {
      villaStats,
      minusRows,
      monthlyStats,
      yearlySummary,
    };
  }, [
    statsModalOpen,
    statsRows,
    statsMonthKey,
    statsYear,
    topRows,
    statsPeCalcMap,
    villaRows,
    profitMap,
    profitCodeMap,
    telcoMap,
    elevatorMap,
    fireSafetyMap,
    electricSafetyMap,
    cleaningMap,
  ]);

  const upsertProfitRowLocal = (row, updater, targetMonthKey = monthKey) => {
    const matchKey = makeFullKey(row.code, row.villaName);

    setProfitRows((prev) => {
      const exists = prev.some((item) => {
        const itemKey = makeFullKey(getCode(item), getVillaName(item));
        return itemKey === matchKey;
      });

      if (exists) {
        return prev.map((item) => {
          const itemKey = makeFullKey(getCode(item), getVillaName(item));
          if (itemKey !== matchKey) return item;

          const prevMonthData = item.monthly?.[targetMonthKey] || {};
          const nextMonthData = updater(prevMonthData);

          return {
            ...item,
            code: row.code,
            codeNumber: row.code,
            villaName: row.villaName,
            baseVillaId: row.baseVillaId || item.baseVillaId || "",
            snapshotByMonth: {
              ...(item.snapshotByMonth || {}),
              [targetMonthKey]: true,
            },
            monthly: {
              ...(item.monthly || {}),
              [targetMonthKey]: nextMonthData,
            },
          };
        });
      }

      return [
        ...prev,
        {
          code: row.code,
          codeNumber: row.code,
          villaName: row.villaName,
          baseVillaId: row.baseVillaId || "",
          snapshotByMonth: {
            [targetMonthKey]: true,
          },
          monthly: {
            [targetMonthKey]: updater({}),
          },
        },
      ];
    });
  };

  // useCallback으로 감싸서 monthKey가 바뀌지 않는 한 함수 참조가 그대로 유지되도록
  // 했습니다. (동작은 이전과 100% 동일, 참조 안정성만 추가됨 — 아래 ProfitTableRow의
  // React.memo가 "이 행에 실제 변경이 없다면 다시 그리지 않는다"를 지킬 수 있게 하기 위함)
  const setCellDraft = useCallback(
    (row, key, value) => {
      // 공용전기는 선택한 월의 공용전기계산 데이터를 항상 그대로 반영해야 하므로
      // (수동으로 덮어써도 다음 새로고침/재방문 시 다시 실제 값으로 채워짐)
      // 애초에 수동 저장 대상에서 제외합니다.
      if (key === "publicElectric") return;

      const rowKey = makeFullKey(row.code, row.villaName);

      setDraftCells((prev) => {
        const next = {
          ...prev,
          [monthKey]: {
            ...(prev[monthKey] || {}),
            [rowKey]: {
              row: {
                id: row.id || "",
                code: row.code || "",
                codeNumber: row.code || "",
                villaName: row.villaName || "",
                baseVillaId: row.baseVillaId || "",
              },
              values: {
                ...(prev[monthKey]?.[rowKey]?.values || {}),
                [key]: value,
              },
            },
          },
        };

        draftCellsRef.current = next;
        dirtyRef.current = true;
        return next;
      });
    },
    [monthKey]
  );

  const saveCell = useCallback(
    (row, key, value) => {
      setCellDraft(row, key, value);
    },
    [setCellDraft]
  );

  const handleMinusReasonChange = useCallback(
    (row, value) => {
      setCellDraft(row, "minusReason", value);
    },
    [setCellDraft]
  );

  const handleChange = () => {};

  const handleTopChange = useCallback(
    (key, value) => {
      setDraftTopCells((prev) => {
        const next = {
          ...prev,
          [monthKey]: {
            ...(prev[monthKey] || {}),
            [key]: value,
          },
        };

        draftTopCellsRef.current = next;
        dirtyRef.current = true;
        return next;
      });
    },
    [monthKey]
  );

  const saveTopCell = useCallback(
    (key, value) => {
      handleTopChange(key, value);
    },
    [handleTopChange]
  );

  const applySavedDraftsToLocalState = (targetMonthKey, rowDrafts, topDrafts) => {
    Object.values(rowDrafts || {}).forEach((draft) => {
      const row = draft.row || {};
      const values = draft.values || {};
      const parsedValues = {};

      Object.entries(values).forEach(([key, value]) => {
        parsedValues[key] = TEXT_FIELD_KEYS.has(key) ? value : parseNum(value);
      });

      upsertProfitRowLocal(
        {
          code: row.code || row.codeNumber || "",
          codeNumber: row.code || row.codeNumber || "",
          villaName: row.villaName || "",
          baseVillaId: row.baseVillaId || "",
        },
        (prevMonthData) => ({
          ...prevMonthData,
          ...parsedValues,
        }),
        targetMonthKey
      );
    });

    if (Object.keys(topDrafts || {}).length) {
      const parsedTopDrafts = {};

      Object.entries(topDrafts).forEach(([key, value]) => {
        parsedTopDrafts[key] = parseNum(value);
      });

      setTopRows((prev) => {
        const exists = prev.some(
          (item) => item.id === targetMonthKey || item.monthKey === targetMonthKey
        );

        if (exists) {
          return prev.map((item) => {
            if (item.id !== targetMonthKey && item.monthKey !== targetMonthKey) {
              return item;
            }

            return {
              ...item,
              id: item.id || targetMonthKey,
              monthKey: targetMonthKey,
              payments: {
                ...(item.payments || {}),
                ...parsedTopDrafts,
              },
            };
          });
        }

        return [
          ...prev,
          {
            id: targetMonthKey,
            monthKey: targetMonthKey,
            payments: parsedTopDrafts,
          },
        ];
      });
    }
  };

  const saveAllChanges = async ({ silent = false } = {}) => {
    if (savingDraftsRef.current) return false;

    const targetMonthKey = monthKey;
    const rowDrafts = draftCellsRef.current[targetMonthKey] || {};
    const topDrafts = draftTopCellsRef.current[targetMonthKey] || {};
    const hasRowDrafts = Object.keys(rowDrafts).length > 0;
    const hasTopDrafts = Object.keys(topDrafts).length > 0;

    if (!hasRowDrafts && !hasTopDrafts) {
      if (!silent) alert("저장할 변경 내용이 없습니다.");
      return true;
    }

    setSavingDrafts(true);
    savingDraftsRef.current = true;

    try {
      const batch = writeBatch(db);
      let writeCount = 0;

      Object.entries(rowDrafts).forEach(([rowKey, draft]) => {
        const row = draft.row || {};
        const values = draft.values || {};
        const cleanValues = {};

        Object.entries(values).forEach(([key, value]) => {
          if (key === "publicElectric") return;
          cleanValues[key] = TEXT_FIELD_KEYS.has(key) ? value : parseNum(value);
        });

        if (!Object.keys(cleanValues).length) return;

        const code = row.code || row.codeNumber || "";
        const villaName = row.villaName || "";
        const saved =
          profitMap[rowKey] || profitCodeMap[normalizeLoose(code)] || null;

        const ref = saved?.id || row.id
          ? doc(db, COLLECTIONS.profitLoss, saved?.id || row.id)
          : doc(collection(db, COLLECTIONS.profitLoss));

        batch.set(
          ref,
          {
            code,
            codeNumber: code,
            villaName,
            baseVillaId: row.baseVillaId || saved?.baseVillaId || "",
            snapshotByMonth: {
              [targetMonthKey]: true,
            },
            monthly: {
              [targetMonthKey]: cleanValues,
            },
            updatedAt: serverTimestamp(),
            ...(saved?.id || row.id ? {} : { createdAt: serverTimestamp() }),
          },
          { merge: true }
        );

        writeCount += 1;
      });

      if (hasTopDrafts) {
        const cleanTopDrafts = {};

        Object.entries(topDrafts).forEach(([key, value]) => {
          cleanTopDrafts[key] = parseNum(value);
        });

        batch.set(
          doc(db, COLLECTIONS.profitLossTop, targetMonthKey),
          {
            monthKey: targetMonthKey,
            payments: cleanTopDrafts,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        writeCount += 1;
      }

      if (writeCount > 0) {
        await batch.commit();
      }

      applySavedDraftsToLocalState(targetMonthKey, rowDrafts, topDrafts);

      setDraftCells((prev) => {
        const next = { ...prev };
        delete next[targetMonthKey];
        draftCellsRef.current = next;
        dirtyRef.current =
          Object.keys(next).length > 0 ||
          Object.keys(draftTopCellsRef.current || {}).length > 0;
        return next;
      });

      setDraftTopCells((prev) => {
        const next = { ...prev };
        delete next[targetMonthKey];
        draftTopCellsRef.current = next;
        dirtyRef.current =
          Object.keys(draftCellsRef.current || {}).length > 0 ||
          Object.keys(next).length > 0;
        return next;
      });

      if (!silent) {
        alert("변경 내용이 저장되었습니다.");
      }

      return true;
    } catch (error) {
      console.error("손익계산 저장 오류:", error);
      alert("저장 중 오류가 발생했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setSavingDrafts(false);
      savingDraftsRef.current = false;
    }
  };

  const confirmAndSaveBeforeMove = async () => {
    if (!dirtyRef.current) return true;

    const ok = window.confirm(
      "저장되지 않은 변경 내용이 있습니다.\n저장 후 이동하시겠습니까?\n\n확인: 저장 후 이동\n취소: 현재 화면에 머무름"
    );

    if (!ok) return false;

    return await saveAllChanges({ silent: true });
  };

  const handleYearChange = async (nextYear) => {
    if (nextYear === year) return;

    const activeElement = document.activeElement;
    if (activeElement?.closest?.(".pl-page")) activeElement.blur?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const canMove = await confirmAndSaveBeforeMove();
    if (!canMove) return;

    setYear(nextYear);
  };

  const handleMonthChange = async (nextMonth) => {
    if (nextMonth === month) return;

    const activeElement = document.activeElement;
    if (activeElement?.closest?.(".pl-page")) activeElement.blur?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const canMove = await confirmAndSaveBeforeMove();
    if (!canMove) return;

    setMonth(nextMonth);
  };

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!dirtyRef.current) return undefined;

      event.preventDefault();
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const handleDocumentClick = async (event) => {
      if (savingDraftsRef.current) return;

      const link = event.target?.closest?.("a[href]");
      if (!link) return;

      const href = link.getAttribute("href");
      const target = link.getAttribute("target");

      if (!href || href.startsWith("#") || target === "_blank") return;

      const url = new URL(link.href, window.location.href);
      if (url.href === window.location.href) return;

      event.preventDefault();
      event.stopPropagation();

      const activeElement = document.activeElement;
      if (activeElement?.closest?.(".pl-page")) {
        activeElement.blur?.();
      }

      await new Promise((resolve) => setTimeout(resolve, 0));

      if (!dirtyRef.current) {
        window.location.href = url.href;
        return;
      }

      const canMove = await confirmAndSaveBeforeMove();

      if (canMove) {
        window.location.href = url.href;
      }
    };

    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, []);

  const handleWaterUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingWater(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const excelRows = parseWaterExcelRows(workbook);

      if (!excelRows.length) {
        alert("업로드할 수도요금 데이터를 찾지 못했습니다.");
        return;
      }

      const villaMap = makeIndexedMapByVilla(villaRows);
      const batch = writeBatch(db);

      let matchedCount = 0;
      const unmatchedCodes = [];
      const appliedRows = [];

      excelRows.forEach((excelRow) => {
        const villa = getSourceByCode(villaMap, excelRow.code);

        if (!villa || isSubCodeRow(villa)) {
          unmatchedCodes.push(`${excelRow.code}번`);
          return;
        }

        const code = getCode(villa);
        const villaName = getVillaName(villa);
        const fullKey = makeFullKey(code, villaName);

        const saved =
          profitMap[fullKey] || profitCodeMap[normalizeLoose(code)] || null;

        const ref = saved?.id
          ? doc(db, COLLECTIONS.profitLoss, saved.id)
          : doc(collection(db, COLLECTIONS.profitLoss));

        batch.set(
          ref,
          {
            code,
            codeNumber: code,
            villaName,
            snapshotByMonth: {
              [monthKey]: true,
            },
            monthly: {
              [monthKey]: {
                waterFee: excelRow.waterFee,
              },
            },
            updatedAt: serverTimestamp(),
            ...(saved?.id ? {} : { createdAt: serverTimestamp() }),
          },
          { merge: true }
        );

        appliedRows.push({
          id: saved?.id,
          code,
          codeNumber: code,
          villaName,
          waterFee: excelRow.waterFee,
        });

        matchedCount += 1;
      });

      await batch.commit();

      setProfitRows((prev) => {
        let next = [...prev];

        appliedRows.forEach((applied) => {
          const appliedCodeKey = normalizeLoose(applied.code);
          const appliedFullKey = makeFullKey(applied.code, applied.villaName);

          const index = next.findIndex((item) => {
            const itemCodeKey = normalizeLoose(getCode(item));
            const itemFullKey = makeFullKey(getCode(item), getVillaName(item));

            return (
              itemFullKey === appliedFullKey || itemCodeKey === appliedCodeKey
            );
          });

          if (index >= 0) {
            next[index] = {
              ...next[index],
              code: applied.code,
              codeNumber: applied.code,
              villaName: applied.villaName,
              monthly: {
                ...(next[index].monthly || {}),
                [monthKey]: {
                  ...(next[index].monthly?.[monthKey] || {}),
                  waterFee: applied.waterFee,
                },
              },
            };
          } else {
            next.push({
              code: applied.code,
              codeNumber: applied.code,
              villaName: applied.villaName,
              monthly: {
                [monthKey]: {
                  waterFee: applied.waterFee,
                },
              },
            });
          }
        });

        return next;
      });

      alert(
        [
          "수도요금 업로드 완료",
          `총 ${excelRows.length}건 중 ${matchedCount}건이 손익계산에 반영되었습니다.`,
          unmatchedCodes.length
            ? `미매칭 코드: ${unmatchedCodes.slice(0, 20).join(", ")}${
                unmatchedCodes.length > 20 ? " 외" : ""
              }`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
    } catch (error) {
      console.error("수도요금 엑셀 업로드 오류:", error);
      alert("수도요금 엑셀 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingWater(false);
      if (waterFileRef.current) waterFileRef.current.value = "";
    }
  };

  // "기타" 메모 팝업을 엽니다. (금액칸에서 Enter를 눌렀을 때 호출)
  const openEtcNoteEditor = useCallback((row, rect, currentValue) => {
    setEtcNoteEditor({
      rowKey: makeFullKey(row.code, row.villaName),
      row: {
        id: row.id || "",
        code: row.code || "",
        codeNumber: row.code || "",
        villaName: row.villaName || "",
        baseVillaId: row.baseVillaId || "",
      },
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2,
      value: currentValue || "",
    });
  }, []);

  const closeEtcNoteEditor = useCallback(() => {
    setEtcNoteEditor(null);
  }, []);

  const saveEtcNoteEditor = useCallback(() => {
    setEtcNoteEditor((current) => {
      if (!current) return current;
      setCellDraft(current.row, ETC_NOTE_KEY, current.value);
      return null;
    });
  }, [setCellDraft]);

  // 새로고침: 저장 후 고정되어 있던 자동입력 항목(인터넷비/승강기/소방안전/
  // 전기안전/청소비)과 빌라 목록을 지금 시점의 실제 데이터로 다시 채웁니다.
  // (화면/임시 초안에만 반영되며, 최종 반영하려면 저장 버튼을 눌러야 합니다)
  const refreshAutoData = useCallback(() => {
    setRefreshingAuto(true);

    try {
      const liveRows = makeMergedRowsByMonth(monthKey, peCalcMap, {
        forceLiveAuto: true,
      });

      liveRows.forEach((liveRow) => {
        const liveData = liveRow.monthly?.[monthKey] || {};

        FREEZE_AUTO_KEYS.forEach((key) => {
          setCellDraft(liveRow, key, liveData[key]);
        });
      });

      alert(
        "현재 실제 데이터로 자동입력 항목을 새로고침했습니다.\n화면 내용을 확인한 뒤 저장 버튼을 눌러야 최종 반영됩니다."
      );
    } finally {
      setRefreshingAuto(false);
    }
  }, [monthKey, peCalcMap, setCellDraft]);

  const focusCell = useCallback((rowIndex, colIndex) => {
    const target = inputRefs.current[`${rowIndex}-${colIndex}`];
    if (!target) return;

    target.focus();

    setTimeout(() => {
      target.select?.();
    }, 0);
  }, []);

  const handleKeyDown = useCallback(
    (e, rowIndex, colIndex) => {
      let nextRow = rowIndex;
      let nextCol = colIndex;

      if (e.key === "Enter") {
        nextRow = rowIndex + 1;
      } else if (e.key === "ArrowUp") {
        nextRow = rowIndex - 1;
      } else if (e.key === "ArrowDown") {
        nextRow = rowIndex + 1;
      } else if (e.key === "ArrowLeft") {
        nextCol = colIndex - 1;
      } else if (e.key === "ArrowRight") {
        nextCol = colIndex + 1;
      } else {
        return;
      }

      e.preventDefault();

      if (nextCol < 0) {
        nextRow -= 1;
        nextCol = ITEMS.length - 1;
      }

      if (nextCol >= ITEMS.length) {
        nextRow += 1;
        nextCol = 0;
      }

      if (nextRow < 0) {
        nextRow = 0;
        nextCol = 0;
      }

      focusCell(nextRow, nextCol);
    },
    [focusCell]
  );

  // 셀 <input> DOM 참조를 등록하는 함수도 안정적인 참조로 고정합니다.
  const registerInputRef = useCallback((rowIndex, colIndex, el) => {
    inputRefs.current[`${rowIndex}-${colIndex}`] = el;
  }, []);

  const focusTopCell = useCallback((colIndex) => {
    const target = topInputRefs.current[colIndex];
    if (!target) return;

    target.focus();

    setTimeout(() => {
      target.select?.();
    }, 0);
  }, []);

  const handleTopKeyDown = useCallback(
    (e, colIndex) => {
      let nextCol = colIndex;

      if (e.key === "Enter" || e.key === "ArrowRight") {
        nextCol = colIndex + 1;
      } else if (e.key === "ArrowLeft") {
        nextCol = colIndex - 1;
      } else {
        return;
      }

      e.preventDefault();

      if (nextCol < 0) nextCol = 0;
      if (nextCol >= ITEMS.length) nextCol = ITEMS.length - 1;

      focusTopCell(nextCol);
    },
    [focusTopCell]
  );

  const openStatsModal = () => {
    setStatsYear(year);
    setStatsMonth(month);
    setStatsModalOpen(true);
  };

  const villaChartMax = Math.max(
    ...statsData.villaStats.map((row) => Math.abs(row.positiveChargeIncome)),
    1
  );

  return (
    <div className="pl-page">
      <div className="pl-header">
        <div className="pl-title-group">
          <div className="pl-title-icon">
            <FiTrendingUp />
          </div>

          <div>
            <h2>손익계산</h2>

            <p>
              {hasUnsavedChanges && (
                <span className="pl-header-meta pl-dirty-label">
                  저장되지 않은 변경사항이 있습니다
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="pl-toolbar">
        <div className="pl-filter">
          <div className="pl-select-wrap pl-select-wrap-year">
            <select value={year} onChange={(e) => handleYearChange(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <FiChevronDown />
          </div>

          <div className="pl-select-wrap pl-select-wrap-month">
            <select value={month} onChange={(e) => handleMonthChange(e.target.value)}>
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {Number(m)}월
                </option>
              ))}
            </select>
            <FiChevronDown />
          </div>

          <button
            type="button"
            className="pl-btn pl-upload-btn"
            onClick={() => waterFileRef.current?.click()}
            disabled={uploadingWater}
          >
            <FiUploadCloud />
            {uploadingWater ? "업로드중..." : "수도업로드"}
          </button>

          <button
            type="button"
            className="pl-btn pl-refresh-btn"
            onClick={refreshAutoData}
            disabled={refreshingAuto}
            title="인터넷비/승강기/소방안전/전기안전/청소비 자동입력 항목과 빌라 목록을 지금 실제 데이터로 다시 불러옵니다."
          >
            <FiRefreshCw className={refreshingAuto ? "pl-spin" : ""} />
            {refreshingAuto ? "새로고침중..." : "새로고침"}
          </button>

          <button type="button" className="pl-btn pl-stats-btn" onClick={openStatsModal}>
            <FiBarChart2 />
            통계
          </button>

          <button
            type="button"
            className={`pl-btn pl-save-btn ${hasUnsavedChanges ? "is-dirty" : ""}`}
            onMouseDown={() => {
              document.activeElement?.blur?.();
            }}
            onClick={() => saveAllChanges()}
            disabled={savingDrafts}
          >
            <FiSave />
            {savingDrafts
              ? "저장중..."
              : hasUnsavedChanges
              ? `저장 (${currentDraftCellCount + currentDraftTopCount})`
              : "저장완료"}
            {hasUnsavedChanges && !savingDrafts && (
              <span className="pl-save-dot" />
            )}
          </button>

          <input
            ref={waterFileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleWaterUpload}
            style={{ display: "none" }}
          />
        </div>

        <div className="pl-search-wrap">
          <FiSearch />
          <input
            className="pl-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="코드번호 / 빌라명 검색"
          />
          {search && (
            <button
              type="button"
              className="pl-search-clear"
              onClick={() => setSearch("")}
            >
              <FiX />
            </button>
          )}
        </div>
      </div>

      <div className="pl-table-wrap pl-top-table-wrap">
        <table className="pl-table pl-top-table">
          <thead>
            <tr>
              <th rowSpan="2" colSpan="3" className="pl-top-month">
                {year}년 {Number(month)}월
              </th>

              {ITEMS.map((item) => (
                <th key={item.key}>{item.label}</th>
              ))}

              <th>총 지출</th>
              <th>부과수입</th>
            </tr>

            <tr>
              {ITEMS.map((item, colIndex) => (
                <th key={item.key} className="pl-sub-th">
                  <MoneyInput
                    inputRef={(el) => {
                      topInputRefs.current[colIndex] = el;
                    }}
                    className="pl-money-input"
                    value={topDisplayPayments[item.key]}
                    onSave={(value) => saveTopCell(item.key, value)}
                    onKeyDown={(e) => handleTopKeyDown(e, colIndex)}
                    placeholder="-"
                  />
                </th>
              ))}

              <th className="pl-sub-th">{fmt(topCalc.totalExpense) || "0"}</th>
              <th className="pl-sub-th">{fmt(topCalc.chargeIncome) || "0"}</th>
            </tr>
          </thead>

          <tbody>
            <tr className="pl-charge-sum-row">
              <th colSpan="3">부과합계</th>

              {ITEMS.map((item) => (
                <td key={item.key} className="pl-profit">
                  {fmt(columnTotals[item.key]) || "-"}
                </td>
              ))}

              <td className="pl-profit">
                {fmt(columnTotals.totalExpense) || "-"}
              </td>
              <td
                className={
                  columnTotals.chargeIncome >= 0
                    ? "pl-profit plus-text"
                    : "pl-profit minus-text"
                }
              >
                {fmt(columnTotals.chargeIncome) || "-"}
              </td>
            </tr>

            <tr className="pl-diff-row">
              <th colSpan="3">차액</th>

              {ITEMS.map((item) => (
                <td
                  key={item.key}
                  className={
                    balanceCalc[item.key] >= 0
                      ? "pl-profit plus-text"
                      : "pl-profit minus-text"
                  }
                >
                  {fmt(balanceCalc[item.key]) || "-"}
                </td>
              ))}

              <td
                className={
                  balanceCalc.totalExpense >= 0
                    ? "pl-profit plus-text"
                    : "pl-profit minus-text"
                }
              >
                {fmt(balanceCalc.totalExpense) || "-"}
              </td>
              <td
                className={
                  balanceCalc.chargeIncome >= 0
                    ? "pl-profit plus-text"
                    : "pl-profit minus-text"
                }
              >
                {fmt(balanceCalc.chargeIncome) || "-"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pl-table-wrap pl-main-table-wrap">
        <table className="pl-table pl-main-table">
          <thead>
            <tr>
              <th rowSpan="2" className="pl-no-col">
                번호
              </th>
              <th rowSpan="2" className="pl-code-col">
                코드번호
              </th>
              <th rowSpan="2" className="pl-villa-col">
                빌라명
              </th>

              {ITEMS.map((item) => (
                <th
                  key={item.key}
                  className={`pl-item-col pl-col-${item.key}`}
                >
                  {item.label}
                </th>
              ))}

              <th>총 지출</th>
              <th>부과수입</th>
              <th rowSpan="2">마이너스 주요항목</th>
            </tr>

            <tr>
              {ITEMS.map((item) => (
                <th
                  key={item.key}
                  className={`pl-sub-th pl-item-col pl-col-${item.key}`}
                >
                  {fmt(columnTotals[item.key]) || "0"}
                </th>
              ))}

              <th className="pl-sub-th">
                {fmt(columnTotals.totalExpense) || "0"}
              </th>
              <th className="pl-sub-th">
                {fmt(columnTotals.chargeIncome) || "0"}
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((row, rowIndex) => (
              <ProfitTableRow
                key={`${row.code}-${row.villaName}`}
                row={row}
                rowIndex={rowIndex}
                monthKey={monthKey}
                onSaveCell={saveCell}
                onKeyDownCell={handleKeyDown}
                onMinusReasonChange={handleMinusReasonChange}
                onOpenEtcNote={openEtcNoteEditor}
                registerInputRef={registerInputRef}
              />
            ))}

            {!filteredRows.length && (
              <tr>
                <td colSpan={ITEMS.length + 6} className="pl-empty">
                  해당 월에 저장된 손익계산 빌라 정보가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {etcNoteEditor &&
        createPortal(
          <div className="pl-etc-note-overlay" onClick={closeEtcNoteEditor}>
            <div
              className="pl-etc-note-popup"
              style={{
                top: etcNoteEditor.top,
                left: etcNoteEditor.left,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pl-etc-note-popup-title">기타 항목 메모</div>

              <textarea
                autoFocus
                className="pl-etc-note-textarea"
                value={etcNoteEditor.value}
                placeholder="예: 엘리베이터 부품 교체비"
                onChange={(e) =>
                  setEtcNoteEditor((current) =>
                    current ? { ...current, value: e.target.value } : current
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    saveEtcNoteEditor();
                  } else if (e.key === "Escape") {
                    closeEtcNoteEditor();
                  }
                }}
              />

              <div className="pl-etc-note-popup-actions">
                <button
                  type="button"
                  className="pl-etc-note-cancel"
                  onClick={closeEtcNoteEditor}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="pl-etc-note-save"
                  onClick={saveEtcNoteEditor}
                >
                  저장
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {statsModalOpen && (
        <div className="pl-modal">
          <div
            className="pl-modal-backdrop"
            onClick={() => setStatsModalOpen(false)}
          />

          <div className="pl-stats-panel">
            <div className="pl-stats-header">
              <div className="pl-modal-header-title">
                <h3>
                  <FiBarChart2 />
                  손익 통계
                </h3>
                <p>통계창에서 년도와 월을 변경해 바로 확인할 수 있습니다.</p>
              </div>

              <div className="pl-stats-filter">
                <div className="pl-select-wrap pl-select-wrap-stats">
                  <select
                    value={statsYear}
                    onChange={(e) => setStatsYear(e.target.value)}
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}년
                      </option>
                    ))}
                  </select>
                  <FiChevronDown />
                </div>

                <div className="pl-select-wrap pl-select-wrap-stats">
                  <select
                    value={statsMonth}
                    onChange={(e) => setStatsMonth(e.target.value)}
                  >
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>
                        {Number(m)}월
                      </option>
                    ))}
                  </select>
                  <FiChevronDown />
                </div>

                <button
                  type="button"
                  className="pl-modal-close"
                  onClick={() => setStatsModalOpen(false)}
                >
                  <FiX />
                </button>
              </div>
            </div>

            <div className="pl-stats-summary four">
              <div className="pl-stat-card pl-stat-card-count">
                <div className="pl-stat-icon">
                  <FiUsers />
                </div>
                <div>
                  <span>조회 빌라</span>
                  <strong>{statsRows.length.toLocaleString()}개</strong>
                </div>
              </div>

              <div className="pl-stat-card pl-stat-card-charge">
                <div className="pl-stat-icon">
                  <FiDollarSign />
                </div>
                <div>
                  <span>부과관리비 합계</span>
                  <strong>{fmt(statsColumnTotals.chargeFee) || "0"}원</strong>
                </div>
              </div>

              <div className="pl-stat-card pl-stat-card-expense">
                <div className="pl-stat-icon">
                  <FiTrendingDown />
                </div>
                <div>
                  <span>총 지출 합계</span>
                  <strong>{fmt(statsColumnTotals.totalExpense) || "0"}원</strong>
                </div>
              </div>

              <div className="pl-stat-card pl-stat-card-charge-income">
                <div className="pl-stat-icon">
                  <FiDollarSign />
                </div>
                <div>
                  <span>부과수입 (부과관리비 − 총지출)</span>
                  <strong
                    className={
                      statsChargeIncome >= 0 ? "plus-text" : "minus-text"
                    }
                  >
                    {fmt(statsChargeIncome) || "0"}원
                  </strong>
                </div>
              </div>
            </div>

            <div className="pl-stats-profit-line">
              <div>
                <span>{statsYear}년 {Number(statsMonth)}월 수익률</span>
                <strong
                  className={
                    statsChargeIncome >= 0 ? "plus-text" : "minus-text"
                  }
                >
                  {getRate(statsChargeIncome, statsColumnTotals.chargeFee).toFixed(1)}
                  %
                </strong>
              </div>
            </div>

            <div className="pl-stats-grid single">
              <div className="pl-stats-box pl-wide">
                <h4>빌라별 부과수입 TOP</h4>

                <div className="pl-villa-stat-list expanded">
                  {statsData.villaStats.map((row) => (
                    <div
                      className="pl-villa-stat-row"
                      key={`${row.code}-${row.villaName}`}
                    >
                      <div className="pl-villa-stat-title">
                        <span>{row.code}</span>
                        <strong>{row.villaName}</strong>
                      </div>

                      <div className="pl-chart-track">
                        <div
                          className="pl-chart-bar villa-plus"
                          style={{
                            width: `${Math.max(
                              4,
                              (Math.abs(row.positiveChargeIncome) /
                                villaChartMax) *
                                100
                            )}%`,
                          }}
                        />
                      </div>

                      <strong className="plus-text">
                        +{fmt(row.positiveChargeIncome) || "0"}
                      </strong>
                    </div>
                  ))}

                  {!statsData.villaStats.length && (
                    <div className="pl-stats-empty">표시할 빌라가 없습니다.</div>
                  )}
                </div>
              </div>

              <div className="pl-stats-box">
                <h4>마이너스 빌라</h4>

                <div className="pl-minus-list">
                  {statsData.minusRows.map((row) => (
                    <div
                      className="pl-minus-item"
                      key={`${row.code}-${row.villaName}`}
                    >
                      <div>
                        <span>{row.code}</span>
                        <strong>{row.villaName}</strong>
                      </div>
                      <p>{row.minusReason || "사유 미선택"}</p>
                      <em>{fmt(row.chargeIncome) || "0"}</em>
                    </div>
                  ))}

                  {!statsData.minusRows.length && (
                    <div className="pl-stats-empty">마이너스 빌라가 없습니다.</div>
                  )}
                </div>
              </div>

              <div className="pl-stats-box pl-wide">
                <h4>{statsYear}년 월별 수익 / 수익률</h4>

                <div className="pl-year-summary">
                  <div>
                    <span>연간 부과관리비</span>
                    <strong>
                      {fmt(statsData.yearlySummary.chargeFee) || "0"}원
                    </strong>
                  </div>
                  <div>
                    <span>연간 총지출</span>
                    <strong>
                      {fmt(statsData.yearlySummary.totalExpense) || "0"}원
                    </strong>
                  </div>
                  <div>
                    <span>연간 부과수입</span>
                    <strong
                      className={
                        statsData.yearlySummary.chargeIncome >= 0
                          ? "plus-text"
                          : "minus-text"
                      }
                    >
                      {fmt(statsData.yearlySummary.chargeIncome) || "0"}원
                    </strong>
                  </div>
                  <div>
                    <span>연간 수익률</span>
                    <strong
                      className={
                        statsData.yearlySummary.chargeIncome >= 0
                          ? "plus-text"
                          : "minus-text"
                      }
                    >
                      {statsData.yearlySummary.profitRate.toFixed(1)}%
                    </strong>
                  </div>
                </div>

                <div className="pl-month-stat-table-wrap">
                  <table className="pl-month-stat-table">
                    <thead>
                      <tr>
                        <th>월</th>
                        <th>부과관리비</th>
                        <th>총지출</th>
                        <th>부과수입</th>
                        <th>수익률</th>
                      </tr>
                    </thead>

                    <tbody>
                      {statsData.monthlyStats.map((row) => (
                        <tr
                          key={row.monthKey}
                          className={
                            row.month === statsMonth ? "selected" : ""
                          }
                        >
                          <td>{Number(row.month)}월</td>
                          <td>{fmt(row.chargeFee) || "-"}</td>
                          <td>{fmt(row.totalExpense) || "-"}</td>
                          <td
                            className={
                              row.chargeIncome >= 0
                                ? "plus-text"
                                : "minus-text"
                            }
                          >
                            {fmt(row.chargeIncome) || "-"}
                          </td>
                          <td
                            className={
                              row.chargeIncome >= 0
                                ? "plus-text"
                                : "minus-text"
                            }
                          >
                            {row.profitRate.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
