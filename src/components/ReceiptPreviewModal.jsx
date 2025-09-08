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

/* 긴 변 기준 비율 유지 + 여백(사방 개별 설정) + 확대 금지(축소만) */
async function fitToLongEdgeWithMargins(
  dataUrl,
  {
    longEdgePortrait = 1900,
    longEdgeLandscape = 2200,
    margins = { top: 28, right: 6, bottom: 28, left: 6 }, // 좌우 최소, 상하는 약간
    mime = "image/jpeg",
    quality = 0.96,
  } = {}
) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const portrait = img.height >= img.width;
      const targetLong = portrait ? longEdgePortrait : longEdgeLandscape;
      const scale = Math.min(1, targetLong / (portrait ? img.height : img.width)); // 축소만
      const targetW = Math.round(img.width * scale);
      const targetH = Math.round(img.height * scale);

      const { top, right, bottom, left } = margins;
      const canvas = document.createElement("canvas");
      canvas.width = targetW + left + right;
      canvas.height = targetH + top + bottom;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, left, top, targetW, targetH);

      resolve(canvas.toDataURL(mime, quality));
    };
    img.src = dataUrl;
  });
}

/* 이미지 인쇄: (미리보기 전체를 캡처한) 이미지를 A4 1장에 무조건 맞춰 출력(잘림 방지) */
function printImageInIframe(dataUrl, { pageMarginMm = 12 } = {}) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  const style = `
    @page { size: A4 portrait; margin: ${pageMarginMm}mm; }
    html, body { margin:0; padding:0; height: 100%; }
    .page {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;   /* 세로 가운데 */
      justify-content: center; /* 가로 가운데 */
    }
    img.printable {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      display: block;
      page-break-inside: avoid;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  `;
  doc.open();
  doc.write(`
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>영수증</title>
        <style>${style}</style>
      </head>
      <body>
        <div class="page">
          <img class="printable" src="${dataUrl}" alt="receipt"/>
        </div>
      </body>
    </html>
  `);
  doc.close();

  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 200);
    }, 50);
  };
}

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

  /* 인쇄: 미리보기 전체 캡처 → A4 1장에 맞춰 출력 */
  const handlePrint = async () => {
    if (!paperRef.current) return;
    const raw = await htmlToImage.toPng(paperRef.current, { backgroundColor: "#fff", pixelRatio: 2 });
    // 인쇄용: 좌우 최소, 상하 적당 — 실제 맞춤은 iframe CSS가 수행(페이지 박스에 max-fit)
    const printable = await fitToLongEdgeWithMargins(raw, {
      longEdgePortrait: 1900,
      longEdgeLandscape: 2200,
      margins: { top: 28, right: 6, bottom: 28, left: 6 },
      mime: "image/png",
    });
    printImageInIframe(printable, { pageMarginMm: 12 });
  };

  /* JPG: 세로 길이 축소 + 좌우 여백 최소 */
  const saveJPG = async () => {
    const raw = await htmlToImage.toJpeg(paperRef.current, { backgroundColor: "#fff", quality: 0.96, pixelRatio: 2 });
    const processed = await fitToLongEdgeWithMargins(raw, {
      longEdgePortrait: 1900,
      longEdgeLandscape: 2200,
      margins: { top: 28, right: 6, bottom: 28, left: 6 },
      mime: "image/jpeg",
      quality: 0.96,
    });
    const a = document.createElement("a");
    a.href = processed;
    a.download = `${baseName()}.jpg`;
    a.click();
  };

  /* PDF: JPG와 동일 스케일/비율 → 좌우 여백 더 줄임(2mm), 상하 10mm 유지 */
  const savePDF = async () => {
    const mod = await import("jspdf").catch(() => null);
    if (!mod?.default) {
      const png = await htmlToImage.toPng(paperRef.current, { backgroundColor: "#fff", pixelRatio: 2 });
      const processed = await fitToLongEdgeWithMargins(png, {
        longEdgePortrait: 1900,
        longEdgeLandscape: 2200,
        margins: { top: 28, right: 6, bottom: 28, left: 6 },
        mime: "image/png",
      });
      const a = document.createElement("a");
      a.href = processed;
      a.download = `${baseName()}.png`;
      a.click();
      alert("PDF 모듈(jspdf)이 없어 PNG로 저장했습니다. (npm i jspdf 설치 시 PDF 가능)");
      return;
    }
    const jsPDF = mod.default;

    const png = await htmlToImage.toPng(paperRef.current, { backgroundColor: "#fff", pixelRatio: 2 });
    const processedJpg = await fitToLongEdgeWithMargins(png, {
      longEdgePortrait: 1900,
      longEdgeLandscape: 2200,
      margins: { top: 28, right: 6, bottom: 28, left: 6 },
      mime: "image/jpeg",
      quality: 0.96,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const img = new Image();
    img.src = processedJpg;
    await img.decode();

    // 좌우 2mm, 상하 10mm
    const marginLR = 2;
    const marginTB = 10;
    const maxW = pageW - marginLR * 2;
    const maxH = pageH - marginTB * 2;

    const ratio = img.width / img.height;
    let drawW = maxW;
    let drawH = drawW / ratio;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH * ratio;
    }
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    pdf.addImage(processedJpg, "JPEG", x, y, drawW, drawH, undefined, "FAST");
    pdf.save(`${baseName()}.pdf`);
  };

  /* 품목표는 16칸 고정 표시 (변경 없음) */
  const DISPLAY_ROWS = 16;

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
              <button className="btn jpg" onClick={saveJPG}>JPG 저장</button>
              <button className="btn pdf" onClick={savePDF}>PDF 저장</button>
              <button className="btn close" onClick={onClose}>닫기</button>
            </div>
          </div>

          {/* 세로 스크롤만 허용 */}
          <div className="content-scroll">
            <div className="paper" ref={paperRef}>
              {/* 주황 헤더 — 세로 살짝 축소 */}
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

              {/* 품목 테이블 (16칸) */}
              <div className="table">
                <div className="thead thead--separator-like-top">
                  <div>날짜</div><div>품목(내용)</div><div>수량</div><div>단가</div><div>금액</div>
                </div>
                {Array.from({ length: DISPLAY_ROWS }).map((_, i) => {
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
        /* 배경 */
        .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:1000; }

        /* 중앙 정렬 셸 */
        .modal-shell {
          position: fixed; inset: 0; z-index: 1001;
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
          overflow: hidden;
        }
        .modal { width: 980px; max-width: min(96vw, 980px); background: transparent; display: flex; flex-direction: column; }

        .modal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; color:#111; }
        .modal-head .title { font-weight:800; font-size:17px; }
        .right { display:flex; gap:10px; }

        .btn {
          border:none; border-radius:10px;
          padding:9px 14px; font-weight:700; cursor:pointer; font-size:12.5px;
          display:inline-flex; align-items:center;
          background:#eef2f7; color:#111;
        }
        .btn.print { background:#111827; color:#fff; }
        .btn.jpg   { background:#0ea5a4; color:#fff; } /* 청록 */
        .btn.pdf   { background:#7c3aed; color:#fff; } /* 보라 */
        .btn.close { background:#e5e7eb; color:#111; } /* 회색 */

        .content-scroll {
          max-height: calc(100vh - 72px);
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 6px;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }

        /* 종이: A4 기본 높이 유지 */
        .paper {
          --stroke:#121316;
          width: 210mm;
          min-height: 297mm;  /* 그대로 유지 */
          max-width: 100%;
          background:#fff;
          border:1.4px solid var(--stroke);
          border-radius:14px;
          box-shadow: 0 12px 34px rgba(16,24,40,.12);
          color:#111827;
          margin: 0 auto;
          padding: 32px 26px 36px;
          box-sizing: border-box;
          overflow: hidden;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple SD Gothic Neo", "Malgun Gothic";
          font-size: 13.25px;
          line-height: 1.42;
          white-space: nowrap;

          display: flex;
          flex-direction: column;
        }

        /* 주황 헤더 — 세로 소폭 축소 */
        .brand {
          display:flex; align-items:center; justify-content:flex-start;
          background: linear-gradient(90deg, #FF7A00, #FFB84D);
          color:#fff; padding: 22px 26px;  /* 28px → 22px */
          border-radius:12px; margin-bottom:18px;
          letter-spacing:.2px;
        }
        .brand-title { font-size:24px; font-weight:900; line-height:1.22; }

        .top-grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:18px; }
        .box { border:1.4px solid var(--stroke); border-radius:10px; overflow:hidden; width:100%; }
        .r { display:grid; grid-template-columns:130px 1fr; }
        .r:not(:last-child) { border-bottom:1.2px solid var(--stroke); }
        .th { background:#f8fafc; padding:13px 12px; font-weight:800; border-right:1.2px solid var(--stroke); font-size:12.75px; overflow:hidden; text-overflow:ellipsis; }
        .td { padding:13px 14px; font-size:13.5px; overflow:hidden; text-overflow:ellipsis; }
        .td.strong { font-weight:900; }

        .table { border:1.6px solid var(--stroke); border-radius:10px; overflow:hidden; width:100%; }
        .thead--separator-like-top { border-bottom: 1.4px solid var(--stroke); }
        .thead, .trow { display:grid; grid-template-columns: 95px 1fr 60px 105px 115px; }
        .thead { background:#f1f5f9; font-weight:900; }
        .thead > div { padding:12px 13px; text-align:center; border-right:1.4px solid var(--stroke); font-size:12.75px; }
        .thead > div:last-child { border-right:none; }

        .trow .cell { padding:12px 13px; border-top:1.3px solid var(--stroke); border-right:1.3px solid var(--stroke); }
        .trow .cell:last-child { border-right:none; }
        .trow .cell:nth-child(1) { text-align: center; }
        .trow .cell.desc { text-align: left; }
        .trow .cell.qty { text-align: center; }
        .num { text-align:right; font-variant-numeric: tabular-nums; }

        .between-gap { height: 14px; }

        .summary { border:1.6px solid var(--stroke); border-radius:10px; overflow:hidden; width:100%; }
        .srow { display:grid; grid-template-columns: 150px 1fr; }
        .srow:not(:last-child) { border-bottom:1.4px solid var(--stroke); }
        .sth { padding:14px 14px; background:#f8fafc; font-weight:900; border-right:1.4px solid var(--stroke); font-size:15px; overflow:hidden; text-overflow:ellipsis; }
        .sth.center { text-align:center; }
        .std { padding:14px 14px; font-size:15px; overflow:hidden; text-overflow:ellipsis; }
        .std.big { font-size:20px; font-weight:900; }
        .std.big2 { font-size:18px; font-weight:700; }
        .std.red { color:#d10; }
      `}</style>
    </>
  );
}
