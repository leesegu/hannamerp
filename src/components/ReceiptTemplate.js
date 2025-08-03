// components/ReceiptTemplate.js
import React from "react";

export default function ReceiptTemplate({ item, refProp }) {
  if (!item) return null;

  const parseAmount = (value) =>
    parseFloat((value || "0").toString().replace(/,/g, ""));

  const currency = (value) =>
    parseAmount(value) > 0 ? `${parseAmount(value).toLocaleString()}원` : null;

  return (
    <div
      ref={refProp}
      style={{
        width: "440px",
        padding: "28px 36px",
        border: "1px solid #ccc",
        borderRadius: "10px",
        backgroundColor: "#ffffff",
        fontFamily: "'Noto Sans KR', sans-serif",
        fontSize: "15px",
        color: "#111",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
        lineHeight: "1.6",
        wordBreak: "keep-all",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale"
      }}
    >
      <h2 style={{
        textAlign: "center",
        marginBottom: "20px",
        fontSize: "21px",
        fontWeight: "800",
        borderBottom: "2px solid #ff8c00",
        paddingBottom: "12px",
        color: "#222"
      }}>
        🧾 이사 정산 영수증
      </h2>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <Row label="이사날짜" value={item.moveOutDate} />
          <Row label="빌라명" value={item.name} />
          <Row label="호수" value={item.roomNumber} />

          {currency(item.arrears) && <Row label="미납관리비" value={currency(item.arrears)} />}
          {currency(item.currentFee) && <Row label="당월관리비" value={currency(item.currentFee)} />}
          {currency(item.waterCost) && <Row label="수도요금" value={currency(item.waterCost)} />}
          {currency(item.electricity) && <Row label="전기요금" value={currency(item.electricity)} />}
          {currency(item.tvFee) && <Row label="TV수신료" value={currency(item.tvFee)} />}
          {currency(item.cleaning) && <Row label="청소비용" value={currency(item.cleaning)} />}

          {Array.isArray(item.defects) && item.defects.length > 0 && (
            <>
              <tr>
                <td colSpan="2" style={{ padding: "10px 6px 4px", fontWeight: "700", color: "#444" }}>
                  📌 추가내역
                </td>
              </tr>
              {item.defects.map((def, i) => (
                <Row
                  key={i}
                  label={`- ${def.desc}`}
                  value={`${parseAmount(def.amount).toLocaleString()}원`}
                  isSub
                />
              ))}
            </>
          )}
        </tbody>
      </table>

      {/* 총 금액 박스 */}
      <div style={{
        marginTop: "20px",
        borderTop: "2px dashed #bbb",
        paddingTop: "10px",
        backgroundColor: "#fffdf5",
        borderRadius: "6px",
        padding: "8px 12px"
      }}>
        <p style={{
          fontWeight: "700",
          fontSize: "15.5px",
          color: "#d35400",
          textAlign: "center",
          margin: 0
        }}>
          총 이사정산 금액: {currency(item.total)}
        </p>
      </div>

      {/* ✅ 추가 안내문 */}
      <div style={{
        marginTop: "16px",
        fontSize: "13.3px",
        color: "#666",
        backgroundColor: "#f9f9f9",
        padding: "10px 14px",
        borderRadius: "6px",
        lineHeight: "1.5"
      }}>
        <p style={{ margin: 0 }}>
          ※ 위 금액은 <strong>현금가 기준</strong>으로 산정된 금액입니다.<br />
          <strong>현금영수증</strong> 또는 <strong>세금계산서</strong>를 요청하실 경우,<br />해당 항목은 <strong>정가</strong>로 적용됩니다.<br />
          단, <strong>공과금(관리비, 수도, 전기요금 등)</strong>은 실비 정산 항목으로,<br />
          영수증 발급 대상이 아닌 점 참고 부탁드립니다.<br />
          영수증 발급을 원하시는 항목이 있다면 <strong>별도로 말씀해 주세요.</strong>
        </p>
      </div>

      {/* 계좌 정보 */}
      <div style={{ marginTop: "20px", textAlign: "center" }}>
        <table style={{
          margin: "0 auto",
          fontSize: "13.5px",
          borderCollapse: "collapse",
          color: "#444"
        }}>
          <tbody>
            <tr>
              <td style={{
                fontWeight: "600",
                padding: "4px 8px",
                borderBottom: "1px solid #eee"
              }}>입금은행</td>
              <td style={{
                padding: "4px 8px",
                borderBottom: "1px solid #eee"
              }}>농협</td>
            </tr>
            <tr>
              <td style={{
                fontWeight: "600",
                padding: "4px 8px",
                borderBottom: "1px solid #eee"
              }}>계좌번호</td>
              <td style={{
                padding: "4px 8px",
                borderBottom: "1px solid #eee"
              }}>042-489-8555-009</td>
            </tr>
            <tr>
              <td style={{ fontWeight: "600", padding: "4px 8px" }}>예금주</td>
              <td style={{ padding: "4px 8px" }}>이세구</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Row = ({ label, value, isSub = false }) => (
  <tr style={{ backgroundColor: isSub ? "#f9f9f9" : "#fff" }}>
    <td style={{
      padding: "6px 6px",
      fontWeight: isSub ? "400" : "600",
      fontSize: "14px",
      borderBottom: "1px solid #eee",
      color: isSub ? "#666" : "#333"
    }}>{label}</td>
    <td style={{
      padding: "6px 6px",
      textAlign: "right",
      borderBottom: "1px solid #eee",
      fontSize: "14px",
      color: isSub ? "#666" : "#111"
    }}>{value}</td>
  </tr>
);
