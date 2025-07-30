// src/UserRegisterPage.js
import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import "./UserRegisterPage.css";

export default function UserRegisterPage({ employeeId }) {
  const [id, setId] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [employeeList, setEmployeeList] = useState([]);
  const [editMode, setEditMode] = useState(null);

  const getCurrentId = () => {
    return id && id.trim() ? id : employeeId;
  };

  const fetchEmployees = async (targetId) => {
    if (!targetId) return;
    try {
      const ref = doc(db, "users", targetId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        const list = (data.employeeNos || []).map((no) => ({
          no,
          name: data.employeeNames?.[no] || "",
          pw: data.passwords?.[no] || "",
        }));
        setEmployeeList(list);
        setMessage("");
      } else {
        setEmployeeList([]);
        setMessage("❌ 해당 아이디는 존재하지 않습니다.");
      }
    } catch (err) {
      console.error("사원 목록 불러오기 오류:", err);
    }
  };

  // 페이지 처음 로딩 시 employeeId 기준으로 무조건 목록 불러오기
  useEffect(() => {
    if (employeeId) {
      setId(employeeId);
      fetchEmployees(employeeId);
    }
  }, [employeeId]);

  // id 입력 변경 시 목록 업데이트
  useEffect(() => {
    const timeout = setTimeout(() => {
      const targetId = getCurrentId();
      if (targetId) {
        fetchEmployees(targetId);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [id]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!(getCurrentId() && employeeNo && employeeName && password)) {
      setMessage("❌ 모든 항목을 입력해주세요.");
      return;
    }

    try {
      const userRef = doc(db, "users", getCurrentId());
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        setMessage("❌ 해당 아이디는 존재하지 않습니다.");
        return;
      }

      const userData = userSnap.data();
      const { employeeNos = [], employeeNames = {}, passwords = {} } = userData;

      if (employeeNos.includes(employeeNo)) {
        setMessage("❌ 이미 등록된 사원번호입니다.");
        return;
      }

      await updateDoc(userRef, {
        employeeNos: [...employeeNos, employeeNo],
        employeeNames: { ...employeeNames, [employeeNo]: employeeName },
        passwords: { ...passwords, [employeeNo]: password },
      });

      setMessage("✅ 등록이 완료되었습니다!");
      setEmployeeNo("");
      setEmployeeName("");
      setPassword("");
      fetchEmployees(getCurrentId());
    } catch (err) {
      console.error("등록 오류:", err);
      setMessage("❌ 등록 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async (no) => {
    if (!window.confirm(`사원번호 ${no}을(를) 삭제하시겠습니까?`)) return;

    const userRef = doc(db, "users", getCurrentId());
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const newNos = data.employeeNos.filter((n) => n !== no);
    const newNames = { ...data.employeeNames };
    const newPwds = { ...data.passwords };
    delete newNames[no];
    delete newPwds[no];
    await updateDoc(userRef, {
      employeeNos: newNos,
      employeeNames: newNames,
      passwords: newPwds,
    });
    fetchEmployees(getCurrentId());
  };

  const handleEdit = (no) => {
    setEditMode(no);
    const emp = employeeList.find((e) => e.no === no);
    setEmployeeNo(emp.no);
    setEmployeeName(emp.name);
    setPassword(emp.pw);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    const userRef = doc(db, "users", getCurrentId());
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const newNames = { ...data.employeeNames, [employeeNo]: employeeName };
    const newPwds = { ...data.passwords, [employeeNo]: password };
    await updateDoc(userRef, {
      employeeNames: newNames,
      passwords: newPwds,
    });
    setMessage("✅ 수정이 완료되었습니다!");
    setEditMode(null);
    setEmployeeNo("");
    setEmployeeName("");
    setPassword("");
    fetchEmployees(getCurrentId());
  };

  return (
    <div className="user-register-wrapper">
      <div className="user-register-container">
        <h2>사원코드등록</h2>
        <form onSubmit={editMode ? handleUpdate : handleRegister}>
          <input
            placeholder="아이디"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
          <input
            placeholder="사원번호"
            value={employeeNo}
            onChange={(e) => setEmployeeNo(e.target.value)}
          />
          <input
            placeholder="이름"
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
          />
          <input
            placeholder="비밀번호"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">{editMode ? "수정" : "등록"}</button>
        </form>

        {message && <div className="register-message">{message}</div>}

        <div className="employee-list">
          <h3>등록된 사원</h3>
          {employeeList.length > 0 ? (
            employeeList.map((emp) => (
              <div className="employee-row" key={emp.no}>
                <div className="employee-info">
                  {emp.no} - {emp.name}
                </div>
                <div className="employee-actions">
                  <button
                    className="edit-button"
                    onClick={() => handleEdit(emp.no)}
                  >
                    수정
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => handleDelete(emp.no)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p style={{ color: "#888", fontSize: "14px", marginTop: "10px" }}>
              사원이 없습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
