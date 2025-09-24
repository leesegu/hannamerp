// src/pages/MobileLogin.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../firebase";
import {
  collection, getDocs, limit, query, where,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInAnonymously,
} from "firebase/auth";
import "./MobileLogin.css";

/** ✅ 로그인 후 이동 경로 (라우터와 일치) */
const MOBILE_HOME_ROUTE = "/mobile/list";

/** 유틸 */
const s = (v) => String(v ?? "").trim();

/** Firestore users에서 id 또는 employeeNo로 이메일 매핑 (id 우선) */
async function fetchEmail({ id, employeeNo }) {
  const idClean = s(id);
  const empClean = s(employeeNo);

  if (idClean) {
    const q1 = query(collection(db, "users"), where("id", "==", idClean), limit(1));
    const r1 = await getDocs(q1);
    if (!r1.empty) {
      const d = r1.docs[0].data();
      if (s(d.email)) return s(d.email);
    }
  }
  if (empClean) {
    const q2 = query(collection(db, "users"), where("employeeNo", "==", empClean), limit(1));
    const r2 = await getDocs(q2);
    if (!r2.empty) {
      const d = r2.docs[0].data();
      if (s(d.email)) return s(d.email);
    }
  }
  return null;
}

/**
 * 권한 문제까지 처리하는 매핑 유틸:
 * - 일반 조회 → permission-denied면 익명 로그인 시도 → 재조회
 * - 익명 로그인 꺼져 있으면 명확한 에러코드 반환
 */
async function resolveEmailWithAutoAuth(inputs) {
  try {
    return await fetchEmail(inputs);
  } catch (e) {
    if (e?.code === "permission-denied") {
      // 익명 로그인으로 임시 인증을 받아 rules 통과 시도
      try {
        await signInAnonymously(auth);
        return await fetchEmail(inputs);
      } catch (e2) {
        // 익명 로그인 비활성 또는 여전히 권한 문제
        if (e2?.code === "auth/operation-not-allowed") {
          const err = new Error("익명 로그인이 비활성화되어 있어 사용자 매핑을 불러올 수 없습니다.");
          err.code = "lookup-anon-disabled";
          throw err;
        }
        const err = new Error("사용자 매핑 조회 권한이 없습니다.");
        err.code = "lookup-permission-denied";
        throw err;
      }
    }
    // 그 외 Firestore 에러
    throw e;
  }
}

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

  // 이미 로그인 상태면 바로 이동
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u && !u.isAnonymous) {
        // 익명 세션이면 아직 진짜 로그인 아님
        navigate(MOBILE_HOME_ROUTE, { replace: true });
      }
    });
    return unsub;
  }, [navigate]);

  // 입력 유효성 (아이디/사번 중 하나 + 비밀번호)
  const canSubmit = useMemo(() => {
    const hasKey = !!s(userId) || !!s(employeeNo);
    return hasKey && !!s(password) && !isBusy;
  }, [userId, employeeNo, password, isBusy]);

  /** ✅ Enter로 다음 입력, 마지막에서는 제출 */
  const onEnterGoNext = useCallback((e, nextRef, { submit } = {}) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    if (submit) {
      submitRef.current?.click();
      return;
    }
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
      // 이메일 매핑 (권한까지 처리)
      const email = await resolveEmailWithAutoAuth({ id: userId, employeeNo });
      if (!email) {
        setErr("사용자 정보를 찾을 수 없습니다. 아이디/사번을 확인하세요.");
        setIsBusy(false);
        return;
      }

      // 이메일/비밀번호 로그인 (익명 세션은 자동 교체됨)
      await signInWithEmailAndPassword(auth, email, password);

      // 마지막 입력 저장
      localStorage.setItem("molog.lastId", s(userId));
      localStorage.setItem("molog.lastEmp", s(employeeNo));

      navigate(MOBILE_HOME_ROUTE, { replace: true });
    } catch (e2) {
      console.error("[MobileLogin] signIn error:", e2?.code, e2?.message);

      let msg = "로그인 중 오류가 발생했습니다.";
      if (e2?.code === "auth/invalid-credential" || e2?.code === "auth/wrong-password") {
        msg = "아이디/사번 또는 비밀번호가 일치하지 않습니다.";
      } else if (e2?.code === "auth/user-not-found") {
        msg = "해당 사용자를 찾을 수 없습니다.";
      } else if (e2?.code === "auth/too-many-requests") {
        msg = "잠시 후 다시 시도해주세요.";
      } else if (e2?.code === "auth/network-request-failed") {
        msg = "네트워크 오류입니다. 연결 상태를 확인하세요.";
      } else if (e2?.code === "auth/invalid-email") {
        msg = "계정 데이터가 올바르지 않습니다. 관리자에게 문의하세요.";
      } else if (e2?.code === "lookup-anon-disabled") {
        msg = "관리자: Firebase 콘솔에서 '익명 로그인'을 활성화하거나, Firestore 규칙을 조회 허용으로 조정하세요.";
      } else if (e2?.code === "lookup-permission-denied" || e2?.code === "permission-denied") {
        msg = "사용자 매핑 조회 권한이 없습니다. 관리자에게 권한을 확인 요청하세요.";
      }
      setErr(msg);
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
