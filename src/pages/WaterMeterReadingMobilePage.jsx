// =========================================================
// 한남주택관리 수도검침 모바일 최종 재수정본
// 2026-08-11
// =========================================================

// src/pages/WaterMeterReadingMobilePage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClipboard,
  FiChevronRight,
  FiDroplet,
  FiHome,
  FiKey,
  FiLock,
  FiLogOut,
  FiMapPin,
  FiPhone,
  FiSearch,
  FiUser,
  FiX,
} from "react-icons/fi";

import { db } from "../firebase";

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import "./WaterMeterReadingMobilePage.css";

const WATER_VILLA_COLLECTION = "waterMeterReadingVillas";
const WATER_INSPECTOR_COLLECTION = "waterMeterInspectors";
const SESSION_KEY = "hannam_water_inspector_session";

/* =========================================================
   공통 유틸
========================================================= */

const cleanText = (value) =>
  String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizePhone = (value) => String(value ?? "").replace(/\D/g, "");

/*
 * 검침값에는 숫자뿐 아니라 "확인", "고장", "계량기교체" 같은
 * 한글 메모도 입력할 수 있습니다.
 * 문자를 강제로 제거하지 않고 최대 50자까지만 저장합니다.
 */
const normalizeReadingInput = (value) => String(value ?? "").slice(0, 50);

const toReadingNumber = (value) => {
  const text = cleanText(value).replace(/,/g, "");

  if (!text) {
    return null;
  }

  const number = Number(text);

  return Number.isFinite(number) ? number : null;
};

const MONTH_SEQUENCE = [
  { key: "prev12", label: "이전 12월", month: 12 },
  { key: "m1", label: "1월", month: 1 },
  { key: "m2", label: "2월", month: 2 },
  { key: "m3", label: "3월", month: 3 },
  { key: "m4", label: "4월", month: 4 },
  { key: "m5", label: "5월", month: 5 },
  { key: "m6", label: "6월", month: 6 },
  { key: "m7", label: "7월", month: 7 },
  { key: "m8", label: "8월", month: 8 },
  { key: "m9", label: "9월", month: 9 },
  { key: "m10", label: "10월", month: 10 },
  { key: "m11", label: "11월", month: 11 },
  { key: "m12", label: "12월", month: 12 },
];

const getMonthLabelFromKey = (monthKey) => {
  if (monthKey === "prev12") {
    return "이전 12월";
  }

  const match = String(monthKey || "").match(/^m(\d{1,2})$/);

  if (!match) {
    return "검침월";
  }

  return `${Number(match[1])}월`;
};

/* =========================================================
   검침원 모바일 로그인 허용 규칙

   PC 수도검침조회 > 검침원관리와 완전히 동일한 기준을 사용합니다.

   - 매월 25일 ~ 말일 : 자동 로그인 허용
   - 매월 1일 : 자동 로그인 허용
   - 그 외 날짜 : PC에서 해당 검침원의 토글을 켠 당일만 허용
   - 기존 active / 모바일 자체 날짜판단 방식은 로그인 기준으로 사용하지 않음
========================================================= */

const pad2 = (value) => String(value).padStart(2, "0");

const getLocalDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;

const isAutomaticInspectorAccessDate = (date = new Date()) => {
  const day = date.getDate();

  return day >= 25 || day === 1;
};

const isInspectorLoginAllowed = (inspector, date = new Date()) => {
  if (isAutomaticInspectorAccessDate(date)) {
    return true;
  }

  return (
    cleanText(inspector?.manualAccessDate) === getLocalDateKey(date)
  );
};

const getPreviousMonthKey = (monthKey) => {
  if (monthKey === "prev12") {
    return null;
  }

  const match = String(monthKey || "").match(/^m(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const month = Number(match[1]);

  if (month === 1) {
    return "prev12";
  }

  return `m${month - 1}`;
};

/* =========================================================
   입력 대상 월 계산

   PC 접속 규칙에 맞춰 자동 검침기간을 연결합니다.

   - 매월 25일 ~ 말일 : 현재 달 검침 입력
   - 다음 달 1일       : 직전 달 검침 계속 입력
   - 그 외 날짜에 PC에서 수동 접속 허용 시 : 현재 달 검침 입력

   예)
   8월 25~31일 -> 8월 입력
   9월 1일     -> 8월 입력
   9월 2~24일  -> PC 토글 ON인 경우 9월 입력
   9월 25일부터 -> 9월 입력
========================================================= */

const getEditablePeriod = (date = new Date()) => {
  const currentMonth = date.getMonth() + 1;
  const currentDay = date.getDate();
  const isCarryoverDay = currentDay === 1;

  let editableMonth = currentMonth;

  if (isCarryoverDay) {
    editableMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  }

  const nextMonth = editableMonth === 12 ? 1 : editableMonth + 1;

  return {
    currentMonth,
    currentDay,
    isCarryoverDay,
    editableMonth,
    defaultKey: `m${editableMonth}`,
    label: `${editableMonth}월`,
    deadlineLabel: `${nextMonth}월 1일까지`,
    isJanuaryGracePeriod:
      currentMonth === 1 && isCarryoverDay && editableMonth === 12,
  };
};

/* =========================================================
   과거 사용량 평균 및 이상검침 판단

   중요:
   수도 검침값은 누적값이므로 과거 검침값 자체의 평균을 내지 않고,
   각 월의 "사용량 = 이번 검침 - 이전 검침" 평균을 계산합니다.
========================================================= */

const getReadingWarning = (room, editableMonthKey) => {
  const readings = room?.readings || {};
  const currentValue = toReadingNumber(readings[editableMonthKey]);
  const previousMonthKey = getPreviousMonthKey(editableMonthKey);
  const previousValue = previousMonthKey
    ? toReadingNumber(readings[previousMonthKey])
    : null;

  if (currentValue === null) {
    return null;
  }

  if (previousValue !== null && currentValue < previousValue) {
    return {
      type: "lower",
      text: `전월 검침값 ${previousValue}보다 작습니다. 다시 확인해주세요.`,
    };
  }

  if (previousValue === null) {
    return null;
  }

  const targetIndex = MONTH_SEQUENCE.findIndex(
    (month) => month.key === editableMonthKey
  );

  if (targetIndex <= 0) {
    return null;
  }

  const historicalUsages = [];

  for (let index = 1; index < targetIndex; index += 1) {
    const beforeKey = MONTH_SEQUENCE[index - 1].key;
    const afterKey = MONTH_SEQUENCE[index].key;

    const beforeValue = toReadingNumber(readings[beforeKey]);
    const afterValue = toReadingNumber(readings[afterKey]);

    if (beforeValue === null || afterValue === null) {
      continue;
    }

    const usage = afterValue - beforeValue;

    if (usage < 0) {
      continue;
    }

    historicalUsages.push(usage);
  }

  if (historicalUsages.length === 0) {
    return null;
  }

  const averageUsage =
    historicalUsages.reduce((sum, value) => sum + value, 0) /
    historicalUsages.length;

  const currentUsage = currentValue - previousValue;
  const difference = Math.abs(currentUsage - averageUsage);

  if (difference < 10) {
    return null;
  }

  const averageText = Number.isInteger(averageUsage)
    ? String(averageUsage)
    : averageUsage.toFixed(1);

  const currentUsageText = Number.isInteger(currentUsage)
    ? String(currentUsage)
    : currentUsage.toFixed(1);

  return {
    type: "average",
    text: `평균 사용량 ${averageText}톤 대비 이번 사용량 ${currentUsageText}톤입니다. 10톤 이상 차이가 있어 다시 확인해주세요.`,
  };
};

const WaterMeterReadingMobilePage = () => {
  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loginForm, setLoginForm] = useState({
    name: "",
    phone: "",
  });

  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [sessionInspector, setSessionInspector] = useState(null);
  const [villas, setVillas] = useState([]);
  const [selectedVillaId, setSelectedVillaId] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isMeterLocationOpen, setIsMeterLocationOpen] = useState(false);
  const [focusedRoomId, setFocusedRoomId] = useState(null);

  const inputRefs = useRef(new Map());
  const saveTimers = useRef(new Map());

  /* =====================================================
     날짜가 바뀌면 입력 가능 월도 자동으로 전환
  ===================================================== */

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  const editablePeriod = useMemo(() => getEditablePeriod(now), [now]);

  /* =====================================================
     1월 1~5일 연도 경계 보정

     기존 연도 자료가 그대로 남아 있으면 m12를 사용하고,
     새 연도 엑셀을 이미 업로드하여 prev12에 직전 12월 값이 들어온
     상태라면 prev12를 사용합니다.
  ===================================================== */

  const hasAnyM12Reading = useMemo(
    () =>
      villas.some((villa) =>
        (villa.rooms || []).some(
          (room) => cleanText(room.readings?.m12) !== ""
        )
      ),
    [villas]
  );

  const editableMonthKey = useMemo(() => {
    if (!editablePeriod.isJanuaryGracePeriod) {
      return editablePeriod.defaultKey;
    }

    return hasAnyM12Reading ? "m12" : "prev12";
  }, [editablePeriod, hasAnyM12Reading]);

  const editableMonthLabel = editablePeriod.label;
  const previousMonthKey = getPreviousMonthKey(editableMonthKey);
  const previousMonthLabel = previousMonthKey
    ? getMonthLabelFromKey(previousMonthKey)
    : "이전 검침";

  /* =====================================================
     현재 모바일 입력값이 저장될 실제 년도 / 월

     - 일반 월: 현재 년도 + 해당 월
     - 1월 1일에 직전 12월 입력: 직전 년도 + m12
  ===================================================== */

  const editableReadingPoint = useMemo(() => {
    const currentYear = now.getFullYear();
    const isPreviousDecember =
      now.getMonth() === 0 &&
      now.getDate() === 1 &&
      (editableMonthKey === "m12" || editableMonthKey === "prev12");

    return {
      year: isPreviousDecember ? currentYear - 1 : currentYear,
      monthKey: editableMonthKey === "prev12" ? "m12" : editableMonthKey,
    };
  }, [now, editableMonthKey]);

  /* =====================================================
     검침원 로그인
  ===================================================== */

  const handleLogin = async () => {
    const loginDate = new Date();
    const name = cleanText(loginForm.name);
    const phone = normalizePhone(loginForm.phone);

    setNow(loginDate);

    if (!name || phone.length < 10) {
      setLoginError("이름과 연락처를 정확하게 입력해주세요.");
      return;
    }

    setLoginLoading(true);
    setLoginError("");

    try {
      const inspectorQuery = query(
        collection(db, WATER_INSPECTOR_COLLECTION),
        where("normalizedPhone", "==", phone)
      );

      const snapshot = await getDocs(inspectorQuery);

      const matched = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .find(
          (inspector) =>
            cleanText(inspector.name) === name &&
            normalizePhone(inspector.phone) === phone
        );

      if (!matched) {
        setLoginError("등록된 검침원 정보와 일치하지 않습니다.");
        return;
      }

      /*
       * 모바일 자체 날짜 규칙으로 접속 여부를 판단하지 않습니다.
       * PC 검침원관리 화면과 같은 규칙만 사용합니다.
       */
      if (!isInspectorLoginAllowed(matched, loginDate)) {
        setLoginError(
          "현재는 검침하는 날짜가 아닙니다. PC 검침원관리에서 모바일 로그인을 허용한 후 다시 시도해주세요."
        );
        return;
      }

      const nextSession = {
        id: matched.id,
        name: matched.name,
        phone: matched.phone,
        loggedInAt: Date.now(),
      };

      /* PC 검침원관리의 '마지막 로그인' 표시용 */
      await setDoc(
        doc(db, WATER_INSPECTOR_COLLECTION, matched.id),
        {
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSessionInspector(matched);
      setSession(nextSession);
    } catch (error) {
      console.error("검침원 로그인 오류:", error);
      setLoginError("검침원 확인 중 오류가 발생했습니다.");
    } finally {
      setLoginLoading(false);
    }
  };

  /* =====================================================
     로그인된 검침원의 PC 접속 토글 실시간 반영

     - 검침원이 삭제되면 즉시 로그아웃
     - PC에서 수동 토글을 OFF하면 즉시 로그아웃
     - 자동 허용기간이 끝나 날짜가 바뀌면 자동 로그아웃
     - 기존 active 필드는 접속 판단에 사용하지 않음
  ===================================================== */

  useEffect(() => {
    if (!session?.id) {
      setSessionInspector(null);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(db, WATER_INSPECTOR_COLLECTION, session.id),
      (snapshot) => {
        if (!snapshot.exists()) {
          localStorage.removeItem(SESSION_KEY);
          setSessionInspector(null);
          setSession(null);
          setVillas([]);
          setSelectedVillaId(null);
          setSearchText("");
          return;
        }

        const inspector = {
          id: snapshot.id,
          ...snapshot.data(),
        };

        setSessionInspector(inspector);

        if (!isInspectorLoginAllowed(inspector, new Date())) {
          localStorage.removeItem(SESSION_KEY);
          setSessionInspector(null);
          setSession(null);
          setVillas([]);
          setSelectedVillaId(null);
          setSearchText("");
        }
      }
    );

    return unsubscribe;
  }, [session?.id]);

  useEffect(() => {
    if (!session || !sessionInspector) {
      return;
    }

    if (isInspectorLoginAllowed(sessionInspector, now)) {
      return;
    }

    localStorage.removeItem(SESSION_KEY);
    setSessionInspector(null);
    setSession(null);
    setVillas([]);
    setSelectedVillaId(null);
    setSearchText("");
  }, [session, sessionInspector, now]);

  /* =====================================================
     수도검침 실시간 구독
  ===================================================== */

  useEffect(() => {
    if (!session) {
      setIsLoading(false);
      return undefined;
    }

    setIsLoading(true);

    const unsubscribe = onSnapshot(
      collection(db, WATER_VILLA_COLLECTION),
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .sort(
            (a, b) =>
              Number(a.sourceSheetIndex ?? 999999) -
              Number(b.sourceSheetIndex ?? 999999)
          );

        setVillas(next);

        setSelectedVillaId((previous) => {
          if (
            previous &&
            next.some((villa) => villa.id === previous)
          ) {
            return previous;
          }

          return next[0]?.id || null;
        });

        setIsLoading(false);
      },
      (error) => {
        console.error("모바일 수도검침 구독 오류:", error);
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();

      saveTimers.current.forEach((timer) => clearTimeout(timer));
      saveTimers.current.clear();
    };
  }, [session]);

  const filteredVillas = useMemo(() => {
    const keyword = cleanText(searchText).toLowerCase();

    if (!keyword) {
      return villas;
    }

    return villas.filter(
      (villa) =>
        cleanText(villa.villaName).toLowerCase().includes(keyword) ||
        cleanText(villa.address).toLowerCase().includes(keyword)
    );
  }, [villas, searchText]);

  const selectedVilla = useMemo(
    () => villas.find((villa) => villa.id === selectedVillaId) || null,
    [villas, selectedVillaId]
  );

  useEffect(() => {
    setIsMeterLocationOpen(false);
    setFocusedRoomId(null);
  }, [selectedVillaId]);

  useEffect(() => {
    if (filteredVillas.length === 0) {
      return;
    }

    const exists = filteredVillas.some(
      (villa) => villa.id === selectedVillaId
    );

    if (!exists) {
      setSelectedVillaId(filteredVillas[0].id);
    }
  }, [filteredVillas, selectedVillaId]);

  const completedCount = useMemo(() => {
    if (!selectedVilla) {
      return 0;
    }

    return (selectedVilla.rooms || []).filter(
      (room) => cleanText(room.readings?.[editableMonthKey]) !== ""
    ).length;
  }, [selectedVilla, editableMonthKey]);

  const completionRate = selectedVilla?.rooms?.length
    ? Math.round((completedCount / selectedVilla.rooms.length) * 100)
    : 0;

  /* =====================================================
     전체 빌라 검침현황

     - 값이 빈칸이 아니면 검침 완료로 판단
     - 0 / 숫자 / 한글 / 기타 문자열 모두 완료 처리
     - 전체 빈칸: 검침누락
     - 일부 입력: 검침진행중
     - 전체 입력: 검침완료
  ===================================================== */

  const inspectionStatus = useMemo(() => {
    const items = villas.map((villa) => {
      const rooms = Array.isArray(villa.rooms) ? villa.rooms : [];
      const completedRooms = rooms.filter(
        (room) => cleanText(room.readings?.[editableMonthKey]) !== ""
      );
      const missingRooms = rooms.filter(
        (room) => cleanText(room.readings?.[editableMonthKey]) === ""
      );

      let status = "missing";

      if (rooms.length > 0 && completedRooms.length === rooms.length) {
        status = "complete";
      } else if (completedRooms.length > 0) {
        status = "progress";
      }

      const rate = rooms.length
        ? Math.round((completedRooms.length / rooms.length) * 100)
        : 0;

      return {
        ...villa,
        status,
        roomCount: rooms.length,
        completedRoomCount: completedRooms.length,
        missingRooms,
        rate,
      };
    });

    const statusOrder = {
      missing: 0,
      progress: 1,
      complete: 2,
    };

    const sortedItems = [...items].sort((a, b) => {
      const statusDifference = statusOrder[a.status] - statusOrder[b.status];

      if (statusDifference !== 0) {
        return statusDifference;
      }

      return (
        Number(a.sourceSheetIndex ?? 999999) -
        Number(b.sourceSheetIndex ?? 999999)
      );
    });

    return {
      items: sortedItems,
      total: items.length,
      complete: items.filter((item) => item.status === "complete").length,
      progress: items.filter((item) => item.status === "progress").length,
      missing: items.filter((item) => item.status === "missing").length,
    };
  }, [villas, editableMonthKey]);

  const openVillaFromStatus = (villaId) => {
    setSelectedVillaId(villaId);
    setSearchText("");
    setIsStatusOpen(false);
  };

  /* =====================================================
     입력 가능 월 검침값 저장

     PC와 동일한 Firestore 문서/room.readings를 사용하므로
     모바일 입력값이 PC에도 실시간 반영됩니다.
  ===================================================== */

  const persistReading = async (villaId, roomId, monthKey, value) => {
    const villaRef = doc(db, WATER_VILLA_COLLECTION, villaId);
    const readingDate = new Date();
    const readingDateKey = getLocalDateKey(readingDate);
    const readingYearKey = String(editableReadingPoint.year);
    const readingMonthKey = editableReadingPoint.monthKey;
    const hasReadingValue = cleanText(value) !== "";

    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(villaRef);

        if (!snapshot.exists()) {
          return;
        }

        const data = snapshot.data();

        const rooms = Array.isArray(data.rooms)
          ? data.rooms.map((room) => {
              if (room.id !== roomId) {
                return room;
              }

              return {
                ...room,
                readings: {
                  ...(room.readings || {}),
                  [monthKey]: value,
                },
                readingYears: {
                  ...(room.readingYears || {}),
                  [readingYearKey]: {
                    ...(room.readingYears?.[readingYearKey] || {}),
                    [readingMonthKey]: value,
                  },
                },
              };
            })
          : [];

        const updateData = {
          rooms,
          updatedAt: serverTimestamp(),
          lastInspector: {
            id: session.id,
            name: session.name,
            phone: session.phone,
            month: readingMonthKey,
            monthLabel: editableMonthLabel,
          },
        };

        /*
         * 빌라별 월 검침일은 마지막으로 실제 값이 입력된 날짜를 사용합니다.
         * 101호를 오늘 입력하고 102호를 내일 입력하면 내일 날짜로 교체됩니다.
         * 빈칸으로 지우는 동작은 검침일을 새 날짜로 변경하지 않습니다.
         */
        if (hasReadingValue) {
          updateData.mobileReadingDates = {
            ...(data.mobileReadingDates || {}),
            [readingYearKey]: {
              ...(data.mobileReadingDates?.[readingYearKey] || {}),
              [readingMonthKey]: readingDateKey,
            },
          };
        }

        transaction.update(villaRef, updateData);
      });
    } catch (error) {
      console.error("모바일 검침값 저장 오류:", error);
    }
  };

  const updateReading = (roomId, rawValue) => {
    if (!selectedVilla) {
      return;
    }

    const villaId = selectedVilla.id;
    const value = normalizeReadingInput(rawValue);
    const monthKey = editableMonthKey;

    setVillas((previous) =>
      previous.map((villa) =>
        villa.id === villaId
          ? {
              ...villa,
              rooms: villa.rooms.map((room) =>
                room.id === roomId
                  ? {
                      ...room,
                      readings: {
                        ...(room.readings || {}),
                        [monthKey]: value,
                      },
                      readingYears: {
                        ...(room.readingYears || {}),
                        [String(editableReadingPoint.year)]: {
                          ...(room.readingYears?.[
                            String(editableReadingPoint.year)
                          ] || {}),
                          [editableReadingPoint.monthKey]: value,
                        },
                      },
                    }
                  : room
              ),
            }
          : villa
      )
    );

    const timerKey = `${villaId}:${roomId}:${monthKey}`;
    const previousTimer = saveTimers.current.get(timerKey);

    if (previousTimer) {
      clearTimeout(previousTimer);
    }

    const timer = setTimeout(() => {
      saveTimers.current.delete(timerKey);
      persistReading(villaId, roomId, monthKey, value);
    }, 250);

    saveTimers.current.set(timerKey, timer);
  };

  const handleKeyDown = (event, roomIndex, roomId) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (!selectedVilla) {
      return;
    }

    const value = normalizeReadingInput(event.currentTarget.value);
    const monthKey = editableMonthKey;
    const timerKey = `${selectedVilla.id}:${roomId}:${monthKey}`;
    const timer = saveTimers.current.get(timerKey);

    if (timer) {
      clearTimeout(timer);
      saveTimers.current.delete(timerKey);
    }

    persistReading(selectedVilla.id, roomId, monthKey, value);

    const nextRoom = selectedVilla.rooms?.[roomIndex + 1];

    if (!nextRoom) {
      event.currentTarget.blur();
      return;
    }

    const nextInput = inputRefs.current.get(nextRoom.id);

    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSessionInspector(null);
    setSession(null);
    setVillas([]);
    setSelectedVillaId(null);
    setSearchText("");
    setIsMeterLocationOpen(false);
    setFocusedRoomId(null);
  };

  /* =====================================================
     LOGIN SCREEN
  ===================================================== */

  if (!session) {
    return (
      <div className="wmrm-login-page">
        <div className="wmrm-login-card">
          <div className="wmrm-login-logo">
            <FiDroplet />
          </div>

          <div className="wmrm-login-heading">
            <div className="wmrm-login-company">한남주택관리</div>
            <span>HANNAM WATER METER</span>
            <h1>수도검침</h1>
            <p>등록된 검침원만 접속할 수 있습니다.</p>
          </div>

          <div className="wmrm-login-form">
            <label>검침원 이름</label>

            <div className="wmrm-login-input">
              <FiUser />
              <input
                type="text"
                value={loginForm.name}
                placeholder="이름 입력"
                autoComplete="name"
                onChange={(event) =>
                  setLoginForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
              />
            </div>

            <label>연락처</label>

            <div className="wmrm-login-input">
              <FiPhone />
              <input
                type="tel"
                value={loginForm.phone}
                placeholder="01012345678"
                inputMode="numeric"
                autoComplete="tel"
                onChange={(event) =>
                  setLoginForm((previous) => ({
                    ...previous,
                    phone: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleLogin();
                  }
                }}
              />
            </div>

            {loginError && (
              <div className="wmrm-login-error">{loginError}</div>
            )}

            <button
              type="button"
              className="wmrm-login-button"
              disabled={loginLoading}
              onClick={handleLogin}
            >
              {loginLoading ? "확인 중..." : "검침 시작"}
              <FiChevronRight />
            </button>

            <div className="wmrm-login-contact">
              <strong>한남주택관리</strong>
              <span>042-489-8555</span>
              <em>긴급연락처 010-4080-3948</em>
            </div>
          </div>

          <div className="wmrm-login-foot">
            이름과 연락처가 PC 검침원 관리에 등록된 정보와 모두 일치하고, 모바일 로그인이 허용된 상태여야 합니다.
          </div>
        </div>
      </div>
    );
  }

  /* =====================================================
     MAIN SCREEN
  ===================================================== */

  return (
    <div className="wmrm-page">
      <header className="wmrm-header">
        <div>
          <span>한남주택관리 · {editableMonthLabel} 수도검침</span>
          <strong>{session.name} 검침원</strong>
        </div>

        <div className="wmrm-header-actions">
          <button
            type="button"
            className="wmrm-status-button"
            onClick={() => setIsStatusOpen(true)}
          >
            <FiClipboard />
            검침현황
          </button>

          <button type="button" className="wmrm-logout" onClick={logout}>
            <FiLogOut />
            종료
          </button>
        </div>
      </header>

      <div className="wmrm-search">
        <FiSearch />

        <input
          type="text"
          value={searchText}
          placeholder="빌라명 또는 주소 검색"
          onChange={(event) => setSearchText(event.target.value)}
        />

        {searchText && (
          <button type="button" onClick={() => setSearchText("")}>
            <FiX />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="wmrm-loading">
          수도검침 자료를 불러오는 중입니다.
        </div>
      ) : (
        <div className="wmrm-layout">
          <section className="wmrm-villa-strip">
            {filteredVillas.map((villa) => (
              <button
                key={villa.id}
                type="button"
                className={selectedVillaId === villa.id ? "active" : ""}
                onClick={() => setSelectedVillaId(villa.id)}
              >
                <strong>{villa.villaName}</strong>
                <span>{villa.address || "주소 미등록"}</span>
              </button>
            ))}
          </section>

          {!selectedVilla ? (
            <div className="wmrm-empty">
              <FiDroplet />
              <strong>검침할 빌라가 없습니다.</strong>
            </div>
          ) : (
            <main className="wmrm-main">
              <section className="wmrm-villa-card">
                <div className="wmrm-villa-title">
                  <div>
                    <FiHome />
                  </div>

                  <div>
                    <span>검침 대상</span>
                    <h2>{selectedVilla.villaName}</h2>
                  </div>

                  <em>
                    {completedCount}/{selectedVilla.rooms?.length || 0}
                  </em>
                </div>

                <div className="wmrm-progress">
                  <div>
                    <span>{editableMonthLabel} 진행률</span>
                    <strong>{completionRate}%</strong>
                  </div>

                  <i>
                    <b style={{ width: `${completionRate}%` }} />
                  </i>
                </div>

                <div className="wmrm-info-grid">
                  <div>
                    <FiMapPin />
                    <span>주소</span>
                    <strong>{selectedVilla.address || "-"}</strong>
                  </div>

                  <div>
                    <FiKey />
                    <span>로비</span>
                    <strong>{selectedVilla.lobby || "-"}</strong>
                  </div>

                  <div className="wmrm-meter-location-wrap">
                    <button
                      type="button"
                      className={`wmrm-meter-location ${
                        isMeterLocationOpen ? "is-open" : ""
                      }`}
                      aria-expanded={isMeterLocationOpen}
                      aria-label="계량기 위치 전체 내용 보기"
                      onClick={() =>
                        setIsMeterLocationOpen((previous) => !previous)
                      }
                    >
                      <FiDroplet />
                      <span>계량기 위치</span>
                      <strong>{selectedVilla.meterLocation || "-"}</strong>
                    </button>

                    {isMeterLocationOpen && (
                      <div
                        className="wmrm-meter-location-bubble"
                        role="tooltip"
                      >
                        <span>계량기 위치</span>
                        <strong>{selectedVilla.meterLocation || "-"}</strong>
                        <i aria-hidden="true" />
                      </div>
                    )}
                  </div>
                </div>

                {focusedRoomId && (
                  <div className="wmrm-input-floating-bar" aria-live="polite">
                    <strong>{selectedVilla.villaName}</strong>
                    <span>
                      {editableMonthLabel} 진행률
                      <b>{completionRate}%</b>
                    </span>
                  </div>
                )}
              </section>

              <section className="wmrm-month-lock">
                <div>
                  <FiCheckCircle />
                  <strong>
                    {editableMonthLabel} 입력 가능 · {editablePeriod.deadlineLabel}
                  </strong>
                </div>

                <span>
                  <FiLock />
                  이전 검침값은 조회만 가능
                </span>
              </section>

              <section className="wmrm-reading-list">
                {selectedVilla.rooms?.map((room, roomIndex) => {
                  const currentValue =
                    room.readings?.[editableMonthKey] ?? "";

                  const previousValue = previousMonthKey
                    ? room.readings?.[previousMonthKey] ?? ""
                    : "";

                  const complete = cleanText(currentValue) !== "";
                  const warning = getReadingWarning(room, editableMonthKey);

                  const articleClassName = [
                    complete ? "complete" : "",
                    warning ? "has-warning" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <article key={room.id} className={articleClassName}>
                      <div className="wmrm-room-meta">
                        <span>{roomIndex + 1}</span>

                        <div>
                          <strong>{room.room}</strong>
                          <small>
                            {previousMonthLabel} 검침 ·{" "}
                            {previousValue === "" ? "-" : previousValue}
                          </small>
                        </div>

                        {complete && !warning && <FiCheckCircle />}
                        {warning && <FiAlertTriangle className="wmrm-row-warning-icon" />}
                      </div>

                      <div className="wmrm-reading-input">
                        <label>{editableMonthLabel}</label>

                        <input
                          ref={(element) => {
                            if (element) {
                              inputRefs.current.set(room.id, element);
                            } else {
                              inputRefs.current.delete(room.id);
                            }
                          }}
                          type="text"
                          inputMode="numeric"
                          enterKeyHint="next"
                          autoComplete="off"
                          value={currentValue}
                          placeholder="검침값 입력"
                          aria-label={`${room.room} ${editableMonthLabel} 검침값`}
                          onFocus={(event) => {
                            setIsMeterLocationOpen(false);
                            setFocusedRoomId(room.id);
                            event.currentTarget.select();
                          }}
                          onBlur={() => setFocusedRoomId(null)}
                          onChange={(event) =>
                            updateReading(room.id, event.target.value)
                          }
                          onKeyDown={(event) =>
                            handleKeyDown(
                              event,
                              roomIndex,
                              room.id
                            )
                          }
                        />
                      </div>

                      {warning && (
                        <div
                          className={`wmrm-reading-warning wmrm-reading-warning--${warning.type}`}
                        >
                          <FiAlertTriangle />
                          <span>{warning.text}</span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            </main>
          )}
        </div>
      )}

      {isStatusOpen && (
        <div
          className="wmrm-status-backdrop"
          onMouseDown={() => setIsStatusOpen(false)}
        >
          <section
            className="wmrm-status-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="wmrm-status-header">
              <div>
                <span>{editableMonthLabel} 수도검침</span>
                <strong>전체 검침현황</strong>
              </div>

              <button
                type="button"
                aria-label="검침현황 닫기"
                onClick={() => setIsStatusOpen(false)}
              >
                <FiX />
              </button>
            </div>

            <div className="wmrm-status-summary">
              <div>
                <span>총 검침빌라</span>
                <strong>{inspectionStatus.total}</strong>
                <em>곳</em>
              </div>

              <div className="is-complete">
                <span>검침완료</span>
                <strong>{inspectionStatus.complete}</strong>
                <em>곳</em>
              </div>

              <div className="is-progress">
                <span>검침진행중</span>
                <strong>{inspectionStatus.progress}</strong>
                <em>곳</em>
              </div>

              <div className="is-missing">
                <span>검침누락</span>
                <strong>{inspectionStatus.missing}</strong>
                <em>곳</em>
              </div>
            </div>

            <div className="wmrm-status-list">
              {inspectionStatus.items.length === 0 ? (
                <div className="wmrm-status-empty">
                  등록된 검침 빌라가 없습니다.
                </div>
              ) : (
                inspectionStatus.items.map((villa) => {
                  const statusLabel =
                    villa.status === "complete"
                      ? "검침완료"
                      : villa.status === "progress"
                        ? "검침진행중"
                        : "검침누락";

                  return (
                    <button
                      key={villa.id}
                      type="button"
                      className={`wmrm-status-item is-${villa.status}`}
                      onClick={() => openVillaFromStatus(villa.id)}
                    >
                      <div className="wmrm-status-item-main">
                        <div className="wmrm-status-item-title">
                          <strong>{villa.villaName}</strong>
                          <span>{statusLabel}</span>
                        </div>

                        <small>{villa.address || "주소 미등록"}</small>

                        {villa.status === "progress" && (
                          <div className="wmrm-status-missing-rooms">
                            <b>미검침 호실</b>
                            <span>
                              {villa.missingRooms
                                .map((room) => room.room)
                                .join(", ")}
                            </span>
                          </div>
                        )}

                        {villa.status === "missing" && (
                          <div className="wmrm-status-missing-rooms">
                            <b>미검침</b>
                            <span>전체 호실</span>
                          </div>
                        )}
                      </div>

                      <div className="wmrm-status-item-progress">
                        <strong>
                          {villa.completedRoomCount}/{villa.roomCount}
                        </strong>
                        <span>{villa.rate}%</span>
                        <i>
                          <b style={{ width: `${villa.rate}%` }} />
                        </i>
                      </div>

                      <FiChevronRight className="wmrm-status-item-arrow" />
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default WaterMeterReadingMobilePage;
