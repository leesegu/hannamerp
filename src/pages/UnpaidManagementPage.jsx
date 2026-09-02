// src/pages/UnpaidManagementPage.jsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";

import * as XLSX from "xlsx";

import html2canvas from "html2canvas";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import {
  FiAlertCircle,
  FiAlertTriangle,
  FiCalendar,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiDollarSign,
  FiDroplet,
  FiFileText,
  FiFolder,
  FiImage,
  FiMove,
  FiSave,
  FiSearch,
  FiTrash2,
  FiUploadCloud,
  FiUsers,
  FiX,
} from "react-icons/fi";

import { db } from "../firebase";

import "./UnpaidManagementPage.css";


/* =========================================================
   Firestore

   미납관리는 매달 상황이 달라 이어가지 않으므로,
   "현재 화면 내용"은 저장 버튼을 눌러야만
   날짜/시간별 스냅샷 문서로 저장됩니다.
========================================================= */

const SNAPSHOT_COLLECTION = "unpaid_management_snapshots";

/*
 * 하루에 여러 번 저장해도 같은 날짜 문서를 계속 덮어쓰므로
 * (문서 1개 = 날짜 1일), 이 값은 "최근 며칠치 저장자료를
 * 불러오기 목록에 표시할지"를 의미합니다.
 */
const SNAPSHOT_LIST_LIMIT = 60;


/* =========================================================
   기본 필터
========================================================= */

const STATUS_FILTERS = [
  {
    value: "unpaid",
    label: "미납",
  },
  {
    value: "partial",
    label: "부분납부",
  },
  {
    value: "paid",
    label: "완납",
  },
  {
    value: "all",
    label: "전체",
  },
];


/*
 * 상태 드롭다운(직접 선택용) 옵션
 * - 커스텀 팝업 형태로 표시되며, 색상 점 + 설명 문구를 함께 보여줍니다.
 */
const STATUS_OPTIONS = [
  {
    value: "unpaid",
    label: "미납",
    description: "아직 입금되지 않았어요",
  },
  {
    value: "partial",
    label: "부분납부",
    description: "일부 금액만 입금됐어요",
  },
  {
    value: "paid",
    label: "완납",
    description: "전액 입금이 완료됐어요",
  },
];

const STATUS_LABELS = STATUS_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label;

    return acc;
  },
  {}
);


/*
 * 헤더의 미납 개월수 필터
 * (기본값 : 3개월 이상)
 */
const MONTH_FILTERS = [
  {
    value: "1",
    label: "1개월",
  },
  {
    value: "2",
    label: "2개월",
  },
  {
    value: "3+",
    label: "3개월 이상",
  },
];


/*
 * 단수리스트 구 분류
 * (주소에 아래 구 이름이 포함되어 있으면 해당 구로 분류,
 *  포함되지 않으면 "기타"로 분류됩니다)
 */
const GU_LIST = [
  "서구",
  "중구",
  "동구",
  "대덕구",
  "유성구",
];

const GU_FALLBACK = "기타";

const extractGu = (address) => {
  const text = cleanText(address);

  const found = GU_LIST.find(
    (gu) => text.includes(gu)
  );

  return found || GU_FALLBACK;
};


/* =========================================================
   공통 유틸
========================================================= */

const cleanText = (value) =>
  String(value ?? "")
    .replace(/ /g, " ")
    .trim();


const onlyNumber = (value) => {
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  const number = Number(cleaned);

  return Number.isFinite(number)
    ? number
    : 0;
};


const formatMoney = (value) => {
  const number = Number(value || 0);

  return number.toLocaleString("ko-KR");
};


const normalizeRoom = (value) => {
  let room = cleanText(value);

  room = room.replace(/호$/g, "").trim();

  return room;
};


const normalizePhone = (value) => {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  return text;
};


/* =========================================================
   날짜 / 시간 표시 유틸 (Asia/Seoul 기준)
========================================================= */

const formatDateOnly = (millis) => {
  if (!millis) {
    return "";
  }

  return new Date(millis).toLocaleDateString(
    "ko-KR",
    {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    }
  );
};


const formatTimeOnly = (millis) => {
  if (!millis) {
    return "";
  }

  return new Date(millis).toLocaleTimeString(
    "ko-KR",
    {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }
  );
};


const formatDateTime = (millis) => {
  if (!millis) {
    return "";
  }

  return `${formatDateOnly(millis)} ${formatTimeOnly(millis)}`;
};


/*
 * 같은 날짜끼리 묶기 위한 키 (YYYY-MM-DD, Asia/Seoul 기준)
 */
const formatDateKey = (millis) => {
  if (!millis) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  );

  return formatter.format(
    new Date(millis)
  );
};


/*
 * "9/2" 처럼 월/일만 표시 (단수 조치/해제 날짜를 비고에 남길 때 사용)
 */
const formatMonthDay = (date) => {
  const target = date || new Date();

  const kstKey = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(target);

  const [
    ,
    month,
    day,
  ] = kstKey.split("-");

  return `${Number(month)}/${Number(day)}`;
};


/*
 * 상태가 바뀔 때(직접 선택 / 입금액 입력 후 자동 계산 모두) 함께 반영할
 * "부분납부 완료일 / 완납 완료일" 패치
 *
 * - 이미 같은 상태라면(예: 부분납부 상태에서 입금액만 추가로 수정) 날짜는
 *   그대로 두어, 처음 그 상태가 된 날짜가 계속 유지되도록 합니다.
 * - "미납"으로 되돌아가면 두 날짜 모두 지웁니다.
 */
const buildStatusDatePatch = (
  row,
  nextStatus
) => {
  if (nextStatus === "unpaid") {
    return {
      partialDate: "",
      paidDate: "",
    };
  }

  if (row.status === nextStatus) {
    return {};
  }

  const todayLabel =
    formatMonthDay(
      new Date()
    );

  if (nextStatus === "partial") {
    return {
      partialDate:
        todayLabel,
    };
  }

  if (nextStatus === "paid") {
    return {
      paidDate:
        todayLabel,
    };
  }

  return {};
};


/*
 * 상태(부분납부/완납) 뱃지에 마우스를 올렸을 때 보여줄 완료일 안내문
 */
const getStatusTooltip = (row) => {
  const lines = [];

  if (row.partialDate) {
    lines.push(`부분납부 : ${row.partialDate}`);
  }

  if (row.paidDate) {
    lines.push(`완납 : ${row.paidDate}`);
  }

  return lines.join("\n");
};


/* =========================================================
   미납월 형식 변환

   2026_08
   2026-08
   2026/08
   2026.08
========================================================= */

const parseMonth = (value) => {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const match = text.match(
    /^(\d{4})[\s_\-./]+(\d{1,2})(?:월)?$/
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    year,
    month,
    label: `${year}년 ${month}월`,
  };
};


/* =========================================================
   A열 코드번호 - 호수 분리

   019-202
   → code = 019
   → room = 202
========================================================= */

const parseCodeRoom = (value) => {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const normalized =
    text.replace(/[–—―]/g, "-");

  const separatorIndex =
    normalized.indexOf("-");

  if (separatorIndex <= 0) {
    return null;
  }

  const code =
    normalized
      .slice(0, separatorIndex)
      .trim();

  const room =
    normalizeRoom(
      normalized
        .slice(separatorIndex + 1)
        .trim()
    );

  if (
    !code ||
    !room
  ) {
    return null;
  }

  return {
    code,
    room,
  };
};


/* =========================================================
   Firestore 문서 ID

   코드 + 호수 기준
========================================================= */

const makeDocumentId = (
  code,
  room
) => {
  const safeCode =
    cleanText(code)
      .replace(/[\/\\.#$\[\]]/g, "_");

  const safeRoom =
    cleanText(room)
      .replace(/[\/\\.#$\[\]]/g, "_");

  return `${safeCode}__${safeRoom}`;
};


/* =========================================================
   상태 계산
========================================================= */

const calculatePayment = (
  totalUnpaid,
  actualPaid
) => {
  const total =
    Math.max(
      onlyNumber(totalUnpaid),
      0
    );

  const paid =
    Math.max(
      onlyNumber(actualPaid),
      0
    );

  const balance =
    Math.max(
      total - paid,
      0
    );

  let status = "unpaid";

  if (
    total > 0 &&
    paid >= total
  ) {
    status = "paid";
  } else if (
    paid > 0 &&
    paid < total
  ) {
    status = "partial";
  }

  return {
    total,
    paid,
    balance,
    status,
  };
};


/* =========================================================
   엑셀(가짜 xls 텍스트 포함) 인코딩 안전 판독

   일부 관리 프로그램에서 저장하는 ".xls" 파일은
   실제로는 진짜 엑셀 바이너리가 아니라
   탭(Tab)으로 구분된 텍스트 파일이며,
   대부분 CP949(EUC-KR)로 인코딩되어 있습니다.

   → 그대로 XLSX.read()에 넘기면 인코딩을 잘못 판단해
     빌라명/주소/이름 등 한글이 깨져 보이는 문제가 발생합니다.
     (숫자, 코드번호 등은 영향 없음)

   그래서 파일 내용을 먼저 확인해서
   - 진짜 xlsx(zip) / 진짜 바이너리 xls(OLE) → 기존 방식 그대로
   - 그 외(탭 구분 텍스트) → CP949/EUC-KR 로 직접 디코딩 후
     행/열 배열로 변환
   과정을 거칩니다.
========================================================= */

const decodeTextBuffer = (buffer) => {
  const bytes = new Uint8Array(buffer);

  /*
   * UTF-8 BOM
   */
  if (
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return new TextDecoder("utf-8").decode(buffer);
  }

  /*
   * UTF-16 BOM (일부 프로그램의 "유니코드 텍스트" 저장 형식)
   */
  if (
    bytes[0] === 0xff &&
    bytes[1] === 0xfe
  ) {
    return new TextDecoder("utf-16le").decode(buffer);
  }

  if (
    bytes[0] === 0xfe &&
    bytes[1] === 0xff
  ) {
    return new TextDecoder("utf-16be").decode(buffer);
  }

  try {
    /*
     * 순수 UTF-8 텍스트인 경우
     */
    return new TextDecoder(
      "utf-8",
      {
        fatal: true,
      }
    ).decode(buffer);
  } catch (error) {
    /*
     * 국내 관리 프로그램의 기본 저장 인코딩
     * (CP949 / EUC-KR)
     */
    return new TextDecoder("euc-kr").decode(buffer);
  }
};


const parseDelimitedText = (text) => {
  const lines = text
    .split(/\r\n|\n|\r/)
    .filter((line) => line.length > 0);

  return lines.map((line) =>
    line
      .split("\t")
      .map((cell) => {
        let value = cell;

        if (
          value.startsWith("\"") &&
          value.endsWith("\"")
        ) {
          value = value.slice(1, -1);
        }

        return value.replace(/""/g, "\"");
      })
  );
};


const readWorkbookFromFile = async (
  file
) => {
  const buffer =
    await file.arrayBuffer();

  const bytes =
    new Uint8Array(
      buffer.slice(0, 8)
    );

  /*
   * ZIP 시그니처(PK) → 정상 .xlsx / .xlsm
   */
  const isZip =
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b;

  /*
   * OLE2 시그니처 → 정상 바이너리 .xls
   */
  const isOle =
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0;

  if (
    isZip ||
    isOle
  ) {
    return XLSX.read(
      buffer,
      {
        type: "array",
        cellDates: false,
        cellFormula: true,
        cellText: true,
      }
    );
  }

  /*
   * 진짜 엑셀 바이너리가 아닌 경우
   * (탭 구분 텍스트, CP949/EUC-KR 인코딩)
   */
  const text =
    decodeTextBuffer(buffer);

  const rowsArray =
    parseDelimitedText(text);

  const worksheet =
    XLSX.utils.aoa_to_sheet(
      rowsArray
    );

  const workbook =
    XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Sheet1"
  );

  return workbook;
};


/* =========================================================
   Excel 분석

   기준:
   A : 코드번호-호수
   B : 빌라명
   C : 미납월 / 호합
   H : 연체료 포함 미납금액
   I : 주소
   J : 연락처
   K : 이름
========================================================= */

const parseExcelWorkbook = (
  workbook
) => {
  const resultMap =
    new Map();

  workbook.SheetNames.forEach(
    (sheetName) => {
      const worksheet =
        workbook.Sheets[
          sheetName
        ];

      if (!worksheet) {
        return;
      }

      /*
       * raw:false
       *
       * 019 같은 앞자리 0,
       * 전화번호 등의 표시형식을 최대한 보존
       */
      const rows =
        XLSX.utils.sheet_to_json(
          worksheet,
          {
            header: 1,
            raw: false,
            defval: "",
            blankrows: false,
          }
        );

      let currentGroup =
        null;


      const finishGroup =
        () => {
          if (
            !currentGroup
          ) {
            return;
          }

          if (
            !currentGroup.code ||
            !currentGroup.room
          ) {
            currentGroup =
              null;

            return;
          }

          /*
           * 월별 자료 정리
           */
          const monthMap =
            new Map();

          (
            currentGroup.unpaidMonths ||
            []
          ).forEach(
            (monthItem) => {
              if (
                !monthItem?.key
              ) {
                return;
              }

              monthMap.set(
                monthItem.key,
                {
                  ...monthItem,
                  amount:
                    onlyNumber(
                      monthItem.amount
                    ),
                }
              );
            }
          );


          const unpaidMonths =
            Array.from(
              monthMap.values()
            ).sort(
              (a, b) =>
                a.key.localeCompare(
                  b.key
                )
            );


          const monthlySum =
            unpaidMonths.reduce(
              (
                sum,
                monthItem
              ) =>
                sum +
                onlyNumber(
                  monthItem.amount
                ),
              0
            );


          /*
           * 호합 행 H값 우선
           *
           * 없으면 월별 H 합계 사용
           */
          const totalUnpaid =
            currentGroup.totalFromExcel >
            0
              ? currentGroup.totalFromExcel
              : monthlySum;


          const docId =
            makeDocumentId(
              currentGroup.code,
              currentGroup.room
            );


          const existing =
            resultMap.get(
              docId
            );


          /*
           * 여러 시트에 동일 세대가 있을 경우
           * 월별 자료 병합
           */
          if (existing) {
            const mergedMonthMap =
              new Map();

            (
              existing.unpaidMonths ||
              []
            ).forEach(
              (item) =>
                mergedMonthMap.set(
                  item.key,
                  item
                )
            );

            unpaidMonths.forEach(
              (item) =>
                mergedMonthMap.set(
                  item.key,
                  item
                )
            );

            const mergedMonths =
              Array.from(
                mergedMonthMap.values()
              ).sort(
                (a, b) =>
                  a.key.localeCompare(
                    b.key
                  )
              );

            const mergedMonthlySum =
              mergedMonths.reduce(
                (
                  sum,
                  item
                ) =>
                  sum +
                  onlyNumber(
                    item.amount
                  ),
                0
              );

            resultMap.set(
              docId,
              {
                ...existing,

                villaName:
                  currentGroup.villaName ||
                  existing.villaName,

                address:
                  currentGroup.address ||
                  existing.address,

                phone:
                  currentGroup.phone ||
                  existing.phone,

                tenantName:
                  currentGroup.tenantName ||
                  existing.tenantName,

                unpaidMonths:
                  mergedMonths,

                unpaidCount:
                  mergedMonths.length,

                totalUnpaid:
                  totalUnpaid >
                  0
                    ? totalUnpaid
                    : mergedMonthlySum,
              }
            );
          } else {
            resultMap.set(
              docId,
              {
                id:
                  docId,

                code:
                  currentGroup.code,

                room:
                  currentGroup.room,

                villaName:
                  currentGroup.villaName ||
                  "",

                address:
                  currentGroup.address ||
                  "",

                phone:
                  currentGroup.phone ||
                  "",

                tenantName:
                  currentGroup.tenantName ||
                  "",

                unpaidMonths,

                unpaidCount:
                  unpaidMonths.length,

                totalUnpaid,

                sourceSheet:
                  currentGroup.sourceSheet ||
                  sheetName,
              }
            );
          }


          currentGroup =
            null;
        };


      rows.forEach(
        (
          row,
          rowIndex
        ) => {
          const colA =
            cleanText(
              row?.[0]
            );

          const colB =
            cleanText(
              row?.[1]
            );

          const colC =
            cleanText(
              row?.[2]
            );

          /*
           * H = index 7
           */
          const colH =
            row?.[7];

          /*
           * I = index 8
           * J = index 9
           * K = index 10
           */
          const colI =
            cleanText(
              row?.[8]
            );

          const colJ =
            normalizePhone(
              row?.[9]
            );

          const colK =
            cleanText(
              row?.[10]
            );


          /*
           * 새 세대 시작
           */
          const codeRoom =
            parseCodeRoom(
              colA
            );

          if (codeRoom) {
            finishGroup();

            currentGroup = {
              code:
                codeRoom.code,

              room:
                codeRoom.room,

              villaName:
                colB,

              address:
                colI,

              phone:
                colJ,

              tenantName:
                colK,

              unpaidMonths:
                [],

              totalFromExcel:
                0,

              sourceSheet:
                sheetName,

              sourceRow:
                rowIndex + 1,
            };
          }


          if (
            !currentGroup
          ) {
            return;
          }


          /*
           * 빈 셀일 경우 앞 행 값 유지,
           * 새로운 값이 있으면 갱신
           */
          if (
            colB &&
            !currentGroup.villaName
          ) {
            currentGroup.villaName =
              colB;
          }

          if (
            colI &&
            !currentGroup.address
          ) {
            currentGroup.address =
              colI;
          }

          if (
            colJ &&
            !currentGroup.phone
          ) {
            currentGroup.phone =
              colJ;
          }

          if (
            colK &&
            !currentGroup.tenantName
          ) {
            currentGroup.tenantName =
              colK;
          }


          /*
           * 호합 행
           */
          if (
            colC.includes("호합")
          ) {
            currentGroup.totalFromExcel =
              onlyNumber(
                colH
              );

            finishGroup();

            return;
          }


          /*
           * 미납월
           */
          const monthInfo =
            parseMonth(
              colC
            );

          if (
            monthInfo
          ) {
            currentGroup.unpaidMonths.push(
              {
                key:
                  monthInfo.key,

                year:
                  monthInfo.year,

                month:
                  monthInfo.month,

                label:
                  monthInfo.label,

                /*
                 * 중요:
                 * 월별 미납금액 = H열
                 */
                amount:
                  onlyNumber(
                    colH
                  ),
              }
            );
          }
        }
      );


      /*
       * 시트 마지막에서
       * 호합 행 없이 끝난 경우
       */
      finishGroup();
    }
  );


  return Array.from(
    resultMap.values()
  );
};


/*
 * 빌라명 → 호수 순 정렬
 */
const sortRows = (list) =>
  [...list].sort(
    (a, b) => {
      const villaCompare =
        cleanText(a.villaName).localeCompare(
          cleanText(b.villaName),
          "ko"
        );

      if (villaCompare !== 0) {
        return villaCompare;
      }

      return cleanText(a.room).localeCompare(
        cleanText(b.room),
        "ko",
        {
          numeric: true,
        }
      );
    }
  );


/*
 * 저장/불러오기 대상이 되는 형태로 행 데이터 정리
 * (Firestore 저장용 - 불필요/비직렬화 값 제거)
 *
 * 상태(status)는 이제 드롭다운으로 직접 선택할 수 있는 값이므로,
 * 저장할 때 입금액 기준으로 다시 자동 계산해서 덮어쓰지 않고
 * 화면에 표시되어 있던 값(row.status)을 그대로 저장합니다.
 */
const sanitizeRowForSave = (row) => {
  const payment = calculatePayment(
    row.totalUnpaid,
    row.actualPaid
  );

  return {
    id: row.id,
    code: row.code || "",
    room: row.room || "",
    villaName: row.villaName || "",
    address: row.address || "",
    tenantName: row.tenantName || "",
    phone: row.phone || "",
    unpaidMonths: (row.unpaidMonths || []).map(
      (item) => ({
        key: item.key,
        year: item.year,
        month: item.month,
        label: item.label,
        amount: onlyNumber(item.amount),
      })
    ),
    unpaidCount: row.unpaidCount || 0,
    totalUnpaid: payment.total,
    actualPaid: payment.paid,
    balance: payment.balance,
    status: row.status || payment.status,
    waterCut: Boolean(row.waterCut),
    waterCutStartDate: row.waterCutStartDate || null,
    partialDate: row.partialDate || "",
    paidDate: row.paidDate || "",
    note: row.note || "",
    sourceSheet: row.sourceSheet || "",
  };
};


/*
 * 저장된 스냅샷의 행 목록을 요약 (불러오기 팝업 목록에 표시)
 *
 * - 상단 개월수 드롭다운과 무관하게, 불러오기 목록의 "전체/미납/단수/잔액"은
 *   항상 "3개월 이상 미납" 행만 기준으로 계산합니다.
 */
const summarizeRowsFor3PlusMonths = (rows) => {
  const targetRows = (rows || []).filter(
    (row) => (row.unpaidCount || 0) >= 3
  );

  let unpaidCount = 0;
  let partialCount = 0;
  let paidCount = 0;
  let waterCutCount = 0;
  let totalOriginal = 0;
  let totalPaid = 0;
  let totalBalance = 0;

  targetRows.forEach((row) => {
    if (row.status === "paid") {
      paidCount += 1;
    } else if (row.status === "partial") {
      partialCount += 1;
    } else {
      unpaidCount += 1;
    }

    if (row.waterCut) {
      waterCutCount += 1;
    }

    totalOriginal += onlyNumber(row.totalUnpaid);
    totalPaid += onlyNumber(row.actualPaid);
    totalBalance += onlyNumber(row.balance);
  });

  return {
    totalCount: targetRows.length,
    unpaidCount,
    partialCount,
    paidCount,
    waterCutCount,
    totalOriginal,
    totalPaid,
    totalBalance,
  };
};


/*
 * 불러온 행 데이터를 화면 표시용으로 정리

 * (마찬가지로 status는 자동 재계산하지 않고 저장되어 있던 값을 유지합니다)
 */
const normalizeLoadedRow = (row) => {
  const payment = calculatePayment(
    row.totalUnpaid,
    row.actualPaid
  );

  return {
    ...row,
    totalUnpaid: payment.total,
    actualPaid: payment.paid,
    balance: payment.balance,
    status: row.status || payment.status,
    waterCut: Boolean(row.waterCut),
    note: row.note || "",
  };
};


/* =========================================================
   Component
========================================================= */

export default function UnpaidManagementPage() {
  const fileInputRef =
    useRef(null);

  /*
   * 미납관리 페이지 전체 영역
   * (이 영역 안에서의 클릭은 "다른 화면으로 이동"으로 취급하지 않음)
   */
  const pageRootRef =
    useRef(null);


  const [rows, setRows] =
    useState([]);


  const [loading, setLoading] =
    useState(true);


  const [
    uploading,
    setUploading,
  ] =
    useState(false);


  const [
    saving,
    setSaving,
  ] =
    useState(false);


  const [search, setSearch] =
    useState("");


  /*
   * 기본값 = 전체
   */
  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState("all");


  /*
   * 미납 개월수 필터 (기본값 = 3개월 이상)
   */
  const [
    monthFilter,
    setMonthFilter,
  ] =
    useState("3+");


  /*
   * 미납내역(월별 금액) 팝업
   *
   * 세로 행 높이가 늘어나지 않도록, 표 내부에 직접 펼치지 않고
   * document.body 로 포탈(portal) 시킨 팝업으로 표 위에 겹쳐서 표시합니다.
   * (열려있는 행 id 1개 + 화면 좌표만 상태로 보관)
   */
  const [
    openDetailRowId,
    setOpenDetailRowId,
  ] =
    useState(null);

  const [
    detailPopupPos,
    setDetailPopupPos,
  ] =
    useState({
      top: 0,
      left: 0,
    });

  const detailPopupRef =
    useRef(null);

  const toggleRowDetail =
    (
      row,
      event
    ) => {
      if (
        openDetailRowId ===
        row.id
      ) {
        setOpenDetailRowId(
          null
        );

        return;
      }

      const rect =
        event.currentTarget.getBoundingClientRect();

      setDetailPopupPos({
        top:
          rect.bottom +
          6,

        left:
          rect.left +
          rect.width /
            2,
      });

      setOpenDetailRowId(
        row.id
      );
    };


  /*
   * 팝업이 열려있는 동안 - 팝업/배지 바깥을 클릭하거나
   * 스크롤/창 크기 변경 시 자동으로 닫기
   */
  useEffect(
    () => {
      if (
        !openDetailRowId
      ) {
        return undefined;
      }

      const handleOutsideClick =
        (
          event
        ) => {
          const popupEl =
            detailPopupRef.current;

          if (
            popupEl &&
            popupEl.contains(
              event.target
            )
          ) {
            return;
          }

          if (
            event.target?.closest?.(
              ".unpaid-count-badge"
            )
          ) {
            return;
          }

          setOpenDetailRowId(
            null
          );
        };

      const handleClose =
        () =>
          setOpenDetailRowId(
            null
          );

      document.addEventListener(
        "mousedown",
        handleOutsideClick,
        true
      );

      window.addEventListener(
        "scroll",
        handleClose,
        true
      );

      window.addEventListener(
        "resize",
        handleClose
      );

      return () => {
        document.removeEventListener(
          "mousedown",
          handleOutsideClick,
          true
        );

        window.removeEventListener(
          "scroll",
          handleClose,
          true
        );

        window.removeEventListener(
          "resize",
          handleClose
        );
      };
    },
    [openDetailRowId]
  );


  /*
   * 상태(미납/부분납부/완납) 선택 팝업
   *
   * 브라우저 기본 <select> 목록은 디자인을 자유롭게 바꿀 수 없어서,
   * 미납내역 팝업과 같은 방식(버튼 + document.body 포탈)으로
   * 직접 만든 목록을 표 위에 겹쳐서 보여줍니다.
   */
  const [
    openStatusRowId,
    setOpenStatusRowId,
  ] =
    useState(null);

  const [
    statusPopupPos,
    setStatusPopupPos,
  ] =
    useState({
      top: 0,
      left: 0,
    });

  const statusPopupRef =
    useRef(null);

  const toggleStatusPopup =
    (
      row,
      event
    ) => {
      if (
        openStatusRowId ===
        row.id
      ) {
        setOpenStatusRowId(
          null
        );

        return;
      }

      const rect =
        event.currentTarget.getBoundingClientRect();

      setStatusPopupPos({
        top:
          rect.bottom +
          6,

        left:
          rect.left +
          rect.width /
            2,
      });

      setOpenStatusRowId(
        row.id
      );
    };


  /*
   * 상태 팝업이 열려있는 동안 - 팝업/트리거 버튼 바깥을 클릭하거나
   * 스크롤/창 크기 변경 시 자동으로 닫기
   */
  useEffect(
    () => {
      if (
        !openStatusRowId
      ) {
        return undefined;
      }

      const handleOutsideClick =
        (
          event
        ) => {
          const popupEl =
            statusPopupRef.current;

          if (
            popupEl &&
            popupEl.contains(
              event.target
            )
          ) {
            return;
          }

          if (
            event.target?.closest?.(
              ".unpaid-status-trigger"
            )
          ) {
            return;
          }

          setOpenStatusRowId(
            null
          );
        };

      const handleClose =
        () =>
          setOpenStatusRowId(
            null
          );

      document.addEventListener(
        "mousedown",
        handleOutsideClick,
        true
      );

      window.addEventListener(
        "scroll",
        handleClose,
        true
      );

      window.addEventListener(
        "resize",
        handleClose
      );

      return () => {
        document.removeEventListener(
          "mousedown",
          handleOutsideClick,
          true
        );

        window.removeEventListener(
          "scroll",
          handleClose,
          true
        );

        window.removeEventListener(
          "resize",
          handleClose
        );
      };
    },
    [openStatusRowId]
  );


  /*
   * 번호를 클릭해서 선택한 행 id 모음
   * (선택한 행만 모아서 단수리스트 팝업에 표시합니다)
   */
  const [
    selectedRowIds,
    setSelectedRowIds,
  ] =
    useState(
      () => new Set()
    );

  const toggleRowSelected =
    (
      id
    ) => {
      setSelectedRowIds(
        (
          current
        ) => {
          const next =
            new Set(
              current
            );

          if (
            next.has(
              id
            )
          ) {
            next.delete(
              id
            );
          } else {
            next.add(
              id
            );
          }

          return next;
        }
      );
    };


  /*
   * 실제 입금액 입력 - 임시 입력값(엔터/포커스아웃 전까지는
   * 화면에만 보이고 실제 상태/상태뱃지에는 반영되지 않음)
   */
  const [
    paidDrafts,
    setPaidDrafts,
  ] =
    useState({});


  /*
   * 저장하지 않은 변경사항이 있는지 여부
   * (이벤트 리스너 안에서도 최신 값을 읽기 위해 ref 병행 사용)
   */
  const [isDirty, setIsDirty] =
    useState(false);

  const isDirtyRef =
    useRef(false);

  useEffect(
    () => {
      isDirtyRef.current =
        isDirty;
    },
    [isDirty]
  );


  /*
   * 현재 화면에 표시 중인 자료가
   * 언제 저장된 자료인지 안내하는 라벨
   */
  const [
    currentSnapshotLabel,
    setCurrentSnapshotLabel,
  ] =
    useState("");


  /*
   * 마지막으로 업로드한 엑셀 파일명
   * (저장 시 함께 기록)
   */
  const lastSourceFileRef =
    useRef("");


  /*
   * 불러오기 팝업
   */
  const [
    loadModalOpen,
    setLoadModalOpen,
  ] =
    useState(false);

  const [
    snapshotList,
    setSnapshotList,
  ] =
    useState([]);

  const [
    snapshotListLoading,
    setSnapshotListLoading,
  ] =
    useState(false);


  /*
   * 저장하지 않은 변경사항 확인 팝업
   * { onSaveAndProceed, onDiscardAndProceed, onCancel } | null
   */
  const [
    confirmModal,
    setConfirmModal,
  ] =
    useState(null);


  /*
   * 단수리스트 팝업
   *
   * 선택한(번호 클릭) 행들을 구(서구/중구/동구/대덕구/유성구/기타)별로
   * 묶어서 보여주고, 마우스 드래그로 구 사이를 이동시킬 수 있습니다.
   */
  const [
    waterListModalOpen,
    setWaterListModalOpen,
  ] =
    useState(false);

  const [
    waterListGroups,
    setWaterListGroups,
  ] =
    useState(
      () => ({})
    );

  const waterListCaptureRef =
    useRef(null);

  const waterModalRef =
    useRef(null);

  const dragSourceRef =
    useRef(null);

  /*
   * 단수리스트 - 구별로 펼침/접힘 상태
   * (기본값 : 전부 펼침. 목록이 많은 구는 제목을 눌러 접을 수 있습니다)
   */
  const [
    expandedGuSet,
    setExpandedGuSet,
  ] =
    useState(
      () =>
        new Set([
          ...GU_LIST,
          GU_FALLBACK,
        ])
    );

  const toggleWaterGroupExpand =
    (
      gu
    ) => {
      setExpandedGuSet(
        (
          current
        ) => {
          const next =
            new Set(
              current
            );

          if (
            next.has(
              gu
            )
          ) {
            next.delete(
              gu
            );
          } else {
            next.add(
              gu
            );
          }

          return next;
        }
      );
    };


  /* =======================================================
     행 데이터 적용 (불러오기 공통)
  ======================================================= */

  const applyLoadedRows =
    useCallback(
      (
        loadedRows,
        savedAtMillis
      ) => {
        const normalized =
          sortRows(
            (loadedRows || []).map(
              normalizeLoadedRow
            )
          );

        setRows(
          normalized
        );

        setCurrentSnapshotLabel(
          savedAtMillis
            ? `${formatDateTime(
                savedAtMillis
              )} 저장분`
            : ""
        );
      },
      []
    );


  /* =======================================================
     최근 저장된 자료 불러오기 (페이지 진입 시 자동)
  ======================================================= */

  const loadLatestSnapshot =
    useCallback(
      async () => {
        setLoading(true);

        try {
          const snapshotQuery =
            query(
              collection(
                db,
                SNAPSHOT_COLLECTION
              ),
              orderBy(
                "savedAtMillis",
                "desc"
              ),
              limit(1)
            );

          const snapshot =
            await getDocs(
              snapshotQuery
            );

          if (
            snapshot.empty
          ) {
            setRows([]);

            setCurrentSnapshotLabel(
              ""
            );
          } else {
            const data =
              snapshot.docs[0].data();

            applyLoadedRows(
              data.rows,
              data.savedAtMillis
            );

            lastSourceFileRef.current =
              data.sourceFile ||
              "";
          }

          setIsDirty(false);
        } catch (error) {
          console.error(
            "미납관리 최근 저장자료 조회 오류:",
            error
          );

          alert(
            "최근 저장된 미납관리 자료를 불러오지 못했습니다."
          );
        } finally {
          setLoading(false);
        }
      },
      [applyLoadedRows]
    );


  useEffect(
    () => {
      loadLatestSnapshot();
    },
    [loadLatestSnapshot]
  );


  /* =======================================================
     현재 화면 내용 저장

     - 문서 1개 = 날짜 1일 기준으로 저장합니다.
       (같은 날 여러 번 저장하면 그 날짜 문서를 계속 덮어써서
        불러오기 목록에는 그 날짜의 "마지막 저장"만 남습니다)
     - 다른 날짜에 저장된 자료는 그대로 유지되어 불러오기 목록에서 계속 확인 가능합니다.
  ======================================================= */

  const saveSnapshot =
    useCallback(
      async () => {
        if (
          rows.length ===
          0
        ) {
          alert(
            "저장할 미납관리 자료가 없습니다. 먼저 엑셀을 업로드해 주세요."
          );

          return false;
        }

        setSaving(true);

        try {
          const now =
            new Date();

          const savedAtMillis =
            now.getTime();

          /*
           * 문서 ID = 날짜 (Asia/Seoul 기준)
           * → 같은 날 다시 저장하면 이 문서를 덮어씁니다.
           */
          const snapshotId =
            `snap_${formatDateKey(
              savedAtMillis
            )}`;

          const cleanedRows =
            rows.map(
              sanitizeRowForSave
            );

          let totalOriginal = 0;
          let totalPaid = 0;
          let totalBalance = 0;
          let unpaidCount = 0;
          let partialCount = 0;
          let paidCount = 0;
          let waterCutCount = 0;

          cleanedRows.forEach(
            (row) => {
              totalOriginal +=
                row.totalUnpaid;

              totalPaid +=
                row.actualPaid;

              totalBalance +=
                row.balance;

              if (
                row.status ===
                "paid"
              ) {
                paidCount += 1;
              } else if (
                row.status ===
                "partial"
              ) {
                partialCount += 1;
              } else {
                unpaidCount += 1;
              }

              if (
                row.waterCut
              ) {
                waterCutCount += 1;
              }
            }
          );

          await setDoc(
            doc(
              db,
              SNAPSHOT_COLLECTION,
              snapshotId
            ),
            {
              savedAtMillis,

              savedAt:
                serverTimestamp(),

              rows:
                cleanedRows,

              summary: {
                totalCount:
                  cleanedRows.length,

                unpaidCount,

                partialCount,

                paidCount,

                waterCutCount,

                totalOriginal,

                totalPaid,

                totalBalance,
              },

              sourceFile:
                lastSourceFileRef.current ||
                "",
            }
          );

          setIsDirty(false);

          setCurrentSnapshotLabel(
            `${formatDateTime(
              savedAtMillis
            )} 저장분`
          );

          alert(
            "현재 미납관리 내용을 저장했습니다."
          );

          return true;
        } catch (error) {
          console.error(
            "미납관리 저장 오류:",
            error
          );

          alert(
            "저장하지 못했습니다."
          );

          return false;
        } finally {
          setSaving(false);
        }
      },
      [rows]
    );


  /*
   * 문서 전역 클릭 감시(useEffect, 최초 1회 등록) 안에서도
   * 항상 "최신" saveSnapshot 을 호출할 수 있도록 ref로 보관
   */
  const saveSnapshotRef =
    useRef(saveSnapshot);

  useEffect(
    () => {
      saveSnapshotRef.current =
        saveSnapshot;
    },
    [saveSnapshot]
  );


  /* =======================================================
     저장하지 않은 변경사항 확인 팝업 공통 처리
  ======================================================= */

  const askUnsavedConfirm =
    (
      onProceed
    ) => {
      setConfirmModal({
        onSaveAndProceed:
          async () => {
            setConfirmModal(
              null
            );

            const ok =
              await saveSnapshotRef.current();

            if (ok) {
              onProceed();
            }
          },

        onDiscardAndProceed:
          () => {
            setConfirmModal(
              null
            );

            setIsDirty(
              false
            );

            onProceed();
          },

        onCancel:
          () =>
            setConfirmModal(
              null
            ),
      });
    };


  /* =======================================================
     브라우저 새로고침 / 닫기 / 다른 주소 이동 경고
  ======================================================= */

  useEffect(
    () => {
      const handleBeforeUnload =
        (
          event
        ) => {
          if (
            !isDirtyRef.current
          ) {
            return;
          }

          event.preventDefault();

          event.returnValue =
            "";
        };

      window.addEventListener(
        "beforeunload",
        handleBeforeUnload
      );

      return () =>
        window.removeEventListener(
          "beforeunload",
          handleBeforeUnload
        );
    },
    []
  );


  /* =======================================================
     페이지 안에서 다른 메뉴 / 다른 페이지로 이동 시도 감지

     - 미납관리 화면(pageRootRef) 바깥의 링크/버튼 클릭을 감지해서
       저장하지 않은 변경사항이 있으면 먼저 확인 팝업을 띄웁니다.
     - 이 페이지의 라우팅 구조를 알 수 없어 일반적인 방식(캡처 단계 클릭 감지)으로
       처리했습니다. 사용 중인 메뉴 이동 방식에 따라 동작이 다를 수 있다면 알려주세요.
  ======================================================= */

  useEffect(
    () => {
      const handleDocumentClick =
        (
          event
        ) => {
          if (
            !isDirtyRef.current
          ) {
            return;
          }

          const rootElement =
            pageRootRef.current;

          const target =
            event.target;

          if (
            rootElement &&
            rootElement.contains(
              target
            )
          ) {
            return;
          }

          const navElement =
            target?.closest?.(
              "a[href], button, [role='button'], [data-nav-item]"
            );

          if (
            !navElement
          ) {
            return;
          }

          if (
            rootElement &&
            rootElement.contains(
              navElement
            )
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          setConfirmModal({
            onSaveAndProceed:
              async () => {
                setConfirmModal(
                  null
                );

                const ok =
                  await saveSnapshotRef.current();

                if (ok) {
                  isDirtyRef.current =
                    false;

                  navElement.click();
                }
              },

            onDiscardAndProceed:
              () => {
                setConfirmModal(
                  null
                );

                setIsDirty(
                  false
                );

                isDirtyRef.current =
                  false;

                navElement.click();
              },

            onCancel:
              () =>
                setConfirmModal(
                  null
                ),
          });
        };

      document.addEventListener(
        "click",
        handleDocumentClick,
        true
      );

      return () =>
        document.removeEventListener(
          "click",
          handleDocumentClick,
          true
        );
    },
    []
  );


  /* =======================================================
     불러오기 팝업 열기 / 목록 조회
  ======================================================= */

  const fetchSnapshotList =
    async () => {
      setSnapshotListLoading(
        true
      );

      try {
        const snapshotQuery =
          query(
            collection(
              db,
              SNAPSHOT_COLLECTION
            ),
            orderBy(
              "savedAtMillis",
              "desc"
            ),
            limit(
              SNAPSHOT_LIST_LIMIT
            )
          );

        const snap =
          await getDocs(
            snapshotQuery
          );

        const list =
          snap.docs.map(
            (
              documentSnapshot
            ) => {
              const data =
                documentSnapshot.data();

              /*
               * 목록의 전체/미납/단수/잔액은 저장 당시 통계(data.summary)가 아니라
               * "3개월 이상 미납" 기준으로 다시 계산해서 표시합니다.
               */
              const summary =
                summarizeRowsFor3PlusMonths(
                  data.rows ||
                    []
                );

              return {
                id:
                  documentSnapshot.id,

                savedAtMillis:
                  data.savedAtMillis,

                summary,

                sourceFile:
                  data.sourceFile ||
                  "",

                rows:
                  data.rows ||
                  [],
              };
            }
          );

        setSnapshotList(
          list
        );
      } catch (error) {
        console.error(
          "미납관리 저장목록 조회 오류:",
          error
        );

        alert(
          "저장된 목록을 불러오지 못했습니다."
        );
      } finally {
        setSnapshotListLoading(
          false
        );
      }
    };


  const openLoadModal =
    () => {
      const proceed =
        () => {
          setLoadModalOpen(
            true
          );

          fetchSnapshotList();
        };

      if (
        isDirtyRef.current
      ) {
        askUnsavedConfirm(
          proceed
        );
      } else {
        proceed();
      }
    };


  const handleSelectSnapshot =
    (
      item
    ) => {
      const proceed =
        () => {
          applyLoadedRows(
            item.rows,
            item.savedAtMillis
          );

          lastSourceFileRef.current =
            item.sourceFile ||
            "";

          setIsDirty(
            false
          );

          setLoadModalOpen(
            false
          );
        };

      if (
        isDirtyRef.current
      ) {
        askUnsavedConfirm(
          proceed
        );
      } else {
        proceed();
      }
    };


  /* =======================================================
     저장 자료 삭제 (불러오기 목록에서)
  ======================================================= */

  const handleDeleteSnapshot =
    async (
      event,
      item
    ) => {
      event.stopPropagation();

      const confirmed =
        window.confirm(
          [
            `${formatDateOnly(
              item.savedAtMillis
            )} 저장분을 삭제하시겠습니까?`,
            "",
            "삭제한 저장자료는 복구할 수 없습니다.",
          ].join("\n")
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        await deleteDoc(
          doc(
            db,
            SNAPSHOT_COLLECTION,
            item.id
          )
        );

        setSnapshotList(
          (
            current
          ) =>
            current.filter(
              (row) =>
                row.id !==
                item.id
            )
        );
      } catch (error) {
        console.error(
          "미납관리 저장자료 삭제 오류:",
          error
        );

        alert(
          "삭제하지 못했습니다."
        );
      }
    };


  /* =======================================================
     Excel 업로드 버튼
  ======================================================= */

  const openExcel =
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
     Excel 업로드

     - 업로드하면 화면에 표시 중이던 이전 내용은 사라지고
       새로 업로드한 내용으로 교체됩니다.
     - 이 시점에는 아직 Firestore에 저장되지 않으며,
       [저장] 버튼을 눌러야 날짜/시간별로 저장됩니다.
     - 이전에 마지막으로 저장했던 내용은 [불러오기] 목록에 그대로 남아있습니다.
  ======================================================= */

  const handleExcelUpload =
    async (
      event
    ) => {
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
          "xls",
          "xlsx",
          "xlsm",
        ].includes(
          extension
        )
      ) {
        alert(
          "엑셀 파일(.xls, .xlsx)만 업로드할 수 있습니다."
        );

        return;
      }


      setUploading(
        true
      );


      try {
        const workbook =
          await readWorkbookFromFile(
            file
          );


        const imported =
          parseExcelWorkbook(
            workbook
          );


        if (
          imported.length ===
          0
        ) {
          alert(
            [
              "엑셀에서 미납관리 자료를 찾지 못했습니다.",
              "",
              "확인 기준",
              "A열 : 코드번호-호수",
              "C열 : 2026_08 형식의 미납월",
              "H열 : 연체료 포함 미납금액",
            ].join("\n")
          );

          return;
        }


        const importedRows =
          sortRows(
            imported.map(
              (importedRow) => {
                const payment =
                  calculatePayment(
                    importedRow.totalUnpaid,
                    0
                  );

                return {
                  ...importedRow,

                  actualPaid:
                    payment.paid,

                  balance:
                    payment.balance,

                  status:
                    payment.status,

                  waterCut:
                    false,

                  note:
                    "",
                };
              }
            )
          );


        lastSourceFileRef.current =
          file.name;


        setRows(
          importedRows
        );

        setIsDirty(
          true
        );

        setCurrentSnapshotLabel(
          "엑셀 업로드됨 (아직 저장 전)"
        );


        alert(
          [
            "엑셀 파일을 불러왔습니다.",
            "",
            `세대 수 : ${importedRows.length}곳`,
            `엑셀 시트 : ${workbook.SheetNames.length}개`,
            "",
            "화면 하단이 아닌 상단의 [저장] 버튼을 눌러야",
            "오늘 날짜/시간으로 최종 저장됩니다.",
          ].join("\n")
        );
      } catch (error) {
        console.error(
          "미납관리 Excel 업로드 오류:",
          error
        );

        alert(
          [
            "엑셀 파일을 처리하는 중 오류가 발생했습니다.",
            "",
            error?.message ||
              "",
          ].join("\n")
        );
      } finally {
        setUploading(
          false
        );
      }
    };


  /* =======================================================
     로컬 행 수정
  ======================================================= */

  const updateLocalRow =
    (
      id,
      values
    ) => {
      setRows(
        (
          current
        ) =>
          current.map(
            (row) =>
              row.id ===
              id
                ? {
                    ...row,
                    ...values,
                  }
                : row
          )
      );

      setIsDirty(
        true
      );
    };


  /* =======================================================
     실제 입금액 입력

     (입력은 화면에서만 즉시 반영되며,
      Firestore에는 [저장] 버튼을 눌러야 반영됩니다)
  ======================================================= */

  const handlePaidChange =
    (
      row,
      value
    ) => {
      const actualPaid =
        onlyNumber(
          value
        );


      const payment =
        calculatePayment(
          row.totalUnpaid,
          actualPaid
        );


      updateLocalRow(
        row.id,
        {
          actualPaid:
            payment.paid,

          balance:
            payment.balance,

          status:
            payment.status,

          ...buildStatusDatePatch(
            row,
            payment.status
          ),
        }
      );
    };


  /* =======================================================
     실제 입금액 입력 - 임시값 처리

     숫자를 한 글자씩 입력할 때마다 바로 반영되면
     중간 입력값(예: "5")이 부분납부로 잘못 표시되므로,
     입력 중에는 임시값(paidDrafts)에만 저장해 두었다가
     엔터를 누르거나 입력창에서 포커스가 빠져나갈 때(다 입력을 마쳤을 때)
     비로소 실제 값(actualPaid/상태)에 반영합니다.
  ======================================================= */

  const handlePaidInputChange =
    (
      row,
      value
    ) => {
      setPaidDrafts(
        (
          current
        ) => ({
          ...current,
          [row.id]:
            value,
        })
      );
    };


  const commitPaidDraft =
    (
      row
    ) => {
      const draftValue =
        paidDrafts[
          row.id
        ];

      if (
        draftValue ===
        undefined
      ) {
        return;
      }

      handlePaidChange(
        row,
        draftValue
      );

      setPaidDrafts(
        (
          current
        ) => {
          if (
            !(
              row.id in
              current
            )
          ) {
            return current;
          }

          const next =
            {
              ...current,
            };

          delete next[
            row.id
          ];

          return next;
        }
      );
    };


  const handlePaidKeyDown =
    (
      row,
      event
    ) => {
      if (
        event.key ===
        "Enter"
      ) {
        event.preventDefault();

        commitPaidDraft(
          row
        );

        event.target.blur();
      }
    };


  /* =======================================================
     상태 드롭다운 변경 (화면에서만 즉시 반영)
  ======================================================= */

  const handleStatusChange =
    (
      row,
      value
    ) => {
      updateLocalRow(
        row.id,
        {
          status:
            value,

          ...buildStatusDatePatch(
            row,
            value
          ),
        }
      );

      setOpenStatusRowId(
        null
      );
    };


  /* =======================================================
     단수 상태 변경 (화면에서만 즉시 반영)

     - 단수 체크(켜기) : 시작일만 기록해 둡니다.
     - 단수 해제(끄기) : 시작일 ~ 오늘(해제일)을 "M/D 단수 ~ M/D 해제"
       형태로 비고 맨 앞에 추가합니다. (이미 비고 내용이 있으면 그 앞에 붙임)
       이후에는 비고에서 자유롭게 수정/삭제할 수 있습니다.
  ======================================================= */

  const toggleWaterCut =
    (
      row
    ) => {
      const now =
        new Date();

      if (
        !row.waterCut
      ) {
        updateLocalRow(
          row.id,
          {
            waterCut:
              true,

            waterCutStartDate:
              now.getTime(),
          }
        );

        return;
      }

      const startLabel =
        row.waterCutStartDate
          ? formatMonthDay(
              new Date(
                row.waterCutStartDate
              )
            )
          : formatMonthDay(
              now
            );

      const endLabel =
        formatMonthDay(
          now
        );

      const stampText = `[${startLabel} 단수 ~ ${endLabel} 해제] `;

      const existingNote =
        row.note ||
        "";

      const nextNote =
        existingNote
          ? `${stampText}${existingNote}`
          : stampText.trim();

      updateLocalRow(
        row.id,
        {
          waterCut:
            false,

          waterCutStartDate:
            null,

          note:
            nextNote,
        }
      );
    };


  /* =======================================================
     비고 (화면에서만 즉시 반영)
  ======================================================= */

  const handleNoteChange =
    (
      row,
      value
    ) => {
      updateLocalRow(
        row.id,
        {
          note:
            value,
        }
      );
    };


  /* =======================================================
     삭제 (목록에서 제외 - 저장을 눌러야 최종 반영)
  ======================================================= */

  const deleteRow =
    (
      row
    ) => {
      const confirmed =
        window.confirm(
          [
            `${row.villaName} ${row.room}호`,
            "",
            "목록에서 제외하시겠습니까?",
            "([저장] 버튼을 눌러야 최종 반영됩니다)",
          ].join("\n")
        );


      if (
        !confirmed
      ) {
        return;
      }


      setRows(
        (
          current
        ) =>
          current.filter(
            (item) =>
              item.id !==
              row.id
          )
      );

      setIsDirty(
        true
      );
    };


  /* =======================================================
     단수리스트 팝업 열기

     - 번호를 클릭해 선택해 둔 행이 있어야만 열립니다.
     - 선택된 행들을 주소에 포함된 구 이름(서구/중구/동구/대덕구/유성구)
       기준으로 나눠 담습니다. (구 이름을 찾지 못하면 "기타")
  ======================================================= */

  const openWaterListModal =
    () => {
      if (
        selectedRowIds.size ===
        0
      ) {
        alert(
          "번호를 클릭해서 단수리스트에 표시할 목록을 먼저 선택해 주세요."
        );

        return;
      }

      const groups =
        {};

      [
        ...GU_LIST,
        GU_FALLBACK,
      ].forEach(
        (gu) => {
          groups[
            gu
          ] = [];
        }
      );

      rows.forEach(
        (row) => {
          if (
            !selectedRowIds.has(
              row.id
            )
          ) {
            return;
          }

          const gu =
            extractGu(
              row.address
            );

          groups[
            gu
          ].push(
            row
          );
        }
      );

      setWaterListGroups(
        groups
      );

      setExpandedGuSet(
        new Set([
          ...GU_LIST,
          GU_FALLBACK,
        ])
      );

      setWaterListModalOpen(
        true
      );
    };


  /* =======================================================
     단수리스트 - 마우스 드래그로 순서/구 이동

     HTML5 드래그 앤 드롭을 사용합니다.
     (드래그 중인 항목의 출발 위치만 ref로 기억해 두었다가
      놓는 위치에 맞춰 waterListGroups를 다시 구성합니다)
  ======================================================= */

  const handleWaterItemDragStart =
    (
      gu,
      index
    ) =>
      (
        event
      ) => {
        dragSourceRef.current =
          {
            gu,
            index,
          };

        event.dataTransfer.effectAllowed =
          "move";
      };


  const handleWaterItemDragOver =
    (
      event
    ) => {
      event.preventDefault();

      event.dataTransfer.dropEffect =
        "move";
    };


  const moveDraggedItem =
    (
      targetGu,
      targetIndex
    ) => {
      const source =
        dragSourceRef.current;

      if (
        !source
      ) {
        return;
      }

      setWaterListGroups(
        (
          current
        ) => {
          const next =
            {};

          Object.keys(
            current
          ).forEach(
            (key) => {
              next[
                key
              ] = [
                ...current[
                  key
                ],
              ];
            }
          );

          const sourceList =
            next[
              source.gu
            ] ||
            [];

          const [moved] =
            sourceList.splice(
              source.index,
              1
            );

          if (
            !moved
          ) {
            return current;
          }

          const targetList =
            next[
              targetGu
            ] ||
            [];

          let insertIndex =
            targetIndex ===
            undefined
              ? targetList.length
              : targetIndex;

          if (
            source.gu ===
              targetGu &&
            source.index <
              insertIndex
          ) {
            insertIndex -= 1;
          }

          targetList.splice(
            insertIndex,
            0,
            moved
          );

          return next;
        }
      );

      dragSourceRef.current =
        null;
    };


  const handleWaterItemDrop =
    (
      gu,
      index
    ) =>
      (
        event
      ) => {
        event.preventDefault();
        event.stopPropagation();

        moveDraggedItem(
          gu,
          index
        );
      };


  const handleWaterGroupDrop =
    (
      gu
    ) =>
      (
        event
      ) => {
        event.preventDefault();

        moveDraggedItem(
          gu,
          undefined
        );
      };


  /* =======================================================
     단수리스트 - 이미지로 저장

     팝업의 버튼/헤더는 제외하고, 구별 목록 영역만
     캡쳐해서 PNG 이미지로 다운로드합니다.
  ======================================================= */

  const handleSaveWaterListImage =
    async () => {
      const confirmed =
        window.confirm(
          "단수리스트 내용을 이미지로 저장하시겠습니까?"
        );

      if (
        !confirmed
      ) {
        return;
      }

      const target =
        waterListCaptureRef.current;

      const modalEl =
        waterModalRef.current;

      if (
        !target
      ) {
        return;
      }

      /*
       * 이미지에는 접혀있는 구도 전부 펼쳐진 상태로,
       * 스크롤에 가려지는 부분 없이 전체 내용이 보여야 하므로
       * - 모든 구를 펼치고
       * - 팝업/목록 영역의 높이 제한(overflow, max-height)을
       *   캡쳐 직전에만 잠시 풀어두었다가, 캡쳐 후 원래대로 되돌립니다.
       */
      const previousExpanded =
        expandedGuSet;

      const previousModalMaxHeight =
        modalEl?.style.maxHeight;

      const previousModalOverflow =
        modalEl?.style.overflow;

      const previousTargetMaxHeight =
        target.style.maxHeight;

      const previousTargetOverflow =
        target.style.overflow;

      setExpandedGuSet(
        new Set([
          ...GU_LIST,
          GU_FALLBACK,
        ])
      );

      if (
        modalEl
      ) {
        modalEl.style.maxHeight =
          "none";

        modalEl.style.overflow =
          "visible";
      }

      target.style.maxHeight =
        "none";

      target.style.overflow =
        "visible";

      /*
       * setExpandedGuSet / 스타일 변경이 화면에 실제로
       * 반영(리렌더 + 레이아웃 재계산)되기를 두 프레임 기다립니다.
       */
      await new Promise(
        (
          resolve
        ) =>
          requestAnimationFrame(
            () =>
              requestAnimationFrame(
                resolve
              )
          )
      );

      try {
        const canvas =
          await html2canvas(
            target,
            {
              backgroundColor:
                "#ffffff",
              scale: 2,
              width:
                target.scrollWidth,
              height:
                target.scrollHeight,
              windowWidth:
                target.scrollWidth,
              windowHeight:
                target.scrollHeight,
            }
          );

        const dataUrl =
          canvas.toDataURL(
            "image/png"
          );

        const link =
          document.createElement(
            "a"
          );

        link.href =
          dataUrl;

        link.download = `단수리스트_${formatDateKey(
          Date.now()
        )}.png`;

        link.click();
      } catch (error) {
        console.error(
          "단수리스트 이미지 저장 오류:",
          error
        );

        alert(
          "이미지로 저장하지 못했습니다."
        );
      } finally {
        if (
          modalEl
        ) {
          modalEl.style.maxHeight =
            previousModalMaxHeight ||
            "";

          modalEl.style.overflow =
            previousModalOverflow ||
            "";
        }

        target.style.maxHeight =
          previousTargetMaxHeight ||
          "";

        target.style.overflow =
          previousTargetOverflow ||
          "";

        setExpandedGuSet(
          previousExpanded
        );
      }
    };


  /* =======================================================
     상단 개월수 드롭다운(1개월 / 2개월 / 3개월 이상) 기준 행 목록

     - 요약 박스 6개, 검색창 우측 미납금액/입금/잔액 요약이
       전부 이 목록을 기준으로 계산됩니다.
     - 상태필터/검색어와는 무관하게 "개월수 드롭다운" 값만 반영합니다.
  ======================================================= */

  const monthFilteredRows =
    useMemo(
      () =>
        rows.filter(
          (row) => {
            const unpaidCount =
              row.unpaidCount ||
              0;

            if (
              monthFilter ===
              "1"
            ) {
              return (
                unpaidCount ===
                1
              );
            }

            if (
              monthFilter ===
              "2"
            ) {
              return (
                unpaidCount ===
                2
              );
            }

            if (
              monthFilter ===
              "3+"
            ) {
              return (
                unpaidCount >=
                3
              );
            }

            return true;
          }
        ),
      [
        rows,
        monthFilter,
      ]
    );


  /* =======================================================
     통계 (개월수 드롭다운 기준)
  ======================================================= */

  const stats =
    useMemo(
      () => {
        let unpaidCount =
          0;

        let partialCount =
          0;

        let paidCount =
          0;

        let waterCutCount =
          0;

        let totalOriginal =
          0;

        let totalPaid =
          0;

        let totalBalance =
          0;


        monthFilteredRows.forEach(
          (row) => {
            if (
              row.status ===
              "paid"
            ) {
              paidCount +=
                1;
            } else if (
              row.status ===
              "partial"
            ) {
              partialCount +=
                1;
            } else {
              unpaidCount +=
                1;
            }


            if (
              row.waterCut
            ) {
              waterCutCount +=
                1;
            }


            totalOriginal +=
              onlyNumber(
                row.totalUnpaid
              );

            totalPaid +=
              onlyNumber(
                row.actualPaid
              );

            totalBalance +=
              onlyNumber(
                row.balance
              );
          }
        );


        return {
          totalCount:
            monthFilteredRows.length,

          unpaidCount,

          partialCount,

          paidCount,

          waterCutCount,

          totalOriginal,

          totalPaid,

          totalBalance,
        };
      },
      [monthFilteredRows]
    );


  /* =======================================================
     검색 + 필터
  ======================================================= */

  const filteredRows =
    useMemo(
      () => {
        const keyword =
          cleanText(
            search
          ).toLowerCase();


        return rows.filter(
          (row) => {
            if (
              statusFilter !==
                "all" &&
              row.status !==
                statusFilter
            ) {
              return false;
            }


            const unpaidCount =
              row.unpaidCount ||
              0;

            if (
              monthFilter ===
                "1" &&
              unpaidCount !==
                1
            ) {
              return false;
            }

            if (
              monthFilter ===
                "2" &&
              unpaidCount !==
                2
            ) {
              return false;
            }

            if (
              monthFilter === "3+" &&
              unpaidCount < 3
            ) {
              return false;
            }


            if (
              !keyword
            ) {
              return true;
            }


            const monthText =
              (
                row.unpaidMonths ||
                []
              )
                .map(
                  (item) =>
                    `${item.key} ${item.label} ${item.amount}`
                )
                .join(" ");


            const searchText =
              [
                row.code,
                row.room,
                row.villaName,
                row.address,
                row.tenantName,
                row.phone,
                monthText,
                row.totalUnpaid,
                row.actualPaid,
                row.balance,
                row.note,
              ]
                .join(" ")
                .toLowerCase();


            return searchText.includes(
              keyword
            );
          }
        );
      },
      [
        rows,
        search,
        statusFilter,
        monthFilter,
      ]
    );


  /*
   * 미납내역 팝업에 표시할 행 (열려있는 경우에만)
   */
  const openDetailRow =
    useMemo(
      () =>
        openDetailRowId
          ? filteredRows.find(
              (item) =>
                item.id ===
                openDetailRowId
            )
          : null,
      [
        filteredRows,
        openDetailRowId,
      ]
    );


  /*
   * 상태 선택 팝업에 표시할 행 (열려있는 경우에만)
   */
  const openStatusRow =
    useMemo(
      () =>
        openStatusRowId
          ? filteredRows.find(
              (item) =>
                item.id ===
                openStatusRowId
            )
          : null,
      [
        filteredRows,
        openStatusRowId,
      ]
    );


  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div
      className="unpaid-page"
      ref={pageRootRef}
    >

      {/* ===============================================
          Excel hidden input
      =============================================== */}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xls,.xlsx,.xlsm"
        className="unpaid-hidden-file"
        onChange={
          handleExcelUpload
        }
      />


      {/* ===============================================
          HEADER
      =============================================== */}

      <div className="unpaid-header">

        <div className="unpaid-title-group">

          <div className="unpaid-title-icon">
            <FiFileText />
          </div>

          <div>
            <h2>
              미납관리
            </h2>

            <p>
              관리비 미납 현황과 입금,
              잔액 및 단수 상태를 관리합니다.

              {currentSnapshotLabel && (
                <span className="unpaid-current-label">
                  {" "}
                  · 표시중 : {currentSnapshotLabel}
                </span>
              )}

              {isDirty && (
                <span className="unpaid-dirty-label">
                  {" "}
                  · 저장되지 않은 변경사항이 있습니다
                </span>
              )}

              {selectedRowIds.size >
                0 && (
                <span className="unpaid-selected-label">
                  {" "}
                  · 선택됨 {selectedRowIds.size}건
                  <button
                    type="button"
                    className="unpaid-selected-clear"
                    onClick={() =>
                      setSelectedRowIds(
                        new Set()
                      )
                    }
                  >
                    선택 해제
                  </button>
                </span>
              )}
            </p>
          </div>

        </div>


        <div className="unpaid-header-actions">

          <div className="unpaid-month-filter-wrap">

            <select
              className="unpaid-month-filter"
              value={
                monthFilter
              }
              onChange={(
                event
              ) =>
                setMonthFilter(
                  event.target.value
                )
              }
            >
              {MONTH_FILTERS.map(
                (option) => (
                  <option
                    key={
                      option.value
                    }
                    value={
                      option.value
                    }
                  >
                    {option.label}
                  </option>
                )
              )}
            </select>

            <FiChevronDown />

          </div>


          <button
            type="button"
            className={`unpaid-btn unpaid-btn-save ${
              isDirty
                ? "has-changes"
                : ""
            }`}
            onClick={() =>
              saveSnapshot()
            }
            disabled={
              saving
            }
          >
            <FiSave />

            {saving
              ? "저장 중..."
              : "저장"}

            {isDirty &&
              !saving && (
                <span className="unpaid-save-dot" />
              )}
          </button>


          <button
            type="button"
            className="unpaid-btn unpaid-btn-load"
            onClick={
              openLoadModal
            }
          >
            <FiFolder />

            불러오기
          </button>


          <button
            type="button"
            className="unpaid-btn unpaid-btn-water"
            onClick={
              openWaterListModal
            }
          >
            <FiDroplet />

            단수리스트
          </button>


          <button
            type="button"
            className="unpaid-btn unpaid-btn-upload"
            onClick={
              openExcel
            }
            disabled={
              uploading
            }
          >
            <FiUploadCloud />

            {uploading
              ? "업로드 중..."
              : "엑셀 업로드"}
          </button>

        </div>

      </div>


      {/* ===============================================
          SUMMARY
      =============================================== */}

      <div className="unpaid-summary">

        <button
          type="button"
          className="unpaid-summary-card unpaid-summary-total"
          onClick={() =>
            setStatusFilter(
              "all"
            )
          }
        >
          <div className="unpaid-summary-icon">
            <FiUsers />
          </div>

          <div>
            <span>
              전체 미납관리
            </span>

            <strong>
              {stats.totalCount}
              <small>
                세대
              </small>
            </strong>
          </div>
        </button>


        <button
          type="button"
          className="unpaid-summary-card unpaid-summary-unpaid"
          onClick={() =>
            setStatusFilter(
              "unpaid"
            )
          }
        >
          <div className="unpaid-summary-icon">
            <FiAlertCircle />
          </div>

          <div>
            <span>
              미납
            </span>

            <strong>
              {stats.unpaidCount}
              <small>
                세대
              </small>
            </strong>
          </div>
        </button>


        <button
          type="button"
          className="unpaid-summary-card unpaid-summary-partial"
          onClick={() =>
            setStatusFilter(
              "partial"
            )
          }
        >
          <div className="unpaid-summary-icon">
            <FiDollarSign />
          </div>

          <div>
            <span>
              부분납부
            </span>

            <strong>
              {stats.partialCount}
              <small>
                세대
              </small>
            </strong>
          </div>
        </button>


        <button
          type="button"
          className="unpaid-summary-card unpaid-summary-paid"
          onClick={() =>
            setStatusFilter(
              "paid"
            )
          }
        >
          <div className="unpaid-summary-icon">
            <FiCheckCircle />
          </div>

          <div>
            <span>
              완납
            </span>

            <strong>
              {stats.paidCount}
              <small>
                세대
              </small>
            </strong>
          </div>
        </button>


        <div className="unpaid-summary-card unpaid-summary-water">
          <div className="unpaid-summary-icon">
            <FiDroplet />
          </div>

          <div>
            <span>
              단수 조치
            </span>

            <strong>
              {stats.waterCutCount}
              <small>
                세대
              </small>
            </strong>
          </div>
        </div>


        <div className="unpaid-summary-card unpaid-summary-balance">
          <div className="unpaid-summary-icon">
            <FiDollarSign />
          </div>

          <div>
            <span>
              총 미납 잔액
            </span>

            <strong>
              {formatMoney(
                stats.totalBalance
              )}
              <small>
                원
              </small>
            </strong>
          </div>
        </div>

      </div>


      {/* ===============================================
          TOOLBAR
      =============================================== */}

      <div className="unpaid-toolbar">

        <div className="unpaid-filter-select-wrap">

          <select
            className="unpaid-filter-select"
            value={
              statusFilter
            }
            onChange={(
              event
            ) =>
              setStatusFilter(
                event.target.value
              )
            }
          >
            {STATUS_FILTERS.map(
              (option) => (
                <option
                  key={
                    option.value
                  }
                  value={
                    option.value
                  }
                >
                  {option.label}
                </option>
              )
            )}
          </select>

          <FiChevronDown />

        </div>


        <div className="unpaid-search">

          <FiSearch />

          <input
            type="text"
            value={
              search
            }
            placeholder="코드번호, 빌라명, 호수, 이름, 연락처, 주소 검색"
            onChange={(
              event
            ) =>
              setSearch(
                event.target.value
              )
            }
          />

          {search && (
            <button
              type="button"
              onClick={() =>
                setSearch("")
              }
            >
              <FiX />
            </button>
          )}

        </div>


        <div className="unpaid-toolbar-right">

          <div className="unpaid-toolbar-count">
            검색결과

            <strong>
              {
                filteredRows.length
              }
            </strong>

            건
          </div>


          <div className="unpaid-toolbar-summary">

            <span>
              원 미납금액
              <strong>
                {formatMoney(
                  stats.totalOriginal
                )}
                원
              </strong>
            </span>

            <span className="paid">
              실제 입금
              <strong>
                {formatMoney(
                  stats.totalPaid
                )}
                원
              </strong>
            </span>

            <span className="balance">
              남은 미납
              <strong>
                {formatMoney(
                  stats.totalBalance
                )}
                원
              </strong>
            </span>

          </div>

        </div>

      </div>


      {/* ===============================================
          TABLE
      =============================================== */}

      <div className="unpaid-table-card">

        <div className="unpaid-table-scroll">

          <table className="unpaid-table">

            <thead>
              <tr>
                <th className="col-no">
                  번호
                </th>

                <th className="col-unit">
                  세대정보
                </th>

                <th className="col-address">
                  주소
                </th>

                <th className="col-contact">
                  이름 / 연락처
                </th>

                <th className="col-detail">
                  미납내역
                </th>

                <th className="col-total">
                  총 미납금액
                </th>

                <th className="col-paid">
                  실제 입금액
                </th>

                <th className="col-status">
                  상태
                </th>

                <th className="col-balance">
                  미납 잔액
                </th>

                <th className="col-water">
                  단수
                </th>

                <th className="col-note">
                  비고
                </th>

                <th className="col-delete">
                  관리
                </th>
              </tr>
            </thead>


            <tbody>

              {loading && (
                <tr>
                  <td
                    colSpan="12"
                    className="unpaid-empty"
                  >
                    미납 자료를 불러오는 중입니다.
                  </td>
                </tr>
              )}


              {!loading &&
                filteredRows.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan="12"
                      className="unpaid-empty"
                    >
                      <FiFileText />

                      <strong>
                        표시할 미납자료가 없습니다.
                      </strong>

                      <span>
                        엑셀 업로드 버튼으로 미납관리 자료를 등록하고,
                        상단의 [저장] 버튼을 눌러 저장해 주세요.
                      </span>
                    </td>
                  </tr>
                )}


              {!loading &&
                filteredRows.map(
                  (
                    row,
                    index
                  ) => {

                    return (
                      <tr
                        key={
                          row.id
                        }
                        className={
                          [
                            row.waterCut
                              ? "is-water-cut"
                              : "",
                            selectedRowIds.has(
                              row.id
                            )
                              ? "is-row-selected"
                              : "",
                          ]
                            .join(
                              " "
                            )
                            .trim()
                        }
                      >

                        <td
                          className={`cell-center cell-index ${
                            selectedRowIds.has(
                              row.id
                            )
                              ? "is-selected"
                              : ""
                          }`}
                          onClick={() =>
                            toggleRowSelected(
                              row.id
                            )
                          }
                          title="클릭해서 선택 / 선택 해제 (단수리스트에 사용)"
                        >
                          {index + 1}
                        </td>


                        <td>
                          <div className="unpaid-unit-cell">
                            <span className="unpaid-code">
                              {row.code}
                            </span>

                            <div className="unpaid-unit-name-line">
                              <strong className="unpaid-villa-name">
                                {row.villaName ||
                                  "-"}
                              </strong>

                              <span className="unpaid-room">
                                {row.room}
                                호
                              </span>
                            </div>
                          </div>
                        </td>


                        <td
                          className="unpaid-address-cell"
                          title={
                            row.address ||
                            ""
                          }
                        >
                          {row.address ||
                            "-"}
                        </td>


                        <td>
                          <div className="unpaid-contact-cell">
                            <strong>
                              {row.tenantName ||
                                "-"}
                            </strong>

                            <span>
                              {row.phone ||
                                "-"}
                            </span>
                          </div>
                        </td>


                        <td>
                          <div className="unpaid-detail-cell">

                            <button
                              type="button"
                              className="unpaid-count-badge"
                              onClick={(
                                event
                              ) =>
                                toggleRowDetail(
                                  row,
                                  event
                                )
                              }
                            >
                              {row.unpaidCount ||
                                0}
                              개월

                              <FiChevronDown
                                className={
                                  openDetailRowId ===
                                  row.id
                                    ? "is-open"
                                    : ""
                                }
                              />
                            </button>

                          </div>
                        </td>


                        <td className="cell-money cell-total-unpaid">
                          <strong>
                            {formatMoney(
                              row.totalUnpaid
                            )}
                          </strong>

                          <span>
                            원
                          </span>
                        </td>


                        <td>
                          <div
                            className={`unpaid-paid-input-wrap ${
                              row.id in
                              paidDrafts
                                ? "is-editing"
                                : ""
                            }`}
                          >

                            <input
                              type="text"
                              inputMode="numeric"
                              value={
                                row.id in
                                paidDrafts
                                  ? paidDrafts[
                                      row.id
                                    ]
                                  : row.actualPaid
                                  ? formatMoney(
                                      row.actualPaid
                                    )
                                  : ""
                              }
                              placeholder="금액 입력 후 Enter"
                              onChange={(
                                event
                              ) =>
                                handlePaidInputChange(
                                  row,
                                  event.target.value
                                )
                              }
                              onKeyDown={(
                                event
                              ) =>
                                handlePaidKeyDown(
                                  row,
                                  event
                                )
                              }
                              onBlur={() =>
                                commitPaidDraft(
                                  row
                                )
                              }
                            />

                            <span>
                              원
                            </span>

                          </div>
                        </td>


                        <td className="cell-center">

                          <button
                            type="button"
                            className={`unpaid-status-trigger unpaid-status-trigger-${
                              row.status
                            } ${
                              openStatusRowId ===
                              row.id
                                ? "is-open"
                                : ""
                            }`}
                            onClick={(
                              event
                            ) =>
                              toggleStatusPopup(
                                row,
                                event
                              )
                            }
                            title={getStatusTooltip(
                              row
                            )}
                          >
                            <span className="unpaid-status-trigger-dot" />

                            {STATUS_LABELS[
                              row.status
                            ] ||
                              "미납"}

                            <FiChevronDown
                              className={
                                openStatusRowId ===
                                row.id
                                  ? "is-open"
                                  : ""
                              }
                            />
                          </button>

                        </td>


                        <td
                          className={`cell-money unpaid-balance ${
                            row.balance ===
                            0
                              ? "is-zero"
                              : ""
                          }`}
                        >
                          <strong>
                            {formatMoney(
                              row.balance
                            )}
                          </strong>

                          <span>
                            원
                          </span>
                        </td>


                        <td className="cell-center">

                          <button
                            type="button"
                            className={`unpaid-switch ${
                              row.waterCut
                                ? "is-on"
                                : ""
                            }`}
                            onClick={() =>
                              toggleWaterCut(
                                row
                              )
                            }
                            aria-label="단수 상태 변경"
                          >
                            <span className="unpaid-switch-knob" />
                          </button>

                          <span
                            className={`unpaid-water-label ${
                              row.waterCut
                                ? "is-on"
                                : ""
                            }`}
                          >
                            {row.waterCut
                              ? "단수"
                              : "정상"}
                          </span>

                        </td>


                        <td>
                          <textarea
                            className="unpaid-note"
                            value={
                              row.note ||
                              ""
                            }
                            placeholder="연락 내용, 납부 약속, 단수 조치 등"
                            onChange={(
                              event
                            ) =>
                              handleNoteChange(
                                row,
                                event.target.value
                              )
                            }
                          />
                        </td>


                        <td className="cell-center">

                          <button
                            type="button"
                            className="unpaid-delete-btn"
                            onClick={() =>
                              deleteRow(
                                row
                              )
                            }
                            title="목록에서 제외"
                          >
                            <FiTrash2 />
                          </button>

                        </td>

                      </tr>
                    );
                  }
                )}

            </tbody>

          </table>

        </div>

      </div>


      {/* ===============================================
          미납내역 팝업

          - 표 안에서 세로 높이를 늘리지 않고,
            document.body 로 포탈시켜 표 위에 겹쳐서 표시합니다.
      =============================================== */}

      {openDetailRowId &&
        openDetailRow &&
        createPortal(
          <div
            ref={
              detailPopupRef
            }
            className="unpaid-detail-popup"
            style={{
              top: detailPopupPos.top,
              left: detailPopupPos.left,
            }}
          >

            {(
              openDetailRow.unpaidMonths ||
              []
            ).length ===
              0 && (
              <div className="unpaid-detail-popup-empty">
                미납 내역이 없습니다.
              </div>
            )}

            {(
              openDetailRow.unpaidMonths ||
              []
            ).map(
              (
                item
              ) => (
                <div
                  key={
                    item.key
                  }
                  className="unpaid-detail-row"
                >
                  <span>
                    {
                      item.year
                    }
                    .
                    {String(
                      item.month
                    ).padStart(
                      2,
                      "0"
                    )}
                  </span>

                  <strong>
                    {formatMoney(
                      item.amount
                    )}
                    원
                  </strong>
                </div>
              )
            )}

          </div>,
          document.body
        )}


      {/* ===============================================
          상태(미납/부분납부/완납) 선택 팝업

          - 마찬가지로 document.body 로 포탈시켜 표 위에 겹쳐서 표시합니다.
      =============================================== */}

      {openStatusRowId &&
        openStatusRow &&
        createPortal(
          <div
            ref={
              statusPopupRef
            }
            className="unpaid-status-popup"
            style={{
              top: statusPopupPos.top,
              left: statusPopupPos.left,
            }}
          >

            {STATUS_OPTIONS.map(
              (option) => (
                <button
                  key={
                    option.value
                  }
                  type="button"
                  className={`unpaid-status-option unpaid-status-option-${
                    option.value
                  } ${
                    openStatusRow.status ===
                    option.value
                      ? "is-selected"
                      : ""
                  }`}
                  onClick={() =>
                    handleStatusChange(
                      openStatusRow,
                      option.value
                    )
                  }
                >
                  <span className="unpaid-status-option-dot" />

                  <span className="unpaid-status-option-text">
                    <strong>
                      {
                        option.label
                      }
                    </strong>

                    <small>
                      {
                        option.description
                      }
                    </small>
                  </span>

                  {openStatusRow.status ===
                    option.value && (
                    <FiCheckCircle className="unpaid-status-option-check" />
                  )}
                </button>
              )
            )}

          </div>,
          document.body
        )}


      {/* ===============================================
          단수리스트 팝업
      =============================================== */}

      {waterListModalOpen && (
        <div
          className="unpaid-modal-overlay"
          onClick={() =>
            setWaterListModalOpen(
              false
            )
          }
        >
          <div
            className="unpaid-water-modal"
            ref={
              waterModalRef
            }
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >

            <div className="unpaid-water-modal-header">
              <h3>
                <FiDroplet />
                단수리스트
              </h3>

              <div className="unpaid-water-modal-header-actions">

                <button
                  type="button"
                  className="unpaid-water-image-btn"
                  onClick={
                    handleSaveWaterListImage
                  }
                >
                  <FiImage />
                  이미지 저장
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setWaterListModalOpen(
                      false
                    )
                  }
                >
                  <FiX />
                </button>

              </div>
            </div>


            <p className="unpaid-water-modal-guide">
              항목을 마우스로 누른 상태로 위/아래로 끌어서 원하는 구로 옮길 수 있습니다.
            </p>


            <div
              className="unpaid-water-modal-body"
              ref={
                waterListCaptureRef
              }
            >

              {[
                ...GU_LIST,
                GU_FALLBACK,
              ].map(
                (gu) => {
                  const items =
                    waterListGroups[
                      gu
                    ] ||
                    [];

                  if (
                    gu ===
                      GU_FALLBACK &&
                    items.length ===
                      0
                  ) {
                    return null;
                  }

                  const groupTotal =
                    items.reduce(
                      (
                        sum,
                        row
                      ) =>
                        sum +
                        onlyNumber(
                          row.totalUnpaid
                        ),
                      0
                    );

                  const isExpanded =
                    expandedGuSet.has(
                      gu
                    );

                  return (
                    <div
                      key={
                        gu
                      }
                      className="unpaid-water-group"
                      onDragOver={
                        handleWaterItemDragOver
                      }
                      onDrop={handleWaterGroupDrop(
                        gu
                      )}
                    >

                      <button
                        type="button"
                        className="unpaid-water-group-title"
                        onClick={() =>
                          toggleWaterGroupExpand(
                            gu
                          )
                        }
                      >
                        <span className="unpaid-water-group-title-left">
                          <FiChevronDown
                            className={`unpaid-water-group-chevron ${
                              isExpanded
                                ? "is-open"
                                : ""
                            }`}
                          />

                          {gu}
                        </span>

                        <span className="unpaid-water-group-title-right">
                          {
                            items.length
                          }
                          세대 · {formatMoney(
                            groupTotal
                          )}
                          원
                        </span>
                      </button>


                      {isExpanded && (
                        <div className="unpaid-water-group-items">

                          {items.length ===
                            0 && (
                            <div className="unpaid-water-group-empty">
                              이 구역으로 항목을 끌어다 놓으세요
                            </div>
                          )}

                          {items.map(
                            (
                              row,
                              index
                            ) => (
                              <div
                                key={
                                  row.id
                                }
                                className="unpaid-water-item"
                                draggable
                                onDragStart={handleWaterItemDragStart(
                                  gu,
                                  index
                                )}
                                onDragOver={
                                  handleWaterItemDragOver
                                }
                                onDrop={handleWaterItemDrop(
                                  gu,
                                  index
                                )}
                              >

                                <span className="unpaid-water-item-handle">
                                  <FiMove />
                                </span>

                                <div className="unpaid-water-item-main">
                                  <strong>
                                    {row.villaName ||
                                      "-"}{" "}
                                    {row.room}
                                    호
                                  </strong>

                                  <span>
                                    {row.tenantName ||
                                      "-"}{" "}
                                    ·{" "}
                                    {row.phone ||
                                      "-"}
                                  </span>
                                </div>

                                <span className="unpaid-water-item-address">
                                  {row.address ||
                                    "-"}
                                </span>

                                <span className="unpaid-water-item-amount">
                                  {formatMoney(
                                    row.totalUnpaid
                                  )}
                                  원
                                </span>

                              </div>
                            )
                          )}

                        </div>
                      )}

                    </div>
                  );
                }
              )}

            </div>

          </div>
        </div>
      )}


      {/* ===============================================
          불러오기 팝업
      =============================================== */}

      {loadModalOpen && (
        <div
          className="unpaid-modal-overlay"
          onClick={() =>
            setLoadModalOpen(
              false
            )
          }
        >
          <div
            className="unpaid-load-modal"
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >

            <div className="unpaid-load-modal-header">
              <h3>
                <FiFolder />
                저장 자료 불러오기
              </h3>

              <button
                type="button"
                onClick={() =>
                  setLoadModalOpen(
                    false
                  )
                }
              >
                <FiX />
              </button>
            </div>


            <div className="unpaid-load-modal-body">

              {snapshotListLoading && (
                <div className="unpaid-load-empty">
                  불러오는 중입니다...
                </div>
              )}


              {!snapshotListLoading &&
                snapshotList.length ===
                  0 && (
                  <div className="unpaid-load-empty">
                    저장된 자료가 없습니다.
                  </div>
                )}


              {!snapshotListLoading &&
                snapshotList.map(
                  (item) => (
                    <div
                      key={
                        item.id
                      }
                      className="unpaid-load-item"
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        handleSelectSnapshot(
                          item
                        )
                      }
                      onKeyDown={(
                        event
                      ) => {
                        if (
                          event.key ===
                            "Enter" ||
                          event.key ===
                            " "
                        ) {
                          event.preventDefault();

                          handleSelectSnapshot(
                            item
                          );
                        }
                      }}
                    >

                      <div className="unpaid-load-item-main">

                        <div className="unpaid-load-item-date">
                          <FiCalendar />

                          {formatDateOnly(
                            item.savedAtMillis
                          )}
                        </div>


                        <div className="unpaid-load-item-time">
                          <FiClock />

                          {formatTimeOnly(
                            item.savedAtMillis
                          )}{" "}
                          저장
                        </div>

                      </div>


                      <div className="unpaid-load-item-stats">
                        <span>
                          전체{" "}
                          {item
                            .summary
                            .totalCount ||
                            0}
                          세대
                        </span>

                        <span className="is-unpaid">
                          미납{" "}
                          {item
                            .summary
                            .unpaidCount ||
                            0}
                        </span>

                        <span className="is-water">
                          단수{" "}
                          {item
                            .summary
                            .waterCutCount ||
                            0}
                        </span>

                        <span className="is-balance">
                          잔액{" "}
                          {formatMoney(
                            item
                              .summary
                              .totalBalance
                          )}
                          원
                        </span>

                        <span className="unpaid-load-item-note">
                          (3개월 이상 기준)
                        </span>
                      </div>


                      <button
                        type="button"
                        className="unpaid-load-item-delete"
                        onClick={(
                          event
                        ) =>
                          handleDeleteSnapshot(
                            event,
                            item
                          )
                        }
                        title="삭제"
                      >
                        <FiTrash2 />
                      </button>

                    </div>
                  )
                )}

            </div>

          </div>
        </div>
      )}


      {/* ===============================================
          저장하지 않은 변경사항 확인 팝업
      =============================================== */}

      {confirmModal && (
        <div
          className="unpaid-modal-overlay"
          onClick={
            confirmModal.onCancel
          }
        >
          <div
            className="unpaid-confirm-modal"
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >

            <div className="unpaid-confirm-icon">
              <FiAlertTriangle />
            </div>

            <h3>
              저장하지 않은 변경사항이 있습니다
            </h3>

            <p>
              현재 화면의 변경사항을 저장하지 않고 이동하면
              내용이 사라집니다.
            </p>

            <div className="unpaid-confirm-actions">

              <button
                type="button"
                className="unpaid-confirm-btn unpaid-confirm-cancel"
                onClick={
                  confirmModal.onCancel
                }
              >
                취소
              </button>

              <button
                type="button"
                className="unpaid-confirm-btn unpaid-confirm-discard"
                onClick={
                  confirmModal.onDiscardAndProceed
                }
              >
                저장 안 하고 이동
              </button>

              <button
                type="button"
                className="unpaid-confirm-btn unpaid-confirm-save"
                onClick={
                  confirmModal.onSaveAndProceed
                }
              >
                저장하고 이동
              </button>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
