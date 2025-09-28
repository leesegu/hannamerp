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

/* 관리비회계 */
import IncomeImportPage from "../pages/IncomeImportPage";
import ExpensePage from "../pages/ExpensePage";
import DailyClosePage from "../pages/DailyClosePage";
import MonthlyClosePage from "../pages/MonthlyClosePage";
import AnnualSheetPage from "../pages/AnnualSheetPage";

/* 대금결제 관리 */
import PaymentSettlementPage from "../pages/PaymentSettlementPage.jsx";

/* 전기요금 추출 / 공용전기 계산 */
import MessageExtractor from "../pages/MessageExtractor";
import PublicElectricCalcPage from "../pages/PublicElectricCalcPage";

/* 캘린더 / 부가서비스 / 메모 */
import CalendarPage from "../pages/CalendarPage";
import PaperingPage from "../pages/PaperingPage";
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
    className={`w-full flex items-center justify-between text-[13px] px-3 py-1.5 rounded-xl transition-all duration-200
      ${
        active
          ? "bg-gradient-to-r from-[#ece8ff] via-[#eef0ff] to-[#e9fbff] text-[#5b45ff] shadow-[inset_0_1px_0_rgba(255,255,255,.6)] ring-1 ring-[#e5e7ff]"
          : "text-slate-700 hover:text-[#5b45ff] hover:bg-white/60 ring-1 ring-transparent hover:ring-[#eef0ff]"
      }`}
  >
    <div className="flex items-center gap-2">
      {icon && (
        <i
          className={`${icon} text-[18px] ${
            active ? "text-[#5b45ff]" : "text-slate-500 group-hover:text-[#5b45ff]"
          }`}
        />
      )}
      <span className="tracking-tight">{label}</span>
    </div>
    {hasChildren && (
      <i
        className={`ri-arrow-down-s-line text-base transition-transform duration-200 ${
          isOpen ? "rotate-0" : "-rotate-90"
        } ${active ? "text-[#5b45ff]" : "text-slate-400"}`}
      />
    )}
  </button>
);

const SidebarSubmenu = ({ items = [], onClick, activeMenu }) => (
  <ul className="pl-4 mt-1.5 space-y-1 text-[12.5px]">
    {items.map((item) => (
      <li
        key={item}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150
          ${
            activeMenu === item
              ? "bg-[#f3f4ff] text-[#5b45ff] ring-1 ring-[#e7e9ff]"
              : "text-slate-600 hover:text-[#5b45ff] hover:bg-white/60"
          }`}
        onClick={() => onClick?.(item)}
      >
        <i
          className={`ri-arrow-right-s-line text-[15px] ${
            activeMenu === item ? "text-[#5b45ff]" : "text-slate-400"
          }`}
        />
        <span className="truncate">{item}</span>
      </li>
    ))}
  </ul>
);

/* ✅ userPhotoUrl(선택) 추가: 전달 시 좌측 고스트 박스가 사진으로 표시됩니다. */
const TrezoSidebar = ({ employeeId, userId, userName, onLogout, userPhotoUrl }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeContent, setActiveContent] = useState(null);
  const [openMenu, setOpenMenu] = useState("");
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

  /* URL 쿼리 → 콘텐츠 스위칭 */
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
      return;
    }
  }, [location.search]);

  return (
    <div className="flex w-full h-screen">
      <style>{`
        :root{
          --hn-grad-a:#f7f7ff;
          --hn-grad-b:#f2f7ff;
          --hn-grad-c:#eefafc;
          --hn-border:#e9eaf5;
          --hn-shadow:0 6px 22px rgba(22, 28, 45, .06);
          --hn-softshadow:0 2px 10px rgba(22, 28, 45, .05);
          --hn-glow:0 0 0 2px rgba(91,69,255,.12);
        }
        .sidebar-scroll{
          scrollbar-width: thin;
          scrollbar-color: #9aa0ff #eef0ff;
        }
        .sidebar-scroll::-webkit-scrollbar{ width: 10px; }
        .sidebar-scroll::-webkit-scrollbar-track{
          background: #eef0ff;
          border-radius: 10px;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb{
          background: #9aa0ff;
          border-radius: 10px;
          border: 2px solid #eef0ff;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb:hover{
          background: #7e86ff;
        }
        .hn-divider{ height:1px; background: linear-gradient(90deg, transparent, #eceef7, transparent); }
      `}</style>

      {/* 사이드바 */}
      <aside
        className="w-60 h-full bg-[radial-gradient(1200px_600px_at_top_left,var(--hn-grad-a),transparent_60%),linear-gradient(180deg,var(--hn-grad-b),var(--hn-grad-c))]
                   border-r border-[var(--hn-border)] flex flex-col shadow-[var(--hn-softshadow)]"
      >
        <div
          className="px-5 py-4 border-b border-[var(--hn-border)] flex items-center gap-3 cursor-pointer backdrop-blur-[2px]"
          onClick={goHome}
          title="대시보드로 이동"
        >
          {/* ⬆ 요청: 로고 사이즈 확대 */}
          <div className="w-12 h-12 rounded-xl bg-white shadow-[var(--hn-shadow)] grid place-items-center ring-1 ring-white/60">
            <img src={HNLogo} alt="HN Logo" className="w-10 h-10 object-contain" />
          </div>
          <div className="flex flex-col leading-tight">
            {/* ⬆ 요청: 회사이름 폰트 사이즈 확대 */}
            <span className="font-extrabold text-[17px] tracking-tight text-slate-800">
              한남주택관리
            </span>
            <span className="text-[12.5px] text-slate-500 -mt-0.5">HANNAM ERP</span>
          </div>
        </div>

        {/* ✅ 로그인/로그아웃 영역 (이름 중앙정렬만 적용) */}
        <div className="px-5 py-4 border-b border-[var(--hn-border)]">
          <div
            className="relative rounded-2xl p-4
                       bg-[conic-gradient(at_20%_20%,#ffffff_0%,#f6f7ff_35%,#f2f9ff_65%,#ffffff_100%)]
                       ring-1 ring-[#e8eaff]
                       shadow-[0_1px_0_rgba(255,255,255,.7),0_10px_24px_rgba(23,27,44,.06)]"
          >
            {/* 상단 얇은 하이라이트 */}
            <span className="pointer-events-none absolute left-4 right-4 top-2 h-px bg-white/70" />

            <div className="flex items-center justify-between gap-3">
              {/* 좌측: 아이콘 박스 + 사용자명 */}
              <div className="min-w-0 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl bg-white/80 backdrop-blur ring-1 ring-[#eceefe]
                             shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_6px_16px_rgba(23,27,44,.06)]
                             overflow-hidden grid place-items-center"
                  title={userPhotoUrl ? "프로필 사진" : "사용자"}
                >
                  {userPhotoUrl ? (
                    <img
                      src={userPhotoUrl}
                      alt="User"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <i className="ri-user-3-line text-[18px] text-slate-500" />
                  )}
                </div>

                {/* ⬆ 요청: 이름과 배지를 중앙정렬 */}
                <div className="min-w-0 text-center">
                  <div className="font-semibold text-slate-800 text-[14px] leading-tight tracking-tight truncate whitespace-nowrap">
                    {userName}
                  </div>

                  {/* 상태 배지: 중앙 정렬 */}
                  <div className="mt-1 flex justify-center">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px]
                                     bg-gradient-to-r from-[#ecfff7] via-[#f3fff9] to-[#f7fffd]
                                     text-emerald-700 ring-1 ring-emerald-200/70
                                     shadow-[inset_0_1px_0_rgba(255,255,255,.65)]
                                     whitespace-nowrap select-none">
                      <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-500">
                        <span className="absolute inset-0 rounded-full animate-ping bg-emerald-400/70"></span>
                      </span>
                      로그인 중
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="relative w-11 h-11 grid place-items-center rounded-2xl
                           bg-white/90 text-slate-700
                           ring-1 ring-[#e7e9ff] hover:ring-2 hover:ring-[#dfe3ff]
                           shadow-[inset_0_1px_0_rgba(255,255,255,.75),0_8px_22px_rgba(23,27,44,.08)]
                           hover:shadow-[0_12px_28px_rgba(23,27,44,.12)]
                           transition duration-150 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[#dfe2ff]"
                title="로그아웃"
                aria-label="로그아웃"
              >
                <i className="ri-logout-box-r-line text-[18px]" />
                <span className="pointer-events-none absolute inset-0 rounded-2xl
                                 bg-[radial-gradient(65%_45%_at_50%_12%,rgba(255,255,255,.95),transparent)]" />
              </button>
            </div>
          </div>
        </div>

        {/* ▼▼▼ 이하 메뉴/콘텐츠 – 변경 없음 ▼▼▼ */}
        <div className="flex-1 overflow-y-auto px-3 py-3 sidebar-scroll">
          <nav className="space-y-0.5">
            <div className="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-[var(--hn-border)] p-1.5 shadow-[var(--hn-softshadow)]">
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
                <>
                  <div className="hn-divider my-1.5" />
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
                </>
              )}
            </div>

            <div className="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-[var(--hn-border)] p-1.5 shadow-[var(--hn-softshadow)]">
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
            </div>

            <div className="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-[var(--hn-border)] p-1.5 shadow-[var(--hn-softshadow)]">
              <SidebarItem
                icon="ri-calendar-line"
                label="캘린더"
                onClick={() => {
                  setOpenMenu("");
                  handleNavigate(<CalendarPage />, "캘린더");
                }}
                active={activeMenu === "캘린더"}
              />
            </div>

            <div className="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-[var(--hn-border)] p-1.5 shadow-[var(--hn-softshadow)]">
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
                <>
                  <div className="hn-divider my-1.5" />
                  <SidebarSubmenu
                    items={["입주청소", "도배", "전기요금 추출", "공용전기 계산"]}
                    activeMenu={activeMenu}
                    onClick={(item) => {
                      setActiveMenu(item);
                      const pages = {
                        입주청소: <MoveInCleaningPage />,
                        도배: <PaperingPage />,
                        "전기요금 추출": <MessageExtractor />,
                        "공용전기 계산": <PublicElectricCalcPage />,
                      };
                      handleNavigate(pages[item] ?? <ComingSoon title={`부가서비스 · ${item}`} />, item);
                    }}
                  />
                </>
              )}
            </div>

            <div className="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-[var(--hn-border)] p-1.5 shadow-[var(--hn-softshadow)]">
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
                <>
                  <div className="hn-divider my-1.5" />
                  <SidebarSubmenu
                    items={["수입정리", "지출정리", "대금결제 관리", "일마감", "월마감", "연간시트"]}
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
                      if (item === "대금결제 관리") {
                        handleNavigate(<PaymentSettlementPage />, item);
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
                        handleNavigate(<AnnualSheetPage />, item);
                        return;
                      }
                      handleNavigate(<ComingSoon title={`관리비회계 · ${item}`} />, item);
                    }}
                  />
                </>
              )}
            </div>

            <div className="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-[var(--hn-border)] p-1.5 shadow-[var(--hn-softshadow)]">
              <SidebarItem
                icon="ri-receipt-line"
                label="영수증발행"
                onClick={() => {
                  setOpenMenu("");
                  handleNavigate(<ReceiptIssuePage />, "영수증발행");
                }}
                active={activeMenu === "영수증발행"}
              />
            </div>

            <div className="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-[var(--hn-border)] p-1.5 shadow-[var(--hn-softshadow)]">
              <SidebarItem
                icon="ri-booklet-line"
                label="거래처관리"
                onClick={() => {
                  setOpenMenu("");
                  handleNavigate(<VendorsMainPage />, "거래처관리");
                }}
                active={activeMenu === "거래처관리"}
              />
            </div>

            <div className="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-[var(--hn-border)] p-1.5 shadow-[var(--hn-softshadow)]">
              <SidebarItem
                icon="ri-sticky-note-line"
                label="메모"
                onClick={() => {
                  setOpenMenu("");
                  handleNavigate(<MemoPage userId={userId} />, "메모");
                }}
                active={activeMenu === "메모"}
              />
            </div>

            <div className="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-[var(--hn-border)] p-1.5 shadow-[var(--hn-softshadow)]">
              <SidebarItem
                icon="ri-user-line"
                label="사원관리"
                onClick={() => {
                  setOpenMenu("");
                  handleNavigate(<EmployeePage />, "사원관리");
                }}
                active={activeMenu === "사원관리"}
              />
            </div>

            <div className="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-[var(--hn-border)] p-1.5 shadow-[var(--hn-softshadow)]">
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
                <>
                  <div className="hn-divider my-1.5" />
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
                </>
              )}
            </div>
          </nav>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 p-6 bg-[linear-gradient(180deg,#fafbff,white)] overflow-auto">
        {activeContent || <Dashboard userId={userId} userName={userName} />}
      </main>
    </div>
  );
};

export default TrezoSidebar;
