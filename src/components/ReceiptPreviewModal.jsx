// src/components/ReceiptPreviewModal.js
import React, { useRef } from "react";
import * as htmlToImage from "html-to-image";
import { jsPDF } from "jspdf";

/* ────────────────────────────────────────────────────────────────────
   A4 규격 + 출력 해상도 (여백 최소화 + 중앙 정렬)
   ──────────────────────────────────────────────────────────────────── */
const A4_MM = { w: 210, h: 297 };
const DPI = 300;                  // JPG/PDF 권장 해상도
const PAD_MM = 0;                 // A4 내부 여백 0
const JPEG_QUALITY = 0.95;

/* 좌우 스트레치 계수 (잘림 방지 위해 1.0 고정) */
const H_STRETCH = 1.0;

/* 오프셋은 0 (불필요한 치우침 제거) */
const OFFSET_MM_X = 0;

/* 안전여백(mm) — 추가 여백 0 */
const SAFE_MARGIN_MM = 0;

/* 오버스캔 방지 스케일 — 경계부 미세 잘림 방지(거의 100%) */
const OVERSCAN_SCALE = 0.995;

const mmToPx = (mm) => Math.round((mm * DPI) / 25.4);
const PAGE_PX = { w: mmToPx(A4_MM.w), h: mmToPx(A4_MM.h) };
const PAD_PX = mmToPx(PAD_MM);
const SAFE_PX = mmToPx(SAFE_MARGIN_MM);
const INNER_PX = { w: PAGE_PX.w - PAD_PX * 2, h: PAGE_PX.h - PAD_PX * 2 };

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

/* ────────────────────────────────────────────────────────────────────
   캡처 → PNG: 우측 1px 유실 방지용 여유 폭(+2) 부여 & canvas 크기 직접 지정
   ──────────────────────────────────────────────────────────────────── */
async function captureReceiptAsPngDataUrl(node) {
  const rect = node.getBoundingClientRect();

  // ★ 반올림 손실 방지: 올림 + 2px 여유
  const width = Math.ceil(rect.width) + 2;
  const height = Math.ceil(rect.height) + 2;

  // toCanvas로 캔버스 크기를 직접 제어
  const canvas = await htmlToImage.toCanvas(node, {
    backgroundColor: "#fff",
    pixelRatio: 2,
    width,
    height,
    style: {
      transform: "none",
      transformOrigin: "top left",
      overflow: "visible",
      boxSizing: "border-box",
    },
    canvasWidth: width * 2,   // pixelRatio와 동기화
    canvasHeight: height * 2,
  });

  return canvas.toDataURL("image/png");
}

/* 비율 유지 + (사실상) 무여백 + 중앙 정렬 + 경계 클램프 */
async function composeA4PageDataUrl(
  rawDataUrl,
  {
    mime = "image/jpeg", // "image/jpeg" | "image/png"
    quality = JPEG_QUALITY,
  } = {}
) {
  // 원본 이미지 로드
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = rawDataUrl;
  });

  // A4 캔버스
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_PX.w;
  canvas.height = PAGE_PX.h;
  const ctx = canvas.getContext("2d");

  // 배경 흰색
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PAGE_PX.w, PAGE_PX.h);

  // 안전여백 고려한 가용 내부 영역(= 전체)
  const SAFE_INNER_W = INNER_PX.w - SAFE_PX * 2; // == PAGE_PX.w
  const SAFE_INNER_H = INNER_PX.h - SAFE_PX * 2; // == PAGE_PX.h

  // 비율 유지 스케일 + 오버스캔 방지계수 (최대 확대)
  const fitScale = Math.min(SAFE_INNER_W / img.width, SAFE_INNER_H / img.height);
  const baseScale = fitScale * OVERSCAN_SCALE;

  const drawW = Math.round(img.width * baseScale * H_STRETCH);
  const drawH = Math.round(img.height * baseScale);

  // 중앙 정렬 + 오프셋(0) + 좌우/상하 경계 클램프
  const OFFSET_X = mmToPx(OFFSET_MM_X);

  // 중앙 좌표 계산(정수 보정: floor로 0.5px 반올림에 의한 한쪽 치우침 예방)
  const centeredX = Math.floor((PAGE_PX.w - drawW) / 2);
  const centeredY = Math.floor((PAGE_PX.h - drawH) / 2);

  // 오프셋 적용 후 경계 클램프
  let x = centeredX + OFFSET_X;
  const minX = 0;
  const maxX = PAGE_PX.w - drawW;
  x = Math.max(minX, Math.min(x, maxX));

  let y = centeredY;
  const minY = 0;
  const maxY = PAGE_PX.h - drawH;
  y = Math.max(minY, Math.min(y, maxY));

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x, y, drawW, drawH);

  return canvas.toDataURL(mime, quality);
}

/* 인쇄 */
function printFinalPageImage(dataUrl) {
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
    @page { size: A4 portrait; margin: 0; }
    html, body { margin:0; padding:0; height:100%; }
    .page { width:100%; height:100%; }
    /* 용지 내부에 항상 완전 표시 (무여백) */
    img.final { width:100%; height:100%; display:block; object-fit:contain; }
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
          <img class="final" src="${dataUrl}" alt="receipt-final"/>
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

  /* ─────────────── 액션: 인쇄 / JPG / PDF ─────────────── */
  const handlePrint = async () => {
    if (!paperRef.current) return;
    const raw = await captureReceiptAsPngDataUrl(paperRef.current);
    const finalPage = await composeA4PageDataUrl(raw, { mime: "image/png" });
    printFinalPageImage(finalPage);
  };

  const saveJPG = async () => {
    if (!paperRef.current) return;
    const raw = await captureReceiptAsPngDataUrl(paperRef.current);
    const finalPage = await composeA4PageDataUrl(raw, {
      mime: "image/jpeg",
      quality: JPEG_QUALITY,
    });

    const a = document.createElement("a");
    a.href = finalPage;
    a.download = `${baseName()}.jpg`;
    a.click();
  };

  const savePDF = async () => {
    if (!paperRef.current) return;
    const raw = await captureReceiptAsPngDataUrl(paperRef.current);
    const finalPage = await composeA4PageDataUrl(raw, {
      mime: "image/jpeg",
      quality: JPEG_QUALITY,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    pdf.addImage(finalPage, "JPEG", 0, 0, A4_MM.w, A4_MM.h, undefined, "FAST");
    pdf.save(`${baseName()}.pdf`);
  };

  /* 품목표 16칸 고정 표시 */
  const DISPLAY_ROWS = 16;

  return (
    <>
      {/* 배경 & 셸 */}
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-shell" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          {/* 헤더 */}
          <div className="modal-head">
            <div className="title">
              <span className="dot" />
              영수증 미리보기
            </div>
            <div className="right">
              <button className="btn btn--ghost" onClick={handlePrint}>인쇄</button>
              <button className="btn btn--accent" onClick={saveJPG}>JPG 저장</button>
              <button className="btn btn--primary" onClick={savePDF}>PDF 저장</button>
              <button className="btn btn--flat" onClick={onClose}>닫기</button>
            </div>
          </div>

          {/* 컨텐츠 */}
          <div className="content-scroll">
            <div className="paper" ref={paperRef}>
              {/* 브랜드 헤더 */}
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
                <div className="thead sticky">
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

      {/* ───────────────────────── 스타일 (여백 최소화 반영) ───────────────────────── */}
      <style>{`
        .modal-backdrop {
          position:fixed; inset:0;
          background: radial-gradient(1200px 600px at 20% 10%, rgba(168,85,247,.30), transparent 60%),
                      radial-gradient(1000px 800px at 90% 90%, rgba(59,130,246,.25), transparent 60%),
                      rgba(13,18,28,.55);
          backdrop-filter: blur(1.5px);
          z-index:1000;
        }
        .modal-shell { position: fixed; inset: 0; z-index: 1001; display: flex; align-items: center; justify-content: center; padding: clamp(12px, 2.2vw, 20px); overflow: hidden; }
        .modal {
          width: 1020px; max-width: min(96vw, 1020px);
          border-radius: 18px;
          background:
            linear-gradient(180deg, rgba(255,255,255,.70), rgba(255,255,255,.65)) padding-box,
            linear-gradient(135deg, rgba(168,85,247,.75), rgba(168,85,247,.75)) border-box;
          border: 1.6px solid transparent;
          box-shadow: 0 20px 60px rgba(16,24,40,.28), inset 0 1px 0 rgba(255,255,255,.4);
          display: flex; flex-direction: column;
          animation: pop .18s ease-out;
        }
        @keyframes pop { from { transform: scale(.985); opacity:.0 } to { transform: scale(1); opacity:1 } }

        .modal-head {
          display:flex; justify-content:space-between; align-items:center;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(2,6,23,.06);
          background: linear-gradient(180deg, rgba(255,255,255,.65), rgba(255,255,255,.35));
          border-top-left-radius: 18px; border-top-right-radius: 18px;
          position: sticky; top: 0; z-index: 5; backdrop-filter: blur(6px);
        }
        .modal-head .title { display:flex; align-items:center; gap:10px; font-weight: 900; font-size: 18px; letter-spacing:.2px; color:#0b1020; }
        .modal-head .title .dot {
          width:10px; height:10px; border-radius:50%;
          background: conic-gradient(from 210deg, #a855f7, #7c3aed, #60a5fa, #a855f7);
          box-shadow: 0 0 0 3px rgba(168,85,247,.18), 0 0 16px rgba(168,85,247,.45);
        }

        .right { display:flex; gap:8px; }
        .btn { display:flex; align-items:center; justify-content:center; line-height: 1; border:none; cursor:pointer; font-weight:800; font-size:12.5px; padding: 10px 14px; border-radius: 999px; transition: transform .08s ease, box-shadow .2s ease, background .2s ease, color .2s ease; box-shadow: 0 1px 0 rgba(255,255,255,.6) inset, 0 6px 16px rgba(2,6,23,.08); letter-spacing:.2px; }
        .btn:active { transform: translateY(1px) scale(.99); }
        .btn--primary { color:#fff; background: linear-gradient(135deg, #7c3aed, #4f46e5); box-shadow: 0 10px 18px rgba(79,70,229,.28), 0 2px 0 rgba(255,255,255,.5) inset; }
        .btn--primary:hover { box-shadow: 0 14px 24px rgba(79,70,229,.32); }
        .btn--accent { color:#0b1020; background: linear-gradient(135deg, #fbbf24, #f59e0b); box-shadow: 0 10px 18px rgba(245,158,11,.28), 0 2px 0 rgba(255,255,255,.6) inset; }
        .btn--accent:hover { box-shadow: 0 14px 24px rgba(245,158,11,.34); }
        .btn--ghost { color:#0b1020; background: linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.65)); border: 1px solid rgba(2,6,23,.08); }
        .btn--ghost:hover { background: #fff; }
        .btn--flat { background: rgba(2,6,23,.06); color:#0b1020; }
        .btn--flat:hover { background: rgba(2,6,23,.10); }

        .content-scroll { max-height: calc(100vh - 96px); overflow: auto; padding: 16px; border-bottom-left-radius: 18px; border-bottom-right-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,.66), rgba(255,255,255,.84) 10%, rgba(248,250,252,.92)); }
        .content-scroll::-webkit-scrollbar { height:10px; width:10px; }
        .content-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #a855f7, #60a5fa); border-radius: 12px; }
        .content-scroll::-webkit-scrollbar-track { background: rgba(2,6,23,.05); border-radius: 12px; }

        /* 용지(프린트 대상) — 캡처 영역 = A4 전체 (무여백) */
        .paper {
          --stroke:#0f172a;
          width: 210mm; min-height: 297mm; max-width: 100%;
          background:#ffffff;
          /* 여백/테두리/라운드 제거 → 캡처 이미지가 A4에 꽉 차도록 */
          border: none;
          border-radius: 0;
          box-shadow: none;

          color:#0b1020; margin: 0 auto; padding: 0;
          box-sizing: border-box;
          overflow: visible; /* ← 우측 절단 방지 */
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple SD Gothic Neo", "Malgun Gothic";
          font-size: 13.2px; line-height: 1.42;
          display: flex; flex-direction: column;
        }

        /* 전역 안전장치: 예기치 않은 가로 증가 방지 */
        .paper, .paper * { box-sizing: border-box; }
        .paper * { min-width: 0; }

        /* 긴 텍스트는 셀/헤더 단위에서만 처리 */
        .th, .td, .cell, .thead > div, .brand-title, .std {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Brand 헤더 */
        .brand {
          position: relative;
          display:flex; align-items:center; gap:14px;
          padding: 18px 18px;
          margin-bottom: 12px;
          border-radius: 8px;
          background:
            linear-gradient(135deg, rgba(124,58,237,.08), rgba(99,102,241,.10)) padding-box,
            linear-gradient(135deg, rgba(124,58,237,.6), rgba(124,58,237,.6)) border-box;
          border: 1px solid transparent;
        }
        .brand:before {
          content:"";
          position:absolute; inset:-1px;
          border-radius: inherit; pointer-events:none;
          background:
            radial-gradient(600px 200px at 0% 0%, rgba(124,58,237,.18), transparent 60%),
            radial-gradient(500px 160px at 90% 100%, rgba(99,102,241,.16), transparent 60%);
          filter: blur(.2px);
        }
        .brand-title { font-size: 22px; font-weight: 900; letter-spacing:.2px; }

        /* 상단 4그리드 */
        .top-grid { display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap:10px; margin-bottom:12px; }
        .box { border-radius: 10px; overflow: hidden; width:100%; background: linear-gradient(180deg, rgba(248,250,252,.85), rgba(255,255,255,.95)); border: 1px solid rgba(2,6,23,.08); box-shadow: 0 6px 16px rgba(15,23,42,.06) inset; }
        .r { display:grid; grid-template-columns: 140px minmax(0, 1fr); align-items: center; }
        .r:not(:last-child) { border-bottom:1px dashed rgba(2,6,23,.10); }
        .th { padding: 10px 10px; font-weight: 800; font-size: 12.6px; color:#334155; background: linear-gradient(180deg, #f8fafc, #eef2f7); border-right: 1px dashed rgba(2,6,23,.10); }
        .td { padding: 10px 12px; font-size: 13.6px; color:#0b1020; }
        .td.strong { font-weight: 900; color:#7c3aed; }

        .table { border-radius: 10px; overflow: hidden; width:100%; border: 1px solid rgba(2,6,23,.10); box-shadow: 0 1px 0 rgba(255,255,255,.6) inset; }
        .thead, .trow { display:grid; grid-template-columns: 100px minmax(0,1fr) 72px 120px 130px; }
        .thead { background: linear-gradient(180deg, #eef2ff, #e9d5ff); font-weight: 900; color:#1e1b4b; border-bottom: 1px solid rgba(2,6,23,.12); }
        .thead.sticky { position: sticky; top: 0; z-index: 2; }
        .thead > div { padding: 10px 11px; text-align:center; border-right:1px solid rgba(2,6,23,.08); font-size:12.8px; }
        .thead > div:last-child { border-right:none; }

        .trow { background:#fff; }
        .trow:nth-child(odd) { background: #fafafa; }
        .trow .cell { padding: 10px 11px; border-top:1px solid rgba(2,6,23,.06); border-right:1px dashed rgba(2,6,23,.08); transition: background .15s ease; }
        .trow:hover .cell { background: rgba(124,58,237,.06); }
        .trow .cell:last-child { border-right:none; }
        .trow .cell:nth-child(1) { text-align: center; color:#334155; }
        .trow .cell.desc { text-align: left; color:#0b1020; }
        .trow .cell.qty { text-align: center; color:#334155; }
        .num { text-align:right; font-variant-numeric: tabular-nums; color:#111827; }

        .between-gap { height: 10px; }
        .summary { border-radius: 10px; overflow: hidden; width:100%; border: 1px solid rgba(2,6,23,.10); background: linear-gradient(180deg, rgba(248,250,252,.95), #ffffff); }
        .srow { display:grid; grid-template-columns: 160px minmax(0,1fr); align-items:center; }
        .srow:not(:last-child) { border-bottom:1px dashed rgba(2,6,23,.10); }
        .sth { padding: 12px 12px; font-weight: 900; font-size: 14.2px; color:#334155; background: linear-gradient(180deg, #f8fafc, #eef2ff); border-right:1px dashed rgba(2,6,23,.10); }
        .sth.center { text-align:center; }
        .std { padding: 12px 12px; font-size: 15px; color:#0b1020; }
        .std.big { font-size: 22px; font-weight: 900; color:#7c3aed; text-shadow: 0 1px 0 rgba(255,255,255,.6); }
        .std.big2 { font-size: 18px; font-weight: 800; color:#0b1020; overflow-wrap: anywhere; }
        .std.red { color:#b91c1c; }

        @media print {
          .modal-backdrop, .modal-shell { display:none !important; }
          .paper { box-shadow:none; border: none; border-radius: 0; padding: 0; }
        }
      `}</style>
    </>
  );
}
