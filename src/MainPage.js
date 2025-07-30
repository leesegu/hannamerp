// src/MainPage.js
import React from "react";
import "./MainPage.css";

export default function MainPage({ employeeId }) {
  return (
    <div className="main-page">
      <div className="main-inner">
        <h1>한남주택관리 메인화면</h1>
        <p>로그인한 ID: <strong>{employeeId}</strong></p>
        {/* 여기에 메뉴/버튼/페이지 링크 등을 추가하면 됩니다 */}
      </div>
    </div>
  );
}
