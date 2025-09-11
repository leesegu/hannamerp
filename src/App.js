// src/App.js
import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

import LoginPage from "./LoginPage";
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

/* ✅ 영수증 발행 리스트 페이지 */
import ReceiptIssuePage from "./pages/ReceiptIssuePage";

/* ✅ 관리비회계 · 수입정리 페이지 */
import IncomeImportPage from "./pages/IncomeImportPage";

/* ✅ 전기요금 추출(문자 추출) 페이지 */
import MessageExtractor from "./pages/MessageExtractor";

/* ✅ 캘린더 페이지 */
import CalendarPage from "./pages/CalendarPage";

/* ✅ 부가서비스 · 도배 */
import PaperingPage from "./pages/PaperingPage";

import "./App.css";

function AppRoutes({ employeeId, userId, userName, isMobile, onLogin, onLogout }) {
  const navigate = useNavigate();
  const isLoggedIn = employeeId && userId;

  return (
    <Routes>
      <Route
        path="/"
        element={
          isLoggedIn
            ? <Navigate to={isMobile ? "/mobile/list" : "/main"} replace />
            : <Navigate to="/login" replace />
        }
      />

      {/* 로그인 */}
      <Route
        path="/login"
        element={
          isLoggedIn
            ? <Navigate to={isMobile ? "/mobile/list" : "/main"} replace />
            : <LoginPage onLogin={onLogin} />
        }
      />

      {/* 메인 (PC: 사이드바, 모바일: 리스트로 리다이렉트) */}
      <Route
        path="/main"
        element={
          !isLoggedIn ? (
            <Navigate to="/login" replace />
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
          !isLoggedIn ? (
            <Navigate to="/login" replace />
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
          !isLoggedIn ? (
            <Navigate to="/login" replace />
          ) : (
            <MoveoutFormMobile employeeId={employeeId} userId={userId} />
          )
        }
      />

      {/* 모바일 조회 */}
      <Route
        path="/mobile/list"
        element={
          !isLoggedIn ? (
            <Navigate to="/login" replace />
          ) : (
            <MoveoutListMobile employeeId={employeeId} userId={userId} />
          )
        }
      />

      {/* PC 조회 */}
      <Route
        path="/list"
        element={
          !isLoggedIn ? (
            <Navigate to="/login" replace />
          ) : (
            <MoveoutList employeeId={employeeId} userId={userId} />
          )
        }
      />

      {/* 영수증 발행 리스트 */}
      <Route
        path="/receipts"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <ReceiptIssuePage />}
      />

      {/* ✅ 관리비회계 · 수입정리 */}
      <Route
        path="/accounting/income"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <IncomeImportPage />}
      />

      {/* ✅ 전기요금 추출(문자) 페이지 라우트 */}
      <Route
        path="/extract"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <MessageExtractor />}
      />

      {/* ✅ 캘린더 라우트 */}
      <Route
        path="/calendar"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <CalendarPage />}
      />

      {/* ✅ 부가서비스 · 도배 라우트 */}
      <Route
        path="/papering"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <PaperingPage />}
      />

      {/* 기타 메뉴 */}
      <Route path="/villa" element={!isLoggedIn ? <Navigate to="/login" replace /> : <VillaCodePage />} />
      <Route path="/telco" element={!isLoggedIn ? <Navigate to="/login" replace /> : <TelcoPage />} />
      <Route path="/elevator" element={!isLoggedIn ? <Navigate to="/login" replace /> : <ElevatorPage />} />
      <Route path="/septic" element={!isLoggedIn ? <Navigate to="/login" replace /> : <SepticPage />} />
      <Route path="/fire-safety" element={!isLoggedIn ? <Navigate to="/login" replace /> : <FireSafetyPage />} />
      <Route path="/electric-safety" element={!isLoggedIn ? <Navigate to="/login" replace /> : <ElectricSafetyPage />} />
      <Route path="/water" element={!isLoggedIn ? <Navigate to="/login" replace /> : <WaterPage />} />
      <Route path="/public-electric" element={!isLoggedIn ? <Navigate to="/login" replace /> : <PublicElectricPage />} />
      <Route path="/cleaning" element={!isLoggedIn ? <Navigate to="/login" replace /> : <CleaningPage />} />
      <Route path="/cctv" element={!isLoggedIn ? <Navigate to="/login" replace /> : <CctvPage />} />

      {/* 기초등록/사원 */}
      <Route path="/basic/vendor-register" element={!isLoggedIn ? <Navigate to="/login" replace /> : <VendorRegisterPage />} />
      <Route path="/employee" element={!isLoggedIn ? <Navigate to="/login" replace /> : <EmployeePage />} />

      {/* 와일드카드 */}
      <Route
        path="*"
        element={
          isLoggedIn ? (
            <Navigate to={isMobile ? "/mobile/list" : "/main"} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}

function App() {
  const [isMobile, setIsMobile] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);

  const handleLogin = ({ id, employeeNo, name }) => {
    setUserId(id);
    setEmployeeId(employeeNo);
    setUserName(name);
    localStorage.setItem("autoLogin", JSON.stringify({ id, employeeNo, name }));
  };

  const handleLogout = () => {
    try { localStorage.removeItem("autoLogin"); } catch {}
    setUserId("");
    setEmployeeId("");
    setUserName("");
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

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (loading) return null;

  return (
    <Router>
      <AppRoutes
        employeeId={employeeId}
        userId={userId}
        userName={userName}
        isMobile={isMobile}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />
    </Router>
  );
}

export default App;
