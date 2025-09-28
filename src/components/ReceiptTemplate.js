// components/ReceiptTemplate.js
import React from "react";

/* 로고 기본 경로 */
import headerLogoDefault from "../assets/logo-header.png";   // 상단 로고
import brandLogoDefault from "../assets/logo-brand.png";     // 하단 로고

export default function ReceiptTemplate({
  item,
  refProp,
  logoSrc = headerLogoDefault,
  brandLogoSrc = brandLogoDefault,
}) {
  if (!item) return null;

  /* ===== Utils ===== */
  const parseAmount = (value) =>
    parseFloat((value || "0").toString().replace(/,/g, "")) || 0;
  const fmtWON = (value) => `${parseAmount(value).toLocaleString("ko-KR")}원`;
  const has = (v) => parseAmount(v) > 0;

  /* ===== Theme (세련된 뉴트럴 & 소프트 포인트) ===== */
  const C = {
    paper: "#ffffff",
    ink: "#0b1220",
    sub: "#475569",
    line: "#e5e7eb",
    lineBold: "#d1d5db",
    accent: "#0ea5a8",        // 소프트 티얼
    brand: "#6b7280",
    total: "#111827",
    headerFrom: "#1f2937",    // slate-800
    headerTo:   "#374151",    // slate-700
    totalFrom:  "#f9fafb",    // gray-50
    totalTo:    "#eef2f7",    // soft gray-blue
  };

  /* ===== Data ===== */
  const rows = [
    has(item.arrears)     ? { label: "미납관리비",  value: fmtWON(item.arrears) }   : null,
    has(item.currentFee)  ? { label: "당월관리비",  value: fmtWON(item.currentFee) } : null,
    has(item.waterCost)   ? { label: "수도요금",    value: fmtWON(item.waterCost) }  : null,
    has(item.electricity) ? { label: "전기요금",    value: fmtWON(item.electricity)} : null,
    has(item.tvFee)       ? { label: "TV 수신료",   value: fmtWON(item.tvFee) }      : null,
    has(item.cleaning)    ? { label: "청소비용",    value: fmtWON(item.cleaning) }   : null,
  ].filter(Boolean);

  const defects = Array.isArray(item.defects) ? item.defects : [];
  const villaRoomText = [item?.name, item?.roomNumber].filter(Boolean).join(" ");

  return (
    <div className="rc-wrap">
      <style>{`
        /* ===== 전역 폰트 선명도 향상 ===== */
        .rc-wrap, .rc-wrap * {
          box-sizing: border-box;
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
        }
        .rc-sheet {
          /* 폰트 렌더링 최적화 (가독 중심) */
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: geometricPrecision;
          font-feature-settings: "pnum" on, "lnum" on; /* 숫자 가독성 */
        }

        .rc-wrap {
          width: 100%;
          display: grid;
          place-items: center;
          padding: 16px;
          background: transparent;
        }
        /* ⚠ 외부 CSS의 중앙정렬 영향 제거 */
        .rc-wrap, .rc-sheet, .rc-section, .rc-header, .rc-rows, .rc-row, .rc-table, .rc-tr, .rc-subtable, .rc-subrow, .rc-footer {
          text-align: left !important;
        }

        /* ===== 시트 크기 (PC와 동일 픽셀 폭 유지) ===== */
        .rc-sheet {
          width: 560px;
          max-width: 100%;
          background: ${C.paper};
          color: ${C.ink};
          border: 1px solid ${C.line};
          border-radius: 14px;
          box-shadow: 0 6px 18px rgba(17,24,39,.05);
          overflow: clip;
          font-family: 'Noto Sans KR', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        }
        .rc-section { padding: 14px 16px; }
        .rc-section.slim { padding: 10px 16px; }

        /* ===== Header (3열 고정) ===== */
        .rc-header {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 14px;
          border-bottom: 1px solid ${C.line};
          background: linear-gradient(135deg, ${C.headerFrom} 0%, ${C.headerTo} 100%);
        }
        .rc-logo {
          width: 48px; height: 48px; border-radius: 10px;
          object-fit: cover; border: none; background: transparent;
          display: block;
        }
        .rc-htitles { min-width: 0; }
        .rc-title {
          margin: 0;
          font-size: 17px;
          font-weight: 900;
          letter-spacing: .01em;
          color: #ffffff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .rc-subtitle {
          margin-top: 2px;
          font-size: 11.5px;
          color: rgba(255,255,255,.9);
          font-weight: 800; /* 살짝 두껍게 → 선명도 */
          letter-spacing: .005em;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .rc-meta {
          display: grid;
          gap: 6px;
          justify-items: end;
          min-width: 0;
        }
        .rc-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 8px;
          font-size: 11.5px; font-weight: 900; /* 또렷하게 */
          color: #f8fafc;
          background: rgba(255,255,255,.10);
          border: 1px solid rgba(255,255,255,.28);
          border-radius: 999px;
          white-space: nowrap; max-width: 240px; overflow: hidden; text-overflow: ellipsis;
        }
        .rc-chip .ico { font-size: 12px; line-height: 1; }

        /* ===== Info ===== */
        .rc-hgroup { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .rc-hbadge {
          width: 16px; height: 16px; border-radius: 6px;
          display: grid; place-items: center;
          background: rgba(14,165,168,.15); color: ${C.accent};
          font-size: 11px; font-weight: 900;
        }
        .rc-htext { font-size: 12.5px; font-weight: 1000; letter-spacing: .02em; }
        .rc-rows { display: grid; gap: 6px; }
        .rc-row {
          display: grid; grid-template-columns: 120px 1fr;
          align-items: center; padding: 8px 0;
          border-bottom: 1px dashed ${C.line};
        }
        .rc-row:last-child { border-bottom: 0; }
        .rc-label { font-size: 12px; color: ${C.sub}; font-weight: 900; letter-spacing: .01em; }
        .rc-value { font-size: 13.5px; color: ${C.ink}; font-weight: 800; line-height: 1.45; word-break: keep-all; }

        /* ===== Items Table ===== */
        .rc-table { width: 100%; border: 1px solid ${C.lineBold}; border-radius: 10px; overflow: hidden; }
        .rc-thead { display: grid; grid-template-columns: 1fr 180px; background: #f6f7f9; border-bottom: 1px solid ${C.lineBold}; }
        .rc-th, .rc-td { padding: 10px 12px; font-size: 12.5px; }
        .rc-th { font-weight: 1000; color: ${C.sub}; letter-spacing: .01em; }
        .rc-tr { display: grid; grid-template-columns: 1fr 180px; border-bottom: 1px solid ${C.line}; background: #fff; }
        .rc-tr:last-child { border-bottom: 0; }
        .rc-td { min-width: 0; display: flex; align-items: center; justify-content: flex-start; font-weight: 800; }
        .rc-td.amount { justify-content: flex-end; font-variant-numeric: tabular-nums; font-weight: 1000; color: ${C.ink}; }

        /* ===== Sub Items ===== */
        .rc-subtable { margin-top: 8px; border: 1px dashed ${C.lineBold}; border-radius: 10px; overflow: hidden; }
        .rc-subhead { background: #f8fafc; border-bottom: 1px dashed ${C.lineBold}; padding: 8px 12px; font-size: 12.5px; font-weight: 1000; color: ${C.sub}; }
        .rc-subrow { display: grid; grid-template-columns: 1fr 160px; padding: 8px 12px; border-bottom: 1px dashed ${C.line}; background: #fff; }
        .rc-subrow:last-child { border-bottom: 0; }
        .rc-subdesc { font-size: 12.5px; color: ${C.ink}; font-weight: 800; min-width: 0; display: flex; align-items: center; justify-content: flex-start; }
        .rc-subamt { text-align: right; font-size: 12.5px; font-weight: 1000; color: ${C.ink}; font-variant-numeric: tabular-nums; display: flex; align-items: center; justify-content: flex-end; }

        /* ===== Total ===== */
        .rc-total {
          display: grid; grid-template-columns: 1fr auto;
          align-items: center; gap: 10px;
          padding: 14px 16px;
          border: 1px solid ${C.lineBold};
          border-radius: 12px;
          background: linear-gradient(180deg, ${C.totalFrom}, ${C.totalTo});
        }
        .rc-total .lbl { font-size: 16px; font-weight: 1000; color: ${C.ink}; letter-spacing: .02em; }
        .rc-total .amt { font-size: 22px; font-weight: 1000; color: ${C.accent}; font-variant-numeric: tabular-nums; letter-spacing: .01em; }

        /* ===== Deposit (입금 정보: 3열 그리드 · 가운데 칼럼 넓게)
           - 세로 여백(세로폭) 축소
        ===== */
        .rc-deposit {
          padding: 8px 12px;                 /* ⬅ 10px → 8px */
          border: 1px solid ${C.line};
          border-radius: 10px;
          background: #f9fafb;
          display: grid;
          gap: 8px;                          /* 타이틀/그리드 사이 간격 유지 */
        }
        .rc-deposit .title {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 1000;
          color: ${C.sub};
        }

        .rc-deposit .grid3 {
          display: grid;
          grid-template-columns: 0.85fr 1.3fr 0.85fr;  /* 가운데(계좌번호) 넓게 */
          gap: 6px 12px;                      /* ⬅ 세로 8px → 6px */
        }

        .rc-deposit .ditem {
          background: #ffffff;
          border: 1px solid ${C.line};
          border-radius: 8px;
          padding: 6px 8px;                   /* ⬅ 10px → 6px 8px */
          display: grid;
          gap: 4px;                           /* ⬅ 6px → 4px */
          text-align: center;                 /* 제목 + 값 가운데 정렬 */
          min-width: 0;
        }
        .rc-deposit .dlabel {
          font-size: 14px;                    /* 제목 크게 유지 */
          font-weight: 1000;
          color: ${C.sub};
          letter-spacing: .01em;
          white-space: nowrap;
        }
        .rc-deposit .dvalue {
          font-size: 14px;
          font-weight: 900;
          color: ${C.ink};
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .rc-deposit .dvalue.mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-variant-numeric: tabular-nums;
          letter-spacing: .02em;
          font-size: 16px;                    /* 계좌번호 약간 크게 */
          font-weight: 1000;
        }

        /* ===== Notice ===== */
        .rc-notice {
          padding: 12px 14px;
          border: 1px solid ${C.line};
          border-radius: 10px;
          background: #fafafa;
        }
        .rc-notice .title { font-size: 12.5px; font-weight: 1000; color: ${C.sub}; margin-bottom: 6px; letter-spacing: .01em; }
        .rc-notice .body { font-size: 12.5px; line-height: 1.6; color: ${C.brand}; white-space: pre-wrap; word-break: keep-all; font-weight: 700; }

        /* ===== Footer ===== */
        .rc-footer { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 14px 16px; border-top: 1px dashed ${C.line}; background: #fff; }
        .rc-brand { width: 26px; height: 26px; border-radius: 7px; object-fit: cover; border: none; background: transparent; display:block; }
        .rc-brandname { font-size: 15px; font-weight: 1000; letter-spacing: .04em; color: ${C.brand}; }

        /* ✅ 반응형 규칙 제거: 모바일도 PC와 동일하게 보이도록 @media (max-width) 없음 */

        /* Print */
        @media print {
          .rc-wrap { padding: 0 !important; }
          .rc-sheet { width: 100%; max-width: unset; border-radius: 0; box-shadow: none; border: 0; }
          .rc-section { padding: 10pt 12pt; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="rc-sheet" ref={refProp}>
        {/* Header */}
        <div className="rc-section rc-header">
          <img src={logoSrc} alt="logo" className="rc-logo" />
          <div className="rc-htitles">
            <h1 className="rc-title">이사정산 영수증</h1>
            <div className="rc-subtitle">HanNam Housing Management</div>
          </div>
          <div className="rc-meta">
            {item.moveOutDate && (
              <span className="rc-chip"><span className="ico">📅</span>{item.moveOutDate}</span>
            )}
            {villaRoomText && (
              <span className="rc-chip"><span className="ico">🏠</span>{villaRoomText}</span>
            )}
          </div>
        </div>

        {/* Basic Info */}
        <div className="rc-section">
          <div className="rc-hgroup">
            <span className="rc-hbadge">i</span>
            <div className="rc-htext">기본 정보</div>
          </div>
          <div className="rc-rows">
            <div className="rc-row"><div className="rc-label">이사날짜</div><div className="rc-value">{item.moveOutDate || "-"}</div></div>
            <div className="rc-row"><div className="rc-label">빌라명</div><div className="rc-value">{item.name || "-"}</div></div>
            <div className="rc-row"><div className="rc-label">호수</div><div className="rc-value">{item.roomNumber || "-"}</div></div>
          </div>
        </div>

        {/* Items */}
        {rows.length > 0 && (
          <div className="rc-section">
            <div className="rc-table">
              <div className="rc-thead">
                <div className="rc-th">정산 항목</div>
                <div className="rc-th" style={{textAlign:"right"}}>금액</div>
              </div>
              {rows.map((r, i) => (
                <div className="rc-tr" key={i}>
                  <div className="rc-td">{r.label}</div>
                  <div className="rc-td amount">{r.value}</div>
                </div>
              ))}
            </div>

            {defects.length > 0 && (
              <div className="rc-subtable">
                <div className="rc-subhead">추가내역</div>
                {defects.map((d,i)=>(
                  <div className="rc-subrow" key={i}>
                    <div className="rc-subdesc">- {d?.desc ?? "내역"}</div>
                    <div className="rc-subamt">{fmtWON(d?.amount ?? 0)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Total */}
        <div className="rc-section">
          <div className="rc-total">
            <div className="lbl">총 이사정산 금액</div>
            <div className="amt">{fmtWON(item.total || 0)}</div>
          </div>
        </div>

        {/* Deposit (총액 아래, 안내 위) — 3열 그리드 (세로폭 축소 적용) */}
        <div className="rc-section">
          <div className="rc-deposit">
            <div className="title">입금 정보</div>
            <div className="grid3">
              <div className="ditem">
                <div className="dlabel">입금은행</div>
                <div className="dvalue">농협</div>
              </div>
              <div className="ditem">
                <div className="dlabel">계좌번호</div>
                <div className="dvalue mono">042-489-8555-009</div>
              </div>
              <div className="ditem">
                <div className="dlabel">예금주</div>
                <div className="dvalue">이세구</div>
              </div>
            </div>
          </div>
        </div>

        {/* Notice */}
        <div className="rc-section">
          <div className="rc-notice">
            <div className="title">안내</div>
            <div className="body">{`※ 위 금액은 현금가 기준으로 산정된 금액입니다.
현금영수증 또는 세금계산서를 요청 시 해당 항목은 정가로 적용됩니다.
단, 공과금(관리비, 수도, 전기요금 등)은 실비정산 항목으로 영수증 발급 대상이 아닙니다.`}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="rc-section rc-footer">
          <img src={brandLogoSrc} alt="brand" className="rc-brand" />
          <div className="rc-brandname">한남주택관리</div>
        </div>
      </div>
    </div>
  );
}
