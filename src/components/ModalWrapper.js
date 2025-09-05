// src/components/ModalWrapper.js
import React from "react";
import ReactDOM from "react-dom";
import "./ModalStyles.css";

/**
 * 범용 모달 컴포넌트
 * - 기본 닫기 버튼 ❌ (없앰)
 * - footer prop을 넘기면 하단에 표시
 */
export default function ModalWrapper({
  isOpen,
  onClose,
  children,
  title,
  footer,               // ✅ 필요할 때만 전달
  width = "700px",
  maxWidth = "90vw",
  className = "",
}) {
  if (!isOpen) return null;

  const modalContent = (
    <div className="modal-overlay">
      <div className={`modal-box ${className}`} style={{ width, maxWidth }}>
        {/* 상단 제목 */}
        {title && (
          <div className="modal-header">
            <h3 className="modal-title">{title}</h3>
          </div>
        )}

        {/* 본문 */}
        <div className="modal-content">{children}</div>

        {/* 하단 푸터 (있을 때만 렌더링) */}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}
