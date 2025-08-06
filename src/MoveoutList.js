import React, { useEffect, useState, useRef  } from "react";
import { sortByTodayFirst } from "./utils/sortByTodayFirst"; // 경로 확인
import { db, storage } from "./firebase"; // ✅ db와 storage 가져오기
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  setDoc,
  deleteField
} from "firebase/firestore";
import MoveoutForm from "./MoveoutForm";
import { FiX, FiArrowLeft } from "react-icons/fi";
import { FaEdit } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import "./MoveoutList.css";
import * as htmlToImage from 'html-to-image';
import "./components/DataTable.css";
import ReceiptTemplate from "./components/ReceiptTemplate";
import "./MoveoutList.mobile.css"; // PC용 CSS는 이미 있으니 이 줄만 추가


const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

export default function MoveoutList({ employeeId, userId }) {
  const [dataList, setDataList] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [selectedNote, setSelectedNote] = useState("");
  const [selectedDefects, setSelectedDefects] = useState([]);
  const [selectedImages, setSelectedImages] = useState([]);
  const [toastVisible, setToastVisible] = useState(false);
  const [showFormPopup, setShowFormPopup] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const isMobileDevice = window.innerWidth <= 768;
  const navigate = useNavigate(); // ✅ 추가
  const [expandedId, setExpandedId] = useState(null);
  const receiptRef = useRef(null); // 캡처할 DOM 참조
  const [currentReceiptItem, setCurrentReceiptItem] = useState(null); // 현재 선택된 항목
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState("");

const handleStatusChange = (e) => {
  setSelectedStatus(e.target.value);
};

const handleDownloadImage = async () => {
  if (!receiptRef.current) return;

    const node = receiptRef.current;
  try {
    const dataUrl = await htmlToImage.toJpeg(node);
    const link = document.createElement("a");
    link.download = "영수증.jpg";
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error("이미지 저장 실패:", error);
  }
};

const waitForReceiptRef = () => {
  return new Promise((resolve, reject) => {
    const maxAttempts = 60; // 3초 정도 (60 * 16ms ≈ 1000ms)
    let attempts = 0;

    const check = () => {
      if (receiptRef.current) {
        resolve(receiptRef.current);
      } else if (attempts < maxAttempts) {
        attempts++;
        requestAnimationFrame(check);
      } else {
        reject(new Error("receiptRef timeout"));
      }
    };

    check();
  });
};


useEffect(() => {
  if (!currentReceiptItem) return;

  const run = async () => {
    try {
      const node = await waitForReceiptRef(); // maxAttempts 동안 기다림
      const blob = await htmlToImage.toBlob(node);
      const file = new File([blob], "receipt.jpg", { type: "image/jpeg" });
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = "receipt.jpg";
      a.click();
      URL.revokeObjectURL(url);
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 2500);
    } catch (err) {
      console.error("❌ 영수증 생성 실패:", err);
    }
  };

  run(); // ✅ 즉시 실행으로 변경
}, [currentReceiptItem]);


  const tableColumns = [
    "moveOutDate", "name", "roomNumber", "arrears", "currentFee",
    "waterCurr", "waterPrev", "waterCost", "waterUnit", "electricity",
    "tvFee", "cleaning", "total", "status"
  ];

  useEffect(() => {
    if (!userId) return;

    const q = query(collection(db, "moveoutData"), where("groupId", "==", userId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
  const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const sorted = sortByTodayFirst(items); // ✅ 오늘 날짜 우선 정렬
  setDataList(sorted);
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

const handleShowReceipt = (item) => {
  setPreviewImage(null);           // 기존 미리보기 제거
  setCurrentReceiptItem(null);     // 먼저 null로 설정해서 동일 항목도 리셋
  setTimeout(() => {
    setCurrentReceiptItem(item);   // 50ms 후 재설정 → useEffect 재실행
  }, 100);
};

const handleMobileReceiptOptions = async (item) => {
  setPreviewImage(null);
  setCurrentReceiptItem(null);  // 리셋
  await new Promise((r) => setTimeout(r, 50));  // 렌더링 대기
  setCurrentReceiptItem(item);  // 렌더링 시작 → 이미지 생성은 useEffect에서 실행됨
};

  const handleEdit = (item) => {
    window.lastSavedItem = JSON.stringify(item);
    setEditItem({ ...item, docId: item.id });
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

  const handleClickReceipt = async (item) => {
  if (isMobileDevice) {
    await handleMobileReceiptOptions(item);
  } else {
    handleShowReceipt(item);
  }
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

const downloadImage = (format) => {
  if (!receiptRef.current || !currentReceiptItem) return;

  // ✅ 파일명 구성: 날짜 + 빌라명 + 호수
  const rawDate = new Date(currentReceiptItem.moveOutDate);
  const yyyy = rawDate.getFullYear();
  const mm = String(rawDate.getMonth() + 1).padStart(2, "0");
  const dd = String(rawDate.getDate()).padStart(2, "0");
  const formattedDate = `${yyyy}${mm}${dd}`;

  const namePart = (currentReceiptItem.name || "").trim();
  const roomPart = (currentReceiptItem.roomNumber || "").trim();
  const fileName = `${formattedDate}${namePart}${roomPart}`;

  htmlToImage.toPng(receiptRef.current).then((dataUrl) => {
    const link = document.createElement("a");

    if (format === "jpg") {
      link.download = `${fileName}.jpg`;  // ✅ 동적 파일명
      link.href = dataUrl;
      link.click();
    } else if (format === "pdf") {
      import("jspdf").then((jsPDF) => {
        const pdf = new jsPDF.jsPDF();
        const imgProps = pdf.getImageProperties(dataUrl);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${fileName}.pdf`);      // ✅ 동적 파일명
      });
    }
  });
};


if (isMobileDevice) {
    return (
<div className="list-container">
<button className="back-icon-button" onClick={() => navigate("/main")}>
  <FiArrowLeft />
</button>

  <div className="mobile-header-wrapper">
    <h2 className="mobile-title">이사정산 조회</h2>

    <div className="mobile-controls">
      <select
        className="status-filter"
        value={selectedStatus}
        onChange={handleStatusChange}
      >
        <option value="">전체</option>
        <option value="정산대기">정산대기</option>
        <option value="입금대기">입금대기</option>
        <option value="입금완료">입금완료</option>
      </select>

      <input
        className="search-input"
        type="text"
        placeholder="검색어 입력"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />
    </div>
  </div>
            
{filtered
  .filter(item => !selectedStatus || item.status === selectedStatus)
  .map((item, idx) => (
    <div key={item.id} className="mobile-item">
    {/* 날짜 + 상태 */}
    <div
      className="info-line top-line"
      onClick={() =>
        setExpandedId(expandedId === item.id ? null : item.id)
      }
    >
      <span>📅 {item.moveOutDate}</span>
      <span className="status">
        <span
          className="status-dot"
          style={{ backgroundColor: getStatusDotColor(item.status) }}
        ></span>
        {item.status}
      </span>
    </div>

    {/* 빌라명 + 호수 + 총액 */}
    <div className="info-line bottom-line">
      <span>🏢 {item.name || "-"}</span>
      <span>🚪 {item.roomNumber || "-"}</span>
      <span>💰 {Number(item.total || 0).toLocaleString()}원</span>
    </div>

    {/* 펼쳐지는 상세 정보 */}
    {expandedId === item.id && (
      <div className="mobile-expand">
        <div className="mobile-icons">
          <div
            className={`icon-badge ${item.defects?.length > 0 ? "has-content" : ""}`}
            onClick={() => setSelectedDefects(item.defects || [])}
          >
            추가내역
          </div>
          <div
            className={`icon-badge ${item.notes?.trim() ? "has-content" : ""}`}
            onClick={() => setSelectedNote(item.notes || "")}
          >
            비고
          </div>
          <div
            className={`icon-badge ${item.images?.length > 0 ? "has-content" : ""}`}
            onClick={() => setSelectedImages(item.images || [])}
          >
            사진
          </div>
        </div>
        <div className="mobile-buttons">
          <button className="edit-btn" onClick={() => handleEdit(item)}>✏️ 수정</button>
          <button className="receipt-btn" onClick={() => handleClickReceipt(item)}>📩 영수증</button>
        </div>
      </div>
    )}
  </div>
))}



        {selectedDefects.length > 0 && (
          <div className="modal-center">
            <div className="modal-content">
              <h4>추가내역</h4>
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
          <div className="modal-center-mobile">
            <div className="form-container">
              <MoveoutForm
                employeeId={employeeId}
                userId={userId}
                editItem={editItem}
                onDone={handleEditDone}
                onCancel={() => {
    setEditItem(null);
    setShowPopup(false);
  }}
                showCancel={true}
                isMobile={true}
              />
              <button className="close-button" onClick={() => {
                const confirmClose = window.confirm("변경사항을 저장하지 않고 닫으시겠습니까?");
                if (confirmClose) {
                  setEditItem(null);
                  setShowPopup(false);
                }
              }}>닫기</button>
            </div>
          </div>
        )}
      </div>
    );
  }


    return (
    <div className="list-container">
      <h2>이사정산 조회</h2>
<div className="top-controls" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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

  {/* 🔽 오른쪽에 검색창 + 등록버튼 나란히 */}
  <div className="right-controls" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
    <button
      className="register-button"
      onClick={() => {
        setEditItem(null);
        setShowPopup(true);
      }}
    >
      <FaEdit style={{ marginRight: 6 }} />
      등록
    </button>
    <input
      type="text"
      placeholder="빌라명, 호수, 날짜, 총액 검색"
      value={searchText}
      onChange={(e) => setSearchText(e.target.value)}
      className="search-input"
    />
  </div>
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
                    tvFee: "TV수신료",
                    cleaning: "청소",
                    total: "총액",
                    status: "진행현황"
                  }[key] || key}
                </th>
              ))}
              <th>추가내역</th>
              <th>비고</th>
              <th>사진</th>
              <th>영수증</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => (
              <tr key={`row-${item.id}`}>
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
                <td>{item.tvFee}</td>
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
  <button
    className={item.images?.length > 0 ? "filled-button" : ""}
    onClick={() => setSelectedImages(item.images || [])}
  >
    {item.images?.length > 0 ? "사진있음" : "없음"}
  </button>
</td>
<td>
<button
  className="blue-button"
  onClick={() => handleShowReceipt(item)}
>
  생성
</button>

</td>
<td>
  <button onClick={() => handleEdit(item)}>수정</button>
  <button onClick={() => handleDelete(item.id)}>삭제</button>
</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedDefects.length > 0 && (
        <div className="modal-center">
        <div className="modal-content">
          <h4>추가내역</h4>
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
      
{showPopup && (
  <div className="backdrop">
    <div className="popup-container">
      <MoveoutForm
        userId={userId}
        employeeId={employeeId}
        editItem={editItem}
        onDone={handleEditDone}
        showCancel={true}
        isMobile={false}
      />

      <button
        onClick={async () => {
          const saved = JSON.stringify(editItem || {});
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
  </div>
)}

      {previewImage && (
        <div className="modal-center">
          <div className="modal-content" style={{ textAlign: "center" }}>
            <h4>영수증 미리보기</h4>
            <img src={previewImage} alt="Receipt Preview" style={{ maxWidth: "100%", maxHeight: "80vh", marginBottom: 12 }} />
            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              <button onClick={() => downloadImage("jpg")}>JPG 저장</button>
              <button onClick={() => downloadImage("pdf")}>PDF 저장</button>
              <button onClick={() => setPreviewImage(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {currentReceiptItem && (
        <div style={{ position: "absolute", top: 0, left: 0, zIndex: -9999, opacity: 0, pointerEvents: "none" }}>
          <ReceiptTemplate item={currentReceiptItem} refProp={receiptRef} />
        </div>
      )}
              {toastVisible && (
          <div style={{
            position: "fixed",
            bottom: "60px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#333",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: "20px",
            fontSize: "14px",
            zIndex: 9999,
            opacity: 0.9
          }}>
            영수증이 다운로드 되었습니다
          </div>
    )}
  </div>
);
}
