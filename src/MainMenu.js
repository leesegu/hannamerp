// src/MainMenu.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MoveoutList from "./MoveoutList";
import UserRegisterPage from "./UserRegisterPage";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Trezo 스타일 & 아이콘
import "remixicon/fonts/remixicon.css";
import "./trezo-sidebar.css"; // Trezo에서 sidebar 관련 CSS 가져오기

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
    <div className="main-layout flex">
      <ToastContainer position="top-center" autoClose={3000} limit={1} />

      {/* Trezo 스타일 사이드바 */}
      <aside className="sidebar-area bg-white dark:bg-[#0c1427] fixed h-screen">
        {/* 로고 영역 */}
        <div className="logo border-b px-[25px] py-[15px] flex items-center justify-between">
          <div
            onClick={goHome}
            className="flex items-center cursor-pointer gap-2"
          >
            <i className="ri-home-4-line text-xl"></i>
            <span className="font-bold text-lg">한남주택관리</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-red-500 hover:text-red-600"
            title="로그아웃"
          >
            <i className="ri-logout-box-r-line text-xl"></i>
          </button>
        </div>

        {/* 유저 정보 */}
        <div className="px-[20px] py-[15px] border-b">
          <span className="font-medium block">{userName}</span>
          <span className="text-sm text-gray-400">로그인 중</span>
        </div>

        {/* 메뉴 */}
        <div className="pt-[10px] px-[10px] overflow-y-auto h-[calc(100%-140px)]">
          <div className="accordion">

            {/* 빌라정보 */}
            <div className="accordion-item mb-[5px]">
              <button
                type="button"
                className={`accordion-button flex items-center py-[9px] px-[14px] rounded-md w-full hover:bg-gray-50 dark:hover:bg-[#15203c] ${
                  openMenu === "villa" ? "open" : ""
                }`}
                onClick={() => toggleMenu("villa")}
              >
                <i className="ri-building-4-line mr-2"></i>
                <span>빌라정보</span>
              </button>
              {openMenu === "villa" && (
                <ul className="sidebar-sub-menu pl-[38px] pt-[4px]">
                  <li className="submenu-item">코드별빌라</li>
                  <li className="submenu-item">통신사</li>
                  <li className="submenu-item">승강기</li>
                  <li className="submenu-item">정화조</li>
                  <li className="submenu-item">소방안전</li>
                  <li className="submenu-item">전기안전</li>
                  <li className="submenu-item">상수도</li>
                  <li className="submenu-item">공용전기</li>
                  <li className="submenu-item">건물청소</li>
                  <li className="submenu-item">CCTV</li>
                </ul>
              )}
            </div>

            {/* 이사정산 */}
            <div className="accordion-item mb-[5px]">
              <button
                type="button"
                className={`accordion-button flex items-center py-[9px] px-[14px] rounded-md w-full hover:bg-gray-50 dark:hover:bg-[#15203c] ${
                  openMenu === "moveout" ? "open" : ""
                }`}
                onClick={() => toggleMenu("moveout")}
              >
                <i className="ri-truck-line mr-2"></i>
                <span>이사정산</span>
              </button>
              {openMenu === "moveout" && (
                <ul className="sidebar-sub-menu pl-[38px] pt-[4px]">
                  <li
                    className="submenu-item cursor-pointer"
                    onClick={() =>
                      handleNavigate(
                        <MoveoutList
                          employeeId={employeeId}
                          userId={userId}
                          userName={userName}
                        />
                      )
                    }
                  >
                    이사정산 등록/조회
                  </li>
                </ul>
              )}
            </div>

            {/* 거래처관리 */}
            <div className="accordion-item mb-[5px]">
              <button className="accordion-button flex items-center py-[9px] px-[14px] rounded-md w-full hover:bg-gray-50 dark:hover:bg-[#15203c]">
                <i className="ri-booklet-line mr-2"></i>
                <span>거래처관리</span>
              </button>
            </div>

            {/* 영수증발행 */}
            <div className="accordion-item mb-[5px]">
              <button className="accordion-button flex items-center py-[9px] px-[14px] rounded-md w-full hover:bg-gray-50 dark:hover:bg-[#15203c]">
                <i className="ri-receipt-line mr-2"></i>
                <span>영수증발행</span>
              </button>
            </div>

            {/* 사원관리 */}
            <div className="accordion-item mb-[5px]">
              <button className="accordion-button flex items-center py-[9px] px-[14px] rounded-md w-full hover:bg-gray-50 dark:hover:bg-[#15203c]">
                <i className="ri-user-line mr-2"></i>
                <span>사원관리</span>
              </button>
            </div>

            {/* 기초등록 */}
            <div className="accordion-item mb-[5px]">
              <button
                type="button"
                className={`accordion-button flex items-center py-[9px] px-[14px] rounded-md w-full hover:bg-gray-50 dark:hover:bg-[#15203c] ${
                  openMenu === "settings" ? "open" : ""
                }`}
                onClick={() => toggleMenu("settings")}
              >
                <i className="ri-settings-3-line mr-2"></i>
                <span>기초등록</span>
              </button>
              {openMenu === "settings" && (
                <ul className="sidebar-sub-menu pl-[38px] pt-[4px]">
                  <li
                    className="submenu-item cursor-pointer"
                    onClick={() => handleNavigate(<UserRegisterPage />)}
                  >
                    사원코드생성
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* 메인 콘텐츠 영역 */}
      <div className="main-content flex-1 ml-[240px] p-4">
        {activeContent}
      </div>
    </div>
  );
}

export default MainMenu;
