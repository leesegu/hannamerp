// src/pages/ResidentCardPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import "./ResidentCardPage.css";

/* ===== [신규] 아이콘 (디자인 변경) ===== */
// 페이지 제목 아이콘
const IconPage = () => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 8 9 8 7"/></svg> );
// 하자체크 아이콘
const IconListCheck = () => ( <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m0 10v-5l-2.5 2.5-2.5-2.5v5"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12h-2"/><path d="M10 16h-4"/></svg> );
// 기타내용 아이콘
const IconNote = () => ( <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><polyline points="15 3 15 9 21 9"/><line x1="8" y1="15" x2="16" y2="15"/></svg> );
// 사진 아이콘
const IconImage = () => ( <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> );
// 삭제 아이콘
const IconTrashCan = () => ( <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> );
// 복사 아이콘
const IconCopy = () => ( <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> );
// + 아이콘
const IconPlus = () => ( <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> );
// 새로고침 아이콘
const IconRefresh = () => ( <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> );
// [신규] 세련된 X 닫기 아이콘
const IconStylishX = () => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> );
// 링크 아이콘
const IconLink = () => ( <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> );

export default function ResidentCardPage() {
  const [rows, setRows] = useState([]); // 제출본
  const [modal, setModal] = useState({ open: false, type: "", content: null, title: "" });
  const [lightboxSrc, setLightboxSrc] = useState(null); // [신규] 라이트박스 상태

  // ✅ Functions (서울 리전)
  const functions = useMemo(() => getFunctions(undefined, "asia-northeast3"), []);

  // ===== 링크 생성/목록 모달 =====
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ villaName: "", unitNo: "", phone: "" });
  const [activeLinks, setActiveLinks] = useState([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);

  const villaRef = useRef(null);
  const unitRef = useRef(null);
  const phoneRef = useRef(null);

  const loadActiveLinks = async () => {
    setIsLoadingLinks(true);
    try {
      const listActive = httpsCallable(functions, "listActiveIntakeLinks");
      const res = await listActive();
      setActiveLinks(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error("[listActiveIntakeLinks 실패]", e);
      alert("대기 링크 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoadingLinks(false);
    }
  };

  const onCreateLink = async () => {
    if (!form.villaName || !form.unitNo || !form.phone) {
      alert("빌라명, 호수, 연락처를 모두 입력하세요.");
      return;
    }
    try {
      setCreating(true);
      const create = httpsCallable(functions, "createIntakeLink");
      // [신규] 하이픈 제거 후 전송
      const res = await create({
        ...form,
        phone: form.phone.replace(/-/g, ""),
      });

      // 클립보드 복사
      if (res.data?.url) {
        try {
          await navigator.clipboard.writeText(res.data.url);
          alert("생성 완료! 링크가 클립보드에 복사되었습니다.");
        } catch {
          alert("생성 완료! (클립보드 복사는 브라우저 정책으로 실패했습니다)");
        }
      } else {
        alert("생성 완료!");
      }

      // 입력창 초기화 + 목록 갱신(즉시 반영)
      setForm({ villaName: "", unitNo: "", phone: "" });
      await loadActiveLinks();
      // 포커스 되돌리기
      villaRef.current?.focus?.();
    } catch (e) {
      console.error("[createIntakeLink 실패]", e);
      alert("링크 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  };

  // 엔터로 다음 입력창 이동
  const handleKeyDown = (e, nextRef) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (nextRef && nextRef.current) {
        nextRef.current.focus();
      } else {
        // 마지막 입력창(전화번호)에서 엔터 → 모두 입력 시 생성
        if (form.villaName && form.unitNo && form.phone && !creating) {
          onCreateLink();
        }
      }
    }
  };

  // [신규] 연락처 자동 하이픈 포맷터
  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/[^\d]/g, ""); // 숫자만 추출
    let formattedValue = "";
    
    if (value.length < 4) {
      formattedValue = value;
    } else if (value.length < 8) {
      formattedValue = `${value.slice(0, 3)}-${value.slice(3)}`;
    } else {
      // 010-1234-5678 (11자리)
      formattedValue = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
    }
    
    setForm(f => ({...f, phone: formattedValue}));
  };

  useEffect(() => {
    // 제출본 실시간 구독
    const q = query(collection(db, "resident_cards"), orderBy("createdAt", "desc"));
    const unsubRows = onSnapshot(q, (snap) => {
      const next = [];
      snap.forEach(d => next.push({ id: d.id, ...d.data() }));
      setRows(next);
    });

    // 로그인 상태 확정 후에만 링크 목록 호출
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // 모달을 열 때 로드
      }
    });

    return () => { unsubRows(); unsubAuth(); };
  }, []);

  // [수정] 하자체크 그룹화 로직
  const openChecklist = (row) => {
    const items = Object.entries(row.checklist || {})
      .filter(([, v]) => !!v)
      .map(([k]) => k.split("_")); // -> [["옵션", "쇼파"], ["옵션", "건조기"]]

    // {"옵션": ["쇼파", "건조기"], "주방": ["냉장고"]}
    const grouped = items.reduce((acc, [category, item]) => {
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    }, {});
    
    setModal({ open: true, type: "list", title: "하자체크", content: grouped });
  };

  const openNotes = (row) => setModal({ open: true, type: "text", title: "기타내용", content: row.notes || "" });

  const openPhotos = (row) => setModal({ open: true, type: "photos", title: "사진", content: row.photos || [] });

  // [수정] 삭제 딜레이 개선 (Optimistic UI)
  const onDelete = async (row) => {
    if (!window.confirm("정말 삭제할까요? (복구 불가)")) return;

    const rowToDelete = row; // 참조 유지
    
    // 1. UI에서 즉시 제거 (낙관적 업데이트)
    setRows(prevRows => prevRows.filter(r => r.id !== rowToDelete.id));

    try {
      // 2. 백엔드 함수 호출
      const del = httpsCallable(functions, "deleteResidentCard");
      await del({ id: rowToDelete.id });
      // 3. 성공: onSnapshot이 어차피 이 상태를 반영하므로 추가 작업 불필요
    } catch (e) {
      // 4. 실패: UI 롤백 및 알림
      console.error("[deleteResidentCard 실패]", e);
      alert("삭제에 실패했습니다. 목록을 복원합니다.");
      // 삭제했던 항목을 다시 추가
      setRows(prevRows => [rowToDelete, ...prevRows]);
      // (onSnapshot 리스너가 결국 올바른 순서로 다시 정렬해 줄 것입니다)
    }
  };

  const openLinkModal = async () => {
    setLinkModalOpen(true);
    await loadActiveLinks();
    setTimeout(() => villaRef.current?.focus?.(), 0);
  };
  
  // [신규] 상세 모달 닫기 (라이트박스도 함께 닫기)
  const closeModal = () => {
    setModal(m => ({...m, open: false}));
    setLightboxSrc(null); // 라이트박스 닫기
  }

  return (
    <div className="rcp">
      {/* ===== [수정] 상단 패널 제거, 헤더+버튼 통합 ===== */}
      <div className="page-header">
        <h3 className="section-title">
          <IconPage /> {/* [신규] 아이콘 추가 */}
          <span>입주자카드 제출 내역</span>
        </h3>
        <button className="btn-primary" onClick={openLinkModal} title="링크 생성/목록">
          <IconPlus /> <span>링크 생성 / 목록</span>
        </button>
      </div>

      {/* ===== 하단: 제출 내역 테이블 ===== */}
      <div className="card">
        <div className="table-wrapper">
          <table className="rcp-table">
            <thead>
              <tr>
                <th>입주날짜</th>
                <th>빌라명</th>
                <th>주소</th>
                <th>성함</th>
                <th>전화번호</th>
                <th>하자체크</th>
                <th>기타내용</th>
                <th>사진</th>
                <th>제출일자</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={10} className="py-10 text-center text-gray-500">제출 내역이 없습니다.</td></tr>
              )}
              {rows.map((r) => {
                const hasChecklist = Object.values(r.checklist || {}).some(Boolean);
                const hasNotes = !!(r.notes && String(r.notes).trim());
                const hasPhotos = Array.isArray(r.photos) && r.photos.length > 0;
                return (
                  <tr key={r.id}>
                    <td>{r.move_in_date || ""}</td>
                    <td>{r.villa_name || r.villaName || ""}</td>
                    <td className="truncate">{r.address || ""}</td>
                    <td>{r.name || ""}</td>
                    <td>{r.phone || ""}</td>
                    <td className="text-center">
                      {hasChecklist && (
                        // [수정] 새 아이콘 및 전용 클래스 적용
                        <button className="icon icon-checklist" onClick={() => openChecklist(r)} title="하자체크 보기"><IconListCheck/></button>
                      )}
                    </td>
                    <td className="text-center">
                      {hasNotes && (
                        // [수정] 새 아이콘 및 전용 클래스 적용
                        <button className="icon icon-notes" onClick={() => openNotes(r)} title="기타내용 보기"><IconNote/></button>
                      )}
                    </td>
                    <td className="text-center">
                      {hasPhotos && (
                        // [수정] 새 아이콘 및 전용 클래스 적용
                        <button className="icon icon-photo" onClick={() => openPhotos(r)} title="사진 보기"><IconImage/></button>
                      )}
                    </td>
                    <td>{r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('ko-KR') : ""}</td>
                    <td className="text-center">
                      {/* [수정] 새 아이콘 적용 */}
                      <button className="icon danger" onClick={() => onDelete(r)} title="삭제"><IconTrashCan/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== [수정] 상세 모달 (디자인 개편) ===== */}
      {modal.open && (
        <div className="modal" onClick={closeModal}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            {/* [신규] 모달 헤더 디자인 */}
            <div className="panel-header">
              <h3 className="modal-title">{modal.title}</h3>
              <button className="icon close" onClick={closeModal}><IconStylishX /></button>
            </div>

            {/* [수정] 하자체크 (리스트 -> 그룹 렌더링) */}
            {modal.type === "list" && (
              <div className="modal-content">
                {Object.keys(modal.content).length === 0 ? (
                  <p className="text-gray-500">체크 항목 없음</p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(modal.content).map(([category, items]) => (
                      <div key={category} className="checklist-group">
                        <h4 className="checklist-category">{category}</h4>
                        <div className="checklist-items-container">
                          {items.map((item, i) => (
                            <span key={i} className="checklist-item-tag">{item}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {modal.type === "text" && (
              <div className="modal-content whitespace-pre-wrap">{modal.content || "없음"}</div>
            )}

            {/* [수정] 사진 (button으로 변경, 라이트박스 연동) */}
            {modal.type === "photos" && (
              <div className="modal-content grid grid-cols-2 md:grid-cols-3 gap-4">
                {(modal.content || []).map((src, i) => (
                  <button key={i} className="photo-thumb" onClick={() => setLightboxSrc(src)}>
                    <img src={src} alt={`photo-${i}`} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== [신규] 사진 라이트박스 ===== */}
      {lightboxSrc && (
        <div className="lightbox" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="Enlarged" onClick={(e) => e.stopPropagation()} />
          <button className="icon close" onClick={() => setLightboxSrc(null)}><IconStylishX /></button>
        </div>
      )}

      {/* ===== 링크 생성/목록 모달 ===== */}
      {linkModalOpen && (
        <div className="rcp-modal" onClick={() => setLinkModalOpen(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="modal-title">
                <IconLink />
                <span>링크 생성 / 목록</span>
              </h3>
              <button className="icon close" onClick={() => setLinkModalOpen(false)}><IconStylishX /></button>
            </div>
            
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  ref={villaRef}
                  className="ipt ipt-sm"
                  placeholder="빌라명"
                  value={form.villaName}
                  onChange={e => setForm(f => ({...f, villaName: e.target.value}))}
                  onKeyDown={(e) => handleKeyDown(e, unitRef)}
                />
                <input
                  ref={unitRef}
                  className="ipt ipt-sm"
                  placeholder="호수"
                  value={form.unitNo}
                  onChange={e => setForm(f => ({...f, unitNo: e.target.value}))}
                  onKeyDown={(e) => handleKeyDown(e, phoneRef)}
                />
                <input
                  ref={phoneRef}
                  className="ipt ipt-sm"
                  placeholder="연락처 (예: 010-1234-5678)"
                  value={form.phone}
                  onChange={handlePhoneChange} 
                  onKeyDown={(e) => handleKeyDown(e, null)}
                  maxLength="13"
                />
              </div>

              <div className="flex gap-3 justify-end mt-4">
                <button className="btn-primary" disabled={creating} onClick={onCreateLink}>
                  {creating ? "생성중..." : "링크 생성 및 복사"}
                </button>
              </div>
            </div>

            <div className="waiting-list">
              <div className="list-head">
                <div className="c c-when">생성날짜</div>
                <div className="c c-villa">빌라명</div>
                <div className="c c-unit">호수</div>
                <div className="c c-phone">연락처</div>
                <div className="c">링크주소</div>
                <div className="c c-act">복사</div>
              </div>
              <div className="list-body">
                {isLoadingLinks ? (
                  <div className="empty">불러오는 중...</div>
                ) : activeLinks.length === 0 ? (
                  <div className="empty">대기중(미제출) 링크가 없습니다.</div>
                ) : (
                  activeLinks.map((r) => (
                    <div className="row" key={r.id}>
                      <div className="c c-when">{r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('ko-KR') : ""}</div>
                      <div className="c c-villa">{r.villaName}</div>
                      <div className="c c-unit">{r.unitNo}</div>
                      <div className="c c-phone">{r.phone}</div>
                      <div className="c">
                        <a className="link" href={r.url} target="_blank" rel="noreferrer" title={r.url}>
                          <span className="ml-1 truncate">{r.url}</span>
                        </a>
                      </div>
                      <div className="c c-act">
                        <button
                          className="icon"
                          onClick={async () => {
                            try { 
                              await navigator.clipboard.writeText(r.url);
                              alert('복사되었습니다.');
                            } catch {}
                          }}
                          title="링크 복사"
                        >
                          <IconCopy />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="list-footer hint">
                <div className="flex-1">
                  ※ 입주자가 제출을 완료하면 해당 링크는 목록에서 자동으로 사라집니다.
                </div>
                <button className="btn" onClick={loadActiveLinks} title="새로고침">
                  <IconRefresh /> <span className="ml-1">새로고침</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}