// src/components/FormLayout.js

import React from "react";
import "./FormLayout.css";

export default function FormLayout({ children }) {
  return (
    <div className="form-layout">
      {children}
    </div>
  );
}
