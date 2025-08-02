// components/InputGroup.js
import React from "react";
import "../styles/MoveoutLayout.css";

export default function InputGroup({ label, children }) {
  return (
    <div className="input-group">
      <label>{label}</label>
      {children}
    </div>
  );
}
