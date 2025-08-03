import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./LoginPage";
import MainMenu from "./MainMenu";
import MoveoutForm from "./MoveoutForm";
import MoveoutList from "./MoveoutList";
import UserRegisterPage from "./UserRegisterPage";
import MobileMainPage from "./components/MobileMainPage";
import MobileMoveoutForm from "./components/MobileMoveoutForm";
import MobileMoveoutList from "./components/MobileMoveoutList";
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
          path="/moveout-form"
          element={
            !isLoggedIn ? (
              <Navigate to="/login" />
            ) : isMobile ? (
              <MobileMoveoutForm employeeId={employeeId} userId={userId} />
            ) : (
              <MainMenu
                employeeId={employeeId}
                userId={userId}
                userName={userName}
                content={
                  <MoveoutForm
                    employeeId={employeeId}
                    userId={userId}
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
              <MobileMoveoutList employeeId={employeeId} userId={userId} />
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
