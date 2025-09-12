// src/pages/MemoPage.js
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import PageTitle from "../components/PageTitle";

const s = (v) => String(v ?? "").trim();

export default function MemoPage({ userId }) {
  const [memos, setMemos] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null); // {id, title, content, pinned, updatedAt}
  const [form, setForm] = useState({ title: "", content: "", pinned: false });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false); // '메모 추가' 팝업
  const [copiedToast, setCopiedToast] = useState(false); // 복사 알림

  // 카드 정렬: pinned 우선, 그 다음 updatedAt desc
  const sortMemos = (arr) =>
    [...arr].sort((a, b) => {
      if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0))
        return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

  // 실시간 구독: updatedAt DESC만(복합 인덱스 불필요)
  useEffect(() => {
    const qy = query(collection(db, "memos"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(qy, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setMemos(sortMemos(list));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 검색(제목/내용)
  const filtered = useMemo(() => {
    const k = s(keyword).toLowerCase();
    if (!k) return memos;
    return memos.filter(
      (m) =>
        s(m.title).toLowerCase().includes(k) ||
        s(m.content).toLowerCase().includes(k)
    );
  }, [memos, keyword]);

  const resetForm = () => {
    setForm({ title: "", content: "", pinned: false });
    setEditing(null);
  };

  // 복사(카드 더블클릭): 내용만
  const copyOnlyContent = async (content) => {
    try {
      await navigator.clipboard.writeText(s(content));
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 1200);
    } catch {
      alert("복사에 실패했습니다.");
    }
  };

  // 추가/수정
  const submit = async (e) => {
    e?.preventDefault?.();
    const title = s(form.title);
    const content = s(form.content);
    const pinned = !!form.pinned;
    if (!title && !content) return;

    const now = Date.now();

    if (editing) {
      // ✅ 수정 시 순서 유지: updatedAt 변경하지 않음
      const originalUpdatedAt = editing.updatedAt ?? now;

      const prevBefore = memos;
      // 1) 즉시 반영(단, updatedAt 그대로 유지)
      setMemos((prev) =>
        sortMemos(
          prev.map((m) =>
            m.id === editing.id
              ? { ...m, title, content, pinned, updatedAt: originalUpdatedAt }
              : m
          )
        )
      );
      try {
        // 2) 서버 반영: updatedAt은 보내지 않음(변경 없음)
        await updateDoc(doc(db, "memos", editing.id), {
          title,
          content,
          pinned,
          lastEditedAtServer: serverTimestamp(), // 감사용
          updatedBy: userId || "system",
        });
        // 3) 폼 닫기
        resetForm();
        setShowForm(false);
      } catch (err) {
        console.error(err);
        alert("메모 수정 저장 중 오류가 발생했습니다.");
        setMemos(prevBefore); // 롤백
      }
    } else {
      // 추가는 updatedAt=now로 맨 앞으로 오게 유지
      const tempId = `temp-${now}`;
      const tempItem = {
        id: tempId,
        title,
        content,
        pinned,
        createdAt: now,
        updatedAt: now,
        createdBy: userId || "system",
        updatedBy: userId || "system",
        _optimistic: true,
      };
      // 1) 즉시 반영
      setMemos((prev) => sortMemos([tempItem, ...prev]));

      try {
        // 2) 서버 반영
        const ref = await addDoc(collection(db, "memos"), {
          title,
          content,
          pinned,
          createdAt: now,
          createdAtServer: serverTimestamp(),
          updatedAt: now,
          updatedAtServer: serverTimestamp(),
          createdBy: userId || "system",
          updatedBy: userId || "system",
        });
        // 3) 임시 ID → 실제 ID 교체
        setMemos((prev) =>
          sortMemos(
            prev.map((m) =>
              m.id === tempId ? { ...m, id: ref.id, _optimistic: false } : m
            )
          )
        );
        resetForm();
        setShowForm(false);
      } catch (err) {
        console.error(err);
        alert("메모 저장 중 오류가 발생했습니다.");
        // 실패 시 임시 항목 제거
        setMemos((prev) => prev.filter((m) => m.id !== tempId));
      }
    }
  };

  const startEdit = (m) => {
    setEditing(m);
    setForm({
      title: s(m.title),
      content: s(m.content),
      pinned: !!m.pinned,
    });
    if (!showForm) setShowForm(true);
  };

  const del = async (id) => {
    if (!window.confirm("정말 삭제하시겠어요?")) return;
    const prevBefore = memos;
    // 즉시 반영
    setMemos((prev) => prev.filter((m) => m.id !== id));
    if (editing?.id === id) resetForm();
    try {
      await deleteDoc(doc(db, "memos", id));
    } catch (err) {
      console.error(err);
      alert("메모 삭제 중 오류가 발생했습니다.");
      setMemos(prevBefore); // 롤백
    }
  };

  const togglePin = async (m) => {
    // 핀 토글은 기존 동작 유지(순서 변동 허용)
    const now = Date.now();
    const prevBefore = memos;
    setMemos((prev) =>
      sortMemos(
        prev.map((x) =>
          x.id === m.id ? { ...x, pinned: !x.pinned, updatedAt: now } : x
        )
      )
    );
    try {
      await updateDoc(doc(db, "memos", m.id), {
        pinned: !m.pinned,
        updatedAt: now,
        updatedAtServer: serverTimestamp(),
        updatedBy: userId || "system",
      });
    } catch (err) {
      console.error(err);
      alert("상단 고정 변경 저장 중 오류가 발생했습니다.");
      setMemos(prevBefore);
    }
  };

  // 카드 내용 스크롤바 스타일
  const ScrollbarStyle = () => (
    <style>{`
      .memo-scroll {
        scrollbar-width: thin;
        scrollbar-color: rgba(109,94,252,.6) rgba(0,0,0,0.06);
      }
      .memo-scroll::-webkit-scrollbar { width: 8px; }
      .memo-scroll::-webkit-scrollbar-track {
        background: rgba(0,0,0,0.04); border-radius: 8px;
      }
      .memo-scroll::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, #d946ef, #6366f1, #06b6d4);
        border-radius: 8px;
      }
      .memo-scroll::-webkit-scrollbar-thumb:hover { filter: brightness(0.95); }
    `}</style>
  );

  return (
    <div className="p-4">
      <ScrollbarStyle />
      <PageTitle title="메모" />

      {/* 상단 툴바: 좌측 메모추가(팝업 앵커), 우측 검색 */}
      <div className="flex items-center justify-between gap-3">
        {/* 버튼 기준 팝업 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (editing) resetForm();
              setShowForm((v) => !v);
            }}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-lg 
                       bg-gradient-to-r from-purple-600 to-cyan-600 text-white 
                       hover:opacity-90 active:scale-[0.98] transition"
            title="메모 추가"
          >
            <i className="ri-add-line text-lg"></i>
            메모 추가
          </button>

          {/* 버튼에 '붙어서' 펼쳐지는 팝업 폼 */}
          {showForm && (
            <form
              onSubmit={submit}
              className="absolute left-0 top-[calc(100%+8px)] z-20
                         w-[min(80vw,28rem)] bg-white/95 backdrop-blur border rounded-2xl p-4
                         shadow-[0_16px_48px_rgba(0,0,0,0.2)]
                         before:absolute before:inset-0 before:rounded-2xl before:p-[1px]
                         before:bg-gradient-to-r before:from-fuchsia-500/40 before:via-purple-500/40 before:to-cyan-500/40 before:-z-10"
              style={{ maskImage: "linear-gradient(#000,#000)" }}
            >
              <div className="grid gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-800">제목</label>
                  <input
                    className="w-full mt-1 px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-300 bg-white/80"
                    placeholder="제목을 입력하세요"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-800">내용</label>
                  <textarea
                    className="w-full mt-1 px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-300 min-h-[120px] bg-white/80"
                    placeholder="메모 내용을 입력하세요"
                    value={form.content}
                    onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  {/* 상단 고정 토글 */}
                  <label className="flex items-center gap-3 select-none cursor-pointer">
                    <span className="text-sm text-gray-700">상단 고정</span>
                    <span className="relative inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={form.pinned}
                        onChange={(e) => setForm((p) => ({ ...p, pinned: e.target.checked }))}
                        className="peer sr-only"
                      />
                      <span className="w-12 h-6 bg-gray-300 rounded-full transition peer-checked:bg-purple-500"></span>
                      <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform 
                                       peer-checked:translate-x-6 shadow" />
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    {editing ? (
                      <>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white hover:opacity-90"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-lg border-2 
                                     border-transparent 
                                     text-gray-800 hover:text-gray-900
                                     bg-white
                                     shadow-[0_4px_14px_rgba(99,102,241,0.18)]
                                     hover:shadow-[0_6px_18px_rgba(99,102,241,0.28)]
                                     transition
                                     [--g1:#d946ef] [--g2:#6366f1] [--g3:#06b6d4]"
                          style={{
                            backgroundImage:
                              "linear-gradient(#fff,#fff),linear-gradient(90deg,var(--g1),var(--g2),var(--g3))",
                            backgroundOrigin: "border-box",
                            backgroundClip: "padding-box,border-box",
                            border: "2px solid transparent",
                          }}
                          onClick={() => {
                            resetForm();
                            setShowForm(false);
                          }}
                        >
                          닫기
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-600 text-white hover:opacity-90"
                        >
                          추가
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-lg border-2 
                                     border-transparent 
                                     text-gray-800 hover:text-gray-900
                                     bg-white
                                     shadow-[0_4px_14px_rgba(99,102,241,0.18)]
                                     hover:shadow-[0_6px_18px_rgba(99,102,241,0.28)]
                                     transition
                                     [--g1:#d946ef] [--g2:#6366f1] [--g3:#06b6d4]"
                          style={{
                            backgroundImage:
                              "linear-gradient(#fff,#fff),linear-gradient(90deg,var(--g1),var(--g2),var(--g3))",
                            backgroundOrigin: "border-box",
                            backgroundClip: "padding-box,border-box",
                            border: "2px solid transparent",
                          }}
                          onClick={() => {
                            resetForm();
                            setShowForm(false);
                          }}
                        >
                          닫기
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* 검색창 */}
        <input
          className="w-[320px] max-w-full px-4 h-10 rounded-xl border outline-none 
                     bg-white/80 backdrop-blur 
                     focus:ring-2 focus:ring-fuchsia-300 
                     shadow-[0_6px_18px_rgba(99,102,241,0.15)]
                     border-transparent
                     [--g1:#d946ef] [--g2:#6366f1] [--g3:#06b6d4]"
          style={{
            backgroundImage:
              "linear-gradient(#fff,#fff),linear-gradient(90deg,var(--g1),var(--g2),var(--g3))",
            backgroundOrigin: "border-box",
            backgroundClip: "padding-box,border-box",
            border: "2px solid transparent",
          }}
          placeholder="검색어 입력"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {/* 상단 토스트(복사 안내) */}
{copiedToast && (
  <div className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none">
    <div className="px-4 py-2 rounded-lg text-white bg-black/70 backdrop-blur shadow pointer-events-auto">
      내용이 복사되었습니다.
    </div>
  </div>
)}


      {/* 리스트 */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-3">
        {filtered.map((m) => (
          <article
            key={m.id}
            onDoubleClick={() => copyOnlyContent(m.content)} // ✅ 더블클릭 복사: 내용만
            className="relative border rounded-2xl bg-white/70 backdrop-blur p-4 flex flex-col gap-3
                       shadow-[0_10px_25px_rgba(0,0,0,0.06)]
                       hover:shadow-[0_12px_30px_rgba(99,102,241,0.25)] transition
                       before:absolute before:inset-0 before:rounded-2xl before:p-[1px]
                       before:bg-gradient-to-r before:from-fuchsia-400/40 before:via-purple-400/40 before:to-cyan-400/40 before:-z-10"
            style={{ height: 240 }} // 고정 높이 유지
            title="더블클릭하면 내용이 복사됩니다."
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-gray-900 line-clamp-1">
                {s(m.title) || "(제목 없음)"}
              </h3>
              <button
                className={`text-sm px-2 py-1 rounded-md border ${
                  m.pinned
                    ? "bg-amber-100 border-amber-300 text-amber-700"
                    : "hover:bg-gray-50"
                }`}
                title="상단 고정 토글"
                onClick={() => togglePin(m)}
              >
                <i
                  className={
                    m.pinned ? "ri-pushpin-2-fill" : "ri-pushpin-2-line"
                  }
                ></i>
              </button>
            </div>

            {/* 내용: 고정 높이 + 스크롤 + 커스텀 스크롤바 */}
            <div
              className="memo-scroll text-sm text-gray-700 whitespace-pre-wrap rounded-md"
              style={{ height: 130, overflow: "auto", paddingRight: 6 }}
            >
              {s(m.content)}
            </div>

            <div className="mt-auto pt-2 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50"
                onClick={() => startEdit(m)}
              >
                수정
              </button>
              <button
                className="px-3 py-1.5 text-sm rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => del(m.id)}
              >
                삭제
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* 빈 상태 */}
      {!loading && filtered.length === 0 && (
        <div className="mt-10 text-center text-gray-400">메모가 없습니다.</div>
      )}
    </div>
  );
}
