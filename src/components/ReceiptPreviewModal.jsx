// src/components/ReceiptPreviewModal.js
import React, { useRef } from "react";
import * as htmlToImage from "html-to-image";
import { jsPDF } from "jspdf";
import "./ReceiptPreviewModal.css";

/** 출력/합성 기본값 */
const A4_MM = { w: 210, h: 297 };
const DPI = 300;
const JPEG_QUALITY = 0.95;

/* A4 외곽 경계 안전 인셋(mm) */
const OUTPUT_INSET_MM = { top: 1, right: 1, bottom: 1, left: 1 };

/* html-to-image 캡처 보정 */
const SAFE_CANVAS_PAD_PX = 2;
/* ★ 하단/우측 블리드(여분) — 마지막 1~2px 잘림 방지용 */
const CAPTURE_BLEED_BOTTOM_PX = 18;
const CAPTURE_BLEED_RIGHT_PX  = 6;

/* 라스터/부동소수점 오차 방지용: 아주 미세한 스케일 다운 */
const SAFETY_SCALE = 0.996; // 약 -0.4%

/* utils */
const mmToPx = (mm) => Math.round((mm * DPI) / 25.4);
const fmt = (v) => String(v ?? "").trim();
const num = (v) => Number(String(v ?? "").replace(/[^0-9\-]/g, "")) || 0;

const PAGE_PX = { w: mmToPx(A4_MM.w), h: mmToPx(A4_MM.h) };
const INSET_PX = {
  top: mmToPx(OUTPUT_INSET_MM.top),
  right: mmToPx(OUTPUT_INSET_MM.right),
  bottom: mmToPx(OUTPUT_INSET_MM.bottom),
  left: mmToPx(OUTPUT_INSET_MM.left),
};
const INNER_PX = {
  w: PAGE_PX.w - (INSET_PX.left + INSET_PX.right),
  h: PAGE_PX.h - (INSET_PX.top + INSET_PX.bottom),
};

const formatKDateLong = (str) => {
  if (!str) return "";
  const d = new Date(str);
  if (isNaN(+d)) return str;
  const wd = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(d);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${wd}`;
};

/* === 캡처: .rpm-a4 전체를 PNG로 (블리드 포함) === */
async function captureA4AsPngDataUrl(node /* .rpm-a4 */) {
  // 미리보기 scale과 무관하게 실제 content 전체 기준으로 캡처
  const width  = Math.ceil(node.scrollWidth)  + SAFE_CANVAS_PAD_PX + CAPTURE_BLEED_RIGHT_PX;
  const height = Math.ceil(node.scrollHeight) + SAFE_CANVAS_PAD_PX + CAPTURE_BLEED_BOTTOM_PX;

  const pr =
    typeof window !== "undefined" && window.devicePixelRatio
      ? Math.max(2, Math.min(3, window.devicePixelRatio))
      : 2;

  const canvas = await htmlToImage.toCanvas(node, {
    backgroundColor: "#fff",
    pixelRatio: pr,
    width,
    height,
    style: {
      /* ★ 클론 노드에 우/하단 패딩을 주어 콘텐츠 끝까지 포함시킴 */
      paddingRight: `${CAPTURE_BLEED_RIGHT_PX}px`,
      paddingBottom: `${CAPTURE_BLEED_BOTTOM_PX}px`,
      transform: "none",           // 미리보기 scale 무시
      transformOrigin: "top left",
      overflow: "visible",
      boxSizing: "border-box",
    },
    canvasWidth: Math.round(width * pr),
    canvasHeight: Math.round(height * pr),
  });

  return canvas.toDataURL("image/png");
}

/* === 최종 합성: Top 정렬 + 비율 유지 fit + 미세 안전 스케일 === */
async function composeA4PageDataUrl(
  rawDataUrl,
  { mime = "image/jpeg", quality = JPEG_QUALITY } = {}
) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = rawDataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = PAGE_PX.w;
  canvas.height = PAGE_PX.h;
  const ctx = canvas.getContext("2d");

  // 배경
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PAGE_PX.w, PAGE_PX.h);

  // 비율 유지 fit + 아주 미세한 안전 축소
  const baseScale = Math.min(INNER_PX.w / img.width, INNER_PX.h / img.height);
  const scale = baseScale * SAFETY_SCALE;

  const drawW = img.width * scale;  // 소수점 유지
  const drawH = img.height * scale;

  // 좌우 중앙, 세로 상단 정렬 → 하단 절대 잘림 없음 (남는 여백은 아래로 몰림)
  const x = Math.round(INSET_PX.left + (INNER_PX.w - drawW) / 2);
  const y = INSET_PX.top;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x, y, drawW, drawH);

  return canvas.toDataURL(mime, quality);
}

/* === 인쇄: A4 mm 고정 === */
function printFinalPageImage(finalA4DataUrl) {
  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0",
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  const style = `
    @page { size: A4 portrait; margin: 0; }
    html, body { margin:0; padding:0; }
    .page { width: 210mm; height: 297mm; }
    img.final { width: 210mm; height: 297mm; display:block; }
  `;
  doc.open();
  doc.write(`
    <html>
      <head><meta charset="utf-8"/><title>영수증</title><style>${style}</style></head>
      <body>
        <div class="page">
          <img class="final" src="${finalA4DataUrl}" alt="receipt-final"/>
        </div>
      </body>
    </html>
  `);
  doc.close();

  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 50);
    setTimeout(() => document.body.removeChild(iframe), 300);
  };
}

/* === 컴포넌트 === */
export default function ReceiptPreviewModal({ open, row, onClose }) {
  const a4Ref = useRef(null);
  if (!open || !row) return null;

  const items = Array.isArray(row.items) ? row.items : [];
  const itemsSum = items.reduce((acc, it) => {
    const qty = num(it?.qty);
    const unit = num(it?.unitPrice);
    const amt = num(it?.amount || qty * unit);
    return acc + (isNaN(amt) ? 0 : amt);
  }, 0);
  const total = num(row.totalAmount) || itemsSum;

  const baseName = () => {
    const ymd = fmt(row.issueDate || "").replace(/-/g, "");
    const v = fmt(row.villaName);
    const u = fmt(row.unitNumber);
    return `${ymd}${v}${u}`.replace(/[\\/:*?"<>|]/g, "") || "receipt";
  };

  const doPrint = async () => {
    if (!a4Ref.current) return;
    const raw = await captureA4AsPngDataUrl(a4Ref.current);
    const finalA4 = await composeA4PageDataUrl(raw, { mime: "image/png" });
    printFinalPageImage(finalA4);
  };
  const saveJPG = async () => {
    if (!a4Ref.current) return;
    const raw = await captureA4AsPngDataUrl(a4Ref.current);
    const finalA4 = await composeA4PageDataUrl(raw, {
      mime: "image/jpeg",
      quality: JPEG_QUALITY,
    });
    const a = document.createElement("a");
    a.href = finalA4;
    a.download = `${baseName()}.jpg`;
    a.click();
  };
  const savePDF = async () => {
    if (!a4Ref.current) return;
    const raw = await captureA4AsPngDataUrl(a4Ref.current);
    const finalA4 = await composeA4PageDataUrl(raw, {
      mime: "image/jpeg",
      quality: JPEG_QUALITY,
    });
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    pdf.addImage(finalA4, "JPEG", 0, 0, A4_MM.w, A4_MM.h, undefined, "FAST");
    pdf.save(`${baseName()}.pdf`);
  };

  return (
    <>
      <div className="rpm-backdrop" onClick={onClose} />
      <div className="rpm-shell" onClick={onClose}>
        <div className="rpm-modal" onClick={(e) => e.stopPropagation()}>
          {/* 헤더 */}
          <div className="rpm-head">
            <div className="rpm-title">
              <span className="rpm-bullet" />
              영수증 미리보기
            </div>
            <div className="rpm-actions">
              <button className="rpm-btn rpm-btn--ghost" onClick={doPrint}>인쇄</button>
              <button className="rpm-btn rpm-btn--accent" onClick={saveJPG}>JPG 저장</button>
              <button className="rpm-btn rpm-btn--primary" onClick={savePDF}>PDF 저장</button>
              <button className="rpm-btn rpm-btn--flat" onClick={onClose}>닫기</button>
            </div>
          </div>

          {/* 스크롤 영역 */}
          <div className="rpm-scroll">
            {/* 화면용 카드 */}
            <div className="rpm-paper">
              {/* ✅ 캡처 타깃: A4 실내용 */}
              <div className="rpm-a4" ref={a4Ref}>
                {/* 브랜드 */}
                <div className="rpm-brand">
                  <div className="rpm-brand-title">{fmt(row.receiptName) || "한남주택관리 영수증"}</div>
                </div>

                {/* 상단 4그리드 */}
                <div className="rpm-grid4">
                  <div className="rpm-box">
                    <div className="rpm-row"><div className="rpm-th">상호</div><div className="rpm-td">{fmt(row.companyName) || "한남주택관리"}</div></div>
                    <div className="rpm-row"><div className="rpm-th">사업자등록번호</div><div className="rpm-td">{fmt(row.bizNo) || "763-03-01741"}</div></div>
                    <div className="rpm-row"><div className="rpm-th">입금계좌</div><div className="rpm-td">{fmt(row.account) || "농협 0424898555-009 (이세구)"}</div></div>
                  </div>
                  <div className="rpm-box">
                    <div className="rpm-row"><div className="rpm-th">전화번호</div><div className="rpm-td">{fmt(row.phone) || "042-489-8555"}</div></div>
                    <div className="rpm-row"><div className="rpm-th">팩스</div><div className="rpm-td">{fmt(row.fax) || "042-367-7555"}</div></div>
                    <div className="rpm-row"><div className="rpm-th">전자 메일</div><div className="rpm-td">{fmt(row.email) || "hannam8555@naver.com"}</div></div>
                  </div>
                  <div className="rpm-box">
                    <div className="rpm-row"><div className="rpm-th">공급받는자</div><div className="rpm-td">{fmt(row.recipient) || "-"}</div></div>
                    <div className="rpm-row"><div className="rpm-th">발행일</div><div className="rpm-td">{formatKDateLong(row.issueDate)}</div></div>
                    <div className="rpm-row"><div className="rpm-th">청구금액</div><div className="rpm-td rpm-td--strong">₩ {total.toLocaleString()}</div></div>
                  </div>
                  <div className="rpm-box">
                    <div className="rpm-row"><div className="rpm-th">주소지</div><div className="rpm-td">{fmt(row.address)}</div></div>
                    <div className="rpm-row"><div className="rpm-th">빌라명</div><div className="rpm-td">{fmt(row.villaName)}</div></div>
                    <div className="rpm-row"><div className="rpm-th">나머지 주소</div><div className="rpm-td">{fmt(row.unitNumber)}</div></div>
                  </div>
                </div>

                {/* 품목 테이블 */}
                <div className="rpm-table">
                  <div className="rpm-thead">
                    <div>날짜</div><div>품목(내용)</div><div>수량</div><div>단가</div><div>금액</div>
                  </div>
                  {Array.from({ length: 16 }).map((_, i) => {
                    const it = items[i] || {};
                    const date = fmt(it.date);
                    const desc = fmt(it.description);
                    const qty = num(it.qty);
                    const unit = num(it.unitPrice);
                    const amt = num(it.amount || qty * unit);
                    return (
                      <div className="rpm-trow" key={i}>
                        <div className="rpm-cell">{date}</div>
                        <div className="rpm-cell rpm-cell--desc">{desc}</div>
                        <div className="rpm-cell rpm-cell--qty">{qty ? qty.toLocaleString() : ""}</div>
                        <div className="rpm-cell rpm-cell--num">{unit ? unit.toLocaleString() : ""}</div>
                        <div className="rpm-cell rpm-cell--num">{(desc || date) ? amt.toLocaleString() : "-"}</div>
                      </div>
                    );
                  })}
                </div>

                {/* 합계/안내 */}
                <div className="rpm-summary">
                  <div className="rpm-srow">
                    <div className="rpm-sth center">청구 금액</div>
                    <div className="rpm-std big red">₩ {total.toLocaleString()}</div>
                  </div>
                  <div className="rpm-srow">
                    <div className="rpm-sth center">입금계좌</div>
                    <div className="rpm-std big2">{fmt(row.account) || "농협 0424898555-009 (이세구)"}</div>
                  </div>
                </div>
              </div>
              {/* // .rpm-a4 */}
            </div>
            {/* // .rpm-paper */}
          </div>
        </div>
      </div>
    </>
  );
}
