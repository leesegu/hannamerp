import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  orderBy,
  query,
} from "firebase/firestore";
import "./AccountingSettingsPage.css";
import "remixicon/fonts/remixicon.css";

const s = (v) => String(v ?? "").trim();

export default function AccountingSettingsPage() {
  const [tab, setTab] = useState("methods"); // methods | income | expense
  const [methods, setMethods] = useState([]);
  const [income, setIncome] = useState([]);
  const [expense, setExpense] = useState([]);

  /* 데이터 구독 */
  useEffect(() => {
    const unsub1 = onSnapshot(query(collection(db, "acct_payment_methods"), orderBy("order", "asc")), (snap) => {
      setMethods(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
    });
    const unsub2 = onSnapshot(query(collection(db, "acct_income_main"), orderBy("order", "asc")), (snap) => {
      setIncome(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
    });
    const unsub3 = onSnapshot(query(collection(db, "acct_expense_main"), orderBy("order", "asc")), (snap) => {
      setExpense(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}), subs: d.data()?.subs || [] })));
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  /* CRUD (간단 버전: prompt 이용) */
  const addItem = async (kind) => {
    const name = prompt("이름을 입력하세요");
    if (!s(name)) return;
    if (kind === "methods") {
      await addDoc(collection(db, "acct_payment_methods"), { name, active: true, order: Date.now() });
    }
    if (kind === "income") {
      await addDoc(collection(db, "acct_income_main"), { name, order: Date.now() });
    }
    if (kind === "expense") {
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
    const subs = [...(target.subs || []), name];
    await updateDoc(doc(db, "acct_expense_main", expId), { subs });
  };

  const delSub = async (expId, name) => {
    const target = expense.find((e) => e.id === expId);
    const subs = (target.subs || []).filter((x) => x !== name);
    await updateDoc(doc(db, "acct_expense_main", expId), { subs });
  };

  /* 렌더 */
  const renderTable = () => {
    if (tab === "methods") {
      return (
        <div className="as-card compact">
          <div className="as-head compact">
            <div className="as-title"><i className="ri-bank-card-2-line" /> 결제방법</div>
            <button className="as-btn primary sm" onClick={() => addItem("methods")}>
              <i className="ri-add-line" /> 추가
            </button>
          </div>
          <table className="as-table compact">
            <colgroup>
              <col style={{ width: "70%" }} />
              <col style={{ width: "30%" }} />
            </colgroup>
            <thead><tr><th>이름</th><th>작업</th></tr></thead>
            <tbody>
              {methods.map((m) => (
                <tr key={m.id}>
                  <td className="left">{m.name}</td>
                  <td className="actions">
                    <button className="as-btn xs" onClick={() => editItem("methods", m)} title="수정">
                      <i className="ri-edit-line" />
                    </button>
                    <button className="as-btn xs danger" onClick={() => deleteItem("methods", m.id, m.name)} title="삭제">
                      <i className="ri-delete-bin-line" />
                    </button>
                  </td>
                </tr>
              ))}
              {!methods.length && (
                <tr><td colSpan={2} className="empty">항목이 없습니다. 추가를 눌러 등록하세요.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === "income") {
      return (
        <div className="as-card compact">
          <div className="as-head compact">
            <div className="as-title"><i className="ri-download-2-line" /> 수입 대분류</div>
            <button className="as-btn primary sm" onClick={() => addItem("income")}>
              <i className="ri-add-line" /> 추가
            </button>
          </div>
          <table className="as-table compact">
            <colgroup>
              <col style={{ width: "70%" }} />
              <col style={{ width: "30%" }} />
            </colgroup>
            <thead><tr><th>이름</th><th>작업</th></tr></thead>
            <tbody>
              {income.map((m) => (
                <tr key={m.id}>
                  <td className="left">{m.name}</td>
                  <td className="actions">
                    <button className="as-btn xs" onClick={() => editItem("income", m)} title="수정">
                      <i className="ri-edit-line" />
                    </button>
                    <button className="as-btn xs danger" onClick={() => deleteItem("income", m.id, m.name)} title="삭제">
                      <i className="ri-delete-bin-line" />
                    </button>
                  </td>
                </tr>
              ))}
              {!income.length && (
                <tr><td colSpan={2} className="empty">항목이 없습니다. 추가를 눌러 등록하세요.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === "expense") {
      return (
        <div className="as-card compact">
          <div className="as-head compact">
            <div className="as-title"><i className="ri-upload-2-line" /> 지출 대분류/소분류</div>
            <button className="as-btn primary sm" onClick={() => addItem("expense")}>
              <i className="ri-add-line" /> 대분류 추가
            </button>
          </div>

          <div className="as-expense-list">
            {expense.map((e) => (
              <div key={e.id} className="as-expense-item">
                <div className="exp-row">
                  <div className="exp-name">{e.name}</div>
                  <div className="exp-actions">
                    <button className="as-btn xs" onClick={() => editItem("expense", e)} title="수정">
                      <i className="ri-edit-line" />
                    </button>
                    <button className="as-btn xs danger" onClick={() => deleteItem("expense", e.id, e.name)} title="삭제">
                      <i className="ri-delete-bin-line" />
                    </button>
                    <button className="as-btn xs" onClick={() => addSub(e.id)} title="소분류 추가">
                      <i className="ri-price-tag-3-line" />
                    </button>
                  </div>
                </div>
                <div className="subs">
                  {e.subs?.map((s) => (
                    <span className="sub-chip" key={s}>
                      <i className="ri-price-tag-2-line" />
                      {s}
                      <button className="x" onClick={() => delSub(e.id, s)} title="삭제">×</button>
                    </span>
                  ))}
                  {!e.subs?.length && <span className="sub-empty">소분류 없음</span>}
                </div>
              </div>
            ))}
            {!expense.length && (
              <div className="empty-block">대분류가 없습니다. 대분류 추가를 눌러 등록하세요.</div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="accset-page compact">
      <div className="as-tabs compact">
        <button className={tab === "methods" ? "active" : ""} onClick={() => setTab("methods")} title="결제방법">
          <i className="ri-bank-card-line" />
          <span>결제</span>
        </button>
        <button className={tab === "income" ? "active" : ""} onClick={() => setTab("income")} title="수입 대분류">
          <i className="ri-download-2-line" />
          <span>수입</span>
        </button>
        <button className={tab === "expense" ? "active" : ""} onClick={() => setTab("expense")} title="지출 대분류/소분류">
          <i className="ri-upload-2-line" />
          <span>지출</span>
        </button>
      </div>

      <div className="as-body compact">
        {renderTable()}
      </div>
    </div>
  );
}
