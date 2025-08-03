// components/MobileMoveoutList.js
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import "./MobileMoveoutList.css";

export default function MobileMoveoutList({ userId, employeeId }) {
  const [moveouts, setMoveouts] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, "moveouts"), where("userId", "==", userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMoveouts(items);
    });

    return () => unsubscribe();
  }, [userId]);

  const handleEdit = (item) => {
    navigate("/mobile-form", { state: { editItem: item } });
  };

  const getStatusColor = (status) => {
    if (status === "입금완료") return "#32CD32";
    if (status === "입금대기") return "#FF4500";
    return "#A9A9A9";
  };

  return (
    <div className="mobile-list-container">
      <div className="top-bar">
        <button className="back-button" onClick={() => navigate("/main")}>
          <FiArrowLeft />
        </button>
        <h2>이사정산 조회</h2>
      </div>

      <ul className="moveout-list">
        {moveouts.map((item, index) => (
          <li key={item.id} className="moveout-item">
            <div className="item-header">
              <span className="date">
                {index + 1}. {item.moveoutDate}
              </span>
              <span
                className="status-dot"
                style={{ backgroundColor: getStatusColor(item.status) }}
              ></span>
            </div>

            <div className="info">
              <div>빌라명: {item.villaName}</div>
              <div>호실: {item.roomNumber}</div>
              <div>총액: {parseInt(item.totalAmount || 0).toLocaleString()}원</div>
            </div>

            <div className="actions">
              <button onClick={() => handleEdit(item)}>수정</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
