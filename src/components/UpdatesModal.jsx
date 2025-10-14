// src/components/UpdatesModal.jsx
import React, { useEffect, useRef, useState } from "react";
import "./UpdatesModal.css";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
} from "firebase/firestore";

/**
 * UpdatesModal
 * - props:
 *    - isOpen: boolean   // 모달 열림 여부
 *    - onClose: () => void   // 닫기 핸들러 (저장 없음)
 *    - userId: string    // 로그인 사용자 uid
 *    - employeeId: string|number // 사원번호 (완료 작성/삭제/댓글 권한: '1' 또는 1)
 *    - displayName?: string // 작성자 표시명(옵션)
 *
 * Firestore:
 *  - 컬렉션 1: updateRequests
 *     { content, createdAt, userId, employeeId, displayName }
 *       └─ sub: comments
 *          { content, createdAt, userId, employeeId, displayName }
 *  - 컬렉션 2: updateCompleted
 *     { content, createdAt, userId, employeeId, displayName }
 *
 * 권한:
 *  - 요청: 모든 사용자 작성 가능 / 삭제 가능
 *  - 완료: employeeId === 1 만 작성/삭제 가능
 *  - 댓글: employeeId === 1 만 작성 가능 (모두 열람 가능)
 */

export default function UpdatesModal({
  isOpen,
  onClose,
  userId,
  employeeId,
  displayName,
}) {
  const canWriteDone = String(employeeId ?? "") === "1";

  const [reqInput, setReqInput] = useState("");
  const [doneInput, setDoneInput] = useState("");

  const [reqList, setReqList] = useState([]);
  const [doneList, setDoneList] = useState([]);

  const reqTARef = useRef(null);
  const doneTARef = useRef(null);

  /** 🔹 댓글: 항목별 실시간 목록(Map) + 입력창(Composer) 상태 */
  const [commentsMap, setCommentsMap] = useState({}); // { [reqId]: Array<Comment> }
  const commentsUnsubsRef = useRef({});               // { [reqId]: () => void }
  const [composerForId, setComposerForId] = useState(""); // 댓글 입력창이 열려있는 요청 id
  const [composerText, setComposerText] = useState("");
  const composerTARef = useRef(null);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (!isOpen) return;
    setReqInput("");
    setDoneInput("");
    setComposerForId("");
    setComposerText("");
    setCommentsMap({});
    // 기존 댓글 구독 모두 해제
    Object.values(commentsUnsubsRef.current).forEach((fn) => fn?.());
    commentsUnsubsRef.current = {};
    setTimeout(() => {
      if (reqTARef.current) reqTARef.current.focus();
    }, 0);
  }, [isOpen]);

  // 실시간 구독: 요청
  useEffect(() => {
    if (!isOpen) return;
    const qReq = query(
      collection(db, "updateRequests"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(qReq, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setReqList(list);
    });
    return () => unsub();
  }, [isOpen]);

  // 실시간 구독: 완료
  useEffect(() => {
    if (!isOpen) return;
    const qDone = query(
      collection(db, "updateCompleted"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(qDone, (snap) => {
      setDoneList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [isOpen]);

  /** 🔹 요청 목록 변화에 따라 각 요청의 댓글을 실시간 구독 (모두가 댓글을 볼 수 있도록 항상 렌더) */
  useEffect(() => {
    if (!isOpen) return;

    // 이미 있는 구독은 유지, 새로 생긴 요청 id만 구독 추가 / 사라진 id는 구독 해제
    const currentIds = new Set(reqList.map((r) => r.id));
    const subscribedIds = new Set(Object.keys(commentsUnsubsRef.current));

    // 해제 대상
    for (const id of subscribedIds) {
      if (!currentIds.has(id)) {
        commentsUnsubsRef.current[id]?.();
        delete commentsUnsubsRef.current[id];
        setCommentsMap((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }

    // 신규 구독
    for (const r of reqList) {
      const id = r.id;
      if (commentsUnsubsRef.current[id]) continue;
      const qC = query(
        collection(db, "updateRequests", id, "comments"),
        orderBy("createdAt", "asc")
      );
      const unsub = onSnapshot(qC, (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCommentsMap((prev) => ({ ...prev, [id]: list }));
      });
      commentsUnsubsRef.current[id] = unsub;
    }

    return () => {
      // cleanup은 모달 닫힘 등에서 이미 처리
    };
  }, [isOpen, reqList]);

  // 모달 닫힐 때 모든 댓글 구독 해제
  useEffect(() => {
    if (isOpen) return;
    Object.values(commentsUnsubsRef.current).forEach((fn) => fn?.());
    commentsUnsubsRef.current = {};
  }, [isOpen]);

  const fmtTime = (ts) => {
    // serverTimestamp() 직후엔 null일 수 있음
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return "-";
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yy}-${mm}-${dd} ${hh}:${mi}`;
  };

  const saveRequest = async () => {
    const content = String(reqInput || "").trim();
    if (!content) {
      alert("업데이트 요청 내용을 입력해 주세요.");
      if (reqTARef.current) reqTARef.current.focus();
      return;
    }
    try {
      await addDoc(collection(db, "updateRequests"), {
        content,
        createdAt: serverTimestamp(),
        userId: userId || "",
        employeeId: String(employeeId ?? ""),
        displayName: displayName || "",
      });
      setReqInput("");
      setTimeout(() => {
        if (reqTARef.current) reqTARef.current.focus();
      }, 0);
    } catch (e) {
      console.error("요청 저장 오류:", e);
      alert("요청 저장 중 오류가 발생했습니다.");
    }
  };

  const saveDone = async () => {
    if (!canWriteDone) return;
    const content = String(doneInput || "").trim();
    if (!content) {
      alert("업데이트 완료 내용을 입력해 주세요.");
      if (doneTARef.current) doneTARef.current.focus();
      return;
    }
    try {
      await addDoc(collection(db, "updateCompleted"), {
        content,
        createdAt: serverTimestamp(),
        userId: userId || "",
        employeeId: String(employeeId ?? ""),
        displayName: displayName || "",
      });
      setDoneInput("");
      setTimeout(() => {
        if (doneTARef.current) doneTARef.current.focus();
      }, 0);
    } catch (e) {
      console.error("완료 저장 오류:", e);
      alert("완료 저장 중 오류가 발생했습니다.");
    }
  };

  // 요청 삭제 (누구나 가능)
  const deleteRequest = async (id) => {
    if (!id) return;
    if (!window.confirm("이 요청을 삭제하시겠습니까? (관련 댓글도 함께 삭제됩니다)")) return;
    try {
      // 댓글 먼저 삭제 (subcollection 일괄 삭제)
      const commentsSnap = await getDocs(collection(db, "updateRequests", id, "comments"));
      const batch = writeBatch(db);
      commentsSnap.forEach((d) => {
        batch.delete(doc(db, "updateRequests", id, "comments", d.id));
      });
      await batch.commit();
      await deleteDoc(doc(db, "updateRequests", id));
      if (composerForId === id) {
        setComposerForId("");
        setComposerText("");
      }
    } catch (e) {
      console.error("요청 삭제 오류:", e);
      alert("요청 삭제 중 오류가 발생했습니다.");
    }
  };

  // 완료 삭제 (1번만)
  const deleteDone = async (id) => {
    if (!id || !canWriteDone) return;
    if (!window.confirm("이 완료 내역을 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "updateCompleted", id));
    } catch (e) {
      console.error("완료 삭제 오류:", e);
      alert("완료 삭제 중 오류가 발생했습니다.");
    }
  };

  // 댓글 저장 (1번만)
  const saveComment = async (reqId) => {
    if (!canWriteDone || !reqId) return;
    const content = String(composerText || "").trim();
    if (!content) {
      alert("댓글 내용을 입력해 주세요.");
      if (composerTARef.current) composerTARef.current.focus();
      return;
    }
    try {
      await addDoc(collection(db, "updateRequests", reqId, "comments"), {
        content,
        createdAt: serverTimestamp(),
        userId: userId || "",
        employeeId: String(employeeId ?? ""),
        displayName: displayName || "",
      });
      // 입력창 유지 or 닫기: 요청은 "작게 뜨고" 저장하면 깔끔히 닫히도록 처리
      setComposerText("");
      setComposerForId("");
    } catch (e) {
      console.error("댓글 저장 오류:", e);
      alert("댓글 저장 중 오류가 발생했습니다.");
    }
  };

  // ESC로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="updates-modal__backdrop" onClick={onClose}>
      <div
        className="updates-modal__panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="업데이트"
      >
        {/* 헤더 */}
        <div className="updates-modal__header">
          <div className="updates-modal__title">
            <span className="updates-badge">UPD</span>
            <span>업데이트</span>
          </div>
          <div className="updates-modal__actions">
            <button className="updates-btn updates-btn--ghost" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>

        {/* 본문: 좌/우 2단 */}
        <div className="updates-modal__body">
          {/* 요청 영역 */}
          <section className="updates-card">
            <div className="updates-card__head">
              <div className="updates-card__title">
                <i className="ri-record-circle-line" aria-hidden />
                업데이트 요청
              </div>
            </div>

            <div className="updates-editor">
              <textarea
                ref={reqTARef}
                className="updates-textarea updates-textarea--fixed"
                placeholder="필요한 기능이나 버그 리포트를 남겨주세요."
                value={reqInput}
                onChange={(e) => setReqInput(e.target.value)}
                rows={5}
              />
              <div className="updates-editor__bar">
                <div className="updates-editor__hint" />
                <button className="updates-btn updates-btn--primary" onClick={saveRequest}>
                  저장
                </button>
              </div>
            </div>

            <div className="updates-list">
              {reqList.map((it) => {
                const comments = commentsMap[it.id] || [];
                const showComposer = canWriteDone && composerForId === it.id;

                return (
                  <article
                    key={it.id}
                    className={`updates-item ${canWriteDone ? "is-clickable" : ""}`}
                  >
                    <div className="updates-item__meta">
                      <span className="updates-chip updates-chip--request">요청</span>
                      <span className="updates-item__who">
                        {it.displayName || it.userId || "알 수 없음"}
                      </span>
                      <span className="updates-item__time">{fmtTime(it.createdAt)}</span>

                      {/* 삭제 버튼 (요청은 누구나) */}
                      <div className="updates-item__actions">
                        <button
                          className="updates-iconbtn"
                          title="삭제"
                          onClick={() => deleteRequest(it.id)}
                        >
                          <i className="ri-delete-bin-6-line" />
                        </button>
                      </div>
                    </div>

                    {/* 본문 (사번 1번만 클릭 시 댓글 입력창 열림) */}
                    <div
                      className={canWriteDone ? "updates-item__content is-clickable" : "updates-item__content"}
                      onClick={() => {
                        if (!canWriteDone) return;
                        setComposerForId((prev) => (prev === it.id ? "" : it.id));
                        setTimeout(() => {
                          if (composerTARef.current) composerTARef.current.focus();
                        }, 0);
                      }}
                      title={canWriteDone ? "댓글 작성(사번 1)" : undefined}
                    >
                      {it.content}
                    </div>

                    {/* (항상 보이는) 댓글 목록 */}
                    {comments.length > 0 && (
                      <div className="updates-comments">
                        <div className="updates-comments__list">
                          {comments.map((c) => (
                            <div key={c.id} className="updates-comment">
                              <div className="updates-comment__meta">
                                <span className="updates-comment__who">
                                  {c.displayName || c.userId || "알 수 없음"}
                                </span>
                                <span className="updates-comment__time">
                                  {fmtTime(c.createdAt)}
                                </span>
                              </div>
                              <div className="updates-comment__content">{c.content}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* (사번 1 전용) 작은 댓글 입력창 - 본문 아래에 compact하게 표시 */}
                    {showComposer && (
                      <div className="updates-comment__composer">
                        <textarea
                          ref={composerTARef}
                          className="updates-textarea updates-textarea--compact"
                          placeholder="댓글을 입력하세요. (사원번호 1번 전용)"
                          rows={2}
                          value={composerText}
                          onChange={(e) => setComposerText(e.target.value)}
                        />
                        <div className="updates-editor__bar">
                          <div className="updates-editor__hint" />
                          <div className="flex gap-2">
                            <button
                              className="updates-btn updates-btn--ghost"
                              onClick={() => {
                                setComposerText("");
                                setComposerForId("");
                              }}
                            >
                              취소
                            </button>
                            <button
                              className="updates-btn updates-btn--primary"
                              onClick={() => saveComment(it.id)}
                            >
                              댓글 저장
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
              {reqList.length === 0 && (
                <div className="updates-empty">등록된 요청이 없습니다.</div>
              )}
            </div>
          </section>

          {/* 완료 영역 */}
          <section className="updates-card">
            <div className="updates-card__head">
              <div className="updates-card__title">
                <i className="ri-shield-check-line" aria-hidden />
                업데이트 완료
              </div>
            </div>

            <div className={`updates-editor ${!canWriteDone ? "is-disabled" : ""}`}>
              <textarea
                ref={doneTARef}
                className="updates-textarea updates-textarea--fixed"
                placeholder={canWriteDone ? "" : "작성 권한이 없습니다."}
                value={doneInput}
                onChange={(e) => setDoneInput(e.target.value)}
                rows={5}
                disabled={!canWriteDone}
              />
              <div className="updates-editor__bar">
                <div className="updates-editor__hint" />
                <button
                  className="updates-btn updates-btn--primary"
                  onClick={saveDone}
                  disabled={!canWriteDone}
                >
                  저장
                </button>
              </div>
            </div>

            <div className="updates-list">
              {doneList.map((it) => (
                <article key={it.id} className="updates-item">
                  <div className="updates-item__meta">
                    <span className="updates-chip updates-chip--done">완료</span>
                    <span className="updates-item__who">
                      {it.displayName || it.userId || "알 수 없음"}
                    </span>
                    <span className="updates-item__time">{fmtTime(it.createdAt)}</span>

                    {/* 삭제 버튼 (완료는 1번만) */}
                    {canWriteDone && (
                      <div className="updates-item__actions">
                        <button
                          className="updates-iconbtn"
                          title="삭제"
                          onClick={() => deleteDone(it.id)}
                        >
                          <i className="ri-delete-bin-6-line" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="updates-item__content">{it.content}</div>
                </article>
              ))}
              {doneList.length === 0 && (
                <div className="updates-empty">완료된 업데이트가 없습니다.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
