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
    const amt = Number(it?.amount ?? (Number(it?.qty || 0) * Number(String(it?.unitPrice || 0).replace(/[^0-9]/g, ""))));
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
    const dataUrl = await htmlToImage.toJpeg(paperRef.current, { backgroundColor: "#fff", quality: 0.96, pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${baseName()}.jpg`;
    a.click();
  };

  const savePDF = async () => {
    const mod = await import("jspdf").catch(() => null);
    if (!mod?.default) {
      const png = await htmlToImage.toPng(paperRef.current, { backgroundColor: "#fff", pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = png;
      a.download = `${baseName()}.png`;
      a.click();
      alert("PDF 모듈(jspdf)이 없어 PNG로 저장했습니다. (npm i jspdf 설치 시 PDF 가능)");
      return;
    }
    const jsPDF = mod.default;
    const dataUrl = await htmlToImage.toPng(paperRef.current, { backgroundColor: "#fff", pixelRatio: 2 });
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

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" onClick={(e)=>e.stopPropagation()}>
        <div className="modal-head">
          <div className="title">영수증 미리보기</div>
          <div className="right">
            <button className="btn primary" onClick={saveJPG}>JPG 저장</button>
            <button className="btn" onClick={savePDF}>PDF 저장</button>
            <button className="btn ghost" onClick={onClose}>닫기</button>
          </div>
        </div>

        <div className="paper" ref={paperRef}>
          {/* 상단 헤더 바: 영수증 이름 */}
          <div className="brand">
            <div className="brand-title">{s(row.receiptName) || "한남주택관리 영수증"}</div>
          </div>

          {/* 상단 정보 4그리드 */}
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
            <div className="thead">
              <div>날짜</div><div>품목(내용)</div><div>수량</div><div>단가</div><div>금액</div>
            </div>
            {Array.from({ length: Math.max(items.length, 10) }).map((_, i) => {
              const it = items[i];
              const date = it?.date || "";
              const desc = it?.description || "";
              const qty  = Number(it?.qty || 0);
              const unit = Number(it?.unitPrice || 0);
              const amt  = Number(it?.amount || qty * unit || 0);
              return (
                <div className="trow" key={i}>
                  <div className="cell">{date}</div>
                  <div className="cell text-ell">{desc}</div>
                  <div className="cell num">{qty ? qty.toLocaleString() : ""}</div>
                  <div className="cell num">{unit ? unit.toLocaleString() : ""}</div>
                  <div className="cell num">{amt ? amt.toLocaleString() : (desc || date ? "0" : "-")}</div>
                </div>
              );
            })}
          </div>

          {/* 하단 요약 — 요청대로 입금자명/발행일 제거, 청구금액/입금계좌만 */}
          <div className="summary">
            <div className="srow">
              <div className="sth">청구 금액</div>
              <div className="std big red">₩ {total.toLocaleString()}</div>
            </div>
            <div className="srow">
              <div className="sth">입금계좌</div>
              <div className="std">{COMPANY.account}</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        /* 모달 프레임 */
        .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:1000; }
        .modal { position:fixed; inset:6vh 0 auto 0; margin:0 auto; width:980px; max-width:96vw; z-index:1001; }
        .modal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; color:#111; }
        .modal-head .title { font-weight:800; font-size:18px; }
        .right { display:flex; gap:8px; }
        .btn { background:#eef2f7; border:none; border-radius:10px; padding:8px 12px; font-weight:700; cursor:pointer; }
        .btn.primary { background:#7A5FFF; color:#fff; }
        .btn.ghost { background:#f6f7fb; }

        /* 종이 — 깔끔/세련 + 줄바꿈 금지 */
        .paper {
          --stroke:#1f2937; --muted:#f3f4f6;
          width:820px; max-width:96vw; margin:0 auto; padding:18px 18px 16px;
          background:#fff; border:1.2px solid var(--stroke); border-radius:16px;
          box-shadow: 0 10px 30px rgba(16,24,40,.12);
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple SD Gothic Neo", "Malgun Gothic";
          color:#111827;
          white-space: nowrap;          /* ✅ 자동 줄바꿈 X */
          overflow: hidden;
        }

        /* 상단 브랜드 바(제목) */
        .brand {
          display:flex; align-items:center; justify-content:flex-start;
          background: linear-gradient(90deg, #7A5FFF, #5B8CFF);
          color:#fff; padding:10px 14px; border-radius:12px; margin-bottom:14px;
          letter-spacing:.2px;
        }
        .brand-title { font-size:18px; font-weight:900; }

        /* 상단 4그리드 박스 */
        .top-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
        .box { border:1.2px solid var(--stroke); border-radius:10px; overflow:hidden; }
        .r { display:grid; grid-template-columns:160px 1fr; }
        .r:not(:last-child) { border-bottom:1px solid #e5e7eb; }
        .th { background:#f8fafc; padding:9px 10px; font-weight:800; border-right:1px solid #e5e7eb; }
        .td { padding:9px 12px; }
        .td.strong { font-weight:900; }

        /* 테이블 */
        .table { border:1.2px solid var(--stroke); border-radius:10px; overflow:hidden; }
        .thead, .trow { display:grid; grid-template-columns:160px 1fr 120px 160px 160px; }
        .thead { background:#f1f5f9; font-weight:900; }
        .thead > div { padding:10px 12px; text-align:center; border-right:1px solid #e5e7eb; }
        .thead > div:last-child { border-right:none; }
        .trow .cell { padding:10px 12px; border-top:1px solid #eef2f7; border-right:1px solid #f3f4f6; }
        .trow .cell:last-child { border-right:none; }
        .num { text-align:right; font-variant-numeric: tabular-nums; }
        .text-ell { overflow:hidden; text-overflow:ellipsis; }

        /* 요약 박스(하단) */
        .summary { margin-top:12px; border:1.2px solid var(--stroke); border-radius:10px; overflow:hidden; }
        .srow { display:grid; grid-template-columns: 160px 1fr; }
        .srow:not(:last-child) { border-bottom:1px solid #e5e7eb; }
        .sth { padding:10px 12px; background:#f8fafc; font-weight:900; border-right:1px solid #e5e7eb; }
        .std { padding:10px 12px; }
        .std.big { font-size:18px; font-weight:900; }
        .std.red { color:#d10; }
      `}</style>
    </>
  );
}
