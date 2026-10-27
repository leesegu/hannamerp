// src/pages/DisinfectionManagementPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import "./DisinfectionManagementPage.css";

const RECORD_COLLECTION = "villa_disinfection_records";

const METHOD_OPTIONS = [
  "분무소독",
  "연무소독",
  "ULV 초미립자",
  "겔·독먹이제",
  "잔류분무",
  "트랩 설치",
  "유충구제",
  "복합방제",
  "기타",
];

const AREA_OPTIONS = [
  "공동현관",
  "계단·복도",
  "엘리베이터",
  "주차장",
  "정화조 주변",
  "하수구·배수구",
  "화단",
  "각 세대",
  "기타 공용부",
];

const TARGET_OPTIONS = [
  "바퀴벌레",
  "개미",
  "쥐",
  "먼지다듬이",
  "기타 해충",
  "감염병 예방",
  "종합 방역",
];

const WORK_TYPE_OPTIONS = [
  { value: "self", label: "자체 소독" },
  { value: "vendor", label: "업체 소독" },
];

const CONTRACT_OPTIONS = [
  "건별 의뢰",
  "월 정기계약",
  "분기 정기계약",
  "반기 정기계약",
  "연간 정기계약",
  "관리계약 포함",
  "기타",
];

const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const todayString = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const addMonths = (dateString, months) => {
  if (!dateString) return "";

  const d = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(d.getTime())) return "";

  d.setMonth(d.getMonth() + Number(months || 0));

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
};

const toText = (value) => String(value ?? "").trim();

const toNumber = (value) => {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const formatMoney = (value) =>
  `${toNumber(value).toLocaleString("ko-KR")}원`;

const formatDate = (value) => {
  if (!value) return "-";

  const [y, m, d] = String(value).split("-");

  if (!y || !m || !d) return value;

  return `${y}.${m}.${d}`;
};

const getDaysDiff = (dateString) => {
  if (!dateString) return null;

  const today = new Date(`${todayString()}T00:00:00`);
  const target = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(target.getTime())) return null;

  return Math.ceil(
    (target - today) / (1000 * 60 * 60 * 24)
  );
};

const getScheduleStatus = (nextDate) => {
  if (!nextDate) {
    return {
      key: "unset",
      label: "예정일 미등록",
      detail: "다음 소독 예정일 없음",
    };
  }

  const diff = getDaysDiff(nextDate);

  if (diff === null) {
    return {
      key: "unset",
      label: "확인 필요",
      detail: "예정일 확인 필요",
    };
  }

  if (diff < 0) {
    return {
      key: "overdue",
      label: "기한경과",
      detail: `${Math.abs(diff)}일 경과`,
    };
  }

  if (diff === 0) {
    return {
      key: "due",
      label: "오늘 예정",
      detail: "오늘 소독 예정",
    };
  }

  if (diff <= 30) {
    return {
      key: "soon",
      label: "예정임박",
      detail: `${diff}일 남음`,
    };
  }

  return {
    key: "normal",
    label: "정상",
    detail: `${diff}일 남음`,
  };
};

const emptyForm = {
  date: todayString(),
  method: "분무소독",
  targets: ["종합 방역"],
  areas: [],
  workType: "self",
  contractType: "",
  amount: "",
  isMandatory: false,
  company: "",
  worker: "",
  chemical: "",
  nextDate: "",
  intervalMonths: "",
  memo: "",
};

export default function DisinfectionManagementPage() {
  const [villas, setVillas] = useState([]);
  const [records, setRecords] = useState([]);

  const [selectedVillaCode, setSelectedVillaCode] =
    useState("");

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("all");

  const [historyYear, setHistoryYear] = useState(
    String(new Date().getFullYear())
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState("");

  const [form, setForm] = useState(emptyForm);

  /* =========================================================
     데이터 조회
  ========================================================= */

  const fetchData = async () => {
    setLoading(true);

    try {
      const [villaSnap, recordSnap] =
        await Promise.all([
          getDocs(collection(db, "villas")),
          getDocs(
            collection(
              db,
              RECORD_COLLECTION
            )
          ),
        ]);

      const villaList = villaSnap.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .sort((a, b) =>
          toText(a.code).localeCompare(
            toText(b.code),
            "ko",
            {
              numeric: true,
            }
          )
        );

      const recordList = recordSnap.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .sort((a, b) =>
          toText(b.date).localeCompare(
            toText(a.date)
          )
        );

      setVillas(villaList);
      setRecords(recordList);

      setSelectedVillaCode((prev) => {
        if (
          prev &&
          villaList.some(
            (villa) =>
              toText(villa.code) ===
              toText(prev)
          )
        ) {
          return prev;
        }

        return villaList[0]?.code || "";
      });
    } catch (error) {
      console.error(
        "🔥 소독관리 데이터 조회 실패:",
        error
      );

      alert(
        "소독관리 데이터를 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  /* =========================================================
     빌라별 최근 소독기록
  ========================================================= */

  const latestRecordMap = useMemo(() => {
    const map = {};

    records.forEach((record) => {
      const code = toText(
        record.villaCode
      );

      if (!code) return;

      if (
        !map[code] ||
        toText(record.date) >
          toText(map[code].date)
      ) {
        map[code] = record;
      }
    });

    return map;
  }, [records]);

  /* =========================================================
     빌라별 요약
  ========================================================= */

  const summaryMap = useMemo(() => {
    const map = {};

    villas.forEach((villa) => {
      const code = toText(villa.code);

      const latest =
        latestRecordMap[code] || null;

      map[code] = {
        latest,

        lastDate:
          latest?.date || "",

        method:
          latest?.method || "",

        nextDate:
          latest?.nextDate || "",

        isMandatory:
          Boolean(latest?.isMandatory),

        status: getScheduleStatus(
          latest?.nextDate || ""
        ),

        count: records.filter(
          (record) =>
            toText(
              record.villaCode
            ) === code
        ).length,
      };
    });

    return map;
  }, [
    villas,
    records,
    latestRecordMap,
  ]);

  /* =========================================================
     상단 대시보드
  ========================================================= */

  const dashboard = useMemo(() => {
    const currentYear = String(
      new Date().getFullYear()
    );

    const disinfectedThisYear =
      villas.filter((villa) =>
        records.some(
          (record) =>
            toText(
              record.villaCode
            ) ===
              toText(villa.code) &&
            toText(record.date).slice(
              0,
              4
            ) === currentYear
        )
      ).length;

    const overdue = villas.filter(
      (villa) =>
        summaryMap[
          toText(villa.code)
        ]?.status.key ===
        "overdue"
    ).length;

    const soon = villas.filter(
      (villa) =>
        ["due", "soon"].includes(
          summaryMap[
            toText(villa.code)
          ]?.status.key
        )
    ).length;

    const noSchedule =
      villas.filter(
        (villa) =>
          summaryMap[
            toText(villa.code)
          ]?.status.key ===
          "unset"
      ).length;

    const mandatory = villas.filter(
      (villa) =>
        summaryMap[toText(villa.code)]?.isMandatory
    ).length;

    return {
      total: villas.length,
      disinfectedThisYear,
      overdue,
      soon,
      noSchedule,
      mandatory,
    };
  }, [
    villas,
    records,
    summaryMap,
  ]);

  /* =========================================================
     검색 / 상태 필터
  ========================================================= */

  const visibleVillas =
    useMemo(() => {
      const keyword =
        searchText
          .trim()
          .toLowerCase();

      return villas.filter(
        (villa) => {
          const code = toText(
            villa.code
          );

          const summary =
            summaryMap[code];

          const matchesStatus =
            statusFilter === "all" ||
            (statusFilter === "mandatory"
              ? Boolean(summary?.isMandatory)
              : statusFilter === "soon"
              ? [
                  "soon",
                  "due",
                ].includes(
                  summary?.status
                    .key
                )
              : summary?.status
                  .key ===
                statusFilter);

          if (!matchesStatus) {
            return false;
          }

          if (!keyword) {
            return true;
          }

          return [
            villa.code,
            villa.name,
            villa.address,
            villa.district,
            summary?.method,
            summary?.status.label,
          ]
            .map((value) =>
              toText(
                value
              ).toLowerCase()
            )
            .join(" ")
            .includes(keyword);
        }
      );
    }, [
      villas,
      searchText,
      statusFilter,
      summaryMap,
    ]);

  /* =========================================================
     선택 빌라
  ========================================================= */

  const selectedVilla =
    useMemo(
      () =>
        villas.find(
          (villa) =>
            toText(
              villa.code
            ) ===
            toText(
              selectedVillaCode
            )
        ) || null,
      [
        villas,
        selectedVillaCode,
      ]
    );

  const selectedSummary =
    summaryMap[
      toText(selectedVillaCode)
    ] || {
      latest: null,
      lastDate: "",
      method: "",
      nextDate: "",
      isMandatory: false,
      status:
        getScheduleStatus(""),
      count: 0,
    };

  /* =========================================================
     선택 빌라 이력
  ========================================================= */

  const selectedRecords =
    useMemo(
      () =>
        records
          .filter(
            (record) =>
              toText(
                record.villaCode
              ) ===
              toText(
                selectedVillaCode
              )
          )
          .filter(
            (record) => {
              if (
                historyYear ===
                "all"
              ) {
                return true;
              }

              return (
                toText(
                  record.date
                ).slice(0, 4) ===
                historyYear
              );
            }
          )
          .sort((a, b) =>
            toText(
              b.date
            ).localeCompare(
              toText(a.date)
            )
          ),
      [
        records,
        selectedVillaCode,
        historyYear,
      ]
    );

  const yearOptions =
    useMemo(() => {
      const set = new Set([
        String(
          new Date().getFullYear()
        ),
      ]);

      records.forEach(
        (record) => {
          const year = toText(
            record.date
          ).slice(0, 4);

          if (
            /^\d{4}$/.test(year)
          ) {
            set.add(year);
          }
        }
      );

      return Array.from(
        set
      ).sort(
        (a, b) =>
          Number(b) -
          Number(a)
      );
    }, [records]);

  /* =========================================================
     입력 초기화
  ========================================================= */

  const resetForm = () => {
    setEditingId("");
    setForm(emptyForm);
  };

  /* =========================================================
     다중선택
  ========================================================= */

  const handleToggleArray = (
    key,
    value
  ) => {
    setForm((prev) => {
      const list =
        prev[key] || [];

      return {
        ...prev,

        [key]:
          list.includes(value)
            ? list.filter(
                (item) =>
                  item !== value
              )
            : [
                ...list,
                value,
              ],
      };
    });
  };

  /* =========================================================
     주기 자동 계산
  ========================================================= */

  const handleIntervalChange = (
    value
  ) => {
    const onlyNumber =
      String(value).replace(
        /[^0-9]/g,
        ""
      );

    setForm((prev) => ({
      ...prev,

      intervalMonths:
        onlyNumber,

      nextDate:
        onlyNumber &&
        prev.date
          ? addMonths(
              prev.date,
              Number(
                onlyNumber
              )
            )
          : prev.nextDate,
    }));
  };

  const handleDateChange = (
    value
  ) => {
    setForm((prev) => ({
      ...prev,

      date: value,

      nextDate:
        prev.intervalMonths &&
        value
          ? addMonths(
              value,
              Number(
                prev.intervalMonths
              )
            )
          : prev.nextDate,
    }));
  };

  /* =========================================================
     저장 / 수정
  ========================================================= */

  const handleSave = async (
    event
  ) => {
    event.preventDefault();

    if (!selectedVilla) {
      alert(
        "관리 빌라를 먼저 선택해주세요."
      );
      return;
    }

    if (!form.date) {
      alert(
        "소독일을 입력해주세요."
      );
      return;
    }

    if (!form.method) {
      alert(
        "소독 방식을 선택해주세요."
      );
      return;
    }

    if (
      form.targets.length ===
      0
    ) {
      alert(
        "방역 대상을 1개 이상 선택해주세요."
      );
      return;
    }

    setSaving(true);

    const payload = {
      villaId:
        selectedVilla.id || "",

      villaCode: toText(
        selectedVilla.code
      ),

      villaName: toText(
        selectedVilla.name
      ),

      villaAddress: toText(
        selectedVilla.address
      ),

      date: form.date,

      method: form.method,

      targets: form.targets,

      areas: form.areas,

      workType: form.workType,

      contractType:
        form.workType === "vendor"
          ? form.contractType
          : "",

      amount:
        form.workType === "vendor"
          ? toNumber(form.amount)
          : 0,

      isMandatory: Boolean(form.isMandatory),

      company:
        form.company.trim(),

      worker:
        form.worker.trim(),

      chemical:
        form.chemical.trim(),

      nextDate:
        form.nextDate,

      intervalMonths:
        form.intervalMonths
          ? Number(
              form.intervalMonths
            )
          : null,

      memo:
        form.memo.trim(),

      updatedAt:
        serverTimestamp(),
    };

    try {
      if (editingId) {
        await updateDoc(
          doc(
            db,
            RECORD_COLLECTION,
            editingId
          ),
          payload
        );
      } else {
        await addDoc(
          collection(
            db,
            RECORD_COLLECTION
          ),
          {
            ...payload,

            createdAt:
              serverTimestamp(),
          }
        );
      }

      resetForm();

      await fetchData();
    } catch (error) {
      console.error(
        "🔥 소독관리 저장 실패:",
        error
      );

      alert(
        "소독관리 저장 중 오류가 발생했습니다."
      );
    } finally {
      setSaving(false);
    }
  };

  /* =========================================================
     수정
  ========================================================= */

  const handleEdit = (
    record
  ) => {
    setEditingId(record.id);

    setForm({
      date:
        record.date ||
        todayString(),

      method:
        record.method ||
        "분무소독",

      targets:
        Array.isArray(
          record.targets
        )
          ? record.targets
          : [],

      areas:
        Array.isArray(
          record.areas
        )
          ? record.areas
          : [],

      workType:
        record.workType ||
        (record.company ? "vendor" : "self"),

      contractType:
        record.contractType || "",

      amount:
        record.amount ? String(record.amount) : "",

      isMandatory:
        Boolean(record.isMandatory),

      company:
        record.company || "",

      worker:
        record.worker || "",

      chemical:
        record.chemical || "",

      nextDate:
        record.nextDate || "",

      intervalMonths:
        record.intervalMonths ===
          null ||
        record.intervalMonths ===
          undefined
          ? ""
          : String(
              record.intervalMonths
            ),

      memo:
        record.memo || "",
    });
  };

  /* =========================================================
     삭제
  ========================================================= */

  const handleDelete = async (
    record
  ) => {
    const ok =
      window.confirm(
        `${
          record.villaName ||
          selectedVilla?.name ||
          ""
        }\n${
          record.date
        }\n${
          record.method || ""
        }\n\n해당 소독 내역을 삭제하시겠습니까?`
      );

    if (!ok) return;

    try {
      await deleteDoc(
        doc(
          db,
          RECORD_COLLECTION,
          record.id
        )
      );

      setRecords((prev) =>
        prev.filter(
          (item) =>
            item.id !==
            record.id
        )
      );

      if (
        editingId ===
        record.id
      ) {
        resetForm();
      }
    } catch (error) {
      console.error(
        "🔥 소독 내역 삭제 실패:",
        error
      );

      alert(
        "삭제 중 오류가 발생했습니다."
      );
    }
  };

  /* =========================================================
     렌더링
  ========================================================= */

  return (
    <div className="disinfection-page">

      {/* =============================================
          HERO
      ============================================== */}

      <section className="disinfection-hero">
        <div className="disinfection-hero__title">
          <div className="disinfection-hero__eyebrow">
            FACILITY HYGIENE & PEST CONTROL
          </div>

          <h2>
            소독관리
          </h2>

          <p>
            관리 빌라의 소독 이력과 방역 방식,
            작업범위, 다음 예정일을 통합 관리합니다.
          </p>
        </div>

        <div className="disinfection-hero__actions">
          <div className="disinfection-status-filter">
            <button
              type="button"
              className={
                statusFilter ===
                "all"
                  ? "is-active"
                  : ""
              }
              onClick={() =>
                setStatusFilter(
                  "all"
                )
              }
            >
              전체
            </button>

            <button
              type="button"
              className={
                statusFilter ===
                "overdue"
                  ? "is-active danger"
                  : ""
              }
              onClick={() =>
                setStatusFilter(
                  "overdue"
                )
              }
            >
              기한경과
            </button>

            <button
              type="button"
              className={
                [
                  "soon",
                  "due",
                ].includes(
                  statusFilter
                )
                  ? "is-active warning"
                  : ""
              }
              onClick={() =>
                setStatusFilter(
                  "soon"
                )
              }
            >
              예정임박
            </button>

            <button
              type="button"
              className={
                statusFilter ===
                "mandatory"
                  ? "is-active mandatory"
                  : ""
              }
              onClick={() =>
                setStatusFilter(
                  "mandatory"
                )
              }
            >
              방역의무
            </button>

            <button
              type="button"
              className={
                statusFilter ===
                "unset"
                  ? "is-active muted"
                  : ""
              }
              onClick={() =>
                setStatusFilter(
                  "unset"
                )
              }
            >
              예정일 미등록
            </button>
          </div>

          <div className="disinfection-search">
            <span>
              ⌕
            </span>

            <input
              type="text"
              value={
                searchText
              }
              onChange={(e) =>
                setSearchText(
                  e.target.value
                )
              }
              placeholder="코드번호, 빌라명, 주소 검색"
            />
          </div>
        </div>
      </section>

      {/* =============================================
          상단 통계
      ============================================== */}

      <section className="disinfection-summary-grid">
        <SummaryCard
          label="전체 관리 빌라"
          value={
            dashboard.total
          }
          unit="곳"
          sub="villas 컬렉션 자동 연동"
          tone="total"
        />

        <SummaryCard
          label="금년 소독 완료"
          value={
            dashboard.disinfectedThisYear
          }
          unit="곳"
          sub={`${new Date().getFullYear()}년 소독기록 기준`}
          tone="complete"
        />

        <SummaryCard
          label="예정 임박"
          value={
            dashboard.soon
          }
          unit="곳"
          sub="오늘 또는 30일 이내 예정"
          tone="soon"
        />

        <SummaryCard
          label="기한 경과"
          value={
            dashboard.overdue
          }
          unit="곳"
          sub="다음 예정일이 지난 빌라"
          tone="overdue"
        />

        <SummaryCard
          label="방역의무 대상"
          value={dashboard.mandatory}
          unit="곳"
          sub="의무대상으로 체크된 빌라"
          tone="mandatory"
        />

        <SummaryCard
          label="예정일 미등록"
          value={
            dashboard.noSchedule
          }
          unit="곳"
          sub="다음 소독일 확인 필요"
          tone="unset"
        />
      </section>

      {/* =============================================
          본문
      ============================================== */}

      <section className="disinfection-workspace">

        {/* ===========================================
            좌측 관리 빌라
        ============================================ */}

        <div className="disinfection-villa-panel">
          <div className="disinfection-panel-header">
            <div>
              <h3>
                관리 빌라 현황
              </h3>

              <p>
                빌라를 선택하면 소독 현황과 전체
                이력을 확인할 수 있습니다.
              </p>
            </div>

            <div className="disinfection-count-badge">
              {
                visibleVillas.length
              }
              곳
            </div>
          </div>

          <div className="disinfection-villa-table-wrap">
            <table className="disinfection-villa-table">
              <thead>
                <tr>
                  <th className="d-col-code">
                    코드
                  </th>

                  <th className="d-col-villa">
                    빌라명
                  </th>

                  <th className="d-col-last">
                    최근 소독일
                  </th>

                  <th className="d-col-method">
                    최근 방식
                  </th>

                  <th className="d-col-next">
                    다음 예정일
                  </th>

                  <th className="d-col-status">
                    상태
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="disinfection-empty"
                    >
                      데이터를 불러오는 중입니다.
                    </td>
                  </tr>
                ) : visibleVillas.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="disinfection-empty"
                    >
                      조건에 맞는 관리 빌라가 없습니다.
                    </td>
                  </tr>
                ) : (
                  visibleVillas.map(
                    (villa) => {
                      const code =
                        toText(
                          villa.code
                        );

                      const summary =
                        summaryMap[
                          code
                        ];

                      const selected =
                        code ===
                        toText(
                          selectedVillaCode
                        );

                      return (
                        <tr
                          key={
                            villa.id ||
                            code
                          }
                          className={
                            selected
                              ? "is-selected"
                              : ""
                          }
                          onClick={() => {
                            setSelectedVillaCode(
                              code
                            );

                            resetForm();
                          }}
                        >
                          <td className="d-villa-code">
                            {code ||
                              "-"}
                          </td>

                          <td>
                            <div className="d-villa-name">
                              <strong>
                                {villa.name ||
                                  "-"}
                              </strong>

                              {summary?.isMandatory && (
                                <em className="d-villa-mandatory">
                                  방역의무
                                </em>
                              )}

                              <span>
                                {villa.address ||
                                  ""}
                              </span>
                            </div>
                          </td>

                          <td className="d-center">
                            {formatDate(
                              summary?.lastDate
                            )}
                          </td>

                          <td className="d-center">
                            {summary?.method ||
                              "-"}
                          </td>

                          <td className="d-center">
                            {formatDate(
                              summary?.nextDate
                            )}
                          </td>

                          <td className="d-center">
                            <StatusBadge
                              status={
                                summary?.status
                              }
                            />
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

        {/* ===========================================
            우측 상세
        ============================================ */}

        <div className="disinfection-detail-panel">
          {!selectedVilla ? (
            <div className="disinfection-no-selection">
              관리 빌라를 선택해주세요.
            </div>
          ) : (
            <>
              <div className="disinfection-detail-head">
                <div className="disinfection-detail-info">
                  <div className="disinfection-detail-code">
                    CODE{" "}
                    {selectedVilla.code ||
                      "-"}
                  </div>

                  <div className="disinfection-detail-name-row">
                    <h3>
                      {selectedVilla.name ||
                        "-"}
                    </h3>

                    <p>
                      {selectedVilla.address ||
                        "주소 정보 없음"}
                    </p>
                  </div>
                </div>

                <div
                  className={`disinfection-current-status status-${selectedSummary.status.key}`}
                >
                  <span>
                    현재 소독관리 상태
                  </span>

                  <strong>
                    {
                      selectedSummary
                        .status.label
                    }
                  </strong>

                  <em>
                    {
                      selectedSummary
                        .status.detail
                    }
                  </em>
                </div>
              </div>

              {/* =====================================
                  선택 빌라 요약
              ====================================== */}

              <div className="disinfection-villa-summary">
                <VillaStat
                  label="최근 소독일"
                  value={formatDate(
                    selectedSummary.lastDate
                  )}
                  tone="last"
                />

                <VillaStat
                  label="최근 소독 방식"
                  value={
                    selectedSummary.method ||
                    "-"
                  }
                  tone="method"
                />

                <VillaStat
                  label="다음 예정일"
                  value={formatDate(
                    selectedSummary.nextDate
                  )}
                  tone="next"
                />

                <VillaStat
                  label="누적 소독기록"
                  value={`${
                    selectedSummary.count ||
                    0
                  }건`}
                  tone="count"
                />
              </div>

              {/* =====================================
                  소독 등록
              ====================================== */}

              <form
                className="disinfection-entry-card"
                onSubmit={
                  handleSave
                }
              >
                <div className="disinfection-entry-head">
                  <div>
                    <h4>
                      {editingId
                        ? "소독 내역 수정"
                        : "소독 내역 등록"}
                    </h4>

                    <p>
                      실제 소독 작업 정보를 기록하면
                      빌라별 최근 이력과 다음 예정일이
                      자동 반영됩니다.
                    </p>
                  </div>

                  {editingId && (
                    <button
                      type="button"
                      className="disinfection-cancel-edit"
                      onClick={
                        resetForm
                      }
                    >
                      수정 취소
                    </button>
                  )}
                </div>

                <div className="disinfection-form-grid">

                  <Field label="소독일">
                    <DateField
                      value={form.date}
                      onChange={handleDateChange}
                    />
                  </Field>

                  <Field label="소독 방식">
                    <select
                      value={
                        form.method
                      }
                      onChange={(e) =>
                        setForm(
                          (prev) => ({
                            ...prev,
                            method:
                              e
                                .target
                                .value,
                          })
                        )
                      }
                    >
                      {METHOD_OPTIONS.map(
                        (item) => (
                          <option
                            key={
                              item
                            }
                            value={
                              item
                            }
                          >
                            {
                              item
                            }
                          </option>
                        )
                      )}
                    </select>
                  </Field>

                  <Field label="주기(개월)">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={
                        form.intervalMonths
                      }
                      onChange={(e) =>
                        handleIntervalChange(
                          e.target
                            .value
                        )
                      }
                      placeholder="예: 2"
                    />
                  </Field>

                  <Field label="다음 예정일">
                    <DateField
                      value={form.nextDate}
                      onChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          nextDate: value,
                        }))
                      }
                    />
                  </Field>

                  <Field label="작업구분">
                    <select
                      value={form.workType}
                      onChange={(e) => {
                        const workType = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          workType,
                          contractType:
                            workType === "vendor"
                              ? prev.contractType
                              : "",
                          amount:
                            workType === "vendor"
                              ? prev.amount
                              : "",
                        }));
                      }}
                    >
                      {WORK_TYPE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="계약형태">
                    <select
                      value={form.contractType}
                      disabled={form.workType !== "vendor"}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          contractType: e.target.value,
                        }))
                      }
                    >
                      <option value="">선택</option>
                      {CONTRACT_OPTIONS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="업체 비용">
                    <div className="disinfection-amount-wrap">
                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={form.workType !== "vendor"}
                        value={
                          form.amount
                            ? Number(
                                String(form.amount).replace(/,/g, "")
                              ).toLocaleString("ko-KR")
                            : ""
                        }
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            amount: e.target.value.replace(/[^0-9]/g, ""),
                          }))
                        }
                        placeholder="0"
                      />
                      <span>원</span>
                    </div>
                  </Field>

                  <Field label="방역의무">
                    <label className="disinfection-mandatory-check">
                      <input
                        type="checkbox"
                        checked={form.isMandatory}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            isMandatory: e.target.checked,
                          }))
                        }
                      />
                      <span>의무 대상</span>
                    </label>
                  </Field>

                  <Field label="소독업체">
                    <input
                      type="text"
                      value={
                        form.company
                      }
                      onChange={(e) =>
                        setForm(
                          (prev) => ({
                            ...prev,
                            company:
                              e
                                .target
                                .value,
                          })
                        )
                      }
                      placeholder="업체명"
                    />
                  </Field>

                  <Field label="작업자">
                    <input
                      type="text"
                      value={
                        form.worker
                      }
                      onChange={(e) =>
                        setForm(
                          (prev) => ({
                            ...prev,
                            worker:
                              e
                                .target
                                .value,
                          })
                        )
                      }
                      placeholder="담당자 또는 작업자"
                    />
                  </Field>

                  <Field
                    label="약제·제품명"
                    wide
                  >
                    <input
                      type="text"
                      value={
                        form.chemical
                      }
                      onChange={(e) =>
                        setForm(
                          (prev) => ({
                            ...prev,
                            chemical:
                              e
                                .target
                                .value,
                          })
                        )
                      }
                      placeholder="사용 약제 또는 제품명"
                    />
                  </Field>
                </div>

                {/* ===================================
                    방역 대상 / 범위
                ==================================== */}

                <div className="disinfection-choice-section">
                  <div className="disinfection-choice-block">
                    <div className="disinfection-choice-title">
                      <strong>
                        방역 대상
                      </strong>

                      <span>
                        중복 선택 가능
                      </span>
                    </div>

                    <div className="disinfection-chip-grid target-grid">
                      {TARGET_OPTIONS.map(
                        (item) => (
                          <button
                            key={
                              item
                            }
                            type="button"
                            className={`disinfection-chip ${
                              form.targets.includes(
                                item
                              )
                                ? "is-active"
                                : ""
                            }`}
                            onClick={() =>
                              handleToggleArray(
                                "targets",
                                item
                              )
                            }
                          >
                            {
                              item
                            }
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="disinfection-choice-block">
                    <div className="disinfection-choice-title">
                      <strong>
                        작업 범위
                      </strong>

                      <span>
                        실제 소독한 작업범위를 선택
                      </span>
                    </div>

                    <div className="disinfection-chip-grid">
                      {AREA_OPTIONS.map(
                        (item) => (
                          <button
                            key={
                              item
                            }
                            type="button"
                            className={`disinfection-chip area ${
                              form.areas.includes(
                                item
                              )
                                ? "is-active"
                                : ""
                            }`}
                            onClick={() =>
                              handleToggleArray(
                                "areas",
                                item
                              )
                            }
                          >
                            {
                              item
                            }
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div className="disinfection-form-bottom">
                  <Field
                    label="비고"
                    full
                  >
                    <input
                      type="text"
                      value={
                        form.memo
                      }
                      onChange={(e) =>
                        setForm(
                          (prev) => ({
                            ...prev,
                            memo:
                              e
                                .target
                                .value,
                          })
                        )
                      }
                      placeholder="특이사항, 민원내용, 추가 조치사항 등을 입력"
                    />
                  </Field>

                  <button
                    type="submit"
                    className="disinfection-save-button"
                    disabled={
                      saving
                    }
                  >
                    {saving
                      ? "저장 중..."
                      : editingId
                      ? "수정 저장"
                      : "소독내역 등록"}
                  </button>
                </div>
              </form>

              {/* =====================================
                  소독 이력
              ====================================== */}

              <div className="disinfection-history-card">
                <div className="disinfection-history-head">
                  <div>
                    <h4>
                      소독 이력
                    </h4>

                    <p>
                      선택한 빌라의 전체 소독 작업
                      기록입니다.
                    </p>
                  </div>

                  <select
                    value={
                      historyYear
                    }
                    onChange={(e) =>
                      setHistoryYear(
                        e.target
                          .value
                      )
                    }
                  >
                    <option value="all">
                      전체 연도
                    </option>

                    {yearOptions.map(
                      (year) => (
                        <option
                          key={
                            year
                          }
                          value={
                            year
                          }
                        >
                          {
                            year
                          }
                          년
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div className="disinfection-history-table-wrap">
                  <table className="disinfection-history-table">
                    <thead>
                      <tr>
                        <th>
                          소독일
                        </th>

                        <th>
                          방식
                        </th>

                        <th>
                          방역대상
                        </th>

                        <th>
                          작업범위
                        </th>

                        <th>
                          의무대상
                        </th>

                        <th>
                          업체 / 작업자
                        </th>

                        <th>
                          계약 / 비용
                        </th>

                        <th>
                          약제·제품
                        </th>

                        <th>
                          다음 예정일
                        </th>

                        <th>
                          비고
                        </th>

                        <th>
                          관리
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedRecords.length ===
                      0 ? (
                        <tr>
                          <td
                            colSpan="11"
                            className="disinfection-empty"
                          >
                            등록된 소독 이력이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        selectedRecords.map(
                          (record) => (
                            <tr
                              key={
                                record.id
                              }
                            >
                              <td className="d-history-date">
                                {formatDate(
                                  record.date
                                )}
                              </td>

                              <td>
                                <span className="d-method-badge">
                                  {record.method ||
                                    "-"}
                                </span>
                              </td>

                              <td className="d-multiline">
                                {(record.targets ||
                                  []).join(
                                  ", "
                                ) ||
                                  "-"}
                              </td>

                              <td className="d-multiline">
                                {(record.areas ||
                                  []).join(
                                  ", "
                                ) ||
                                  "-"}
                              </td>

                              <td className="d-center">
                                <span
                                  className={`d-mandatory-badge ${
                                    record.isMandatory ? "is-on" : ""
                                  }`}
                                >
                                  {record.isMandatory ? "의무" : "일반"}
                                </span>
                              </td>

                              <td className="d-company">
                                <strong>
                                  {record.company ||
                                    "-"}
                                </strong>

                                <span>
                                  {record.worker ||
                                    ""}
                                </span>
                              </td>

                              <td className="d-contract">
                                <strong>
                                  {record.workType === "vendor"
                                    ? record.contractType || "업체소독"
                                    : "자체소독"}
                                </strong>

                                <span>
                                  {record.workType === "vendor" &&
                                  toNumber(record.amount) > 0
                                    ? formatMoney(record.amount)
                                    : "-"}
                                </span>
                              </td>

                              <td>
                                {record.chemical ||
                                  "-"}
                              </td>

                              <td>
                                <div className="d-next-date">
                                  <strong>
                                    {formatDate(
                                      record.nextDate
                                    )}
                                  </strong>

                                  <StatusBadge
                                    status={getScheduleStatus(
                                      record.nextDate
                                    )}
                                    small
                                  />
                                </div>
                              </td>

                              <td className="d-history-memo">
                                {record.memo ||
                                  "-"}
                              </td>

                              <td className="d-history-action">
                                <button
                                  type="button"
                                  className="edit"
                                  onClick={() =>
                                    handleEdit(
                                      record
                                    )
                                  }
                                >
                                  수정
                                </button>

                                <button
                                  type="button"
                                  className="delete"
                                  onClick={() =>
                                    handleDelete(
                                      record
                                    )
                                  }
                                >
                                  삭제
                                </button>
                              </td>
                            </tr>
                          )
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
    </div>
  );
}

/* =========================================================
   커스텀 날짜 선택 필드
========================================================= */

function DateField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    return Number.isNaN(base.getTime()) ? new Date() : base;
  });

  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleOutside = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      const base = value ? new Date(`${value}T00:00:00`) : new Date();
      setViewDate(Number.isNaN(base.getTime()) ? new Date() : base);
    }
  }, [open, value]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  const todayStr = todayString();

  const formatDisplay = (dateStr) => {
    if (!dateStr) return "날짜 선택";
    const [y, m, d] = dateStr.split("-");
    if (!y || !m || !d) return dateStr;
    return `${y}년 ${Number(m)}월 ${Number(d)}일`;
  };

  const handlePick = (day) => {
    if (!day) return;
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    onChange(`${year}-${mm}-${dd}`);
    setOpen(false);
  };

  const changeMonth = (delta) => {
    setViewDate(new Date(year, month + delta, 1));
  };

  return (
    <div className="dmp-date-field" ref={wrapRef}>
      <button
        type="button"
        className="dmp-date-trigger"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={value ? "" : "dmp-date-placeholder"}>
          {formatDisplay(value)}
        </span>
        <span className="dmp-date-trigger-icon">
          <CalendarGlyph />
        </span>
      </button>

      {open && (
        <div className="dmp-date-popover">
          <div className="dmp-date-popover-head">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="이전 달">
              ‹
            </button>
            <strong>{year}년 {month + 1}월</strong>
            <button type="button" onClick={() => changeMonth(1)} aria-label="다음 달">
              ›
            </button>
          </div>

          <div className="dmp-date-weekrow">
            {WEEK_LABELS.map((w) => <span key={w}>{w}</span>)}
          </div>

          <div className="dmp-date-grid">
            {cells.map((day, idx) => {
              if (!day) return <span key={`empty-${idx}`} className="is-empty" />;

              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === value;

              return (
                <button
                  type="button"
                  key={dateStr}
                  className={`dmp-date-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
                  onClick={() => handlePick(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="dmp-date-popover-foot">
            <button
              type="button"
              className="dmp-date-today-btn"
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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5H20.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3V6.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 3V6.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* =========================================================
   상단 통계카드
========================================================= */

function SummaryCard({
  label,
  value,
  unit,
  sub,
  tone,
}) {
  return (
    <div
      className={`disinfection-summary-card tone-${tone}`}
    >
      <div className="disinfection-summary-card__label">
        {label}
      </div>

      <div className="disinfection-summary-card__value">
        {Number(
          value || 0
        ).toLocaleString(
          "ko-KR"
        )}

        <span>
          {unit}
        </span>
      </div>

      <div className="disinfection-summary-card__sub">
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
  tone,
}) {
  return (
    <div
      className={`disinfection-villa-stat tone-${tone}`}
    >
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

/* =========================================================
   상태 배지
========================================================= */

function StatusBadge({
  status,
  small = false,
}) {
  const safeStatus =
    status || {
      key: "unset",
      label:
        "예정일 미등록",
      detail: "",
    };

  return (
    <span
      className={`disinfection-status-badge status-${safeStatus.key} ${
        small
          ? "is-small"
          : ""
      }`}
      title={
        safeStatus.detail
      }
    >
      {
        safeStatus.label
      }
    </span>
  );
}

/* =========================================================
   입력 필드
========================================================= */

function Field({
  label,
  children,
  wide = false,
  full = false,
}) {
  return (
    <div
      className={`disinfection-field ${
        wide
          ? "is-wide"
          : ""
      } ${
        full
          ? "is-full"
          : ""
      }`}
    >
      <label>
        {label}
      </label>

      {children}
    </div>
  );
}