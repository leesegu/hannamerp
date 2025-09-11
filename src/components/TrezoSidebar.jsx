// src/components/TrezoSidebar.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
import MoveInCleaningPage from "../pages/MoveInCleaningPage";
import Dashboard from "../pages/Dashboard";
/* ✅ 관리비회계 · 수입정리 페이지 */
import IncomeImportPage from "../pages/IncomeImportPage";
/* ✅ 전기요금 추출(문자) 페이지 */
import MessageExtractor from "../pages/MessageExtractor";
/* ✅ 캘린더 페이지 */
import CalendarPage from "../pages/CalendarPage";
/* ✅ 부가서비스 · 도배 페이지 */
import PaperingPage from "../pages/PaperingPage";
/* ✅ 새로 추가: 메모 페이지 */
import MemoPage from "../pages/MemoPage";

import "remixicon/fonts/remixicon.css";

const ComingSoon = ({ title }) => (
  <div className="p-6">
    <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
    <p className="text-gray-500 mt-2">준비 중입니다.</p>
  </div>
);

const SidebarItem = ({ icon, label, onClick, active, hasChildren, isOpen }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between text-sm px-3 py-2 rounded-md transition-colors ${
      active ? "bg-gray-100 text-purple-600" : "text-gray-700 hover:bg-gray-100 hover:text-purple-600"
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
          ${activeMenu === item ? "bg-purple-100 text-purple-600" : "hover:bg-purple-50 hover:text-purple-600"}
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
  const location = useLocation();

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
    setActiveContent(null); // 대시보드
    setActiveMenu("");
    setOpenMenu("");
    navigate("/main", { replace: true });
  };

  /** ✅ URL 쿼리 변화에 반응해서 내부 화면을 전환 */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const go = params.get("go");
    const sub = params.get("sub");

    if (go === "빌라정보" && sub) {
      setOpenMenu("villa");
      setActiveMenu(sub);

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

      setActiveContent(pages[sub] ?? <ComingSoon title={`빌라정보 · ${sub}`} />);
    }
  }, [location.search]);

  return (
    <div className="flex w-full h-screen">
      {/* 사이드바 */}
      <aside className="w-60 h-full bg-white border-r border-gray-200 flex flex-col">
        {/* 로고 */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div onClick={goHome} className="flex items-center gap-2 cursor-pointer" title="대시보드로 이동">
            <i className="ri-home-4-line text-xl text-gray-700"></i>
            <span className="font-bold text-lg text-gray-800">한남주택관리</span>
          </div>
        </div>

        {/* 사용자 정보 + 로그아웃 아이콘(정사각형) */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-800">{userName}</div>
              <div className="text-sm text-gray-400">로그인 중</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-10 h-10 grid place-items-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition"
              title="로그아웃"
              aria-label="로그아웃"
            >
              {/* 이전에 쓰던 로그아웃 아이콘 계열 */}
              <i className="ri-logout-box-r-line text-xl"></i>
            </button>
          </div>
        </div>

        {/* 메뉴 */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <nav className="space-y-2">
            {/* 빌라정보 */}
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

            {/* 이사정산 */}
            <SidebarItem
              icon="ri-truck-line"
              label="이사정산"
              onClick={() => {
                setOpenMenu("");
                handleNavigate(<MoveoutList employeeId={employeeId} userId={userId} isMobile={false} />, "이사정산");
              }}
              active={activeMenu === "이사정산"}
            />

            {/* 캘린더 */}
            <SidebarItem
              icon="ri-calendar-line"
              label="캘린더"
              onClick={() => {
                setOpenMenu("");
                handleNavigate(<CalendarPage />, "캘린더");
              }}
              active={activeMenu === "캘린더"}
            />

            {/* 부가서비스 */}
            <div>
              <SidebarItem
                icon="ri-tools-line"
                label="부가서비스"
                onClick={() => {
                  const newState = openMenu === "addon" ? "" : "addon";
                  setOpenMenu(newState);
                  setActiveMenu("부가서비스");
                }}
                active={activeMenu === "부가서비스"}
                hasChildren
                isOpen={openMenu === "addon"}
              />
              {openMenu === "addon" && (
                <SidebarSubmenu
                  items={["입주청소", "도배", "전기요금 추출"]}
                  activeMenu={activeMenu}
                  onClick={(item) => {
                    setActiveMenu(item);
                    const pages = {
                      입주청소: <MoveInCleaningPage />,
                      도배: <PaperingPage />,
                      "전기요금 추출": <MessageExtractor />,
                    };
                    handleNavigate(pages[item] ?? <ComingSoon title={`부가서비스 · ${item}`} />, item);
                  }}
                />
              )}
            </div>

            {/* 관리비회계 */}
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
                  items={["수입정리", "지출정리", "일마감", "월마감", "수입뷰어", "지출뷰어", "수입DB", "지출DB", "연간시트"]}
                  activeMenu={activeMenu}
                  onClick={(item) => {
                    setActiveMenu(item);
                    if (item === "수입정리") {
                      handleNavigate(<IncomeImportPage />, item);
                      return;
                    }
                    handleNavigate(<ComingSoon title={`관리비회계 · ${item}`} />, item);
                  }}
                />
              )}
            </div>

            {/* 영수증발행 */}
            <SidebarItem
              icon="ri-receipt-line"
              label="영수증발행"
              onClick={() => {
                setOpenMenu("");
                handleNavigate(<ReceiptIssuePage />, "영수증발행");
              }}
              active={activeMenu === "영수증발행"}
            />

            {/* 거래처관리 */}
            <SidebarItem
              icon="ri-booklet-line"
              label="거래처관리"
              onClick={() => {
                setOpenMenu("");
                handleNavigate(<VendorsMainPage />, "거래처관리");
              }}
              active={activeMenu === "거래처관리"}
            />

            {/* 사원관리 */}
            <SidebarItem
              icon="ri-user-line"
              label="사원관리"
              onClick={() => {
                setOpenMenu("");
                handleNavigate(<EmployeePage />, "사원관리");
              }}
              active={activeMenu === "사원관리"}
            />

            {/* 기초등록 */}
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
                  items={["사원코드생성", "설정"]}
                  activeMenu={activeMenu}
                  onClick={(item) => {
                    setActiveMenu(item);
                    if (item === "사원코드생성") {
                      handleNavigate(<UserRegisterPage />, item);
                    } else if (item === "설정") {
                      handleNavigate(<VendorRegisterPage />, item);
                    }
                  }}
                />
              )}
            </div>

            {/* 메모 */}
            <SidebarItem
              icon="ri-sticky-note-line"
              label="메모"
              onClick={() => {
                setOpenMenu("");
                handleNavigate(<MemoPage userId={userId} />, "메모");
              }}
              active={activeMenu === "메모"}
            />
          </nav>
        </div>
      </aside>

      {/* 메인 콘텐츠: 기본은 대시보드 */}
      <main className="flex-1 p-6 bg-gray-50 overflow-auto">
        {activeContent || <Dashboard userId={userId} userName={userName} />}
      </main>
    </div>
  );
};

export default TrezoSidebar;
