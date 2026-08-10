// src/pages/ProfitLossPage.js
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  writeBatch,
  setDoc,
} from "firebase/firestore";
import "./ProfitLossPage.css";

const COLLECTIONS = {
  villas: "villas",
  profitLoss: "profitLoss",
  profitLossTop: "profitLossTop",
  includedUtilities: "profitLossIncludedUtilities",

  telco: "telco",
  elevator: "elevator",
  fireSafety: "fireSafety",
  electricSafety: "electricSafety",
  cleaning: "cleaning",
};


const MONTHS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, "0")
);

const ITEMS = [
  { key: "managementFee", label: "입금관리비" },
  { key: "chargeFee", label: "부과관리비" },
  { key: "waterFee", label: "수도요금" },
  { key: "publicElectric", label: "공용전기", auto: true },
  { key: "communicationFee", label: "인터넷비", auto: true },
  { key: "elevatorFee", label: "승강기", auto: true },
  { key: "fireSafety", label: "소방안전", auto: true },
  { key: "electricSafety", label: "전기안전", auto: true },
  { key: "heatingRepair", label: "난방온수" },
  { key: "cleaningFee", label: "청소비", auto: true },
  { key: "septicFee", label: "정화조" },
  { key: "elevatorInspect", label: "승강기검사" },
];

const EXPENSE_KEYS = [
  "waterFee",
  "publicElectric",
  "communicationFee",
  "elevatorFee",
  "fireSafety",
  "electricSafety",
  "heatingRepair",
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

const INCLUDED_UTILITY_KEYS = [
  { key: "waterFee", label: "수도요금" },
  { key: "publicElectric", label: "공용전기" },
  { key: "communicationFee", label: "인터넷비" },
  { key: "elevatorFee", label: "승강기" },
  { key: "fireSafety", label: "소방안전" },
  { key: "electricSafety", label: "전기안전" },
];

const AUTO_KEYS = new Set(
  ITEMS.filter((item) => item.auto).map((item) => item.key)
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


const getIncludedRowTotal = (row) => {
  const amounts = row.amounts || {};
  const enabled = row.enabled || {};

  return INCLUDED_UTILITY_KEYS.reduce((sum, item) => {
    if (enabled[item.key] === false) return sum;
    return sum + parseNum(amounts[item.key]);
  }, 0);
};

const getRate = (profit, base) => {
  const b = parseNum(base);
  if (!b) return 0;
  return (parseNum(profit) / b) * 100;
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
  const [includedRows, setIncludedRows] = useState([]);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [uploadingWater, setUploadingWater] = useState(false);

  const [includedModalOpen, setIncludedModalOpen] = useState(false);
  const [includedSearch, setIncludedSearch] = useState("");
  const [editingIncludedId, setEditingIncludedId] = useState("");

  const [statsModalOpen, setStatsModalOpen] = useState(false);

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
    listen(COLLECTIONS.includedUtilities, setIncludedRows);

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

  const makeMergedRowsByMonth = (targetMonthKey, targetPeCalcMap) => {
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

      if (activeVilla || !hasSavedRowsForMonth || isLiveMonth) {
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

      const monthData = isLiveMonth
        ? {
            ...savedMonthData,
            ...autoMonthData,
          }
        : {
            ...autoMonthData,
            ...savedMonthData,
          };

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

  const mergedRowMap = useMemo(() => {
    const map = {};

    displayMergedRows.forEach((row) => {
      const key = makeFullKey(row.code, row.villaName);
      if (key !== "__") map[key] = row;
    });

    return map;
  }, [displayMergedRows]);

  const includedBaseRows = useMemo(() => {
    const map = {};

    includedRows
      .filter((row) => !isSubCodeRow(row))
      .forEach((row) => {
        const key = makeFullKey(row.code, row.villaName);
        if (key === "__") return;

        const prev = map[key];

        if (!prev) {
          map[key] = row;
          return;
        }

        const prevTime = prev.updatedAt?.seconds || prev.createdAt?.seconds || 0;
        const nextTime = row.updatedAt?.seconds || row.createdAt?.seconds || 0;

        if (nextTime >= prevTime) {
          map[key] = row;
        }
      });

    return Object.values(map).sort((a, b) => {
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
  }, [includedRows]);

  const getIncludedMonthRow = (includedRow, targetMonthKey, targetMergedMap) => {
    const key = makeFullKey(includedRow.code, includedRow.villaName);
    const profitRow = targetMergedMap[key];

    if (!profitRow) return null;
    if (includedRow.hiddenByMonth?.[targetMonthKey] === true) return null;

    const prevKey = getPrevMonthKey(targetMonthKey);
    const currentMonthData = profitRow.monthly?.[targetMonthKey] || {};
    const amounts = {};

    INCLUDED_UTILITY_KEYS.forEach((item) => {
      const manualAmount =
        includedRow.amountsByMonth?.[targetMonthKey]?.[item.key];

      amounts[item.key] =
        manualAmount !== undefined
          ? parseNum(manualAmount)
          : parseNum(currentMonthData[item.key]);
    });

    const enabled = {};

    INCLUDED_UTILITY_KEYS.forEach((item) => {
      const thisMonthEnabled =
        includedRow.enabledByMonth?.[targetMonthKey]?.[item.key];

      const prevMonthEnabled =
        includedRow.enabledByMonth?.[prevKey]?.[item.key];

      if (thisMonthEnabled !== undefined) {
        enabled[item.key] = thisMonthEnabled !== false;
      } else if (prevMonthEnabled !== undefined) {
        enabled[item.key] = prevMonthEnabled !== false;
      } else if (includedRow.enabled?.[item.key] !== undefined) {
        enabled[item.key] = includedRow.enabled[item.key] !== false;
      } else {
        enabled[item.key] = parseNum(amounts[item.key]) > 0;
      }
    });

    return {
      ...includedRow,
      code: profitRow.code,
      codeNumber: profitRow.code,
      villaName: profitRow.villaName,
      profitRowId: profitRow.id || "",
      amounts,
      enabled,
      currentMonthData,
    };
  };

  const includedMonthRows = useMemo(() => {
    return includedBaseRows
      .map((includedRow) =>
        getIncludedMonthRow(includedRow, monthKey, mergedRowMap)
      )
      .filter(Boolean);
  }, [includedBaseRows, mergedRowMap, monthKey]);

  const includedSearchResults = useMemo(() => {
    const keyword = includedSearch.trim().toLowerCase();
    if (!keyword) return [];

    const visibleKeys = new Set(
      includedMonthRows.map((row) => makeFullKey(row.code, row.villaName))
    );

    return displayMergedRows
      .filter((row) => {
        const key = makeFullKey(row.code, row.villaName);
        if (visibleKeys.has(key)) return false;

        return (
          String(row.code ?? "").toLowerCase().includes(keyword) ||
          String(row.villaName ?? "").toLowerCase().includes(keyword)
        );
      })
      .slice(0, 20);
  }, [includedSearch, displayMergedRows, includedMonthRows]);

  const includedColumnTotals = useMemo(() => {
    const result = {};

    INCLUDED_UTILITY_KEYS.forEach((item) => {
      result[item.key] = 0;
    });

    result.total = 0;

    includedMonthRows.forEach((row) => {
      const amounts = row.amounts || {};
      const enabled = row.enabled || {};

      INCLUDED_UTILITY_KEYS.forEach((item) => {
        if (enabled[item.key] === false) return;
        result[item.key] += parseNum(amounts[item.key]);
      });

      result.total += getIncludedRowTotal(row);
    });

    return result;
  }, [includedMonthRows]);

  const getRowCalcByMonth = (row, targetMonthKey) => {
    const data = row.monthly?.[targetMonthKey] || {};

    const totalExpense = EXPENSE_KEYS.reduce(
      (sum, key) => sum + parseNum(data[key]),
      0
    );

    const depositIncome = parseNum(data.managementFee) - totalExpense;
    const chargeIncome = parseNum(data.chargeFee) - totalExpense;

    return {
      totalExpense,
      depositIncome,
      chargeIncome,
    };
  };

  const getRowCalc = (row) => getRowCalcByMonth(row, monthKey);

  const getColumnTotals = (rows, targetMonthKey) => {
    const totals = {};

    ITEMS.forEach((item) => {
      totals[item.key] = 0;
    });

    const result = {
      ...totals,
      totalExpense: 0,
      depositIncome: 0,
      chargeIncome: 0,
    };

    rows.forEach((row) => {
      const data = row.monthly?.[targetMonthKey] || {};
      const calc = getRowCalcByMonth(row, targetMonthKey);

      ITEMS.forEach((item) => {
        result[item.key] += parseNum(data[item.key]);
      });

      result.totalExpense += calc.totalExpense;
      result.depositIncome += calc.depositIncome;
      result.chargeIncome += calc.chargeIncome;
    });

    return result;
  };

  const columnTotals = useMemo(() => {
    return getColumnTotals(filteredRows, monthKey);
  }, [filteredRows, monthKey]);

  const getTopCalc = (payments = {}) => {
    const totalExpense = EXPENSE_KEYS.reduce(
      (sum, key) => sum + parseNum(payments[key]),
      0
    );

    const depositIncome = parseNum(payments.managementFee) - totalExpense;
    const chargeIncome = parseNum(payments.chargeFee) - totalExpense;

    return {
      totalExpense,
      depositIncome,
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

    result.depositIncome =
      parseNum(result.managementFee) - parseNum(result.totalExpense);

    result.chargeIncome =
      parseNum(result.chargeFee) - parseNum(result.totalExpense);

    return result;
  };

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

  const statsTopDoc = useMemo(
    () => (statsModalOpen ? getTopDocByMonth(statsMonthKey) : {}),
    [statsModalOpen, topRows, statsMonthKey]
  );

  const statsTopPayments = useMemo(
    () => (statsModalOpen ? getEffectiveTopPayments(statsMonthKey) : {}),
    [statsModalOpen, statsTopDoc, statsMonthKey, topRows]
  );

  const statsTopCalc = useMemo(
    () => (statsModalOpen ? getTopCalc(statsTopPayments) : getTopCalc({})),
    [statsModalOpen, statsTopPayments]
  );

  const statsColumnTotals = useMemo(() => {
    if (!statsModalOpen) return getColumnTotals([], statsMonthKey);
    return getColumnTotals(statsRows, statsMonthKey);
  }, [statsModalOpen, statsRows, statsMonthKey]);

  const statsBalanceCalc = useMemo(() => {
    if (!statsModalOpen) return getBalanceCalc({}, {});
    return getBalanceCalc(statsColumnTotals, statsTopPayments);
  }, [statsModalOpen, statsColumnTotals, statsTopPayments]);

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
          depositIncome: calc.depositIncome,
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

    const monthlyStats = MONTHS.map((m) => {
      const mk = getMonthKey(statsYear, m);
      const payments = getEffectiveTopPayments(mk);
      const monthRows = makeMergedRowsByMonth(mk, mk === statsMonthKey ? statsPeCalcMap : {});
      const monthColumnTotals = getColumnTotals(monthRows, mk);
      const monthBalance = getBalanceCalc(monthColumnTotals, payments);

      const chargeFee = Math.max(
        parseNum(payments.chargeFee),
        parseNum(monthColumnTotals.chargeFee)
      );
      const totalExpense = parseNum(monthBalance.totalExpense);
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

  const setCellDraft = (row, key, value) => {
    if (AUTO_KEYS.has(key)) return;

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
  };

  const saveCell = (row, key, value) => {
    setCellDraft(row, key, value);
  };

  const handleMinusReasonChange = (row, value) => {
    setCellDraft(row, "minusReason", value);
  };

  const handleChange = () => {};

  const handleTopChange = (key, value) => {
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
  };

  const saveTopCell = (key, value) => {
    handleTopChange(key, value);
  };

  const applySavedDraftsToLocalState = (targetMonthKey, rowDrafts, topDrafts) => {
    Object.values(rowDrafts || {}).forEach((draft) => {
      const row = draft.row || {};
      const values = draft.values || {};
      const parsedValues = {};

      Object.entries(values).forEach(([key, value]) => {
        parsedValues[key] = key === "minusReason" ? value : parseNum(value);
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
          if (AUTO_KEYS.has(key)) return;
          cleanValues[key] = key === "minusReason" ? value : parseNum(value);
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

  const addIncludedUtilityRow = async (row) => {
    const key = makeFullKey(row.code, row.villaName);
    const existing = includedBaseRows.find(
      (item) => makeFullKey(item.code, item.villaName) === key
    );

    const data = row.monthly?.[monthKey] || {};
    const amounts = {};
    const enabled = {};

    INCLUDED_UTILITY_KEYS.forEach((item) => {
      amounts[item.key] = parseNum(data[item.key]);

      const prevEnabled =
        existing?.enabledByMonth?.[prevMonthKey]?.[item.key] ??
        existing?.enabled?.[item.key];

      enabled[item.key] =
        prevEnabled !== undefined
          ? prevEnabled !== false
          : parseNum(amounts[item.key]) > 0;
    });

    if (existing?.id) {
      await updateDoc(doc(db, COLLECTIONS.includedUtilities, existing.id), {
        code: row.code || "",
        codeNumber: row.code || "",
        villaName: row.villaName || "",
        [`hiddenByMonth.${monthKey}`]: false,
        [`amountsByMonth.${monthKey}`]: amounts,
        [`enabledByMonth.${monthKey}`]: enabled,
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, COLLECTIONS.includedUtilities), {
        code: row.code || "",
        codeNumber: row.code || "",
        villaName: row.villaName || "",
        amounts,
        enabled,
        amountsByMonth: {
          [monthKey]: amounts,
        },
        enabledByMonth: {
          [monthKey]: enabled,
        },
        hiddenByMonth: {
          [monthKey]: false,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    setIncludedSearch("");
  };

  const updateIncludedAmount = async (row, key, value) => {
    const cleanValue = parseNum(value);

    await updateDoc(doc(db, COLLECTIONS.includedUtilities, row.id), {
      [`amountsByMonth.${monthKey}.${key}`]: cleanValue,
      [`amounts.${key}`]: cleanValue,
      updatedAt: serverTimestamp(),
    });

    setIncludedRows((prev) =>
      prev.map((itemRow) =>
        itemRow.id === row.id
          ? {
              ...itemRow,
              amounts: {
                ...(itemRow.amounts || {}),
                [key]: cleanValue,
              },
              amountsByMonth: {
                ...(itemRow.amountsByMonth || {}),
                [monthKey]: {
                  ...(itemRow.amountsByMonth?.[monthKey] || {}),
                  [key]: cleanValue,
                },
              },
            }
          : itemRow
      )
    );
  };

  const handleIncludedAmountChange = (row, key, value) => {
    setIncludedRows((prev) =>
      prev.map((itemRow) =>
        itemRow.id === row.id
          ? {
              ...itemRow,
              amountsByMonth: {
                ...(itemRow.amountsByMonth || {}),
                [monthKey]: {
                  ...(itemRow.amountsByMonth?.[monthKey] || {}),
                  [key]: value,
                },
              },
            }
          : itemRow
      )
    );
  };

  const toggleIncludedEnabled = async (row, key, checked) => {
    const nextChecked = checked;

    await updateDoc(doc(db, COLLECTIONS.includedUtilities, row.id), {
      [`enabledByMonth.${monthKey}.${key}`]: nextChecked,
      [`enabled.${key}`]: nextChecked,
      updatedAt: serverTimestamp(),
    });

    setIncludedRows((prev) =>
      prev.map((itemRow) =>
        itemRow.id === row.id
          ? {
              ...itemRow,
              enabledByMonth: {
                ...(itemRow.enabledByMonth || {}),
                [monthKey]: {
                  ...(itemRow.enabledByMonth?.[monthKey] || {}),
                  [key]: nextChecked,
                },
              },
              enabled: {
                ...(itemRow.enabled || {}),
                [key]: nextChecked,
              },
            }
          : itemRow
      )
    );
  };

  const deleteIncludedRow = async (row) => {
    if (
      !window.confirm(
        `${row.villaName} 항목을 ${year}년 ${Number(
          month
        )}월 관리비 포함 공과금 목록에서만 숨길까요?`
      )
    ) {
      return;
    }

    await updateDoc(doc(db, COLLECTIONS.includedUtilities, row.id), {
      [`hiddenByMonth.${monthKey}`]: true,
      updatedAt: serverTimestamp(),
    });

    if (editingIncludedId === row.id) {
      setEditingIncludedId("");
    }
  };

  const focusCell = (rowIndex, colIndex) => {
    const target = inputRefs.current[`${rowIndex}-${colIndex}`];
    if (!target) return;

    target.focus();

    setTimeout(() => {
      target.select?.();
    }, 0);
  };

  const handleKeyDown = (e, rowIndex, colIndex) => {
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
  };

  const focusTopCell = (colIndex) => {
    const target = topInputRefs.current[colIndex];
    if (!target) return;

    target.focus();

    setTimeout(() => {
      target.select?.();
    }, 0);
  };

  const handleTopKeyDown = (e, colIndex) => {
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
  };

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
        <h2>손익계산</h2>
      </div>

      <div className="pl-toolbar">
        <div className="pl-filter">
          <select value={year} onChange={(e) => handleYearChange(e.target.value)}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>

          <select value={month} onChange={(e) => handleMonthChange(e.target.value)}>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {Number(m)}월
              </option>
            ))}
          </select>

          <button
            type="button"
            className="pl-upload-btn"
            onClick={() => waterFileRef.current?.click()}
            disabled={uploadingWater}
          >
            {uploadingWater ? "업로드중..." : "수도업로드"}
          </button>

          <button
            type="button"
            className="pl-include-btn"
            onClick={() => setIncludedModalOpen(true)}
          >
            관리비 포함 공과금
          </button>

          <button type="button" className="pl-stats-btn" onClick={openStatsModal}>
            통계
          </button>

          <button
            type="button"
            className={`pl-save-btn ${hasUnsavedChanges ? "is-dirty" : ""}`}
            onMouseDown={() => {
              document.activeElement?.blur?.();
            }}
            onClick={() => saveAllChanges()}
            disabled={savingDrafts}
          >
            {savingDrafts
              ? "저장중..."
              : hasUnsavedChanges
              ? `저장 (${currentDraftCellCount + currentDraftTopCount})`
              : "저장완료"}
          </button>

          {hasUnsavedChanges && (
            <span className="pl-unsaved-badge">저장되지 않은 변경 있음</span>
          )}

          <input
            ref={waterFileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleWaterUpload}
            style={{ display: "none" }}
          />
        </div>

        <input
          className="pl-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="코드번호 / 빌라명 검색"
        />
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
              <th>입금수입</th>
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
              <th className="pl-sub-th">{fmt(topCalc.depositIncome) || "0"}</th>
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
                  columnTotals.depositIncome >= 0
                    ? "pl-profit plus-text"
                    : "pl-profit minus-text"
                }
              >
                {fmt(columnTotals.depositIncome) || "-"}
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
                  balanceCalc.depositIncome >= 0
                    ? "pl-profit plus-text"
                    : "pl-profit minus-text"
                }
              >
                {fmt(balanceCalc.depositIncome) || "-"}
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
              <th>입금수입</th>
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
                {fmt(columnTotals.depositIncome) || "0"}
              </th>
              <th className="pl-sub-th">
                {fmt(columnTotals.chargeIncome) || "0"}
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((row, rowIndex) => {
              const data = row.monthly?.[monthKey] || {};
              const calc = getRowCalc(row);

              return (
                <tr key={`${row.code}-${row.villaName}`}>
                  <td>{rowIndex + 1}</td>
                  <td>{row.code}</td>
                  <td className="pl-villa">{row.villaName}</td>

                  {ITEMS.map((item, colIndex) => {
                    const isAuto = AUTO_KEYS.has(item.key);

                    return (
                      <td
                        key={item.key}
                        className={`pl-item-col pl-col-${item.key}`}
                      >
                        <MoneyInput
                          inputRef={(el) => {
                            inputRefs.current[`${rowIndex}-${colIndex}`] = el;
                          }}
                          className={[
                            "pl-money-input",
                            isAuto ? "pl-auto-input" : "",
                            item.key === "waterFee" ? "pl-water-input" : "",
                          ].join(" ")}
                          value={data[item.key]}
                          readOnly={isAuto}
                          onSave={(value) => saveCell(row, item.key, value)}
                          onKeyDown={(e) =>
                            handleKeyDown(e, rowIndex, colIndex)
                          }
                          placeholder="-"
                          title={isAuto ? "자동 입력 항목입니다." : ""}
                        />
                      </td>
                    );
                  })}

                  <td className="pl-total">{fmtZero(calc.totalExpense)}</td>
                  <td
                    className={
                      calc.depositIncome >= 0
                        ? "pl-profit plus-text"
                        : "pl-profit minus-text"
                    }
                  >
                    {fmtZero(calc.depositIncome)}
                  </td>
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
                      onChange={(e) =>
                        handleMinusReasonChange(row, e.target.value)
                      }
                    >
                      {MINUS_REASON_OPTIONS.map((option) => (
                        <option
                          key={option.value || "empty"}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}

            {!filteredRows.length && (
              <tr>
                <td colSpan={ITEMS.length + 7} className="pl-empty">
                  해당 월에 저장된 손익계산 빌라 정보가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {includedModalOpen && (
        <div className="pl-modal">
          <div
            className="pl-modal-backdrop"
            onClick={() => setIncludedModalOpen(false)}
          />

          <div className="pl-modal-panel">
            <div className="pl-modal-header">
              <div>
                <h3>관리비 포함 공과금 설정</h3>
                <p>
                  빌라목록과 금액은 선택 월의 손익계산 기준이며, 적용 체크와
                  금액 수정은 월별로 따로 저장됩니다.
                </p>
              </div>

              <div className="pl-modal-header-actions">
                <div className="pl-modal-search-wrap">
                  <input
                    className="pl-modal-search"
                    value={includedSearch}
                    onChange={(e) => setIncludedSearch(e.target.value)}
                    placeholder="코드번호 / 빌라명 검색"
                  />

                  {includedSearchResults.length > 0 && (
                    <div className="pl-search-result-box">
                      {includedSearchResults.map((row) => (
                        <button
                          type="button"
                          key={`${row.code}-${row.villaName}`}
                          className="pl-search-result-item"
                          onClick={() => addIncludedUtilityRow(row)}
                        >
                          <span>{row.code}</span>
                          <strong>{row.villaName}</strong>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="pl-modal-close"
                  onClick={() => setIncludedModalOpen(false)}
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="pl-included-table-wrap">
              <table className="pl-included-table">
                <thead>
                  <tr>
                    <th rowSpan="2">번호</th>
                    <th rowSpan="2">코드번호</th>
                    <th rowSpan="2">빌라명</th>

                    {INCLUDED_UTILITY_KEYS.map((item) => (
                      <th key={item.key}>{item.label}</th>
                    ))}

                    <th>합계</th>
                    <th rowSpan="2">관리</th>
                  </tr>

                  <tr>
                    {INCLUDED_UTILITY_KEYS.map((item) => (
                      <th key={item.key} className="pl-sub-th">
                        {fmt(includedColumnTotals[item.key]) || "0"}
                      </th>
                    ))}

                    <th className="pl-sub-th">
                      {fmt(includedColumnTotals.total) || "0"}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {includedMonthRows.map((row, index) => {
                    const isEditing = editingIncludedId === row.id;
                    const amounts = row.amounts || {};
                    const enabled = row.enabled || {};
                    const rowTotal = getIncludedRowTotal(row);

                    return (
                      <tr key={row.id}>
                        <td>{index + 1}</td>
                        <td>{row.code}</td>
                        <td className="pl-villa">{row.villaName}</td>

                        {INCLUDED_UTILITY_KEYS.map((item) => {
                          const checked = enabled[item.key] !== false;

                          return (
                            <td key={item.key}>
                              {isEditing ? (
                                <div className="pl-apply-cell">
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) =>
                                        toggleIncludedEnabled(
                                          row,
                                          item.key,
                                          e.target.checked
                                        )
                                      }
                                    />
                                    적용
                                  </label>

                                  <MoneyInput
                                    className="pl-modal-money-input"
                                    value={
                                      row.amountsByMonth?.[monthKey]?.[
                                        item.key
                                      ] ?? amounts[item.key]
                                    }
                                    onSave={(value) =>
                                      updateIncludedAmount(row, item.key, value)
                                    }
                                  />
                                </div>
                              ) : (
                                <span
                                  className={
                                    checked ? "pl-applied" : "pl-not-applied"
                                  }
                                >
                                  {fmt(amounts[item.key]) || "-"}
                                </span>
                              )}
                            </td>
                          );
                        })}

                        <td className="pl-total">{fmt(rowTotal) || "0"}</td>

                        <td>
                          <div className="pl-row-actions">
                            <button
                              type="button"
                              className="pl-edit-btn"
                              onClick={() =>
                                setEditingIncludedId(isEditing ? "" : row.id)
                              }
                            >
                              {isEditing ? "완료" : "수정"}
                            </button>

                            <button
                              type="button"
                              className="pl-delete-btn"
                              onClick={() => deleteIncludedRow(row)}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!includedMonthRows.length && (
                    <tr>
                      <td colSpan={INCLUDED_UTILITY_KEYS.length + 5}>
                        <div className="pl-modal-empty">
                          검색창에서 코드번호 또는 빌라명을 검색한 뒤 추가하세요.
                          현재 선택 월의 손익계산 목록에 없는 빌라는 이 월에서는
                          표시되지 않습니다.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {statsModalOpen && (
        <div className="pl-modal">
          <div
            className="pl-modal-backdrop"
            onClick={() => setStatsModalOpen(false)}
          />

          <div className="pl-stats-panel">
            <div className="pl-stats-header">
              <div>
                <h3>손익 통계</h3>
                <p>통계창에서 년도와 월을 변경해 바로 확인할 수 있습니다.</p>
              </div>

              <div className="pl-stats-filter">
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

                <button
                  type="button"
                  className="pl-modal-close"
                  onClick={() => setStatsModalOpen(false)}
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="pl-stats-summary five">
              <div className="pl-stat-card">
                <span>조회 빌라</span>
                <strong>{statsRows.length.toLocaleString()}개</strong>
              </div>

              <div className="pl-stat-card">
                <span>부과관리비</span>
                <strong>{fmt(statsColumnTotals.chargeFee) || "0"}원</strong>
              </div>

              <div className="pl-stat-card">
                <span>총 지출</span>
                <strong>{fmt(statsBalanceCalc.totalExpense) || "0"}원</strong>
              </div>

              <div className="pl-stat-card">
                <span>입금수입</span>
                <strong
                  className={
                    Math.max(
                      parseNum(statsTopPayments.managementFee),
                      parseNum(statsColumnTotals.managementFee)
                    ) -
                      parseNum(statsBalanceCalc.totalExpense) >=
                    0
                      ? "plus-text"
                      : "minus-text"
                  }
                >
                  {fmt(
                    Math.max(
                      parseNum(statsTopPayments.managementFee),
                      parseNum(statsColumnTotals.managementFee)
                    ) - parseNum(statsBalanceCalc.totalExpense)
                  ) || "0"}원
                </strong>
              </div>

              <div className="pl-stat-card">
                <span>부과수입</span>
                <strong
                  className={
                    Math.max(
                      parseNum(statsTopPayments.chargeFee),
                      parseNum(statsColumnTotals.chargeFee)
                    ) -
                      parseNum(statsBalanceCalc.totalExpense) >=
                    0
                      ? "plus-text"
                      : "minus-text"
                  }
                >
                  {fmt(
                    Math.max(
                      parseNum(statsTopPayments.chargeFee),
                      parseNum(statsColumnTotals.chargeFee)
                    ) - parseNum(statsBalanceCalc.totalExpense)
                  ) || "0"}원
                </strong>
              </div>
            </div>

            <div className="pl-stats-profit-line">
              <div>
                <span>상단 테이블 입금기준 수익</span>
                <strong
                  className={
                    Math.max(
                      parseNum(statsTopPayments.managementFee),
                      parseNum(statsColumnTotals.managementFee)
                    ) -
                      Math.max(
                        parseNum(statsTopCalc.totalExpense),
                        parseNum(statsBalanceCalc.totalExpense)
                      ) >=
                    0
                      ? "plus-text"
                      : "minus-text"
                  }
                >
                  {fmt(
                    Math.max(
                      parseNum(statsTopPayments.managementFee),
                      parseNum(statsColumnTotals.managementFee)
                    ) -
                      Math.max(
                        parseNum(statsTopCalc.totalExpense),
                        parseNum(statsBalanceCalc.totalExpense)
                      )
                  ) || "0"}원
                </strong>
              </div>

              <div>
                <span>수익률</span>
                <strong
                  className={
                    statsTopCalc.depositIncome >= 0
                      ? "plus-text"
                      : "minus-text"
                  }
                >
                  {getRate(
                    Math.max(
                      parseNum(statsTopPayments.managementFee),
                      parseNum(statsColumnTotals.managementFee)
                    ) -
                      Math.max(
                        parseNum(statsTopCalc.totalExpense),
                        parseNum(statsBalanceCalc.totalExpense)
                      ),
                    Math.max(
                      parseNum(statsTopPayments.managementFee),
                      parseNum(statsColumnTotals.managementFee)
                    )
                  ).toFixed(1)}
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