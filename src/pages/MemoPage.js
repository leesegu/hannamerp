// src/pages/MemoPage.js
import React, { useEffect, useMemo, useState, useRef } from "react";
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
  const [editing, setEditing] = useState(null); // {id, title, content, pinned}
  const [form, setForm] = useState({ title: "", content: "", pinned: false });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false); // ✅ 상단 '메모 추가' 펼침 제어

  const listWrapRef = useRef(null);

  // 정렬 헬퍼
  const sortMemos = (arr) =>
    [...arr].sort((a, b) => {
      if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

  // ✅ 실시간 구독: pinned DESC, updatedAt DESC (updatedAt은 클라이언트 ms 타임스탬프)
  useEffect(() => {
    const qy = query(
      collection(db, "memos"),
      orderBy("pinned", "desc"),
      orderBy("updatedAt", "desc")
    );
    const unsub = onSnapshot(qy, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setMemos(sortMemos(list));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ✅ 제목/내용만 검색
  const filtered = useMemo(() => {
    const k = s(keyword).toLowerCase();
    if (!k) return memos;
    return memos.filter(
      (m) => s(m.title).toLowerCase().includes(k) || s(m.content).toLowerCase().includes(k)
    );
  }, [memos, keyword]);

  const resetForm = () => {
    setForm({ title: "", content: "", pinned: false });
    setEditing(null);
  };

  // ✅ 즉시 반영(낙관적 업데이트) + 서버 반영
  const submit = async (e) => {
    e?.preventDefault?.();
    const title = s(form.title);
    const content = s(form.content);
    const pinned = !!form.pinned;
    if (!title && !content) return;

    const now = Date.now();

    if (editing) {
      // 1) 즉시 반영
      setMemos((prev) =>
        sortMemos(
          prev.map((m) =>
            m.id === editing.id ? { ...m, title, content, pinned, updatedAt: now } : m
          )
        )
      );
      // 2) 서버 반영
      await updateDoc(doc(db, "memos", editing.id), {
        title,
        content,
        pinned,
        updatedAt: now,
        updatedAtServer: serverTimestamp(),
        updatedBy: userId || "system",
      });
      // 수정 폼은 닫기 버튼으로 닫도록 유지
    } else {
      // 1) 즉시 반영(임시 ID)
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
      setMemos((prev) => sortMemos([tempItem, ...prev]));

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

      // 3) 임시 ID→실제 ID 치환 (onSnapshot이 곧 덮어쓰지만 체감 즉시성 보강)
      setMemos((prev) =>
        sortMemos(
          prev.map((m) => (m.id === tempId ? { ...m, id: ref.id, _optimistic: false } : m))
        )
      );
      resetForm();
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const del = async (id) => {
    if (!window.confirm("정말 삭제하시겠어요?")) return;
    // 즉시 반영
    setMemos((prev) => prev.filter((m) => m.id !== id));
    if (editing?.id === id) resetForm();
    // 서버 반영
    await deleteDoc(doc(db, "memos", id));
  };

  const togglePin = async (m) => {
    const now = Date.now();
    // 즉시 반영
    setMemos((prev) =>
      sortMemos(
        prev.map((x) =>
          x.id === m.id ? { ...x, pinned: !x.pinned, updatedAt: now } : x
        )
      )
    );
    // 서버 반영
    await updateDoc(doc(db, "memos", m.id), {
      pinned: !m.pinned,
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
      updatedBy: userId || "system",
    });
  };

  return (
    <div className="p-4">
      <PageTitle title="메모" />

      {/* 상단 툴바: 좌측 메모추가, 우측 검색 */}
      <div className="flex items-center justify-between gap-3">
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

        <input
          className="w-[320px] max-w-full px-4 h-10 rounded-xl border outline-none 
                     bg-white/80 backdrop-blur 
                     focus:ring-2 focus:ring-fuchsia-300 
                     shadow-[0_6px_18px_rgba(99,102,241,0.15)]
                     border-transparent
                     [--g1:#d946ef] [--g2:#6366f1] [--g3:#06b6d4]
                     relative"
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

      {/* ===== 🔽 폼 오버레이: 카드 위로 겹쳐서 표시 (absolute) ===== */}
      <div ref={listWrapRef} className="relative">
        {showForm && (
          <form
            onSubmit={submit}
            className="absolute left-0 right-0 mx-0 md:mx-0 top-3 z-20
                       w-full max-w-2xl bg-white/90 backdrop-blur border rounded-2xl p-4 md:p-5
                       shadow-[0_16px_48px_rgba(0,0,0,0.2)]
                       before:absolute before:inset-0 before:rounded-2xl before:p-[1px]
                       before:bg-gradient-to-r before:from-fuchsia-500/40 before:via-purple-500/40 before:to-cyan-500/40 before:-z-10"
            style={{ maskImage: "linear-gradient(#000,#000)" }}
          >
            <div className="grid gap-3">
              <div>
                <label className="text-xs text-gray-600">제목</label>
                <input
                  className="w-full mt-1 px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-300 bg-white/80"
                  placeholder="제목을 입력하세요"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">내용</label>
                <textarea
                  className="w-full mt-1 px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-300 min-h-[120px] bg-white/80"
                  placeholder="메모 내용을 입력하세요"
                  value={form.content}
                  onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                />
              </div>

              <div className="flex items-center justify-between">
                {/* ✅ 커스텀 토글 스위치 */}
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
                        className="px-3 py-2 rounded-lg border text-gray-700 hover:bg-gray-50"
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
                        className="px-3 py-2 rounded-lg border text-gray-700 hover:bg-gray-50"
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

        {/* 리스트: 카드 가로폭 축소 → 컬럼 수 증가 */}
        <div className={`mt-4 grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-3`}>
          {filtered.map((m) => (
            <article
              key={m.id}
              className="relative border rounded-2xl bg-white/70 backdrop-blur p-4 flex flex-col gap-3
                         shadow-[0_10px_25px_rgba(0,0,0,0.06)]
                         hover:shadow-[0_12px_30px_rgba(99,102,241,0.25)] transition
                         before:absolute before:inset-0 before:rounded-2xl before:p-[1px]
                         before:bg-gradient-to-r before:from-fuchsia-400/40 before:via-purple-400/40 before:to-cyan-400/40 before:-z-10"
              style={{ minHeight: 220 }} /* ✅ 정사각형 느낌 유지 */
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-gray-900 line-clamp-1">
                  {s(m.title) || "(제목 없음)"}
                </h3>
                <button
                  onClick={() => togglePin(m)}
                  className={`text-sm px-2 py-1 rounded-md border ${
                    m.pinned ? "bg-amber-100 border-amber-300 text-amber-700" : "hover:bg-gray-50"
                  }`}
                  title="상단 고정 토글"
                >
                  <i className={m.pinned ? "ri-pushpin-2-fill" : "ri-pushpin-2-line"}></i>
                </button>
              </div>

              <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-7">
                {s(m.content)}
              </p>

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
      </div>

      {/* 빈 상태 */}
      {!loading && filtered.length === 0 && (
        <div className="mt-10 text-center text-gray-400">메모가 없습니다.</div>
      )}
    </div>
  );
}
