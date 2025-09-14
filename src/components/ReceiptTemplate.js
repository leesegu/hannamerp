// components/ReceiptTemplate.js
import React from "react";

/* 로고 기본 경로 (필요시 경로만 바꿔서 사용) */
import headerLogoDefault from "../assets/logo-header.png";   // 상단 로고
import brandLogoDefault from "../assets/logo-brand.png";     // 하단 로고

export default function ReceiptTemplate({
  item,
  refProp,
  /* 외부에서 덮어쓰기 가능 */
  logoSrc = headerLogoDefault,
  brandLogoSrc = brandLogoDefault,
}) {
  if (!item) return null;

  const parseAmount = (value) =>
    parseFloat((value || "0").toString().replace(/,/g, ""));

  const currency = (value) =>
    parseAmount(value) > 0 ? `${parseAmount(value).toLocaleString()}원` : null;

  /* ===== Theme ===== */
  const ACCENT = "#6d28d9";
  const ACCENT_SOFT = "rgba(109,40,217,.08)";
  const LINE = "#e6e8ef";
  const TEXT = "#111827";
  const MUTED = "#6b7280";
  const CARD = "#ffffff";

  /* ▶ 금액 색상을 아주 조금 옅게 표시할 라이트 톤 */
  const LIGHT_ACCENT = "#7c3aed";

  const sectionCard = {
    background: CARD,
    border: `1px solid ${LINE}`,
    borderRadius: 12,
    boxShadow: "0 4px 18px rgba(17,24,39,.06)",
  };

  /* 안내 문구 (개행/띄어쓰기 그대로 유지) */
  const NOTICE_TEXT =
`※ 위 금액은 현금가 기준으로 산정된 금액입니다.
현금영수증 또는 세금계산서를 요청 시 해당 항목은 정가로 적용됩니다.
단, 공과금(관리비, 수도, 전기요금 등)은 실비정산 항목으로 영수증 발급 대상이 아닙니다.`;

  const InfoRow = ({ label, value }) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "110px 1fr",
        gap: 10,
        alignItems: "center",
        padding: "8px 0",
        borderBottom: `1px dashed ${LINE}`,
      }}
    >
      <div style={{ fontSize: 12.5, color: MUTED, fontWeight: 700, letterSpacing: ".02em" }}>
        {label}
      </div>
      {/* 값 폰트 크기 소폭 증가 */}
      <div style={{ fontSize: 15.2, color: TEXT, fontWeight: 600, wordBreak: "keep-all" }}>
        {value}
      </div>
    </div>
  );

  const MoneyRow = ({ label, value, isSub = false }) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 12px",
        background: isSub ? "rgba(246,247,251,.6)" : CARD,
        border: `1px solid ${LINE}`,
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 14, color: isSub ? "#374151" : "#111827", fontWeight: isSub ? 600 : 700 }}>
        {label}
      </div>
      {/* 금액 색상을 아주 살짝 더 옅은 보라로 */}
      <div
        style={{
          fontVariantNumeric: "tabular-nums",
          fontSize: 15.5,
          color: LIGHT_ACCENT,
          fontWeight: 800,
        }}
      >
        {value}
      </div>
    </div>
  );

  return (
    <div
      ref={refProp}
      style={{
        width: 600,
        padding: 16,
        backgroundColor: "#f7f8fb",
        fontFamily: "'Noto Sans KR', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: TEXT,
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        lineHeight: 1.5,
        borderRadius: 14,
        border: `1px solid ${LINE}`,
        boxShadow: "0 8px 24px rgba(17,24,39,.08)",
      }}
    >
      {/* ===== 상단 헤더 (로고 더 큼 + 테두리 제거) ===== */}
      <div
        style={{
          ...sectionCard,
          padding: "12px 14px",
          marginBottom: 10,
          background: `linear-gradient(0deg, ${CARD}, ${CARD}), radial-gradient(120% 120% at 0% 0%, ${ACCENT_SOFT}, transparent)`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* 상단 로고 이미지 */}
        <img
          src={logoSrc}
          alt="logo"
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            objectFit: "cover",
            border: "none",
            background: "transparent",
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: ".02em",
              color: TEXT,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            이사정산 영수증
          </h2>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
            HanNam Housing Management
          </div>
        </div>
      </div>

      {/* ===== 기본 정보 ===== */}
      <div style={{ ...sectionCard, padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: 999, background: ACCENT }} />
          <div style={{ fontSize: 12.5, color: "#374151", fontWeight: 800, letterSpacing: ".02em" }}>
            기본 정보
          </div>
        </div>
        <div style={{ paddingTop: 2 }}>
          <InfoRow label="이사날짜" value={item.moveOutDate || "-"} />
          <InfoRow label="빌라명" value={item.name || "-"} />
          <InfoRow label="호수" value={item.roomNumber || "-"} />
        </div>
      </div>

      {/* ===== 정산 항목 (2열) ===== */}
      <div style={{ ...sectionCard, padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: 999, background: ACCENT }} />
          <div style={{ fontSize: 12.5, color: "#374151", fontWeight: 800, letterSpacing: ".02em" }}>
            정산 항목
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 8,
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          {currency(item.arrears) && <MoneyRow label="미납관리비" value={currency(item.arrears)} />}
          {currency(item.currentFee) && <MoneyRow label="당월관리비" value={currency(item.currentFee)} />}
          {currency(item.waterCost) && <MoneyRow label="수도요금" value={currency(item.waterCost)} />}
          {currency(item.electricity) && <MoneyRow label="전기요금" value={currency(item.electricity)} />}
          {currency(item.tvFee) && <MoneyRow label="TV수신료" value={currency(item.tvFee)} />}
          {currency(item.cleaning) && <MoneyRow label="청소비용" value={currency(item.cleaning)} />}
        </div>

        {/* 추가내역 */}
        {Array.isArray(item.defects) && item.defects.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0 6px" }}>
              <div style={{ width: 6, height: 6, borderRadius: 999, background: ACCENT }} />
              <div style={{ fontSize: 12.5, color: "#374151", fontWeight: 800, letterSpacing: ".02em" }}>
                추가내역
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gap: 8,
                gridTemplateColumns: "1fr 1fr",
              }}
            >
              {item.defects.map((def, i) => (
                <MoneyRow
                  key={i}
                  label={`- ${def.desc}`}
                  value={`${parseAmount(def.amount).toLocaleString()}원`}
                  isSub
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== 총 금액 ===== */}
      <div
        style={{
          ...sectionCard,
          padding: 12,
          marginBottom: 10,
          background: `linear-gradient(0deg, ${CARD}, ${CARD}), radial-gradient(120% 120% at 0% 0%, ${ACCENT_SOFT}, transparent)`,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 10,
        }}
      >
        {/* ▶ 제목: 검정색 + 더 진하게 */}
        <div style={{ fontSize: 14.5, color: TEXT, fontWeight: 900, letterSpacing: ".02em" }}>
          총 이사정산 금액
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 900,
            color: ACCENT,
            fontVariantNumeric: "tabular-nums",
            textAlign: "right",
          }}
        >
          {currency(item.total) || "0원"}
        </div>
      </div>

      {/* ===== 안내 ===== */}
      <div style={{ ...sectionCard, padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: 6,
              background: ACCENT_SOFT,
              color: ACCENT,
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
              fontSize: 11,
            }}
          >
            i
          </span>
          <div style={{ fontSize: 12.5, color: "#374151", fontWeight: 800, letterSpacing: ".02em" }}>
            안내
          </div>
        </div>
        {/* ▶ 사용자 제공 문구를 공백/개행 그대로 유지 */}
        <div
          style={{
            margin: 0,
            fontSize: 12.8,
            color: MUTED,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}
        >
          {NOTICE_TEXT}
        </div>
      </div>

      {/* ===== 하단 브랜드: 중앙정렬 + 로고/텍스트 확대 ===== */}
      <div
        style={{
          ...sectionCard,
          padding: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          textAlign: "center",
        }}
      >
        <img
          src={brandLogoSrc}
          alt="brand"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            objectFit: "cover",
            border: "none",
            background: "transparent",
          }}
        />
        <div
          style={{
            color: "#8b95a1",
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: ".04em",
          }}
        >
          한남주택관리
        </div>
      </div>
    </div>
  );
}

/* (옵션) 호환용 Row - 외부 의존 고려해 유지 */
export const Row = ({ label, value, isSub = false }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "110px 1fr",
      gap: 10,
      alignItems: "center",
      padding: "6px 0",
      borderBottom: `1px dashed #e6e8ef`,
      background: isSub ? "rgba(246,247,251,.6)" : "transparent",
    }}
  >
    <div style={{ fontSize: 12.5, color: "#6b7280", fontWeight: 700 }}>{label}</div>
    <div
      style={{
        fontSize: 14,
        color: isSub ? "#374151" : "#111827",
        fontWeight: isSub ? 600 : 700,
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </div>
  </div>
);
