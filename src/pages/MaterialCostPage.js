import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import PageTitle from "../components/PageTitle";
import "./MaterialCostPage.css";

const COLLECTION_NAME = "materialCosts";

const emptyForm = {
  date: "",
  worker: "",
  type: "세입자",
  villaName: "",
  roomNo: "",
  content: "",
  amount: "",
  receipt: "제출",
  status: "정산대기",
  note: "",
};

const workerOptions = ["이용진", "이한솔"];
const typeOptions = ["세입자", "건물주", "이사정산", "서비스", "N/1"];
const receiptOptions = ["제출", "미제출", "분실"];
const statusOptions = ["정산대기", "정산완료", "보류"];

const onlyNumber = (v) => String(v ?? "").replace(/[^0-9]/g, "");
const comma = (v) => {
  const n = Number(onlyNumber(v));
  return n ? n.toLocaleString() : "";
};

const yearOptions = Array.from({ length: 11 }, (_, i) => String(2026 + i));

export default function MaterialCostPage() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [showStats, setShowStats] = useState(false);

  const [statsYear, setStatsYear] = useState(() => {
    const y = new Date().getFullYear();
    return y < 2026 || y > 2036 ? "2026" : String(y);
  });
  const [statsMonth, setStatsMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));

  const fieldRefs = useRef([]);
  const monthInputRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, COLLECTION_NAME), orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setRows(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );
    });
    return () => unsub();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const monthOk = !filterMonth || String(r.date || "").startsWith(filterMonth);
      const text = [
        r.date,
        r.worker,
        r.type,
        r.villaName,
        r.roomNo,
        r.content,
        r.amount,
        r.receipt,
        r.status,
        r.note,
      ]
        .join(" ")
        .toLowerCase();

      return monthOk && text.includes(search.toLowerCase());
    });
  }, [rows, filterMonth, search]);

  const unsettledByWorker = useMemo(() => {
    const map = {};
    workerOptions.forEach((w) => {
      map[w] = 0;
    });

    rows.forEach((r) => {
      if (r.status !== "정산완료" && workerOptions.includes(r.worker)) {
        map[r.worker] += Number(r.amount || 0);
      }
    });

    return map;
  }, [rows]);

  const statsMonthKey = `${statsYear}-${statsMonth}`;

  const statsRows = useMemo(() => {
    return rows.filter((r) => String(r.date || "").startsWith(statsMonthKey));
  }, [rows, statsMonthKey]);

  const statsTotalAmount = useMemo(() => {
    return statsRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  }, [statsRows]);

  const daysInStatsMonth = useMemo(() => {
    return new Date(Number(statsYear), Number(statsMonth), 0).getDate();
  }, [statsYear, statsMonth]);

  const stats = useMemo(() => {
    const make = (key) => {
      const map = {};
      statsRows.forEach((r) => {
        const name = r[key] || "미입력";
        if (!map[name]) map[name] = { count: 0, amount: 0 };
        map[name].count += 1;
        map[name].amount += Number(r.amount || 0);
      });
      return Object.entries(map).map(([name, v]) => ({ name, ...v }));
    };

    return {
      worker: make("worker"),
      type: make("type"),
    };
  }, [statsRows]);

  const setFieldRef = (index) => (el) => {
    fieldRefs.current[index] = el;
  };

  const handleEnterNext = (e, index) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const next = fieldRefs.current[index + 1];
    if (next) {
      next.focus();
      if (typeof next.showPicker === "function" && next.type === "date") {
        try {
          next.showPicker();
        } catch (err) {}
      }
    }
  };

  const openDatePicker = (e) => {
    try {
      if (typeof e.currentTarget.showPicker === "function") {
        e.currentTarget.showPicker();
      }
    } catch (err) {}
  };

  const openMonthPicker = () => {
    try {
      if (monthInputRef.current && typeof monthInputRef.current.showPicker === "function") {
        monthInputRef.current.showPicker();
      }
    } catch (err) {}
  };

  const handleChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: key === "amount" ? onlyNumber(value) : value,
    }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.date) return alert("날짜를 입력해주세요.");
    if (!form.worker) return alert("이름을 선택해주세요.");
    if (!form.villaName) return alert("빌라명을 입력해주세요.");
    if (!form.content) return alert("자재명/내용을 입력해주세요.");
    if (!form.amount) return alert("금액을 입력해주세요.");

    const payload = {
      ...form,
      amount: Number(form.amount || 0),
      updatedAt: serverTimestamp(),
    };

    if (editingId) {
      await updateDoc(doc(db, COLLECTION_NAME, editingId), payload);
      alert("수정되었습니다.");
    } else {
      await addDoc(collection(db, COLLECTION_NAME), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      alert("등록되었습니다.");
    }

    resetForm();
  };

  const handleEdit = (row) => {
    setEditingId(row.id);
    setForm({
      date: row.date || "",
      worker: row.worker || "",
      type: row.type || "세입자",
      villaName: row.villaName || "",
      roomNo: row.roomNo || "",
      content: row.content || "",
      amount: String(row.amount || ""),
      receipt: row.receipt || "제출",
      status: row.status || "정산대기",
      note: row.note || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleStatusChange = async (id, status) => {
    await updateDoc(doc(db, COLLECTION_NAME, id), {
      status,
      updatedAt: serverTimestamp(),
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  };

// MaterialCostPage.js에서 handlePrintBlankTable 함수만 아래 코드로 교체하세요.

const handlePrintBlankTable = () => {
  const blankRows = Array.from({ length: 26 })
    .map(
      () => `
      <tr>
        <td></td><td></td><td></td><td></td>
        <td></td><td></td><td></td><td></td>
      </tr>`
    )
    .join("");

  const printWindow = window.open("", "_blank", "width=1400,height=900");
  if (!printWindow) return;

  printWindow.document.write(`
    <!doctype html>
    <html lang="ko">
    <head>
      <meta charset="utf-8" />
      <title>자재비 관리대장 출력</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 2mm;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          width: 297mm;
          height: 210mm;
          margin: 0;
          padding: 0;
          background: white;
          color: #111827;
          font-family: "Pretendard", "Malgun Gothic", sans-serif;
          overflow: hidden;
        }

        body {
          padding: 2mm;
        }

        h1 {
          margin: 0 0 2mm;
          text-align: center;
          font-size: 18px;
          line-height: 1.15;
          font-weight: 900;
        }

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

        th {
          height: 12mm;
          border: 1px solid #111827;
          background: #e5e7eb;
          font-size: 12px;
          font-weight: 900;
          text-align: center;
        }

        td {
          height: 11.7mm;
          border: 1px solid #111827;
        }

        .p-date { width: 11%; }
        .p-worker { width: 9%; }
        .p-type { width: 9%; }
        .p-villa { width: 18%; }
        .p-room { width: 7%; }
        .p-content { width: 28%; }
        .p-amount { width: 10%; }
        .p-receipt { width: 8%; }

        @media print {
          html,
          body {
            width: 297mm;
            height: 210mm;
            overflow: hidden;
          }

          body {
            padding: 1.5mm;
          }

          h1 {
            margin-bottom: 2mm;
            font-size: 18px;
          }

          th {
            height: 7mm;
            font-size: 11.5px;
          }

          td {
            height: 6.6mm;
          }
        }
      </style>
    </head>
    <body>
      <h1>자재비 관리대장</h1>
      <table>
        <colgroup>
          <col class="p-date" />
          <col class="p-worker" />
          <col class="p-type" />
          <col class="p-villa" />
          <col class="p-room" />
          <col class="p-content" />
          <col class="p-amount" />
          <col class="p-receipt" />
        </colgroup>
        <thead>
          <tr>
            <th>날짜</th>
            <th>이름</th>
            <th>구분</th>
            <th>빌라명</th>
            <th>호수</th>
            <th>자재명/내용</th>
            <th>금액</th>
            <th>영수증</th>
          </tr>
        </thead>
        <tbody>
          ${blankRows}
        </tbody>
      </table>
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

  return (
    <div className="material-page">
      <PageTitle title="자재비관리대장" />

      <div className="material-hero">
        <div>
          <h1>자재비 관리대장</h1>
          <p>자재 구매내역을 등록하고 정산상태와 통계를 관리합니다.</p>
        </div>

        <div className="material-worker-summary">
          {workerOptions.map((worker) => (
            <div key={worker}>
              <span>{worker}</span>
              <strong>{unsettledByWorker[worker].toLocaleString()}원</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="material-card material-form-card">
        <div className="material-card-title">
          <h2>{editingId ? "자재비 수정" : "자재비 등록"}</h2>
        </div>

        <div className="material-form-grid">
          <label>
            날짜
            <input
              ref={setFieldRef(0)}
              className="material-date-input"
              type="date"
              value={form.date}
              onClick={openDatePicker}
              onKeyDown={(e) => handleEnterNext(e, 0)}
              onChange={(e) => handleChange("date", e.target.value)}
            />
          </label>

          <label>
            이름
            <select
              ref={setFieldRef(1)}
              value={form.worker}
              onKeyDown={(e) => handleEnterNext(e, 1)}
              onChange={(e) => handleChange("worker", e.target.value)}
            >
              <option value="">선택</option>
              {workerOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>

          <label>
            구분
            <select
              ref={setFieldRef(2)}
              value={form.type}
              onKeyDown={(e) => handleEnterNext(e, 2)}
              onChange={(e) => handleChange("type", e.target.value)}
            >
              {typeOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>

          <label>
            빌라명
            <input
              ref={setFieldRef(3)}
              value={form.villaName}
              onKeyDown={(e) => handleEnterNext(e, 3)}
              onChange={(e) => handleChange("villaName", e.target.value)}
            />
          </label>

          <label>
            호수
            <input
              ref={setFieldRef(4)}
              value={form.roomNo}
              onKeyDown={(e) => handleEnterNext(e, 4)}
              onChange={(e) => handleChange("roomNo", e.target.value)}
            />
          </label>

          <label>
            금액
            <input
              ref={setFieldRef(5)}
              value={comma(form.amount)}
              onKeyDown={(e) => handleEnterNext(e, 5)}
              onChange={(e) => handleChange("amount", e.target.value)}
            />
          </label>

          <label>
            영수증
            <select
              ref={setFieldRef(6)}
              value={form.receipt}
              onKeyDown={(e) => handleEnterNext(e, 6)}
              onChange={(e) => handleChange("receipt", e.target.value)}
            >
              {receiptOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>

          <label>
            정산상태
            <select
              ref={setFieldRef(7)}
              value={form.status}
              onKeyDown={(e) => handleEnterNext(e, 7)}
              onChange={(e) => handleChange("status", e.target.value)}
            >
              {statusOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>

          <label className="content-wide">
            자재명/내용
            <input
              ref={setFieldRef(8)}
              value={form.content}
              onKeyDown={(e) => handleEnterNext(e, 8)}
              onChange={(e) => handleChange("content", e.target.value)}
            />
          </label>

          <label className="note-wide">
            비고
            <input
              ref={setFieldRef(9)}
              value={form.note}
              onKeyDown={(e) => handleEnterNext(e, 9)}
              onChange={(e) => handleChange("note", e.target.value)}
            />
          </label>
        </div>

        <div className="material-actions">
          <button className="material-reset-btn" onClick={resetForm}>
            초기화
          </button>
          <button className="material-save-btn" onClick={handleSave}>
            {editingId ? "수정 저장" : "등록하기"}
          </button>
        </div>
      </div>

      <div className="material-toolbar">
        <div className="material-month-picker" onClick={openMonthPicker}>
          <input
            ref={monthInputRef}
            type="month"
            value={filterMonth}
            onClick={openMonthPicker}
            onChange={(e) => setFilterMonth(e.target.value)}
          />
        </div>

        <input
          className="material-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="날짜, 이름, 구분, 빌라명, 내용 검색"
        />

        <button className="material-stat-btn" onClick={() => setShowStats(true)}>
          통계보기
        </button>

        <button className="material-print-btn" onClick={handlePrintBlankTable}>
          출력하기
        </button>
      </div>

      {showStats && (
        <div className="material-stats-modal">
          <div className="material-stats-backdrop" onClick={() => setShowStats(false)} />
          <div className="material-stats-panel">
            <div className="material-stats-head">
              <div>
                <h2>자재비 통계</h2>
                <p>
                  {statsYear}년 {Number(statsMonth)}월 조회건수 {statsRows.length}건 · 합계금액{" "}
                  {statsTotalAmount.toLocaleString()}원
                </p>
              </div>
              <button onClick={() => setShowStats(false)}>닫기</button>
            </div>

            <div className="material-stats-filter">
              <select value={statsYear} onChange={(e) => setStatsYear(e.target.value)}>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>

              <select value={statsMonth} onChange={(e) => setStatsMonth(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                  <option key={m} value={m}>
                    {Number(m)}월
                  </option>
                ))}
              </select>
            </div>

            <div className="material-day-buttons">
              {Array.from({ length: daysInStatsMonth }, (_, i) => String(i + 1).padStart(2, "0")).map(
                (day) => {
                  const dayKey = `${statsMonthKey}-${day}`;
                  const dayRows = statsRows.filter((r) => r.date === dayKey);
                  const dayAmount = dayRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

                  return (
                    <button key={day} type="button" disabled>
                      <span>{Number(day)}일</span>
                      <b>{dayAmount.toLocaleString()}원</b>
                    </button>
                  );
                }
              )}
            </div>

            <div className="material-stats">
              <StatBox title="이름별 통계" items={stats.worker} />
              <StatBox title="구분별 통계" items={stats.type} />
            </div>
          </div>
        </div>
      )}

      <div className="material-card">
        <div className="material-table-wrap">
          <table className="material-table">
            <colgroup>
              <col className="col-date" />
              <col className="col-worker" />
              <col className="col-type" />
              <col className="col-villa" />
              <col className="col-room" />
              <col className="col-content" />
              <col className="col-amount" />
              <col className="col-receipt" />
              <col className="col-status" />
              <col className="col-note" />
              <col className="col-manage" />
            </colgroup>
            <thead>
              <tr>
                <th>날짜</th>
                <th>이름</th>
                <th>구분</th>
                <th>빌라명</th>
                <th>호수</th>
                <th>자재명/내용</th>
                <th>금액</th>
                <th>영수증</th>
                <th>정산상태</th>
                <th>비고</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="11" className="empty">
                    등록된 자재비 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{r.worker}</td>
                    <td>
                      <span className={`badge type-${r.type}`}>{r.type}</span>
                    </td>
                    <td>{r.villaName}</td>
                    <td>{r.roomNo}</td>
                    <td className="left">{r.content}</td>
                    <td className="money">{Number(r.amount || 0).toLocaleString()}</td>
                    <td>
                      <span className={`receipt-text ${r.receipt}`}>{r.receipt}</span>
                    </td>
                    <td>
                      <select
                        className={`status-select ${r.status}`}
                        value={r.status || "정산대기"}
                        onChange={(e) => handleStatusChange(r.id, e.target.value)}
                      >
                        {statusOptions.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td className="left">{r.note}</td>
                    <td>
                      <div className="row-actions">
                        <button onClick={() => handleEdit(r)}>수정</button>
                        <button className="delete" onClick={() => handleDelete(r.id)}>
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatBox({ title, items }) {
  return (
    <div className="stat-box">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="stat-empty">통계 없음</p>
      ) : (
        items.map((item) => (
          <div className="stat-row" key={item.name}>
            <span>{item.name}</span>
            <b>
              {item.count}건 / {item.amount.toLocaleString()}원
            </b>
          </div>
        ))
      )}
    </div>
  );
}