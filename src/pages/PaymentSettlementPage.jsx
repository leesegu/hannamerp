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

/* ✅ 구분별 ERP 자동수집 매핑
   여기 등록된 "구분"으로 건물별 계약 관리를 켜면, villas 컬렉션에서
   matchField 값이 업체명과 일치하는 건물을 자동으로 가져옵니다.
   전기안전/소방안전 페이지가 준비되면 이 목록에 필드명만 추가하면 됩니다. */
const AUTO_SOURCE_CONFIG = {
  승강기: { matchField: "elevator", amountField: "elevatorAmount" },
};

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

/* ===== 간단 모달 ===== */
function SimpleModal({ open, title, children, onClose, size = "lg" }) {
  if (!open) return null;
  const panelClass =
    size === "sm"
      ? "pmt-modal-panel pmt-modal-panel--sm"
      : size === "xl"
      ? "pmt-modal-panel pmt-modal-panel--xl"
      : "pmt-modal-panel";
  return (
    <div className="pmt-modal-overlay">
      <div className="pmt-modal-backdrop" onClick={onClose} />
      <div className={panelClass}>
        <div className="pmt-modal-header">
          <h3 className="pmt-modal-title">{title}</h3>
          <button type="button" className="pmt-modal-close" onClick={onClose}>
            ✕
          </button>
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
    <SimpleModal open={open} title={`구분 관리 (${payType})`} onClose={onClose} size="sm">
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
              삭제
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
          추가
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

  useEffect(() => {
    if (!open) return;

    // 새로 등록하는 경우: 건물 목록은 빈 배열에서 시작
    if (!initial?.id) {
      setBuildings([]);
      return;
    }

    // 수정하는 경우, 말일 + 건물계약 대상이면 기존 건물 목록을 불러옴
    if (payType !== "말일") {
      setBuildings([]);
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
          monthlyAmount: fmtComma(d.data().monthlyAmount) || "",
          startYearMonth: d.data().startYearMonth || "",
          villaId: d.data().villaId || null,
        }))
      );
    })();
  }, [open, initial?.id, payType]);

  /* ✅ ERP(villas)에서 이 업체 이름과 일치하는 건물을 자동으로 가져와 병합합니다.
     이미 목록에 있는 건물(villaId로 매칭)은 금액만 최신화하고,
     직접 추가한 건물(villaId 없음)은 그대로 유지합니다. */
  const fetchBuildingsFromErp = async ({ silent = false } = {}) => {
    const cfg = AUTO_SOURCE_CONFIG[form.category];
    if (!cfg) {
      if (!silent) {
        alert(
          `"${form.category || "선택 안 됨"}" 구분은 아직 ERP 자동수집이 연결되어 있지 않습니다.\n건물을 직접 추가해 주세요.`
        );
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
        const merged = snap.docs.map((d) => {
          const v = d.data();
          const old = byVillaId.get(d.id);
          return {
            id: old?.id || `villa_${d.id}`,
            villaId: d.id,
            buildingName: s(v.name) || s(v.code) || "이름없음",
            monthlyAmount: fmtComma(v[cfg.amountField]) || "",
            startYearMonth: old?.startYearMonth || "",
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

  const addBuildingRow = () => {
    setBuildings((prev) => [
      ...prev,
      {
        id: `new_${Date.now()}_${prev.length}`,
        buildingName: "",
        monthlyAmount: "",
        startYearMonth: "",
        villaId: null,
      },
    ]);
  };
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
    e.preventDefault();
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
        const existingSnap = await getDocs(
          collection(db, "paymentPayees", payeeId, "buildings")
        );
        await Promise.all(
          existingSnap.docs.map((d) =>
            deleteDoc(doc(db, "paymentPayees", payeeId, "buildings", d.id))
          )
        );
        await Promise.all(
          buildings
            .filter((b) => s(b.buildingName))
            .map((b) =>
              addDoc(collection(db, "paymentPayees", payeeId, "buildings"), {
                buildingName: s(b.buildingName),
                monthlyAmount: parseNumber(b.monthlyAmount),
                startYearMonth: s(b.startYearMonth),
                villaId: b.villaId || null,
                active: true,
              })
            )
        );
      }

      onSaved?.();
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <SimpleModal
      open={open}
      title={isEdit ? "지급 대상 수정" : "지급 대상 등록"}
      onClose={onClose}
      size="lg"
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
                <button
                  type="button"
                  className="pmt-btn pmt-btn-ghost pmt-btn-sm"
                  onClick={addBuildingRow}
                >
                  + 건물 추가
                </button>
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
                  삭제
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

        <div className="pmt-form-actions">
          <button type="submit" className="pmt-btn pmt-btn-primary">
            저장
          </button>
          <button type="button" className="pmt-btn pmt-btn-ghost" onClick={onClose}>
            닫기
          </button>
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
      >
        <div className="pmt-payee-toolbar">
          <button type="button" className="pmt-btn pmt-btn-primary" onClick={handleAdd}>
            + 새 지급 대상 등록
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
                          수정
                        </button>
                        <button
                          type="button"
                          className="pmt-btn pmt-btn-danger pmt-btn-sm"
                          onClick={() => handleDelete(p)}
                        >
                          삭제
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

/* ===== 건물별 지급현황 모달 (말일, 건물 계약 있는 업체) ===== */
function BuildingStatusModal({ open, onClose, record }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!open || !record) return;
    setRows(
      (record.buildingStatus || []).map((b) => ({
        ...b,
        monthlyAmountText: fmtComma(b.monthlyAmount),
      }))
    );
  }, [open, record]);

  const togglePaid = (idx) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, paid: !r.paid } : r))
    );
  };
  const changeAmount = (idx, val) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx
          ? {
              ...r,
              monthlyAmountText: fmtComma(val),
              monthlyAmount: parseNumber(val),
            }
          : r
      )
    );
  };

  const handleSave = async () => {
    if (!record) return;
    const newBuildingStatus = rows.map((r) => ({
      buildingName: r.buildingName,
      monthlyAmount: parseNumber(r.monthlyAmountText ?? r.monthlyAmount),
      paid: !!r.paid,
      unpaidStreak: r.paid ? 0 : r.unpaidStreak || 1,
      startYearMonth: r.startYearMonth || "",
    }));
    const newAmount = newBuildingStatus.reduce(
      (sum, b) => sum + (b.monthlyAmount || 0),
      0
    );
    const allPaid = newBuildingStatus.every((b) => b.paid);

    try {
      await updateDoc(doc(db, "paymentRecords", record.id), {
        buildingStatus: newBuildingStatus,
        amount: newAmount,
        paid: allPaid,
        updatedAt: serverTimestamp(),
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <SimpleModal
      open={open}
      title={`건물별 지급현황 - ${record?.name || ""}`}
      onClose={onClose}
      size="sm"
    >
      <div className="pmt-building-status-list">
        {rows.length === 0 && (
          <div className="pmt-cat-empty">등록된 건물이 없습니다.</div>
        )}
        {rows.map((r, idx) => (
          <div key={`${r.buildingName}-${idx}`} className="pmt-building-status-row">
            <label className="pmt-checkbox-wrap pmt-building-status-check">
              <input
                type="checkbox"
                checked={!!r.paid}
                onChange={() => togglePaid(idx)}
              />
              <span className="pmt-building-status-name">{r.buildingName}</span>
            </label>
            <input
              type="text"
              className="pmt-input pmt-input-number pmt-building-status-amount"
              value={r.monthlyAmountText ?? fmtComma(r.monthlyAmount)}
              onChange={(e) => changeAmount(idx, e.target.value)}
            />
            {r.startYearMonth && (
              <span className="pmt-start-chip">{ymLabel(r.startYearMonth)}부터</span>
            )}
            {!r.paid && r.unpaidStreak > 0 && (
              <span className="pmt-unpaid-chip">{r.unpaidStreak}개월째 미납</span>
            )}
          </div>
        ))}
      </div>
      <div className="pmt-form-actions">
        <button type="button" className="pmt-btn pmt-btn-primary" onClick={handleSave}>
          저장
        </button>
        <button type="button" className="pmt-btn pmt-btn-ghost" onClick={onClose}>
          닫기
        </button>
      </div>
    </SimpleModal>
  );
}

/* ===== 메인 페이지 ===== */
export default function PaymentSettlementPage() {
  const [payType, setPayType] = useState("10일"); // '10일' | '말일'
  const [yearMonth, setYearMonth] = useState(nowYm());

  const [categories, setCategories] = useState([]);
  const [payees, setPayees] = useState([]);
  const [records, setRecords] = useState([]);

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [payeeModalOpen, setPayeeModalOpen] = useState(false);
  const [buildingModalRecord, setBuildingModalRecord] = useState(null);

  const generatingRef = useRef(false);

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

  /* 🔁 템플릿에는 있는데 이번 달 기록이 없는 대상 → 자동 생성 */
  useEffect(() => {
    if (!payees.length) return;
    if (generatingRef.current) return;

    const activePayees = payees.filter((p) => p.active !== false);
    const existingIds = new Set(records.map((r) => r.payeeId));
    const missing = activePayees.filter((p) => !existingIds.has(p.id));
    if (!missing.length) return;

    generatingRef.current = true;
    (async () => {
      const prevYearMonth = shiftYm(yearMonth, -1);
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
              const buildingsSnap = await getDocs(
                collection(db, "paymentPayees", payee.id, "buildings")
              );
              const prevId = `말일_${prevYearMonth}_${payee.id}`;
              const prevSnap = await getDoc(doc(db, "paymentRecords", prevId));
              const prevMap = new Map();
              if (prevSnap.exists()) {
                (prevSnap.data().buildingStatus || []).forEach((b) =>
                  prevMap.set(b.buildingName, b)
                );
              }
              const buildingStatus = buildingsSnap.docs
                .filter((d) => d.data().active !== false)
                .filter((d) => {
                  // ✅ 부과시작월이 이번 달보다 나중이면 아직 부과 대상이 아니므로 제외
                  const startYm = s(d.data().startYearMonth);
                  return !startYm || startYm <= yearMonth;
                })
                .map((d) => {
                  const bd = d.data();
                  const prev = prevMap.get(bd.buildingName);
                  const prevStreak =
                    prev && !prev.paid ? parseNumber(prev.unpaidStreak) : 0;
                  return {
                    buildingName: s(bd.buildingName),
                    monthlyAmount: parseNumber(bd.monthlyAmount),
                    startYearMonth: s(bd.startYearMonth),
                    paid: false,
                    unpaidStreak: prevStreak + 1,
                  };
                });
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
      generatingRef.current = false;
    })();
  }, [payees, records, payType, yearMonth]);

  /* ===== 표시용 목록 (이번달 제외 처리된 것 제외) ===== */
  const visibleRecords = useMemo(
    () => records.filter((r) => !r.excluded),
    [records]
  );

  const cleaningRows = useMemo(
    () =>
      payType === "10일"
        ? visibleRecords.filter((r) => r.tableGroup !== "월급")
        : [],
    [visibleRecords, payType]
  );
  const salaryRows = useMemo(
    () =>
      payType === "10일"
        ? visibleRecords.filter((r) => r.tableGroup === "월급")
        : [],
    [visibleRecords, payType]
  );

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

  const handleExclude = async (row) => {
    if (
      !window.confirm(
        "이번 달 지급 목록에서 제외할까요?\n(다음 달에는 다시 자동으로 나타납니다)"
      )
    )
      return;
    await saveRecord(row.id, { excluded: true });
  };

  /* ===== 합계 ===== */
  const summary10 = useMemo(() => {
    const cleaningFeeSum = cleaningRows.reduce(
      (s2, r) => s2 + parseNumber(r.cleaningFee),
      0
    );
    const envelopeFeeSum = cleaningRows.reduce(
      (s2, r) => s2 + parseNumber(r.envelopeFee),
      0
    );
    const cleaningAmountSum = cleaningRows.reduce(
      (s2, r) => s2 + parseNumber(r.amount),
      0
    );
    const salaryAmountSum = salaryRows.reduce(
      (s2, r) => s2 + parseNumber(r.amount),
      0
    );
    return {
      cleaningFeeSum,
      envelopeFeeSum,
      cleaningAmountSum,
      salaryAmountSum,
      total: cleaningAmountSum + salaryAmountSum,
    };
  }, [cleaningRows, salaryRows]);

  const summary30 = useMemo(() => {
    const total = visibleRecords.reduce((s2, r) => s2 + parseNumber(r.amount), 0);
    const paidTotal = visibleRecords
      .filter((r) => r.paid)
      .reduce((s2, r) => s2 + parseNumber(r.amount), 0);
    const unpaidCount = visibleRecords.filter((r) => !r.paid).length;
    return { total, paidTotal, unpaidTotal: total - paidTotal, unpaidCount };
  }, [visibleRecords]);

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
              구분 관리
            </button>
            <button
              type="button"
              className="pmt-btn pmt-btn-primary"
              onClick={() => setPayeeModalOpen(true)}
            >
              지급 대상 관리
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
                    <th style={{ width: 70 }}>관리</th>
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
                  {cleaningRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.category || "-"}</td>
                      <td className="pmt-td-left">{row.name}</td>
                      <td>{row.bank || "-"}</td>
                      <td>{row.account || "-"}</td>
                      <td>
                        <input
                          type="text"
                          className="pmt-table-input"
                          value={fmtComma(row.cleaningFee)}
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
                          onChange={(e) => saveRecord(row.id, { note: e.target.value })}
                        />
                      </td>
                      <td className="pmt-td-center">
                        <input
                          type="checkbox"
                          checked={!!row.paid}
                          onChange={(e) => saveRecord(row.id, { paid: e.target.checked })}
                        />
                      </td>
                      <td className="pmt-td-center">
                        <button
                          type="button"
                          className="pmt-row-del"
                          onClick={() => handleExclude(row)}
                        >
                          제외
                        </button>
                      </td>
                    </tr>
                  ))}
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
                    <th style={{ width: 70 }}>관리</th>
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
                  {salaryRows.map((row) => (
                    <tr key={row.id}>
                      <td>월급</td>
                      <td className="pmt-td-left">{row.name}</td>
                      <td>{row.bank || "-"}</td>
                      <td>{row.account || "-"}</td>
                      <td>
                        <input
                          type="text"
                          className="pmt-table-input"
                          value={fmtComma(row.salary)}
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
                          onChange={(e) =>
                            handleSalaryChange(row, "allowance", e.target.value)
                          }
                        />
                      </td>
                      <td className="pmt-td-amount">{fmtComma(row.amount)}</td>
                      <td className="pmt-td-muted">{fmtComma(row.prevAmount)}</td>
                      <td className="pmt-td-center">
                        <input
                          type="checkbox"
                          checked={!!row.paid}
                          onChange={(e) => saveRecord(row.id, { paid: e.target.checked })}
                        />
                      </td>
                      <td className="pmt-td-center">
                        <button
                          type="button"
                          className="pmt-row-del"
                          onClick={() => handleExclude(row)}
                        >
                          제외
                        </button>
                      </td>
                    </tr>
                  ))}
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
            <div className="pmt-table-wrap">
              <table className="pmt-table">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>구분</th>
                    <th style={{ width: 150 }}>업체</th>
                    <th style={{ width: 180 }}>미납내용</th>
                    <th style={{ width: 90 }}>은행</th>
                    <th style={{ width: 170 }}>계좌</th>
                    <th style={{ width: 120 }}>금액</th>
                    <th style={{ width: 140 }}>비고</th>
                    <th style={{ width: 80 }}>지급완료</th>
                    <th style={{ width: 70 }}>관리</th>
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
                  {visibleRecords.map((row) => {
                    const unpaidBuildings = (row.buildingStatus || []).filter(
                      (b) => !b.paid
                    );
                    return (
                      <tr key={row.id}>
                        <td
                          className={row.hasBuildings ? "pmt-td-clickable" : ""}
                          onClick={() => row.hasBuildings && setBuildingModalRecord(row)}
                          title={row.hasBuildings ? "건물별 계약 현황 보기" : undefined}
                        >
                          {row.category || "-"}
                        </td>
                        <td
                          className={`pmt-td-left ${
                            row.hasBuildings ? "pmt-td-clickable" : ""
                          }`}
                          onClick={() => row.hasBuildings && setBuildingModalRecord(row)}
                          title={row.hasBuildings ? "건물별 계약 현황 보기" : undefined}
                        >
                          {row.name}
                        </td>
                        <td className="pmt-td-left">
                          {row.hasBuildings ? (
                            <button
                              type="button"
                              className={`pmt-unpaid-btn ${
                                unpaidBuildings.length ? "has-unpaid" : ""
                              }`}
                              onClick={() => setBuildingModalRecord(row)}
                            >
                              {unpaidBuildings.length
                                ? `${unpaidBuildings.length}개 건물 미납`
                                : "전체 완납"}
                            </button>
                          ) : (
                            <span className="pmt-td-muted">-</span>
                          )}
                        </td>
                        <td>{row.bank || "-"}</td>
                        <td>{row.account || "-"}</td>
                        <td>
                          {row.hasBuildings ? (
                            <span className="pmt-td-amount">{fmtComma(row.amount)}</span>
                          ) : (
                            <input
                              type="text"
                              className="pmt-table-input"
                              value={fmtComma(row.amount)}
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
                            onChange={(e) =>
                              saveRecord(row.id, { note: e.target.value })
                            }
                          />
                        </td>
                        <td className="pmt-td-center">
                          {row.hasBuildings ? (
                            <span
                              className={`pmt-active-badge ${
                                row.paid ? "is-on" : "is-off"
                              }`}
                            >
                              {row.paid ? "완납" : "미납"}
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={!!row.paid}
                              onChange={(e) =>
                                saveRecord(row.id, { paid: e.target.checked })
                              }
                            />
                          )}
                        </td>
                        <td className="pmt-td-center">
                          <button
                            type="button"
                            className="pmt-row-del"
                            onClick={() => handleExclude(row)}
                          >
                            제외
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pmt-summary-cards">
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
      <BuildingStatusModal
        open={!!buildingModalRecord}
        onClose={() => setBuildingModalRecord(null)}
        record={buildingModalRecord}
      />
    </div>
  );
}
