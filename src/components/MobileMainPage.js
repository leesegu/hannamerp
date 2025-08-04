import React from "react";
import { useNavigate } from "react-router-dom";
import HMLogo from "../assets/HM.png"; // ✅ PNG 로고
import "./MobileMainPage.css";

export default function MobileMainPage() {
  const navigate = useNavigate();

  return (
    <div className="main-wrapper">
      <div className="main-inner">
        <div className="logo-container">
          <img src={HMLogo} alt="로고" className="hm-logo" />
          <p className="subtitle">한남주택관리</p> {/* ✅ 추가된 문구 */}
        </div>
        <h1 className="main-title">이사정산</h1>

        <div className="btn-group">
          <button
            className="main-btn primary"
            onClick={() => navigate("/mobile/form")}
          >
            <span className="btn-icon">📝</span> 정산 등록하기
          </button>
          <button
            className="main-btn secondary"
            onClick={() => navigate("/mobile/list")}
          >
            <span className="btn-icon">📄</span> 정산 내역 조회
          </button>
        </div>
      </div>
    </div>
  );
}
