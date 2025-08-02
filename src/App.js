import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./LoginPage";
import MainMenu from "./MainMenu";
import MoveoutForm from "./MoveoutForm";
import MoveoutList from "./MoveoutList";
import MobileLayout from "./components/MobileLayout";
import UserRegisterPage from "./UserRegisterPage";
import "./App.css";

function App() {
  const [isMobile, setIsMobile] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("autoLogin");
    if (stored) {
      const { id, employeeNo, name } = JSON.parse(stored);
      setUserId(id);
      setEmployeeId(employeeNo);
      setUserName(name);
    }
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleLogin = ({ employeeNo, id, name }) => {
    setEmployeeId(employeeNo);
    setUserId(id);
    setUserName(name);
  };

  const isLoggedIn = employeeId && userId;

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />

        <Route
          path="/main"
          element={
            !isLoggedIn ? (
              <Navigate to="/login" />
            ) : isMobile ? (
              <MobileLayout />
            ) : (
              <MainMenu employeeId={employeeId} userId={userId} userName={userName} />
            )
          }
        />

<Route
  path="/moveout"
  element={
    !isLoggedIn ? (
      <Navigate to="/login" />
    ) : isMobile ? (
      <MoveoutForm
        key={Date.now()} // ✅ 이 줄 추가!
        employeeId={employeeId}
        userId={userId}
        userName={userName}
      />
    ) : (
      <MainMenu
        employeeId={employeeId}
        userId={userId}
        userName={userName}
        content={
          <MoveoutForm
            key={Date.now()} // ✅ 이 줄 추가!
            employeeId={employeeId}
            userId={userId}
            userName={userName}
          />
        }
      />
    )
  }
/>


        <Route
          path="/moveout-list"
          element={
            !isLoggedIn ? (
              <Navigate to="/login" />
            ) : isMobile ? (
              <MoveoutList employeeId={employeeId} userId={userId} userName={userName} />
            ) : (
              <MainMenu
                employeeId={employeeId}
                userId={userId}
                userName={userName}
                content={
                  <MoveoutList
                    employeeId={employeeId}
                    userId={userId}
                    userName={userName}
                  />
                }
              />
            )
          }
        />

        <Route path="/register" element={<UserRegisterPage />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
