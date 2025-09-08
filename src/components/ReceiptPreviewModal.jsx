// src/components/ReceiptPreviewModal.jsx
import React, { useRef } from "react";
import * as htmlToImage from "html-to-image";

/* 회사 고정 정보 */
const COMPANY = {
  name: "한남주택관리",
  bizNo: "763-03-01741",
  phone: "042-489-8555",
  fax: "042-367-7555",
  email: "hannam8555@naver.com",
  account: "농협 0424898555-009 (이세구)",
};

/* yyyy-MM-dd → '2025년 9월 5일 금요일' */
const formatKDateLong = (str) => {
  if (!str) return "";
  const d = new Date(str);
  if (isNaN(+d)) return str;
  const wd = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(d);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${wd}`;
};

export default function ReceiptPreviewModal({ open, row, onClose }) {
  const paperRef = useRef(null);
  if (!open || !row) return null;

  const s = (v) => String(v ?? "").trim();
  const items = Array.isArray(row.items) ? row.items : [];
  const computedSum = items.reduce((acc, it) => {
    const amt = Number(
      it?.amount ??
        Number(it?.qty || 0) * Number(String(it?.unitPrice || 0).replace(/[^0-9]/g, ""))
    );
    return acc + (isNaN(amt) ? 0 : amt);
  }, 0);
  const total = Number(row.totalAmount || computedSum || 0);

  const baseName = () => {
    const ymd = s(row.issueDate || "").replace(/-/g, "");
    const v = s(row.villaName);
    const u = s(row.unitNumber);
    return `${ymd}${v}${u}`.replace(/[\\/:*?"<>|]/g, "");
  };

  const saveJPG = async () => {
    const dataUrl = await htmlToImage.toJpeg(paperRef.current, {
      backgroundColor: "#fff",
      quality: 0.96,
      pixelRatio: 2,
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${baseName()}.jpg`;
    a.click();
  };

  const savePDF = async () => {
    const mod = await import("jspdf").catch(() => null);
    if (!mod?.default) {
      const png = await htmlToImage.toPng(paperRef.current, {
        backgroundColor: "#fff",
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = png;
      a.download = `${baseName()}.png`;
      a.click();
      alert("PDF 모듈(jspdf)이 없어 PNG로 저장했습니다. (npm i jspdf 설치 시 PDF 가능)");
      return;
    }
    const jsPDF = mod.default;
    const dataUrl = await htmlToImage.toPng(paperRef.current, {
      backgroundColor: "#fff",
      pixelRatio: 2,
    });
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const ratio = img.height / img.width;
    const pdfW = pageWidth - 20;
    const pdfH = pdfW * ratio;
    pdf.addImage(dataUrl, "PNG", 10, 10, pdfW, pdfH, undefined, "FAST");
    pdf.save(`${baseName()}.pdf`);
  };

  const handlePrint = () => window.print();

  /* 하단 공백 방지용 최소 행 */
  const MIN_ROWS = 18;
  const rowCount = Math.max(items.length, MIN_ROWS);

  return (
    <>
      {/* 배경 & 셸 */}
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-shell" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div className="title">영수증 미리보기</div>
            <div className="right">
              {/* 버튼 순서: 인쇄 · JPG · PDF · 닫기 */}
              <button className="btn print" onClick={handlePrint}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{marginRight:6}}>
                  <path fill="currentColor" d="M6 7V3h12v4h-2V5H8v2H6zm12 6h2v6h-4v2H8v-2H4v-6h2v4h12v-4zM20 9H4a2 2 0 0 0-2 2v4h4v-2h12v2h4v-4a2 2 0 0 0-2-2z"/>
                </svg>
                인쇄
              </button>
              <button className="btn" onClick={saveJPG}>JPG 저장</button>
              <button className="btn" onClick={savePDF}>PDF 저장</button>
              <button className="btn ghost" onClick={onClose}>닫기</button>
            </div>
          </div>

          {/* 세로 스크롤만 허용 */}
          <div className="content-scroll">
            <div className="paper" ref={paperRef}>
              {/* 상단 헤더 — 주황 그라데이션 + 크게 */}
              <div className="brand">
                <div className="brand-title">{s(row.receiptName) || "한남주택관리 영수증"}</div>
              </div>

              {/* 상단 4그리드 */}
              <div className="top-grid">
                <div className="box">
                  <div className="r"><span className="th">상호</span><span className="td">{COMPANY.name}</span></div>
                  <div className="r"><span className="th">사업자등록번호</span><span className="td">{COMPANY.bizNo}</span></div>
                  <div className="r"><span className="th">입금계좌</span><span className="td">{COMPANY.account}</span></div>
                </div>

                <div className="box">
                  <div className="r"><span className="th">전화번호</span><span className="td">{COMPANY.phone}</span></div>
                  <div className="r"><span className="th">팩스</span><span className="td">{COMPANY.fax}</span></div>
                  <div className="r"><span className="th">전자 메일</span><span className="td">{COMPANY.email}</span></div>
                </div>

                <div className="box">
                  <div className="r"><span className="th">공급받는자</span><span className="td">{s(row.recipient) || "-"}</span></div>
                  <div className="r"><span className="th">발행일</span><span className="td">{formatKDateLong(row.issueDate)}</span></div>
                  <div className="r"><span className="th">청구금액</span><span className="td strong">₩ {total.toLocaleString()}</span></div>
                </div>

                <div className="box">
                  <div className="r"><span className="th">주소지</span><span className="td">{s(row.address)}</span></div>
                  <div className="r"><span className="th">빌라명</span><span className="td">{s(row.villaName)}</span></div>
                  <div className="r"><span className="th">나머지 주소</span><span className="td">{s(row.unitNumber)}</span></div>
                </div>
              </div>

              {/* 품목 테이블 */}
              <div className="table">
                {/* ✅ 헤더-리스트 사이 구분선: 상단 테이블 구분선 스타일과 동일 */}
                <div className="thead thead--separator-like-top">
                  <div>날짜</div><div>품목(내용)</div><div>수량</div><div>단가</div><div>금액</div>
                </div>
                {Array.from({ length: rowCount }).map((_, i) => {
                  const it = items[i];
                  const date = it?.date || "";
                  const desc = it?.description || "";
                  const qty  = Number(it?.qty || 0);
                  const unit = Number(it?.unitPrice || 0);
                  const amt  = Number(it?.amount || qty * unit || 0);
                  return (
                    <div className="trow" key={i}>
                      <div className="cell">{date}</div>
                      <div className="cell desc">{desc}</div>
                      <div className="cell qty">{qty ? qty.toLocaleString() : ""}</div>
                      <div className="cell num">{unit ? unit.toLocaleString() : ""}</div>
                      <div className="cell num">{amt ? amt.toLocaleString() : (desc || date ? "0" : "-" )}</div>
                    </div>
                  );
                })}
              </div>

              {/* 간격 */}
              <div className="between-gap" />

              {/* 하단 요약 */}
              <div className="summary">
                <div className="srow">
                  <div className="sth center">청구 금액</div>
                  <div className="std big red">₩ {total.toLocaleString()}</div>
                </div>
                <div className="srow">
                  <div className="sth center">입금계좌</div>
                  <div className="std big2">{COMPANY.account}</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        /* 인쇄: A4, 여백 10mm */
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          .modal-backdrop, .modal-shell, .modal-head { display: none !important; }
          .paper {
            width: 210mm !important; min-height: 297mm !important;
            box-shadow: none !important; border: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .box, .table, .summary,
          .r:not(:last-child), .thead > div, .trow .cell, .srow:not(:last-child),
          .th, .sth, .trow .cell, .thead, .summary, .srow {
            border-color:#000 !important;
          }
          .thead--separator-like-top { border-bottom: 1.2px solid #000 !important; }
        }

        /* 배경 */
        .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:1000; }

        /* 중앙 정렬 셸 */
        .modal-shell {
          position: fixed; inset: 0; z-index: 1001;
          display: flex; align-items: center; justify-content: center;
          padding: 24px; overflow: hidden;
        }

        .modal {
          width: 980px; max-width: min(96vw, 980px);
          background: transparent; display: flex; flex-direction: column;
        }

        .modal-head {
          display:flex; justify-content:space-between; align-items:center;
          margin-bottom:16px; color:#111;
        }
        .modal-head .title { font-weight:800; font-size:17px; }
        .right { display:flex; gap:10px; }
        .btn {
          background:#eef2f7; border:none; border-radius:10px;
          padding:9px 14px; font-weight:700; cursor:pointer; font-size:12.5px;
          display:inline-flex; align-items:center;
        }
        .btn.print { background:#111827; color:#fff; }
        .btn.ghost { background:#f6f7fb; }

        /* 세로 스크롤만 */
        .content-scroll {
          max-height: calc(100vh - 160px);
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 6px;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }

        /* 종이 */
        .paper {
          --stroke:#121316;             /* 기본 라인색 */
          width: 210mm;
          min-height: 297mm;
          max-width: 100%;
          background:#fff;
          border:1.4px solid var(--stroke);
          border-radius:14px;
          box-shadow: 0 12px 34px rgba(16,24,40,.12);
          color:#111827;
          margin: 0 auto;
          padding: 22px 18px 24px;
          box-sizing: border-box;
          overflow: hidden;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple SD Gothic Neo", "Malgun Gothic";
          font-size: 13.25px;
          line-height: 1.42;
          white-space: nowrap;

          display: flex;
          flex-direction: column;
        }

        /* 상단 헤더 — 주황 그라데이션 */
        .brand {
          display:flex; align-items:center; justify-content:flex-start;
          background: linear-gradient(90deg, #FF7A00, #FFB84D);
          color:#fff; padding: 20px 20px;
          border-radius:12px; margin-bottom:16px;
          letter-spacing:.2px;
        }
        .brand-title { font-size:20px; font-weight:900; line-height:1.2; }

        /* 상단 4그리드 */
        .top-grid {
          display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:16px;
        }
        .box { border:1.4px solid var(--stroke); border-radius:10px; overflow:hidden; width:100%; }
        .r { display:grid; grid-template-columns:130px 1fr; }
        .r:not(:last-child) { border-bottom:1.2px solid var(--stroke); }

        .th {
          background:#f8fafc; padding:11px 10px;
          font-weight:800; border-right:1.2px solid var(--stroke); font-size:12.25px;
          overflow:hidden; text-overflow:ellipsis;
        }
        .td {
          padding:11px 12px;
          font-size:13.25px; overflow:hidden; text-overflow:ellipsis;
        }
        .td.strong { font-weight:900; }

        /* 품목 테이블 */
        .table {
          border:1.4px solid var(--stroke);
          border-radius:10px; overflow:hidden; width:100%;
        }

        /* ✅ 헤더-리스트 사이 구분선: 상단 테이블 구분선과 동일 */
        .thead--separator-like-top {
          border-bottom: 1.2px solid var(--stroke);
        }

        /* 열 폭: 날짜(95px) | 품목(1fr) | 수량(60px) | 단가(105px) | 금액(115px) */
        .thead, .trow { display:grid; grid-template-columns: 95px 1fr 60px 105px 115px; }
        .thead { background:#f1f5f9; font-weight:900; }
        .thead > div {
          padding:11px 12px;
          text-align:center; border-right:1.2px solid var(--stroke);
          font-size:12.5px;
        }
        .thead > div:last-child { border-right:none; }

        .trow .cell {
          padding:11px 12px;
          border-top:1.1px solid #d4d7de; border-right:1.1px solid #e0e3ea;
        }
        .trow .cell:last-child { border-right:none; }

        /* ✅ 날짜는 중앙 정렬 */
        .trow .cell:nth-child(1) { text-align: center; }

        /* ✅ 품목(내용) 본문은 좌측 정렬 */
        .trow .cell.desc { text-align: left; }

        /* ✅ 수량 본문은 중앙 정렬 */
        .trow .cell.qty { text-align: center; }

        .num { text-align:right; font-variant-numeric: tabular-nums; }
        .text-ell { overflow:hidden; text-overflow:ellipsis; }

        /* 품목표와 하단 요약 사이 간격 */
        .between-gap { height: 12px; }

        /* 하단 요약 */
        .summary {
          border:1.4px solid var(--stroke); border-radius:10px; overflow:hidden; width:100%;
        }
        .srow { display:grid; grid-template-columns: 140px 1fr; }
        .srow:not(:last-child) { border-bottom:1.2px solid var(--stroke); }
        .sth {
          padding:12px 12px;
          background:#f8fafc; font-weight:900; border-right:1.2px solid var(--stroke);
          font-size:13.25px; overflow:hidden; text-overflow:ellipsis;
        }
        .sth.center { text-align:center; }
        .std {
          padding:12px 12px; font-size:14.25px; overflow:hidden; text-overflow:ellipsis;
        }
        .std.big { font-size:18.5px; font-weight:900; }
        .std.big2 { font-size:16.5px; font-weight:700; }
        .std.red { color:#d10; }
      `}</style>
    </>
  );
}
