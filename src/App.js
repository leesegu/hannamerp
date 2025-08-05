import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import LoginPage from "./LoginPage";
import MainMenu from "./MainMenu";
import MoveoutForm from "./MoveoutForm";
import MoveoutList from "./MoveoutList";
import UserRegisterPage from "./UserRegisterPage";
import MobileMainPage from "./components/MobileMainPage";
import "./App.css";

// ✅ 내부 라우터를 사용하기 위한 래퍼 컴포넌트
function AppRoutes({ employeeId, userId, userName, isMobile }) {
  const navigate = useNavigate();
  const isLoggedIn = employeeId && userId;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={() => {}} />} />

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
            <MainMenu
              employeeId={employeeId}
              userId={userId}
              userName={userName}
            />
          )
        }
      />

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
              onDone={() => navigate(-1)} // ✅ 저장 후 뒤로가기
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
            <MoveoutList
              employeeId={employeeId}
              userId={userId}
              isMobile={true}
            />
          )
        }
      />

      <Route path="/register" element={<UserRegisterPage />} />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

// ✅ 메인 App 컴포넌트
function App() {
  const [isMobile, setIsMobile] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);

  // 로그인 정보 로딩
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

  // 모바일 여부 판단
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 로그인 완료 시 처리
  const handleLogin = ({ employeeNo, id, name }) => {
    setEmployeeId(employeeNo);
    setUserId(id);
    setUserName(name);
  };

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
