// src/pages/MoveoutList.mobile.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc,
} from "firebase/firestore";
import * as htmlToImage from "html-to-image";
import PageTitle from "../components/PageTitle";
import ReceiptTemplate from "../components/ReceiptTemplate";
import "./MoveoutList.mobile.css";

/* ===== 유틸 ===== */
const toNum = (v) => v === "" || v == null ? 0 : (Number(String(v).replace(/[,\s]/g, "")) || 0);
const fmtAmount = (val) => { const n = toNum(val); return n ? n.toLocaleString() : (val === 0 ? "0" : ""); };
const sumExtrasFromArray = (extras) => (extras || []).reduce((a, it) => a + (Number(it?.amount || 0) || 0), 0);
const getExtraTotal = (x) => { const sx = Array.isArray(x.extras) ? sumExtrasFromArray(x.extras) : 0; return sx || toNum(x.extraAmount); };
const sumTotal = (x) => toNum(x.arrears)+toNum(x.currentMonth)+toNum(x.waterFee)+toNum(x.electricity)+toNum(x.tvFee)+toNum(x.cleaningFee)+getExtraTotal(x);

/* ===== 진행현황 셀렉트 (포털 메뉴) ===== */
const STATUS = ["정산대기","입금대기","정산완료"];
const statusColor = (v) => v==="입금대기" ? "#ef4444" : v==="정산완료" ? "#10b981" : "#9ca3af";

function usePortalMenuPosition() {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const place = (el, width = 180) => {
    const r = el?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 6, left: Math.max(8, r.right - width), width });
  };
  return { pos, place };
}

function StatusSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const trigRef = useRef(null);
  const { pos, place } = usePortalMenuPosition();

  useEffect(() => {
    const onDocClick = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);
  useEffect(() => {
    const reflow = () => place(trigRef.current, 180);
    if (open) {
      reflow();
      window.addEventListener("resize", reflow);
      window.addEventListener("scroll", reflow, true);
      return () => {
        window.removeEventListener("resize", reflow);
        window.removeEventListener("scroll", reflow, true);
      };
    }
  }, [open, place]);

  return (
    <div className={`statusbox ${open ? "open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        ref={trigRef}
        className="status-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen(p => !p); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="진행현황 변경"
      >
        <i className="dot" style={{ background: statusColor(value) }} />
        <span className="label">{value || "정산대기"}</span>
        <span className="caret" />
      </button>

      {open && ReactDOM.createPortal(
        <div className="status-menu fixed" style={{ top: pos.top, left: pos.left, width: pos.width }} role="listbox">
          {STATUS.map(s => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={value === s}
              className={`status-item ${value === s ? "selected" : ""}`}
              onClick={() => { onChange?.(s); setOpen(false); }}
            >
              <i className="dot" style={{ background: statusColor(s) }} />
              <span className="txt">{s}</span>
              {value === s && <span className="check">✓</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

/* ===== 조회(필터) 셀렉트 (포털 메뉴) ===== */
const FILTERS = ["ALL","정산대기","입금대기","정산완료"];
const filterLabel = (v) => v === "ALL" ? "전체" : v;

function FilterSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const trigRef = useRef(null);
  const { pos, place } = usePortalMenuPosition();

  useEffect(() => {
    const onDocClick = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);
  useEffect(() => {
    const reflow = () => place(trigRef.current, 160);
    if (open) {
      reflow();
      window.addEventListener("resize", reflow);
      window.addEventListener("scroll", reflow, true);
      return () => {
        window.removeEventListener("resize", reflow);
        window.removeEventListener("scroll", reflow, true);
      };
    }
  }, [open, place]);

  return (
    <div className={`filterbox ${open ? "open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        ref={trigRef}
        className="filter-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen(p => !p); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="조회 조건"
      >
        <span className="f-label">{filterLabel(value)}</span>
        <span className="f-caret" />
      </button>

      {open && ReactDOM.createPortal(
        <div className="filter-menu fixed" style={{ top: pos.top, left: pos.left, width: pos.width }} role="listbox">
          {FILTERS.map(opt => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={value === opt}
              className={`filter-item ${value === opt ? "selected" : ""}`}
              onClick={() => { onChange?.(opt); setOpen(false); }}
            >
              <span className="txt">{filterLabel(opt)}</span>
              {value === opt && <span className="check">✓</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function MoveoutListMobile({ employeeId, userId }) {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [keyword, setKeyword] = useState("");
  const [openId, setOpenId] = useState(null);

  /* ✅ 센터 모달(비고/사진) 상태 */
  const [centerOpen, setCenterOpen] = useState(false);
  const [centerType, setCenterType] = useState(null);
  const [centerRow, setCenterRow] = useState(null);
  const [photoIdx, setPhotoIdx] = useState(0);

  /* ✅ 영수증 모달 상태 */
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptRow, setReceiptRow] = useState(null);
  const receiptRef = useRef(null);

  /* ✅ 페이지네이션 상태 */
  const PAGE_SIZE = 8;
  const [page, setPage] = useState(1);

  /* ✅ 리스트 스크롤 컨테이너 ref */
  const listRef = useRef(null);

  /* 데이터 구독 */
  useEffect(() => {
    const q = query(collection(db, "moveouts"), orderBy("moveDate", "desc"));
    return onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  /* 필터링/정렬 */
  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "ALL") list = list.filter(r => String(r.status || "") === statusFilter);
    if (keyword.trim()) {
      const k = keyword.trim();
      list = list.filter(r =>
        [r.moveDate, r.villaName, r.unitNumber, r.status, r.note]
          .map(x => String(x || ""))
          .some(s => s.includes(k))
      );
    }
    return list;
  }, [rows, statusFilter, keyword]);

  const displayRows = useMemo(() => {
    const today = new Date();
    const t = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    const mapped = filtered.map(r => {
      const extrasArr = Array.isArray(r.extras) ? r.extras : [];
      const hasExtrasArr = extrasArr.some(e => String(e?.desc || "").trim().length > 0 && toNum(e?.amount) > 0);
      const hasExtrasPair = String(r.extraItems || "").trim().length > 0 && toNum(r.extraAmount) > 0;
      const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(r.moveDate || "")) ? String(r.moveDate) : "0000-00-00";
      const ymdNum = parseInt(ymd.replace(/-/g,""),10) || 0;
      const rank = ymd === t ? 0 : 1;
      const inv = String(99999999 - ymdNum).padStart(8,"0");
      return {
        ...r,
        __hasNote: String(r.note || "").trim().length > 0,
        __hasPhotos: Array.isArray(r.photos) && r.photos.filter(Boolean).length > 0,
        __hasExtras: hasExtrasArr || hasExtrasPair,
        __totalDisplay: fmtAmount(r.totalAmount),
        __sortCombo: `${rank}-${inv}`
      };
    });
    mapped.sort((a,b) => a.__sortCombo.localeCompare(b.__sortCombo));
    return mapped;
  }, [filtered]);

  /* 필터/검색 변경 시 페이지 초기화 */
  useEffect(() => {
    setPage(1);
    setOpenId(null);
    listRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [statusFilter, keyword]);

  /* 페이지 계산 */
  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return displayRows.slice(start, start + PAGE_SIZE);
  }, [displayRows, page]);

  const scrollTopSmooth = () => {
    if (listRef.current) {
      try { listRef.current.scrollTo({ top: 0, behavior: "smooth" }); }
      catch { listRef.current.scrollTop = 0; }
    }
  };
  const goPrev = () => { if (page > 1) { setPage(p => p - 1); scrollTopSmooth(); } };
  const goNext = () => { if (page < totalPages) { setPage(p => p + 1); scrollTopSmooth(); } };

  /* 액션 */
  const handleAdd = () => navigate("/mobile/form");
  const handleEdit = (row) => navigate(`/mobile/form?id=${row.id}`);
  const handleDeleteRow = async (row) => {
    if (!row?.id) return;
    if (!window.confirm("해당 이사정산 내역을 삭제할까요?")) return;
    await deleteDoc(doc(db, "moveouts", row.id));
  };
  const toggleOpen = (id) => setOpenId(p => p === id ? null : id);

  const updateStatus = async (row, s) => {
    try { await updateDoc(doc(db,"moveouts",row.id), { status: s }); }
    catch(e){ console.error(e); alert("진행현황 변경 중 오류가 발생했습니다."); }
  };

  const openCenter = (row, type) => { setCenterRow(row); setCenterType(type); setPhotoIdx(0); setCenterOpen(true); };
  const openReceiptModal = (row) => { setReceiptRow(row); setReceiptModalOpen(true); };
  const closeReceiptModal = () => { setReceiptRow(null); setReceiptModalOpen(false); };

  const buildBase = (r) =>
    `${String(r.moveDate||"").replace(/-/g,"")}${String(r.villaName||"")}${String(r.unitNumber||"")}`
      .replace(/[\\/:*?"<>|]/g,"");

  const ensureReceiptDataUrl = async () =>
    htmlToImage.toJpeg(receiptRef.current, { backgroundColor:"#fff", quality:0.95, pixelRatio:2 });

  const saveReceipt = async () => {
    try {
      const d = await ensureReceiptDataUrl();
      const a = document.createElement("a");
      a.href = d; a.download = `${buildBase(receiptRow)}.jpg`; a.click();
    } catch(e){ alert("영수증 저장 중 오류가 발생했습니다."); }
  };

  const dataURLToBlob = (d) => {
    const [h,b]=d.split(","); const m=h.match(/:(.*?);/)[1];
    const bin=atob(b); const u8=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
    return new Blob([u8],{type:m});
  };

  const shareReceipt = async () => {
    try {
      const d = await ensureReceiptDataUrl();
      const file = new File([dataURLToBlob(d)], `${buildBase(receiptRow)}.jpg`, { type:"image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files:[file] })) {
        await navigator.share({ title:"이사정산 영수증", files:[file] });
      } else if (navigator.share) {
        await navigator.share({ title:"이사정산 영수증", text:"이 기기는 파일 공유가 제한됩니다. 저장 후 앱에서 전송해주세요." });
      } else {
        alert("이 브라우저는 공유를 지원하지 않습니다. 저장 후 문자/카톡으로 전송해주세요.");
      }
    } catch { alert("전송 중 오류가 발생했습니다."); }
  };

  return (
    <div className="mo-page">
      {/* 상단 */}
      <div className="mo-topbar">
        <PageTitle>이사정산 조회</PageTitle>
        <button className="top-action top-action--purple" onClick={handleAdd}>
          <span className="top-icon">＋</span>
          <span>등록</span>
        </button>
      </div>

      {/* 필터 (커스텀 드롭다운 + 검색) */}
      <div className="mo-filters">
        <FilterSelect value={statusFilter} onChange={setStatusFilter} />
        <input
          className="search search--purple"
          placeholder="검색어 입력"
          value={keyword}
          onChange={(e)=>setKeyword(e.target.value)}
        />
      </div>

      {/* 리스트 */}
      <div className="card-list" ref={listRef}>
        {pagedRows.map((row) => {
          const opened = openId === row.id;
          const hasNote = row.__hasNote;
          const hasPhotos = row.__hasPhotos;

          return (
            <div className={`card ${opened ? "opened" : ""}`} key={row.id}>
              <div className="card-head" onClick={()=>toggleOpen(row.id)}>
                {/* 1행: 날짜 / 진행현황 */}
                <div className="head-line">
                  <div className="head-left"><span className="emoji">📅</span><span className="date">{row.moveDate || "-"}</span></div>
                  <div className="head-right" onClick={(e)=>e.stopPropagation()}>
                    <StatusSelect value={row.status || "정산대기"} onChange={(s)=>updateStatus(row,s)} />
                  </div>
                </div>
                {/* 2행: 3분할 */}
                <div className="head-3col">
                  <div className="h-left ellipsis" title={row.villaName || ""}>🏢 {row.villaName || "-"}</div>
                  <div className="h-center unit-chip unit-narrow" title={row.unitNumber || ""}>{row.unitNumber || "-"}</div>
                  <div className="h-right total">💰 {row.__totalDisplay}원</div>
                </div>
              </div>

              {opened && (
                <div className="card-body">
                  {/* 금액 */}
                  <div className="amounts-stack">
                    <div className="a-item"><div className="a-label ellipsis">미납관리비</div><div className="a-value ellipsis">{fmtAmount(row.arrears)}원</div></div>
                    <div className="a-item"><div className="a-label ellipsis">당월관리비</div><div className="a-value ellipsis">{fmtAmount(row.currentMonth)}원</div></div>
                    <div className="a-item"><div className="a-label ellipsis">수도요금</div><div className="a-value ellipsis">{fmtAmount(row.waterFee)}원</div></div>
                    <div className="a-item"><div className="a-label ellipsis">전기요금</div><div className="a-value ellipsis">{fmtAmount(row.electricity)}원</div></div>
                    <div className="a-item"><div className="a-label ellipsis">TV수신료</div><div className="a-value ellipsis">{fmtAmount(row.tvFee)}원</div></div>
                    <div className="a-item"><div className="a-label ellipsis">청소비용</div><div className="a-value ellipsis">{fmtAmount(row.cleaningFee)}원</div></div>
                  </div>

                  {/* 추가내역 */}
                  {row.__hasExtras && (
                    <div className="extras-inline">
                      <div className="extras-title">🧾 추가내역</div>
                      <div className="extras-grid">
                        {Array.isArray(row.extras) && row.extras.length > 0 ? (
                          row.extras.map((e,i)=>(
                            <div key={i} className="x-item">
                              <div className="x-label ellipsis" title={e.desc}>{e.desc}</div>
                              <div className="x-value ellipsis">{fmtAmount(e.amount)}원</div>
                            </div>
                          ))
                        ) : (
                          <div className="x-item">
                            <div className="x-label ellipsis" title={row.extraItems || ""}>{String(row.extraItems || "").trim() || "-"}</div>
                            <div className="x-value ellipsis">{fmtAmount(row.extraAmount)}원</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 액션 2줄 고정 */}
                  <div className="actions-fixed">
                    <div className="act-row top">
                      <button
                        className={`i-btn ${hasNote ? "" : "disabled"}`}
                        onClick={() => hasNote && openCenter(row, "note")}
                        disabled={!hasNote}
                        title={hasNote ? "비고 보기" : "비고 없음"}
                      >
                        <span className="i">📝</span><span className="t">{hasNote ? "내용있음" : "내용없음"}</span>
                      </button>
                      <button
                        className={`i-btn ${hasPhotos ? "" : "disabled"}`}
                        onClick={() => hasPhotos && openCenter(row, "photos")}
                        disabled={!hasPhotos}
                        title={hasPhotos ? "사진 보기" : "사진 없음"}
                      >
                        <span className="i">🖼️</span><span className="t">{hasPhotos ? "사진있음" : "사진없음"}</span>
                      </button>
                      <button className="i-btn" onClick={() => openReceiptModal(row)} title="영수증 저장/전송">
                        <span className="i">🧾</span><span className="t">영수증</span>
                      </button>
                    </div>

                    <div className="act-row bottom">
                      <button className="pill-btn" onClick={() => handleEdit(row)}>수정</button>
                      <button className="pill-btn danger" onClick={() => handleDeleteRow(row)}>삭제</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 하단 페이지 컨트롤 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "10px 12px" }}>
        <button className="pill-btn light" onClick={goPrev} disabled={page <= 1} aria-label="이전 페이지">‹ 이전</button>
        <div style={{ fontWeight: 900, fontSize: 13, color: "#334155", minWidth: 80, textAlign: "center" }}>
          {page} / {totalPages}
        </div>
        <button className="pill-btn" onClick={goNext} disabled={page >= totalPages} aria-label="다음 페이지">다음 ›</button>
      </div>

      {/* 비고/사진 모달 */}
      {centerOpen && centerRow && (
        <div className="overlay center" onClick={()=>setCenterOpen(false)}>
          <div className="modal" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header">
              <b>{centerType === "photos" ? "사진" : "비고"}</b>
              <button className="close" onClick={()=>setCenterOpen(false)}>닫기</button>
            </div>

            {centerType === "note" && <div className="note">{centerRow.note}</div>}

            {centerType === "photos" && (
              <div className="photos">
                {Array.isArray(centerRow.photos) && centerRow.photos.filter(Boolean).length > 0 ? (
                  <>
                    <img src={centerRow.photos[photoIdx]} alt="사진" className="photo" />
                    <button type="button" onClick={()=>setPhotoIdx(p=>(p-1+centerRow.photos.length)%centerRow.photos.length)} className="nav left" aria-label="이전">‹</button>
                    <button type="button" onClick={()=>setPhotoIdx(p=>(p+1)%centerRow.photos.length)} className="nav right" aria-label="다음">›</button>
                    <div className="pager">{photoIdx+1} / {centerRow.photos.length}</div>
                  </>
                ) : <div>사진 없음</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 영수증: 저장/전송 (제목 제거, 2개 버튼만 크게) */}
      {receiptModalOpen && receiptRow && (
        <div className="overlay center" onClick={closeReceiptModal}>
          <div className="modal" onClick={(e)=>e.stopPropagation()}>
            <div
              className="actions center"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                padding: "24px 20px",
              }}
            >
              <button
                className="pill-btn"
                onClick={saveReceipt}
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  padding: "16px 18px",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
                aria-label="영수증 저장"
              >
                <span role="img" aria-hidden="true">💾</span>
                <span>영수증저장</span>
              </button>

              <button
                className="pill-btn light"
                onClick={shareReceipt}
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  padding: "16px 18px",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
                aria-label="영수증 전송"
              >
                <span role="img" aria-hidden="true">📤</span>
                <span>영수증전송</span>
              </button>

              <button
                className="pill-btn danger"
                onClick={closeReceiptModal}
                style={{
                  fontSize: 14,
                  padding: "10px 14px",
                  borderRadius: 10,
                  marginTop: 2,
                }}
                aria-label="닫기"
              >
                닫기
              </button>
            </div>

            {/* 오프스크린 캡처 타깃 */}
            <div style={{ position:"absolute", left:-99999, top:-99999 }}>
              <ReceiptTemplate
                refProp={receiptRef}
                item={{
                  moveOutDate: receiptRow.moveDate || "",
                  name: receiptRow.villaName || "",
                  roomNumber: receiptRow.unitNumber || "",
                  arrears: toNum(receiptRow.arrears),
                  currentFee: toNum(receiptRow.currentMonth),
                  waterCost: toNum(receiptRow.waterFee),
                  electricity: toNum(receiptRow.electricity),
                  tvFee: toNum(receiptRow.tvFee),
                  cleaning: toNum(receiptRow.cleaningFee),
                  defects: (Array.isArray(receiptRow.extras) ? receiptRow.extras : []).map((e) => ({ desc: e.desc, amount: toNum(e.amount) })),
                  total: sumTotal(receiptRow),
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
