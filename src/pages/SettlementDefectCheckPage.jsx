// src/pages/SettlementDefectCheckPage.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import "./SettlementDefectCheckPage.css";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  doc,
} from "firebase/firestore";
import * as htmlToImage from "html-to-image";
import { jsPDF } from "jspdf";

/* ===== 유틸 ===== */
const toNum = (v) =>
  v === "" || v == null ? 0 : Number(String(v).replace(/[,\s]/g, "")) || 0;

const fmtAmount = (val) => {
  const n = toNum(val);
  return n ? n.toLocaleString() : n === 0 ? "0" : "";
};

// 제외 키워드: 이 단어들이 들어간 추가내역은 '하자' 리스트에서 제외
const EXCLUDE_KEYWORDS = [
  "도배",
  "청소",
  "소취",
  "요금",
  "환불",
  "심야",
  "1차",
  "선수금",
];

const containsExcludedKeyword = (text) => {
  const s = String(text || "").trim();
  if (!s) return false;
  return EXCLUDE_KEYWORDS.some((kw) => s.includes(kw));
};

// 날짜 비교용: 문자열/타임스탬프/Date 등 최대한 정규화해서 내림차순 정렬
const toDateValue = (val) => {
  if (!val) return null;

  // Firestore Timestamp
  if (typeof val === "object" && typeof val.toDate === "function") {
    const d = val.toDate();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // Date 객체
  if (val instanceof Date && !isNaN(val)) {
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }

  // 문자열: yyyy-mm-dd, yyyy.mm.dd 등
  const s = String(val).trim();
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (!y || !mo || !d) return null;
  const dd = new Date(y, mo - 1, d);
  return isNaN(dd) ? null : dd;
};

export default function SettlementDefectCheckPage() {
  const [moveouts, setMoveouts] = useState([]);
  const [filterStatus, setFilterStatus] = useState("미결");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("moveDate");
  const [sortDir, setSortDir] = useState("desc");
  const [pdfStatus, setPdfStatus] = useState("");
  const tableRef = useRef(null);

  /* ===== 메모 팝오버 상태 ===== */
  const [memoModalOpen, setMemoModalOpen] = useState(false);
  const [memoTargetRow, setMemoTargetRow] = useState(null);
  const [memoDraft, setMemoDraft] = useState("");

  /* ✅ 메모 팝오버 위치(마우스 기준) */
  const [memoPos, setMemoPos] = useState({ x: 0, y: 0 });

  /* ===== Firestore 구독: moveouts 컬렉션 ===== */
  useEffect(() => {
    const q = query(collection(db, "moveouts"), orderBy("moveDate", "desc"));
    return onSnapshot(q, (snap) => {
      setMoveouts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  /* ✅ PDF 상태 토스트 자동 숨김 */
  useEffect(() => {
    if (!pdfStatus || !pdfStatus.includes("생성되었습니다")) return;
    const t = setTimeout(() => setPdfStatus(""), 3000);
    return () => clearTimeout(t);
  }, [pdfStatus]);

  /* ===== 하자 목록 추출 (모든 행) ===== */
  const allDefectRows = useMemo(() => {
    const rows = [];

    for (const r of moveouts) {
      const extrasArr = Array.isArray(r.extras) ? r.extras : [];
      const normalizedExtras = extrasArr
        .map((e) => ({
          desc: String(e?.desc || "").trim(),
          amount: toNum(e?.amount),
        }))
        .filter((e) => e.desc && e.amount);

      const defectFromExtras = normalizedExtras.filter(
        (e) => !containsExcludedKeyword(e.desc)
      );

      const extraItemsStr = String(r.extraItems || "").trim();
      const extraAmount = toNum(r.extraAmount);
      let defectFromPair = null;
      if (
        extraItemsStr &&
        extraAmount > 0 &&
        !containsExcludedKeyword(extraItemsStr)
      ) {
        defectFromPair = { desc: extraItemsStr, amount: extraAmount };
      }

      const combined = [
        ...defectFromExtras,
        ...(defectFromPair ? [defectFromPair] : []),
      ];

      if (!combined.length) continue;

      const totalAmount = combined.reduce((sum, e) => sum + toNum(e.amount), 0);

      const defectStatus = r.defectStatus || "미결";
      const defectHidden = !!r.defectHidden;
      const defectMemo = String(r.defectMemo || "").trim();

      rows.push({
        moveoutId: r.id,
        moveDate: r.moveDate || "",
        villaName: r.villaName || "",
        unitNumber: r.unitNumber || "",
        defects: combined,
        totalAmount,
        sourceExtras: extrasArr,
        hasExtraPairDefect: !!defectFromPair,
        extraItemsRaw: extraItemsStr,
        defectStatus,
        defectHidden,
        defectMemo,
      });
    }

    return rows.sort((a, b) => {
      const da = toDateValue(a.moveDate);
      const db = toDateValue(b.moveDate);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db - da;
    });
  }, [moveouts]);

  /* ===== 필터 + 검색 + 정렬 적용된 목록 ===== */
  const defectRows = useMemo(() => {
    let rows = allDefectRows.filter(
      (r) => !r.defectHidden && r.defectStatus === filterStatus
    );

    const term = searchTerm.trim().toLowerCase();
    if (term) {
      rows = rows.filter((r) => {
        const defectText = r.defects
          .map((d) => String(d.desc || "").trim())
          .join(", ");
        const haystack = `${r.villaName || ""} ${r.unitNumber || ""} ${defectText}`.toLowerCase();
        return haystack.includes(term);
      });
    }

    const sorted = [...rows].sort((a, b) => {
      let av;
      let bv;

      switch (sortKey) {
        case "moveDate": {
          const da = toDateValue(a.moveDate);
          const db = toDateValue(b.moveDate);
          av = da ? da.getTime() : 0;
          bv = db ? db.getTime() : 0;
          break;
        }
        case "villaName":
          av = (a.villaName || "").toLowerCase();
          bv = (b.villaName || "").toLowerCase();
          break;
        case "unitNumber":
          av = (a.unitNumber || "").toLowerCase();
          bv = (b.unitNumber || "").toLowerCase();
          break;
        case "defect":
          av = a.defects
            .map((d) => String(d.desc || "").trim())
            .join(", ")
            .toLowerCase();
          bv = b.defects
            .map((d) => String(d.desc || "").trim())
            .join(", ")
            .toLowerCase();
          break;
        case "defectStatus":
          av = (a.defectStatus || "").toLowerCase();
          bv = (b.defectStatus || "").toLowerCase();
          break;
        case "defectMemo":
          av = (a.defectMemo || "").toLowerCase();
          bv = (b.defectMemo || "").toLowerCase();
          break;
        default:
          av = 0;
          bv = 0;
      }

      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [allDefectRows, filterStatus, searchTerm, sortKey, sortDir]);

  const totalCount = defectRows.length;
  const pendingCount = useMemo(
    () =>
      allDefectRows.filter((r) => !r.defectHidden && r.defectStatus === "미결")
        .length,
    [allDefectRows]
  );
  const holdCount = useMemo(
    () =>
      allDefectRows.filter((r) => !r.defectHidden && r.defectStatus === "보류")
        .length,
    [allDefectRows]
  );
  const totalAmountSum = useMemo(
    () => defectRows.reduce((sum, r) => sum + (r.totalAmount || 0), 0),
    [defectRows]
  );

  /* ===== 처리결과 변경 ===== */
  const handleResultChange = async (row, value) => {
    try {
      const ref = doc(db, "moveouts", row.moveoutId);
      await updateDoc(ref, { defectStatus: value });
    } catch (err) {
      console.error("처리결과 업데이트 실패:", err);
      alert("처리결과 저장 중 오류가 발생했습니다.");
    }
  };

  /* ===== 관리 > 삭제 버튼 ===== */
  const handleDeleteDefects = async (row) => {
    if (
      !window.confirm(
        "이 하자내역을 정산하자 리스트에서 삭제할까요?\n(이사정산의 추가내역은 그대로 유지됩니다.)"
      )
    ) {
      return;
    }

    try {
      const ref = doc(db, "moveouts", row.moveoutId);
      await updateDoc(ref, { defectHidden: true });
    } catch (err) {
      console.error("하자내역 숨김 처리 실패:", err);
      alert("삭제(숨김) 저장 중 오류가 발생했습니다.");
    }
  };

  /* ✅ 메모 아이콘 클릭 → 마우스 포인트 '왼쪽'에 팝오버 오픈 */
  const openMemoModal = (row, e) => {
    setMemoTargetRow(row);
    setMemoDraft(String(row?.defectMemo || ""));
    setMemoModalOpen(true);

    const POP_W = 420; // 예상 팝오버 폭(대략)
    const GAP = 12; // 마우스와 간격
    const PAD = 8; // 화면 가장자리 패딩

    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;

    // 기본: 마우스 왼쪽
    let x = (e?.clientX ?? 0) - POP_W - GAP;
    let y = (e?.clientY ?? 0);

    // 왼쪽이 화면 밖이면 → 오른쪽으로 fallback
    if (x < PAD) x = (e?.clientX ?? 0) + GAP;

    // 세로는 화면 안으로 clamp (대략적인 높이 여유)
    const EST_H = 260;
    if (y < PAD) y = PAD;
    if (y + EST_H > vh - PAD) y = Math.max(PAD, vh - PAD - EST_H);

    // 가로도 화면 안으로 clamp
    if (x + POP_W > vw - PAD) x = Math.max(PAD, vw - PAD - POP_W);

    setMemoPos({ x, y });
  };

  const closeMemoModal = () => {
    setMemoModalOpen(false);
    setMemoTargetRow(null);
    setMemoDraft("");
  };

  const handleSaveMemo = async () => {
    if (!memoTargetRow) return;
    try {
      const ref = doc(db, "moveouts", memoTargetRow.moveoutId);
      await updateDoc(ref, { defectMemo: String(memoDraft || "").trim() });
      closeMemoModal();
    } catch (err) {
      console.error("메모 저장 실패:", err);
      alert("메모 저장 중 오류가 발생했습니다.");
    }
  };

  /* ===== PDF 저장 ===== */
  const handleSavePdf = async () => {
    if (!tableRef.current) return;
    try {
      setPdfStatus("PDF 파일 생성 중입니다...");
      const node = tableRef.current;

      const dataUrl = await htmlToImage.toPng(node, {
        backgroundColor: "#ffffff",
        pixelRatio: 1,
      });

      const img = new Image();
      img.src = dataUrl;

      img.onload = () => {
        const pdf = new jsPDF({
          unit: "mm",
          format: "a4",
          orientation: "portrait",
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const imgWidthPx = img.width;
        const imgHeightPx = img.height;

        const ratio = pageWidth / imgWidthPx;
        const pageHeightPx = pageHeight / ratio;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = imgWidthPx;
        canvas.height = pageHeightPx;

        let positionY = 0;
        let remainingHeight = imgHeightPx;
        let firstPage = true;

        while (remainingHeight > 0) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, -positionY, imgWidthPx, imgHeightPx);
          const pageDataUrl = canvas.toDataURL("image/png");

          if (!firstPage) pdf.addPage();
          firstPage = false;

          pdf.addImage(pageDataUrl, "PNG", 0, 0, pageWidth, pageHeight);

          remainingHeight -= pageHeightPx;
          positionY += pageHeightPx;
        }

        pdf.save("정산하자리스트.pdf");
        setPdfStatus("PDF 파일이 생성되었습니다.");
      };

      img.onerror = () => {
        console.error("이미지 로드 실패");
        setPdfStatus("PDF 생성 중 오류가 발생했습니다.");
      };
    } catch (err) {
      console.error("PDF 저장 실패:", err);
      setPdfStatus("PDF 생성 중 오류가 발생했습니다.");
    }
  };

  const renderDefectText = (defects) => {
    if (!defects || !defects.length) return "-";
    const names = defects.map((d) => String(d.desc || "").trim());
    return names.join(", ");
  };

  const handleHeaderClick = (key) => {
    if (sortKey === key) {
      setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const renderSortIcon = (key) => {
    if (sortKey !== key) return <span className="sort-icon sort-icon-idle">↕</span>;
    return <span className="sort-icon">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  return (
    <div className="settle-defect-page">
      <div className="settle-defect-card">
        <div className="settle-defect-summary luxe">
          <div className="summary-left">
            <div className="summary-title-wrap">
              <span className="summary-pill-badge">Check Defect</span>
              <h2 className="summary-title">정산 하자 리스트</h2>
            </div>

            <div className="summary-stats-luxe">
              <div className="stat-card stat-total">
                <div className="stat-card-label">총 하자건수</div>
                <div className="stat-card-value">{totalCount.toLocaleString()}건</div>
              </div>
              <div className="stat-card stat-pending">
                <div className="stat-card-label">미결</div>
                <div className="stat-card-value">{pendingCount.toLocaleString()}건</div>
              </div>
              <div className="stat-card stat-hold">
                <div className="stat-card-label">보류</div>
                <div className="stat-card-value">{holdCount.toLocaleString()}건</div>
              </div>
            </div>
          </div>

          <div className="summary-right">
            <div className="summary-controls-luxe">
              <div className="control-group">
                <label className="control-label">처리결과</label>
                <select
                  className="control-select luxe-select"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="미결">미결</option>
                  <option value="완료">완료</option>
                  <option value="보류">보류</option>
                </select>
              </div>

              <div className="control-group control-search">
                <label className="control-label">검색</label>
                <div className="control-search-wrap">
                  <span className="control-search-icon">🔍</span>
                  <input
                    type="text"
                    className="control-search-input"
                    placeholder="빌라명 / 호수 / 하자내용"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="button"
                className="pdf-save-btn luxe"
                onClick={handleSavePdf}
              >
                <span className="pdf-icon">🧾</span>
                <span>PDF 저장</span>
              </button>
            </div>
          </div>
        </div>

        {pdfStatus && <div className="pdf-status-toast">{pdfStatus}</div>}

        <div className="settle-defect-table-wrap" ref={tableRef}>
          <table className="settle-defect-table">
            <thead>
              <tr>
                <th className="col-date th-sortable" onClick={() => handleHeaderClick("moveDate")}>
                  <span className="th-inner">
                    <span>정산날짜</span>
                    {renderSortIcon("moveDate")}
                  </span>
                </th>
                <th className="col-villa th-sortable" onClick={() => handleHeaderClick("villaName")}>
                  <span className="th-inner">
                    <span>빌라명</span>
                    {renderSortIcon("villaName")}
                  </span>
                </th>
                <th className="col-unit th-sortable" onClick={() => handleHeaderClick("unitNumber")}>
                  <span className="th-inner">
                    <span>호수</span>
                    {renderSortIcon("unitNumber")}
                  </span>
                </th>
                <th className="col-defect th-sortable" onClick={() => handleHeaderClick("defect")}>
                  <span className="th-inner">
                    <span>하자내용</span>
                    {renderSortIcon("defect")}
                  </span>
                </th>
                <th className="col-result th-sortable" onClick={() => handleHeaderClick("defectStatus")}>
                  <span className="th-inner">
                    <span>처리결과</span>
                    {renderSortIcon("defectStatus")}
                  </span>
                </th>

                <th className="col-memo">
                  <span className="th-inner"><span>메모</span></span>
                </th>

                <th className="col-manage">
                  <span className="th-inner"><span>관리</span></span>
                </th>
              </tr>
            </thead>

            <tbody>
              {defectRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-row">
                    하자 체크 대상이 되는 추가내역이 없습니다.
                  </td>
                </tr>
              )}

              {defectRows.map((row) => {
                const result = row.defectStatus || "미결";
                const hasMemo = !!String(row.defectMemo || "").trim();

                return (
                  <tr key={row.moveoutId}>
                    <td className="cell-date">
                      {String(row.moveDate || "").slice(0, 10) || "-"}
                    </td>
                    <td className="cell-villa">{row.villaName || "-"}</td>
                    <td className="cell-unit">{row.unitNumber || "-"}</td>
                    <td className="cell-defect">
                      <span className="defect-text">{renderDefectText(row.defects)}</span>
                    </td>
                    <td className="cell-result">
                      <select
                        className={`result-select luxe-table-select result-${result}`}
                        value={result}
                        onChange={(e) => handleResultChange(row, e.target.value)}
                      >
                        <option value="미결">미결</option>
                        <option value="완료">완료</option>
                        <option value="보류">보류</option>
                      </select>
                    </td>

                    <td className="cell-memo">
                      <button
                        type="button"
                        className={`memo-icon-btn ${hasMemo ? "has-memo" : ""}`}
                        title={hasMemo ? "메모 있음 (클릭하여 수정)" : "메모 입력"}
                        onClick={(e) => openMemoModal(row, e)}
                      >
                        <span className="memo-icon">📝</span>
                      </button>
                    </td>

                    <td className="cell-manage">
                      <button
                        type="button"
                        className="manage-delete-btn"
                        onClick={() => handleDeleteDefects(row)}
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

        {/* 메모 입력창: 마우스포인트 '왼쪽'에 뜨도록 위치 고정 */}
        {memoModalOpen && (
          <div className="sd-popover-overlay" onMouseDown={closeMemoModal}>
            <div
              className="sd-popover"
              style={{
                position: "fixed",
                left: memoPos.x,
                top: memoPos.y,
                transform: "translate(0, 0)",
              }}
              role="dialog"
              aria-modal="false"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="sd-popover-header">
                <div className="sd-popover-title">메모</div>
                <div className="sd-popover-sub">
                  {memoTargetRow?.villaName || "-"} {memoTargetRow?.unitNumber || ""}
                  {" · "}
                  {String(memoTargetRow?.moveDate || "").slice(0, 10) || "-"}
                </div>
              </div>

              <div className="sd-popover-body">
                <textarea
                  className="sd-popover-textarea"
                  value={memoDraft}
                  onChange={(e) => setMemoDraft(e.target.value)}
                  placeholder="메모를 입력하세요."
                />
              </div>

              <div className="sd-popover-actions">
                <button type="button" className="sd-btn sd-btn-primary" onClick={handleSaveMemo}>
                  저장
                </button>
                <button type="button" className="sd-btn sd-btn-ghost" onClick={closeMemoModal}>
                  취소
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
