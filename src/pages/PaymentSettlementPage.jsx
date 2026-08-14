// src/pages/PaymentSettlementPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
} from "firebase/firestore";

import PageTitle from "../components/PageTitle";
import "./PaymentSettlementPage.css";

/* ✅ 부과시작월 선택용 - 스타일 적용된 달력 */
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";

/* ===== 유틸 ===== */
const s = (v) => String(v ?? "").trim();
const parseNumber = (v) =>
  parseInt(String(v ?? "").replace(/[^0-9\-]/g, ""), 10) || 0;
const fmtComma = (n) => {
  const num = parseNumber(n);
  return num === 0 ? "" : num.toLocaleString();
};
const fmtWon = (n) => `${parseNumber(n).toLocaleString()}원`;

const pad2 = (n) => String(n).padStart(2, "0");
const nowYm = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
const shiftYm = (ym, delta) => {
  const [y, m] = s(ym).split("-").map((x) => parseInt(x, 10));
  const d = new Date(y || new Date().getFullYear(), (m || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
const ymLabel = (ym) => {
  const [y, m] = s(ym).split("-").map((x) => parseInt(x, 10));
  if (!y || !m) return ym;
  return `${y}년 ${m}월`;
};

/* ✅ 페이지에 처음 들어왔을 때 어떤 탭(말일/10일)을 먼저 보여줄지 결정.
   - 오늘이 1일~10일: 이번 달 "10일"이 가장 가까운 납부일이므로 10일 탭 먼저
   - 오늘이 11일~말일: 다음으로 다가오는 건 이번 달 "말일"이므로 말일 탭 먼저 */
const getDefaultPayType = () => {
  const day = new Date().getDate();
  return day <= 10 ? "10일" : "말일";
};

/* ✅ 구분별 ERP 자동수집 매핑
   여기 등록된 "구분"으로 건물별 계약 관리를 켜면, villas 컬렉션에서
   matchField 값이 업체명과 일치하는 건물을 자동으로 가져옵니다.
   ✅ [추가] 전기안전(ElectricSafetyPage)과 소방안전(FireSafetyPage)도
   승강기와 동일한 방식으로 연결했습니다.
   - 전기안전: villas 문서의 electricSafety(업체명) / electricSafetyAmount(금액)
   - 소방안전: villas 문서의 fireSafety(업체명) / fireSafetyAmount(금액)
   두 페이지 모두 이 필드들을 그대로 사용하고 있어서 별도 데이터 이전 없이
   바로 연결됩니다. */
const AUTO_SOURCE_CONFIG = {
  승강기: { matchField: "elevator", amountField: "elevatorAmount" },
  전기안전: { matchField: "electricSafety", amountField: "electricSafetyAmount" },
  소방안전: { matchField: "fireSafety", amountField: "fireSafetyAmount" },
};

/* ✅ 새로 계약을 추가/자동수집할 때 기본으로 잡아줄 부과시작월.
   과거(2025년 이전) 내역까지 전부 맞추려면 너무 힘드니, 지금 시점 기준으로
   "2026년 1월부터"만 확인하기로 한 기준입니다. 개별 건물은 등록/수정 창에서
   달력으로 원하는 시작월을 얼마든지 다시 지정할 수 있습니다. */
const DEFAULT_START_YM = "2026-01";

/* 연-월 문자열(YYYY-MM) ↔ Date 변환 (부과시작월 달력용) */
const ymToDate = (ym) => {
  const v = s(ym);
  if (!/^\d{4}-\d{2}$/.test(v)) return null;
  const [y, m] = v.split("-").map((x) => parseInt(x, 10));
  const d = new Date(y, m - 1, 1);
  return isNaN(d.getTime()) ? null : d;
};
const dateToYm = (d) => {
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

/* ✅ 건물별로 "가장 오래된 미체크월"을 찾습니다.
   대금결제관리 표에서 "납부완료"로 바꾸면, 건물마다 이번 달을 무조건
   체크하는 게 아니라 이 함수로 찾은 "가장 먼저 밀린 달" 딱 한 달만
   체크합니다. (밀린 달이 없으면 이번 달이 반환됨)
   최대 60개월까지만 확인합니다(무한루프 방지). */
const findOldestUnpaidYm = (building, uptoYm) => {
  const startYm = s(building.startYearMonth) || DEFAULT_START_YM;
  if (startYm > uptoYm) return null;
  let ym = startYm;
  let guard = 0;
  while (ym <= uptoYm && guard < 60) {
    if (!(building.paidMonths && building.paidMonths[ym])) return ym;
    ym = shiftYm(ym, 1);
    guard += 1;
  }
  return null;
};

/* ✅ 건물별 "1월~12월 체크그리드" 계산 유틸
   건물 문서(paymentPayees/{id}/buildings/{buildingId})에 저장된
   paidMonths(예: {"2026-01":true}) 값을 기준으로, 조회 중인 연도의
   1~12월 체크 상태와, 기준월(yearMonth) "이전 달까지"의 미납 개월 수를
   계산합니다.
   - applicable: 계약 시작월(startYearMonth) 이후인지
   - checked: 그 달이 체크(납부완료)되어 있는지
   - isOverdue: 계약 대상이고, 기준월보다 "이전" 달인데 아직 체크 안 된 달
     (=진짜 밀린 미납. 기준월 당월은 "납부예정"으로 별도 취급하며 여기
     포함하지 않음 → 이중 집계 방지)
   - nextPayableYm / isNextPayable: 지금 "납부완료"를 누르면 실제로 체크될
     달이 몇 월인지 미리 보여줍니다. 건물마다 밀린 개월 수가 제각각이라
     헷갈리기 쉬운데, 이 표시로 "이번엔 이 건물의 몇 월분이 처리되는지"를
     결제 전에 바로 확인할 수 있습니다. */
const buildBuildingMonthGrid = (building, yearMonth) => {
  const year = s(yearMonth).slice(0, 4);
  const startYm = s(building.startYearMonth) || DEFAULT_START_YM;
  const paidMonths = building.paidMonths || {};
  const months = [];
  let overdueCount = 0;
  let currentApplicable = false;
  let currentChecked = false;
  const nextPayableYm = findOldestUnpaidYm(building, yearMonth);

  for (let m = 1; m <= 12; m += 1) {
    const ym = `${year}-${pad2(m)}`;
    const applicable = ym >= startYm;
    const checked = !!paidMonths[ym];
    const isOverdue = applicable && ym < yearMonth && !checked;
    if (isOverdue) overdueCount += 1;
    if (ym === yearMonth) {
      currentApplicable = applicable;
      currentChecked = checked;
    }
    months.push({
      m,
      ym,
      applicable,
      checked,
      isOverdue,
      isCurrent: ym === yearMonth,
      isNextPayable: ym === nextPayableYm,
    });
  }

  return { months, overdueCount, currentApplicable, currentChecked, nextPayableYm };
};

const DEFAULT_CATEGORIES = {
  "10일": ["건물청소", "기타"],
  말일: [
    "승강기",
    "전기안전",
    "소방안전",
    "사무실월세",
    "사무실수도",
    "전산",
    "청소비",
    "대표자활동비",
    "건물주",
    "기타",
  ],
};

/* ===== 부과시작월 선택용 - 스타일 있는 달력 트리거 버튼 ===== */
const MonthPickerInput = React.forwardRef(({ value, onClick }, ref) => (
  <button
    type="button"
    ref={ref}
    onClick={onClick}
    className={`pmt-month-picker-btn ${value ? "has-value" : ""}`}
  >
    <span className="pmt-month-picker-icon">📅</span>
    <span>{value || "부과시작월"}</span>
  </button>
));

/* ===== 간단 모달 =====
   ✅ headerActions: 저장/닫기 등 액션 버튼을 제목 옆(최상단 우측)에 배치할 수 있도록 함.
      내용이 길어 스크롤이 필요한 모달에서도 항상 버튼에 바로 접근 가능하게 하기 위함. */
function SimpleModal({
  open,
  title,
  children,
  onClose,
  size = "lg",
  headerActions = null,
  hideCloseButton = false,
}) {
  if (!open) return null;
  const panelClass =
    size === "sm"
      ? "pmt-modal-panel pmt-modal-panel--sm"
      : size === "xl"
      ? "pmt-modal-panel pmt-modal-panel--xl"
      : size === "wide"
      ? "pmt-modal-panel pmt-modal-panel--wide"
      : "pmt-modal-panel";
  return (
    <div className="pmt-modal-overlay">
      <div className="pmt-modal-backdrop" onClick={onClose} />
      <div className={panelClass}>
        <div className="pmt-modal-header">
          <h3 className="pmt-modal-title">{title}</h3>
          <div className="pmt-modal-header-right">
            {headerActions}
            {/* ✅ hideCloseButton=true 인 모달(건물별 지급현황)은 X 아이콘 대신
                저장/닫기 버튼만으로 닫도록 함 */}
            {!hideCloseButton && (
              <button type="button" className="pmt-modal-close" onClick={onClose}>
                ✕
              </button>
            )}
          </div>
        </div>
        <div className="pmt-modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ===== 카테고리(구분) 관리 모달 ===== */
function CategoryManagerModal({ open, onClose, payType }) {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      const ref = doc(db, "serviceSettings", `결제구분_${payType}`);
      const snap = await getDoc(ref);
      const arr = Array.isArray(snap.data()?.items)
        ? snap.data().items.filter((x) => s(x) !== "")
        : [];
      setItems(arr);
    })();
  }, [open, payType]);

  const save = async (nextItems) => {
    setItems(nextItems);
    await setDoc(
      doc(db, "serviceSettings", `결제구분_${payType}`),
      { items: nextItems },
      { merge: true }
    );
  };

  const handleAdd = () => {
    const v = s(newItem);
    if (!v || items.includes(v)) return;
    save([...items, v]);
    setNewItem("");
  };

  const handleRemove = (v) => {
    if (!window.confirm(`"${v}" 구분을 삭제할까요?`)) return;
    save(items.filter((x) => x !== v));
  };

  return (
    <SimpleModal
      open={open}
      title={`구분 관리 (${payType})`}
      onClose={onClose}
      size="sm"
      hideCloseButton
      headerActions={
        <button type="button" className="pmt-btn pmt-btn-ghost pmt-btn-sm" onClick={onClose}>
          닫기
        </button>
      }
    >
      <div className="pmt-cat-list">
        {items.length === 0 && (
          <div className="pmt-cat-empty">등록된 구분이 없습니다.</div>
        )}
        {items.map((it) => (
          <div key={it} className="pmt-cat-row">
            <span>{it}</span>
            <button
              type="button"
              className="pmt-cat-del"
              onClick={() => handleRemove(it)}
            >
              🗑️ 삭제
            </button>
          </div>
        ))}
      </div>
      <div className="pmt-cat-add">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="새 구분 입력"
          className="pmt-input"
        />
        <button type="button" className="pmt-btn pmt-btn-primary" onClick={handleAdd}>
          ➕ 추가
        </button>
      </div>
    </SimpleModal>
  );
}

/* ===== 지급 대상(거래처/담당자) 등록·수정 폼 ===== */
function PayeeFormModal({ open, onClose, onSaved, payType, categories, initial }) {
  const isEdit = !!initial?.id;

  const [form, setForm] = useState(() => ({
    tableGroup: initial?.tableGroup || (payType === "10일" ? "청소비" : ""),
    category: initial?.category || "",
    name: initial?.name || "",
    bank: initial?.bank || "",
    account: initial?.account || "",
    note: initial?.note || "",
    active: initial?.active !== false,
    defaultCleaningFee: fmtComma(initial?.defaultCleaningFee) || "",
    defaultEnvelopeFee: fmtComma(initial?.defaultEnvelopeFee) || "",
    defaultSalary: fmtComma(initial?.defaultSalary) || "",
    defaultAllowance: fmtComma(initial?.defaultAllowance) || "",
    defaultAmount: fmtComma(initial?.defaultAmount) || "",
    hasBuildings: !!initial?.hasBuildings,
  }));

  const [buildings, setBuildings] = useState([]);
  /* ✅ 수정 화면을 처음 열었을 때 이미 Firestore에 저장돼 있던 건물 문서 id 목록.
     저장 시 이 목록에 있는 건물은 "수정"(paidMonths 이력 보존), 없는 건물은
     "신규 추가"로 구분하기 위해 사용합니다. */
  const [existingBuildingIds, setExistingBuildingIds] = useState(new Set());

  useEffect(() => {
    if (!open) return;

    // 새로 등록하는 경우: 건물 목록은 빈 배열에서 시작
    if (!initial?.id) {
      setBuildings([]);
      setExistingBuildingIds(new Set());
      return;
    }

    // 수정하는 경우, 말일 + 건물계약 대상이면 기존 건물 목록을 불러옴
    if (payType !== "말일") {
      setBuildings([]);
      setExistingBuildingIds(new Set());
      return;
    }

    (async () => {
      const snap = await getDocs(
        collection(db, "paymentPayees", initial.id, "buildings")
      );
      setBuildings(
        snap.docs.map((d) => ({
          id: d.id,
          buildingName: d.data().buildingName || "",
          address: d.data().address || "",
          monthlyAmount: fmtComma(d.data().monthlyAmount) || "",
          startYearMonth: d.data().startYearMonth || "",
          villaId: d.data().villaId || null,
        }))
      );
      setExistingBuildingIds(new Set(snap.docs.map((d) => d.id)));
    })();
  }, [open, initial?.id, payType]);

  /* ✅ ERP(villas)에서 이 업체 이름과 일치하는 건물을 자동으로 가져와 병합합니다.
     이미 목록에 있는 건물(villaId로 매칭)은 금액만 최신화하고,
     직접 추가한 건물(villaId 없음)은 그대로 유지합니다. */
  const fetchBuildingsFromErp = async ({ silent = false } = {}) => {
    const cfg = AUTO_SOURCE_CONFIG[form.category];
    if (!cfg) {
      if (!silent) {
        alert(`"${form.category || "선택 안 됨"}" 구분은 아직 ERP 자동수집이 연결되어 있지 않습니다.`);
      }
      return;
    }
    if (!s(form.name)) {
      if (!silent) alert("먼저 업체명을 입력해 주세요. (ERP에 저장된 업체명과 정확히 일치해야 자동으로 수집됩니다)");
      return;
    }
    try {
      const qy = query(
        collection(db, "villas"),
        where(cfg.matchField, "==", s(form.name))
      );
      const snap = await getDocs(qy);
      if (snap.empty) {
        if (!silent)
          alert(`"${form.name}" 업체로 등록된 건물을 ERP에서 찾지 못했습니다.`);
        return;
      }
      setBuildings((prev) => {
        const byVillaId = new Map(prev.filter((b) => b.villaId).map((b) => [b.villaId, b]));
        const manualRows = prev.filter((b) => !b.villaId);
        // ✅ 금액이 없거나 0원인 항목은 가져오지 않습니다.
        const merged = snap.docs
          .filter((d) => parseNumber(d.data()[cfg.amountField]) > 0)
          .map((d) => {
            const v = d.data();
            const old = byVillaId.get(d.id);
            return {
              id: old?.id || `villa_${d.id}`,
              villaId: d.id,
              buildingName: s(v.name) || s(v.code) || "이름없음",
              address: s(v.address) || s(v.addr) || s(v.roadAddress) || "",
              monthlyAmount: fmtComma(v[cfg.amountField]) || "",
              startYearMonth: old?.startYearMonth || DEFAULT_START_YM,
            };
          });
        return [...merged, ...manualRows];
      });
    } catch (e) {
      console.error(e);
      if (!silent) alert("ERP 건물 정보를 불러오는 중 오류가 발생했습니다.");
    }
  };

  /* ✅ 건물별 계약 관리를 켜거나, 구분/업체명이 바뀌면 자동으로 ERP와 동기화 */
  useEffect(() => {
    if (!open) return;
    if (payType !== "말일") return;
    if (!form.hasBuildings) return;
    if (!AUTO_SOURCE_CONFIG[form.category]) return;
    if (!s(form.name)) return;
    fetchBuildingsFromErp({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payType, form.hasBuildings, form.category, form.name]);

  const handleChange = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const handleAmount = (key, val) => handleChange(key, fmtComma(parseNumber(val)));

  const updateBuildingRow = (id, key, val) => {
    setBuildings((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, [key]: key === "monthlyAmount" ? fmtComma(parseNumber(val)) : val }
          : b
      )
    );
  };
  const removeBuildingRow = (id) => {
    setBuildings((prev) => prev.filter((b) => b.id !== id));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!s(form.name)) {
      alert("이름/업체명을 입력해 주세요.");
      return;
    }

    const payload = {
      payType,
      category: s(form.category),
      name: s(form.name),
      bank: s(form.bank),
      account: s(form.account),
      note: s(form.note),
      active: !!form.active,
      updatedAt: serverTimestamp(),
    };

    if (payType === "10일") {
      payload.tableGroup = form.tableGroup;
      if (form.tableGroup === "청소비") {
        payload.defaultCleaningFee = parseNumber(form.defaultCleaningFee);
        payload.defaultEnvelopeFee = parseNumber(form.defaultEnvelopeFee);
      } else {
        payload.defaultSalary = parseNumber(form.defaultSalary);
        payload.defaultAllowance = parseNumber(form.defaultAllowance);
      }
    } else {
      payload.hasBuildings = !!form.hasBuildings;
      if (!form.hasBuildings) {
        payload.defaultAmount = parseNumber(form.defaultAmount);
      }
    }

    try {
      let payeeId = initial?.id;
      if (isEdit) {
        await updateDoc(doc(db, "paymentPayees", payeeId), payload);
      } else {
        const added = await addDoc(collection(db, "paymentPayees"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        payeeId = added.id;
      }

      if (payType === "말일" && form.hasBuildings) {
        const currentIds = new Set(
          buildings.filter((b) => s(b.buildingName)).map((b) => b.id)
        );

        /* ✅ 목록에서 빠진(사용자가 삭제한) 기존 건물만 실제로 삭제합니다.
           (그 건물의 paidMonths 체크 이력도 함께 사라집니다) */
        const toDelete = [...existingBuildingIds].filter(
          (id) => !currentIds.has(id)
        );
        await Promise.all(
          toDelete.map((id) =>
            deleteDoc(doc(db, "paymentPayees", payeeId, "buildings", id))
          )
        );

        /* ✅ 기존 건물은 "수정"만 하여 paidMonths(1~12월 체크 이력)를 그대로
           보존하고, 새로 추가한 건물만 새 문서로 생성합니다.
           (예전처럼 전체 삭제 후 재생성하면 체크 이력이 매번 사라집니다) */
        await Promise.all(
          buildings
            .filter((b) => s(b.buildingName))
            .map((b) => {
              const buildingPayload = {
                buildingName: s(b.buildingName),
                address: s(b.address),
                monthlyAmount: parseNumber(b.monthlyAmount),
                startYearMonth: s(b.startYearMonth),
                villaId: b.villaId || null,
                active: true,
              };
              if (existingBuildingIds.has(b.id)) {
                return updateDoc(
                  doc(db, "paymentPayees", payeeId, "buildings", b.id),
                  buildingPayload
                );
              }
              return addDoc(
                collection(db, "paymentPayees", payeeId, "buildings"),
                { ...buildingPayload, paidMonths: {} }
              );
            })
        );
      }

      onSaved?.();
      alert("저장되었습니다.");
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  const formHeaderActions = (
    <>
      <button
        type="button"
        className="pmt-btn pmt-btn-primary pmt-btn-sm"
        onClick={() => handleSubmit()}
      >
        💾 저장
      </button>
      <button
        type="button"
        className="pmt-btn pmt-btn-ghost pmt-btn-sm"
        onClick={onClose}
      >
        닫기
      </button>
    </>
  );

  return (
    <SimpleModal
      open={open}
      title={isEdit ? "지급 대상 수정" : "지급 대상 등록"}
      onClose={onClose}
      size="xl"
      headerActions={formHeaderActions}
      hideCloseButton
    >
      <form onSubmit={handleSubmit} className="pmt-form">
        {payType === "10일" && (
          <div className="pmt-form-row">
            <div className="pmt-form-field">
              <label className="pmt-form-label">그룹</label>
              <select
                value={form.tableGroup}
                onChange={(e) => handleChange("tableGroup", e.target.value)}
                className="pmt-input pmt-input-select"
              >
                <option value="청소비">청소비 (표A)</option>
                <option value="월급">월급 (표B)</option>
              </select>
            </div>
            <div className="pmt-form-field">
              <label className="pmt-form-label">구분</label>
              <select
                value={form.category}
                onChange={(e) => handleChange("category", e.target.value)}
                className="pmt-input pmt-input-select"
              >
                <option value="">선택</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {payType === "말일" && (
          <div className="pmt-form-row">
            <div className="pmt-form-field">
              <label className="pmt-form-label">구분</label>
              <select
                value={form.category}
                onChange={(e) => handleChange("category", e.target.value)}
                className="pmt-input pmt-input-select"
              >
                <option value="">선택</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="pmt-form-field pmt-form-field-checkbox">
              <label className="pmt-form-label">건물별 계약 관리</label>
              <label className="pmt-switch-wrap">
                <span className="pmt-switch">
                  <input
                    type="checkbox"
                    checked={form.hasBuildings}
                    onChange={(e) => handleChange("hasBuildings", e.target.checked)}
                  />
                  <span className="pmt-switch-track">
                    <span className="pmt-switch-thumb" />
                  </span>
                </span>
                <span className="pmt-switch-text">
                  승강기/전기/소방처럼 건물마다 금액이 다르면 켜주세요
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="pmt-form-row">
          <div className="pmt-form-field">
            <label className="pmt-form-label">
              {payType === "10일" ? "이름" : "업체명"}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="pmt-input"
            />
          </div>
        </div>

        <div className="pmt-form-row">
          <div className="pmt-form-field">
            <label className="pmt-form-label">은행</label>
            <input
              type="text"
              value={form.bank}
              onChange={(e) => handleChange("bank", e.target.value)}
              className="pmt-input"
            />
          </div>
          <div className="pmt-form-field">
            <label className="pmt-form-label">계좌</label>
            <input
              type="text"
              value={form.account}
              onChange={(e) => handleChange("account", e.target.value)}
              className="pmt-input"
            />
          </div>
        </div>

        {payType === "10일" && form.tableGroup === "청소비" && (
          <div className="pmt-form-row">
            <div className="pmt-form-field">
              <label className="pmt-form-label">기본 청소비</label>
              <input
                type="text"
                value={form.defaultCleaningFee}
                onChange={(e) => handleAmount("defaultCleaningFee", e.target.value)}
                className="pmt-input pmt-input-number"
                placeholder="0"
              />
            </div>
            <div className="pmt-form-field">
              <label className="pmt-form-label">기본 봉투/스티커</label>
              <input
                type="text"
                value={form.defaultEnvelopeFee}
                onChange={(e) => handleAmount("defaultEnvelopeFee", e.target.value)}
                className="pmt-input pmt-input-number"
                placeholder="0"
              />
            </div>
          </div>
        )}

        {payType === "10일" && form.tableGroup === "월급" && (
          <div className="pmt-form-row">
            <div className="pmt-form-field">
              <label className="pmt-form-label">기본 월급</label>
              <input
                type="text"
                value={form.defaultSalary}
                onChange={(e) => handleAmount("defaultSalary", e.target.value)}
                className="pmt-input pmt-input-number"
                placeholder="0"
              />
            </div>
            <div className="pmt-form-field">
              <label className="pmt-form-label">기본 수당</label>
              <input
                type="text"
                value={form.defaultAllowance}
                onChange={(e) => handleAmount("defaultAllowance", e.target.value)}
                className="pmt-input pmt-input-number"
                placeholder="0"
              />
            </div>
          </div>
        )}

        {payType === "말일" && !form.hasBuildings && (
          <div className="pmt-form-row">
            <div className="pmt-form-field">
              <label className="pmt-form-label">기본 금액</label>
              <input
                type="text"
                value={form.defaultAmount}
                onChange={(e) => handleAmount("defaultAmount", e.target.value)}
                className="pmt-input pmt-input-number"
                placeholder="0"
              />
            </div>
          </div>
        )}

        {payType === "말일" && form.hasBuildings && (
          <div className="pmt-buildings-editor">
            <div className="pmt-buildings-header">
              <label className="pmt-form-label">건물별 월 계약금액</label>
              <div className="pmt-buildings-header-actions">
                {AUTO_SOURCE_CONFIG[form.category] && (
                  <button
                    type="button"
                    className="pmt-btn pmt-btn-secondary pmt-btn-sm"
                    onClick={() => fetchBuildingsFromErp({ silent: false })}
                  >
                    ⟳ ERP에서 가져오기
                  </button>
                )}
              </div>
            </div>

            {AUTO_SOURCE_CONFIG[form.category] && (
              <div className="pmt-buildings-hint">
                "{form.category}" 구분은 ERP에 등록된 건물 정보를 자동으로
                불러옵니다. 건물명·금액은 ERP 값을 그대로 따라가고,
                <strong> 부과시작월만 직접 선택</strong>하면 됩니다.
              </div>
            )}

            {buildings.length === 0 && (
              <div className="pmt-cat-empty">등록된 건물이 없습니다.</div>
            )}
            {buildings.map((b) => (
              <div key={b.id} className="pmt-building-row">
                <div className="pmt-building-name-cell">
                  <input
                    type="text"
                    placeholder="건물명"
                    value={b.buildingName}
                    disabled={!!b.villaId}
                    onChange={(e) =>
                      updateBuildingRow(b.id, "buildingName", e.target.value)
                    }
                    className={`pmt-input ${b.villaId ? "pmt-input-readonly" : ""}`}
                  />
                  {b.villaId && <span className="pmt-erp-chip">ERP연동</span>}
                  {b.address && <span className="pmt-building-address">{b.address}</span>}
                </div>
                <input
                  type="text"
                  placeholder="월 금액"
                  value={b.monthlyAmount}
                  disabled={!!b.villaId}
                  onChange={(e) =>
                    updateBuildingRow(b.id, "monthlyAmount", e.target.value)
                  }
                  className={`pmt-input pmt-input-number ${
                    b.villaId ? "pmt-input-readonly" : ""
                  }`}
                />
                <DatePicker
                  locale={ko}
                  dateFormat="yyyy-MM"
                  showMonthYearPicker
                  withPortal
                  selected={ymToDate(b.startYearMonth)}
                  onChange={(d) =>
                    updateBuildingRow(b.id, "startYearMonth", dateToYm(d))
                  }
                  customInput={<MonthPickerInput />}
                />
                <button
                  type="button"
                  className="pmt-building-del"
                  onClick={() => removeBuildingRow(b.id)}
                >
                  🗑️ 삭제
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="pmt-form-row">
          <div className="pmt-form-field">
            <label className="pmt-form-label">비고</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => handleChange("note", e.target.value)}
              className="pmt-input"
            />
          </div>
          <div className="pmt-form-field pmt-form-field-checkbox">
            <label className="pmt-form-label">사용 여부</label>
            <label className="pmt-switch-wrap">
              <span className="pmt-switch">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => handleChange("active", e.target.checked)}
                />
                <span className="pmt-switch-track">
                  <span className="pmt-switch-thumb" />
                </span>
              </span>
              <span className="pmt-switch-text">
                {form.active ? "사용" : "중지"}
              </span>
            </label>
          </div>
        </div>

      </form>
    </SimpleModal>
  );
}

/* ===== 지급 대상 관리(목록) 모달 ===== */
function PayeeManagerModal({ open, onClose, payType, categories, payees }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingPayee, setEditingPayee] = useState(null);

  const handleAdd = () => {
    setEditingPayee(null);
    setFormOpen(true);
  };
  const handleEdit = (p) => {
    setEditingPayee(p);
    setFormOpen(true);
  };
  const handleDelete = async (p) => {
    if (
      !window.confirm(
        `"${p.name}" 지급 대상을 완전히 삭제할까요?\n(이미 생성된 이전 달 지급 기록은 남아있습니다)`
      )
    )
      return;
    try {
      if (payType === "말일" && p.hasBuildings) {
        const snap = await getDocs(collection(db, "paymentPayees", p.id, "buildings"));
        await Promise.all(
          snap.docs.map((d) =>
            deleteDoc(doc(db, "paymentPayees", p.id, "buildings", d.id))
          )
        );
      }
      await deleteDoc(doc(db, "paymentPayees", p.id));
    } catch (err) {
      console.error(err);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const grouped = useMemo(() => {
    if (payType !== "10일") return { 전체: payees };
    return {
      청소비: payees.filter((p) => p.tableGroup !== "월급"),
      월급: payees.filter((p) => p.tableGroup === "월급"),
    };
  }, [payees, payType]);

  return (
    <>
      <SimpleModal
        open={open}
        title={`지급 대상 관리 (${payType})`}
        onClose={onClose}
        size="xl"
        hideCloseButton
        headerActions={
          <button type="button" className="pmt-btn pmt-btn-ghost pmt-btn-sm" onClick={onClose}>
            닫기
          </button>
        }
      >
        <div className="pmt-payee-toolbar">
          <button type="button" className="pmt-btn pmt-btn-primary" onClick={handleAdd}>
            ➕ 새 지급 대상 등록
          </button>
        </div>

        {Object.entries(grouped).map(([groupName, list]) => (
          <div key={groupName} className="pmt-payee-group">
            {payType === "10일" && (
              <div className="pmt-payee-group-title">{groupName}</div>
            )}
            <table className="pmt-payee-table">
              <thead>
                <tr>
                  <th>구분</th>
                  <th>이름/업체</th>
                  <th>은행</th>
                  <th>계좌</th>
                  <th>기본금액</th>
                  <th>사용</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={7} className="pmt-payee-empty">
                      등록된 대상이 없습니다.
                    </td>
                  </tr>
                )}
                {list.map((p) => {
                  let amountLabel = "-";
                  if (payType === "10일") {
                    amountLabel =
                      p.tableGroup === "월급"
                        ? `${fmtComma(p.defaultSalary)}${
                            p.defaultAllowance ? " + " + fmtComma(p.defaultAllowance) : ""
                          }`
                        : `${fmtComma(p.defaultCleaningFee)}${
                            p.defaultEnvelopeFee ? " + " + fmtComma(p.defaultEnvelopeFee) : ""
                          }`;
                  } else {
                    amountLabel = p.hasBuildings
                      ? "건물별 계약"
                      : fmtComma(p.defaultAmount);
                  }
                  return (
                    <tr key={p.id}>
                      <td>{p.category || "-"}</td>
                      <td className="pmt-payee-name">{p.name}</td>
                      <td>{p.bank || "-"}</td>
                      <td>{p.account || "-"}</td>
                      <td>{amountLabel}</td>
                      <td>
                        <span
                          className={`pmt-active-badge ${
                            p.active !== false ? "is-on" : "is-off"
                          }`}
                        >
                          {p.active !== false ? "사용" : "중지"}
                        </span>
                      </td>
                      <td className="pmt-payee-actions">
                        <button
                          type="button"
                          className="pmt-btn pmt-btn-ghost pmt-btn-sm"
                          onClick={() => handleEdit(p)}
                        >
                          ✏️ 수정
                        </button>
                        <button
                          type="button"
                          className="pmt-btn pmt-btn-danger pmt-btn-sm"
                          onClick={() => handleDelete(p)}
                        >
                          🗑️ 삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </SimpleModal>

      {/* key로 강제 재마운트: 다른 대상을 수정하거나 새로 등록할 때마다
          폼 내부 상태(useState 초기값)가 새로 초기화되도록 합니다. */}
      <PayeeFormModal
        key={formOpen ? `${payType}-${editingPayee?.id || "new"}` : "closed"}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => setFormOpen(false)}
        payType={payType}
        categories={categories}
        initial={editingPayee}
      />
    </>
  );
}

/* ===== 건물별 지급현황 - 목록 모달 (업체명 클릭 / 내용 클릭 공통) =====
   ✅ 금액 통계(납부예정/미납누적액/납부완료금액)는 여기서 빼고,
      "총 건물 수 / 납부완료 수 / 미납 수"만 보여준 뒤, 건물별로
      1월~12월 체크그리드 + 비고 입력을 표시합니다.
   ✅ 체크/해제는 언제든 자유롭게 가능하며, 비고는 건물 단위로 저장되어
      어느 달을 조회하든 항상 같은 내용이 보입니다.
   ✅ 우측 상단은 X 아이콘 대신 [정렬 드롭다운] + [저장] + [닫기] 버튼으로
      구성됩니다. "저장"을 눌러야 실제로 반영되고, "닫기"는 변경사항을
      저장하지 않고 그냥 닫습니다.
   ✅ 정렬은 "저장"이 완료된 시점의 데이터를 기준으로만 다시 계산됩니다.
      (체크하는 즉시 목록 순서가 바뀌지 않도록, 정렬 기준값은 별도의
      baseline 상태(savedBuildings)로 관리합니다)
   ✅ [수정] 상단 "미납" 건수는 조회 중인 달(당월)이 아직 체크되지 않은
      것까지 포함하면 안 됩니다. 당월은 아직 납부 기한이 남은
      "납부예정"이지 실제로 밀린 "미납"이 아니기 때문입니다. 그래서
      "당월보다 이전" 달에 체크가 안 되어 진짜로 밀린 건물만
      (overdueCount > 0) 미납으로 집계하도록 했습니다. */
function BuildingListModal({ open, onClose, record }) {
  const [buildings, setBuildings] = useState([]); // 화면에서 편집 중인 값(체크/비고)
  const [savedBuildings, setSavedBuildings] = useState([]); // 정렬 계산용 baseline (로드/저장 시점에만 갱신)
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sortMode, setSortMode] = useState("unpaid"); // 'unpaid' | 'paid'

  const yearMonth = record?.yearMonth || nowYm();

  const loadBuildings = async () => {
    if (!record) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        collection(db, "paymentPayees", record.payeeId, "buildings")
      );
      // ✅ 지급 대상 등록/수정과 동일하게, 금액이 없거나 0원인 건물은 표시하지 않습니다.
      const list = snap.docs
        .filter((d) => parseNumber(d.data().monthlyAmount) > 0)
        .map((d) => ({
          id: d.id,
          buildingName: d.data().buildingName || "",
          monthlyAmount: parseNumber(d.data().monthlyAmount),
          startYearMonth: d.data().startYearMonth || "",
          paidMonths: { ...(d.data().paidMonths || {}) },
          note: d.data().note || "",
        }));
      setBuildings(list);
      setSavedBuildings(list.map((b) => ({ ...b, paidMonths: { ...b.paidMonths } })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setSortMode("unpaid");
    loadBuildings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.payeeId]);

  /* ✅ 정렬 순서는 savedBuildings(마지막으로 불러오거나 저장한 시점의 값)
     기준으로만 계산 → 체크박스를 누르는 즉시 순서가 바뀌지 않음 */
  const orderedIds = useMemo(() => {
    return savedBuildings
      .map((b) => ({
        id: b.id,
        name: b.buildingName,
        grid: buildBuildingMonthGrid(b, yearMonth),
      }))
      .sort((a, b) => {
        if (a.grid.overdueCount !== b.grid.overdueCount) {
          return sortMode === "paid"
            ? a.grid.overdueCount - b.grid.overdueCount // 납부순: 미납 적은 순
            : b.grid.overdueCount - a.grid.overdueCount; // 미납순: 미납 많은 순
        }
        return s(a.name).localeCompare(s(b.name), "ko");
      })
      .map((x) => x.id);
  }, [savedBuildings, sortMode, yearMonth]);

  const rows = useMemo(() => {
    const map = new Map(buildings.map((b) => [b.id, b]));
    return orderedIds
      .map((id) => map.get(id))
      .filter(Boolean)
      .map((b) => ({ ...b, grid: buildBuildingMonthGrid(b, yearMonth) }));
  }, [orderedIds, buildings, yearMonth]);

  const counts = useMemo(() => {
    const total = rows.length;
    const paidCount = rows.filter(
      (r) => r.grid.currentApplicable && r.grid.currentChecked
    ).length;
    // ✅ [수정] 당월이 아직 체크 안 된 것은 "미납"이 아니라 "납부예정"입니다.
    // 당월보다 "이전" 달에 실제로 밀린 달이 있는 건물(overdueCount > 0)만
    // 미납으로 집계합니다.
    const unpaidCount = rows.filter((r) => r.grid.overdueCount > 0).length;
    return { total, paidCount, unpaidCount };
  }, [rows]);

  /* ✅ 제한 없이 언제든 체크/해제 가능 (화면에서만 즉시 반영, 저장 전까지는
     Firestore에 쓰지 않음) */
  const toggleMonth = (buildingId, mo) => {
    if (!mo.applicable) return; // ✅ 부과시작월 이전 달은 클릭해도 아무 동작하지 않음(회색 잠금)
    setBuildings((prev) =>
      prev.map((b) => {
        if (b.id !== buildingId) return b;
        const next = { ...(b.paidMonths || {}) };
        if (next[mo.ym]) {
          delete next[mo.ym];
        } else {
          next[mo.ym] = true;
        }
        return { ...b, paidMonths: next };
      })
    );
  };

  const changeNote = (buildingId, val) => {
    setBuildings((prev) =>
      prev.map((b) => (b.id === buildingId ? { ...b, note: val } : b))
    );
  };

  /* ✅ 저장: 변경된 건물의 paidMonths(전체 맵) + 비고를 반영하고,
     체크가 바뀐 달 중에 이미 만들어진 지급기록(paymentRecords)이 있으면
     함께 맞춰줍니다. 저장 후에도 모달은 닫지 않습니다(닫기 버튼으로 닫음). */
  const handleSave = async () => {
    if (!record) return;
    setSaving(true);
    try {
      const savedMap = new Map(savedBuildings.map((b) => [b.id, b]));

      for (const b of buildings) {
        const before = savedMap.get(b.id);
        const beforePm = before?.paidMonths || {};
        const nowPm = b.paidMonths || {};
        const noteChanged = s(before?.note) !== s(b.note);
        const changedYms = [
          ...new Set([...Object.keys(beforePm), ...Object.keys(nowPm)]),
        ].filter((ym) => !!beforePm[ym] !== !!nowPm[ym]);

        if (!noteChanged && changedYms.length === 0) continue;

        // eslint-disable-next-line no-await-in-loop
        await updateDoc(
          doc(db, "paymentPayees", record.payeeId, "buildings", b.id),
          { paidMonths: nowPm, note: s(b.note) }
        );

        // 체크가 바뀐 달 중, 이미 만들어진 지급기록이 있으면 buildingStatus(참고용
        // 스냅샷)만 함께 맞춰줍니다. ✅ "납부상태"(paid)는 대금결제관리 표의
        // 드롭다운으로 직접 바꾸기 전까지 자동으로 바뀌면 안 되므로, 여기서는
        // paid 필드를 건드리지 않습니다.
        for (const ym of changedYms) {
          try {
            const recRef = doc(db, "paymentRecords", `말일_${ym}_${record.payeeId}`);
            // eslint-disable-next-line no-await-in-loop
            const recSnap = await getDoc(recRef);
            if (!recSnap.exists()) continue;
            const data = recSnap.data();
            const bs = data.buildingStatus || [];
            const idx = bs.findIndex((x) => x.buildingName === b.buildingName);
            if (idx === -1) continue;
            const nextPaid = !!nowPm[ym];
            const newBs = bs.map((x, i) =>
              i === idx
                ? { ...x, paid: nextPaid, unpaidStreak: nextPaid ? 0 : x.unpaidStreak || 1 }
                : x
            );
            // eslint-disable-next-line no-await-in-loop
            await updateDoc(recRef, {
              buildingStatus: newBs,
              updatedAt: serverTimestamp(),
            });
          } catch (e) {
            console.error("지급기록 동기화 오류:", e);
          }
        }
      }

      // 저장이 끝난 시점의 값을 baseline으로 갱신 → 이 시점 기준으로 재정렬됨
      setSavedBuildings(buildings.map((b) => ({ ...b, paidMonths: { ...b.paidMonths } })));
      alert("저장되었습니다.");
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const headerActions = (
    <>
      <select
        value={sortMode}
        onChange={(e) => setSortMode(e.target.value)}
        className="pmt-input pmt-input-select pmt-sort-select"
      >
        <option value="unpaid">미납순</option>
        <option value="paid">납부순</option>
      </select>
      <button
        type="button"
        className="pmt-btn pmt-btn-primary pmt-btn-sm"
        onClick={handleSave}
        disabled={saving || loading}
      >
        {saving ? "저장 중..." : "💾 저장"}
      </button>
      <button
        type="button"
        className="pmt-btn pmt-btn-ghost pmt-btn-sm"
        onClick={handleClose}
      >
        닫기
      </button>
    </>
  );

  return (
    <SimpleModal
      open={open}
      title={`건물별 지급현황 - ${record?.name || ""}`}
      onClose={handleClose}
      size="wide"
      headerActions={headerActions}
      hideCloseButton
    >
      <div className="pmt-bcount-summary">
        <div className="pmt-bcount-item">
          <span className="pmt-bcount-label">총 거래 건물</span>
          <span className="pmt-bcount-value">{counts.total}개</span>
        </div>
        <div className="pmt-bcount-item is-paid">
          <span className="pmt-bcount-label">납부완료</span>
          <span className="pmt-bcount-value">{counts.paidCount}개</span>
        </div>
        <div className="pmt-bcount-item is-unpaid">
          <span className="pmt-bcount-label">미납</span>
          <span className="pmt-bcount-value">{counts.unpaidCount}개</span>
        </div>
      </div>

      {loading && <div className="pmt-cat-empty">불러오는 중...</div>}
      {!loading && rows.length === 0 && (
        <div className="pmt-cat-empty">등록된 건물이 없습니다.</div>
      )}

      <div className="pmt-monthgrid-list">
        {rows.map((b) => (
          <div
            key={b.id}
            className={`pmt-monthgrid-card ${b.grid.overdueCount > 0 ? "is-unpaid" : ""}`}
          >
            <div className="pmt-monthgrid-card-head">
              <span className="pmt-monthgrid-name">{b.buildingName}</span>
              <span className="pmt-monthgrid-amount">{fmtWon(b.monthlyAmount)}</span>
              {b.grid.overdueCount > 0 && (
                <span className="pmt-unpaid-chip">{b.grid.overdueCount}개월 미납</span>
              )}
              {!b.grid.nextPayableYm ? (
                <span className="pmt-paid-chip">완납</span>
              ) : (
                <span className="pmt-next-chip">
                  다음 결제 대상: {parseInt(b.grid.nextPayableYm.slice(5, 7), 10)}월분
                </span>
              )}
              <input
                type="text"
                className="pmt-input pmt-monthgrid-note"
                placeholder="비고 입력 (모든 달에 동일하게 표시됩니다)"
                value={b.note || ""}
                onChange={(e) => changeNote(b.id, e.target.value)}
              />
            </div>
            <div className="pmt-monthgrid-row">
              {b.grid.months.map((mo) => (
                <button
                  key={mo.ym}
                  type="button"
                  disabled={!mo.applicable}
                  onClick={() => toggleMonth(b.id, mo)}
                  className={[
                    "pmt-month-chip",
                    mo.checked ? "is-checked" : "",
                    !mo.checked && mo.isOverdue ? "is-overdue" : "",
                    mo.isCurrent ? "is-current" : "",
                    !mo.checked && mo.isNextPayable ? "is-next" : "",
                    !mo.applicable ? "is-na" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title={
                    !mo.applicable
                      ? "부과시작월 이전 달입니다 (계약 전)"
                      : mo.checked
                      ? "클릭하여 체크 해제"
                      : mo.isNextPayable
                      ? "다음 '납부완료' 처리 시 이 달이 체크됩니다"
                      : "클릭하여 납부완료 체크"
                  }
                >
                  <span className="pmt-month-chip-num">{mo.m}월</span>
                  <span className="pmt-month-chip-mark">{mo.checked ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SimpleModal>
  );
}

/* ===== 메인 페이지 ===== */
export default function PaymentSettlementPage() {
  const [payType, setPayType] = useState(getDefaultPayType); // '10일' | '말일' (날짜 기준 자동 선택)
  const [yearMonth, setYearMonth] = useState(nowYm());

  const [categories, setCategories] = useState([]);
  const [payees, setPayees] = useState([]);
  const [records, setRecords] = useState([]);

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [payeeModalOpen, setPayeeModalOpen] = useState(false);
  const [buildingListRecord, setBuildingListRecord] = useState(null);

  /* ✅ [수정] 예전에는 generatingRef가 boolean 하나였습니다. 즉 "어떤 달이든
     하나라도" 자동 생성/동기화가 진행 중이면, 그 사이에 다른 달로 이동해서
     생성이 필요해져도 전부 막혀버렸습니다(같은 변수 하나를 모든 달이
     공유했기 때문). 이게 바로 "업체가 뜨다 안 뜨다, 뒤죽박죽으로 보이는"
     원인이었습니다 — 여러 달을 빠르게 넘나들며 확인하면, 먼저 시작된
     달의 작업이 끝나기 전까지 나중 달의 생성 요청이 통째로 무시됐던
     것입니다. 이제는 "결제구분_달" 조합별로 별도 키를 두는 Set으로
     바꿔서, 같은 달에 대한 중복 작업만 막고 서로 다른 달의 작업은
     독립적으로 진행되도록 했습니다. */
  const generatingKeysRef = useRef(new Set());

  /* 🔁 구분(카테고리) 구독 + 없으면 기본값 자동 생성 */
  useEffect(() => {
    const ref = doc(db, "serviceSettings", `결제구분_${payType}`);
    const unsub = onSnapshot(ref, async (snap) => {
      if (!snap.exists()) {
        try {
          await setDoc(ref, { items: DEFAULT_CATEGORIES[payType] || [] });
        } catch (e) {
          console.error("기본 구분 생성 오류:", e);
        }
        return;
      }
      const arr = Array.isArray(snap.data()?.items)
        ? snap.data().items.filter((x) => s(x) !== "")
        : [];
      setCategories(arr);
    });
    return () => unsub();
  }, [payType]);

  /* 🔁 지급 대상(템플릿) 구독 */
  useEffect(() => {
    const qy = query(collection(db, "paymentPayees"), where("payType", "==", payType));
    const unsub = onSnapshot(
      qy,
      (snap) => setPayees(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[paymentPayees listen error]", err)
    );
    return () => unsub();
  }, [payType]);

  /* 🔁 이번 달 지급 기록 구독 */
  useEffect(() => {
    const qy = query(
      collection(db, "paymentRecords"),
      where("payType", "==", payType),
      where("yearMonth", "==", yearMonth)
    );
    const unsub = onSnapshot(
      qy,
      (snap) => setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[paymentRecords listen error]", err)
    );
    return () => unsub();
  }, [payType, yearMonth]);

  /* 🔁 A. 템플릿에는 있는데 이번 달 기록이 없는 대상 → 자동 생성
     🔁 B. 아직 확정되지 않은(=완료 처리 안 한) 달의 건물계약 기록은,
        지급 대상 관리에서 건물 목록/구성이 바뀌면 최신 내용으로 다시
        맞춰줍니다.
        ✅ [수정] 예전에는 "오늘(nowYm) 이전 달"이면 무조건 동기화를
        건너뛰어서, 지급 대상 관리에서 건물을 추가/수정/삭제해도 이미
        지나간 달(예: 오늘이 8월이면 1~7월)에는 반영되지 않아 달마다
        표시가 다르게 나오는 원인이었습니다. 기준을
        "2026-01(DEFAULT_START_YM) 이전이면 보호"로 바꿔서, 2026년 1월
        이후 달은 (이미 납부완료 처리된 달만 제외하고) 언제 조회하든
        항상 최신 건물 구성을 반영하도록 했습니다. 2025-12 이전 달은
        그대로 보호되어 손대지 않습니다. 또한 "건물별 계약"을 켰다/껐다
        하는 방향 전환도 함께 반영되도록 조건을 넓혔습니다.
     ℹ️ 이름/은행/계좌/구분은 더 이상 기록(record)에 동기화해서 쓰지
        않습니다. 대신 화면에 표시할 때 항상 "지급 대상 관리"에 저장된
        최신 값을 바로 조회해서 보여주므로(getPayeeDisplay), 별도의
        Firestore 쓰기 없이도 몇 월을 보든 항상 최신 정보가 보입니다. */
  useEffect(() => {
    if (!payees.length) return;
    const genKey = `${payType}_${yearMonth}`;
    if (generatingKeysRef.current.has(genKey)) return; // 같은 달의 작업만 중복 방지

    const activePayees = payees.filter((p) => p.active !== false);
    const recordMap = new Map(records.map((r) => [r.payeeId, r]));
    const missing = activePayees.filter((p) => !recordMap.has(p.id));
    const needsSync = activePayees.filter((p) => {
      if (payType !== "말일") return false;
      const rec = recordMap.get(p.id);
      if (!rec) return false; // missing 쪽에서 새로 생성됨
      if (rec.paid) return false; // 이미 완료 처리된 달은 건드리지 않음
      if (yearMonth < DEFAULT_START_YM) return false; // 2026-01 이전 달은 동기화 대상 아님
      if (!p.hasBuildings && !rec.hasBuildings) return false; // 둘 다 단순금액이면 동기화 불필요
      return true;
    });

    if (!missing.length && !needsSync.length) return;

    generatingKeysRef.current.add(genKey);
    (async () => {
      const prevYearMonth = shiftYm(yearMonth, -1);

      /* 말일 + 건물계약 업체의 buildingStatus를 최신 건물 목록 기준으로 계산 */
      const buildBuildingStatus = async (payee, prevBuildingStatusForCarry, existingBuildingStatus) => {
        const buildingsSnap = await getDocs(
          collection(db, "paymentPayees", payee.id, "buildings")
        );
        const prevMap = new Map();
        (prevBuildingStatusForCarry || []).forEach((b) => prevMap.set(b.buildingName, b));
        const existingMap = new Map();
        (existingBuildingStatus || []).forEach((b) => existingMap.set(b.buildingName, b));

        return buildingsSnap.docs
          .filter((d) => d.data().active !== false)
          .filter((d) => parseNumber(d.data().monthlyAmount) > 0) // ✅ 0원/금액없음 건물 제외
          .filter((d) => {
            // ✅ startYearMonth가 비어 있으면 buildBuildingMonthGrid와 동일하게
            // DEFAULT_START_YM(2026-01) 기준으로 판단합니다. (일관성 유지)
            const startYm = s(d.data().startYearMonth) || DEFAULT_START_YM;
            return startYm <= yearMonth;
          })
          .map((d) => {
            const bd = d.data();
            const buildingName = s(bd.buildingName);
            const monthlyAmount = parseNumber(bd.monthlyAmount);
            // ✅ 건물별 1~12월 체크그리드(paidMonths)에 이번 달 체크가 있으면
            // 최우선으로 "완납"으로 인정합니다.
            const paidFromGrid = !!(bd.paidMonths && bd.paidMonths[yearMonth]);

            // 이번 조회 달에 이미 만들어져 있던 기록이 있으면(=동기화 케이스)
            // 사용자가 이미 체크해둔 지급 여부를 그대로 유지합니다.
            const existing = existingMap.get(buildingName);
            if (existing) {
              const paid = paidFromGrid || !!existing.paid;
              return {
                buildingName,
                monthlyAmount,
                startYearMonth: s(bd.startYearMonth),
                paid,
                unpaidStreak: paid ? 0 : parseNumber(existing.unpaidStreak) || 1,
              };
            }

            // 새로 추가된 건물: 지난 달 기록을 보고 미납 개월수를 이어서 계산
            const prev = prevMap.get(buildingName);
            const prevStreak = prev && !prev.paid ? parseNumber(prev.unpaidStreak) : 0;
            return {
              buildingName,
              monthlyAmount,
              startYearMonth: s(bd.startYearMonth),
              paid: paidFromGrid,
              unpaidStreak: paidFromGrid ? 0 : prevStreak + 1,
            };
          });
      };

      for (const payee of missing) {
        try {
          const recordId = `${payType}_${yearMonth}_${payee.id}`;

          const payload = {
            payType,
            yearMonth,
            payeeId: payee.id,
            category: s(payee.category),
            name: s(payee.name),
            bank: s(payee.bank),
            account: s(payee.account),
            note: "",
            paid: false,
            excluded: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          if (payType === "10일") {
            payload.tableGroup = payee.tableGroup || "청소비";
            if (payload.tableGroup === "월급") {
              const salary = parseNumber(payee.defaultSalary);
              const allowance = parseNumber(payee.defaultAllowance);
              payload.salary = salary;
              payload.allowance = allowance;
              payload.amount = salary + allowance;

              const prevId = `10일_${prevYearMonth}_${payee.id}`;
              const prevSnap = await getDoc(doc(db, "paymentRecords", prevId));
              payload.prevAmount = prevSnap.exists()
                ? parseNumber(prevSnap.data().amount)
                : 0;
            } else {
              const cleaningFee = parseNumber(payee.defaultCleaningFee);
              const envelopeFee = parseNumber(payee.defaultEnvelopeFee);
              payload.cleaningFee = cleaningFee;
              payload.envelopeFee = envelopeFee;
              payload.amount = cleaningFee + envelopeFee;
            }
          } else {
            if (payee.hasBuildings) {
              const prevId = `말일_${prevYearMonth}_${payee.id}`;
              const prevSnap = await getDoc(doc(db, "paymentRecords", prevId));
              const prevBuildingStatus = prevSnap.exists()
                ? prevSnap.data().buildingStatus || []
                : [];
              const buildingStatus = await buildBuildingStatus(payee, prevBuildingStatus, null);
              payload.buildingStatus = buildingStatus;
              payload.hasBuildings = true;
              payload.amount = buildingStatus.reduce(
                (sum, b) => sum + (b.monthlyAmount || 0),
                0
              );
            } else {
              payload.hasBuildings = false;
              payload.amount = parseNumber(payee.defaultAmount);
            }
          }

          await setDoc(doc(db, "paymentRecords", recordId), payload, {
            merge: true,
          });
        } catch (e) {
          console.error("지급 기록 자동 생성 오류:", e);
        }
      }

      for (const payee of needsSync) {
        try {
          const rec = recordMap.get(payee.id);

          /* ✅ [추가] "건물별 계약 관리"를 껐을 경우: 기록도 건물계약
             정보를 지우고 단순 금액 지급 기록으로 맞춰줍니다. */
          if (!payee.hasBuildings) {
            if (!rec.hasBuildings) continue; // 이미 단순 금액이면 할 일 없음
            await updateDoc(doc(db, "paymentRecords", rec.id), {
              hasBuildings: false,
              buildingStatus: deleteField(),
              amount: parseNumber(payee.defaultAmount),
              updatedAt: serverTimestamp(),
            });
            continue;
          }

          const prevId = `말일_${prevYearMonth}_${payee.id}`;
          const prevSnap = await getDoc(doc(db, "paymentRecords", prevId));
          const prevBuildingStatus = prevSnap.exists()
            ? prevSnap.data().buildingStatus || []
            : [];
          const buildingStatus = await buildBuildingStatus(
            payee,
            prevBuildingStatus,
            rec.buildingStatus || []
          );

          const isSame =
            rec.hasBuildings === true &&
            JSON.stringify(buildingStatus) === JSON.stringify(rec.buildingStatus || []);
          if (isSame) continue;

          const newAmount = buildingStatus.reduce(
            (sum, b) => sum + (b.monthlyAmount || 0),
            0
          );

          // ✅ "납부상태"(paid)는 대금결제관리 표의 드롭다운으로 직접 바꾸기
          //    전까지 자동으로 바뀌면 안 되므로, 여기서는 건드리지 않습니다.
          await updateDoc(doc(db, "paymentRecords", rec.id), {
            hasBuildings: true,
            buildingStatus,
            amount: newAmount,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.error("건물계약 동기화 오류:", e);
        }
      }

      generatingKeysRef.current.delete(genKey);
    })();
  }, [payees, records, payType, yearMonth]);

  /* ✅ 지급 대상(payeeId) → 최신 payee 정보 매핑.
     표에 이름/은행/계좌/구분을 보여줄 때 이 매핑을 사용하면, 몇 월을
     조회하든 항상 "지급 대상 관리"에 지금 저장된 값이 그대로 보입니다.
     (기록(record)에 박제된 예전 값을 쓰지 않으므로 별도 동기화/쓰기가
     필요 없어 Firestore 비용도 추가로 들지 않습니다) */
  const payeeMap = useMemo(
    () => new Map(payees.map((p) => [p.id, p])),
    [payees]
  );
  const getPayeeDisplay = (row) => {
    const p = payeeMap.get(row.payeeId);
    return {
      name: p ? p.name : row.name,
      bank: p ? p.bank : row.bank,
      account: p ? p.account : row.account,
      category: p ? p.category : row.category,
    };
  };

  /* ✅ payee.order 값을 기준으로 표시 순서를 정렬합니다.
     order가 없는 대상(아직 순서를 지정한 적 없는 신규 등록 등)은
     맨 뒤로 보냅니다. */
  const sortByPayeeOrder = (rows) =>
    [...rows].sort((a, b) => {
      const pa = payeeMap.get(a.payeeId);
      const pb = payeeMap.get(b.payeeId);
      const oa = pa && typeof pa.order === "number" ? pa.order : Number.MAX_SAFE_INTEGER;
      const ob = pb && typeof pb.order === "number" ? pb.order : Number.MAX_SAFE_INTEGER;
      return oa - ob;
    });

  /* ===== 표시용 목록 =====
     ✅ "제외" 처리된 항목도 표에서 사라지지 않고 회색으로 계속 보이도록,
     화면에는 이번 달의 모든 기록(records)을 그대로 표시합니다.
     합계·건물 조회 등 실제 금액 계산에는 제외된 항목을 넣지 않기 위해
     activeRecords(제외 안 된 것만)를 별도로 둡니다. */
  const activeRecords = useMemo(
    () => records.filter((r) => !r.excluded),
    [records]
  );

  const cleaningRowsRaw = useMemo(
    () => (payType === "10일" ? records.filter((r) => r.tableGroup !== "월급") : []),
    [records, payType]
  );
  const salaryRowsRaw = useMemo(
    () => (payType === "10일" ? records.filter((r) => r.tableGroup === "월급") : []),
    [records, payType]
  );
  const majilRowsRaw = useMemo(
    () => (payType === "말일" ? records : []),
    [records, payType]
  );

  const cleaningRowsSorted = useMemo(
    () => sortByPayeeOrder(cleaningRowsRaw),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cleaningRowsRaw, payeeMap]
  );
  const salaryRowsSorted = useMemo(
    () => sortByPayeeOrder(salaryRowsRaw),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salaryRowsRaw, payeeMap]
  );
  const majilRowsSorted = useMemo(
    () => sortByPayeeOrder(majilRowsRaw),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [majilRowsRaw, payeeMap]
  );

  /* ✅ 순서 변경(누른 채로 위/아래 드래그) 상태
     - dragTable: 지금 드래그 중인 표('cleaning' | 'salary' | 'majil')
     - dragIds: 드래그 중 실시간으로 반영되는 payeeId 순서 배열
       (드래그 중엔 이 순서대로 행이 함께 이동해 보이고, 손을 떼는 순간
       이 순서 그대로 Firestore에 저장됩니다) */
  const dragStateRef = useRef(null);
  const dragIdsRef = useRef(null);
  const [dragTable, setDragTable] = useState(null);
  const [dragIds, setDragIds] = useState(null);
  const [dragActivePayeeId, setDragActivePayeeId] = useState(null);

  const commitOrder = async (payeeIds) => {
    try {
      await Promise.all(
        payeeIds.map((payeeId, idx) =>
          updateDoc(doc(db, "paymentPayees", payeeId), { order: (idx + 1) * 10 })
        )
      );
    } catch (e) {
      console.error("순서 저장 오류:", e);
      alert("순서 저장 중 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    const handleMove = (e) => {
      const st = dragStateRef.current;
      const current = dragIdsRef.current;
      if (!st || !current) return;
      if (e.cancelable) e.preventDefault();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const deltaY = clientY - st.startY;
      const shift = Math.round(deltaY / st.rowHeight);
      let newIndex = st.startIndex + shift;
      newIndex = Math.max(0, Math.min(current.length - 1, newIndex));
      if (newIndex === st.currentIndex) return;
      const newIds = [...current];
      const [moved] = newIds.splice(st.currentIndex, 1);
      newIds.splice(newIndex, 0, moved);
      st.currentIndex = newIndex;
      dragIdsRef.current = newIds;
      setDragIds(newIds);
    };
    const handleUp = () => {
      const st = dragStateRef.current;
      const finalIds = dragIdsRef.current;
      dragStateRef.current = null;
      dragIdsRef.current = null;
      setDragTable(null);
      setDragIds(null);
      setDragActivePayeeId(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (st && finalIds) {
        commitOrder(finalIds);
      }
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, []);

  /* ✅ "순서" 버튼을 누른 채로 시작하는 드래그. orderedRows는 지금 화면에
     보이는 순서(해당 표의 현재 정렬 결과)를 그대로 넘겨받아, 그 순서의
     payeeId 배열을 드래그 기준으로 사용합니다. */
  const startDrag = (table, orderedRows, index, e) => {
    e.preventDefault();
    const rowEl = e.currentTarget.closest("tr");
    const rowHeight = rowEl ? rowEl.getBoundingClientRect().height : 40;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const ids = orderedRows.map((r) => r.payeeId);
    dragStateRef.current = { startY: clientY, startIndex: index, currentIndex: index, rowHeight };
    dragIdsRef.current = ids;
    setDragTable(table);
    setDragIds(ids);
    setDragActivePayeeId(orderedRows[index]?.payeeId || null);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  const applyDragOrder = (table, sortedRows) => {
    if (dragTable !== table || !dragIds) return sortedRows;
    const map = new Map(sortedRows.map((r) => [r.payeeId, r]));
    return dragIds.map((pid) => map.get(pid)).filter(Boolean);
  };

  const cleaningRows = applyDragOrder("cleaning", cleaningRowsSorted);
  const salaryRows = applyDragOrder("salary", salaryRowsSorted);
  const visibleRecords = applyDragOrder("majil", majilRowsSorted);

  /* ✅ 말일 표의 "N건 O원 납부예정/납부완료" 표시를 위해, 건물계약이 있는
     업체들의 건물 목록(paidMonths 포함)을 조회 중인 목록이 바뀔 때만
     불러옵니다. (제외 처리된 항목은 조회하지 않아 비용을 아낍니다) */
  const [buildingsByPayee, setBuildingsByPayee] = useState({});
  useEffect(() => {
    if (payType !== "말일") {
      setBuildingsByPayee({});
      return;
    }
    const targets = activeRecords.filter((r) => r.hasBuildings);
    if (!targets.length) {
      setBuildingsByPayee({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(
          targets.map(async (r) => {
            const snap = await getDocs(
              collection(db, "paymentPayees", r.payeeId, "buildings")
            );
            // ✅ 금액이 없거나 0원인 건물은 미납/납부예정 집계에서 제외합니다.
            return [
              r.payeeId,
              snap.docs
                .filter((d) => parseNumber(d.data().monthlyAmount) > 0)
                .map((d) => ({
                  id: d.id,
                  buildingName: d.data().buildingName || "",
                  monthlyAmount: parseNumber(d.data().monthlyAmount),
                  startYearMonth: d.data().startYearMonth || "",
                  paidMonths: d.data().paidMonths || {},
                })),
            ];
          })
        );
        if (!cancelled) setBuildingsByPayee(Object.fromEntries(entries));
      } catch (e) {
        console.error("건물 목록 조회 오류:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payType, activeRecords]);

  /* ✅ 말일 표 "내용"/"금액" 표시용 - 이번 결제 사이클(건물마다 1개월분씩)
     기준 건수·금액을 계산합니다. "금액" 열과 "내용" 열의 숫자가 항상
     일치하도록 이 함수 하나만 두 곳에서 함께 사용합니다.
     - 납부예정(row.paid=false): 지금 "완료"를 누르면 결제될 건물들의
       1개월분 합계 (건물마다 몇 달이 밀렸든 상관없이 1개월분만 집계)
     - 납부완료(row.paid=true): 방금 이 결제로 실제 처리된 건물들의
       1개월분 합계(paidMonthAssignments 기준). 이 정보가 없는 과거
       기록은 총 계약금액으로 대체 표시합니다. */
  const getRowCycleInfo = (row) => {
    if (!row.hasBuildings) {
      return { amount: parseNumber(row.amount), count: null };
    }
    const buildingsForRow = buildingsByPayee[row.payeeId] || [];
    if (row.paid) {
      const assignments = row.paidMonthAssignments || [];
      if (assignments.length) {
        const map = new Map(buildingsForRow.map((b) => [b.id, b]));
        const amount = assignments.reduce(
          (sum, a) => sum + (map.get(a.buildingId)?.monthlyAmount || 0),
          0
        );
        return { amount, count: assignments.length };
      }
      const amount = buildingsForRow.reduce((sum, b) => sum + (b.monthlyAmount || 0), 0);
      return { amount, count: buildingsForRow.length };
    }
    const dueList = buildingsForRow.filter(
      (b) => !!buildBuildingMonthGrid(b, row.yearMonth).nextPayableYm
    );
    const amount = dueList.reduce((sum, b) => sum + (b.monthlyAmount || 0), 0);
    return { amount, count: dueList.length };
  };

  /* ✅ 말일 표 "내용" 열의 "미납" 부분 계산용 - 조회 중인 달보다 "이전" 달까지
     체크가 안 되어 진짜로 밀린 건물의 건수와, 그 건물들의 밀린 개월 수를 모두
     곱한 실제 총 미납액을 계산합니다. (이번 달분은 여기 포함하지 않고
     getRowCycleInfo의 "납부예정/납부완료" 쪽에서 따로 보여줍니다) */
  const getRowUnpaidInfo = (row) => {
    if (!row.hasBuildings) return { amount: 0, count: 0 };
    const buildingsForRow = buildingsByPayee[row.payeeId] || [];
    let count = 0;
    let amount = 0;
    buildingsForRow.forEach((b) => {
      const grid = buildBuildingMonthGrid(b, row.yearMonth);
      if (grid.overdueCount > 0) {
        count += 1;
        amount += grid.overdueCount * (b.monthlyAmount || 0);
      }
    });
    return { amount, count };
  };

  /* ===== 인라인 저장 ===== */
  const saveRecord = async (recordId, patch) => {
    try {
      await updateDoc(doc(db, "paymentRecords", recordId), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("지급 기록 저장 오류:", err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  const handleCleaningFeeChange = (row, key, val) => {
    const num = parseNumber(val);
    const cleaningFee = key === "cleaningFee" ? num : parseNumber(row.cleaningFee);
    const envelopeFee = key === "envelopeFee" ? num : parseNumber(row.envelopeFee);
    saveRecord(row.id, {
      [key]: num,
      amount: cleaningFee + envelopeFee,
    });
  };

  const handleSalaryChange = (row, key, val) => {
    const num = parseNumber(val);
    const salary = key === "salary" ? num : parseNumber(row.salary);
    const allowance = key === "allowance" ? num : parseNumber(row.allowance);
    saveRecord(row.id, {
      [key]: num,
      amount: salary + allowance,
    });
  };

  /* ✅ "제외"는 더 이상 목록에서 완전히 사라지지 않습니다. 제외된 항목도
     표에 회색으로 계속 남아 내용을 확인할 수 있고, 합계/자동생성 계산에서만
     빠집니다. 같은 버튼으로 다시 눌러 "포함"으로 되돌릴 수 있습니다. */
  const handleToggleExclude = async (row) => {
    const nextExcluded = !row.excluded;
    if (
      nextExcluded &&
      !window.confirm(
        "이번 달 지급 목록에서 제외할까요?\n(표에는 회색으로 계속 표시되며, 합계 계산에서만 빠집니다. 같은 버튼으로 다시 포함시킬 수 있습니다)"
      )
    )
      return;
    await saveRecord(row.id, { excluded: nextExcluded });
  };

  /* ✅ 말일 표 "납부상태" 드롭다운 변경 처리
     - 건물계약이 없는 단순 업체: paid 값만 그대로 토글
     - 건물계약이 있는 업체: 이번 달 "완료" 처리를 누르면, 건물마다
       "가장 오래 밀린 달" 딱 한 달만 체크됩니다. (밀린 달이 없는 건물은
       이번 달이 체크됩니다) 예) 5월에 완료 처리 시 A건물(3,4월 미납)은
       3월이, B건물(4월 미납)은 4월이, C건물(미납 없음)은 5월이 체크됨
     ✅ 이때 "어떤 건물의 몇 월이 체크됐는지"를 이 지급기록에
       paidMonthAssignments로 정확히 기록해둡니다. 그래야 나중에 실수로
       또는 착오로 다시 "납부예정"으로 되돌릴 때, 그때 체크됐던 달들만
       정확히 원래대로(미체크) 되돌릴 수 있습니다. (단순히 "이번 달"만
       되돌리면, 밀린 달을 정리한 건물은 되돌아가지 않는 문제가 있었음) */
  const handlePaymentStatusChange = async (row, toPaid) => {
    if (!row.hasBuildings) {
      await saveRecord(row.id, { paid: toPaid });
      return;
    }

    const prevBuildingStatus = row.buildingStatus || [];
    const newBuildingStatus = prevBuildingStatus.map((b) => ({
      ...b,
      paid: toPaid,
      unpaidStreak: toPaid ? 0 : b.unpaidStreak || 1,
    }));
    const newAmount = newBuildingStatus.reduce(
      (sum, b) => sum + (b.monthlyAmount || 0),
      0
    );

    try {
      if (toPaid) {
        const buildingsSnap = await getDocs(
          collection(db, "paymentPayees", row.payeeId, "buildings")
        );
        const assignments = [];
        await Promise.all(
          buildingsSnap.docs.map((d) => {
            const bd = d.data();
            // ✅ 금액이 없거나 0원인 건물은 결제 대상에서 제외합니다.
            if (parseNumber(bd.monthlyAmount) <= 0) return Promise.resolve();
            const targetYm = findOldestUnpaidYm(
              { startYearMonth: bd.startYearMonth, paidMonths: bd.paidMonths || {} },
              row.yearMonth
            );
            if (!targetYm) return Promise.resolve();
            assignments.push({
              buildingId: d.id,
              buildingName: s(bd.buildingName),
              ym: targetYm,
            });
            return updateDoc(
              doc(db, "paymentPayees", row.payeeId, "buildings", d.id),
              { [`paidMonths.${targetYm}`]: true }
            );
          })
        );

        await updateDoc(doc(db, "paymentRecords", row.id), {
          buildingStatus: newBuildingStatus,
          amount: newAmount,
          paid: toPaid,
          paidMonthAssignments: assignments,
          updatedAt: serverTimestamp(),
        });
      } else {
        // ✅ 되돌리기: 이 지급기록을 "완료" 처리했을 때 실제로 체크됐던
        //    달들(paidMonthAssignments)만 정확히 다시 미체크 상태로 되돌립니다.
        const assignments = row.paidMonthAssignments || [];
        await Promise.all(
          assignments.map(async (a) => {
            try {
              await updateDoc(
                doc(db, "paymentPayees", row.payeeId, "buildings", a.buildingId),
                { [`paidMonths.${a.ym}`]: deleteField() }
              );
            } catch (e) {
              console.error("되돌리기 처리 오류:", e);
            }
          })
        );

        await updateDoc(doc(db, "paymentRecords", row.id), {
          buildingStatus: newBuildingStatus,
          amount: newAmount,
          paid: toPaid,
          paidMonthAssignments: deleteField(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error("납부상태 변경 오류:", err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  /* ===== 합계 ===== */
  /* ✅ 합계는 항상 activeRecords(제외되지 않은 것) 기준으로만 계산합니다.
     제외된 항목은 표에는 회색으로 남지만 합계에는 포함되지 않습니다. */
  const summary10 = useMemo(() => {
    if (payType !== "10일") {
      return { cleaningFeeSum: 0, envelopeFeeSum: 0, cleaningAmountSum: 0, salaryAmountSum: 0, total: 0 };
    }
    const activeCleaning = activeRecords.filter((r) => r.tableGroup !== "월급");
    const activeSalary = activeRecords.filter((r) => r.tableGroup === "월급");
    const cleaningFeeSum = activeCleaning.reduce((s2, r) => s2 + parseNumber(r.cleaningFee), 0);
    const envelopeFeeSum = activeCleaning.reduce((s2, r) => s2 + parseNumber(r.envelopeFee), 0);
    const cleaningAmountSum = activeCleaning.reduce((s2, r) => s2 + parseNumber(r.amount), 0);
    const salaryAmountSum = activeSalary.reduce((s2, r) => s2 + parseNumber(r.amount), 0);
    return {
      cleaningFeeSum,
      envelopeFeeSum,
      cleaningAmountSum,
      salaryAmountSum,
      total: cleaningAmountSum + salaryAmountSum,
    };
  }, [activeRecords, payType]);

  /* ✅ 말일 합계는 "금액"/"내용" 열과 동일하게 결제 사이클(1개월분) 금액을
     기준으로 계산해, 표에 보이는 숫자와 하단 합계가 항상 일치하도록 합니다. */
  const summary30 = useMemo(() => {
    if (payType !== "말일") {
      return { total: 0, paidTotal: 0, unpaidTotal: 0, unpaidCount: 0 };
    }
    const amounts = activeRecords.map((r) => ({ r, amount: getRowCycleInfo(r).amount }));
    const total = amounts.reduce((s2, x) => s2 + x.amount, 0);
    const paidTotal = amounts.filter((x) => x.r.paid).reduce((s2, x) => s2 + x.amount, 0);
    const unpaidCount = activeRecords.filter((r) => !r.paid).length;
    return { total, paidTotal, unpaidTotal: total - paidTotal, unpaidCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRecords, payType, buildingsByPayee]);

  /* ===== 렌더 ===== */
  const renderMonthNav = () => (
    <div className="pmt-month-nav">
      <button
        type="button"
        className="pmt-month-btn"
        onClick={() => setYearMonth((ym) => shiftYm(ym, -1))}
      >
        ◀
      </button>
      <span className="pmt-month-label">{ymLabel(yearMonth)}</span>
      <button
        type="button"
        className="pmt-month-btn"
        onClick={() => setYearMonth((ym) => shiftYm(ym, 1))}
      >
        ▶
      </button>
      {yearMonth !== nowYm() && (
        <button
          type="button"
          className="pmt-month-today"
          onClick={() => setYearMonth(nowYm())}
        >
          이번달
        </button>
      )}
    </div>
  );

  return (
    <div className="page-wrapper pmt-page">
      <PageTitle>대금결제관리</PageTitle>

      <div className="pmt-card">
        {/* 상단 툴바 */}
        <div className="pmt-toolbar">
          <div className="pmt-toolbar-left">
            <div className="pmt-toggle-group">
              <button
                type="button"
                className={`pmt-toggle-btn ${payType === "말일" ? "is-active" : ""}`}
                onClick={() => setPayType("말일")}
              >
                말일
              </button>
              <button
                type="button"
                className={`pmt-toggle-btn ${payType === "10일" ? "is-active" : ""}`}
                onClick={() => setPayType("10일")}
              >
                10일
              </button>
            </div>
            {renderMonthNav()}
          </div>

          <div className="pmt-toolbar-right">
            <button
              type="button"
              className="pmt-btn pmt-btn-secondary"
              onClick={() => setCatModalOpen(true)}
            >
              🏷️ 구분 관리
            </button>
            <button
              type="button"
              className="pmt-btn pmt-btn-primary"
              onClick={() => setPayeeModalOpen(true)}
            >
              👥 지급 대상 관리
            </button>
          </div>
        </div>

        {/* ===== 10일 화면 ===== */}
        {payType === "10일" && (
          <>
            <div className="pmt-section-title">청소비 지급 (표A)</div>
            <div className="pmt-table-wrap">
              <table className="pmt-table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>구분</th>
                    <th style={{ width: 130 }}>이름</th>
                    <th style={{ width: 90 }}>은행</th>
                    <th style={{ width: 170 }}>계좌</th>
                    <th style={{ width: 110 }}>청소비</th>
                    <th style={{ width: 110 }}>봉투/스티커</th>
                    <th style={{ width: 110 }}>금액</th>
                    <th style={{ width: 130 }}>비고</th>
                    <th style={{ width: 80 }}>지급완료</th>
                    <th style={{ width: 108 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {cleaningRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="pmt-empty">
                        등록된 청소비 지급 대상이 없습니다. "지급 대상 관리"에서
                        추가해 주세요.
                      </td>
                    </tr>
                  )}
                  {cleaningRows.map((row, index) => {
                    const disp = getPayeeDisplay(row);
                    const isExcluded = !!row.excluded;
                    return (
                    <tr
                      key={row.id}
                      className={[
                        isExcluded ? "pmt-row-excluded" : "",
                        dragActivePayeeId === row.payeeId ? "pmt-row-dragging" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td>{disp.category || "-"}</td>
                      <td className="pmt-td-left">{disp.name}</td>
                      <td>{disp.bank || "-"}</td>
                      <td>{disp.account || "-"}</td>
                      <td>
                        <input
                          type="text"
                          className="pmt-table-input"
                          value={fmtComma(row.cleaningFee)}
                          disabled={isExcluded}
                          onChange={(e) =>
                            handleCleaningFeeChange(row, "cleaningFee", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="pmt-table-input"
                          value={fmtComma(row.envelopeFee)}
                          disabled={isExcluded}
                          onChange={(e) =>
                            handleCleaningFeeChange(row, "envelopeFee", e.target.value)
                          }
                        />
                      </td>
                      <td className="pmt-td-amount">{fmtComma(row.amount)}</td>
                      <td>
                        <input
                          type="text"
                          className="pmt-table-input pmt-table-input-left"
                          value={row.note || ""}
                          disabled={isExcluded}
                          onChange={(e) => saveRecord(row.id, { note: e.target.value })}
                        />
                      </td>
                      <td className="pmt-td-center">
                        <label className="pmt-switch pmt-switch-sm">
                          <input
                            type="checkbox"
                            checked={!!row.paid}
                            disabled={isExcluded}
                            onChange={(e) => saveRecord(row.id, { paid: e.target.checked })}
                          />
                          <span className="pmt-switch-track">
                            <span className="pmt-switch-thumb" />
                          </span>
                        </label>
                      </td>
                      <td className="pmt-td-center pmt-td-manage">
                        <button
                          type="button"
                          className={isExcluded ? "pmt-row-restore" : "pmt-row-del"}
                          onClick={() => handleToggleExclude(row)}
                        >
                          {isExcluded ? "↩ 포함" : "🚫 제외"}
                        </button>
                        <button
                          type="button"
                          className="pmt-row-drag"
                          onMouseDown={(e) => startDrag("cleaning", cleaningRows, index, e)}
                          onTouchStart={(e) => startDrag("cleaning", cleaningRows, index, e)}
                          title="누른 채로 위/아래로 끌어 순서 변경"
                        >
                          ⠿
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pmt-summary-cards">
              <div className="pmt-summary-card">
                <div className="pmt-summary-label">청소비 합계</div>
                <div className="pmt-summary-value">
                  {fmtWon(summary10.cleaningFeeSum)}
                </div>
              </div>
              <div className="pmt-summary-card">
                <div className="pmt-summary-label">봉투/스티커 합계</div>
                <div className="pmt-summary-value">
                  {fmtWon(summary10.envelopeFeeSum)}
                </div>
              </div>
              <div className="pmt-summary-card pmt-summary-card--accent">
                <div className="pmt-summary-label">표A 금액합계</div>
                <div className="pmt-summary-value">
                  {fmtWon(summary10.cleaningAmountSum)}
                </div>
              </div>
            </div>

            <div className="pmt-section-title pmt-section-title-spaced">
              직원 월급 (표B)
            </div>
            <div className="pmt-table-wrap">
              <table className="pmt-table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>구분</th>
                    <th style={{ width: 130 }}>직원명</th>
                    <th style={{ width: 90 }}>은행</th>
                    <th style={{ width: 170 }}>계좌</th>
                    <th style={{ width: 110 }}>월급</th>
                    <th style={{ width: 110 }}>수당</th>
                    <th style={{ width: 110 }}>금액</th>
                    <th style={{ width: 110 }}>전월입금액</th>
                    <th style={{ width: 80 }}>지급완료</th>
                    <th style={{ width: 108 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="pmt-empty">
                        등록된 직원이 없습니다. "지급 대상 관리"에서 추가해 주세요.
                      </td>
                    </tr>
                  )}
                  {salaryRows.map((row, index) => {
                    const disp = getPayeeDisplay(row);
                    const isExcluded = !!row.excluded;
                    return (
                    <tr
                      key={row.id}
                      className={[
                        isExcluded ? "pmt-row-excluded" : "",
                        dragActivePayeeId === row.payeeId ? "pmt-row-dragging" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td>월급</td>
                      <td className="pmt-td-left">{disp.name}</td>
                      <td>{disp.bank || "-"}</td>
                      <td>{disp.account || "-"}</td>
                      <td>
                        <input
                          type="text"
                          className="pmt-table-input"
                          value={fmtComma(row.salary)}
                          disabled={isExcluded}
                          onChange={(e) =>
                            handleSalaryChange(row, "salary", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="pmt-table-input"
                          value={fmtComma(row.allowance)}
                          disabled={isExcluded}
                          onChange={(e) =>
                            handleSalaryChange(row, "allowance", e.target.value)
                          }
                        />
                      </td>
                      <td className="pmt-td-amount">{fmtComma(row.amount)}</td>
                      <td className="pmt-td-muted">{fmtComma(row.prevAmount)}</td>
                      <td className="pmt-td-center">
                        <label className="pmt-switch pmt-switch-sm">
                          <input
                            type="checkbox"
                            checked={!!row.paid}
                            disabled={isExcluded}
                            onChange={(e) => saveRecord(row.id, { paid: e.target.checked })}
                          />
                          <span className="pmt-switch-track">
                            <span className="pmt-switch-thumb" />
                          </span>
                        </label>
                      </td>
                      <td className="pmt-td-center pmt-td-manage">
                        <button
                          type="button"
                          className={isExcluded ? "pmt-row-restore" : "pmt-row-del"}
                          onClick={() => handleToggleExclude(row)}
                        >
                          {isExcluded ? "↩ 포함" : "🚫 제외"}
                        </button>
                        <button
                          type="button"
                          className="pmt-row-drag"
                          onMouseDown={(e) => startDrag("salary", salaryRows, index, e)}
                          onTouchStart={(e) => startDrag("salary", salaryRows, index, e)}
                          title="누른 채로 위/아래로 끌어 순서 변경"
                        >
                          ⠿
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pmt-summary-cards">
              <div className="pmt-summary-card">
                <div className="pmt-summary-label">월급 합계</div>
                <div className="pmt-summary-value">
                  {fmtWon(summary10.salaryAmountSum)}
                </div>
              </div>
              <div className="pmt-summary-card pmt-summary-card--accent">
                <div className="pmt-summary-label">총 지출액 (표A+표B)</div>
                <div className="pmt-summary-value">{fmtWon(summary10.total)}</div>
              </div>
            </div>
          </>
        )}

        {/* ===== 말일 화면 ===== */}
        {payType === "말일" && (
          <>
            {/* ✅ [이동+고정] "이번 달 총액/지급완료 금액/미지급 건수" 박스를
                표 위쪽으로 옮기고, 표를 내부 스크롤(아래 pmt-table-wrap--scroll)
                되도록 만들어 박스가 스크롤 범위 밖에 있게 했습니다. 표 안에서
                아무리 아래로 스크롤해도 이 박스는 그 스크롤 영역 바깥에 있으므로
                움직이지 않습니다. 혹시 페이지 자체가 길어져 화면 스크롤이 되는
                경우까지 대비해 sticky도 함께 걸어 이중으로 고정했습니다. */}
            <div className="pmt-summary-cards pmt-summary-cards--sticky">
              <div className="pmt-summary-card pmt-summary-card--accent">
                <div className="pmt-summary-label">이번 달 총액</div>
                <div className="pmt-summary-value">{fmtWon(summary30.total)}</div>
              </div>
              <div className="pmt-summary-card">
                <div className="pmt-summary-label">지급완료 금액</div>
                <div className="pmt-summary-value">{fmtWon(summary30.paidTotal)}</div>
              </div>
              <div className="pmt-summary-card">
                <div className="pmt-summary-label">미지급 건수</div>
                <div className="pmt-summary-value">{summary30.unpaidCount}건</div>
              </div>
            </div>

            <div className="pmt-table-wrap pmt-table-wrap--scroll">
              <table className="pmt-table">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>구분</th>
                    <th style={{ width: 150 }}>업체</th>
                    <th style={{ width: 360 }}>내용</th>
                    <th style={{ width: 90 }}>은행</th>
                    <th style={{ width: 170 }}>계좌</th>
                    <th style={{ width: 120 }}>금액</th>
                    <th style={{ width: 140 }}>비고</th>
                    <th style={{ width: 110 }}>납부상태</th>
                    <th style={{ width: 108 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRecords.length === 0 && (
                    <tr>
                      <td colSpan={9} className="pmt-empty">
                        등록된 지급 대상이 없습니다. "지급 대상 관리"에서 추가해
                        주세요.
                      </td>
                    </tr>
                  )}
                  {visibleRecords.map((row, index) => {
                    const disp = getPayeeDisplay(row);
                    const isExcluded = !!row.excluded;
                    // ✅ "내용" 열은 [미납 부분] + [납부예정/납부완료 부분] 두 파트를
                    //    줄바꿈된 배지 2개로 나눠서 보여줍니다. "금액" 열은
                    //    뒤쪽(cycle) 파트의 금액과 항상 일치합니다.
                    const unpaid = getRowUnpaidInfo(row);
                    const cycle = getRowCycleInfo(row);
                    const isAllPaid =
                      row.hasBuildings && unpaid.count === 0 && cycle.count === 0;

                    return (
                      <tr
                        key={row.id}
                        className={[
                          isExcluded ? "pmt-row-excluded" : "",
                          dragActivePayeeId === row.payeeId ? "pmt-row-dragging" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <td>{disp.category || "-"}</td>
                        <td
                          className={`pmt-td-company ${
                            row.hasBuildings ? "pmt-td-clickable" : ""
                          }`}
                          onClick={() => row.hasBuildings && setBuildingListRecord(row)}
                          title={row.hasBuildings ? "건물별 지급현황 보기" : undefined}
                        >
                          {disp.name}
                        </td>
                        <td className="pmt-td-left">
                          {row.hasBuildings ? (
                            <button
                              type="button"
                              className="pmt-unpaid-btn"
                              onClick={() => setBuildingListRecord(row)}
                              title="건물별 지급현황 보기"
                            >
                              {isAllPaid ? (
                                <span className="pmt-content-line pmt-content-line--allpaid">
                                  ✅ 전체 완납
                                </span>
                              ) : (
                                <>
                                  <span className="pmt-content-line pmt-content-line--unpaid">
                                    {unpaid.count > 0
                                      ? `🔴 미납 ${unpaid.count}건 · ${fmtComma(
                                          unpaid.amount
                                        )}원`
                                      : "미납없음"}
                                  </span>
                                  <span
                                    className={`pmt-content-line pmt-content-line--cycle ${
                                      row.paid ? "is-done" : "is-scheduled"
                                    }`}
                                  >
                                    {row.paid
                                      ? `🟢 납부완료 ${cycle.count}건 · ${fmtComma(
                                          cycle.amount
                                        )}원`
                                      : `🔵 납부예정 ${cycle.count}건 · ${fmtComma(
                                          cycle.amount
                                        )}원`}
                                  </span>
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="pmt-td-muted">-</span>
                          )}
                        </td>
                        <td>{disp.bank || "-"}</td>
                        <td>{disp.account || "-"}</td>
                        <td>
                          {row.hasBuildings ? (
                            <span className="pmt-td-amount">{fmtComma(cycle.amount)}</span>
                          ) : (
                            <input
                              type="text"
                              className="pmt-table-input"
                              value={fmtComma(row.amount)}
                              disabled={isExcluded}
                              onChange={(e) =>
                                saveRecord(row.id, { amount: parseNumber(e.target.value) })
                              }
                            />
                          )}
                        </td>
                        <td>
                          <input
                            type="text"
                            className="pmt-table-input pmt-table-input-left"
                            value={row.note || ""}
                            disabled={isExcluded}
                            onChange={(e) =>
                              saveRecord(row.id, { note: e.target.value })
                            }
                          />
                        </td>
                        <td className="pmt-td-center">
                          <select
                            className={`pmt-status-select pmt-input-select ${
                              row.paid ? "is-done" : "is-scheduled"
                            }`}
                            value={row.paid ? "완료" : "예정"}
                            disabled={isExcluded}
                            onChange={(e) =>
                              handlePaymentStatusChange(row, e.target.value === "완료")
                            }
                          >
                            <option value="예정">납부예정</option>
                            <option value="완료">납부완료</option>
                          </select>
                        </td>
                        <td className="pmt-td-center pmt-td-manage">
                          <button
                            type="button"
                            className={isExcluded ? "pmt-row-restore" : "pmt-row-del"}
                            onClick={() => handleToggleExclude(row)}
                          >
                            {isExcluded ? "↩ 포함" : "🚫 제외"}
                          </button>
                          <button
                            type="button"
                            className="pmt-row-drag"
                            onMouseDown={(e) => startDrag("majil", visibleRecords, index, e)}
                            onTouchStart={(e) => startDrag("majil", visibleRecords, index, e)}
                            title="누른 채로 위/아래로 끌어 순서 변경"
                          >
                            ⠿
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <CategoryManagerModal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        payType={payType}
      />
      <PayeeManagerModal
        open={payeeModalOpen}
        onClose={() => setPayeeModalOpen(false)}
        payType={payType}
        categories={categories}
        payees={payees}
      />
      <BuildingListModal
        open={!!buildingListRecord}
        onClose={() => setBuildingListRecord(null)}
        record={buildingListRecord}
      />
    </div>
  );
}
