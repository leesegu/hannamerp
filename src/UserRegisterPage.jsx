// src/UserRegisterPage.js
import React, { useState, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  deleteUser,
} from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import "./UserRegisterPage.css";

const idToEmail = (id, employeeNo) =>
  `${id.trim().toLowerCase()}+${employeeNo.trim()}@hannam-erp.local`;

export default function UserRegisterPage() {
  const [id, setId] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [users, setUsers] = useState([]);
  const [editMode, setEditMode] = useState(null);

  /** ✅ Firestore에서 전체 사용자 목록 불러오기 */
  const fetchUsers = async () => {
    const snap = await getDocs(collection(db, "users"));
    const list = [];
    snap.forEach((docSnap) => {
      list.push({ uid: docSnap.id, ...docSnap.data() });
    });
    setUsers(list);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  /** ✅ 등록 */
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!id || !employeeNo || !employeeName || !password) {
      setMessage("❌ 모든 항목을 입력해주세요.");
      return;
    }

    try {
      const email = idToEmail(id, employeeNo);

      // 1) Auth 사용자 생성
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

      // 2) Firestore users 문서 생성
      await setDoc(doc(db, "users", uid), {
        id,
        employeeNo,
        name: employeeName,
        role: "user",
        isActive: true,
        createdAt: new Date(),
      });

      setMessage("✅ 등록이 완료되었습니다!");
      setId("");
      setEmployeeNo("");
      setEmployeeName("");
      setPassword("");
      fetchUsers();
    } catch (err) {
      console.error("등록 오류:", err);
      setMessage("❌ 등록 중 오류: " + err.message);
    }
  };

  /** ✅ 수정 (이름만 업데이트 예시) */
  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, "users", editMode.uid), {
        name: employeeName,
        updatedAt: new Date(),
      });
      setMessage("✅ 수정 완료!");
      setEditMode(null);
      setEmployeeNo("");
      setEmployeeName("");
      setPassword("");
      fetchUsers();
    } catch (err) {
      console.error("수정 오류:", err);
      setMessage("❌ 수정 중 오류 발생");
    }
  };

  /** ✅ 삭제 */
  const handleDelete = async (user) => {
    if (!window.confirm(`아이디 ${user.id} (사번 ${user.employeeNo}) 삭제?`)) return;
    try {
      // Firestore 문서 삭제
      await deleteDoc(doc(db, "users", user.uid));
      // Auth 사용자 삭제 → 관리자용 Admin SDK에서 하는 게 권장.
      // 클라이언트에서는 현재 로그인된 사용자만 deleteUser 가능.
      setMessage("✅ Firestore 문서 삭제 완료 (Auth 삭제는 서버에서 처리 권장)");
      fetchUsers();
    } catch (err) {
      console.error("삭제 오류:", err);
      setMessage("❌ 삭제 오류: " + err.message);
    }
  };

  return (
    <div className="user-register-wrapper">
      <div className="user-register-container">
        <h2>사원 코드 등록</h2>

        <form onSubmit={editMode ? handleUpdate : handleRegister}>
          <input
            placeholder="아이디"
            value={id}
            onChange={(e) => setId(e.target.value)}
            disabled={!!editMode}
          />
          <input
            placeholder="사번"
            value={employeeNo}
            onChange={(e) => setEmployeeNo(e.target.value)}
            disabled={!!editMode}
          />
          <input
            placeholder="이름"
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
          />
          {!editMode && (
            <input
              placeholder="비밀번호"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          <button type="submit">{editMode ? "수정" : "등록"}</button>
        </form>

        {message && <div className="register-message">{message}</div>}

        <div className="employee-list">
          <h3>등록된 사원</h3>
          {users.length > 0 ? (
            users.map((user) => (
              <div className="employee-row" key={user.uid}>
                <div className="employee-info">
                  {user.id}+{user.employeeNo} - {user.name}
                </div>
                <div className="employee-actions">
                  <button
                    className="edit-button"
                    onClick={() => {
                      setEditMode(user);
                      setId(user.id);
                      setEmployeeNo(user.employeeNo);
                      setEmployeeName(user.name);
                    }}
                  >
                    수정
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => handleDelete(user)}
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
