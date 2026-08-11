// src/pages/SettlementDefectCheckPage.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
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

const toNum = (v) => {
  if (v === "" || v == null) return 0;
  const cleaned = String(v).replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const fmtAmount = (val) => {
  const n = toNum(val);
  return n ? n.toLocaleString() : n === 0 ? "0" : "";
};

/* ✅ 도배/벽지 키워드: 이 단어가 포함된 내용은 다른 제외 키워드와
   같이 적혀 있어도(예: "1차 도배비", "도배 요금") 무조건 하자
   리스트 후보로 포함됩니다. */
const PAPERING_KEYWORDS = ["도배", "벽지"];

const containsPaperingKeyword = (text) => {
  const s = String(text || "").trim();
  if (!s) return false;
  return PAPERING_KEYWORDS.some((kw) => s.includes(kw));
};

const EXCLUDE_KEYWORDS = [
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
  if (containsPaperingKeyword(s)) return false;
  return EXCLUDE_KEYWORDS.some((kw) => s.includes(kw));
};

// 날짜 비교용
const toDateValue = (val) => {
  if (!val) return null;

  if (typeof val === "object" && typeof val.toDate === "function") {
    const d = val.toDate();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  if (val instanceof Date && !isNaN(val)) {
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }

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

/* ===== 처리결과 커스텀 드롭다운 ===== */
const STATUS_OPTIONS = [
  { value: "미결", label: "미결", tone: "pending" },
  { value: "완료", label: "완료", tone: "done" },
  { value: "보류", label: "보류", tone: "hold" },
];

const FILTER_STATUS_OPTIONS = [
  { value: "전체", label: "전체", tone: "all" },
  ...STATUS_OPTIONS,
];

function StatusDropdown({
  value,
  onChange,
  size = "row",
  options = STATUS_OPTIONS,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0, w: 0 });
  const btnRef = useRef(null);
  // ✅ 옵션 목록(Portal로 렌더링됨)의 DOM을 참조하기 위한 ref.
  //    이게 없으면 "바깥 클릭 감지"가 옵션 목록 자체를 바깥으로
  //    오인해서, 옵션을 클릭하는 순간(mousedown)에 목록이 먼저
  //    사라져버려 선택(click)이 무시되는 버그가 발생합니다.
  const listRef = useRef(null);

  const current = options.find((o) => o.value === value) || options[0];

  const openList = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const vh = window.innerHeight || 0;
      const vw = window.innerWidth || 0;
      const EST_H = options.length * 38 + 12;
      const PAD = 8;

      let y = rect.bottom + 6;
      if (y + EST_H > vh - PAD) {
        y = Math.max(PAD, rect.top - EST_H - 6);
      }

      let x = rect.left;
      const listW = Math.max(rect.width, 130);
      if (x + listW > vw - PAD) {
        x = Math.max(PAD, vw - PAD - listW);
      }

      setPos({ x, y, w: rect.width });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      // ✅ 트리거 버튼 또는 옵션 목록 내부 클릭은 "바깥 클릭"이 아님
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (listRef.current && listRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const handlePick = (opt) => {
    setOpen(false);
    if (opt.value !== value) onChange(opt.value);
  };

  return (
    <div className={`sd-dropdown sd-dropdown--${size}`}>
      <button
        type="button"
        ref={btnRef}
        className={`sd-dropdown-trigger sd-dropdown-trigger--${size} sd-dropdown-trigger--${current.tone}`}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        <span className="sd-dropdown-dot" />
        <span className="sd-dropdown-label">{current.label}</span>
        <span className={`sd-dropdown-arrow ${open ? "is-open" : ""}`}>▾</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={listRef}
            className="sd-dropdown-list"
            style={{
              position: "fixed",
              left: pos.x,
              top: pos.y,
              minWidth: Math.max(pos.w, 130),
            }}
          >
            {options.map((opt) => (
              <button
                type="button"
                key={opt.value}
                className={`sd-dropdown-option sd-dropdown-option--${opt.tone} ${
                  opt.value === value ? "is-selected" : ""
                }`}
                onClick={() => handlePick(opt)}
              >
                <span className="sd-dropdown-dot" />
                <span>{opt.label}</span>
                {opt.value === value && (
                  <span className="sd-dropdown-check">✓</span>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

export default function SettlementDefectCheckPage() {
  const [moveouts, setMoveouts] = useState([]);
  const [filterStatus, setFilterStatus] = useState("전체");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("moveDate");
  const [sortDir, setSortDir] = useState("desc");
  const [pdfStatus, setPdfStatus] = useState("");
  const tableRef = useRef(null);

  /* ===== 메모 팝오버 상태 ===== */
  const [memoModalOpen, setMemoModalOpen] = useState(false);
  const [memoTargetRow, setMemoTargetRow] = useState(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoPos, setMemoPos] = useState({ x: 0, y: 0 });
  const [memoSide, setMemoSide] = useState("left"); // 'left' | 'right'

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
    let rows = allDefectRows.filter((r) => {
      if (r.defectHidden) return false;
      if (filterStatus === "전체") return true;
      return r.defectStatus === filterStatus;
    });

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

  /* ✅ 메모 아이콘 클릭 → 클릭한 '버튼' 위치를 기준으로 팝오버 오픈 */
  const openMemoModal = (row, e) => {
    setMemoTargetRow(row);
    setMemoDraft(String(row?.defectMemo || ""));
    setMemoModalOpen(true);

    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;

    const POP_W = vw <= 960 ? 280 : 320;
    const EST_H = 230;
    const GAP = 10;
    const PAD = 10;

    const btn = e?.currentTarget;
    const rect =
      btn && typeof btn.getBoundingClientRect === "function"
        ? btn.getBoundingClientRect()
        : {
            left: e?.clientX ?? 0,
            right: e?.clientX ?? 0,
            top: e?.clientY ?? 0,
            bottom: e?.clientY ?? 0,
            height: 0,
          };

    let side = "left";
    let x = rect.left - POP_W - GAP;
    let y = rect.top + rect.height / 2 - EST_H / 2;

    if (x < PAD) {
      side = "right";
      x = rect.right + GAP;
    }

    if (x + POP_W > vw - PAD) {
      x = Math.max(PAD, vw - PAD - POP_W);
    }
    if (x < PAD) x = PAD;

    if (y < PAD) y = PAD;
    if (y + EST_H > vh - PAD) y = Math.max(PAD, vh - PAD - EST_H);

    setMemoSide(side);
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

    const proceed = window.confirm(
      "현재 하자 리스트를 PDF 파일로 저장하시겠습니까?"
    );
    if (!proceed) return;

    const node = tableRef.current;
    try {
      setPdfStatus("PDF 파일 생성 중입니다...");

      node.classList.add("pdf-export-mode");
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );

      const dataUrl = await htmlToImage.toPng(node, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });

      node.classList.remove("pdf-export-mode");

      const img = new Image();
      img.src = dataUrl;

      img.onload = () => {
        const pdf = new jsPDF({
          unit: "mm",
          format: "a4",
          orientation: "landscape",
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
      node.classList.remove("pdf-export-mode");
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

  /* ✅ 메모 팝오버: document.body로 Portal 렌더링 */
  const memoPopover =
    memoModalOpen &&
    createPortal(
      <div className="sd-popover-overlay" onMouseDown={closeMemoModal}>
        <div
          className={`sd-popover sd-popover--${memoSide}`}
          style={{
            position: "fixed",
            left: memoPos.x,
            top: memoPos.y,
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
      </div>,
      document.body
    );

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
                <StatusDropdown
                  value={filterStatus}
                  onChange={setFilterStatus}
                  size="filter"
                  options={FILTER_STATUS_OPTIONS}
                />
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
                      <StatusDropdown
                        value={result}
                        onChange={(v) => handleResultChange(row, v)}
                        size="row"
                      />
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
      </div>

      {/* ✅ 메모 팝오버: document.body에 Portal로 렌더링 (화면 밖 잘림 방지) */}
      {memoPopover}
    </div>
  );
}
