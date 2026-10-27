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
/* ✅ 서비스비용 관리 */
import ServiceCostPage from "../pages/ServiceCostPage";
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

/* 손익계산 */
import ProfitLossPage from "../pages/ProfitLossPage";

/* 미납관리 */
import UnpaidManagementPage from "../pages/UnpaidManagementPage";

/* 전기요금 추출 / 공용전기 계산 */
import MessageExtractor from "../pages/MessageExtractor";
import PublicElectricCalcPage from "../pages/PublicElectricCalcPage";

/* 캘린더 / 부가서비스 / 메모 */
import CalendarPage from "../pages/CalendarPage";
import PaperingPage from "../pages/PaperingPage";
import MemoPage from "../pages/MemoPage";

/* ✅ 일정관리 */
import ScheduleManager from "../pages/ScheduleManager";

/* ✅ 업데이트(모달) */
import UpdatesModal from "../components/UpdatesModal";

/* ✅ 입주자카드 */
import ResidentCardPage from "../pages/ResidentCardPage";

/* ✅ 자재비관리대장 */
import MaterialCostPage from "../pages/MaterialCostPage";

/* ✅ 수도검침조회 */
import WaterMeterReadingPage from "../pages/WaterMeterReadingPage";

/* ✅ 관리일지 */
import ManagementLog from "../pages/ManagementLog";

/* ✅ 소독관리 */
import DisinfectionManagementPage from "../pages/DisinfectionManagementPage";

/* ✅ 관리종료 */
import VillaEndPage from "../pages/VillaEndPage";

/* ✅ 정산하자체크 */
import SettlementDefectCheckPage from "../pages/SettlementDefectCheckPage";

/* 스타일/자산 */
import "remixicon/fonts/remixicon.css";
import HNLogo from "../assets/HN LOGO.png";


const ComingSoon = ({ title }) => (
  <div className="p-6">
    <h2 className="text-xl font-semibold text-slate-800">
      {title}
    </h2>

    <p className="text-slate-400 mt-2 text-sm">
      준비 중입니다.
    </p>
  </div>
);


/* ✅ 사이드바 1뎁스 메뉴 아이템
   - 좌측 3px 액센트 바 + 연한 배경으로 활성 상태 표시
   - 불필요한 장식(그라데이션·그림자·라운드 뱃지)을 제거하고
     명확한 위계와 상태 구분에 집중한 디자인 */
const SidebarItem = ({
  icon,
  label,
  onClick,
  active,
  hasChildren,
  isOpen,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`hn-nav-row w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-[13.5px] transition-colors duration-150 border-l-[3px]
      ${
        active
          ? "bg-[#EEF3FC] border-l-[var(--hn-accent)] text-[var(--hn-accent)] font-semibold"
          : "border-l-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
  >
    <span className="flex items-center gap-2.5 min-w-0">
      {icon && (
        <i
          className={`${icon} text-[16px] shrink-0 ${
            active ? "text-[var(--hn-accent)]" : "text-slate-400"
          }`}
        />
      )}

      <span className="truncate tracking-tight">
        {label}
      </span>
    </span>

    {hasChildren && (
      <i
        className={`ri-arrow-down-s-line text-[15px] shrink-0 transition-transform duration-200 ${
          isOpen ? "rotate-0" : "-rotate-90"
        } ${active ? "text-[var(--hn-accent)]" : "text-slate-300"}`}
      />
    )}
  </button>
);


/* ✅ 2뎁스 서브메뉴
   - 좌측 세로선으로 상위 메뉴와의 종속 관계를 표현 */
const SidebarSubmenu = ({
  items = [],
  onClick,
  activeMenu,
}) => (
  <ul className="ml-[29px] pl-3 py-1 space-y-0.5 border-l border-slate-200">
    {items.map((item) => (
      <li
        key={item}
        className={`px-2.5 py-1.5 rounded-md text-[12.5px] cursor-pointer transition-colors duration-150 truncate
          ${
            activeMenu === item
              ? "bg-[#EEF3FC] text-[var(--hn-accent)] font-semibold"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          }`}
        onClick={() =>
          onClick?.(item)
        }
      >
        {item}
      </li>
    ))}
  </ul>
);


/* ✅ userPhotoUrl(선택) */
const TrezoSidebar = ({
  employeeId,
  userId,
  userName,
  onLogout,
  userPhotoUrl,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeContent, setActiveContent] =
    useState(null);

  const [openMenu, setOpenMenu] =
    useState("");

  const [activeMenu, setActiveMenu] =
    useState("");

  /* ✅ 업데이트 모달 */
  const [updatesOpen, setUpdatesOpen] =
    useState(false);


  const handleNavigate = (
    component,
    menuKey
  ) => {
    setActiveContent(component);
    setActiveMenu(menuKey);
  };


  const goHome = () => {
    setActiveContent(null);
    setActiveMenu("");
    setOpenMenu("");

    navigate(
      "/main",
      {
        replace: true,
      }
    );
  };


  /* URL 쿼리 → 콘텐츠 스위칭 */
  useEffect(() => {
    const params =
      new URLSearchParams(
        location.search
      );

    const go =
      params.get("go");

    const sub =
      params.get("sub");


    if (
      go === "빌라정보" &&
      sub
    ) {
      setOpenMenu("villa");

      setActiveMenu(sub);


      const pages = {
        코드별빌라:
          <VillaCodePage />,

        통신사:
          <TelcoPage />,

        승강기:
          <ElevatorPage />,

        정화조:
          <SepticPage />,

        소방안전:
          <FireSafetyPage />,

        전기안전:
          <ElectricSafetyPage />,

        상수도:
          <WaterPage />,

        공용전기:
          <PublicElectricPage />,

        건물청소:
          <CleaningPage />,

        CCTV:
          <CctvPage />,

        "서비스비용 관리":
          <ServiceCostPage />,

        관리종료:
          <VillaEndPage />,
      };


      setActiveContent(
        pages[sub] ??
          <ComingSoon
            title={`빌라정보 · ${sub}`}
          />
      );

      return;
    }
  }, [location.search]);


  /* ✅ 상단 유틸리티 바에 표시할 오늘 날짜 (요일 포함) */
  const todayLabel = new Date().toLocaleDateString(
    "ko-KR",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }
  );


  return (
    <div className="hn-erp-desktop-shell flex w-full h-screen bg-white">

      <style>{`
        :root{
          --hn-navy:#0F2A4A;
          --hn-accent:#2457A8;
          --hn-accent-soft:#EEF3FC;
          --hn-border:#E6E9EF;
          --hn-text:#1F2733;
          --hn-muted:#8992A3;
        }


        .sidebar-scroll{
          scrollbar-width: thin;
          scrollbar-color: #cbd2e0 #f4f6f9;
        }


        .sidebar-scroll::-webkit-scrollbar{
          width: 8px;
        }


        .sidebar-scroll::-webkit-scrollbar-track{
          background: #f7f8fb;
        }


        .sidebar-scroll::-webkit-scrollbar-thumb{
          background: #cbd2e0;
          border-radius: 8px;
        }


        .sidebar-scroll::-webkit-scrollbar-thumb:hover{
          background: #aab2c5;
        }


        .hn-nav-row:focus-visible{
          outline: 2px solid var(--hn-accent);
          outline-offset: -2px;
        }


        /* =====================================================
           ✅ Galaxy Tab / 터치 태블릿 전용 PC 화면 축소
           -----------------------------------------------------

           기존 삼성 인터넷에서 실제로 정상 작동했던 방식입니다.

           조건:
           - 769px 이상
           - 1366px 이하
           - 터치 장치

           따라서 일반 PC에서는 적용되지 않습니다.
        ===================================================== */

        @media screen
          and (min-width: 769px)
          and (max-width: 1366px)
          and (any-pointer: coarse) {

          .hn-erp-desktop-shell {
            zoom: 0.67 !important;

            /*
             * 100 / 0.67
             * = 약 149.2538
             *
             * 축소된 만큼 실제 레이아웃 공간을
             * 다시 확보합니다.
             */
            width:
              149.2538vw !important;

            height:
              149.2538dvh !important;

            min-height:
              149.2538dvh !important;

            max-width:
              none !important;

            max-height:
              none !important;
          }
        }


        /* =====================================================
           ✅ 홈 화면에 추가한 ERP
           standalone 모드 전용

           홈 화면 실행 시 삼성 인터넷의
           pointer 판정이 달라지는 경우를 고려하여
           any-pointer 조건은 사용하지 않습니다.

           대신:
           - standalone
           - 769px 이상
           - 1600px 이하

           조건에서 67%를 강제합니다.
        ===================================================== */

        @media screen
          and (display-mode: standalone)
          and (min-width: 769px)
          and (max-width: 1600px) {

          .hn-erp-desktop-shell {
            zoom: 0.67 !important;

            width:
              149.2538vw !important;

            height:
              149.2538dvh !important;

            min-height:
              149.2538dvh !important;

            max-width:
              none !important;

            max-height:
              none !important;
          }
        }


        /* =====================================================
           ✅ landscape standalone 추가 안전장치

           홈 화면 실행 + 가로모드라면
           같은 67% 규칙을 다시 한번 확실하게 적용
        ===================================================== */

        @media screen
          and (display-mode: standalone)
          and (orientation: landscape)
          and (min-width: 769px) {

          .hn-erp-desktop-shell {
            zoom: 0.67 !important;

            width:
              149.2538vw !important;

            height:
              149.2538dvh !important;

            min-height:
              149.2538dvh !important;

            max-width:
              none !important;

            max-height:
              none !important;
          }
        }
      `}</style>


      <aside
        className="
          w-[220px]
          min-w-[220px]
          max-w-[220px]
          h-full
          bg-white
          border-r
          border-[var(--hn-border)]
          flex
          flex-col
          shrink-0
        "
      >

        {/* =====================================================
            로고 / 브랜드 영역
            - 외곽 테두리 제거
            - 로고 및 브랜드명 확대
        ====================================================== */}
        <div
          className="
            h-[82px]
            shrink-0
            px-4
            flex
            items-center
            gap-3
            cursor-pointer
            select-none
          "
          onClick={goHome}
          title="대시보드로 이동"
        >
          <div
            className="
              w-[48px]
              h-[48px]
              shrink-0
              grid
              place-items-center
            "
          >
            <img
              src={HNLogo}
              alt="HN Logo"
              className="
                w-[46px]
                h-[46px]
                object-contain
              "
            />
          </div>

          <div className="flex flex-col justify-center min-w-0 leading-none">
            <span
              className="
                font-black
                text-[18px]
                tracking-[-0.045em]
                text-[#13233A]
                whitespace-nowrap
              "
            >
              한남주택관리
            </span>

            <div className="flex items-center gap-1.5 mt-2">
              <span
                className="
                  text-[12px]
                  font-extrabold
                  text-[var(--hn-accent)]
                  tracking-[0.055em]
                  whitespace-nowrap
                "
              >
                HANNAM ERP
              </span>
              <span className="w-1 h-1 rounded-full bg-[#F59E0B]" />
            </div>
          </div>
        </div>


        {/* =====================================================
            로그인 사용자 / 상태 / 로그아웃
        ====================================================== */}
        <div className="px-3 pb-3 shrink-0">
          <div
            className="
              relative
              overflow-hidden
              rounded-[14px]
              bg-[#F7F9FC]
              px-3
              py-3
            "
          >
            <div
              className="
                absolute
                left-0
                top-0
                bottom-0
                w-[3px]
                bg-[var(--hn-accent)]
              "
            />

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2.5">
                <div
                  className="
                    w-9
                    h-9
                    shrink-0
                    rounded-[10px]
                    bg-white
                    overflow-hidden
                    grid
                    place-items-center
                    shadow-[0_2px_8px_rgba(15,42,74,0.08)]
                  "
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
                    <i className="ri-user-3-line text-[17px] text-[#64748B]" />
                  )}
                </div>

                <div className="min-w-0 flex-1 text-center">
                  <div
                    className="
                      font-extrabold
                      text-[#1E293B]
                      text-[13px]
                      leading-none
                      truncate
                      text-center
                    "
                  >
                    {userName}
                  </div>

                  <div className="flex items-center justify-center gap-1.5 mt-1.5">
                    <span
                      className="
                        relative
                        flex
                        w-2
                        h-2
                      "
                    >
                      <span
                        className="
                          absolute
                          inline-flex
                          w-full
                          h-full
                          rounded-full
                          bg-emerald-400
                          opacity-30
                        "
                      />
                      <span
                        className="
                          relative
                          inline-flex
                          w-2
                          h-2
                          rounded-full
                          bg-emerald-500
                        "
                      />
                    </span>

                    <span className="text-[10.5px] font-semibold text-emerald-600">
                      정상 로그인
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="
                  shrink-0
                  w-8
                  h-8
                  grid
                  place-items-center
                  rounded-[9px]
                  bg-white
                  text-slate-400
                  shadow-[0_2px_7px_rgba(15,42,74,0.07)]
                  hover:text-red-500
                  hover:bg-red-50
                  transition-all
                  duration-150
                  focus:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[var(--hn-accent)]
                "
                title="로그아웃"
                aria-label="로그아웃"
              >
                <i className="ri-logout-box-r-line text-[16px]" />
              </button>
            </div>
          </div>
        </div>


        {/* =====================================================
            날짜 유틸리티 바
            - 메인 상단에서 제거하고 사이드바로 이동
        ====================================================== */}
        <div className="px-3 pb-3 shrink-0">
          <div
            className="
              h-[38px]
              px-3
              flex
              items-center
              justify-between
              rounded-[11px]
              border
              border-[#DDE6F3]
              bg-[#F7FAFE]
              shadow-[0_3px_10px_rgba(15,42,74,0.06)]
            "
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="
                  w-6
                  h-6
                  rounded-[7px]
                  grid
                  place-items-center
                  bg-[#EAF1FB]
                "
              >
                <i className="ri-calendar-2-line text-[13px] text-[#2457A8]" />
              </div>

              <span className="text-[10px] font-bold tracking-[0.08em] text-[#718096]">
                TODAY
              </span>
            </div>

            <span
              className="
                text-[11px]
                font-bold
                text-[#334155]
                tracking-[-0.02em]
                whitespace-nowrap
              "
            >
              {todayLabel}
            </span>
          </div>
        </div>


        {/* 메뉴 영역 */}
        <div
          className="
            flex-1
            overflow-y-auto
            py-2
            sidebar-scroll
          "
        >

          <nav className="px-2">

            {/* 빌라정보 */}
            <div>
              <SidebarItem
                icon="ri-building-4-line"
                label="빌라정보"

                onClick={() => {
                  const newState =
                    openMenu === "villa"
                      ? ""
                      : "villa";

                  setOpenMenu(
                    newState
                  );

                  setActiveMenu(
                    "빌라정보"
                  );
                }}

                active={
                  activeMenu ===
                  "빌라정보"
                }

                hasChildren

                isOpen={
                  openMenu ===
                  "villa"
                }
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
                    "서비스비용 관리",
                    "관리종료",
                  ]}

                  activeMenu={
                    activeMenu
                  }

                  onClick={(item) => {
                    setActiveMenu(
                      item
                    );


                    const pages = {
                      코드별빌라:
                        <VillaCodePage />,

                      통신사:
                        <TelcoPage />,

                      승강기:
                        <ElevatorPage />,

                      정화조:
                        <SepticPage />,

                      소방안전:
                        <FireSafetyPage />,

                      전기안전:
                        <ElectricSafetyPage />,

                      상수도:
                        <WaterPage />,

                      공용전기:
                        <PublicElectricPage />,

                      건물청소:
                        <CleaningPage />,

                      CCTV:
                        <CctvPage />,

                      "서비스비용 관리":
                        <ServiceCostPage />,

                      관리종료:
                        <VillaEndPage />,
                    };


                    handleNavigate(
                      pages[item] ??
                        <ComingSoon
                          title={item}
                        />,
                      item
                    );
                  }}
                />
              )}
            </div>


            {/* 이사정산 */}
            <div className="mt-0.5">
              <SidebarItem
                icon="ri-truck-line"
                label="이사정산"

                onClick={() => {
                  setOpenMenu("");

                  handleNavigate(
                    <MoveoutList
                      employeeId={
                        employeeId
                      }

                      userId={
                        userId
                      }

                      isMobile={
                        false
                      }
                    />,
                    "이사정산"
                  );
                }}

                active={
                  activeMenu ===
                  "이사정산"
                }
              />
            </div>


            {/* 캘린더 */}
            <div className="mt-0.5">
              <SidebarItem
                icon="ri-calendar-line"
                label="캘린더"

                onClick={() => {
                  setOpenMenu("");

                  handleNavigate(
                    <CalendarPage />,
                    "캘린더"
                  );
                }}

                active={
                  activeMenu ===
                  "캘린더"
                }
              />
            </div>


            {/* 일정관리 */}
            <div className="mt-0.5">
              <SidebarItem
                icon="ri-calendar-check-line"
                label="일정관리"

                onClick={() => {
                  setOpenMenu("");

                  handleNavigate(
                    <ScheduleManager />,
                    "일정관리"
                  );
                }}

                active={
                  activeMenu ===
                  "일정관리"
                }
              />
            </div>


            {/* 부가서비스 */}
            <div className="mt-0.5">
              <SidebarItem
                icon="ri-tools-line"
                label="부가서비스"

                onClick={() => {
                  const newState =
                    openMenu === "addon"
                      ? ""
                      : "addon";

                  setOpenMenu(
                    newState
                  );

                  setActiveMenu(
                    "부가서비스"
                  );
                }}

                active={
                  activeMenu ===
                  "부가서비스"
                }

                hasChildren

                isOpen={
                  openMenu ===
                  "addon"
                }
              />


              {openMenu === "addon" && (
                <SidebarSubmenu
                  items={[
                    "입주청소",
                    "도배",
                    "정산 하자 체크",
                    "전기요금 추출",
                    "공용전기 계산",
                    "입주자카드",
                    "자재비관리대장",
                    "수도검침조회",
                    "소독관리",
                    "관리일지",
                  ]}

                  activeMenu={
                    activeMenu
                  }

                  onClick={(item) => {
                    setActiveMenu(
                      item
                    );


                    const pages = {
                      입주청소:
                        <MoveInCleaningPage />,

                      도배:
                        <PaperingPage />,

                      "정산 하자 체크":
                        <SettlementDefectCheckPage />,

                      "전기요금 추출":
                        <MessageExtractor />,

                      "공용전기 계산":
                        <PublicElectricCalcPage />,

                      입주자카드:
                        <ResidentCardPage />,

                      자재비관리대장:
                        <MaterialCostPage />,

                      수도검침조회:
                        <WaterMeterReadingPage />,

                      소독관리:
                        <DisinfectionManagementPage />,

                      관리일지:
                        <ManagementLog />,
                    };


                    handleNavigate(
                      pages[item] ??
                        <ComingSoon
                          title={`부가서비스 · ${item}`}
                        />,
                      item
                    );
                  }}
                />
              )}
            </div>


            {/* 관리비회계 */}
            <div className="mt-0.5">
              <SidebarItem
                icon="ri-coins-line"
                label="관리비회계"

                onClick={() => {
                  const newState =
                    openMenu ===
                    "accounting"
                      ? ""
                      : "accounting";

                  setOpenMenu(
                    newState
                  );

                  setActiveMenu(
                    "관리비회계"
                  );
                }}

                active={
                  activeMenu ===
                  "관리비회계"
                }

                hasChildren

                isOpen={
                  openMenu ===
                  "accounting"
                }
              />


              {openMenu ===
                "accounting" && (
                <SidebarSubmenu
                  items={[
                    "수입정리",
                    "지출정리",
                    "일마감",
                    "월마감",
                    "연간시트",
                    "대금결제 관리",
                    "손익계산",
                    "미납관리",
                  ]}

                  activeMenu={
                    activeMenu
                  }

                  onClick={(item) => {
                    setActiveMenu(
                      item
                    );


                    if (
                      item ===
                      "수입정리"
                    ) {
                      handleNavigate(
                        <IncomeImportPage />,
                        item
                      );

                      return;
                    }


                    if (
                      item ===
                      "지출정리"
                    ) {
                      handleNavigate(
                        <ExpensePage />,
                        item
                      );

                      return;
                    }


                    if (
                      item ===
                      "일마감"
                    ) {
                      handleNavigate(
                        <DailyClosePage />,
                        item
                      );

                      return;
                    }


                    if (
                      item ===
                      "월마감"
                    ) {
                      handleNavigate(
                        <MonthlyClosePage />,
                        item
                      );

                      return;
                    }


                    if (
                      item ===
                      "연간시트"
                    ) {
                      handleNavigate(
                        <AnnualSheetPage />,
                        item
                      );

                      return;
                    }


                    if (
                      item ===
                      "대금결제 관리"
                    ) {
                      handleNavigate(
                        <PaymentSettlementPage />,
                        item
                      );

                      return;
                    }


                    if (
                      item ===
                      "손익계산"
                    ) {
                      handleNavigate(
                        <ProfitLossPage />,
                        item
                      );

                      return;
                    }


                    if (
                      item ===
                      "미납관리"
                    ) {
                      handleNavigate(
                        <UnpaidManagementPage />,
                        item
                      );

                      return;
                    }


                    handleNavigate(
                      <ComingSoon
                        title={`관리비회계 · ${item}`}
                      />,
                      item
                    );
                  }}
                />
              )}
            </div>


            {/* 영수증발행 */}
            <div className="mt-0.5">
              <SidebarItem
                icon="ri-receipt-line"
                label="영수증발행"

                onClick={() => {
                  setOpenMenu("");

                  handleNavigate(
                    <ReceiptIssuePage />,
                    "영수증발행"
                  );
                }}

                active={
                  activeMenu ===
                  "영수증발행"
                }
              />
            </div>


            {/* 거래처관리 */}
            <div className="mt-0.5">
              <SidebarItem
                icon="ri-booklet-line"
                label="거래처관리"

                onClick={() => {
                  setOpenMenu("");

                  handleNavigate(
                    <VendorsMainPage />,
                    "거래처관리"
                  );
                }}

                active={
                  activeMenu ===
                  "거래처관리"
                }
              />
            </div>


            {/* 메모 */}
            <div className="mt-0.5">
              <SidebarItem
                icon="ri-sticky-note-line"
                label="메모"

                onClick={() => {
                  setOpenMenu("");

                  handleNavigate(
                    <MemoPage
                      userId={
                        userId
                      }
                    />,
                    "메모"
                  );
                }}

                active={
                  activeMenu ===
                  "메모"
                }
              />
            </div>


            {/* 사원관리 */}
            <div className="mt-0.5">
              <SidebarItem
                icon="ri-user-line"
                label="사원관리"

                onClick={() => {
                  setOpenMenu("");

                  handleNavigate(
                    <EmployeePage />,
                    "사원관리"
                  );
                }}

                active={
                  activeMenu ===
                  "사원관리"
                }
              />
            </div>


            {/* 시스템 구분선 + 라벨 */}
            <div className="mt-4 mb-1.5 px-3">
              <div className="h-px bg-[var(--hn-border)]" />
            </div>

            <div className="px-3.5 pb-1 text-[11px] font-semibold text-slate-400 tracking-wide">
              시스템
            </div>


            {/* 기초등록 */}
            <div>
              <SidebarItem
                icon="ri-settings-3-line"
                label="기초등록"

                onClick={() => {
                  const newState =
                    openMenu ===
                    "settings"
                      ? ""
                      : "settings";

                  setOpenMenu(
                    newState
                  );

                  setActiveMenu(
                    "기초등록"
                  );
                }}

                active={
                  activeMenu ===
                  "기초등록"
                }

                hasChildren

                isOpen={
                  openMenu ===
                  "settings"
                }
              />


              {openMenu ===
                "settings" && (
                <SidebarSubmenu
                  items={[
                    "사원코드생성",
                    "설정",
                  ]}

                  activeMenu={
                    activeMenu
                  }

                  onClick={(item) => {
                    setActiveMenu(
                      item
                    );


                    if (
                      item ===
                      "사원코드생성"
                    ) {
                      handleNavigate(
                        <UserRegisterPage />,
                        item
                      );
                    }


                    else if (
                      item ===
                      "설정"
                    ) {
                      handleNavigate(
                        <VendorRegisterPage />,
                        item
                      );
                    }
                  }}
                />
              )}
            </div>


            {/* 업데이트 */}
            <div className="mt-0.5">
              <SidebarItem
                icon="ri-rocket-line"
                label="업데이트"

                onClick={() => {
                  setOpenMenu("");

                  setActiveMenu(
                    "업데이트"
                  );

                  setUpdatesOpen(
                    true
                  );
                }}

                active={
                  activeMenu ===
                  "업데이트"
                }
              />
            </div>

          </nav>
        </div>
      </aside>


      <main
        className="
          flex-1
          flex
          flex-col
          min-w-0
          bg-white
        "
      >

        <div
          className="
            flex-1
            overflow-auto
            p-6
          "
        >

          {activeContent || (
            <Dashboard
              userId={
                userId
              }

              userName={
                userName
              }
            />
          )}

        </div>

      </main>


      <UpdatesModal
        isOpen={
          updatesOpen
        }

        onClose={() =>
          setUpdatesOpen(false)
        }

        userId={
          userId
        }

        employeeId={
          employeeId
        }

        displayName={
          userName
        }
      />

    </div>
  );
};


export default TrezoSidebar;
