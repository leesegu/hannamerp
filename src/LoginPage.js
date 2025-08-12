// src/LoginPage.js
import React, { useState, useRef, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from './firebase';

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
      navigate('/main', { replace: true });
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

        // 🔹 상태 반영 후 페이지 이동
        setTimeout(() => {
          navigate('/main', { replace: true });
        }, 0);
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
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-[900px] flex">
        {/* 왼쪽 이미지 */}
        <div
          className="hidden md:block md:w-1/2 bg-cover bg-center rounded-2xl overflow-hidden"
          style={{ backgroundImage: "url('/images/sign-in.jpg')" }}
        />

        {/* 오른쪽 로그인 폼 */}
        <div className="w-full md:w-1/2 flex items-center justify-center py-12 md:py-16 px-6 md:px-8">
          <div className="w-full max-w-[360px]">
            <div className="flex justify-center mb-6">
              <img src="/images/logo.svg" alt="logo" className="h-16 md:h-20" />
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="text"
                placeholder="아이디"
                value={id}
                onChange={(e) => setId(e.target.value)}
                ref={idRef}
                onKeyDown={(e) => handleKeyDown(e, employeeNoRef)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <input
                type="text"
                placeholder="사원번호"
                value={employeeNo}
                onChange={(e) => setEmployeeNo(e.target.value)}
                ref={employeeNoRef}
                onKeyDown={(e) => handleKeyDown(e, passwordRef)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <input
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                ref={passwordRef}
                onKeyDown={(e) => handleKeyDown(e)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />

              {error && (
                <p className="text-red-500 text-sm text-center">{error}</p>
              )}

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg py-3 rounded-lg transition duration-200"
              >
                로그인
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
