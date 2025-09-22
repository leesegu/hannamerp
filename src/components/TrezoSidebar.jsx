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

/* 관리비회계 · 수입정리 / 지출정리 / 일마감 / 월마감 / 연간시트 */
import IncomeImportPage from "../pages/IncomeImportPage";
import ExpensePage from "../pages/ExpensePage";
import DailyClosePage from "../pages/DailyClosePage";
import MonthlyClosePage from "../pages/MonthlyClosePage";
import AnnualSheetPage from "../pages/AnnualSheetPage";

/* 전기요금 추출(문자) */
import MessageExtractor from "../pages/MessageExtractor";
/* 캘린더 */
import CalendarPage from "../pages/CalendarPage";
/* 부가서비스 · 도배 */
import PaperingPage from "../pages/PaperingPage";
/* 메모 */
import MemoPage from "../pages/MemoPage";

/* 스타일/자산 */
import "remixicon/fonts/remixicon.css";
import HNLogo from "../assets/HN LOGO.png";

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
      {icon && <i className={`${icon} text-lg`}></i>}
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
  const [openMenu, setOpenMenu] = useState(""); // ✅ 오류 원인 제거(앞의 'the:' 삭제)
  const [activeMenu, setActiveMenu] = useState("");

  const handleNavigate = (component, menuKey) => {
    setActiveContent(component);
    setActiveMenu(menuKey);
  };

  const goHome = () => {
    setActiveContent(null);
    setActiveMenu("");
    setOpenMenu("");
    navigate("/main", { replace: true });
  };

  /* URL 쿼리로 콘텐츠 스위칭 (사이드바는 유지) */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const go = params.get("go");
    const sub = params.get("sub");

    // 빌라정보 하위
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
      return;
    }
  }, [location.search]);

  return (
    <div className="flex w-full h-screen">
      {/* 사이드바 */}
      <aside className="w-60 h-full bg-white border-r border-gray-200 flex flex-col">
        <div
          className="px-6 py-5 border-b border-gray-100 flex items-center gap-3 cursor-pointer"
          onClick={goHome}
          title="대시보드로 이동"
        >
          <img src={HNLogo} alt="HN Logo" className="w-10 h-10 object-contain" />
          <span className="font-bold text-lg text-gray-800">한남주택관리</span>
        </div>

        {/* 사용자 정보 + 로그아웃 */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-800">{userName}</div>
              <div className="text-sm text-gray-400">로그인 중</div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="w-10 h-10 grid place-items-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition"
              title="로그아웃"
              aria-label="로그아웃"
            >
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
                handleNavigate(
                  <MoveoutList employeeId={employeeId} userId={userId} isMobile={false} />,
                  "이사정산"
                );
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
                  items={["수입정리", "지출정리", "일마감", "월마감", "연간시트"]}
                  activeMenu={activeMenu}
                  onClick={(item) => {
                    setActiveMenu(item);
                    if (item === "수입정리") {
                      handleNavigate(<IncomeImportPage />, item);
                      return;
                    }
                    if (item === "지출정리") {
                      handleNavigate(<ExpensePage />, item);
                      return;
                    }
                    if (item === "일마감") {
                      handleNavigate(<DailyClosePage />, item);
                      return;
                    }
                    if (item === "월마감") {
                      handleNavigate(<MonthlyClosePage />, item);
                      return;
                    }
                    if (item === "연간시트") {
                      handleNavigate(<AnnualSheetPage />, item); // ✅ 연간시트 연결
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
                  /* ⚠️ 여기엔 '관리비회계 설정' 메뉴를 두지 않음 — VendorRegisterPage 내부에 포함 */
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
          </nav>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 p-6 bg-gray-50 overflow-auto">
        {activeContent || <Dashboard userId={userId} userName={userName} />}
      </main>
    </div>
  );
};

export default TrezoSidebar;
