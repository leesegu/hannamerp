// src/App.js
import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import MobileLogin from "./pages/MobileLogin";

import TrezoSidebar from "./components/TrezoSidebar";
import MoveoutForm from "./MoveoutForm";
import MoveoutList from "./pages/MoveoutList";
import MoveoutListMobile from "./pages/MoveoutList.mobile";
import MoveoutFormMobile from "./pages/MoveoutForm.mobile";

import UserRegisterPage from "./UserRegisterPage";

import VillaCodePage from "./pages/VillaCodePage";
import TelcoPage from "./pages/TelcoPage";
import ElevatorPage from "./pages/ElevatorPage";
import SepticPage from "./pages/SepticPage";
import FireSafetyPage from "./pages/FireSafetyPage";
import ElectricSafetyPage from "./pages/ElectricSafetyPage";
import WaterPage from "./pages/WaterPage";
import PublicElectricPage from "./pages/PublicElectricPage";
import CleaningPage from "./pages/CleaningPage";
import CctvPage from "./pages/CctvPage";
import VendorRegisterPage from "./pages/VendorRegisterPage";
import EmployeePage from "./pages/EmployeePage";

import ReceiptIssuePage from "./pages/ReceiptIssuePage";
import IncomeImportPage from "./pages/IncomeImportPage";
import ExpensePage from "./pages/ExpensePage";
import DailyClosePage from "./pages/DailyClosePage";

/* 월마감 */
import MonthlyClosePage from "./pages/MonthlyClosePage";

/* 연간시트 */
import AnnualSheetPage from "./pages/AnnualSheetPage";

/* 대금결제 관리 */
import PaymentSettlementPage from "./pages/PaymentSettlementPage.jsx";

/* 손익계산 */
import ProfitLossPage from "./pages/ProfitLossPage";

/* 미납관리 */
import UnpaidManagementPage from "./pages/UnpaidManagementPage";

import MessageExtractor from "./pages/MessageExtractor";

/* 공용전기 계산 */
import PublicElectricCalcPage from "./pages/PublicElectricCalcPage";

import CalendarPage from "./pages/CalendarPage";
import PaperingPage from "./pages/PaperingPage";
import MemoPage from "./pages/MemoPage";

/* 모바일 전용 캘린더 */
import MobileCalendarPage from "./pages/MobileCalendarPage";

/* 모바일 개인 장부 */
import MobilePersonalLedgerPage from "./pages/MobilePersonalLedgerPage";

/* 수도검침 모바일 */
import WaterMeterReadingMobilePage from "./pages/WaterMeterReadingMobilePage";

/* 일정관리 */
import ScheduleManager from "./pages/ScheduleManager";

/* 입주자카드 */
import ResidentCardPage from "./pages/ResidentCardPage";

/* 자재비관리대장 */
import MaterialCostPage from "./pages/MaterialCostPage";

/* 정산하자체크 */
import SettlementDefectCheckPage from "./pages/SettlementDefectCheckPage";

/* 수도검침조회 */
import WaterMeterReadingPage from "./pages/WaterMeterReadingPage";

/* 관리일지 */
import ManagementLog from "./pages/ManagementLog";

import "./App.css";

/* Firebase */
import { auth } from "./firebase";
import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

/* 카드지출 */
import CardExpenseModal from "./pages/CardExpenseModal";

/* 증명서 발급 */
import CertificateIssuePage from "./pages/CertificateIssuePage";

/* 급여대장 */
import PayrollBook from "./pages/PayrollBook";

/* =========================================================
 * 모바일 / PC 최초 판정
 * =========================================================
 *
 * 중요:
 *
 * 기존에는 App 시작 시
 *
 * isMobile = false
 *
 * 상태로 먼저 시작한 뒤 useEffect에서 모바일 여부를
 * 판단했습니다.
 *
 * 이제는 React 최초 실행 순간부터 현재 URL과
 * 실제 기기를 검사하여 모바일 여부를 결정합니다.
 *
 * 특히:
 *
 * /mobile/...
 *
 * 주소는 화면 크기, 태블릿, 브라우저 종류와 관계없이
 * 항상 모바일 화면으로 처리합니다.
 * ========================================================= */
function detectMobileMode() {
  const pathname =
    window.location.pathname || "";

  /*
   * =====================================================
   * 모바일 전용 URL
   * =====================================================
   *
   * 이 URL은 PC에서 직접 접속해도
   * 모바일 전용 화면을 표시합니다.
   */
  const isForcedMobileRoute =
    pathname === "/calendar-mobile" ||
    pathname === "/mobile" ||
    pathname.startsWith("/mobile/");

  if (isForcedMobileRoute) {
    return true;
  }

  /*
   * =====================================================
   * User Agent
   * =====================================================
   */
  const userAgent =
    window.navigator.userAgent || "";

  const isAndroid =
    /Android/i.test(userAgent);

  const isIPhone =
    /iPhone|iPod/i.test(userAgent);

  /*
   * =====================================================
   * 실제 기기 화면 크기
   * =====================================================
   *
   * 브라우저 창의 크기가 아닌
   * 실제 화면의 짧은 변 기준
   */
  const screenWidth =
    window.screen?.width || 0;

  const screenHeight =
    window.screen?.height || 0;

  const deviceShortSide =
    Math.min(
      screenWidth,
      screenHeight
    );

  /*
   * =====================================================
   * Android 태블릿
   * =====================================================
   *
   * 일반 ERP 주소에서는 PC ERP 유지
   *
   * 단,
   *
   * /mobile/...
   *
   * 경로는 위에서 이미 모바일로 확정됨
   */
  const isAndroidTablet =
    isAndroid &&
    deviceShortSide >= 600;

  if (isAndroidTablet) {
    return false;
  }

  /*
   * =====================================================
   * 실제 스마트폰
   * =====================================================
   */
  const isPhysicalPhone =
    (isAndroid || isIPhone) &&
    deviceShortSide > 0 &&
    deviceShortSide < 600;

  if (isPhysicalPhone) {
    return true;
  }

  /*
   * =====================================================
   * 최종 fallback
   * =====================================================
   */
  return window.innerWidth <= 768;
}

/* =========================================================
 * 카드지출 페이지 래퍼
 * ========================================================= */
function CardExpensePageWrapper() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ padding: 16 }}>
      <button
        className="btn primary"
        onClick={() => setOpen(true)}
        style={{
          height: 36,
          padding: "0 12px",
          borderRadius: 10,
          border: "1px solid transparent",
          fontWeight: 600,
          cursor: "pointer",
          background:
            "linear-gradient(180deg,#6C8CF5 0%, #4F73EA 100%)",
          color: "#fff",
          boxShadow:
            "0 6px 16px rgba(94,126,242,.28)",
        }}
      >
        카드지출 열기
      </button>

      <CardExpenseModal
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

/* =========================================================
 * ROUTES
 * ========================================================= */
function AppRoutes({
  employeeId,
  userId,
  userName,
  isMobile,
  onLogin,
  onLogout,
  isAuthReady,
  authUser,
}) {
  const navigate = useNavigate();

  /*
   * 앱 로컬 로그인 또는 Firebase Auth 중
   * 하나라도 있으면 로그인 상태로 간주
   */
  const isLoggedInEffective = Boolean(
    (employeeId && userId) ||
      authUser
  );

  if (!isAuthReady) {
    return null;
  }

  return (
    <Routes>
      {/* =====================================================
          루트
          ===================================================== */}
      <Route
        path="/"
        element={
          isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/list"
                  : "/main"
              }
              replace
            />
          ) : (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          )
        }
      />

      {/* =====================================================
          PC 로그인
          ===================================================== */}
      <Route
        path="/login"
        element={
          isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/list"
                  : "/main"
              }
              replace
            />
          ) : isMobile ? (
            <Navigate
              to="/mobile/login"
              replace
            />
          ) : (
            <LoginPage
              onLogin={onLogin}
            />
          )
        }
      />

      {/* =====================================================
          이사정산 모바일 홈화면 전용 시작 주소
          ===================================================== */}
      <Route
        path="/mobile/moveout"
        element={
          isLoggedInEffective ? (
            <Navigate
              to="/mobile/list"
              replace
            />
          ) : (
            <Navigate
              to="/mobile/login"
              replace
            />
          )
        }
      />

      {/* =====================================================
          모바일 전용 로그인
          ===================================================== */}
      <Route
        path="/mobile/login"
        element={
          isLoggedInEffective ? (
            <Navigate
              to="/mobile/list"
              replace
            />
          ) : (
            <MobileLogin />
          )
        }
      />

      {/* =====================================================
          메인
          ===================================================== */}
      <Route
        path="/main"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : isMobile ? (
            <Navigate
              to="/mobile/list"
              replace
            />
          ) : (
            <TrezoSidebar
              employeeId={employeeId}
              userId={userId}
              userName={userName}
              onLogout={onLogout}
            />
          )
        }
      />

      {/* =====================================================
          PC 이사정산 등록/수정
          ===================================================== */}
      <Route
        path="/form"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <MoveoutForm
              employeeId={employeeId}
              userId={userId}
              isMobile={false}
              onDone={() =>
                navigate(-1)
              }
            />
          )
        }
      />

      {/* =====================================================
          모바일 이사정산 등록/수정
          ===================================================== */}
      <Route
        path="/mobile/form"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to="/mobile/login"
              replace
            />
          ) : (
            <MoveoutFormMobile
              employeeId={employeeId}
              userId={userId}
            />
          )
        }
      />

      {/* =====================================================
          모바일 이사정산 조회
          ===================================================== */}
      <Route
        path="/mobile/list"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to="/mobile/login"
              replace
            />
          ) : (
            <MoveoutListMobile
              employeeId={employeeId}
              userId={userId}
            />
          )
        }
      />

      {/* =====================================================
          모바일 전용 캘린더
          ===================================================== */}
      <Route
        path="/calendar-mobile"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to="/mobile/login"
              replace
            />
          ) : (
            <MobileCalendarPage />
          )
        }
      />

      {/* =====================================================
          모바일 전용 개인 장부
          ===================================================== */}
      <Route
        path="/mobile/personal-ledger"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to="/mobile/login"
              replace
            />
          ) : (
            <MobilePersonalLedgerPage />
          )
        }
      />

      {/* =====================================================
          수도검침 모바일

          기존 ERP 로그인과 별도
          ===================================================== */}
      <Route
        path="/mobile/water-reading"
        element={
          <WaterMeterReadingMobilePage />
        }
      />

      {/* =====================================================
          PC 이사정산 조회
          ===================================================== */}
      <Route
        path="/list"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <MoveoutList
              employeeId={employeeId}
              userId={userId}
            />
          )
        }
      />

      {/* =====================================================
          영수증
          ===================================================== */}
      <Route
        path="/receipts"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <ReceiptIssuePage />
          )
        }
      />

      {/* =====================================================
          수입정리
          ===================================================== */}
      <Route
        path="/accounting/income"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <IncomeImportPage />
          )
        }
      />

      {/* =====================================================
          지출정리
          ===================================================== */}
      <Route
        path="/accounting/expense"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <ExpensePage />
          )
        }
      />

      {/* =====================================================
          대금결제 관리
          ===================================================== */}
      <Route
        path="/accounting/payment-settlement"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <PaymentSettlementPage />
          )
        }
      />

      {/* =====================================================
          손익계산
          ===================================================== */}
      <Route
        path="/accounting/profit-loss"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <ProfitLossPage />
          )
        }
      />

{/* =====================================================
          미납관리
          ===================================================== */}
      <Route
        path="/accounting/unpaid-management"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <UnpaidManagementPage />
          )
        }
      />

      {/* =====================================================
          일마감
          ===================================================== */}
      <Route
        path="/accounting/daily-close"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <DailyClosePage />
          )
        }
      />

      {/* =====================================================
          월마감
          ===================================================== */}
      <Route
        path="/accounting/monthly-close"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <MonthlyClosePage />
          )
        }
      />

      {/* =====================================================
          연간시트
          ===================================================== */}
      <Route
        path="/accounting/annual-sheet"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <AnnualSheetPage />
          )
        }
      />

      {/* =====================================================
          전기요금 추출
          ===================================================== */}
      <Route
        path="/extract"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <MessageExtractor />
          )
        }
      />

      {/* =====================================================
          공용전기 계산
          ===================================================== */}
      <Route
        path="/public-electric-calc"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <PublicElectricCalcPage />
          )
        }
      />

      {/* =====================================================
          캘린더
          ===================================================== */}
      <Route
        path="/calendar"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <CalendarPage />
          )
        }
      />

      {/* =====================================================
          일정관리
          ===================================================== */}
      <Route
        path="/schedule"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <ScheduleManager />
          )
        }
      />

      {/* =====================================================
          도배
          ===================================================== */}
      <Route
        path="/papering"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <PaperingPage />
          )
        }
      />

      {/* =====================================================
          메모
          ===================================================== */}
      <Route
        path="/memo"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <MemoPage
              userId={userId}
            />
          )
        }
      />

      {/* =====================================================
          빌라정보
          ===================================================== */}
      <Route
        path="/villa"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <VillaCodePage />
          )
        }
      />

      <Route
        path="/telco"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <TelcoPage />
          )
        }
      />

      <Route
        path="/elevator"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <ElevatorPage />
          )
        }
      />

      <Route
        path="/septic"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <SepticPage />
          )
        }
      />

      <Route
        path="/fire-safety"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <FireSafetyPage />
          )
        }
      />

      <Route
        path="/electric-safety"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <ElectricSafetyPage />
          )
        }
      />

      <Route
        path="/water"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <WaterPage />
          )
        }
      />

      <Route
        path="/public-electric"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <PublicElectricPage />
          )
        }
      />

      <Route
        path="/cleaning"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <CleaningPage />
          )
        }
      />

      <Route
        path="/cctv"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <CctvPage />
          )
        }
      />

      {/* =====================================================
          기초등록
          ===================================================== */}
      <Route
        path="/basic/vendor-register"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <VendorRegisterPage />
          )
        }
      />

      {/* =====================================================
          직원
          ===================================================== */}
      <Route
        path="/employee"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <EmployeePage />
          )
        }
      />

      {/* =====================================================
          입주자카드
          ===================================================== */}
      <Route
        path="/addon/resident-card"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <ResidentCardPage />
          )
        }
      />

      {/* =====================================================
          자재비관리대장
          ===================================================== */}
      <Route
        path="/addon/material-cost"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <MaterialCostPage />
          )
        }
      />

      {/* =====================================================
          정산하자체크
          ===================================================== */}
      <Route
        path="/addon/settlement-defect-check"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <SettlementDefectCheckPage />
          )
        }
      />

      {/* =====================================================
          수도검침조회
          ===================================================== */}
      <Route
        path="/addon/water-meter-reading"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <WaterMeterReadingPage />
          )
        }
      />

      {/* =====================================================
          관리일지
          ===================================================== */}
      <Route
        path="/addon/management-log"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <ManagementLog />
          )
        }
      />

      {/* =====================================================
          카드지출
          ===================================================== */}
      <Route
        path="/accounting/card-expense"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <CardExpensePageWrapper />
          )
        }
      />

      {/* =====================================================
          증명서 발급
          ===================================================== */}
      <Route
        path="/certificates"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <CertificateIssuePage />
          )
        }
      />

      {/* =====================================================
          급여대장
          ===================================================== */}
      <Route
        path="/payroll-book"
        element={
          !isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          ) : (
            <PayrollBook />
          )
        }
      />

      {/* =====================================================
          와일드카드
          ===================================================== */}
      <Route
        path="*"
        element={
          isLoggedInEffective ? (
            <Navigate
              to={
                isMobile
                  ? "/mobile/list"
                  : "/main"
              }
              replace
            />
          ) : (
            <Navigate
              to={
                isMobile
                  ? "/mobile/login"
                  : "/login"
              }
              replace
            />
          )
        }
      />
    </Routes>
  );
}

/* =========================================================
 * APP
 * ========================================================= */
function App() {
  /*
   * =====================================================
   * 모바일 상태
   * =====================================================
   *
   * 기존:
   *
   * useState(false)
   *
   * 변경:
   *
   * 앱 실행 즉시 현재 경로와 기기를 판단합니다.
   */
  const [isMobile, setIsMobile] =
    useState(() =>
      detectMobileMode()
    );

  /*
   * 기존 사번/아이디 기반 로그인 상태
   */
  const [employeeId, setEmployeeId] =
    useState("");

  const [userId, setUserId] =
    useState("");

  const [userName, setUserName] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  /*
   * Firebase Auth 상태
   */
  const [authUser, setAuthUser] =
    useState(null);

  const [
    isAuthReady,
    setIsAuthReady,
  ] = useState(false);

  /* =========================================================
     PC 로그인 성공 처리
     ========================================================= */
  const handleLogin = ({
    id,
    employeeNo,
    name,
  }) => {
    setUserId(id);
    setEmployeeId(employeeNo);
    setUserName(name);

    try {
      localStorage.setItem(
        "autoLogin",
        JSON.stringify({
          id,
          employeeNo,
          name,
        })
      );
    } catch {}
  };

  /* =========================================================
     로그아웃
     ========================================================= */
  const handleLogout = async () => {
    try {
      localStorage.removeItem(
        "autoLogin"
      );
    } catch {}

    setUserId("");
    setEmployeeId("");
    setUserName("");

    try {
      await signOut(auth);
    } catch {}
  };

  /* =========================================================
     기존 자동 로그인 정보
     ========================================================= */
  useEffect(() => {
    try {
      const stored =
        localStorage.getItem(
          "autoLogin"
        );

      if (stored) {
        const parsed =
          JSON.parse(stored);

        const {
          id,
          employeeNo,
          name,
        } = parsed || {};

        if (
          id &&
          employeeNo
        ) {
          setUserId(id);
          setEmployeeId(
            employeeNo
          );
          setUserName(
            name || ""
          );
        }
      }
    } catch (e) {
      console.warn(
        "[App] autoLogin parse error:",
        e
      );

      try {
        localStorage.removeItem(
          "autoLogin"
        );
      } catch {}
    }

    setLoading(false);
  }, []);

  /* =========================================================
     Firebase Auth 상태 감지
     ========================================================= */
  useEffect(() => {
    const unsub =
      onAuthStateChanged(
        auth,
        (u) => {
          setAuthUser(
            u || null
          );

          setIsAuthReady(
            true
          );
        }
      );

    return () =>
      unsub();
  }, []);

  /* =========================================================
   * 모바일 / PC 화면 재판정
   * =========================================================
   *
   * 최초 판정:
   * useState(() => detectMobileMode())
   *
   * 이후:
   * - 화면 회전
   * - 창 크기 변경
   * - PWA 복귀
   *
   * 시 다시 검사합니다.
   * ========================================================= */
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        detectMobileMode()
      );
    };

    checkMobile();

    window.addEventListener(
      "resize",
      checkMobile
    );

    window.addEventListener(
      "orientationchange",
      checkMobile
    );

    /*
     * PWA 아이콘으로 다시 열거나
     * 백그라운드에서 복귀한 경우
     */
    window.addEventListener(
      "pageshow",
      checkMobile
    );

    return () => {
      window.removeEventListener(
        "resize",
        checkMobile
      );

      window.removeEventListener(
        "orientationchange",
        checkMobile
      );

      window.removeEventListener(
        "pageshow",
        checkMobile
      );
    };
  }, []);

  if (
    loading ||
    !isAuthReady
  ) {
    return null;
  }

  return (
    <Router>
      <AppRoutes
        employeeId={employeeId}
        userId={userId}
        userName={userName}
        isMobile={isMobile}
        onLogin={handleLogin}
        onLogout={handleLogout}
        isAuthReady={isAuthReady}
        authUser={authUser}
      />
    </Router>
  );
}

export default App;