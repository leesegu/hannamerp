import React, { useRef } from "react";
import * as htmlToImage from "html-to-image";
import { jsPDF } from "jspdf";

/* ────────────────────────────────────────────────────────────────────
   공통 설정: A4 규격 + 균일 여백 + 출력 해상도
   ──────────────────────────────────────────────────────────────────── */
const A4_MM = { w: 210, h: 297 };
const DPI = 300;                 // JPG/PDF용 권장 해상도
const PAD_MM = 6;               // 상하좌우 동일 여백(mm)
const JPEG_QUALITY = 0.95;

/* ★ 좌우만 늘리는 스트레치 계수 (1.00=변화 없음, 1.20=가로 20% 확대) */
const H_STRETCH = 1.20;

const mmToPx = (mm) => Math.round((mm * DPI) / 25.4);
const PAGE_PX = { w: mmToPx(A4_MM.w), h: mmToPx(A4_MM.h) };
const PAD_PX = mmToPx(PAD_MM);
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
   1) DOM 캡처 → PNG
   2) A4 캔버스에 합성 (세로 고정 + 가로만 스트레치)
   ──────────────────────────────────────────────────────────────────── */
async function captureReceiptAsPngDataUrl(node) {
  return htmlToImage.toPng(node, {
    backgroundColor: "#fff",
    pixelRatio: 2,
  });
}

/* ★ 세로를 INNER에 '정확히' 맞추고, 가로만 H_STRETCH 만큼 비율 깨서 늘림 */
async function composeA4PageDataUrl(
  rawDataUrl,
  {
    mime = "image/jpeg",            // "image/jpeg" | "image/png"
    quality = JPEG_QUALITY,
    alignX = "center",              // "left" | "center" | "right" (가로 정렬)
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

  // A4 캔버스 생성
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_PX.w;
  canvas.height = PAGE_PX.h;
  const ctx = canvas.getContext("2d");

  // 배경 흰색
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PAGE_PX.w, PAGE_PX.h);

  // ① 세로를 INNER 높이에 '정확히' 맞춤 (세로 고정)
  const baseScale = INNER_PX.h / img.height;
  const drawH = Math.round(img.height * baseScale);

  // ② 가로만 스트레치 (비율 깨서 좌우만 늘림)
  const drawW = Math.round(img.width * baseScale * H_STRETCH);

  // ③ 가로 정렬
  let x;
  if (alignX === "left") x = PAD_PX;
  else if (alignX === "right") x = PAD_PX + (INNER_PX.w - drawW);
  else x = PAD_PX + Math.round((INNER_PX.w - drawW) / 2);

  const y = PAD_PX; // 세로는 딱 맞추므로 위쪽부터 채움

  // ④ INNER 영역을 clip → 스트레치로 넘친 좌우는 가려짐(잘려 보임 X, 영역 밖 masking)
  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD_PX, PAD_PX, INNER_PX.w, INNER_PX.h);
  ctx.clip();

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x, y, drawW, drawH);
  ctx.restore();

  return canvas.toDataURL(mime, quality);
}

/* 인쇄 (최종 페이지 이미지를 iframe에 넣고 @page 여백 0으로 출력) */
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
    img.final { width:100%; height:100%; display:block; object-fit:fill; }
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
    const finalPage = await composeA4PageDataUrl(raw, { mime: "image/png", alignX: "center" });
    printFinalPageImage(finalPage);
  };

  const saveJPG = async () => {
    if (!paperRef.current) return;
    const raw = await captureReceiptAsPngDataUrl(paperRef.current);
    const finalPage = await composeA4PageDataUrl(raw, {
      mime: "image/jpeg",
      quality: JPEG_QUALITY,
      alignX: "center",
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
      alignX: "center",
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
          <div className="modal-head">
            <div className="title">영수증 미리보기</div>
            <div className="right">
              <button className="btn print" onClick={handlePrint}>인쇄</button>
              <button className="btn jpg" onClick={saveJPG}>JPG 저장</button>
              <button className="btn pdf" onClick={savePDF}>PDF 저장</button>
              <button className="btn close" onClick={onClose}>닫기</button>
            </div>
          </div>

          {/* 세로 스크롤만 허용 */}
          <div className="content-scroll">
            <div className="paper" ref={paperRef}>
              {/* 주황 헤더 */}
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

      {/* 모달/미리보기 전용 스타일 (화면용) */}
      <style>{`
        .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:1000; }
        .modal-shell { position: fixed; inset: 0; z-index: 1001; display: flex; align-items: center; justify-content: center; padding: 16px; overflow: hidden; }
        .modal { width: 980px; max-width: min(96vw, 980px); background: transparent; display: flex; flex-direction: column; }
        .modal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; color:#111; }
        .modal-head .title { font-weight:800; font-size:17px; }
        .right { display:flex; gap:10px; }
        .btn { border:none; border-radius:10px; padding:9px 14px; font-weight:700; cursor:pointer; font-size:12.5px; display:inline-flex; align-items:center; background:#eef2f7; color:#111; }
        .btn.print { background:#111827; color:#fff; }
        .btn.jpg   { background:#0ea5a4; color:#fff; }
        .btn.pdf   { background:#7c3aed; color:#fff; }
        .btn.close { background:#e5e7eb; color:#111; }

        .content-scroll { max-height: calc(100vh - 72px); overflow-y: auto; overflow-x: hidden; padding-right: 6px; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }

        .paper {
          --stroke:#121316;
          width: 210mm; min-height: 297mm;
          max-width: 100%; background:#fff;
          border:1.4px solid var(--stroke); border-radius:14px;
          box-shadow: 0 12px 34px rgba(16,24,40,.12);
          color:#111827; margin: 0 auto; padding: 32px 26px 36px;
          box-sizing: border-box; overflow: hidden;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple SD Gothic Neo", "Malgun Gothic";
          font-size: 13.25px; line-height: 1.42; white-space: nowrap;
          display: flex; flex-direction: column;
        }

        .brand { display:flex; align-items:center; justify-content:flex-start; background: linear-gradient(90deg, #FF7A00, #FFB84D); color:#fff; padding: 22px 26px; border-radius:12px; margin-bottom:18px; letter-spacing:.2px; }
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
        .sth { padding:14px 14px; background:#f8fafc; font-weight:900; border-right:1.4px solid var(--stroke); font-size:15px; }
        .sth.center { text-align:center; }
        .std { padding:14px 14px; font-size:15px; }
        .std.big { font-size:20px; font-weight:900; }
        .std.big2 { font-size:18px; font-weight:700; }
        .std.red { color:#d10; }
      `}</style>
    </>
  );
}
