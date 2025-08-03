import React from "react";
import { useNavigate } from "react-router-dom";
import "./MobileMainPage.css";

export default function MobileMainPage() {
  const navigate = useNavigate();

  return (
    <div className="mobile-main-container">
      <h2>이사정산</h2>
      <div className="button-group">
        <button onClick={() => navigate("/moveout-form")}>등록하기</button>
        <button onClick={() => navigate("/moveout-list")}>조회하기</button>
      </div>
    </div>
  );
}
