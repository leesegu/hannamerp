// src/pages/VendorRegisterPage.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { db } from "../firebase";
import {
  getDoc, doc, setDoc,
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, orderBy, query,
} from "firebase/firestore";
import PageTitle from "../components/PageTitle";
import "remixicon/fonts/remixicon.css";
import "./VendorRegisterPage.css"; // ✅ 디자인 분리

/* ────────────────────────────────────────────────────────────────────
   공통 유틸
   ──────────────────────────────────────────────────────────────────── */
const s = (v) => String(v ?? "").trim();

/* ────────────────────────────────────────────────────────────────────
   재사용 가능한 편집 테이블 (거래처/입금자 등 카테고리-목록 형태)
   ──────────────────────────────────────────────────────────────────── */
function EditableCategoryTable({ collectionName, categories = [], onReadyChange }) {
  const safeCategories = useMemo(() => (Array.isArray(categories) ? categories : []), [categories]);
  const [data, setData] = useState(() =>
    Object.fromEntries(safeCategories.map((cat) => [cat, [""]]))
  );
  const [loading, setLoading] = useState(true);

  const onReadyRef = useRef(onReadyChange);
  useEffect(() => { onReadyRef.current = onReadyChange; }, [onReadyChange]);

  useEffect(() => {
    setData(Object.fromEntries(safeCategories.map((cat) => [cat, [""]])));
  }, [safeCategories]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const newData = {};
        for (const category of safeCategories) {
          const snap = await getDoc(doc(db, collectionName, category));
          if (snap.exists()) {
            const arr = snap.data()?.items;
            // 🔧 오타 수정: ["") → [""]
            newData[category] = Array.isArray(arr) && arr.length ? arr : [""];
          } else {
            newData[category] = [""];
          }
        }
        if (!mounted) return;
        setData(newData);
      } finally {
        if (mounted) {
          setLoading(false);
          onReadyRef.current?.(true);
        }
      }
    })();
    return () => { mounted = false; };
  }, [collectionName, safeCategories]);

  const handleChange = (category, index, value) => {
    setData((prev) => {
      const next = { ...prev };
      const list = Array.isArray(next[category]) ? [...next[category]] : [""];
      list[index] = value;
      next[category] = list;
      return next;
    });
  };

  const handleAdd = (category) => {
    setData((prev) => {
      const next = { ...prev };
      const list = Array.isArray(next[category]) ? next[category] : [""];
      next[category] = [...list, ""];
      return next;
    });
  };

  const handleDelete = (category, index) => {
    const target = (data?.[category]?.[index] ?? "").trim();
    if (!window.confirm(`삭제하시겠어요?\n${target ? `- 항목: ${target}` : ""}`)) return;
    setData((prev) => {
      const next = { ...prev };
      const list = (prev?.[category] || []).filter((_, i) => i !== index);
      next[category] = list.length ? list : [""];
      return next;
    });
  };

  const save = async () => {
    for (const category of safeCategories) {
      const raw = data?.[category] || [""];
      const cleanedItems = raw.map((item) => (item || "").trim()).filter((item) => item !== "");
      await setDoc(doc(db, collectionName, category), {
        items: cleanedItems.length ? cleanedItems : [""],
      });
    }
  };

  useEffect(() => {
    if (!loading) onReadyRef.current?.(true, save);
  }, [loading, data]);

  if (loading) {
    return <div className="w-full min-h-[30vh] flex items-center justify-center text-gray-500">불러오는 중...</div>;
  }
  if (!safeCategories.length) {
    return <div className="w-full min-h-[30vh] flex items-center justify-center text-gray-400">설정할 항목이 없습니다.</div>;
  }

  return (
    <div className="overflow-x-auto vrp-card">
      <table className="w-full min-w-[1000px] border text-sm text-center vrp-table">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            {safeCategories.map((cat) => (
              <th key={cat} className="border px-3 py-2 whitespace-nowrap align-top">
                <div className="flex justify-center items-center gap-2">
                  {cat}
                  <button
                    onClick={() => handleAdd(cat)}
                    className="text-xs px-2 py-0.5 border rounded hover:bg-gray-200"
                    title="행 추가"
                  >
                    +
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {safeCategories.map((cat) => (
              <td key={cat} className="border px-2 py-2 align-top">
                <div className="flex flex-col gap-1">
                  {(data?.[cat] || [""]).map((value, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <input
                        value={value}
                        onChange={(e) => handleChange(cat, idx, e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm"
                        placeholder={cat}
                      />
                      {(data?.[cat]?.length || 0) > 1 && (
                        <button
                          onClick={() => handleDelete(cat, idx)}
                          className="text-red-500 text-xs hover:underline"
                          title="삭제"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   관리비회계 설정 패널 (결제/수입/지출 탭을 내부에 구현)
   ──────────────────────────────────────────────────────────────────── */
function AccountingSettingsPanel() {
  const [tab, setTab] = useState("methods"); // methods | income | expense
  const [methods, setMethods] = useState([]);
  const [income, setIncome] = useState([]);
  const [expense, setExpense] = useState([]);

  // 구독
  useEffect(() => {
    const unsub1 = onSnapshot(
      query(collection(db, "acct_payment_methods"), orderBy("order", "asc")),
      (snap) => setMethods(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })))
    );
    const unsub2 = onSnapshot(
      query(collection(db, "acct_income_main"), orderBy("order", "asc")),
      (snap) => setIncome(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })))
    );
    const unsub3 = onSnapshot(
      query(collection(db, "acct_expense_main"), orderBy("order", "asc")),
      (snap) =>
        setExpense(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}), subs: d.data()?.subs || [] })))
    );
    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  // CRUD
  const addItem = async (kind) => {
    const name = prompt("이름을 입력하세요");
    if (!s(name)) return;
    if (kind === "methods") {
      await addDoc(collection(db, "acct_payment_methods"), { name, active: true, order: Date.now() });
    } else if (kind === "income") {
      await addDoc(collection(db, "acct_income_main"), { name, order: Date.now() });
    } else if (kind === "expense") {
      await addDoc(collection(db, "acct_expense_main"), { name, subs: [], order: Date.now() });
    }
  };

  const editItem = async (kind, item) => {
    const name = prompt("새 이름을 입력하세요", item.name);
    if (!s(name)) return;
    if (kind === "methods") await updateDoc(doc(db, "acct_payment_methods", item.id), { name });
    if (kind === "income") await updateDoc(doc(db, "acct_income_main", item.id), { name });
    if (kind === "expense") await updateDoc(doc(db, "acct_expense_main", item.id), { name });
  };

  const deleteItem = async (kind, id, name) => {
    if (!window.confirm(`삭제하시겠습니까?\n- ${name}`)) return;
    if (kind === "methods") await deleteDoc(doc(db, "acct_payment_methods", id));
    if (kind === "income") await deleteDoc(doc(db, "acct_income_main", id));
    if (kind === "expense") await deleteDoc(doc(db, "acct_expense_main", id));
  };

  const addSub = async (expId) => {
    const name = prompt("소분류 이름을 입력하세요");
    if (!s(name)) return;
    const target = expense.find((e) => e.id === expId);
    const subs = [...(target?.subs || []), name];
    await updateDoc(doc(db, "acct_expense_main", expId), { subs });
  };

  const delSub = async (expId, name) => {
    const target = expense.find((e) => e.id === expId);
    const subs = (target?.subs || []).filter((x) => x !== name);
    await updateDoc(doc(db, "acct_expense_main", expId), { subs });
  };

  // 뷰: 탭 공통 헤더(스타일 클래스만 추가)
  const TabHeader = ({ icon, title, onAdd, addLabel = "추가" }) => (
    <div className="flex items-center justify-between mb-3 vrp-subheader">
      <div className="flex items-center gap-2 font-extrabold text-sm">
        <i className={`${icon} text-indigo-500`} />
        {title}
      </div>
      <button
        className="px-3 py-1.5 text-[12px] rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition"
        onClick={onAdd}
      >
        <i className="ri-add-line mr-1" />
        {addLabel}
      </button>
    </div>
  );

  const MethodsTab = () => (
    <div className="bg-white border rounded-xl p-3 shadow-sm vrp-card">
      <TabHeader icon="ri-bank-card-2-line" title="결제방법" onAdd={() => addItem("methods")} />
      <div className="overflow-hidden border rounded-lg">
        <table className="w-full text-[12px] vrp-table">
          <colgroup>
            <col style={{ width: "70%" }} />
            <col style={{ width: "30%" }} />
          </colgroup>
          <thead className="bg-indigo-50 text-indigo-900">
            <tr className="border-b">
              <th className="px-2 py-2 text-left">이름</th>
              <th className="px-2 py-2">작업</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.id} className="border-b last:border-b-0">
                <td className="px-2 py-2 text-left">{m.name}</td>
                <td className="px-2 py-2 text-center">
                  <div className="inline-flex gap-1">
                    <button
                      className="px-2 py-1 rounded-md border hover:bg-gray-50"
                      onClick={() => editItem("methods", m)}
                      title="수정"
                    >
                      <i className="ri-edit-line" />
                    </button>
                    <button
                      className="px-2 py-1 rounded-md border bg-rose-600 text-white hover:bg-rose-700"
                      onClick={() => deleteItem("methods", m.id, m.name)}
                      title="삭제"
                    >
                      <i className="ri-delete-bin-line" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!methods.length && (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-gray-400">
                  항목이 없습니다. 추가를 눌러 등록하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const IncomeTab = () => (
    <div className="bg-white border rounded-xl p-3 shadow-sm vrp-card">
      <TabHeader icon="ri-download-2-line" title="수입 대분류" onAdd={() => addItem("income")} />
      <div className="overflow-hidden border rounded-lg">
        <table className="w-full text-[12px] vrp-table">
          <colgroup>
            <col style={{ width: "70%" }} />
            <col style={{ width: "30%" }} />
          </colgroup>
          <thead className="bg-indigo-50 text-indigo-900">
            <tr className="border-b">
              <th className="px-2 py-2 text-left">이름</th>
              <th className="px-2 py-2">작업</th>
            </tr>
          </thead>
          <tbody>
            {income.map((m) => (
              <tr key={m.id} className="border-b last:border-b-0">
                <td className="px-2 py-2 text-left">{m.name}</td>
                <td className="px-2 py-2 text-center">
                  <div className="inline-flex gap-1">
                    <button
                      className="px-2 py-1 rounded-md border hover:bg-gray-50"
                      onClick={() => editItem("income", m)}
                      title="수정"
                    >
                      <i className="ri-edit-line" />
                    </button>
                    <button
                      className="px-2 py-1 rounded-md border bg-rose-600 text-white hover:bg-rose-700"
                      onClick={() => deleteItem("income", m.id, m.name)}
                      title="삭제"
                    >
                      <i className="ri-delete-bin-line" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!income.length && (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-gray-400">
                  항목이 없습니다. 추가를 눌러 등록하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const ExpenseTab = () => (
    <div className="bg-white border rounded-xl p-3 shadow-sm vrp-card">
      <TabHeader
        icon="ri-upload-2-line"
        title="지출 대분류 / 소분류"
        onAdd={() => addItem("expense")}
        addLabel="대분류 추가"
      />
      <div className="flex flex-col gap-2">
        {expense.map((e) => (
          <div key={e.id} className="border rounded-lg p-3 bg-gradient-to-b from-white to-indigo-50/20 vrp-card--soft">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="font-extrabold text-[13px]">{e.name}</div>
              <div className="flex items-center gap-1">
                <button
                  className="px-2 py-1 rounded-md border hover:bg-gray-50"
                  onClick={() => editItem("expense", e)}
                  title="수정"
                >
                  <i className="ri-edit-line" />
                </button>
                <button
                  className="px-2 py-1 rounded-md border bg-rose-600 text-white hover:bg-rose-700"
                  onClick={() => deleteItem("expense", e.id, e.name)}
                  title="삭제"
                >
                  <i className="ri-delete-bin-line" />
                </button>
                <button
                  className="px-2 py-1 rounded-md border hover:bg-gray-50"
                  onClick={() => addSub(e.id)}
                  title="소분류 추가"
                >
                  <i className="ri-price-tag-3-line" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {e.subs?.map((sname) => (
                <span
                  key={sname}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-full border bg-white shadow-sm"
                >
                  <i className="ri-price-tag-2-line text-indigo-500" />
                  {sname}
                  <button
                    className="ml-1 text-rose-600 hover:underline"
                    onClick={() => delSub(e.id, sname)}
                    title="삭제"
                  >
                    ×
                  </button>
                </span>
              ))}
              {!e.subs?.length && (
                <span className="text-gray-400 text-[11px]">소분류 없음</span>
              )}
            </div>
          </div>
        ))}
        {!expense.length && (
          <div className="border border-dashed rounded-lg p-6 text-center text-gray-400">
            대분류가 없습니다. ‘대분류 추가’를 눌러 등록하세요.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border bg-white/70 backdrop-blur p-3">
      {/* 상단 탭 */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setTab("methods")}
          className={`px-3 py-1.5 rounded-lg text-[12px] border transition ${
            tab === "methods"
              ? "bg-indigo-600 text-white border-indigo-600 shadow"
              : "bg-white hover:bg-indigo-50"
          }`}
          title="결제방법"
        >
          <i className="ri-bank-card-line mr-1" />
          결제
        </button>
        <button
          onClick={() => setTab("income")}
          className={`px-3 py-1.5 rounded-lg text-[12px] border transition ${
            tab === "income"
              ? "bg-indigo-600 text-white border-indigo-600 shadow"
              : "bg-white hover:bg-indigo-50"
          }`}
          title="수입 대분류"
        >
          <i className="ri-download-2-line mr-1" />
          수입
        </button>
        <button
          onClick={() => setTab("expense")}
          className={`px-3 py-1.5 rounded-lg text-[12px] border transition ${
            tab === "expense"
              ? "bg-indigo-600 text-white border-indigo-600 shadow"
              : "bg-white hover:bg-indigo-50"
          }`}
          title="지출 대분류/소분류"
        >
          <i className="ri-upload-2-line mr-1" />
          지출
        </button>
      </div>

      {/* 본문 */}
      <div className="space-y-3">
        {tab === "methods" && <MethodsTab />}
        {tab === "income" && <IncomeTab />}
        {tab === "expense" && <ExpenseTab />}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   메인 페이지 (리뉴얼)
   ──────────────────────────────────────────────────────────────────── */
export default function VendorRegisterPage() {
  // 'villa' | 'service' | 'acct' | null
  const [activePanel, setActivePanel] = useState(null);

  // 저장 버튼 제어
  const [showSave, setShowSave] = useState(false);
  const [saveFn, setSaveFn] = useState(null);

  useEffect(() => {
    // 회계설정 패널은 즉시 저장형이라 '저장' 버튼 숨김
    setShowSave(activePanel === "villa" || activePanel === "service");
    if (activePanel !== "villa" && activePanel !== "service") setSaveFn(null);
  }, [activePanel]);

  const villaCategories = useMemo(
    () => ["통신사", "승강기", "정화조", "소방안전", "전기안전", "건물청소", "CCTV"],
    []
  );
  const serviceCategories = useMemo(() => ["거래처", "입금자"], []);

  const handlePanelReady = useCallback((ready, save) => {
    if (activePanel === "villa" || activePanel === "service") {
      setShowSave(Boolean(ready && save));
      setSaveFn(() => (typeof save === "function" ? save : null));
    }
  }, [activePanel]);

  const onClickSave = async () => {
    if (!saveFn) return;
    try {
      await saveFn();
      alert("✅ 저장이 완료되었습니다!");
    } catch (e) {
      console.error(e);
      alert("❌ 저장 실패");
    }
  };

  const renderPanel = () => {
    if (activePanel === "villa") {
      return (
        <EditableCategoryTable
          key="panel-villa"
          collectionName="vendors"
          categories={villaCategories}
          onReadyChange={handlePanelReady}
        />
      );
    }
    if (activePanel === "service") {
      return (
        <EditableCategoryTable
          key="panel-service"
          collectionName="serviceSettings"
          categories={serviceCategories}
          onReadyChange={handlePanelReady}
        />
      );
    }
    if (activePanel === "acct") {
      // ✅ 내장된 관리비회계 설정 패널
      return <AccountingSettingsPanel />;
    }
    // 초기 화면
    return (
      <div className="w-full min-h-[50vh] flex items-center justify-center text-gray-400">
        좌측 상단 버튼을 눌러 설정을 시작하세요.
      </div>
    );
  };

  return (
    <div className="p-4 vrp">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between gap-4 mb-4 vrp-header">
        <div className="flex items-center gap-3">
          <PageTitle>기초설정</PageTitle>
          <div className="flex items-center gap-2 ml-2 vrp-nav">
            <button
              onClick={() => setActivePanel("villa")}
              className={`vrp-navbtn ${activePanel === "villa" ? "is-active" : ""}`}
              title="빌라정보 설정"
            >
              <i className="ri-building-3-line vrp-navbtn__icon" />
              <span className="vrp-navbtn__label">빌라정보 설정</span>
            </button>
            <button
              onClick={() => setActivePanel("service")}
              className={`vrp-navbtn ${activePanel === "service" ? "is-active" : ""}`}
              title="부가서비스 설정"
            >
              <i className="ri-customer-service-2-line vrp-navbtn__icon" />
              <span className="vrp-navbtn__label">부가서비스 설정</span>
            </button>
            <button
              onClick={() => setActivePanel("acct")}
              className={`vrp-navbtn ${activePanel === "acct" ? "is-active" : ""}`}
              title="관리비회계 설정"
            >
              <i className="ri-bank-card-line vrp-navbtn__icon" />
              <span className="vrp-navbtn__label">관리비회계 설정</span>
            </button>
          </div>
        </div>

        {/* 우측: 저장 버튼(편집 가능한 패널일 때만) */}
        {showSave && (
          <button
            onClick={onClickSave}
            className="vrp-savebtn vrp-savebtn--header"
          >
            <i className="ri-save-3-line" />
            저장
          </button>
        )}
      </div>

      {/* 콘텐츠 영역 */}
      <div className="vrp-body">
        {renderPanel()}
      </div>
    </div>
  );
}
