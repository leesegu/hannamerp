// src/LoginPage.js
import React, { useState, useRef, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from './firebase';
import './LoginPage.css';
import { FaUser, FaLock, FaIdBadge } from 'react-icons/fa'; // 아이콘 추가

const LoginPage = ({ onLogin }) => {
  const [id, setId] = useState('');
  const [employeeNo, setEmployeeNo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const idRef = useRef(null);
  const employeeNoRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    const stored = localStorage.getItem('autoLogin');
    if (stored) {
      const { id, employeeNo, name } = JSON.parse(stored);
      onLogin({ id, employeeNo, name });
      navigate('/main');
    }
  }, [onLogin, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const userRef = doc(db, 'users', id);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        setError('❌ 아이디가 존재하지 않습니다.');
        return;
      }

      const userData = userSnap.data();

      const correctPassword = userData.passwords?.[employeeNo];
      const isEmployeeValid = userData.employeeNos?.includes(employeeNo);

      if (correctPassword === password && isEmployeeValid) {
        const name = userData.employeeNames?.[employeeNo] || '이름없음';
        const loginData = { employeeNo, id, name };
        localStorage.setItem('autoLogin', JSON.stringify(loginData));
        onLogin(loginData);
        navigate('/main');
      } else {
        setError('❌ 아이디, 사원번호 또는 비밀번호가 일치하지 않습니다.');
      }
    } catch (err) {
      setError('❌ 로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
      console.error('로그인 오류:', err);
    }
  };

  const handleKeyDown = (e, nextRef) => {
    if (e.key === 'Enter') {
      if (nextRef && nextRef.current) {
        e.preventDefault();
        nextRef.current.focus();
      } else {
        handleLogin(e);
      }
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-container">
        <form className="login-form" onSubmit={handleLogin}>
          <h2>한남주택관리</h2>

          <div className="input-icon-wrapper">
            <FaUser className="input-icon" />
            <input
              type="text"
              placeholder="아이디"
              value={id}
              onChange={(e) => setId(e.target.value)}
              ref={idRef}
              onKeyDown={(e) => handleKeyDown(e, employeeNoRef)}
            />
          </div>

          <div className="input-icon-wrapper">
            <FaIdBadge className="input-icon" />
            <input
              type="text"
              placeholder="사원번호"
              value={employeeNo}
              onChange={(e) => setEmployeeNo(e.target.value)}
              ref={employeeNoRef}
              onKeyDown={(e) => handleKeyDown(e, passwordRef)}
            />
          </div>

          <div className="input-icon-wrapper">
            <FaLock className="input-icon" />
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              ref={passwordRef}
              onKeyDown={(e) => handleKeyDown(e)}
            />
          </div>

          {error && <p className="error-message">{error}</p>}

          <button type="submit">로그인</button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
