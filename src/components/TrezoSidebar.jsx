// src/components/TrezoSidebar.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import MoveoutList from "../pages/MoveoutList";
import UserRegisterPage from "../UserRegisterPage";
import VillaCodePage from "../pages/VillaCodePage";
import TelcoPage from "../pages/TelcoPage";
import ElevatorPage from "../pages/ElevatorPage";
import SepticPage from "../pages/SepticPage";
import FireSafetyPage from "../pages/FireSafetyPage";
import ElectricSafetyPage from "../pages/ElectricSafetyPage";
import WaterPage from "../pages/WaterPage";
import PublicElectricPage from "../pages/PublicElectricPage";
import CleaningPage from "../pages/CleaningPage";
import CctvPage from "../pages/CctvPage";
import VendorRegisterPage from "../pages/VendorRegisterPage";
import VendorsMainPage from "../pages/VendorsMainPage.js";
import EmployeePage from "../pages/EmployeePage";
import ReceiptIssuePage from "../pages/ReceiptIssuePage";
import MoveInCleaningPage from "../pages/MoveInCleaningPage"; // ✅ 입주청소 페이지 연결

import "remixicon/fonts/remixicon.css";

/* 임시 플레이스홀더 (실제 페이지 연결 전까지 사용) */
const ComingSoon = ({ title }) => (
  <div className="p-6">
    <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
    <p className="text-gray-500 mt-2">준비 중입니다. (UI/데이터 스펙 확정 후 연결 예정)</p>
  </div>
);

const SidebarItem = ({ icon, label, onClick, active, hasChildren, isOpen }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between text-sm px-3 py-2 rounded-md transition-colors ${
      active
        ? "bg-gray-100 text-purple-600"
        : "text-gray-700 hover:bg-gray-100 hover:text-purple-600"
    }`}
  >
    <div className="flex items-center gap-2">
      <i className={`${icon} text-lg`}></i>
      <span>{label}</span>
    </div>
    {hasChildren && (
      <i
        className={`ri-arrow-down-s-line text-base transform transition-transform duration-200 ${
          isOpen ? "rotate-0" : "-rotate-90"
        }`}
      />
    )}
  </button>
);

const SidebarSubmenu = ({ items = [], onClick, activeMenu }) => (
  <ul className="pl-6 mt-1 space-y-1 text-sm text-gray-600">
    {items.map((item) => (
      <li
        key={item}
        className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors
          ${
            activeMenu === item
              ? "bg-purple-100 text-purple-600"
              : "hover:bg-purple-50 hover:text-purple-600"
          }
        `}
        onClick={() => onClick?.(item)}
      >
        <i className="ri-arrow-right-s-line text-base"></i>
        {item}
      </li>
    ))}
  </ul>
);

const TrezoSidebar = ({ employeeId, userId, userName, onLogout }) => {
  const navigate = useNavigate();
  const [activeContent, setActiveContent] = useState(null);
  const [openMenu, setOpenMenu] = useState("");
  const [activeMenu, setActiveMenu] = useState("");

  const handleNavigate = (component, menuKey) => {
    setActiveContent(component);
    setActiveMenu(menuKey);
  };

  const handleLogout = () => {
    onLogout?.();
    navigate("/login", { replace: true });
  };

  const goHome = () => {
    setActiveContent(null);
    setActiveMenu("");
    setOpenMenu("");
    navigate("/main");
  };

  return (
    <div className="flex w-full h-screen">
      {/* 사이드바 */}
      <aside className="w-60 h-full bg-white border-r border-gray-200 flex flex-col">
        {/* 로고 */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div onClick={goHome} className="flex items-center gap-2 cursor-pointer">
            <i className="ri-home-4-line text-xl text-gray-700"></i>
            <span className="font-bold text-lg text-gray-800">한남주택관리</span>
          </div>
        </div>

        {/* 사용자 정보 + 로그아웃 */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="font-medium text-gray-800">{userName}</div>
            <div className="text-sm text-gray-400">로그인 중</div>
          </div>
          <button
            onClick={handleLogout}
            className="text-red-500 hover:text-red-600"
            title="로그아웃"
          >
            <i className="ri-logout-box-r-line text-xl"></i>
          </button>
        </div>

        {/* 메뉴 */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <nav className="space-y-2">
            {/* 1) 빌라정보 */}
            <div>
              <SidebarItem
                icon="ri-building-4-line"
                label="빌라정보"
                onClick={() => {
                  const newState = openMenu === "villa" ? "" : "villa";
                  setOpenMenu(newState);
                  setActiveMenu("빌라정보");
                }}
                active={activeMenu === "빌라정보"}
                hasChildren
                isOpen={openMenu === "villa"}
              />
              {openMenu === "villa" && (
                <SidebarSubmenu
                  items={[
                    "코드별빌라",
                    "통신사",
                    "승강기",
                    "정화조",
                    "소방안전",
                    "전기안전",
                    "상수도",
                    "공용전기",
                    "건물청소",
                    "CCTV",
                  ]}
                  activeMenu={activeMenu}
                  onClick={(item) => {
                    setActiveMenu(item);
                    const pages = {
                      코드별빌라: <VillaCodePage />,
                      통신사: <TelcoPage />,
                      승강기: <ElevatorPage />,
                      정화조: <SepticPage />,
                      소방안전: <FireSafetyPage />,
                      전기안전: <ElectricSafetyPage />,
                      상수도: <WaterPage />,
                      공용전기: <PublicElectricPage />,
                      건물청소: <CleaningPage />,
                      CCTV: <CctvPage />,
                    };
                    handleNavigate(pages[item] ?? <ComingSoon title={item} />, item);
                  }}
                />
              )}
            </div>

            {/* 2) 이사정산 */}
            <SidebarItem
              icon="ri-truck-line"
              label="이사정산"
              onClick={() => {
                setOpenMenu("");
                handleNavigate(
                  <MoveoutList employeeId={employeeId} userId={userId} isMobile={false} />,
                  "이사정산"
                );
              }}
              active={activeMenu === "이사정산"}
            />

            {/* 3) 부가서비스 관리 */}
            <div>
              <SidebarItem
                icon="ri-tools-line"
                label="부가서비스 관리"
                onClick={() => {
                  const newState = openMenu === "addon" ? "" : "addon";
                  setOpenMenu(newState);
                  setActiveMenu("부가서비스 관리");
                }}
                active={activeMenu === "부가서비스 관리"}
                hasChildren
                isOpen={openMenu === "addon"}
              />
              {openMenu === "addon" && (
                <SidebarSubmenu
                  items={["입주청소", "도배", "설정"]}
                  activeMenu={activeMenu}
                  onClick={(item) => {
                    setActiveMenu(item);
                    const pages = {
                      입주청소: <MoveInCleaningPage />,                 // ✅ 실제 페이지 연결
                      도배: <ComingSoon title="부가서비스 · 도배" />,
                      설정: <ComingSoon title="부가서비스 · 설정" />,
                    };
                    handleNavigate(pages[item] ?? <ComingSoon title={`부가서비스 · ${item}`} />, item);
                  }}
                />
              )}
            </div>

            {/* 4) 관리비회계 */}
            <div>
              <SidebarItem
                icon="ri-coins-line"
                label="관리비회계"
                onClick={() => {
                  const newState = openMenu === "accounting" ? "" : "accounting";
                  setOpenMenu(newState);
                  setActiveMenu("관리비회계");
                }}
                active={activeMenu === "관리비회계"}
                hasChildren
                isOpen={openMenu === "accounting"}
              />
              {openMenu === "accounting" && (
                <SidebarSubmenu
                  items={[
                    "수입정리",
                    "지출정리",
                    "일마감",
                    "월마감",
                    "수입뷰어",
                    "지출뷰어",
                    "수입DB",
                    "지출DB",
                    "연간시트",
                    "설정",
                  ]}
                  activeMenu={activeMenu}
                  onClick={(item) => {
                    setActiveMenu(item);
                    handleNavigate(<ComingSoon title={`관리비회계 · ${item}`} />, item);
                  }}
                />
              )}
            </div>

            {/* 5) 영수증발행 */}
            <SidebarItem
              icon="ri-receipt-line"
              label="영수증발행"
              onClick={() => {
                setOpenMenu("");
                handleNavigate(<ReceiptIssuePage />, "영수증발행");
              }}
              active={activeMenu === "영수증발행"}
            />

            {/* 6) 거래처관리 */}
            <SidebarItem
              icon="ri-booklet-line"
              label="거래처관리"
              onClick={() => {
                setOpenMenu("");
                handleNavigate(<VendorsMainPage />, "거래처관리");
              }}
              active={activeMenu === "거래처관리"}
            />

            {/* 7) 사원관리 */}
            <SidebarItem
              icon="ri-user-line"
              label="사원관리"
              onClick={() => {
                setOpenMenu("");
                handleNavigate(<EmployeePage />, "사원관리");
              }}
              active={activeMenu === "사원관리"}
            />

            {/* 8) 기초등록 */}
            <div>
              <SidebarItem
                icon="ri-settings-3-line"
                label="기초등록"
                onClick={() => {
                  const newState = openMenu === "settings" ? "" : "settings";
                  setOpenMenu(newState);
                  setActiveMenu("기초등록");
                }}
                active={activeMenu === "기초등록"}
                hasChildren
                isOpen={openMenu === "settings"}
              />
              {openMenu === "settings" && (
                <SidebarSubmenu
                  items={["사원코드생성", "거래처등록"]}
                  activeMenu={activeMenu}
                  onClick={(item) => {
                    setActiveMenu(item);
                    if (item === "사원코드생성") {
                      handleNavigate(<UserRegisterPage />, item);
                    } else if (item === "거래처등록") {
                      handleNavigate(<VendorRegisterPage />, item);
                    }
                  }}
                />
              )}
            </div>
          </nav>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 p-6 bg-gray-50 overflow-auto">{activeContent}</main>
    </div>
  );
};

export default TrezoSidebar;
