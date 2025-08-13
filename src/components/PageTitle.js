// src/components/PageTitle.js
import React from "react";

export default function PageTitle({ children }) {
  return (
    <h2 className="text-xl font-bold text-left mb-4">
      {children}
    </h2>
  );
}
