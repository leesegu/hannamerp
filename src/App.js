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
import MoveoutList from "./MoveoutList";
import UserRegisterPage from "./UserRegisterPage";
import MobileMainPage from "./components/MobileMainPage";

// 각 페이지 import
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

import "./App.css";

function AppRoutes({ employeeId, userId, userName, isMobile }) {
  const navigate = useNavigate();
  const isLoggedIn = employeeId && userId;

  return (
    <Routes>
      {/* 로그인 */}
      <Route path="/login" element={<LoginPage onLogin={() => {}} />} />

      {/* 메인 */}
      <Route
        path="/main"
        element={
          !isLoggedIn ? (
            <Navigate to="/login" />
          ) : isMobile ? (
            <MobileMainPage
              employeeId={employeeId}
              userId={userId}
              userName={userName}
            />
          ) : (
            <TrezoSidebar
              employeeId={employeeId}
              userId={userId}
              userName={userName}
            />
          )
        }
      />

      {/* 모바일 등록 */}
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

      {/* 모바일 조회 */}
      <Route
        path="/mobile/list"
        element={
          !isLoggedIn ? (
            <Navigate to="/login" />
          ) : (
            <MoveoutList
              employeeId={employeeId}
              userId={userId}
              isMobile={true}
            />
          )
        }
      />

      {/* 💡 빌라 및 세부 항목 */}
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

      {/* 거래처 등록 */}
      <Route path="/vendor-register" element={!isLoggedIn ? <Navigate to="/login" /> : <VendorRegisterPage />} />

      {/* 사원 등록 */}
      <Route path="/register" element={<UserRegisterPage />} />

      {/* 그 외 모든 경로는 로그인으로 */}
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

function App() {
  const [isMobile, setIsMobile] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);

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
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
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
      />
    </Router>
  );
}

export default App;
