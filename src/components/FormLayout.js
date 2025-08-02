// components/FormLayout.js
import React from "react";
import "../styles/MoveoutLayout.css"; // 스타일 적용 (form-container, form-inner)

export default function FormLayout({ children }) {
  return (
    <div className="form-container">
      <div className="form-inner">
        {children}
      </div>
    </div>
  );
}
