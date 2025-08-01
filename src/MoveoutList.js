import React, { useEffect, useState, useRef  } from "react";
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
import { useNavigate } from "react-router-dom"; // ✅ 추가
import "./MoveoutList.css";
import * as htmlToImage from 'html-to-image';
import { Timestamp } from "firebase/firestore";


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
  const [editItem, setEditItem] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const isMobileDevice = window.innerWidth <= 768;
  const navigate = useNavigate(); // ✅ 추가
  const [expandedId, setExpandedId] = useState(null);
  const receiptRef = useRef(null); // 캡처할 DOM 참조
  const [currentReceiptItem, setCurrentReceiptItem] = useState(null); // 현재 선택된 항목
  const [previewImage, setPreviewImage] = useState(null);

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

  useEffect(() => {
  if (!currentReceiptItem || !receiptRef.current) return;

  setTimeout(() => {
    htmlToImage.toPng(receiptRef.current)
      .then((dataUrl) => {
        setPreviewImage(dataUrl); // ✅ 팝업으로 띄울 이미지 저장
      })
      .catch((err) => {
        console.error("이미지 생성 실패:", err);
      });
  }, 100);
}, [currentReceiptItem]);

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

const handleShowReceipt = (item) => {
  setPreviewImage(null);           // 기존 미리보기 제거
  setCurrentReceiptItem(null);     // 먼저 null로 설정해서 동일 항목도 리셋
  setTimeout(() => {
    setCurrentReceiptItem(item);   // 50ms 후 재설정 → useEffect 재실행
  }, 50);
};

  const handleEdit = (item) => {
    window.lastSavedItem = JSON.stringify(item);
    setEditItem({ ...item, fromEdit: true });
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
        <button onClick={() => navigate("/main")} className="back-button">
          <FiArrowLeft size={18} color="#ff8c00" /> 뒤로가기
        </button>
        <h2 style={{ textAlign: "center", marginTop: 60 }}>이사정산 조회</h2>

        {filtered.map((item, idx) => (
          <div key={item.docId} className="mobile-item">
            <div
              className="mobile-row1"
              onClick={() => setExpandedId(expandedId === item.docId ? null : item.docId)}
            >
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
                  <div
                    className={`icon-badge ${item.defects?.length > 0 ? "has-content" : ""}`}
                    onClick={() => setSelectedDefects(item.defects || [])}
                  >하자</div>
                  <div
                    className={`icon-badge ${item.notes?.trim() ? "has-content" : ""}`}
                    onClick={() => setSelectedNote(item.notes || "")}
                  >비고</div>
                  <div
                    className={`icon-badge ${item.images?.length > 0 ? "has-content" : ""}`}
                    onClick={() => setSelectedImages(item.images || [])}
                  >사진</div>
                </div>
                <div className="mobile-buttons">
                  <button onClick={() => handleEdit(item)}>수정</button>
                  <button onClick={() => handleShowReceipt(item)}>영수증 전송</button>
                </div>
              </div>
            )}
          </div>
        ))}

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
              <th>영수증</th>
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

{previewImage && (
  <div className="modal-center">
    <div className="modal-content" style={{ textAlign: "center" }}>
      <h4>영수증 미리보기</h4>
      <img
        src={previewImage}
        alt="Receipt Preview"
        style={{ maxWidth: "100%", maxHeight: "80vh", marginBottom: 12 }}
      />
      {isMobileDevice ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a href={previewImage} download="receipt.jpg">이미지 다운로드</a>
          <button onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: '이사정산 영수증',
                text: '영수증을 확인해주세요.',
                url: previewImage
              });
            } else {
              alert("공유 기능을 지원하지 않는 기기입니다.");
            }
          }}>문자 / 카카오톡 공유</button>
          <button onClick={() => setPreviewImage(null)}>닫기</button>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          <button onClick={() => downloadImage("jpg")}>JPG 저장</button>
          <button onClick={() => downloadImage("pdf")}>PDF 저장</button>
          <button onClick={() => setPreviewImage(null)}>닫기</button>
        </div>
      )}
    </div>
  </div>
)}
{currentReceiptItem && (
  <div style={{ position: "absolute", top: 0, left: 0, zIndex: -9999, opacity: 0, pointerEvents: "none" }}>
    <div
      ref={receiptRef}
      style={{
        width: "360px",
        border: "1px solid #ddd",
        padding: "20px",
        background: "#fff",
        fontFamily: "'Noto Sans KR', sans-serif",
        fontSize: "14px"
      }}
    >
<h2 style={{ textAlign: "center", color: "#333" }}>이사 정산 영수증</h2>
<hr />
<p><strong>이사날짜:</strong> {currentReceiptItem.moveOutDate}</p>
<p><strong>빌라명:</strong> {currentReceiptItem.name}</p>
<p><strong>호수:</strong> {currentReceiptItem.roomNumber}</p>

{!!currentReceiptItem.arrears && parseFloat((currentReceiptItem.arrears || "0").toString().replace(/,/g, "")) > 0 && (
  <p><strong>미납관리비:</strong> {parseFloat((currentReceiptItem.arrears || "0").toString().replace(/,/g, "")).toLocaleString()}원</p>
)}

{!!currentReceiptItem.currentFee && parseFloat((currentReceiptItem.currentFee || "0").toString().replace(/,/g, "")) > 0 && (
  <p><strong>당월관리비:</strong> {parseFloat((currentReceiptItem.currentFee || "0").toString().replace(/,/g, "")).toLocaleString()}원</p>
)}

{!!currentReceiptItem.waterCost && parseFloat((currentReceiptItem.waterCost || "0").toString().replace(/,/g, "")) > 0 && (
  <p><strong>수도요금:</strong> {parseFloat((currentReceiptItem.waterCost || "0").toString().replace(/,/g, "")).toLocaleString()}원</p>
)}

{!!currentReceiptItem.electricity && parseFloat((currentReceiptItem.electricity || "0").toString().replace(/,/g, "")) > 0 && (
  <p><strong>전기요금:</strong> {parseFloat((currentReceiptItem.electricity || "0").toString().replace(/,/g, "")).toLocaleString()}원</p>
)}

{!!currentReceiptItem.gas && parseFloat((currentReceiptItem.gas || "0").toString().replace(/,/g, "")) > 0 && (
  <p><strong>가스요금:</strong> {parseFloat((currentReceiptItem.gas || "0").toString().replace(/,/g, "")).toLocaleString()}원</p>
)}

{!!currentReceiptItem.cleaning && parseFloat((currentReceiptItem.cleaning || "0").toString().replace(/,/g, "")) > 0 && (
  <p><strong>청소비용:</strong> {parseFloat((currentReceiptItem.cleaning || "0").toString().replace(/,/g, "")).toLocaleString()}원</p>
)}

{Array.isArray(currentReceiptItem.defects) && currentReceiptItem.defects.length > 0 && (
  <>
    <p><strong>하자내역:</strong></p>
    <ul style={{ paddingLeft: "1.2rem" }}>
      {currentReceiptItem.defects.map((def, i) => (
        <li key={i}>
          {def.desc} - {parseFloat((def.amount || "0").toString().replace(/,/g, "")).toLocaleString()}원
        </li>
      ))}
    </ul>
  </>
)}

<hr />
<p><strong>총 이사정산 금액:</strong> {parseFloat((currentReceiptItem.total || "0").toString().replace(/,/g, "")).toLocaleString()}원</p>
<p style={{ fontSize: "12px", color: "#999", marginTop: "20px" }}>
  ※ 본 영수증은 발급일 기준이며, 내용은 변동될 수 있습니다.
</p>
    </div>
  </div>
)}


</div>

);

}
