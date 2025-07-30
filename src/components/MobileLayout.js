import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPen, FaClipboardList } from 'react-icons/fa';
import './MobileLayout.css';

export default function MobileLayout() {
  const navigate = useNavigate();

  return (
    <div className="mobile-main">
      <h1 className="mobile-title">한남주택관리</h1>
      <p className="mobile-subtitle">이사정산</p>
      <div className="menu-grid">
        <button className="menu-box" onClick={() => navigate('/moveout')}>
          <FaPen className="menu-icon" />
          <span>입력</span>
        </button>
        <button className="menu-box" onClick={() => navigate('/moveout-list')}>
          <FaClipboardList className="menu-icon" />
          <span>조회</span>
        </button>
      </div>
    </div>
  );
}
