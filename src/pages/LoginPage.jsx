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

  // refs for Enter → next focus
  const idRef = useRef(null);
  const empRef = useRef(null);
  const pwRef = useRef(null);
  const submitRef = useRef(null);

  useEffect(() => {
    // 첫 진입시 아이디로 포커스
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
    <div className="login-wrap">
      <div className="login-card">
        {/* Left Illustration */}
        <div className="login-left">
          {/* 필요 시 이미지 경로를 바꿔주세요 (예: /img/erp-login.png) */}
          <img
            src="/img/erp-login.png"
            alt="ERP Illustration"
            className="login-illustration"
          />
        </div>

        {/* Right Panel */}
        <div className="login-right">
          <div className="brand">
            <div className="brand-mark">HN</div>
            <div className="brand-text">한남주택관리</div>
          </div>

          <form className="login-form" onSubmit={onSubmit}>
            <input
              ref={idRef}
              className="login-input"
              placeholder="아이디"
              value={id}
              onChange={(e) => setId(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, "emp")}
              autoComplete="username"
            />
            <input
              ref={empRef}
              className="login-input"
              placeholder="사원번호"
              value={employeeNo}
              onChange={(e) => setEmployeeNo(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, "pw")}
              inputMode="numeric"
            />
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

            {err && <div className="login-error">{err}</div>}

            <button
              ref={submitRef}
              type="submit"
              disabled={loading}
              className="login-button"
            >
              {loading ? "로그인 중…" : "로그인"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
