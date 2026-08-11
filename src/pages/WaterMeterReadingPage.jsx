// src/pages/WaterMeterReadingPage.jsx

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import * as XLSX from "xlsx";

import { db } from "../firebase";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";

import {
  FiPlus,
  FiUpload,
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiHome,
  FiMapPin,
  FiKey,
  FiDroplet,
  FiX,
  FiSave,
  FiChevronRight,
  FiUsers,
  FiPhone,
  FiUserCheck,
} from "react-icons/fi";

import "./WaterMeterReadingPage.css";


/* =========================================================
   저장 KEY

   기존 잘못 읽힌 데이터와 구분하기 위해 V3 사용
========================================================= */

const STORAGE_KEY =
  "hannam_water_meter_reading_v3";

const WATER_VILLA_COLLECTION =
  "waterMeterReadingVillas";

const WATER_INSPECTOR_COLLECTION =
  "waterMeterInspectors";

const FIRESTORE_BATCH_LIMIT = 400;

const normalizePhone = (value) =>
  String(value ?? "").replace(/\D/g, "");

/* =========================================================
   검침원 모바일 로그인 허용 날짜

   - 매월 25일 ~ 말일: 자동 허용
   - 매월 1일: 자동 허용
   - 그 외 날짜: PC에서 수동으로 켠 당일만 허용
========================================================= */

const pad2 = (value) =>
  String(value).padStart(2, "0");

const getLocalDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad2(
    date.getMonth() + 1
  )}-${pad2(date.getDate())}`;

const isAutomaticInspectorAccessDate = (date = new Date()) => {
  const day = date.getDate();

  return day >= 25 || day === 1;
};

const isInspectorLoginAllowed = (inspector, date = new Date()) => {
  if (isAutomaticInspectorAccessDate(date)) {
    return true;
  }

  return (
    cleanText(inspector?.manualAccessDate) ===
    getLocalDateKey(date)
  );
};

const formatDateTime = (value) => {
  if (!value) {
    return "로그인 기록 없음";
  }

  let date = null;

  if (typeof value?.toDate === "function") {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number") {
    date = new Date(value);
  } else if (typeof value === "string") {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
    }
  }

  if (!date || Number.isNaN(date.getTime())) {
    return "로그인 기록 없음";
  }

  return `${pad2(date.getMonth() + 1)}.${pad2(
    date.getDate()
  )} ${pad2(date.getHours())}:${pad2(
    date.getMinutes()
  )}`;
};

const formatMobileReadingDate = (value) => {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  const match = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})/
  );

  if (!match) {
    return "";
  }

  return `${Number(match[2])}/${Number(match[3])}`;
};

const getVillaMobileReadingDate = (
  villa,
  selectedYear,
  monthKey
) => {
  const point = getReadingPoint(
    selectedYear,
    monthKey
  );

  const value =
    villa?.mobileReadingDates?.[
      String(point.year)
    ]?.[point.monthKey];

  return formatMobileReadingDate(value);
};

const getCurrentMonthKey = () =>
  `m${new Date().getMonth() + 1}`;

const getCurrentMonthLabel = () =>
  `${new Date().getMonth() + 1}월`;

const CURRENT_YEAR =
  new Date().getFullYear();

const YEAR_OPTIONS =
  Array.from(
    {
      length:
        CURRENT_YEAR + 15 - 2020 + 1,
    },
    (_, index) =>
      2020 + index
  );



/* =========================================================
   엑셀 월 컬럼

   B = 호실
   C = 이전 12월
   D = 1월
   E = 2월
   ...
   O = 현재 12월
========================================================= */

const MONTH_COLUMNS = [
  {
    key: "prev12",
    label: "12월",
    excelIndex: 2,
  },

  {
    key: "m1",
    label: "1월",
    excelIndex: 3,
  },

  {
    key: "m2",
    label: "2월",
    excelIndex: 4,
  },

  {
    key: "m3",
    label: "3월",
    excelIndex: 5,
  },

  {
    key: "m4",
    label: "4월",
    excelIndex: 6,
  },

  {
    key: "m5",
    label: "5월",
    excelIndex: 7,
  },

  {
    key: "m6",
    label: "6월",
    excelIndex: 8,
  },

  {
    key: "m7",
    label: "7월",
    excelIndex: 9,
  },

  {
    key: "m8",
    label: "8월",
    excelIndex: 10,
  },

  {
    key: "m9",
    label: "9월",
    excelIndex: 11,
  },

  {
    key: "m10",
    label: "10월",
    excelIndex: 12,
  },

  {
    key: "m11",
    label: "11월",
    excelIndex: 13,
  },

  {
    key: "m12",
    label: "12월",
    excelIndex: 14,
  },
];


/* =========================================================
   ID 생성
========================================================= */

const makeId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
};


/* =========================================================
   공통 문자열 정리
========================================================= */

const cleanText = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};


/* =========================================================
   호실명 정리

   숫자뿐 아니라
   상가
   1상가
   헤어샵(2상가)
   101좌
   1층 큰뚜껑
   등 모두 문자열 그대로 유지
========================================================= */

const cleanRoomName = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};


/* =========================================================
   빈 검침 데이터
========================================================= */

const createEmptyReadings = () => {
  const result = {};

  MONTH_COLUMNS.forEach((month) => {
    result[month.key] = "";
  });

  return result;
};

/* =========================================================
   년도별 검침 데이터

   - 선택년도 1~12월은 readingYears[년도].m1~m12
   - 표 맨 앞 12월은 readingYears[선택년도-1].m12
   - 기존 room.readings 자료는 현재년도 최초 호환용으로 유지
========================================================= */

const createEmptyYearReadings = () => {
  const result = {};

  for (
    let month = 1;
    month <= 12;
    month += 1
  ) {
    result[`m${month}`] = "";
  }

  return result;
};


const toNumericReading = (value) => {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized =
    String(value)
      .replace(/,/g, "")
      .trim();

  if (!normalized) {
    return null;
  }

  const number =
    Number(normalized);

  return Number.isFinite(number)
    ? number
    : null;
};


const getReadingPoint = (
  selectedYear,
  monthKey
) => {
  if (monthKey === "prev12") {
    return {
      year:
        Number(selectedYear) - 1,
      monthKey: "m12",
      monthNumber: 12,
    };
  }

  const monthNumber =
    Number(
      String(monthKey).replace(
        "m",
        ""
      )
    );

  return {
    year:
      Number(selectedYear),
    monthKey,
    monthNumber,
  };
};


const getPreviousReadingPoint = (
  year,
  monthNumber
) => {
  if (monthNumber === 1) {
    return {
      year:
        Number(year) - 1,
      monthNumber: 12,
      monthKey: "m12",
    };
  }

  return {
    year:
      Number(year),
    monthNumber:
      monthNumber - 1,
    monthKey:
      `m${monthNumber - 1}`,
  };
};


const getRoomYearReading = (
  room,
  year,
  monthKey
) => {
  const yearKey =
    String(year);

  const yearlyValue =
    room?.readingYears?.[
      yearKey
    ]?.[monthKey];

  if (
    yearlyValue !== undefined &&
    yearlyValue !== null
  ) {
    return yearlyValue;
  }

  /*
   * 기존 구조 호환.
   * 현재년도 자료가 readingYears로 아직 이동되지 않은 경우만
   * room.readings 값을 읽는다.
   */
  if (
    Number(year) === CURRENT_YEAR
  ) {
    return (
      room?.readings?.[
        monthKey
      ] ??
      ""
    );
  }

  /*
   * 기존 첫 번째 12월은 전년도 12월.
   */
  if (
    Number(year) ===
      CURRENT_YEAR - 1 &&
    monthKey === "m12"
  ) {
    return (
      room?.readings?.prev12 ??
      ""
    );
  }

  return "";
};


const getDisplayReading = (
  room,
  selectedYear,
  monthKey
) => {
  const point =
    getReadingPoint(
      selectedYear,
      monthKey
    );

  return getRoomYearReading(
    room,
    point.year,
    point.monthKey
  );
};


const mergeLegacyReadingsIntoYears = (
  room,
  baseYear = CURRENT_YEAR
) => {
  const nextYears = {
    ...(room?.readingYears ||
      {}),
  };

  const currentYearKey =
    String(baseYear);

  const previousYearKey =
    String(
      Number(baseYear) - 1
    );

  const currentYearReadings = {
    ...createEmptyYearReadings(),
    ...(nextYears[
      currentYearKey
    ] || {}),
  };

  for (
    let month = 1;
    month <= 12;
    month += 1
  ) {
    const key =
      `m${month}`;

    const legacy =
      room?.readings?.[
        key
      ];

    if (
      (
        currentYearReadings[
          key
        ] === "" ||
        currentYearReadings[
          key
        ] === undefined
      ) &&
      legacy !== "" &&
      legacy !== undefined &&
      legacy !== null
    ) {
      currentYearReadings[
        key
      ] = legacy;
    }
  }

  nextYears[
    currentYearKey
  ] =
    currentYearReadings;

  const previousYearReadings = {
    ...createEmptyYearReadings(),
    ...(nextYears[
      previousYearKey
    ] || {}),
  };

  const legacyPrevious12 =
    room?.readings?.prev12;

  if (
    (
      previousYearReadings.m12 ===
        "" ||
      previousYearReadings.m12 ===
        undefined
    ) &&
    legacyPrevious12 !== "" &&
    legacyPrevious12 !==
      undefined &&
    legacyPrevious12 !== null
  ) {
    previousYearReadings.m12 =
      legacyPrevious12;
  }

  nextYears[
    previousYearKey
  ] =
    previousYearReadings;

  return {
    ...room,
    readingYears:
      nextYears,
    reverseMeter:
      Boolean(
        room?.reverseMeter
      ),
  };
};


const calculateUsage = (
  previousValue,
  currentValue,
  reverseMeter
) => {
  const previous =
    toNumericReading(
      previousValue
    );

  const current =
    toNumericReading(
      currentValue
    );

  if (
    previous === null ||
    current === null ||
    previous === 0 ||
    current === 0
  ) {
    return null;
  }

  return reverseMeter
    ? previous - current
    : current - previous;
};


const getHistoricalAverageUsage = (
  room,
  currentYear,
  currentMonthNumber
) => {
  const reverseMeter =
    Boolean(
      room?.reverseMeter
    );

  const usages = [];

  let cursorYear =
    Number(currentYear);

  let cursorMonth =
    Number(currentMonthNumber) - 1;

  if (cursorMonth <= 0) {
    cursorYear -= 1;
    cursorMonth = 12;
  }

  /*
   * 현재 월 이전 최대 12개 사용량 구간을 확인.
   * 빈칸/0/방향이 잘못된 구간은 평균에서 제외.
   */
  let checked = 0;

  while (
    checked < 12 &&
    usages.length < 12
  ) {
    const previousPoint =
      getPreviousReadingPoint(
        cursorYear,
        cursorMonth
      );

    const previousValue =
      getRoomYearReading(
        room,
        previousPoint.year,
        previousPoint.monthKey
      );

    const currentValue =
      getRoomYearReading(
        room,
        cursorYear,
        `m${cursorMonth}`
      );

    const usage =
      calculateUsage(
        previousValue,
        currentValue,
        reverseMeter
      );

    if (
      usage !== null &&
      usage >= 0
    ) {
      usages.push(
        usage
      );
    }

    cursorYear =
      previousPoint.year;

    cursorMonth =
      previousPoint.monthNumber;

    checked += 1;
  }

  if (
    usages.length === 0
  ) {
    return {
      average: null,
      count: 0,
    };
  }

  const total =
    usages.reduce(
      (sum, usage) =>
        sum + usage,
      0
    );

  return {
    average:
      total /
      usages.length,
    count:
      usages.length,
  };
};


const getReadingAnalysis = (
  room,
  selectedYear,
  monthKey
) => {
  const rawValue =
    getDisplayReading(
      room,
      selectedYear,
      monthKey
    );

  if (
    rawValue === "" ||
    rawValue === null ||
    rawValue === undefined
  ) {
    return {
      status: "blank",
      message: "",
      usage: null,
      average: null,
    };
  }

  const current =
    toNumericReading(
      rawValue
    );

  if (current === null) {
    return {
      status: "normal",
      message: "",
      usage: null,
      average: null,
    };
  }

  if (current === 0) {
    return {
      status: "zero",
      message: "",
      usage: null,
      average: null,
    };
  }

  const point =
    getReadingPoint(
      selectedYear,
      monthKey
    );

  const previousPoint =
    getPreviousReadingPoint(
      point.year,
      point.monthNumber
    );

  const previousValue =
    getRoomYearReading(
      room,
      previousPoint.year,
      previousPoint.monthKey
    );

  const previous =
    toNumericReading(
      previousValue
    );

  /*
   * 전월 값이 비어 있거나 0이면 방향검증과 사용량 검증을 하지 않는다.
   */
  if (
    previous === null ||
    previous === 0
  ) {
    return {
      status: "normal",
      message: "",
      usage: null,
      average: null,
    };
  }

  const reverseMeter =
    Boolean(
      room?.reverseMeter
    );

  const directionError =
    reverseMeter
      ? current > previous
      : current < previous;

  if (directionError) {
    return {
      status: "warning",
      message:
        reverseMeter
          ? "역순 계량기입니다. 전월보다 큰 값인지 다시 확인해주세요."
          : "전월 검침값보다 적습니다. 검침값을 다시 확인해주세요.",
      usage: null,
      average: null,
    };
  }

  const currentUsage =
    calculateUsage(
      previous,
      current,
      reverseMeter
    );

  if (
    currentUsage === null ||
    currentUsage < 0
  ) {
    return {
      status: "normal",
      message: "",
      usage: null,
      average: null,
    };
  }

  const {
    average,
    count,
  } =
    getHistoricalAverageUsage(
      room,
      point.year,
      point.monthNumber
    );

  /*
   * 과거 정상 사용량이 하나 이상 있을 때
   * 현재 사용량과 평균 사용량의 절대 차이가 10톤 이상이면 경고.
   */
  if (
    count > 0 &&
    average !== null &&
    Math.abs(
      currentUsage -
        average
    ) >= 10
  ) {
    return {
      status: "warning",
      message:
        `평균 ${average.toFixed(
          1
        )}톤 대비 현재 ${currentUsage.toFixed(
          1
        )}톤입니다. 검침값을 확인해주세요.`,
      usage:
        currentUsage,
      average,
    };
  }

  return {
    status: "normal",
    message: "",
    usage:
      currentUsage,
    average,
  };
};


/* =========================================================
   주소 판단
========================================================= */

const looksLikeAddress = (text) => {
  const value = cleanText(text);

  if (!value) {
    return false;
  }

  /*
   * 예:
   * 중리동 239-21
   * 도안동1272
   * 가수원동1187(도안동 1919)
   * 용운동 597
   */
  return /[가-힣]+(?:동|읍|면|리)\s*\d/.test(
    value
  );
};


/* =========================================================
   B3 첫 부분에서 빌라명 / 주소 분리
========================================================= */

const parseNameAddress = (
  firstPart,
  sheetName
) => {
  const text =
    cleanText(firstPart);

  const sheet =
    cleanText(sheetName);

  if (!text) {
    return {
      villaName: sheet,
      address: "",
    };
  }


  /* =======================================================
     주소가 앞에 나오고 빌라명이 뒤에 있는 경우

     예:
     용운동 597 노스힐
  ======================================================= */

  if (
    sheet &&
    text.endsWith(sheet)
  ) {
    const possibleAddress =
      cleanText(
        text.slice(
          0,
          text.length - sheet.length
        )
      );

    if (
      looksLikeAddress(
        possibleAddress
      )
    ) {
      return {
        villaName: sheet,
        address: possibleAddress,
      };
    }
  }


  /* =======================================================
     일반적인 형식

     화이트하우스 중리동 239-21
     유진하우스 도안동1272
     투유빌 가수원동1187(도안동 1919)
  ======================================================= */

  const addressMatch =
    text.match(
      /([가-힣]+(?:동|읍|면|리)\s*\d[\d\-]*(?:\s*\([^)]*\))?.*)$/
    );


  if (addressMatch) {
    const address =
      cleanText(
        addressMatch[1]
      );


    const villaName =
      cleanText(
        text.slice(
          0,
          addressMatch.index
        )
      );


    if (villaName) {
      return {
        villaName,
        address,
      };
    }


    return {
      villaName: sheet || text,
      address,
    };
  }


  /* =======================================================
     주소 분리 실패

     이 경우에는 B3 전체를 무조건 빌라명으로 만들지 않고
     시트명을 우선 사용
  ======================================================= */

  return {
    villaName:
      sheet ||
      text,

    address: "",
  };
};


/* =========================================================
   B3 전체 내용 분석

   예:
   화이트하우스 중리동 239-21
   / 로비 : #8190#
   / 계량기위치 : 복도

   추가 지원:
   로비비번
   로비 비밀번호
   보일러실
   계단
   옥상
   주차장
========================================================= */

const parseVillaInfo = (
  rawValue,
  sheetName
) => {
  const raw =
    cleanText(rawValue);


  if (!raw) {
    return {
      villaName:
        cleanText(sheetName),

      address: "",

      lobby: "",

      meterLocation: "",

      memo: "",
    };
  }


  const sections =
    raw
      .split("/")
      .map((item) =>
        cleanText(item)
      )
      .filter(Boolean);


  const firstPart =
    sections[0] || "";


  const {
    villaName,
    address,
  } = parseNameAddress(
    firstPart,
    sheetName
  );


  let lobby = "";

  let meterLocation = "";

  const memoParts = [];


  sections
    .slice(1)
    .forEach((section) => {
      const value =
        cleanText(section);


      /* ===============================================
         로비

         로비 : #8190#
         로비:0066
         로비비번 : 0586
         로비 비번 : 종3416
         로비 비밀번호 : 1234
      =============================================== */

      const lobbyMatch =
        value.match(
          /^로비\s*(?:비번|비밀번호)?\s*:\s*(.+)$/i
        );


      if (lobbyMatch) {
        lobby =
          cleanText(
            lobbyMatch[1]
          );

        return;
      }


      /* ===============================================
         계량기 위치
      =============================================== */

      const meterMatch =
        value.match(
          /^계량기\s*위치\s*:\s*(.+)$/i
        );


      if (meterMatch) {
        meterLocation =
          cleanText(
            meterMatch[1]
          );

        return;
      }


      /* ===============================================
         계량기위치라는 글자가 없는 경우

         예:
         / 복도
         / 보일러실
      =============================================== */

      if (
        !meterLocation &&
        /^(복도|보일러실|계단|옥상|주차장|외부|지하|1층|2층|3층|4층|5층)$/i.test(
          value
        )
      ) {
        meterLocation =
          value;

        return;
      }


      memoParts.push(
        value
      );
    });


  return {
    villaName:
      villaName ||
      cleanText(sheetName),

    address,

    lobby,

    meterLocation,

    memo:
      memoParts.join(" / "),
  };
};


/* =========================================================
   검침값 원본 그대로 유지
========================================================= */

const getReadingValue = (
  value
) => {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }


  if (
    typeof value === "number"
  ) {
    return value;
  }


  return String(value)
    .replace(/\r/g, "")
    .trim();
};


/* =========================================================
   Excel 셀을 셀 주소로 직접 읽기

   sheet_to_json을 사용하지 않음
========================================================= */

const getExcelCellValue = (
  worksheet,
  row,
  col
) => {
  const address =
    XLSX.utils.encode_cell({
      r: row,
      c: col,
    });


  const cell =
    worksheet[address];


  if (!cell) {
    return "";
  }


  if (
    cell.v === null ||
    cell.v === undefined
  ) {
    return "";
  }


  return cell.v;
};


/* =========================================================
   "호/월" 헤더 위치를 B열에서 직접 검색
========================================================= */

const findWorksheetHeaderRow = (
  worksheet
) => {
  if (
    !worksheet ||
    !worksheet["!ref"]
  ) {
    return -1;
  }


  const range =
    XLSX.utils.decode_range(
      worksheet["!ref"]
    );


  for (
    let row = range.s.r;
    row <= range.e.r;
    row += 1
  ) {
    const value =
      cleanText(
        getExcelCellValue(
          worksheet,
          row,
          1
        )
      );


    if (
      value === "호/월"
    ) {
      return row;
    }
  }


  return -1;
};


/* =========================================================
   실제 Excel 시트 1개 분석

   B3 = 빌라정보
   B열 = 호실
   C~O = 검침값

   모든 값은 실제 셀 주소에서 직접 읽음
========================================================= */

const parseWorksheet = (
  worksheet,
  sheetName
) => {
  const safeSheetName =
    cleanText(sheetName);


  if (
    !worksheet ||
    !worksheet["!ref"]
  ) {
    return {
      villaName:
        safeSheetName,

      address: "",

      lobby: "",

      meterLocation: "",

      memo: "",

      sheetName:
        safeSheetName,

      rooms: [],
    };
  }


  const range =
    XLSX.utils.decode_range(
      worksheet["!ref"]
    );


  /* =======================================================
     B3 직접 읽기

     Excel:
     B3

     배열주소:
     row = 2
     column = 1
  ======================================================= */

  const rawVillaInfo =
    getExcelCellValue(
      worksheet,
      2,
      1
    );


  const villaInfo =
    parseVillaInfo(
      rawVillaInfo,
      safeSheetName
    );


  /* =======================================================
     호/월 헤더 위치
  ======================================================= */

  const headerRow =
    findWorksheetHeaderRow(
      worksheet
    );


  const rooms = [];


  /*
   * 호/월을 찾지 못한 시트도
   * 빌라 목록에서는 유지해야 하므로
   * 여기에서 return 하지 않음
   */
  if (
    headerRow !== -1
  ) {
    /*
     * 호/월 다음 줄 = 검침일
     * 그 다음부터 실제 호실
     */
    const firstRoomRow =
      headerRow + 2;


    for (
      let row =
        firstRoomRow;

      row <= range.e.r;

      row += 1
    ) {
      /*
       * B열 직접 읽기
       */
      const rawRoom =
        getExcelCellValue(
          worksheet,
          row,
          1
        );


      const room =
        cleanRoomName(
          rawRoom
        );


      if (!room) {
        continue;
      }


      if (
        room === "호/월" ||
        room === "검침일"
      ) {
        continue;
      }


      /*
       * 명백한 설명행 제외
       */
      if (
        /^(합계|비고|메모|참고|주소|로비|계량기위치|계량기 위치)$/i.test(
          room
        )
      ) {
        continue;
      }


      const readings =
        createEmptyReadings();


      /*
       * C~O 실제 셀 직접 읽기
       */
      MONTH_COLUMNS.forEach(
        (month) => {
          const rawValue =
            getExcelCellValue(
              worksheet,
              row,
              month.excelIndex
            );


          readings[month.key] =
            getReadingValue(
              rawValue
            );
        }
      );


      rooms.push({
        id: makeId(),

        room,

        readings,

        excelRow:
          row + 1,

        sourceSheet:
          safeSheetName,
      });
    }
  }


  return {
    ...villaInfo,

    /*
     * B3 분석 실패 시
     * 시트명은 반드시 남겨둠
     */
    villaName:
      cleanText(
        villaInfo.villaName
      ) ||
      safeSheetName,

    sheetName:
      safeSheetName,

    rooms,
  };
};


/* =========================================================
   같은 빌라의 다음 장 판별

   중요한 원칙:
   시트명 끝 숫자를 무조건 제거하지 않음.

   포레스트2
   리라하우스2
   같은 실제 이름이 있을 수 있기 때문.

   실제로 같은 빌라의 다음 장은
   B3에서 추출된 빌라명 + 주소가 같을 때만 병합.
========================================================= */

const makeVillaInfoKey = (
  villaName,
  address
) => {
  const name =
    cleanText(
      villaName
    ).toLowerCase();


  const addr =
    cleanText(
      address
    ).toLowerCase();


  if (
    !name ||
    !addr
  ) {
    return "";
  }


  return `${name}__${addr}`;
};


/* =========================================================
   여러 시트 병합

   모든 시트를 우선 처리.

   주소 + 빌라명이 정확히 같은 경우만
   같은 빌라의 다음 장으로 병합.

   주소 정보가 없으면
   시트별로 따로 유지해서
   다른 빌라와 잘못 합쳐지는 문제 방지.
========================================================= */

const mergeSheets = (
  sheetList
) => {
  const result = [];

  const infoKeyMap =
    new Map();


  sheetList.forEach(
    (
      sheetData,
      sheetIndex
    ) => {
      const sheetName =
        cleanText(
          sheetData.sheetName
        );


      const villaName =
        cleanText(
          sheetData.villaName
        ) ||
        sheetName;


      const address =
        cleanText(
          sheetData.address
        );


      const infoKey =
        makeVillaInfoKey(
          villaName,
          address
        );


      /*
       * 주소 + 빌라명이 모두 정확히 존재하는 경우에만
       * 병합 후보로 사용
       */
      if (infoKey) {
        const existingIndex =
          infoKeyMap.get(
            infoKey
          );


        if (
          existingIndex !==
          undefined
        ) {
          const target =
            result[
              existingIndex
            ];


          if (
            !target.address &&
            address
          ) {
            target.address =
              address;
          }


          if (
            !target.lobby &&
            sheetData.lobby
          ) {
            target.lobby =
              sheetData.lobby;
          }


          if (
            !target.meterLocation &&
            sheetData.meterLocation
          ) {
            target.meterLocation =
              sheetData.meterLocation;
          }


          if (
            sheetData.memo &&
            !target.memo.includes(
              sheetData.memo
            )
          ) {
            target.memo = [
              target.memo,
              sheetData.memo,
            ]
              .filter(Boolean)
              .join(" / ");
          }


          if (
            !target.sourceSheets.includes(
              sheetName
            )
          ) {
            target.sourceSheets.push(
              sheetName
            );
          }


          /*
           * 같은 빌라 다음 장의 호실을
           * Excel 순서 그대로 뒤에 연결
           */
          sheetData.rooms.forEach(
            (newRoom) => {
              const duplicated =
                target.rooms.find(
                  (existingRoom) =>
                    cleanRoomName(
                      existingRoom.room
                    ) ===
                    cleanRoomName(
                      newRoom.room
                    )
                );


              /*
               * 같은 호실이 여러 장에서 다시 등장하면
               * 새로운 값이 있는 월만 보완
               */
              if (duplicated) {
                MONTH_COLUMNS.forEach(
                  (month) => {
                    const value =
                      newRoom.readings?.[
                        month.key
                      ];


                    if (
                      value !== "" &&
                      value !== null &&
                      value !== undefined
                    ) {
                      duplicated.readings[
                        month.key
                      ] = value;
                    }
                  }
                );


                return;
              }


              target.rooms.push({
                ...newRoom,
              });
            }
          );


          return;
        }
      }


      /*
       * 처음 등장하는 빌라 또는
       * 주소정보가 없어 병합하면 위험한 시트
       */
      const newVilla = {
        id: makeId(),

        villaName,

        address,

        lobby:
          cleanText(
            sheetData.lobby
          ),

        meterLocation:
          cleanText(
            sheetData.meterLocation
          ),

        memo:
          cleanText(
            sheetData.memo
          ),

        sourceSheets: [
          sheetName,
        ],

        sourceSheetIndex:
          sheetIndex,

        /*
         * 정렬하지 않고 Excel 순서 그대로
         */
        rooms:
          sheetData.rooms.map(
            (room) => ({
              ...room,
            })
          ),
      };


      result.push(
        newVilla
      );


      /*
       * 주소 + 빌라명 정보가 정확할 때만
       * 다음 페이지 병합 KEY로 등록
       */
      if (infoKey) {
        infoKeyMap.set(
          infoKey,
          result.length - 1
        );
      }
    }
  );


  return result;
};


/* =========================================================
   추가 폼
========================================================= */

const EMPTY_FORM = {
  villaName: "",

  address: "",

  lobby: "",

  meterLocation: "",

  memo: "",

  rooms: [""],
};


/* =========================================================
   COMPONENT
========================================================= */

const WaterMeterReadingPage = () => {
  const fileInputRef =
    useRef(null);


  const [
    villas,
    setVillas,
  ] = useState([]);


  const [
    selectedVillaId,
    setSelectedVillaId,
  ] = useState(null);


  const [
    searchText,
    setSearchText,
  ] = useState("");


  const [
    isModalOpen,
    setIsModalOpen,
  ] = useState(false);


  const [
    editingVillaId,
    setEditingVillaId,
  ] = useState(null);


  const [
    villaForm,
    setVillaForm,
  ] = useState({
    ...EMPTY_FORM,
  });


  const [
    uploadMessage,
    setUploadMessage,
  ] = useState("");


  /* =======================================================
     엑셀 신규 빌라 선택 추가
  ======================================================= */

  const [
    isImportModalOpen,
    setIsImportModalOpen,
  ] = useState(false);


  const [
    pendingImportVillas,
    setPendingImportVillas,
  ] = useState([]);


  const [
    importSelection,
    setImportSelection,
  ] = useState({});


  const [
    duplicateImportCount,
    setDuplicateImportCount,
  ] = useState(0);


  const [
    importSheetCount,
    setImportSheetCount,
  ] = useState(0);


  const [
    activeReadingWarning,
    setActiveReadingWarning,
  ] = useState(null);


  const [
    selectedYear,
    setSelectedYear,
  ] = useState(
    CURRENT_YEAR
  );


  const [
    isInspectorModalOpen,
    setIsInspectorModalOpen,
  ] = useState(false);


  const [
    inspectors,
    setInspectors,
  ] = useState([]);


  const [
    inspectorForm,
    setInspectorForm,
  ] = useState({
    id: null,
    name: "",
    phone: "",
  });


  const [
    inspectorAccessNow,
    setInspectorAccessNow,
  ] = useState(() => new Date());


  const readingInputRefs =
    useRef(new Map());


  const readingSaveTimers =
    useRef(new Map());


  const migrationAttemptedRef =
    useRef(false);


  /* =======================================================
     검침원 로그인 허용상태 날짜 갱신

     자정을 지나도 새로고침 없이 토글 표시가 자동으로 바뀌도록
     1분마다 현재 시간을 갱신한다.
  ======================================================= */

  useEffect(() => {
    const refreshNow = () =>
      setInspectorAccessNow(new Date());

    const timer = setInterval(
      refreshNow,
      60 * 1000
    );

    window.addEventListener(
      "focus",
      refreshNow
    );

    document.addEventListener(
      "visibilitychange",
      refreshNow
    );

    return () => {
      clearInterval(timer);
      window.removeEventListener(
        "focus",
        refreshNow
      );
      document.removeEventListener(
        "visibilitychange",
        refreshNow
      );
    };
  }, []);


  /* =======================================================
     Firestore 실시간 구독

     PC / 모바일이 동일한 collection을 사용하므로
     어느 기기에서 수정해도 onSnapshot으로 즉시 반영.
  ======================================================= */

  useEffect(() => {
    const unsubscribe =
      onSnapshot(
        collection(
          db,
          WATER_VILLA_COLLECTION
        ),
        async (snapshot) => {
          const next =
            snapshot.docs
              .map((item) => {
                const data =
                  item.data();

                return {
                  id: item.id,
                  ...data,
                  rooms:
                    Array.isArray(
                      data.rooms
                    )
                      ? data.rooms.map(
                          (room) =>
                            mergeLegacyReadingsIntoYears(
                              room,
                              CURRENT_YEAR
                            )
                        )
                      : [],
                };
              })
              .sort(
                (a, b) =>
                  Number(
                    a.sourceSheetIndex ??
                      999999
                  ) -
                  Number(
                    b.sourceSheetIndex ??
                      999999
                  )
              );


          /*
           * 기존 V3 localStorage 자료가 있고
           * Firestore가 비어 있는 최초 1회에만 자동 이전.
           */
          if (
            snapshot.empty &&
            !migrationAttemptedRef.current
          ) {
            migrationAttemptedRef.current =
              true;


            try {
              const saved =
                localStorage.getItem(
                  STORAGE_KEY
                );


              const parsed =
                saved
                  ? JSON.parse(saved)
                  : [];


              if (
                Array.isArray(parsed) &&
                parsed.length > 0
              ) {
                for (
                  let start = 0;
                  start < parsed.length;
                  start +=
                    FIRESTORE_BATCH_LIMIT
                ) {
                  const batch =
                    writeBatch(db);


                  parsed
                    .slice(
                      start,
                      start +
                        FIRESTORE_BATCH_LIMIT
                    )
                    .forEach(
                      (
                        villa,
                        index
                      ) => {
                        const id =
                          villa.id ||
                          makeId();


                        batch.set(
                          doc(
                            db,
                            WATER_VILLA_COLLECTION,
                            id
                          ),
                          {
                            ...villa,
                            id,
                            sourceSheetIndex:
                              villa.sourceSheetIndex ??
                              start +
                                index,
                            updatedAt:
                              serverTimestamp(),
                          }
                        );
                      }
                    );


                  await batch.commit();
                }


                setUploadMessage(
                  "기존 수도검침 자료를 실시간 저장소로 이전했습니다."
                );

                return;
              }
            } catch (error) {
              console.error(
                "기존 수도검침 자료 이전 오류:",
                error
              );
            }
          }


          setVillas(next);


          try {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify(next)
            );
          } catch {}


          setSelectedVillaId(
            (previous) => {
              if (
                previous &&
                next.some(
                  (villa) =>
                    villa.id ===
                    previous
                )
              ) {
                return previous;
              }


              return (
                next[0]?.id ||
                null
              );
            }
          );
        },
        (error) => {
          console.error(
            "수도검침 실시간 구독 오류:",
            error
          );
        }
      );


    return () => {
      unsubscribe();


      readingSaveTimers.current.forEach(
        (timer) =>
          clearTimeout(timer)
      );


      readingSaveTimers.current.clear();
    };
  }, []);


  /* =======================================================
     검침원 실시간 구독
  ======================================================= */

  useEffect(() => {
    const unsubscribe =
      onSnapshot(
        collection(
          db,
          WATER_INSPECTOR_COLLECTION
        ),
        (snapshot) => {
          const next =
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...item.data(),
              }))
              .sort((a, b) =>
                cleanText(
                  a.name
                ).localeCompare(
                  cleanText(
                    b.name
                  ),
                  "ko"
                )
              );


          setInspectors(next);
        },
        (error) => {
          console.error(
            "검침원 구독 오류:",
            error
          );
        }
      );


    return unsubscribe;
  }, []);


  /* =======================================================
     빌라 검색

     빌라명 + 주소
  ======================================================= */

  const filteredVillas =
    useMemo(() => {
      const keyword =
        cleanText(
          searchText
        ).toLowerCase();


      if (!keyword) {
        return villas;
      }


      return villas.filter(
        (villa) => {
          const villaName =
            cleanText(
              villa.villaName
            ).toLowerCase();


          const address =
            cleanText(
              villa.address
            ).toLowerCase();


          return (
            villaName.includes(
              keyword
            ) ||
            address.includes(
              keyword
            )
          );
        }
      );
    }, [
      villas,
      searchText,
    ]);


  /* =======================================================
     선택 빌라
  ======================================================= */

  const selectedVilla =
    useMemo(() => {
      if (
        !selectedVillaId
      ) {
        return null;
      }


      return (
        villas.find(
          (villa) =>
            villa.id ===
            selectedVillaId
        ) ||
        null
      );
    }, [
      villas,
      selectedVillaId,
    ]);


  /* =======================================================
     검색 결과에 현재 빌라가 없으면
     첫 번째 검색 결과 선택
  ======================================================= */

  useEffect(() => {
    if (
      filteredVillas.length ===
      0
    ) {
      return;
    }


    const exists =
      filteredVillas.some(
        (villa) =>
          villa.id ===
          selectedVillaId
      );


    if (!exists) {
      setSelectedVillaId(
        filteredVillas[0].id
      );
    }
  }, [
    filteredVillas,
    selectedVillaId,
  ]);


  /* =======================================================
     엑셀 파일 선택
  ======================================================= */

  const handleExcelButtonClick =
    () => {
      if (
        !fileInputRef.current
      ) {
        return;
      }


      fileInputRef.current.value =
        "";


      fileInputRef.current.click();
    };


  /* =======================================================
     엑셀 신규 빌라 추가

     기존 빌라는 삭제하거나 덮어쓰지 않는다.
     선택된 신규 빌라만 Firestore에 추가한다.
  ======================================================= */

  const isDuplicateVilla =
    (existingVilla, importedVilla) => {
      const existingInfoKey =
        makeVillaInfoKey(
          existingVilla.villaName,
          existingVilla.address
        );

      const importedInfoKey =
        makeVillaInfoKey(
          importedVilla.villaName,
          importedVilla.address
        );

      if (
        existingInfoKey &&
        importedInfoKey
      ) {
        return (
          existingInfoKey ===
          importedInfoKey
        );
      }

      return (
        cleanText(
          existingVilla.villaName
        ).toLowerCase() ===
        cleanText(
          importedVilla.villaName
        ).toLowerCase()
      );
    };


  const appendImportedVillas =
    async (villasToAdd) => {
      if (
        !Array.isArray(villasToAdd) ||
        villasToAdd.length === 0
      ) {
        return [];
      }

      const currentSnapshot =
        await getDocs(
          collection(
            db,
            WATER_VILLA_COLLECTION
          )
        );

      const currentDocs =
        currentSnapshot.docs.map(
          (item) => ({
            id: item.id,
            ...item.data(),
          })
        );

      /*
       * 팝업을 열어둔 사이 다른 PC에서 같은 빌라를
       * 추가했을 수도 있으므로 저장 직전 한 번 더 중복 검사.
       */
      const safeVillas =
        villasToAdd.filter(
          (importedVilla) =>
            !currentDocs.some(
              (existingVilla) =>
                isDuplicateVilla(
                  existingVilla,
                  importedVilla
                )
            )
        );

      if (safeVillas.length === 0) {
        return [];
      }

      const maxOrder =
        currentDocs.reduce(
          (max, villa) =>
            Math.max(
              max,
              Number(
                villa.sourceSheetIndex ??
                  -1
              )
            ),
          -1
        );

      const saved = [];

      for (
        let startIndex = 0;
        startIndex < safeVillas.length;
        startIndex +=
          FIRESTORE_BATCH_LIMIT
      ) {
        const batch =
          writeBatch(db);

        safeVillas
          .slice(
            startIndex,
            startIndex +
              FIRESTORE_BATCH_LIMIT
          )
          .forEach(
            (villa, localIndex) => {
              const absoluteIndex =
                startIndex +
                localIndex;

              const id =
                villa.id ||
                makeId();

              const data = {
                ...villa,
                id,
                sourceSheetIndex:
                  maxOrder +
                  absoluteIndex +
                  1,
                updatedAt:
                  serverTimestamp(),
              };

              batch.set(
                doc(
                  db,
                  WATER_VILLA_COLLECTION,
                  id
                ),
                data
              );

              saved.push(data);
            }
          );

        await batch.commit();
      }

      return saved;
    };


  const closeImportModal =
    () => {
      setIsImportModalOpen(false);
      setPendingImportVillas([]);
      setImportSelection({});
      setDuplicateImportCount(0);
      setImportSheetCount(0);
    };


  const toggleImportVilla =
    (villaId) => {
      setImportSelection(
        (previous) => ({
          ...previous,
          [villaId]:
            !previous[villaId],
        })
      );
    };


  const toggleAllImportVillas =
    (checked) => {
      const next = {};

      pendingImportVillas.forEach(
        (villa) => {
          next[villa.id] =
            checked;
        }
      );

      setImportSelection(next);
    };


  const confirmImportVillas =
    async () => {
      const selected =
        pendingImportVillas.filter(
          (villa) =>
            importSelection[
              villa.id
            ]
        );

      if (selected.length === 0) {
        alert(
          "추가할 빌라를 1개 이상 선택해주세요."
        );
        return;
      }

      try {
        const saved =
          await appendImportedVillas(
            selected
          );

        if (saved.length === 0) {
          alert(
            "선택한 빌라가 저장 직전에 모두 중복으로 확인되어 추가되지 않았습니다."
          );
          closeImportModal();
          return;
        }

        setSelectedVillaId(
          saved[0]?.id ||
            selectedVillaId
        );

        setSearchText("");

        setUploadMessage(
          `엑셀 ${importSheetCount}개 시트 중 신규 ${saved.length}개 빌라를 추가했습니다. 자동 저장되었습니다.`
        );

        closeImportModal();
      } catch (error) {
        console.error(
          "신규 수도검침 빌라 추가 오류:",
          error
        );

        alert(
          "선택한 빌라를 추가하는 중 오류가 발생했습니다."
        );
      }
    };


  /* =======================================================
     엑셀 업로드

     모든 시트를 SheetNames 순서 그대로 처리
  ======================================================= */

  const handleExcelUpload =
    async (event) => {
      const file =
        event.target.files?.[0];


      if (!file) {
        return;
      }


      const extension =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase();


      if (
        ![
          "xlsx",
          "xls",
        ].includes(
          extension
        )
      ) {
        alert(
          "엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다."
        );

        return;
      }


      try {
        const buffer =
          await file.arrayBuffer();


        const workbook =
          XLSX.read(
            buffer,
            {
              type: "array",

              /*
               * 원본 셀값 보존
               */
              cellDates: false,

              cellFormula: true,

              cellText: true,
            }
          );


        /*
         * 모든 시트를 순서 그대로 분석
         */
        const parsedSheets =
          workbook.SheetNames.map(
            (
              sheetName
            ) => {
              const worksheet =
                workbook.Sheets[
                  sheetName
                ];


              return parseWorksheet(
                worksheet,
                sheetName
              );
            }
          );


        /*
         * 같은 빌라의 다음 장만 병합
         */
        const importedVillas =
          mergeSheets(
            parsedSheets
          ).map((villa) => ({
            ...villa,
            rooms:
              (villa.rooms || []).map(
                (room) => {
                  const legacy =
                    room.readings ||
                    createEmptyReadings();

                  const currentYearValues = {
                    ...createEmptyYearReadings(),
                  };

                  for (
                    let month = 1;
                    month <= 12;
                    month += 1
                  ) {
                    const key =
                      `m${month}`;

                    currentYearValues[
                      key
                    ] =
                      legacy[key] ??
                      "";
                  }

                  const previousYearValues = {
                    ...createEmptyYearReadings(),
                    m12:
                      legacy.prev12 ??
                      "",
                  };

                  return {
                    ...room,
                    reverseMeter: false,
                    readingYears: {
                      [String(
                        selectedYear - 1
                      )]:
                        previousYearValues,
                      [String(
                        selectedYear
                      )]:
                        currentYearValues,
                    },
                    /*
                     * 모바일 기존 호환:
                     * 현재년도 업로드일 때만 기존 readings를 그대로 사용.
                     */
                    readings:
                      Number(
                        selectedYear
                      ) ===
                      CURRENT_YEAR
                        ? legacy
                        : createEmptyReadings(),
                  };
                }
              ),
          }));


        if (
          importedVillas.length ===
          0
        ) {
          alert(
            "수도검침 자료를 찾지 못했습니다."
          );

          return;
        }


        const duplicateVillas =
          importedVillas.filter(
            (importedVilla) =>
              villas.some(
                (existingVilla) =>
                  isDuplicateVilla(
                    existingVilla,
                    importedVilla
                  )
              )
          );


        const newVillas =
          importedVillas.filter(
            (importedVilla) =>
              !villas.some(
                (existingVilla) =>
                  isDuplicateVilla(
                    existingVilla,
                    importedVilla
                  )
              )
          );


        if (newVillas.length === 0) {
          setUploadMessage(
            `엑셀 ${workbook.SheetNames.length}개 시트의 빌라가 모두 기존 목록과 중복되어 추가하지 않았습니다.`
          );

          alert(
            "업로드한 파일에 새로 추가할 빌라가 없습니다. 기존에 등록된 빌라는 중복 추가하지 않습니다."
          );

          return;
        }


        /*
         * 중복 빌라가 하나라도 있으면
         * 중복되지 않은 신규 빌라만 팝업 목록으로 보여준다.
         */
        if (
          duplicateVillas.length >
          0
        ) {
          const selection = {};

          newVillas.forEach(
            (villa) => {
              selection[villa.id] =
                true;
            }
          );

          setPendingImportVillas(
            newVillas
          );
          setImportSelection(
            selection
          );
          setDuplicateImportCount(
            duplicateVillas.length
          );
          setImportSheetCount(
            workbook.SheetNames.length
          );
          setIsImportModalOpen(
            true
          );

          return;
        }


        /* 중복이 전혀 없으면 신규 빌라 전체를 바로 추가 */
        const saved =
          await appendImportedVillas(
            newVillas
          );


        setSelectedVillaId(
          saved[0]?.id ||
            selectedVillaId
        );

        setSearchText("");

        const message =
          `엑셀 ${workbook.SheetNames.length}개 시트 / 신규 ${saved.length}개 빌라를 추가하고 자동 저장했습니다.`;

        setUploadMessage(
          message
        );

        alert(
          [
            "수도검침표 업로드 완료",
            "",
            `엑셀 시트: ${workbook.SheetNames.length}개`,
            `신규 추가: ${saved.length}개`,
            "기존 빌라는 유지되었습니다.",
          ].join("\n")
        );
      } catch (error) {
        console.error(
          "수도검침 엑셀 업로드 오류:",
          error
        );


        alert(
          [
            "엑셀 파일을 읽는 중 오류가 발생했습니다.",
            "",
            error?.message ||
              "",
          ].join("\n")
        );
      }
    };


  /* =======================================================
     빌라 추가
  ======================================================= */

  const openAddModal =
    () => {
      setEditingVillaId(
        null
      );


      setVillaForm({
        ...EMPTY_FORM,

        rooms: [""],
      });


      setIsModalOpen(
        true
      );
    };


  /* =======================================================
     빌라 수정
  ======================================================= */

  const openEditModal =
    (villa) => {
      if (!villa) {
        return;
      }


      setEditingVillaId(
        villa.id
      );


      setVillaForm({
        villaName:
          villa.villaName ||
          "",

        address:
          villa.address ||
          "",

        lobby:
          villa.lobby ||
          "",

        meterLocation:
          villa.meterLocation ||
          "",

        memo:
          villa.memo ||
          "",

        /*
         * 현재 호실 순서 그대로 유지
         */
        rooms:
          villa.rooms.length >
          0
            ? villa.rooms.map(
                (room) =>
                  room.room
              )
            : [""],
      });


      setIsModalOpen(
        true
      );
    };


  /* =======================================================
     모달 닫기
  ======================================================= */

  const closeModal =
    () => {
      setIsModalOpen(
        false
      );


      setEditingVillaId(
        null
      );


      setVillaForm({
        ...EMPTY_FORM,

        rooms: [""],
      });
    };


  /* =======================================================
     기본정보 변경
  ======================================================= */

  const handleFormChange =
    (
      field,
      value
    ) => {
      setVillaForm(
        (previous) => ({
          ...previous,

          [field]: value,
        })
      );
    };


  /* =======================================================
     호실명 변경
  ======================================================= */

  const handleRoomChange =
    (
      index,
      value
    ) => {
      setVillaForm(
        (previous) => {
          const rooms = [
            ...previous.rooms,
          ];


          rooms[index] =
            value;


          return {
            ...previous,

            rooms,
          };
        }
      );
    };


  /* =======================================================
     호실 추가
  ======================================================= */

  const addRoomInput =
    () => {
      setVillaForm(
        (previous) => ({
          ...previous,

          rooms: [
            ...previous.rooms,
            "",
          ],
        })
      );
    };


  /* =======================================================
     호실 삭제
  ======================================================= */

  const removeRoomInput =
    (index) => {
      setVillaForm(
        (previous) => {
          const rooms =
            previous.rooms.filter(
              (
                _,
                roomIndex
              ) =>
                roomIndex !==
                index
            );


          return {
            ...previous,

            rooms:
              rooms.length > 0
                ? rooms
                : [""],
          };
        }
      );
    };


  /* =======================================================
     빌라 저장
  ======================================================= */

  const saveVilla =
    async () => {
      const villaName =
        cleanText(
          villaForm.villaName
        );

      const address =
        cleanText(
          villaForm.address
        );

      const lobby =
        cleanText(
          villaForm.lobby
        );

      const meterLocation =
        cleanText(
          villaForm.meterLocation
        );

      const memo =
        cleanText(
          villaForm.memo
        );

      const roomNames =
        villaForm.rooms
          .map((room) =>
            cleanRoomName(room)
          )
          .filter(Boolean);


      if (!villaName) {
        alert(
          "빌라명을 입력해주세요."
        );
        return;
      }


      if (!address) {
        alert(
          "주소를 입력해주세요."
        );
        return;
      }


      if (
        roomNames.length === 0
      ) {
        alert(
          "호실을 1개 이상 입력해주세요."
        );
        return;
      }


      try {
        if (
          editingVillaId
        ) {
          const existingVilla =
            villas.find(
              (villa) =>
                villa.id ===
                editingVillaId
            );


          if (!existingVilla) {
            alert(
              "수정할 빌라를 찾지 못했습니다."
            );
            return;
          }


          const rooms =
            roomNames.map(
              (roomName) => {
                const existing =
                  existingVilla.rooms?.find(
                    (room) =>
                      cleanRoomName(
                        room.room
                      ) ===
                      roomName
                  );


                if (existing) {
                  return existing;
                }


                return {
                  id: makeId(),
                  room: roomName,
                  readings:
                    createEmptyReadings(),
                  readingYears: {},
                  reverseMeter: false,
                };
              }
            );


          await setDoc(
            doc(
              db,
              WATER_VILLA_COLLECTION,
              editingVillaId
            ),
            {
              ...existingVilla,
              id: editingVillaId,
              villaName,
              address,
              lobby,
              meterLocation,
              memo,
              rooms,
              updatedAt:
                serverTimestamp(),
            },
            {
              merge: true,
            }
          );


          setSelectedVillaId(
            editingVillaId
          );
        } else {
          const id =
            makeId();


          const maxOrder =
            villas.reduce(
              (max, villa) =>
                Math.max(
                  max,
                  Number(
                    villa.sourceSheetIndex ??
                      -1
                  )
                ),
              -1
            );


          const newVilla = {
            id,
            villaName,
            address,
            lobby,
            meterLocation,
            memo,
            sourceSheets: [],
            sourceSheetIndex:
              maxOrder + 1,
            rooms:
              roomNames.map(
                (room) => ({
                  id: makeId(),
                  room,
                  readings:
                    createEmptyReadings(),
                  readingYears: {},
                  reverseMeter: false,
                })
              ),
          };


          await setDoc(
            doc(
              db,
              WATER_VILLA_COLLECTION,
              id
            ),
            {
              ...newVilla,
              updatedAt:
                serverTimestamp(),
            }
          );


          setSelectedVillaId(
            id
          );
        }


        closeModal();
      } catch (error) {
        console.error(
          "수도검침 빌라 저장 오류:",
          error
        );


        alert(
          "빌라 저장 중 오류가 발생했습니다."
        );
      }
    };


  /* =======================================================
     빌라 삭제
  ======================================================= */

  const deleteVilla =
    async (villa) => {
      if (!villa) {
        return;
      }


      const confirmed =
        window.confirm(
          `${villa.villaName} 수도검침표를 삭제하시겠습니까?`
        );


      if (!confirmed) {
        return;
      }


      try {
        await deleteDoc(
          doc(
            db,
            WATER_VILLA_COLLECTION,
            villa.id
          )
        );
      } catch (error) {
        console.error(
          "수도검침 빌라 삭제 오류:",
          error
        );


        alert(
          "빌라 삭제 중 오류가 발생했습니다."
        );
      }
    };


  /* =======================================================
     검침값 수정

     - 선택한 년도별로 readingYears에 저장
     - 표 맨 앞 12월은 선택년도 - 1년의 12월
     - 현재년도 자료는 기존 모바일 호환을 위해 readings에도 동시 저장
  ======================================================= */

  const persistReading =
    async (
      villaId,
      roomId,
      selectedYearValue,
      monthKey,
      value
    ) => {
      const villaRef =
        doc(
          db,
          WATER_VILLA_COLLECTION,
          villaId
        );


      try {
        await runTransaction(
          db,
          async (transaction) => {
            const snapshot =
              await transaction.get(
                villaRef
              );


            if (!snapshot.exists()) {
              return;
            }


            const data =
              snapshot.data();

            const point =
              getReadingPoint(
                selectedYearValue,
                monthKey
              );


            const rooms =
              Array.isArray(
                data.rooms
              )
                ? data.rooms.map(
                    (rawRoom) => {
                      if (
                        rawRoom.id !==
                        roomId
                      ) {
                        return rawRoom;
                      }


                      const room =
                        mergeLegacyReadingsIntoYears(
                          rawRoom,
                          CURRENT_YEAR
                        );

                      const yearKey =
                        String(
                          point.year
                        );

                      const nextReadingYears = {
                        ...(room.readingYears ||
                          {}),
                        [yearKey]: {
                          ...createEmptyYearReadings(),
                          ...(room.readingYears?.[
                            yearKey
                          ] || {}),
                          [point.monthKey]:
                            value,
                        },
                      };

                      const nextReadings = {
                        ...(room.readings ||
                          createEmptyReadings()),
                      };

                      /*
                       * 현재년도는 모바일 기존 구조와 실시간 호환.
                       */
                      if (
                        Number(
                          selectedYearValue
                        ) ===
                        CURRENT_YEAR
                      ) {
                        if (
                          monthKey ===
                          "prev12"
                        ) {
                          nextReadings.prev12 =
                            value;
                        } else {
                          nextReadings[
                            monthKey
                          ] = value;
                        }
                      }

                      return {
                        ...room,
                        readingYears:
                          nextReadingYears,
                        readings:
                          nextReadings,
                      };
                    }
                  )
                : [];


            transaction.update(
              villaRef,
              {
                rooms,
                updatedAt:
                  serverTimestamp(),
              }
            );
          }
        );
      } catch (error) {
        console.error(
          "수도검침값 저장 오류:",
          error
        );
      }
    };


  const updateReading =
    (
      roomId,
      monthKey,
      value
    ) => {
      if (!selectedVilla) {
        return;
      }


      const villaId =
        selectedVilla.id;

      const yearValue =
        selectedYear;

      const point =
        getReadingPoint(
          yearValue,
          monthKey
        );


      /*
       * 입력감은 local state로 즉시 반영.
       */
      setVillas(
        (previous) =>
          previous.map(
            (villa) => {
              if (
                villa.id !==
                villaId
              ) {
                return villa;
              }


              return {
                ...villa,
                rooms:
                  villa.rooms.map(
                    (rawRoom) => {
                      if (
                        rawRoom.id !==
                        roomId
                      ) {
                        return rawRoom;
                      }

                      const room =
                        mergeLegacyReadingsIntoYears(
                          rawRoom,
                          CURRENT_YEAR
                        );

                      const yearKey =
                        String(
                          point.year
                        );

                      const nextReadings = {
                        ...(room.readings ||
                          createEmptyReadings()),
                      };

                      if (
                        Number(
                          yearValue
                        ) ===
                        CURRENT_YEAR
                      ) {
                        if (
                          monthKey ===
                          "prev12"
                        ) {
                          nextReadings.prev12 =
                            value;
                        } else {
                          nextReadings[
                            monthKey
                          ] = value;
                        }
                      }

                      return {
                        ...room,
                        readings:
                          nextReadings,
                        readingYears: {
                          ...(room.readingYears ||
                            {}),
                          [yearKey]: {
                            ...createEmptyYearReadings(),
                            ...(room.readingYears?.[
                              yearKey
                            ] || {}),
                            [point.monthKey]:
                              value,
                          },
                        },
                      };
                    }
                  ),
              };
            }
          )
      );


      const timerKey =
        `${villaId}:${roomId}:${yearValue}:${monthKey}`;


      const previousTimer =
        readingSaveTimers.current.get(
          timerKey
        );


      if (previousTimer) {
        clearTimeout(
          previousTimer
        );
      }


      const timer =
        setTimeout(() => {
          readingSaveTimers.current.delete(
            timerKey
          );


          persistReading(
            villaId,
            roomId,
            yearValue,
            monthKey,
            value
          );
        }, 250);


      readingSaveTimers.current.set(
        timerKey,
        timer
      );
    };


  /* =======================================================
     호실별 역순 계량기 설정

     PC에서만 설정.
     모바일에서는 설정 기능을 노출하지 않는다.
  ======================================================= */

  const toggleReverseMeter =
    async (roomId) => {
      if (!selectedVilla) {
        return;
      }

      const villaId =
        selectedVilla.id;

      const targetRoom =
        selectedVilla.rooms?.find(
          (room) =>
            room.id ===
            roomId
        );

      if (!targetRoom) {
        return;
      }

      const nextValue =
        !Boolean(
          targetRoom.reverseMeter
        );

      setVillas(
        (previous) =>
          previous.map(
            (villa) =>
              villa.id ===
              villaId
                ? {
                    ...villa,
                    rooms:
                      villa.rooms.map(
                        (room) =>
                          room.id ===
                          roomId
                            ? {
                                ...room,
                                reverseMeter:
                                  nextValue,
                              }
                            : room
                      ),
                  }
                : villa
          )
      );

      const villaRef =
        doc(
          db,
          WATER_VILLA_COLLECTION,
          villaId
        );

      try {
        await runTransaction(
          db,
          async (transaction) => {
            const snapshot =
              await transaction.get(
                villaRef
              );

            if (!snapshot.exists()) {
              return;
            }

            const data =
              snapshot.data();

            const rooms =
              Array.isArray(
                data.rooms
              )
                ? data.rooms.map(
                    (room) =>
                      room.id ===
                      roomId
                        ? {
                            ...room,
                            reverseMeter:
                              nextValue,
                          }
                        : room
                  )
                : [];

            transaction.update(
              villaRef,
              {
                rooms,
                updatedAt:
                  serverTimestamp(),
              }
            );
          }
        );
      } catch (error) {
        console.error(
          "역순 계량기 설정 오류:",
          error
        );
      }
    };


  /* =======================================================
     Enter 키

     현재 입력칸에서 Enter를 누르면
     같은 월의 바로 아래 호실 입력칸으로 이동.
  ======================================================= */

  const handleReadingKeyDown =
    (
      event,
      roomIndex,
      roomId,
      monthKey
    ) => {
      if (
        event.key !== "Enter"
      ) {
        return;
      }


      event.preventDefault();


      if (!selectedVilla) {
        return;
      }


      const value =
        event.currentTarget.value;


      const timerKey =
        `${selectedVilla.id}:${roomId}:${selectedYear}:${monthKey}`;


      const timer =
        readingSaveTimers.current.get(
          timerKey
        );


      if (timer) {
        clearTimeout(timer);


        readingSaveTimers.current.delete(
          timerKey
        );
      }


      persistReading(
        selectedVilla.id,
        roomId,
        selectedYear,
        monthKey,
        value
      );


      const nextRoom =
        selectedVilla.rooms?.[
          roomIndex + 1
        ];


      if (!nextRoom) {
        return;
      }


      const nextInput =
        readingInputRefs.current.get(
          `${nextRoom.id}:${selectedYear}:${monthKey}`
        );


      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    };


  /* =======================================================
     검침원 관리
  ======================================================= */

  const openInspectorModal =
    () => {
      setInspectorForm({
        id: null,
        name: "",
        phone: "",
      });


      setIsInspectorModalOpen(
        true
      );
    };


  const closeInspectorModal =
    () => {
      setIsInspectorModalOpen(
        false
      );


      setInspectorForm({
        id: null,
        name: "",
        phone: "",
      });
    };


  const editInspector =
    (inspector) => {
      setInspectorForm({
        id: inspector.id,
        name:
          inspector.name || "",
        phone:
          inspector.phone || "",
      });
    };


  const saveInspector =
    async () => {
      const name =
        cleanText(
          inspectorForm.name
        );


      const phone =
        normalizePhone(
          inspectorForm.phone
        );


      if (!name) {
        alert(
          "검침원 이름을 입력해주세요."
        );
        return;
      }


      if (
        phone.length < 10
      ) {
        alert(
          "연락처를 정확하게 입력해주세요."
        );
        return;
      }


      const duplicated =
        inspectors.some(
          (inspector) =>
            inspector.id !==
              inspectorForm.id &&
            normalizePhone(
              inspector.phone
            ) === phone
        );


      if (duplicated) {
        alert(
          "이미 등록된 연락처입니다."
        );
        return;
      }


      try {
        const id =
          inspectorForm.id ||
          makeId();


        await setDoc(
          doc(
            db,
            WATER_INSPECTOR_COLLECTION,
            id
          ),
          {
            id,
            name,
            phone,
            normalizedPhone:
              phone,
            active: true,
            updatedAt:
              serverTimestamp(),
          },
          {
            merge: true,
          }
        );


        setInspectorForm({
          id: null,
          name: "",
          phone: "",
        });
      } catch (error) {
        console.error(
          "검침원 저장 오류:",
          error
        );


        alert(
          "검침원 저장 중 오류가 발생했습니다."
        );
      }
    };


  const toggleInspectorMobileAccess =
    async (inspector) => {
      const now =
        new Date();

      /*
       * 매월 25일~말일 및 매월 1일은 자동 허용 기간이므로
       * 관리자가 임의로 끌 수 없도록 고정한다.
       */
      if (
        isAutomaticInspectorAccessDate(
          now
        )
      ) {
        return;
      }

      const todayKey =
        getLocalDateKey(now);

      const currentlyAllowed =
        isInspectorLoginAllowed(
          inspector,
          now
        );

      try {
        await setDoc(
          doc(
            db,
            WATER_INSPECTOR_COLLECTION,
            inspector.id
          ),
          {
            manualAccessDate:
              currentlyAllowed
                ? ""
                : todayKey,
            updatedAt:
              serverTimestamp(),
          },
          {
            merge: true,
          }
        );

        setInspectorAccessNow(
          new Date()
        );
      } catch (error) {
        console.error(
          "검침원 모바일 로그인 토글 저장 오류:",
          error
        );

        alert(
          "모바일 로그인 허용상태 변경 중 오류가 발생했습니다."
        );
      }
    };


  const deleteInspector =
    async (inspector) => {
      const confirmed =
        window.confirm(
          `${inspector.name} 검침원을 삭제하시겠습니까?`
        );


      if (!confirmed) {
        return;
      }


      try {
        await deleteDoc(
          doc(
            db,
            WATER_INSPECTOR_COLLECTION,
            inspector.id
          )
        );


        if (
          inspectorForm.id ===
          inspector.id
        ) {
          setInspectorForm({
            id: null,
            name: "",
            phone: "",
          });
        }
      } catch (error) {
        console.error(
          "검침원 삭제 오류:",
          error
        );


        alert(
          "검침원 삭제 중 오류가 발생했습니다."
        );
      }
    };


  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="wmr-page">

      {/* ===================================================
          숨겨진 Excel 파일 선택
      =================================================== */}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="wmr-hidden-input"
        onChange={
          handleExcelUpload
        }
      />


      {/* ===================================================
          HEADER
      =================================================== */}

      <div className="wmr-page-header">
        <div>
          <h2>
            수도검침조회
          </h2>

          <p>
            빌라별 월별 수도검침 자료를 조회하고 관리합니다.
          </p>
        </div>


        <div className="wmr-header-actions">
          <div className="wmr-header-search-group">
            <div className="wmr-search-wrap wmr-header-search">
              <FiSearch className="wmr-search-icon" />

              <input
                type="text"
                value={
                  searchText
                }
                placeholder="빌라명 또는 주소 검색"
                onChange={(
                  event
                ) =>
                  setSearchText(
                    event.target.value
                  )
                }
              />

              {searchText && (
                <button
                  type="button"
                  className="wmr-search-clear"
                  onClick={() =>
                    setSearchText(
                      ""
                    )
                  }
                >
                  <FiX />
                </button>
              )}
            </div>

            <span className="wmr-header-search-count">
              {filteredVillas.length}개
            </span>
          </div>


          <button
            type="button"
            className="wmr-btn wmr-btn-inspector"
            onClick={
              openInspectorModal
            }
          >
            <FiUsers />

            검침원관리
          </button>


          <button
            type="button"
            className="wmr-btn wmr-btn-add"
            onClick={
              openAddModal
            }
          >
            <FiPlus />

            추가
          </button>


          <button
            type="button"
            className="wmr-btn wmr-btn-upload"
            onClick={
              handleExcelButtonClick
            }
          >
            <FiUpload />

            엑셀 업로드
          </button>
        </div>
      </div>


      {uploadMessage && (
        <div
          className="wmr-upload-message wmr-upload-message-floating"
          title={uploadMessage}
        >
          {uploadMessage}
        </div>
      )}


      {/* ===================================================
          CONTENT
      =================================================== */}

      <div className="wmr-content">

        {/* =================================================
            LEFT - 빌라 목록
        ================================================= */}

        <div className="wmr-villa-list-panel">
          <div className="wmr-villa-list-header">
            <strong>
              검침 빌라
            </strong>

            <span>
              {
                filteredVillas.length
              }
            </span>
          </div>


          <div className="wmr-villa-list">
            {filteredVillas.length ===
            0 ? (
              <div className="wmr-list-empty">
                검색된 빌라가 없습니다.
              </div>
            ) : (
              filteredVillas.map(
                (
                  villa
                ) => (
                  <button
                    key={
                      villa.id
                    }
                    type="button"
                    className={`wmr-villa-item ${
                      selectedVillaId ===
                      villa.id
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      setSelectedVillaId(
                        villa.id
                      )
                    }
                  >
                    <div className="wmr-villa-item-icon">
                      <FiHome />
                    </div>


                    <div className="wmr-villa-item-text">
                      <strong>
                        {
                          villa.villaName
                        }
                      </strong>

                      <span>
                        {
                          villa.address ||
                          "주소 미등록"
                        }
                      </span>
                    </div>


                    <FiChevronRight className="wmr-villa-arrow" />
                  </button>
                )
              )
            )}
          </div>
        </div>


        {/* =================================================
            RIGHT - 상세
        ================================================= */}

        <div className="wmr-detail-panel">
          {!selectedVilla ? (
            <div className="wmr-no-selection">
              <FiDroplet />

              <strong>
                수도검침표가 없습니다.
              </strong>

              <span>
                엑셀 파일을 업로드해주세요.
              </span>
            </div>
          ) : (
            <>

              {/* ===========================================
                  빌라 정보
              =========================================== */}

              <div className="wmr-villa-info-card">
                <div className="wmr-villa-info-top">
                  <div className="wmr-villa-title-row">
                    <div className="wmr-villa-title-icon">
                      <FiDroplet />
                    </div>


                    <h3>
                      {
                        selectedVilla.villaName
                      }
                    </h3>


                    <span className="wmr-room-count">
                      {
                        selectedVilla.rooms
                          .length
                      }
                      개 호실
                    </span>
                  </div>


                  <div className="wmr-villa-manage-buttons">
                    <button
                      type="button"
                      className="wmr-icon-btn"
                      title="수정"
                      onClick={() =>
                        openEditModal(
                          selectedVilla
                        )
                      }
                    >
                      <FiEdit2 />
                    </button>


                    <button
                      type="button"
                      className="wmr-icon-btn danger"
                      title="삭제"
                      onClick={() =>
                        deleteVilla(
                          selectedVilla
                        )
                      }
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>


                <div className="wmr-info-grid">

                  {/* 빌라명 */}

                  <div className="wmr-info-item">
                    <div className="wmr-info-icon">
                      <FiHome />
                    </div>

                    <div>
                      <span>
                        빌라명
                      </span>

                      <strong>
                        {
                          selectedVilla.villaName ||
                          "-"
                        }
                      </strong>
                    </div>
                  </div>


                  {/* 주소 */}

                  <div className="wmr-info-item">
                    <div className="wmr-info-icon">
                      <FiMapPin />
                    </div>

                    <div>
                      <span>
                        주소
                      </span>

                      <strong
                        title={
                          selectedVilla.address
                        }
                      >
                        {
                          selectedVilla.address ||
                          "-"
                        }
                      </strong>
                    </div>
                  </div>


                  {/* 로비 */}

                  <div className="wmr-info-item">
                    <div className="wmr-info-icon">
                      <FiKey />
                    </div>

                    <div>
                      <span>
                        로비
                      </span>

                      <strong>
                        {
                          selectedVilla.lobby ||
                          "-"
                        }
                      </strong>
                    </div>
                  </div>


                  {/* 계량기 위치 */}

                  <div className="wmr-info-item">
                    <div className="wmr-info-icon">
                      <FiDroplet />
                    </div>

                    <div>
                      <span>
                        계량기위치
                      </span>

                      <strong>
                        {
                          selectedVilla.meterLocation ||
                          "-"
                        }
                      </strong>
                    </div>
                  </div>
                </div>


                {selectedVilla.memo && (
                  <div className="wmr-villa-memo">
                    {
                      selectedVilla.memo
                    }
                  </div>
                )}
              </div>


              {/* ===========================================
                  수도 검침 TABLE
              =========================================== */}

              <div className="wmr-table-card">
                <div className="wmr-table-title">
                  <div>
                    <strong>
                      월별 수도검침표
                    </strong>

                    <span>
                      선택년도 검침자료를 표시하며, 첫 번째 12월은 전년도 12월입니다.
                    </span>
                  </div>

                  <div className="wmr-year-selector">
                    <span>
                      기준년도
                    </span>

                    <select
                      value={
                        selectedYear
                      }
                      onChange={(
                        event
                      ) =>
                        setSelectedYear(
                          Number(
                            event
                              .target
                              .value
                          )
                        )
                      }
                    >
                      {YEAR_OPTIONS.map(
                        (year) => (
                          <option
                            key={
                              year
                            }
                            value={
                              year
                            }
                          >
                            {
                              year
                            }
                            년
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>


                <div className="wmr-table-scroll">
                  <table className="wmr-table">
                    <thead>
                      <tr>
                        <th className="wmr-room-column">
                          호수
                        </th>


                        {MONTH_COLUMNS.map(
                          (
                            month,
                            index
                          ) => (
                            <th
                              key={`${month.key}-${index}`}
                            >
                              {month.key ===
                              "prev12" ? (
                                <div className="wmr-month-head">
                                  <span>
                                    12월
                                  </span>

                                  <small>
                                    {
                                      selectedYear -
                                      1
                                    }
                                    년
                                  </small>
                                </div>
                              ) : (
                                month.label
                              )}
                            </th>
                          )
                        )}
                      </tr>


                      <tr className="wmr-reading-date-row">
                        <th className="wmr-room-column wmr-reading-date-label">
                          검침일
                        </th>

                        {MONTH_COLUMNS.map(
                          (month) => {
                            const readingDate =
                              getVillaMobileReadingDate(
                                selectedVilla,
                                selectedYear,
                                month.key
                              );

                            return (
                              <th
                                key={`date-${month.key}`}
                                className={
                                  readingDate
                                    ? "has-date"
                                    : ""
                                }
                              >
                                {
                                  readingDate ||
                                  "-"
                                }
                              </th>
                            );
                          }
                        )}
                      </tr>
                    </thead>


                    <tbody>
                      {selectedVilla.rooms.length ===
                      0 ? (
                        <tr>
                          <td
                            colSpan={
                              MONTH_COLUMNS.length +
                              1
                            }
                            className="wmr-table-empty-cell"
                          >
                            등록된 호실 또는 검침자료가 없습니다.
                          </td>
                        </tr>
                      ) : (
                        selectedVilla.rooms.map(
                          (
                            room,
                            roomIndex
                          ) => (
                            <tr
                              key={
                                room.id
                              }
                            >
                              <th className="wmr-room-cell">
                                <div className="wmr-room-cell-inner">
                                  <span className="wmr-room-name">
                                    {
                                      room.room
                                    }
                                  </span>

                                  <button
                                    type="button"
                                    className={`wmr-reverse-btn ${
                                      room.reverseMeter
                                        ? "active"
                                        : ""
                                    }`}
                                    title={
                                      room.reverseMeter
                                        ? "역순 계량기 적용 중"
                                        : "이 호실을 역순 계량기로 설정"
                                    }
                                    onClick={() =>
                                      toggleReverseMeter(
                                        room.id
                                      )
                                    }
                                  >
                                    역순
                                  </button>
                                </div>
                              </th>


                              {MONTH_COLUMNS.map(
                                (
                                  month
                                ) => {
                                  const analysis =
                                    getReadingAnalysis(
                                      room,
                                      selectedYear,
                                      month.key
                                    );

                                  const inputClass =
                                    [
                                      "wmr-reading-input",
                                      analysis.status ===
                                      "blank"
                                        ? "is-blank"
                                        : "",
                                      analysis.status ===
                                      "zero"
                                        ? "is-zero"
                                        : "",
                                      analysis.status ===
                                      "warning"
                                        ? "is-warning"
                                        : "",
                                    ]
                                      .filter(
                                        Boolean
                                      )
                                      .join(
                                        " "
                                      );

                                  return (
                                    <td
                                      key={`${room.id}-${month.key}`}
                                      className={
                                        analysis.message
                                          ? "wmr-reading-cell has-warning"
                                          : "wmr-reading-cell"
                                      }
                                    >
                                      <div className="wmr-reading-cell-inner">
                                        <input
                                          ref={(
                                            element
                                          ) => {
                                            const key =
                                              `${room.id}:${selectedYear}:${month.key}`;


                                            if (
                                              element
                                            ) {
                                              readingInputRefs.current.set(
                                                key,
                                                element
                                              );
                                            } else {
                                              readingInputRefs.current.delete(
                                                key
                                              );
                                            }
                                          }}
                                          type="text"
                                          inputMode="decimal"
                                          className={
                                            inputClass
                                          }
                                          value={
                                            getDisplayReading(
                                              room,
                                              selectedYear,
                                              month.key
                                            )
                                          }
                                          onChange={(
                                            event
                                          ) =>
                                            updateReading(
                                              room.id,
                                              month.key,
                                              event
                                                .target
                                                .value
                                            )
                                          }
                                          onKeyDown={(
                                            event
                                          ) =>
                                            handleReadingKeyDown(
                                              event,
                                              roomIndex,
                                              room.id,
                                              month.key
                                            )
                                          }
                                          onFocus={(
                                            event
                                          ) => {
                                            if (
                                              !analysis.message
                                            ) {
                                              return;
                                            }

                                            const rect =
                                              event.currentTarget.getBoundingClientRect();

                                            setActiveReadingWarning({
                                              message:
                                                analysis.message,
                                              left:
                                                rect.left +
                                                rect.width / 2,
                                              top:
                                                rect.top,
                                            });
                                          }}
                                          onBlur={() =>
                                            setActiveReadingWarning(
                                              null
                                            )
                                          }
                                          onMouseEnter={(
                                            event
                                          ) => {
                                            if (
                                              !analysis.message
                                            ) {
                                              return;
                                            }

                                            const rect =
                                              event.currentTarget.getBoundingClientRect();

                                            setActiveReadingWarning({
                                              message:
                                                analysis.message,
                                              left:
                                                rect.left +
                                                rect.width / 2,
                                              top:
                                                rect.top,
                                            });
                                          }}
                                          onMouseLeave={() =>
                                            setActiveReadingWarning(
                                              null
                                            )
                                          }
                                        />

                                        {analysis.message && (
                                          <span
                                            className="wmr-warning-badge"
                                            aria-hidden="true"
                                          >
                                            !
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  );
                                }
                              )}
                            </tr>
                          )
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>


      {/* ===================================================
          검침 경고 말풍선

          fixed 레이어로 렌더링해서 옆 셀에 가려지지 않으며
          데이터 행 높이도 늘리지 않는다.
      =================================================== */}

      {activeReadingWarning && (
        <div
          className="wmr-warning-popover"
          style={{
            left:
              activeReadingWarning.left,
            top:
              activeReadingWarning.top,
          }}
        >
          {
            activeReadingWarning.message
          }
        </div>
      )}


      {/* ===================================================
          EXCEL 신규 빌라 선택 추가 MODAL
      =================================================== */}

      {isImportModalOpen && (
        <div
          className="wmr-modal-backdrop"
          onMouseDown={
            closeImportModal
          }
        >
          <div
            className="wmr-modal wmr-import-modal"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="wmr-modal-header">
              <div>
                <h3>
                  신규 수도검침 빌라 추가
                </h3>

                <p>
                  기존 등록 빌라는 제외했습니다. 아래 신규 빌라 중 추가할 항목만 선택해주세요.
                </p>
              </div>

              <button
                type="button"
                className="wmr-modal-close"
                onClick={
                  closeImportModal
                }
              >
                <FiX />
              </button>
            </div>

            <div className="wmr-modal-body">
              <div className="wmr-import-summary">
                <strong>
                  신규 {pendingImportVillas.length}개
                </strong>

                <span>
                  중복 {duplicateImportCount}개는 목록에서 제외되었습니다.
                </span>
              </div>

              <label className="wmr-import-select-all">
                <input
                  type="checkbox"
                  checked={
                    pendingImportVillas.length >
                      0 &&
                    pendingImportVillas.every(
                      (villa) =>
                        Boolean(
                          importSelection[
                            villa.id
                          ]
                        )
                    )
                  }
                  onChange={(
                    event
                  ) =>
                    toggleAllImportVillas(
                      event.target.checked
                    )
                  }
                />

                전체 선택
              </label>

              <div className="wmr-import-villa-list">
                {pendingImportVillas.map(
                  (villa) => (
                    <label
                      key={
                        villa.id
                      }
                      className="wmr-import-villa-item"
                    >
                      <input
                        type="checkbox"
                        checked={
                          Boolean(
                            importSelection[
                              villa.id
                            ]
                          )
                        }
                        onChange={() =>
                          toggleImportVilla(
                            villa.id
                          )
                        }
                      />

                      <span>
                        <strong>
                          {
                            villa.villaName
                          }
                        </strong>

                        <small>
                          {
                            villa.address ||
                            "주소 미등록"
                          }
                        </small>
                      </span>
                    </label>
                  )
                )}
              </div>
            </div>

            <div className="wmr-modal-footer">
              <span className="wmr-auto-save-note">
                선택한 빌라는 추가 즉시 자동 저장됩니다.
              </span>

              <button
                type="button"
                className="wmr-modal-cancel"
                onClick={
                  closeImportModal
                }
              >
                취소
              </button>

              <button
                type="button"
                className="wmr-modal-save"
                onClick={
                  confirmImportVillas
                }
              >
                <FiPlus />

                선택 빌라 추가
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ===================================================
          INSPECTOR MANAGER MODAL
      =================================================== */}

      {isInspectorModalOpen && (
        <div
          className="wmr-modal-backdrop"
          onMouseDown={
            closeInspectorModal
          }
        >
          <div
            className="wmr-modal wmr-inspector-modal"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="wmr-modal-header">
              <div>
                <h3>
                  검침원 관리
                </h3>

                <p>
                  매월 25일~말일과 매월 1일은 자동 로그인 허용, 그 외에는 수동 토글을 켠 당일만 접속할 수 있습니다.
                </p>
              </div>

              <button
                type="button"
                className="wmr-modal-close"
                onClick={
                  closeInspectorModal
                }
              >
                <FiX />
              </button>
            </div>


            <div className="wmr-modal-body">
              <div className="wmr-inspector-form-card">
                <div className="wmr-inspector-form-title">
                  <FiUserCheck />

                  <div>
                    <strong>
                      {
                        inspectorForm.id
                          ? "검침원 수정"
                          : "검침원 등록"
                      }
                    </strong>

                    <span>
                      이름과 연락처가 모두 일치해야 모바일 검침화면에 접속할 수 있습니다.
                    </span>
                  </div>
                </div>


                <div className="wmr-inspector-form-grid">
                  <div className="wmr-form-group">
                    <label>
                      이름
                    </label>

                    <input
                      type="text"
                      value={
                        inspectorForm.name
                      }
                      placeholder="예: 홍길동"
                      onChange={(
                        event
                      ) =>
                        setInspectorForm(
                          (
                            previous
                          ) => ({
                            ...previous,
                            name:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                    />
                  </div>


                  <div className="wmr-form-group">
                    <label>
                      연락처
                    </label>

                    <input
                      type="tel"
                      value={
                        inspectorForm.phone
                      }
                      placeholder="예: 01012345678"
                      onChange={(
                        event
                      ) =>
                        setInspectorForm(
                          (
                            previous
                          ) => ({
                            ...previous,
                            phone:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                      onKeyDown={(
                        event
                      ) => {
                        if (
                          event.key ===
                          "Enter"
                        ) {
                          event.preventDefault();
                          saveInspector();
                        }
                      }}
                    />
                  </div>
                </div>


                <div className="wmr-inspector-form-actions">
                  {inspectorForm.id && (
                    <button
                      type="button"
                      className="wmr-inspector-reset-btn"
                      onClick={() =>
                        setInspectorForm({
                          id: null,
                          name: "",
                          phone: "",
                        })
                      }
                    >
                      신규 등록
                    </button>
                  )}


                  <button
                    type="button"
                    className="wmr-inspector-save-btn"
                    onClick={
                      saveInspector
                    }
                  >
                    <FiSave />

                    {
                      inspectorForm.id
                        ? "수정 저장"
                        : "검침원 등록"
                    }
                  </button>
                </div>
              </div>


              <div className="wmr-inspector-list-head">
                <strong>
                  등록된 검침원
                </strong>

                <span>
                  {
                    inspectors.length
                  }
                  명
                </span>
              </div>


              <div className="wmr-inspector-list">
                {inspectors.length ===
                0 ? (
                  <div className="wmr-inspector-empty">
                    등록된 검침원이 없습니다.
                  </div>
                ) : (
                  inspectors.map(
                    (inspector) => (
                      <div
                        key={
                          inspector.id
                        }
                        className="wmr-inspector-item"
                      >
                        <div className="wmr-inspector-avatar">
                          <FiUserCheck />
                        </div>


                        <div className="wmr-inspector-item-info">
                          <strong>
                            {
                              inspector.name
                            }
                          </strong>

                          <span>
                            <FiPhone />

                            {
                              inspector.phone
                            }
                          </span>
                        </div>


                        <div className="wmr-inspector-access-area">
                          <div className="wmr-inspector-last-login">
                            <span>
                              마지막 로그인
                            </span>

                            <strong>
                              {
                                formatDateTime(
                                  inspector.lastLoginAt
                                )
                              }
                            </strong>
                          </div>

                          <label
                            className={`wmr-access-toggle ${
                              isInspectorLoginAllowed(
                                inspector,
                                inspectorAccessNow
                              )
                                ? "active"
                                : ""
                            } ${
                              isAutomaticInspectorAccessDate(
                                inspectorAccessNow
                              )
                                ? "automatic"
                                : ""
                            }`}
                            title={
                              isAutomaticInspectorAccessDate(
                                inspectorAccessNow
                              )
                                ? "매월 25일~말일 및 매월 1일은 자동으로 로그인 허용됩니다."
                                : isInspectorLoginAllowed(
                                    inspector,
                                    inspectorAccessNow
                                  )
                                ? "오늘 자정까지 모바일 로그인 허용"
                                : "오늘 하루 모바일 로그인 허용"
                            }
                          >
                            <input
                              type="checkbox"
                              checked={
                                isInspectorLoginAllowed(
                                  inspector,
                                  inspectorAccessNow
                                )
                              }
                              disabled={
                                isAutomaticInspectorAccessDate(
                                  inspectorAccessNow
                                )
                              }
                              onChange={() =>
                                toggleInspectorMobileAccess(
                                  inspector
                                )
                              }
                            />

                            <span className="wmr-access-toggle-track">
                              <i />
                            </span>

                            <em>
                              {
                                isInspectorLoginAllowed(
                                  inspector,
                                  inspectorAccessNow
                                )
                                  ? "로그인 가능"
                                  : "로그인 차단"
                              }
                            </em>
                          </label>

                          <div className="wmr-inspector-item-actions">
                            <button
                              type="button"
                              title="수정"
                              onClick={() =>
                                editInspector(
                                  inspector
                                )
                              }
                            >
                              <FiEdit2 />
                            </button>


                            <button
                              type="button"
                              className="danger"
                              title="삭제"
                              onClick={() =>
                                deleteInspector(
                                  inspector
                                )
                              }
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </div>


            <div className="wmr-modal-footer">
              <div className="wmr-inspector-mobile-note">
                모바일 전용 주소 예시:
                <strong>
                  /mobile/water-reading
                </strong>
              </div>

              <button
                type="button"
                className="wmr-modal-cancel"
                onClick={
                  closeInspectorModal
                }
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ===================================================
          ADD / EDIT MODAL
      =================================================== */}

      {isModalOpen && (
        <div
          className="wmr-modal-backdrop"
          onMouseDown={
            closeModal
          }
        >
          <div
            className="wmr-modal"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="wmr-modal-header">
              <div>
                <h3>
                  {
                    editingVillaId
                      ? "수도검침 빌라 수정"
                      : "수도검침 빌라 추가"
                  }
                </h3>

                <p>
                  빌라정보와 검침 호실을 등록합니다.
                </p>
              </div>


              <button
                type="button"
                className="wmr-modal-close"
                onClick={
                  closeModal
                }
              >
                <FiX />
              </button>
            </div>


            <div className="wmr-modal-body">
              <div className="wmr-form-grid">

                {/* 빌라명 */}

                <div className="wmr-form-group">
                  <label>
                    빌라명
                    <em>*</em>
                  </label>

                  <input
                    type="text"
                    value={
                      villaForm.villaName
                    }
                    onChange={(
                      event
                    ) =>
                      handleFormChange(
                        "villaName",
                        event.target
                          .value
                      )
                    }
                  />
                </div>


                {/* 주소 */}

                <div className="wmr-form-group">
                  <label>
                    주소
                    <em>*</em>
                  </label>

                  <input
                    type="text"
                    value={
                      villaForm.address
                    }
                    onChange={(
                      event
                    ) =>
                      handleFormChange(
                        "address",
                        event.target
                          .value
                      )
                    }
                  />
                </div>


                {/* 로비 */}

                <div className="wmr-form-group">
                  <label>
                    로비
                  </label>

                  <input
                    type="text"
                    value={
                      villaForm.lobby
                    }
                    onChange={(
                      event
                    ) =>
                      handleFormChange(
                        "lobby",
                        event.target
                          .value
                      )
                    }
                  />
                </div>


                {/* 계량기 위치 */}

                <div className="wmr-form-group">
                  <label>
                    계량기위치
                  </label>

                  <input
                    type="text"
                    value={
                      villaForm.meterLocation
                    }
                    onChange={(
                      event
                    ) =>
                      handleFormChange(
                        "meterLocation",
                        event.target
                          .value
                      )
                    }
                  />
                </div>
              </div>


              {/* 추가정보 */}

              <div className="wmr-form-group wmr-form-full">
                <label>
                  추가정보
                </label>

                <input
                  type="text"
                  value={
                    villaForm.memo
                  }
                  onChange={(
                    event
                  ) =>
                    handleFormChange(
                      "memo",
                      event.target
                        .value
                    )
                  }
                />
              </div>


              {/* ===========================================
                  호실 등록
              =========================================== */}

              <div className="wmr-room-section">
                <div className="wmr-room-section-header">
                  <div>
                    <strong>
                      호실 등록
                    </strong>

                    <span>
                      입력한 순서 그대로 표시됩니다.
                    </span>
                  </div>


                  <button
                    type="button"
                    className="wmr-small-add-btn"
                    onClick={
                      addRoomInput
                    }
                  >
                    <FiPlus />

                    호실 추가
                  </button>
                </div>


                <div className="wmr-room-input-list">
                  {villaForm.rooms.map(
                    (
                      room,
                      index
                    ) => (
                      <div
                        key={
                          index
                        }
                        className="wmr-room-input-row"
                      >
                        <span className="wmr-room-number">
                          {
                            index +
                            1
                          }
                        </span>


                        <input
                          type="text"
                          value={
                            room
                          }
                          placeholder="예: 상가, 101, 102, 201"
                          onChange={(
                            event
                          ) =>
                            handleRoomChange(
                              index,
                              event
                                .target
                                .value
                            )
                          }
                        />


                        <button
                          type="button"
                          className="wmr-room-delete-btn"
                          onClick={() =>
                            removeRoomInput(
                              index
                            )
                          }
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>


            {/* =============================================
                MODAL FOOTER
            ============================================= */}

            <div className="wmr-modal-footer">
              <button
                type="button"
                className="wmr-modal-cancel"
                onClick={
                  closeModal
                }
              >
                취소
              </button>


              <button
                type="button"
                className="wmr-modal-save"
                onClick={
                  saveVilla
                }
              >
                <FiSave />

                {
                  editingVillaId
                    ? "수정 저장"
                    : "등록"
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default WaterMeterReadingPage;