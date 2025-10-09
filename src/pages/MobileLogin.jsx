// src/pages/MobileLogin.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { loginWithIdEmpNoPassword } from "../auth/authLogin"; // ✅ PC와 동일한 인증 유틸 사용
import "./MobileLogin.css";

/** 로그인 후 이동 경로 */
const MOBILE_HOME_ROUTE = "/mobile/list";

/** 유틸 */
const s = (v) => String(v ?? "").trim();

export default function MobileLogin() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState(() => localStorage.getItem("molog.lastId") || "");
  const [employeeNo, setEmployeeNo] = useState(() => localStorage.getItem("molog.lastEmp") || "");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showPw, setShowPw] = useState(false);

  const idRef = useRef(null);
  const empRef = useRef(null);
  const pwRef = useRef(null);
  const submitRef = useRef(null);

  // 이미 로그인되어 있으면 바로 이동
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) navigate(MOBILE_HOME_ROUTE, { replace: true });
    });
    return unsub;
  }, [navigate]);

  // 입력 유효성 (아이디/사번 중 하나 + 비밀번호)
  const canSubmit = useMemo(() => {
    const hasKey = !!s(userId) || !!s(employeeNo);
    return hasKey && !!s(password) && !isBusy;
  }, [userId, employeeNo, password, isBusy]);

  /** Enter 이동/제출 */
  const onEnterGoNext = useCallback((e, nextRef, { submit } = {}) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    if (submit) { submitRef.current?.click(); return; }
    nextRef?.current?.focus();
  }, []);

  const doLogin = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) {
      if (!s(userId) && !s(employeeNo)) setErr("아이디 또는 사원번호를 입력하세요.");
      else if (!s(password)) setErr("비밀번호를 입력하세요.");
      return;
    }

    setErr("");
    setIsBusy(true);
    try {
      // ✅ PC와 동일한 공용 인증 로직 사용: 내부에서 아이디/사번 → 이메일 매핑 + Firebase Auth 로그인 처리
      const { profile } = await loginWithIdEmpNoPassword({
        id: userId,
        employeeNo,
        password,
      });

      // 마지막 입력 저장
      localStorage.setItem("molog.lastId", s(userId));
      localStorage.setItem("molog.lastEmp", s(employeeNo));

      // 필요시 profile 활용 가능 (이름/사번 등)
      // console.log("mobile login profile:", profile);

      navigate(MOBILE_HOME_ROUTE, { replace: true });
    } catch (e2) {
      console.error("[MobileLogin] signIn error:", e2?.code || "", e2?.message || e2);
      // 공용 함수에서 던지는 message를 그대로 노출(PC와 동일 UX)
      setErr(e2?.message || "로그인 중 오류가 발생했습니다.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="molog-page molog-center">
      {/* 배경 장식 */}
      <div className="molog-bg">
        <div className="molog-aurora a" />
        <div className="molog-aurora b" />
        <div className="molog-aurora c" />
        <div className="molog-glow" />
      </div>

      {/* 헤더 */}
      <header className="molog-header" aria-label="앱 브랜드">
        <div className="molog-badge molog-badge--xl">
          <span className="molog-logo">🏢</span>
          <span className="molog-brand">한남주택관리</span>
        </div>
        <div className="molog-sub">이사정산 조회 · 모바일전용 ERP</div>
      </header>

      {/* 로그인 카드 */}
      <main className="molog-card-outer">
        <div className="molog-card-shine" aria-hidden />
        <form className="molog-card molog-neon" onSubmit={doLogin} autoComplete="on">
          <div className="molog-title">로그인</div>
          <div className="molog-desc">아이디 또는 사원번호 + 비밀번호</div>

          {/* 아이디 */}
          <div className="molog-field">
            <label className="molog-label" htmlFor="molog-id">아이디</label>
            <div className="molog-input-wrap">
              <input
                id="molog-id"
                ref={idRef}
                className="molog-input"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                onKeyDown={(e) => onEnterGoNext(e, empRef)}
                autoFocus
              />
              {userId && (
                <button
                  type="button"
                  className="molog-clear"
                  aria-label="지우기"
                  onClick={() => setUserId("")}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* 사원번호 */}
          <div className="molog-field">
            <label className="molog-label" htmlFor="molog-emp">사원번호</label>
            <div className="molog-input-wrap">
              <input
                id="molog-emp"
                ref={empRef}
                className="molog-input"
                inputMode="numeric"
                pattern="[0-9]*"
                value={employeeNo}
                onChange={(e) => setEmployeeNo(e.target.value)}
                onKeyDown={(e) => onEnterGoNext(e, pwRef)}
              />
              {employeeNo && (
                <button
                  type="button"
                  className="molog-clear"
                  aria-label="지우기"
                  onClick={() => setEmployeeNo("")}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* 비밀번호 */}
          <div className="molog-field">
            <label className="molog-label" htmlFor="molog-pw">비밀번호</label>
            <div className="molog-input-wrap">
              <input
                id="molog-pw"
                ref={pwRef}
                className="molog-input"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => onEnterGoNext(e, null, { submit: true })}
              />
              <button
                type="button"
                className="molog-eye"
                aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
                onClick={() => setShowPw((p) => !p)}
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {!!err && <div className="molog-error" role="alert">{err}</div>}

          <button
            ref={submitRef}
            type="submit"
            className={`molog-submit ${!canSubmit ? "disabled" : ""}`}
            disabled={!canSubmit}
          >
            {isBusy ? "로그인 중…" : "로그인"}
          </button>

          <div className="molog-meta">
            <span>보안접속 · 사내용</span>
            <span className="dot">•</span>
            <span>vMobile 1.3</span>
          </div>
        </form>
      </main>
    </div>
  );
}
