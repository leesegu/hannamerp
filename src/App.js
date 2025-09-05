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
import UserRegisterPage from "./UserRegisterPage";
import MobileMainPage from "./components/MobileMainPage";

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

function AppRoutes({ employeeId, userId, userName, isMobile, onLogin }) {
  const navigate = useNavigate();
  const isLoggedIn = employeeId && userId;

  return (
    <Routes>
      {/* 로그인 */}
      <Route path="/login" element={<LoginPage onLogin={onLogin} />} />

      {/* 메인 (PC/모바일 분기) */}
      <Route
        path="/main"
        element={
          !isLoggedIn ? (
            <Navigate to="/login" />
          ) : isMobile ? (
            <MobileMainPage employeeId={employeeId} userId={userId} userName={userName} />
          ) : (
            <TrezoSidebar employeeId={employeeId} userId={userId} userName={userName} />
          )
        }
      />

      {/* ✅ PC용 등록 페이지 (단독 라우트). ?popup=1이면 중앙 모달로 표시 */}
      <Route
        path="/form"
        element={
          !isLoggedIn ? (
            <Navigate to="/login" />
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

      {/* 모바일용 기존 라우트 유지 */}
      <Route
        path="/mobile/form"
        element={
          !isLoggedIn ? (
            <Navigate to="/login" />
          ) : (
            <MoveoutForm
              employeeId={employeeId}
              userId={userId}
              isMobile={true}
              onDone={() => navigate(-1)}
            />
          )
        }
      />
      <Route
        path="/mobile/list"
        element={
          !isLoggedIn ? (
            <Navigate to="/login" />
          ) : (
            <MoveoutList employeeId={employeeId} userId={userId} isMobile={true} />
          )
        }
      />

      {/* 빌라 및 세부 항목 */}
      <Route path="/villa" element={!isLoggedIn ? <Navigate to="/login" /> : <VillaCodePage />} />
      <Route path="/telco" element={!isLoggedIn ? <Navigate to="/login" /> : <TelcoPage />} />
      <Route path="/elevator" element={!isLoggedIn ? <Navigate to="/login" /> : <ElevatorPage />} />
      <Route path="/septic" element={!isLoggedIn ? <Navigate to="/login" /> : <SepticPage />} />
      <Route path="/fire-safety" element={!isLoggedIn ? <Navigate to="/login" /> : <FireSafetyPage />} />
      <Route path="/electric-safety" element={!isLoggedIn ? <Navigate to="/login" /> : <ElectricSafetyPage />} />
      <Route path="/water" element={!isLoggedIn ? <Navigate to="/login" /> : <WaterPage />} />
      <Route path="/public-electric" element={!isLoggedIn ? <Navigate to="/login" /> : <PublicElectricPage />} />
      <Route path="/cleaning" element={!isLoggedIn ? <Navigate to="/login" /> : <CleaningPage />} />
      <Route path="/cctv" element={!isLoggedIn ? <Navigate to="/login" /> : <CctvPage />} />

      {/* 주메뉴: 거래처관리 메인(예시) */}
      <Route
        path="/vendors"
        element={
          !isLoggedIn ? (
            <Navigate to="/login" />
          ) : (
            <div className="p-6">거래처관리 (준비 중)</div>
          )
        }
      />

      {/* 기초등록: 거래처등록 */}
      <Route
        path="/basic/vendor-register"
        element={!isLoggedIn ? <Navigate to="/login" /> : <VendorRegisterPage />}
      />

      {/* 사원관리 */}
      <Route
        path="/employee"
        element={!isLoggedIn ? <Navigate to="/login" /> : <EmployeePage />}
      />

      {/* 와일드카드 */}
      <Route
        path="*"
        element={<Navigate to={isLoggedIn ? "/main" : "/login"} />}
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
      />
    </Router>
  );
}

export default App;
