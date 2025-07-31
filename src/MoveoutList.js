import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc
} from "firebase/firestore";
import MoveoutForm from "./MoveoutForm";
import { FiX, FiArrowLeft } from "react-icons/fi";
import { useNavigate } from "react-router-dom"; // ✅ 추가
import "./MoveoutList.css";

export default function MoveoutList({ employeeId, userId }) {
  const [dataList, setDataList] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [selectedNote, setSelectedNote] = useState("");
  const [selectedDefects, setSelectedDefects] = useState([]);
  const [selectedImages, setSelectedImages] = useState([]);
  const [editItem, setEditItem] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const isMobileDevice = window.innerWidth <= 768;
  const navigate = useNavigate(); // ✅ 추가
  const [expandedId, setExpandedId] = useState(null);

  const tableColumns = [
    "moveOutDate", "name", "roomNumber", "arrears", "currentFee",
    "waterCurr", "waterPrev", "waterCost", "waterUnit", "electricity",
    "gas", "cleaning", "total", "status"
  ];

  useEffect(() => {
    if (!userId) return;

    const q = query(collection(db, "moveoutData"), where("groupId", "==", userId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({
        ...doc.data(),
        docId: doc.id
      }));
      setDataList(list);
    });

    return () => unsubscribe();
  }, [userId]);

  const handleDelete = async (docId) => {
    if (!docId) {
      alert("❌ 삭제할 문서 ID가 없습니다.");
      return;
    }
    if (window.confirm("정말 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, "moveoutData", docId));
        alert("✅ 삭제 완료");
      } catch (error) {
        console.error("❌ 삭제 실패:", error.message);
        alert("삭제 중 오류 발생: " + error.message);
      }
    }
  };

  const handleEdit = (item) => {
    window.lastSavedItem = JSON.stringify(item);
    setEditItem(item);
    setShowPopup(true);
  };

  const handleEditDone = () => {
    setEditItem(null);
    setShowPopup(false);
  };

  const handleSort = (key) => {
    const direction =
      sortConfig.key === key && sortConfig.direction === "asc" ? "desc" : "asc";
    setSortConfig({ key, direction });
  };

  const sortedList = [...dataList].sort((a, b) => {
    if (!sortConfig.key) return 0;
    const valA = (a[sortConfig.key] ?? "").toString();
    const valB = (b[sortConfig.key] ?? "").toString();
    if (!isNaN(Number(valA)) && !isNaN(Number(valB))) {
      return sortConfig.direction === "asc"
        ? Number(valA) - Number(valB)
        : Number(valB) - Number(valA);
    } else {
      return sortConfig.direction === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    }
  });

  const filtered = sortedList.filter((item) => {
    const lower = searchText.toLowerCase();
    const matchText =
      (item.name || "").toLowerCase().includes(lower) ||
      (item.roomNumber || "").toLowerCase().includes(lower) ||
      (item.moveOutDate || "").includes(searchText) ||
      (item.total || "").toString().includes(searchText);
    const matchStatus = statusFilter ? item.status === statusFilter : true;
    return matchText && matchStatus;
  });

  const depositTotal = filtered
    .filter(item => item.status === "입금대기")
    .reduce((sum, item) => sum + (Number(item.total) || 0), 0)
    .toLocaleString();

  const getStatusDotColor = (status) => {
    switch (status) {
      case "정산대기": return "gray";
      case "입금대기": return "red";
      case "입금완료": return "limegreen";
      default: return "transparent";
    }
  };
  if (isMobileDevice) {
    return (
      <div className="list-container">
        <button onClick={() => navigate("/main")} className="back-button">
          <FiArrowLeft size={18} color="#ff8c00" /> 뒤로가기
        </button>
        <h2 style={{ textAlign: "center", marginTop: 60 }}>이사정산 조회</h2>
        {filtered.map((item, idx) => (
          <div key={item.docId} className="mobile-item">
            <div className="mobile-row1" onClick={() => setExpandedId(expandedId === item.docId ? null : item.docId)}>
              <div>{idx + 1}</div>
              <div>{item.moveOutDate}</div>
              <div className="status-box">
                <span className="status-dot" style={{ backgroundColor: getStatusDotColor(item.status) }}></span>
                {item.status}
              </div>
            </div>
            <div className="mobile-row2">
              <div>{item.name}</div>
              <div>{item.roomNumber}</div>
              <div>{Number(item.total).toLocaleString()}원</div>
            </div>
            {expandedId === item.docId && (
              <div className="mobile-expand">
                <div className="mobile-icons">
                  <div>하자: <span className={item.defects?.length > 0 ? "dot-green" : "dot-gray"}></span></div>
                  <div>비고: <span className={item.notes?.trim() ? "dot-green" : "dot-gray"}></span></div>
                  <div>사진: <span className={item.images?.length > 0 ? "dot-green" : "dot-gray"}></span></div>
                </div>
                <div className="mobile-buttons">
                  <button disabled>수정</button>
                  <button disabled>삭제</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
    return (
    <div className="list-container">
      <h2>이사정산 조회</h2>
      <div className="top-controls">
        <div className="left-controls">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="status-filter-dropdown"
          >
            <option value="">전체</option>
            <option value="정산대기">정산대기</option>
            <option value="입금대기">입금대기</option>
            <option value="입금완료">입금완료</option>
          </select>
          {statusFilter === "입금대기" && (
            <div className="deposit-total">총액 합계: {depositTotal}원</div>
          )}
        </div>
        <input
          type="text"
          placeholder="빌라명, 호수, 날짜, 총액 검색"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="scroll-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>번호</th>
              {tableColumns.map((key) => (
                <th key={key} onClick={() => handleSort(key)} style={{ cursor: "pointer" }}>
                  {{
                    moveOutDate: "이사날짜",
                    name: "빌라명",
                    roomNumber: "호수",
                    arrears: "미납",
                    currentFee: "당월",
                    waterCurr: "당월지침",
                    waterPrev: "전월지침",
                    waterCost: "수도요금",
                    waterUnit: "단가",
                    electricity: "전기",
                    gas: "가스",
                    cleaning: "청소",
                    total: "총액",
                    status: "진행현황"
                  }[key] || key}
                </th>
              ))}
              <th>하자</th>
              <th>비고</th>
              <th>사진</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => (
              <tr key={`row-${item.docId}`}>
                <td>{i + 1}</td>
                <td>{item.moveOutDate}</td>
                <td>{item.name}</td>
                <td>{item.roomNumber}</td>
                <td>{item.arrears}</td>
                <td>{item.currentFee}</td>
                <td>{item.waterCurr}</td>
                <td>{item.waterPrev}</td>
                <td>{item.waterCost}</td>
                <td>{item.waterUnit}</td>
                <td>{item.electricity}</td>
                <td>{item.gas}</td>
                <td>{item.cleaning}</td>
                <td>{Number(item.total).toLocaleString()}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="status-dot" style={{ backgroundColor: getStatusDotColor(item.status) }} />
                    {item.status}
                  </div>
                </td>
                <td>
                  <button className={item.defects?.length > 0 ? "filled-button" : ""}
                          onClick={() => setSelectedDefects(item.defects || [])}>
                    {item.defects?.length > 0 ? "내용있음" : "없음"}
                  </button>
                </td>
                <td>
                  <button className={item.notes && item.notes.trim() !== "" ? "filled-button" : ""}
                          onClick={() => setSelectedNote(item.notes || "")}>
                    {item.notes && item.notes.trim() !== "" ? "내용있음" : "없음"}
                  </button>
                </td>
                <td>
                  <button className={item.images?.length > 0 ? "filled-button" : ""}
                          onClick={() => setSelectedImages(item.images || [])}>
                    {item.images?.length > 0 ? "사진있음" : "없음"}
                  </button>
                </td>
                <td>
                  <button onClick={() => handleEdit(item)}>수정</button>
                  <button onClick={() => handleDelete(item.docId)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedDefects.length > 0 && (
        <div className="modal-center">
        <div className="modal-content">
          <h4>하자내역</h4>
          <ul>{selectedDefects.map((d, i) => (
            <li key={i}>{d.desc} - {d.amount}원</li>
          ))}</ul>
          <button onClick={() => setSelectedDefects([])}>닫기</button>
        </div>
      </div>
      )}

      {selectedNote && (
        <div className="modal-center">
        <div className="modal-content">
          <h4>비고</h4>
          <p>{selectedNote}</p>
          <button onClick={() => setSelectedNote("")}>닫기</button>
        </div>
      </div>
      )}

      {selectedImages.length > 0 && (
        <div className="modal-center">
        <div className="modal-content">
          <h4>사진</h4>
          {selectedImages.map((url, idx) => (
            <img
              key={url + idx}
              src={url}
              alt={`img-${idx}`}
              style={{ maxWidth: "100%", marginBottom: 8, cursor: "pointer" }}
              onClick={() => window.open(url, "_blank")}
            />
          ))}
          <button onClick={() => setSelectedImages([])}>닫기</button>
        </div>
      </div>
      )}

      {showPopup && editItem && (
  <div
    style={{
      position: "fixed",
      top: "2%",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#fff",
      borderRadius: "12px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      padding: "30px",
      zIndex: 9999,
      maxHeight: "90vh",
      overflowY: "auto",
      width: "calc(100vw - 100px)",
      maxWidth: "1000px"
    }}
  >
    <MoveoutForm
      employeeId={employeeId}
      userId={userId}
      editItem={editItem}
      onDone={handleEditDone}
      showCancel={true}
      isMobile={false}
    />
    <button
      onClick={async () => {
        const saved = JSON.stringify(editItem);
        const current = JSON.stringify(window.editingFormData);
        if (!window.editingFormData || saved === current) {
          setEditItem(null);
          setShowPopup(false);
          return;
        }
        const confirmClose = window.confirm("변경된 내용이 있습니다. 저장하시겠습니까?");
        if (confirmClose) {
          document.querySelector(".save-button")?.click();
        } else {
          setEditItem(null);
          setShowPopup(false);
        }
      }}
      style={{
        position: "absolute",
        top: "10px",
        right: "15px",
        background: "transparent",
        border: "none",
        fontSize: "24px",
        color: "#333",
        cursor: "pointer"
      }}
    >
      <FiX />
    </button>
  </div>  
)}

</div>

);

}
