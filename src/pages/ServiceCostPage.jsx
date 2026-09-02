// src/pages/ServiceCostPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "../firebase";

import "./ServiceCostPage.css";


/* =========================================================
   기본 설정
========================================================= */

const RECORD_COLLECTION = "villa_service_costs";
const SETTINGS_DOC = "service_cost_settings/categories";

const TYPE_OPTIONS = [
  {
    value: "service",
    label: "서비스 지출",
    shortLabel: "서비스",
  },
  {
    value: "recovery",
    label: "비용 회수",
    shortLabel: "회수",
  },
  {
    value: "income",
    label: "추가 수익",
    shortLabel: "수익",
  },
];

const DEFAULT_SERVICE_CATEGORIES = [
  "전기",
  "조명",
  "수도",
  "배관",
  "소방",
  "승강기",
  "CCTV",
  "도어락",
  "로비폰",
  "청소",
  "정화조",
  "시설보수",
  "소모품",
  "민원처리",
  "기타",
];

const DEFAULT_RECOVERY_CATEGORIES = [
  "비용 환입",
  "관리비 잉여",
  "건물주 청구",
  "세입자 청구",
  "보험처리",
  "업체 환급",
  "기타",
];

const DEFAULT_INCOME_CATEGORIES = [
  "추가 관리수익",
  "임대·주차 부대수익",
  "공용시설 이용료",
  "이자수익",
  "위약금·배상금",
  "추가 수익",
  "기타",
];

const PREFERRED_DEFAULT_CATEGORY = {
  service: "전기",
  recovery: "비용 환입",
  income: "추가 관리수익",
};

const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];


/* =========================================================
   공통 유틸
========================================================= */

const toText = (value) => String(value ?? "").trim();

const toNumber = (value) => {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const formatMoney = (value) =>
  `${toNumber(value).toLocaleString("ko-KR")}원`;

const todayString = () => {
  const d = new Date();

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
};

const currentYear = new Date().getFullYear();

const STATS_YEAR_OPTIONS = Array.from(
  { length: 10 },
  (_, i) => String(2026 + i)
);

const DEFAULT_STATS_YEAR = STATS_YEAR_OPTIONS.includes(
  String(currentYear)
)
  ? String(currentYear)
  : STATS_YEAR_OPTIONS[STATS_YEAR_OPTIONS.length - 1];

const getTypeLabel = (type) =>
  TYPE_OPTIONS.find((item) => item.value === type)?.label || type;

const getTypeShortLabel = (type) =>
  TYPE_OPTIONS.find((item) => item.value === type)?.shortLabel || type;

const sanitizeCategoryList = (list) =>
  Array.from(
    new Set(
      (list || [])
        .map((item) => toText(item))
        .filter((item) => item.length > 0)
    )
  );


/* =========================================================
   메인 페이지
========================================================= */

export default function ServiceCostPage() {
  const [villas, setVillas] = useState([]);
  const [records, setRecords] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedVillaCode, setSelectedVillaCode] = useState("");

  const [searchText, setSearchText] = useState("");

  const [detailTypeFilter, setDetailTypeFilter] = useState("all");

  const [categories, setCategories] = useState({
    service: DEFAULT_SERVICE_CATEGORIES,
    recovery: DEFAULT_RECOVERY_CATEGORIES,
    income: DEFAULT_INCOME_CATEGORIES,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingCategories, setSavingCategories] = useState(false);

  const [statsOpen, setStatsOpen] = useState(false);

  const [form, setForm] = useState({
    date: todayString(),
    type: "service",
    category: "전기",
    description: "",
    amount: "",
    memo: "",
  });

  const amountInputRef = useRef(null);
  const descriptionInputRef = useRef(null);
  const memoInputRef = useRef(null);


  /* =========================================================
     데이터 조회
  ========================================================= */

  const fetchData = async () => {
    setLoading(true);

    try {
      const [villaSnapshot, recordSnapshot] = await Promise.all([
        getDocs(collection(db, "villas")),
        getDocs(collection(db, RECORD_COLLECTION)),
      ]);

      const villaList = villaSnapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .sort((a, b) =>
          toText(a.code).localeCompare(toText(b.code), "ko", {
            numeric: true,
          })
        );

      const recordList = recordSnapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .sort((a, b) => {
          const dateCompare = toText(b.date).localeCompare(toText(a.date));

          if (dateCompare !== 0) {
            return dateCompare;
          }

          return toText(b.id).localeCompare(toText(a.id));
        });

      setVillas(villaList);
      setRecords(recordList);

      setSelectedVillaCode((prev) => {
        if (
          prev &&
          villaList.some((villa) => toText(villa.code) === toText(prev))
        ) {
          return prev;
        }

        return villaList[0]?.code || "";
      });
    } catch (error) {
      console.error("🔥 서비스비용 관리 데이터 조회 실패:", error);
      alert("서비스비용 관리 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);


  /* =========================================================
     구분 항목 설정 조회 (최초 1회)
  ========================================================= */

  const fetchCategories = async () => {
    try {
      const snap = await getDoc(doc(db, SETTINGS_DOC));

      if (snap.exists()) {
        const data = snap.data() || {};

        setCategories({
          service:
            Array.isArray(data.service) && data.service.length
              ? data.service
              : DEFAULT_SERVICE_CATEGORIES,
          recovery:
            Array.isArray(data.recovery) && data.recovery.length
              ? data.recovery
              : DEFAULT_RECOVERY_CATEGORIES,
          income:
            Array.isArray(data.income) && data.income.length
              ? data.income
              : DEFAULT_INCOME_CATEGORIES,
        });
      }
    } catch (error) {
      console.error("🔥 구분 항목 설정 조회 실패:", error);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);


  /* =========================================================
     전체 필터 (연도/월 조회 제거 - 전체기간 기준)
  ========================================================= */

  const filteredRecords = records;


  /* =========================================================
     빌라별 집계
  ========================================================= */

  const villaSummaryMap = useMemo(() => {
    const map = {};

    villas.forEach((villa) => {
      const code = toText(villa.code);

      map[code] = {
        service: 0,
        recovery: 0,
        income: 0,
        offset: 0,
        net: 0,
        count: 0,
        lastDate: "",
      };
    });

    filteredRecords.forEach((record) => {
      const code = toText(record.villaCode);

      if (!map[code]) {
        return;
      }

      const amount = toNumber(record.amount);
      const type = record.type;

      if (type === "service") {
        map[code].service += amount;
      }

      if (type === "recovery") {
        map[code].recovery += amount;
      }

      if (type === "income") {
        map[code].income += amount;
      }

      map[code].count += 1;

      if (
        !map[code].lastDate ||
        toText(record.date) > map[code].lastDate
      ) {
        map[code].lastDate = toText(record.date);
      }
    });

    Object.keys(map).forEach((code) => {
      map[code].offset =
        map[code].recovery + map[code].income;

      map[code].net =
        map[code].service - map[code].offset;
    });

    return map;
  }, [villas, filteredRecords]);


  /* =========================================================
     상단 전체 통계
  ========================================================= */

  const dashboard = useMemo(() => {
    let service = 0;
    let recovery = 0;
    let income = 0;

    filteredRecords.forEach((record) => {
      const amount = toNumber(record.amount);

      if (record.type === "service") {
        service += amount;
      }

      if (record.type === "recovery") {
        recovery += amount;
      }

      if (record.type === "income") {
        income += amount;
      }
    });

    const offset = recovery + income;
    const net = service - offset;

    const serviceVillaCount = villas.filter((villa) => {
      const summary = villaSummaryMap[toText(villa.code)];
      return summary && summary.service > 0;
    }).length;

    return {
      service,
      recovery,
      income,
      offset,
      net,
      serviceVillaCount,
    };
  }, [filteredRecords, villas, villaSummaryMap]);


  /* =========================================================
     검색된 빌라
  ========================================================= */

  const visibleVillas = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) {
      return villas;
    }

    return villas.filter((villa) => {
      const summary = villaSummaryMap[toText(villa.code)] || {};

      const target = [
        villa.code,
        villa.name,
        villa.address,
        villa.district,
        summary.net,
        summary.service,
      ]
        .map((item) => toText(item).toLowerCase())
        .join(" ");

      return target.includes(keyword);
    });
  }, [villas, searchText, villaSummaryMap]);


  /* =========================================================
     선택 빌라
  ========================================================= */

  const selectedVilla = useMemo(() => {
    return (
      villas.find(
        (villa) =>
          toText(villa.code) === toText(selectedVillaCode)
      ) || null
    );
  }, [villas, selectedVillaCode]);

  const selectedSummary =
    villaSummaryMap[toText(selectedVillaCode)] || {
      service: 0,
      recovery: 0,
      income: 0,
      offset: 0,
      net: 0,
      count: 0,
      lastDate: "",
    };


  /* =========================================================
     선택 빌라 상세내역
  ========================================================= */

  const selectedVillaRecords = useMemo(() => {
    return filteredRecords
      .filter(
        (record) =>
          toText(record.villaCode) ===
          toText(selectedVillaCode)
      )
      .filter((record) => {
        if (detailTypeFilter === "all") {
          return true;
        }

        return record.type === detailTypeFilter;
      })
      .sort((a, b) => {
        const dateCompare =
          toText(b.date).localeCompare(toText(a.date));

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return toText(b.id).localeCompare(toText(a.id));
      });
  }, [
    filteredRecords,
    selectedVillaCode,
    detailTypeFilter,
  ]);


  /* =========================================================
     입력 폼
  ========================================================= */

  const handleFormChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleTypeChange = (type) => {
    const list = categories[type] || [];
    const preferred = PREFERRED_DEFAULT_CATEGORY[type];

    const category = list.includes(preferred)
      ? preferred
      : list[0] || "";

    setForm((prev) => ({
      ...prev,
      type,
      category,
    }));
  };

  const handleCategoryChange = (value) => {
    handleFormChange("category", value);

    window.setTimeout(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select?.();
    }, 0);
  };

  const handleAmountKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      descriptionInputRef.current?.focus();
    }
  };

  const handleDescriptionKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      memoInputRef.current?.focus();
    }
  };

  const categoryOptions = categories[form.type] || [];


  /* =========================================================
     저장
  ========================================================= */

  const handleSaveRecord = async (event) => {
    event.preventDefault();

    if (!selectedVilla) {
      alert("빌라를 먼저 선택해주세요.");
      return;
    }

    const amount = toNumber(form.amount);

    if (!form.date) {
      alert("지출/처리 날짜를 입력해주세요.");
      return;
    }

    if (!form.description.trim()) {
      alert("처리 내용을 입력해주세요.");
      return;
    }

    if (amount <= 0) {
      alert("금액을 입력해주세요.");
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, RECORD_COLLECTION), {
        villaId: selectedVilla.id || "",
        villaCode: toText(selectedVilla.code),
        villaName: toText(selectedVilla.name),
        villaAddress: toText(selectedVilla.address),

        date: form.date,
        type: form.type,
        category: form.category,

        description: form.description.trim(),
        amount,

        memo: form.memo.trim(),

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setForm((prev) => ({
        ...prev,
        description: "",
        amount: "",
        memo: "",
      }));

      await fetchData();
    } catch (error) {
      console.error("🔥 서비스비용 저장 실패:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };


  /* =========================================================
     삭제
  ========================================================= */

  const handleDeleteRecord = async (record) => {
    const label = getTypeLabel(record.type);

    const ok = window.confirm(
      `${record.date}\n${label}\n${record.description}\n${formatMoney(
        record.amount
      )}\n\n해당 내역을 삭제하시겠습니까?`
    );

    if (!ok) {
      return;
    }

    try {
      await deleteDoc(
        doc(db, RECORD_COLLECTION, record.id)
      );

      setRecords((prev) =>
        prev.filter((item) => item.id !== record.id)
      );
    } catch (error) {
      console.error("🔥 서비스비용 내역 삭제 실패:", error);
      alert("내역 삭제 중 오류가 발생했습니다.");
    }
  };


  /* =========================================================
     구분 항목 설정 저장
  ========================================================= */

  const handleSaveCategories = async (draft) => {
    const cleaned = {
      service: sanitizeCategoryList(draft.service),
      recovery: sanitizeCategoryList(draft.recovery),
      income: sanitizeCategoryList(draft.income),
    };

    setSavingCategories(true);

    try {
      await setDoc(doc(db, SETTINGS_DOC), cleaned);

      setCategories(cleaned);

      setForm((prev) => {
        const list = cleaned[prev.type] || [];

        if (list.includes(prev.category)) {
          return prev;
        }

        return { ...prev, category: list[0] || "" };
      });

      setSettingsOpen(false);
    } catch (error) {
      console.error("🔥 구분 항목 설정 저장 실패:", error);
      alert("설정 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingCategories(false);
    }
  };


  /* =========================================================
     렌더링
  ========================================================= */

  return (
    <div className="service-cost-page">
      {/* ===============================================
          헤더 설명 + 통계/설정 + 검색
      ================================================ */}
      <section className="service-cost-hero">
        <div className="service-cost-hero__content">
          <div className="service-cost-hero__eyebrow">
            SERVICE COST MANAGEMENT
          </div>

          <h2>서비스비용 관리</h2>
        </div>

        <div className="service-cost-hero__actions">
          <button
            type="button"
            className="service-cost-tool-button is-stats"
            onClick={() => setStatsOpen(true)}
          >
            <span className="service-cost-tool-icon">📊</span>
            통계
          </button>

          <button
            type="button"
            className="service-cost-tool-button is-settings"
            onClick={() => setSettingsOpen(true)}
          >
            <span className="service-cost-tool-icon">⚙</span>
            설정
          </button>

          <div className="service-cost-search">
            <span className="service-cost-search__icon">
              ⌕
            </span>

            <input
              type="text"
              value={searchText}
              onChange={(e) =>
                setSearchText(e.target.value)
              }
              placeholder="코드번호, 빌라명, 주소 검색"
            />
          </div>
        </div>
      </section>


      {/* ===============================================
          상단 통계
      ================================================ */}
      <section className="service-cost-summary-grid">
        <SummaryCard
          label="서비스 지출"
          value={dashboard.service}
          sub={`${dashboard.serviceVillaCount}개 빌라 서비스 발생`}
          tone="expense"
        />

        <SummaryCard
          label="비용 회수"
          value={dashboard.recovery}
          sub="서비스 비용 회수 금액"
          tone="recovery"
        />

        <SummaryCard
          label="추가 수익"
          value={dashboard.income}
          sub="빌라에서 발생한 추가 수익"
          tone="income"
        />

        <SummaryCard
          label="총 상계금액"
          value={dashboard.offset}
          sub="비용회수 + 추가수익"
          tone="offset"
        />

        <SummaryCard
          label="순서비스비용"
          value={dashboard.net}
          sub={
            dashboard.net >= 0
              ? "현재 회사 실제 부담액"
              : "서비스비용 이상 회수"
          }
          tone={dashboard.net >= 0 ? "net" : "profit"}
          signed
        />
      </section>


      {/* ===============================================
          본문
      ================================================ */}
      <section className="service-cost-workspace">
        {/* =============================================
            좌측 빌라 목록
        ============================================== */}
        <div className="service-cost-villa-panel">
          <div className="service-cost-panel-header">
            <div>
              <h3>관리 빌라 현황</h3>

              <p>
                빌라를 선택하면 서비스비용 상세 내역을
                확인할 수 있습니다.
              </p>
            </div>

            <div className="service-cost-count-badge">
              {visibleVillas.length}곳
            </div>
          </div>

          <div className="service-cost-table-wrap">
            <table className="service-cost-villa-table">
              <thead>
                <tr>
                  <th className="col-code">코드</th>
                  <th className="col-villa">빌라명</th>
                  <th className="col-service">
                    서비스 지출
                  </th>
                  <th className="col-offset">회수·수익</th>
                  <th className="col-net">
                    순서비스비용
                  </th>
                  <th className="col-count">건수</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="service-cost-empty"
                    >
                      데이터를 불러오는 중입니다.
                    </td>
                  </tr>
                ) : visibleVillas.length === 0 ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="service-cost-empty"
                    >
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  visibleVillas.map((villa) => {
                    const code = toText(villa.code);

                    const summary =
                      villaSummaryMap[code] || {
                        service: 0,
                        recovery: 0,
                        income: 0,
                        offset: 0,
                        net: 0,
                        count: 0,
                      };

                    const selected =
                      code ===
                      toText(selectedVillaCode);

                    return (
                      <tr
                        key={villa.id || code}
                        className={
                          selected
                            ? "is-selected"
                            : ""
                        }
                        onClick={() =>
                          setSelectedVillaCode(code)
                        }
                      >
                        <td className="villa-code-cell">
                          {code || "-"}
                        </td>

                        <td>
                          <div className="villa-name-cell">
                            <strong>
                              {villa.name || "-"}
                            </strong>

                            <span>
                              {villa.address || ""}
                            </span>
                          </div>
                        </td>

                        <td className="money-cell service-money">
                          {summary.service > 0
                            ? formatMoney(
                                summary.service
                              )
                            : "-"}
                        </td>

                        <td className="money-cell recovery-money">
                          {summary.offset > 0
                            ? formatMoney(summary.offset)
                            : "-"}
                        </td>

                        <td
                          className={`money-cell net-money ${
                            summary.net < 0
                              ? "is-profit"
                              : ""
                          }`}
                        >
                          {summary.net === 0
                            ? "-"
                            : summary.net < 0
                            ? `+${formatMoney(
                                Math.abs(summary.net)
                              )}`
                            : formatMoney(summary.net)}
                        </td>

                        <td className="count-cell">
                          {summary.count > 0
                            ? summary.count
                            : "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>


        {/* =============================================
            우측 상세
        ============================================== */}
        <div className="service-cost-detail-panel">
          {!selectedVilla ? (
            <div className="service-cost-no-selection">
              관리 빌라를 선택해주세요.
            </div>
          ) : (
            <>
              {/* 빌라 정보 */}
              <div className="service-cost-detail-head">
                <div className="service-cost-detail-info">
                  <div className="service-cost-detail-code">
                    CODE {selectedVilla.code || "-"}
                  </div>

                  <div className="service-cost-detail-name-row">
                    <h3>{selectedVilla.name}</h3>

                    <p>
                      {selectedVilla.address ||
                        "주소 정보 없음"}
                    </p>
                  </div>
                </div>

                <div
                  className={`service-cost-net-box ${
                    selectedSummary.net < 0
                      ? "is-profit"
                      : ""
                  }`}
                >
                  <span>
                    {selectedSummary.net < 0
                      ? "초과 회수 · 수익"
                      : "현재 순서비스비용"}
                  </span>

                  <strong>
                    {selectedSummary.net < 0
                      ? `+${formatMoney(
                          Math.abs(
                            selectedSummary.net
                          )
                        )}`
                      : formatMoney(
                          selectedSummary.net
                        )}
                  </strong>
                </div>
              </div>


              {/* 빌라 요약 */}
              <div className="service-cost-villa-summary">
                <VillaStat
                  label="서비스 지출"
                  value={selectedSummary.service}
                  type="service"
                />

                <VillaStat
                  label="비용 회수"
                  value={selectedSummary.recovery}
                  type="recovery"
                />

                <VillaStat
                  label="추가 수익"
                  value={selectedSummary.income}
                  type="income"
                />

                <VillaStat
                  label="처리 건수"
                  custom={`${selectedSummary.count}건`}
                  type="count"
                />
              </div>


              {/* 입력 */}
              <form
                className="service-cost-entry-card"
                onSubmit={handleSaveRecord}
              >
                <div className="service-cost-entry-title">
                  <div>
                    <h4>서비스비용 내역 등록</h4>

                    <p>
                      지출, 비용회수 또는 추가수익을
                      입력합니다.
                    </p>
                  </div>

                  <div className="service-cost-type-switch">
                    {TYPE_OPTIONS.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        className={`service-cost-type-button type-${type.value} ${
                          form.type === type.value
                            ? "is-active"
                            : ""
                        }`}
                        onClick={() =>
                          handleTypeChange(type.value)
                        }
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="service-cost-entry-grid">
                  <div className="entry-field">
                    <label>처리일자</label>

                    <DateField
                      value={form.date}
                      onChange={(value) =>
                        handleFormChange("date", value)
                      }
                    />
                  </div>

                  <div className="entry-field">
                    <label>구분</label>

                    <select
                      value={form.category}
                      onChange={(e) =>
                        handleCategoryChange(
                          e.target.value
                        )
                      }
                    >
                      {categoryOptions.map(
                        (category) => (
                          <option
                            key={category}
                            value={category}
                          >
                            {category}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div className="entry-field entry-field--amount">
                    <label>금액</label>

                    <div className="amount-input-wrap">
                      <input
                        type="text"
                        inputMode="numeric"
                        ref={amountInputRef}
                        value={
                          form.amount
                            ? Number(
                                String(
                                  form.amount
                                ).replace(/,/g, "")
                              ).toLocaleString(
                                "ko-KR"
                              )
                            : ""
                        }
                        onChange={(e) => {
                          const raw =
                            e.target.value.replace(
                              /[^0-9]/g,
                              ""
                            );

                          handleFormChange(
                            "amount",
                            raw
                          );
                        }}
                        onKeyDown={handleAmountKeyDown}
                        placeholder="0"
                      />

                      <span>원</span>
                    </div>
                  </div>

                  <div className="entry-field entry-field--description">
                    <label>처리 내용</label>

                    <input
                      type="text"
                      ref={descriptionInputRef}
                      value={form.description}
                      onChange={(e) =>
                        handleFormChange(
                          "description",
                          e.target.value
                        )
                      }
                      onKeyDown={
                        handleDescriptionKeyDown
                      }
                      placeholder={
                        form.type === "service"
                          ? "예: 계단 센서등 교체"
                          : form.type === "recovery"
                          ? "예: 관리비 잉여금으로 서비스비용 일부 회수"
                          : "예: 추가 관리수익 발생"
                      }
                    />
                  </div>

                  <div className="entry-field entry-field--memo">
                    <label>비고</label>

                    <input
                      type="text"
                      ref={memoInputRef}
                      value={form.memo}
                      onChange={(e) =>
                        handleFormChange(
                          "memo",
                          e.target.value
                        )
                      }
                      placeholder="추가 메모가 있으면 입력"
                    />
                  </div>

                  <div className="entry-action">
                    <button
                      type="submit"
                      disabled={saving}
                      className={`service-cost-save-button save-${form.type}`}
                    >
                      {saving
                        ? "저장 중..."
                        : `${getTypeShortLabel(
                            form.type
                          )} 등록`}
                    </button>
                  </div>
                </div>
              </form>


              {/* 상세내역 */}
              <div className="service-cost-history-card">
                <div className="service-cost-history-head">
                  <div>
                    <h4>처리 내역</h4>

                    <p>
                      선택한 빌라의 서비스 비용
                      변동 내역입니다.
                    </p>
                  </div>

                  <div className="service-cost-history-filter">
                    <button
                      type="button"
                      className={
                        detailTypeFilter === "all"
                          ? "is-active"
                          : ""
                      }
                      onClick={() =>
                        setDetailTypeFilter("all")
                      }
                    >
                      전체
                    </button>

                    <button
                      type="button"
                      className={
                        detailTypeFilter === "service"
                          ? "is-active"
                          : ""
                      }
                      onClick={() =>
                        setDetailTypeFilter("service")
                      }
                    >
                      서비스
                    </button>

                    <button
                      type="button"
                      className={
                        detailTypeFilter === "recovery"
                          ? "is-active"
                          : ""
                      }
                      onClick={() =>
                        setDetailTypeFilter("recovery")
                      }
                    >
                      비용회수
                    </button>

                    <button
                      type="button"
                      className={
                        detailTypeFilter === "income"
                          ? "is-active"
                          : ""
                      }
                      onClick={() =>
                        setDetailTypeFilter("income")
                      }
                    >
                      추가수익
                    </button>
                  </div>
                </div>

                <div className="service-cost-history-table-wrap">
                  <table className="service-cost-history-table">
                    <thead>
                      <tr>
                        <th>날짜</th>
                        <th>처리구분</th>
                        <th>항목</th>
                        <th>내용</th>
                        <th>금액</th>
                        <th>순서비스 반영</th>
                        <th>비고</th>
                        <th>관리</th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedVillaRecords.length ===
                      0 ? (
                        <tr>
                          <td
                            colSpan="8"
                            className="service-cost-empty"
                          >
                            등록된 내역이
                            없습니다.
                          </td>
                        </tr>
                      ) : (
                        selectedVillaRecords.map(
                          (record) => {
                            const isService =
                              record.type ===
                              "service";

                            return (
                              <tr key={record.id}>
                                <td className="history-date">
                                  {record.date || "-"}
                                </td>

                                <td>
                                  <span
                                    className={`history-type-badge type-${record.type}`}
                                  >
                                    {getTypeLabel(
                                      record.type
                                    )}
                                  </span>
                                </td>

                                <td className="history-category">
                                  {record.category ||
                                    "-"}
                                </td>

                                <td className="history-description">
                                  {record.description ||
                                    "-"}
                                </td>

                                <td
                                  className={`history-amount ${
                                    isService
                                      ? "is-expense"
                                      : "is-offset"
                                  }`}
                                >
                                  {formatMoney(
                                    record.amount
                                  )}
                                </td>

                                <td
                                  className={`history-effect ${
                                    isService
                                      ? "is-plus-cost"
                                      : "is-minus-cost"
                                  }`}
                                >
                                  {isService ? "+" : "-"}
                                  {formatMoney(
                                    record.amount
                                  )}
                                </td>

                                <td className="history-memo">
                                  {record.memo || "-"}
                                </td>

                                <td className="history-action">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteRecord(
                                        record
                                      )
                                    }
                                  >
                                    삭제
                                  </button>
                                </td>
                              </tr>
                            );
                          }
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <CategorySettingsModal
        open={settingsOpen}
        categories={categories}
        saving={savingCategories}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveCategories}
      />

      <StatsModal
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        records={records}
      />
    </div>
  );
}


/* =========================================================
   상단 통계 카드
========================================================= */

function SummaryCard({
  label,
  value,
  sub,
  tone,
  signed = false,
}) {
  const number = toNumber(value);

  return (
    <div
      className={`service-cost-summary-card service-cost-summary-card--${tone}`}
    >
      <div className="service-cost-summary-card__label">
        {label}
      </div>

      <div className="service-cost-summary-card__number">
        {signed && number < 0 ? "+" : ""}
        {Math.abs(number).toLocaleString("ko-KR")}
        <span>원</span>
      </div>

      <div className="service-cost-summary-card__sub">
        {sub}
      </div>
    </div>
  );
}


/* =========================================================
   선택 빌라 요약
========================================================= */

function VillaStat({
  label,
  value,
  custom,
  type,
}) {
  return (
    <div
      className={`service-cost-villa-stat stat-${type}`}
    >
      <span>{label}</span>

      <strong>
        {custom || formatMoney(value)}
      </strong>
    </div>
  );
}


/* =========================================================
   커스텀 날짜 선택 필드
========================================================= */

function DateField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    const base = value ? new Date(value) : new Date();
    return Number.isNaN(base.getTime()) ? new Date() : base;
  });

  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleOutside = (event) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);

    return () =>
      document.removeEventListener(
        "mousedown",
        handleOutside
      );
  }, [open]);

  useEffect(() => {
    if (open) {
      const base = value ? new Date(value) : new Date();
      setViewDate(
        Number.isNaN(base.getTime()) ? new Date() : base
      );
    }
  }, [open, value]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }

  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(d);
  }

  const todayStr = todayString();

  const formatDisplay = (dateStr) => {
    if (!dateStr) {
      return "날짜 선택";
    }

    const [y, m, d] = dateStr.split("-");

    if (!y || !m || !d) {
      return dateStr;
    }

    return `${y}년 ${Number(m)}월 ${Number(d)}일`;
  };

  const handlePick = (day) => {
    if (!day) {
      return;
    }

    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");

    onChange(`${year}-${mm}-${dd}`);
    setOpen(false);
  };

  const changeMonth = (delta) => {
    setViewDate(new Date(year, month + delta, 1));
  };

  return (
    <div className="scp-date-field" ref={wrapRef}>
      <button
        type="button"
        className="scp-date-trigger"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span
          className={
            value ? "" : "scp-date-placeholder"
          }
        >
          {formatDisplay(value)}
        </span>

        <span className="scp-date-trigger-icon">
          <CalendarGlyph />
        </span>
      </button>

      {open && (
        <div className="scp-date-popover">
          <div className="scp-date-popover-head">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="이전 달"
            >
              ‹
            </button>

            <strong>
              {year}년 {month + 1}월
            </strong>

            <button
              type="button"
              onClick={() => changeMonth(1)}
              aria-label="다음 달"
            >
              ›
            </button>
          </div>

          <div className="scp-date-weekrow">
            {WEEK_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="scp-date-grid">
            {cells.map((day, idx) => {
              if (!day) {
                return (
                  <span
                    key={`empty-${idx}`}
                    className="is-empty"
                  />
                );
              }

              const dateStr = `${year}-${String(
                month + 1
              ).padStart(2, "0")}-${String(
                day
              ).padStart(2, "0")}`;

              const isToday = dateStr === todayStr;
              const isSelected = dateStr === value;

              return (
                <button
                  type="button"
                  key={dateStr}
                  className={`scp-date-cell ${
                    isToday ? "is-today" : ""
                  } ${
                    isSelected ? "is-selected" : ""
                  }`}
                  onClick={() => handlePick(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="scp-date-popover-foot">
            <button
              type="button"
              className="scp-date-today-btn"
              onClick={() => {
                onChange(todayStr);
                setOpen(false);
              }}
            >
              오늘
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3.5"
        y="5"
        width="17"
        height="16"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M3.5 9.5H20.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 3V6.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M16 3V6.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}


/* =========================================================
   구분 항목 설정 모달
========================================================= */

function CategorySettingsModal({
  open,
  categories,
  saving,
  onClose,
  onSave,
}) {
  const [draft, setDraft] = useState(categories);
  const [activeTab, setActiveTab] = useState("service");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(categories);
      setActiveTab("service");
      setNewValue("");
    }
  }, [open, categories]);

  if (!open) {
    return null;
  }

  const list = draft[activeTab] || [];

  const addCategory = () => {
    const text = newValue.trim();

    if (!text) {
      return;
    }

    if (list.includes(text)) {
      alert("이미 등록된 항목입니다.");
      return;
    }

    setDraft((prev) => ({
      ...prev,
      [activeTab]: [...(prev[activeTab] || []), text],
    }));

    setNewValue("");
  };

  const removeCategory = (item) => {
    setDraft((prev) => ({
      ...prev,
      [activeTab]: (prev[activeTab] || []).filter(
        (c) => c !== item
      ),
    }));
  };

  const renameCategory = (index, nextValue) => {
    setDraft((prev) => {
      const next = [...(prev[activeTab] || [])];
      next[index] = nextValue;
      return { ...prev, [activeTab]: next };
    });
  };

  return (
    <div className="scp-modal-overlay" onClick={onClose}>
      <div
        className="scp-modal scp-settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scp-modal-head">
          <div>
            <h3>구분 항목 설정</h3>
            <p>
              서비스 지출 · 비용 회수 · 추가 수익의
              구분 항목을 직접 관리합니다.
            </p>
          </div>
        </div>

        <div className="scp-settings-tabs">
          {TYPE_OPTIONS.map((type) => (
            <button
              key={type.value}
              type="button"
              className={`scp-settings-tab ${
                activeTab === type.value
                  ? "is-active"
                  : ""
              }`}
              onClick={() => setActiveTab(type.value)}
            >
              {type.label}
            </button>
          ))}
        </div>

        <div className="scp-settings-body">
          <div className="scp-settings-list">
            {list.length === 0 ? (
              <div className="scp-settings-empty">
                등록된 항목이 없습니다.
              </div>
            ) : (
              list.map((item, index) => (
                <div
                  className="scp-settings-item"
                  key={`${activeTab}-${index}`}
                >
                  <input
                    type="text"
                    value={item}
                    onChange={(e) =>
                      renameCategory(
                        index,
                        e.target.value
                      )
                    }
                  />

                  <button
                    type="button"
                    onClick={() => removeCategory(item)}
                  >
                    삭제
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="scp-settings-add">
            <input
              type="text"
              value={newValue}
              onChange={(e) =>
                setNewValue(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCategory();
                }
              }}
              placeholder="새 구분 항목 입력"
            />

            <button type="button" onClick={addCategory}>
              추가
            </button>
          </div>
        </div>

        <div className="scp-modal-foot">
          <button
            type="button"
            className="scp-modal-cancel"
            onClick={onClose}
          >
            취소
          </button>

          <button
            type="button"
            className="scp-modal-save"
            disabled={saving}
            onClick={() => onSave(draft)}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}


/* =========================================================
   통계 모달
========================================================= */

function StatsModal({ open, onClose, records }) {
  const [selectedYear, setSelectedYear] = useState(
    DEFAULT_STATS_YEAR
  );

  useEffect(() => {
    if (open) {
      setSelectedYear((prev) =>
        STATS_YEAR_OPTIONS.includes(prev)
          ? prev
          : DEFAULT_STATS_YEAR
      );
    }
  }, [open]);

  const yearRecords = useMemo(
    () =>
      records.filter(
        (r) => toText(r.date).slice(0, 4) === selectedYear
      ),
    [records, selectedYear]
  );

  const monthlyData = useMemo(() => {
    const rows = Array.from({ length: 12 }).map((_, i) => ({
      month: i + 1,
      service: 0,
      recovery: 0,
      income: 0,
      offset: 0,
      net: 0,
    }));

    yearRecords.forEach((record) => {
      const month = Number(toText(record.date).slice(5, 7));

      if (!month || month < 1 || month > 12) {
        return;
      }

      const row = rows[month - 1];
      const amount = toNumber(record.amount);

      if (record.type === "service") {
        row.service += amount;
      }

      if (record.type === "recovery") {
        row.recovery += amount;
      }

      if (record.type === "income") {
        row.income += amount;
      }
    });

    rows.forEach((row) => {
      row.offset = row.recovery + row.income;
      row.net = row.service - row.offset;
    });

    return rows;
  }, [yearRecords]);

  const kpi = useMemo(() => {
    const service = monthlyData.reduce(
      (sum, r) => sum + r.service,
      0
    );
    const recovery = monthlyData.reduce(
      (sum, r) => sum + r.recovery,
      0
    );
    const income = monthlyData.reduce(
      (sum, r) => sum + r.income,
      0
    );
    const offset = recovery + income;
    const net = service - offset;
    const recoveryRate =
      service > 0 ? (offset / service) * 100 : 0;

    return { service, recovery, income, offset, net, recoveryRate };
  }, [monthlyData]);

  const categoryRanking = useMemo(() => {
    const map = {};

    yearRecords.forEach((record) => {
      const key = `${record.type}__${record.category || "기타"}`;

      if (!map[key]) {
        map[key] = {
          type: record.type,
          category: record.category || "기타",
          amount: 0,
          count: 0,
        };
      }

      map[key].amount += toNumber(record.amount);
      map[key].count += 1;
    });

    return Object.values(map)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [yearRecords]);

  const villaRanking = useMemo(() => {
    const map = {};

    yearRecords.forEach((record) => {
      const code = toText(record.villaCode);

      if (!code) {
        return;
      }

      if (!map[code]) {
        map[code] = {
          code,
          name: record.villaName || "",
          service: 0,
          offset: 0,
        };
      }

      const amount = toNumber(record.amount);

      if (record.type === "service") {
        map[code].service += amount;
      }

      if (record.type === "recovery" || record.type === "income") {
        map[code].offset += amount;
      }
    });

    return Object.values(map)
      .map((item) => ({ ...item, net: item.service - item.offset }))
      .filter((item) => item.service > 0 || item.offset > 0)
      .sort((a, b) => b.net - a.net)
      .slice(0, 5);
  }, [yearRecords]);

  const categoryMax = Math.max(
    1,
    ...categoryRanking.map((c) => c.amount)
  );

  if (!open) {
    return null;
  }

  return (
    <div className="scp-modal-overlay" onClick={onClose}>
      <div
        className="scp-modal scp-stats-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scp-modal-head">
          <div>
            <h3>서비스비용 통계</h3>
            <p>
              연도별 서비스비용 발생 추이와 구성을
              확인합니다.
            </p>
          </div>

          <div className="scp-modal-head-actions">
            <div className="scp-stats-year-select">
              <select
                value={selectedYear}
                onChange={(e) =>
                  setSelectedYear(e.target.value)
                }
              >
                {STATS_YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    {year}년
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="scp-modal-close"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="scp-stats-body">
          <div className="scp-stats-kpi-row">
            <StatKpi
              label="서비스 지출"
              value={kpi.service}
              tone="expense"
            />

            <StatKpi
              label="비용 회수·수익"
              value={kpi.offset}
              tone="offset"
            />

            <StatKpi
              label="순서비스비용"
              value={kpi.net}
              tone={kpi.net >= 0 ? "net" : "profit"}
              signed
            />

            <StatKpi
              label="회수율"
              custom={`${kpi.recoveryRate.toFixed(1)}%`}
              tone="rate"
            />
          </div>

          <div className="scp-stats-sections">
            <div className="scp-stats-panel">
              <div className="scp-stats-panel-title">
                월별 발생 추이
              </div>

              <ServiceTrendChart data={monthlyData} />

              <div className="scp-trend-legend">
                <span>
                  <i className="dot dot-service" />
                  서비스 지출
                </span>

                <span>
                  <i className="dot dot-offset" />
                  회수·수익
                </span>

                <span>
                  <i className="dot dot-net" />
                  순서비스비용
                </span>
              </div>
            </div>

            <div className="scp-stats-columns">
              <div className="scp-stats-panel">
                <div className="scp-stats-panel-title">
                  구분별 발생 순위
                </div>

                <div className="scp-rank-list">
                  {categoryRanking.length === 0 ? (
                    <div className="scp-stats-empty">
                      데이터가 없습니다.
                    </div>
                  ) : (
                    categoryRanking.map((item) => (
                      <div
                        className="scp-rank-row"
                        key={`${item.type}-${item.category}`}
                      >
                        <div className="scp-rank-row-head">
                          <span
                            className={`scp-rank-badge type-${item.type}`}
                          >
                            {getTypeShortLabel(item.type)}
                          </span>

                          <strong>{item.category}</strong>

                          <em>{formatMoney(item.amount)}</em>
                        </div>

                        <div className="scp-rank-bar-track">
                          <div
                            className={`scp-rank-bar-fill type-${item.type}`}
                            style={{
                              width: `${
                                (item.amount / categoryMax) * 100
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="scp-stats-panel">
                <div className="scp-stats-panel-title">
                  빌라별 부담 순위 TOP 5
                </div>

                <div className="scp-villa-rank-list">
                  {villaRanking.length === 0 ? (
                    <div className="scp-stats-empty">
                      데이터가 없습니다.
                    </div>
                  ) : (
                    villaRanking.map((item, index) => (
                      <div
                        className="scp-villa-rank-row"
                        key={item.code}
                      >
                        <span className="scp-villa-rank-index">
                          {index + 1}
                        </span>

                        <div className="scp-villa-rank-info">
                          <strong>
                            {item.name || item.code}
                          </strong>
                          <span>{item.code}</span>
                        </div>

                        <em
                          className={
                            item.net < 0 ? "is-profit" : ""
                          }
                        >
                          {item.net < 0
                            ? `+${formatMoney(
                                Math.abs(item.net)
                              )}`
                            : formatMoney(item.net)}
                        </em>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatKpi({ label, value, custom, tone, signed }) {
  const number = toNumber(value);

  return (
    <div className={`scp-stat-kpi tone-${tone}`}>
      <span>{label}</span>

      <strong>
        {custom
          ? custom
          : `${signed && number < 0 ? "+" : ""}${Math.abs(
              number
            ).toLocaleString("ko-KR")}원`}
      </strong>
    </div>
  );
}

function ServiceTrendChart({ data }) {
  const width = 900;
  const height = 260;
  const padL = 46;
  const padR = 10;
  const padT = 16;
  const padB = 34;

  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const maxVal = Math.max(
    1,
    ...data.map((d) => Math.max(d.service, d.offset))
  );

  const xStep = innerW / data.length;
  const yScale = (v) => padT + innerH - (v / maxVal) * innerH;

  const netPoints = data.map((d, i) => [
    padL + xStep * i + xStep / 2,
    yScale(Math.max(0, d.net)),
  ]);

  const linePath = netPoints
    .map(
      (p, i) => `${i === 0 ? "M" : "L"} ${p[0]},${p[1]}`
    )
    .join(" ");

  return (
    <svg
      className="scp-trend-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="월별 서비스비용 추이"
    >
      <defs>
        <linearGradient
          id="scpServiceBar"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor="#e6807f" />
          <stop offset="100%" stopColor="#d65b5b" />
        </linearGradient>

        <linearGradient
          id="scpOffsetBar"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor="#6ea8e0" />
          <stop offset="100%" stopColor="#4c84bd" />
        </linearGradient>
      </defs>

      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={padL}
          x2={width - padR}
          y1={padT + innerH * (1 - t)}
          y2={padT + innerH * (1 - t)}
          className="scp-trend-grid"
        />
      ))}

      {data.map((d, i) => {
        const groupX = padL + xStep * i;
        const barW = xStep * 0.28;

        return (
          <g key={d.month}>
            <rect
              x={groupX + xStep * 0.14}
              y={yScale(d.service)}
              width={barW}
              height={Math.max(
                0,
                padT + innerH - yScale(d.service)
              )}
              rx={3}
              fill="url(#scpServiceBar)"
            />

            <rect
              x={groupX + xStep * 0.54}
              y={yScale(d.offset)}
              width={barW}
              height={Math.max(
                0,
                padT + innerH - yScale(d.offset)
              )}
              rx={3}
              fill="url(#scpOffsetBar)"
            />

            <text
              x={groupX + xStep / 2}
              y={height - 10}
              textAnchor="middle"
              className="scp-trend-month-label"
            >
              {d.month}월
            </text>
          </g>
        );
      })}

      <path
        d={linePath}
        className="scp-trend-net-line"
        fill="none"
      />

      {netPoints.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={3}
          className="scp-trend-net-dot"
        />
      ))}
    </svg>
  );
}
