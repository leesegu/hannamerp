// src/MainMenu.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MoveoutForm from "./MoveoutForm";
import MoveoutList from "./MoveoutList";
import UserRegisterPage from "./UserRegisterPage"; // ✅
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./MainMenu.css";

function MainMenu({ content, employeeId, userId, userName }) {
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState("");
  const [activeContent, setActiveContent] = useState(content || null);

  useEffect(() => {
    if (userName) {
      toast.success(`${userName}님 환영합니다!\n오늘도 좋은 하루 되세요 😊`, {
        position: "top-center",
        autoClose: 3000,
        style: {
          width: "auto",
          maxWidth: "90%",
          textAlign: "center",
          whiteSpace: "pre-line",
          fontSize: "16px",
          padding: "12px 20px",
        },
      });
    }
  }, [userName]);

  const toggleMenu = (menu) => {
    setOpenMenu(openMenu === menu ? "" : menu);
  };

  const handleNavigate = (component) => {
    setActiveContent(component);
  };

  const handleLogout = () => {
    localStorage.removeItem("autoLogin");
    navigate("/login");
  };

  const goHome = () => {
    setActiveContent(null);
    navigate("/main");
  };

  return (
    <div className="main-layout">
      <ToastContainer position="top-center" autoClose={3000} limit={1} />
      <div className="sidebar">
        <div className="logo" onClick={goHome} style={{ cursor: "pointer" }}>
          한남주택관리
        </div>

        <div className="user-info">
          <span className="logged-in-user">{userName}</span>
          <button className="logout-button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>

        <div className="menu-group">
          <div className="menu-item" onClick={() => toggleMenu("villa")}>
            🏠 빌라정보
          </div>
          {openMenu === "villa" && (
            <div className="submenu">
              <div className="submenu-item">코드별빌라</div>
              <div className="submenu-item">통신사</div>
              <div className="submenu-item">승강기</div>
              <div className="submenu-item">정화조</div>
              <div className="submenu-item">소방안전</div>
              <div className="submenu-item">전기안전</div>
              <div className="submenu-item">상수도</div>
              <div className="submenu-item">공용전기</div>
              <div className="submenu-item">건물청소</div>
              <div className="submenu-item">CCTV</div>
            </div>
          )}

          <div className="menu-item" onClick={() => toggleMenu("moveout")}>
            📦 이사정산
          </div>
          {openMenu === "moveout" && (
            <div className="submenu">
              <div
                className="submenu-item"
onClick={() =>
  handleNavigate(
    <MoveoutForm
      key={Date.now()} // ✅ 매번 새로운 키로 강제 리렌더링
      employeeId={employeeId}
      userId={userId}
      userName={userName}
    />
  )
}

              >
                이사정산입력
              </div>
              <div
                className="submenu-item"
                onClick={() =>
                  handleNavigate(
                    <MoveoutList employeeId={employeeId} userId={userId} userName={userName} />
                  )
                }
              >
                이사정산조회
              </div>
            </div>
          )}

          <div className="menu-item">📒 거래처관리</div>
          <div className="menu-item">🧾 영수증발행</div>
          <div className="menu-item">👤 사원관리</div>

          <div className="menu-item" onClick={() => toggleMenu("settings")}>
            ⚙️ 기초등록
          </div>
          {openMenu === "settings" && (
            <div className="submenu">
              <div className="submenu-item" onClick={() => handleNavigate(<UserRegisterPage />)}>
                사원코드생성
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="main-content">{activeContent}</div>
    </div>
  );
}

export default MainMenu;
