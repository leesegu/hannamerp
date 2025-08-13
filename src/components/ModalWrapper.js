// src/components/ModalWrapper.js
import React from "react";
import ReactDOM from "react-dom";
import "./ModalStyles.css";

export default function ModalWrapper({
  isOpen,
  onClose,
  children,
  title,
  footer,
  showCloseButton = true,
  width = "700px",
  maxWidth = "90vw",
  className = "",
}) {
  if (!isOpen) return null;

  const modalContent = (
    <div className="modal-overlay">
      <div
        className={`modal-box ${className}`}
        style={{ width, maxWidth }}
      >
        {/* 상단 제목 */}
        {title && (
          <div className="modal-header">
            <h3 className="modal-title">{title}</h3>
          </div>
        )}

        {/* 중간 내용 */}
        <div className="modal-content">
          {children}
        </div>

        {/* 하단 버튼 */}
        <div className="modal-footer">
          {footer ? (
            footer
          ) : showCloseButton ? (
            <button className="close-btn" onClick={onClose}>닫기</button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}
