// src/pages/LoginPage.jsx
import { useRef, useState, useEffect } from "react";
import { loginWithIdEmpNoPassword } from "../auth/authLogin";
import "./LoginPage.css";

export default function LoginPage({ onLogin }) {
  const [id, setId] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const idRef = useRef(null);
  const empRef = useRef(null);
  const pwRef = useRef(null);
  const submitRef = useRef(null);

  useEffect(() => {
    idRef.current?.focus();
  }, []);

  const handleKeyDown = (e, next) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (next === "emp") empRef.current?.focus();
      else if (next === "pw") pwRef.current?.focus();
      else if (next === "submit") submitRef.current?.click();
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const { profile } = await loginWithIdEmpNoPassword({
        id,
        employeeNo,
        password,
      });
      onLogin({
        id: profile.id,
        employeeNo: profile.employeeNo,
        name: profile.name,
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="grid-glow" />

      <div className="login-shell">
        <div className="login-card neon-glass">
          {/* Left Illustration */}
          <div className="login-left">
            <div className="left-hero">
              <img
                src="/img/erp-login.png"
                alt="ERP Illustration"
                className="login-illustration"
              />
              <div className="left-badge">
                <span className="badge-dot" />
                안전한 업무 공간
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="login-right">
            <div className="brand">
              <img
                src="/img/hannam-logo.png"
                alt="Hannam Logo"
                className="brand-logo"
              />
              <div className="brand-text">
                한남주택관리 <span className="brand-sub">· Hannam ERP</span>
              </div>
            </div>

            <h1 className="headline">환영합니다</h1>
            <p className="subtitle">
              사내 계정으로 로그인하여 관리 업무를 시작하세요.
            </p>

            <form className="login-form" onSubmit={onSubmit}>
              <div className="field">
                <span className="field-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 
                      2.239-5 5 2.239 5 5 5zm0 2c-4.418 0-8 
                      2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5z"/>
                  </svg>
                </span>
                <input
                  ref={idRef}
                  className="login-input"
                  placeholder="아이디"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, "emp")}
                  autoComplete="username"
                />
              </div>

              <div className="field">
                <span className="field-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 5h18v14H3zM5 7v10h14V7H5zm2 
                      2h6v2H7V9zm0 4h10v2H7v-2z"/>
                  </svg>
                </span>
                <input
                  ref={empRef}
                  className="login-input"
                  placeholder="사원번호"
                  value={employeeNo}
                  onChange={(e) => setEmployeeNo(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, "pw")}
                  inputMode="numeric"
                />
              </div>

              <div className="field">
                <span className="field-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1a5 5 0 00-5 5v3H5a2 2 0 
                      00-2 2v8a2 2 0 002 2h14a2 2 0 
                      002-2v-8a2 2 0 00-2-2h-2V6a5 5 0 
                      00-5-5zm3 8H9V6a3 3 0 016 0v3z"/>
                  </svg>
                </span>
                <input
                  ref={pwRef}
                  className="login-input"
                  placeholder="비밀번호"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, "submit")}
                  autoComplete="current-password"
                />
              </div>

              {err && <div className="login-error">{err}</div>}

              <button
                ref={submitRef}
                type="submit"
                disabled={loading}
                className="login-button"
              >
                {loading ? (
                  <span className="spinner">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </span>
                ) : (
                  "로그인"
                )}
              </button>

              <div className="helper-row">
                <div className="helper-pill">
                  <span className="pill-dot" />
                  보안 접속 활성화됨
                </div>
              </div>
            </form>
          </div>
        </div>

        <div className="footer-note">
          © {new Date().getFullYear()} Hannam Housing Management · All rights reserved.
        </div>
      </div>
    </div>
  );
}
