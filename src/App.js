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
import MobileLogin from "./pages/MobileLogin"; // ✅ 모바일 전용 로그인 추가

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
/* ✅ 월마감 추가 */
import MonthlyClosePage from "./pages/MonthlyClosePage";
/* ✅ 연간시트 추가 (직접 URL 진입용 라우트) */
import AnnualSheetPage from "./pages/AnnualSheetPage";

/* ✅ 대금결제 관리 */
import PaymentSettlementPage from "./pages/PaymentSettlementPage.jsx";

import MessageExtractor from "./pages/MessageExtractor";
/* ✅ 공용전기 계산 라우트 추가 */
import PublicElectricCalcPage from "./pages/PublicElectricCalcPage";
import CalendarPage from "./pages/CalendarPage";
import PaperingPage from "./pages/PaperingPage";
import MemoPage from "./pages/MemoPage";

/* ✅ 추가: 모바일 전용 캘린더 라우트에 사용할 컴포넌트 import */
import MobileCalendarPage from "./pages/MobileCalendarPage";

/* ✅ 추가: 모바일 전용 개인 장부 페이지 import */
import MobilePersonalLedgerPage from "./pages/MobilePersonalLedgerPage";

/* ✅ 추가: 일정관리(어제·오늘·내일 + 대형 달력) */
import ScheduleManager from "./pages/ScheduleManager";

import "./App.css";

/* ✅ Firebase Auth 상태도 함께 인지해서 모바일 로그인과 동작 일치 */
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

function AppRoutes({ employeeId, userId, userName, isMobile, onLogin, onLogout, isAuthReady, authUser }) {
  const navigate = useNavigate();

  // ✅ 앱 로컬 로그인(사번/아이디) OR Firebase Auth 중 하나라도 있으면 로그인 상태로 간주
  const isLoggedInEffective = Boolean((employeeId && userId) || authUser);

  if (!isAuthReady) {
    // Firebase Auth 초기화 대기
    return null;
  }

  return (
    <Routes>
      {/* 루트: 환경/로그인 상태별 분기 */}
      <Route
        path="/"
        element={
          isLoggedInEffective
            ? <Navigate to={isMobile ? "/mobile/list" : "/main"} replace />
            : <Navigate to={isMobile ? "/mobile/login" : "/login"} replace />
        }
      />

      {/* PC 로그인 */}
      <Route
        path="/login"
        element={
          isLoggedInEffective
            ? <Navigate to={isMobile ? "/mobile/list" : "/main"} replace />
            : (isMobile ? <Navigate to="/mobile/login" replace /> : <LoginPage onLogin={onLogin} />)
        }
      />

      {/* ✅ 모바일 전용 로그인 */}
      <Route
        path="/mobile/login"
        element={
          isLoggedInEffective
            ? <Navigate to="/mobile/list" replace />
            : <MobileLogin /* onLogin={onLogin} 전달해도 무방 */ />
        }
      />

      {/* 메인 */}
      <Route
        path="/main"
        element={
          !isLoggedInEffective ? (
            <Navigate to={isMobile ? "/mobile/login" : "/login"} replace />
          ) : isMobile ? (
            <Navigate to="/mobile/list" replace />
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

      {/* PC 등록/수정 */}
      <Route
        path="/form"
        element={
          !isLoggedInEffective ? (
            <Navigate to={isMobile ? "/mobile/login" : "/login"} replace />
          ) : (
            <MoveoutForm
              employeeId={employeeId}
              userId={userId}
              isMobile={false}
              onDone={() => navigate(-1)}
            />
          )
        }
      />

      {/* 모바일 등록/수정 */}
      <Route
        path="/mobile/form"
        element={
          !isLoggedInEffective ? (
            <Navigate to="/mobile/login" replace />
          ) : (
            <MoveoutFormMobile employeeId={employeeId} userId={userId} />
          )
        }
      />

      {/* 모바일 조회 */}
      <Route
        path="/mobile/list"
        element={
          !isLoggedInEffective ? (
            <Navigate to="/mobile/login" replace />
          ) : (
            <MoveoutListMobile employeeId={employeeId} userId={userId} />
          )
        }
      />

      {/* ✅ 모바일 전용 캘린더 */}
      <Route
        path="/calendar-mobile"
        element={
          !isLoggedInEffective ? (
            <Navigate to="/mobile/login" replace />
          ) : (
            <MobileCalendarPage />
          )
        }
      />

      {/* ✅ 모바일 전용 개인 장부 */}
      <Route
        path="/mobile/personal-ledger"
        element={
          !isLoggedInEffective ? (
            <Navigate to="/mobile/login" replace />
          ) : (
            <MobilePersonalLedgerPage />
          )
        }
      />

      {/* PC 조회 */}
      <Route
        path="/list"
        element={
          !isLoggedInEffective ? (
            <Navigate to={isMobile ? "/mobile/login" : "/login"} replace />
          ) : (
            <MoveoutList employeeId={employeeId} userId={userId} />
          )
        }
      />

      {/* 영수증 발행 리스트 */}
      <Route
        path="/receipts"
        element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <ReceiptIssuePage />}
      />

      {/* 관리비회계 · 수입정리 */}
      <Route
        path="/accounting/income"
        element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <IncomeImportPage />}
      />

      {/* 관리비회계 · 지출정리 */}
      <Route
        path="/accounting/expense"
        element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <ExpensePage />}
      />

      {/* ✅ 관리비회계 · 대금결제 관리 */}
      <Route
        path="/accounting/payment-settlement"
        element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <PaymentSettlementPage />}
      />

      {/* 관리비회계 · 일마감 */}
      <Route
        path="/accounting/daily-close"
        element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <DailyClosePage />}
      />

      {/* 관리비회계 · 월마감 */}
      <Route
        path="/accounting/monthly-close"
        element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <MonthlyClosePage />}
      />

      {/* ✅ 관리비회계 · 연간시트 (직접 URL 접근용) */}
      <Route
        path="/accounting/annual-sheet"
        element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <AnnualSheetPage />}
      />

      {/* 전기요금 추출 */}
      <Route
        path="/extract"
        element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <MessageExtractor />}
      />

      {/* ✅ 공용전기 계산 (직접 URL 접근용 라우트 추가) */}
      <Route
        path="/public-electric-calc"
        element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <PublicElectricCalcPage />}
      />

      {/* 캘린더 */}
      <Route
        path="/calendar"
        element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <CalendarPage />}
      />

      {/* ✅ 일정관리(어제/오늘/내일 + 대형 달력 + 개인/공유 + 알람) */}
      <Route
        path="/schedule"
        element={
          !isLoggedInEffective ? (
            <Navigate to={isMobile ? "/mobile/login" : "/login"} replace />
          ) : (
            <ScheduleManager />
          )
        }
      />

      {/* 부가서비스 */}
      <Route
        path="/papering"
        element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <PaperingPage />}
      />

      {/* 메모 */}
      <Route
        path="/memo"
        element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <MemoPage userId={userId} />}
      />

      {/* 기타 메뉴 */}
      <Route path="/villa" element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <VillaCodePage />} />
      <Route path="/telco" element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <TelcoPage />} />
      <Route path="/elevator" element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <ElevatorPage />} />
      <Route path="/septic" element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <SepticPage />} />
      <Route path="/fire-safety" element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <FireSafetyPage />} />
      <Route path="/electric-safety" element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <ElectricSafetyPage />} />
      <Route path="/water" element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <WaterPage />} />
      <Route path="/public-electric" element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <PublicElectricPage />} />
      <Route path="/cleaning" element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <CleaningPage />} />
      <Route path="/cctv" element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <CctvPage />} />

      {/* 기초등록/사원 */}
      <Route path="/basic/vendor-register" element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <VendorRegisterPage />} />
      <Route path="/employee" element={!isLoggedInEffective ? <Navigate to={isMobile ? "/mobile/login" : "/login"} replace /> : <EmployeePage />} />

      {/* 와일드카드 */}
      <Route
        path="*"
        element={
          isLoggedInEffective ? (
            <Navigate to={isMobile ? "/mobile/list" : "/main"} replace />
          ) : (
            <Navigate to={isMobile ? "/mobile/login" : "/login"} replace />
          )
        }
      />
    </Routes>
  );
}

function App() {
  const [isMobile, setIsMobile] = useState(false);

  // 기존(사번/아이디 기반) 로컬 로그인 상태
  const [employeeId, setEmployeeId] = useState("");
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);

  // ✅ Firebase Auth 상태
  const [authUser, setAuthUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const handleLogin = ({ id, employeeNo, name }) => {
    setUserId(id);
    setEmployeeId(employeeNo);
    setUserName(name);
    try { localStorage.setItem("autoLogin", JSON.stringify({ id, employeeNo, name })); } catch {}
  };

  const handleLogout = async () => {
    try { localStorage.removeItem("autoLogin"); } catch {}
    setUserId("");
    setEmployeeId("");
    setUserName("");
    // ✅ 모바일(Firebase Auth) 로그아웃도 함께 시도 (실패해도 무시)
    try { await signOut(auth); } catch {}
  };

  useEffect(() => {
    const stored = localStorage.getItem("autoLogin");
    if (stored) {
      const { id, employeeNo, name } = JSON.parse(stored);
      setUserId(id);
      setEmployeeId(employeeNo);
      setUserName(name);
    }
    setLoading(false);
  }, []);

  // ✅ 모바일 로그인(Firebase Auth) 상태 감지
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setIsAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (loading || !isAuthReady) return null;

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
