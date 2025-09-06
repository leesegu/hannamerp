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
import MoveoutListMobile from "./pages/MoveoutList.mobile"; // ✅ 모바일 전용 리스트
import MoveoutFormMobile from "./pages/MoveoutForm.mobile"; // ✅ 모바일 전용 등록/수정

import UserRegisterPage from "./UserRegisterPage";
// import MobileMainPage from "./components/MobileMainPage"; // ❌ 사용 안 함: 임포트 제거

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

import "./App.css";

function AppRoutes({ employeeId, userId, userName, isMobile, onLogin, onLogout }) {
  const navigate = useNavigate();
  const isLoggedIn = employeeId && userId;

  return (
    <Routes>
      {/* ✅ 루트: 기기/로그인 상태에 따라 초기 경로 분기 */}
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

      {/* 메인 (PC/모바일 분기) — 모바일에선 메인 생략하고 바로 조회로 */}
      <Route
        path="/main"
        element={
          !isLoggedIn ? (
            <Navigate to="/login" replace />
          ) : isMobile ? (
            <Navigate to="/mobile/list" replace />
          ) : (
            // ✅ TrezoSidebar에 로그아웃 핸들러 전달
            <TrezoSidebar
              employeeId={employeeId}
              userId={userId}
              userName={userName}
              onLogout={onLogout}
            />
          )
        }
      />

      {/* ✅ PC용 등록/수정 페이지 (단독 라우트). ?id=... 있으면 수정모드 */}
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

      {/* ✅ 모바일용 등록/수정 페이지 */}
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

      {/* ✅ 모바일 전용 '조회' 페이지 */}
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

      {/* PC용 이사정산 '조회' 페이지 (필요 시 유지) */}
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

      {/* 빌라 및 세부 항목 */}
      <Route
        path="/villa"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <VillaCodePage />}
      />
      <Route
        path="/telco"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <TelcoPage />}
      />
      <Route
        path="/elevator"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <ElevatorPage />}
      />
      <Route
        path="/septic"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <SepticPage />}
      />
      <Route
        path="/fire-safety"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <FireSafetyPage />}
      />
      <Route
        path="/electric-safety"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <ElectricSafetyPage />}
      />
      <Route
        path="/water"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <WaterPage />}
      />
      <Route
        path="/public-electric"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <PublicElectricPage />}
      />
      <Route
        path="/cleaning"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <CleaningPage />}
      />
      <Route
        path="/cctv"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <CctvPage />}
      />

      {/* 주메뉴: 거래처관리 메인(예시) */}
      <Route
        path="/vendors"
        element={
          !isLoggedIn ? (
            <Navigate to="/login" replace />
          ) : (
            <div className="p-6">거래처관리 (준비 중)</div>
          )
        }
      />

      {/* 기초등록: 거래처등록 */}
      <Route
        path="/basic/vendor-register"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <VendorRegisterPage />}
      />

      {/* 사원관리 */}
      <Route
        path="/employee"
        element={!isLoggedIn ? <Navigate to="/login" replace /> : <EmployeePage />}
      />

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
    // isLoggedIn이 false가 되면 라우터 가드가 /login으로 보냅니다.
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
      {/* ✅ AppRoutes에 로그인/로그아웃 핸들러 전달 */}
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
