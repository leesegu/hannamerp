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

/* ─────────────────────────────────────────────── */
const s = (v) => String(v ?? "").trim();
const fmtDateKR = (ms) => {
  if (!ms) return "-";
  const d = new Date(ms);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};
const COLORS = ["#2563eb", "#f59e0b", "#10b981", "#6b7280", "#f97316", "#22c55e"];

/* ─────────────────────────────────────────────── */
export default function MemoPage({ userId }) {
  const [memos, setMemos] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    content: "",
    color: COLORS[0],
    pinned: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 정렬: pinned 우선 → updatedAt desc
  const sortMemos = (arr) =>
    [...arr].sort((a, b) => {
      if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0))
        return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

  // 실시간 구독
  useEffect(() => {
    const qy = query(collection(db, "memos"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(qy, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      const sorted = sortMemos(list);
      setMemos(sorted);
      setLoading(false);
      if (!selectedId && sorted.length) {
        const first = sorted[0];
        setSelectedId(first.id);
        setForm({
          title: s(first.title),
          content: s(first.content),
          color: first.color || COLORS[0],
          pinned: !!first.pinned,
        });
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 검색 필터
  const filtered = useMemo(() => {
    const k = s(keyword).toLowerCase();
    if (!k) return memos;
    return memos.filter(
      (m) =>
        s(m.title).toLowerCase().includes(k) ||
        s(m.content).toLowerCase().includes(k)
    );
  }, [memos, keyword]);

  // 새 메모
  const newMemo = () => {
    setSelectedId(null);
    setForm({ title: "", content: "", color: COLORS[0], pinned: false });
  };

  // 저장(추가/수정)
  const save = async (e) => {
    e?.preventDefault?.();
    const title = s(form.title);
    const content = s(form.content);
    const color = form.color || COLORS[0];
    const pinned = !!form.pinned;
    if (!title && !content) return;

    setSaving(true);
    const now = Date.now();
    try {
      if (selectedId) {
        await updateDoc(doc(db, "memos", selectedId), {
          title,
          content,
          color,
          pinned,
          updatedAt: now,
          updatedAtServer: serverTimestamp(),
          updatedBy: userId || "system",
        });
      } else {
        const ref = await addDoc(collection(db, "memos"), {
          title,
          content,
          color,
          pinned,
          createdAt: now,
          createdAtServer: serverTimestamp(),
          updatedAt: now,
          updatedAtServer: serverTimestamp(),
          createdBy: userId || "system",
          updatedBy: userId || "system",
        });
        setSelectedId(ref.id);
      }
    } catch (e1) {
      console.error(e1);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 삭제
  const remove = async () => {
    if (!selectedId) return;
    if (!window.confirm("이 메모를 삭제할까요?")) return;
    const id = selectedId;
    setSelectedId(null);
    setForm({ title: "", content: "", color: COLORS[0], pinned: false });
    try {
      await deleteDoc(doc(db, "memos", id));
    } catch (e2) {
      console.error(e2);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const togglePin = async () => {
    if (!selectedId) return;
    try {
      await updateDoc(doc(db, "memos", selectedId), {
        pinned: !form.pinned,
        updatedAt: Date.now(),
        updatedAtServer: serverTimestamp(),
      });
      setForm((p) => ({ ...p, pinned: !p.pinned }));
    } catch (e3) {
      console.error(e3);
    }
  };

  // 내부 스크롤 전용 얇은 스크롤바
  const InlineStyle = () => (
    <style>{`
      .thin-scroll {
        scrollbar-width: thin;
        scrollbar-color: rgba(100,100,120,.5) rgba(0,0,0,.06);
      }
      .thin-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
      .thin-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,.05); border-radius: 8px; }
      .thin-scroll::-webkit-scrollbar-thumb { background: rgba(100,100,120,.45); border-radius: 8px; }
      .thin-scroll::-webkit-scrollbar-thumb:hover { background: rgba(100,100,120,.65); }
    `}</style>
  );

  return (
    // 🔒 외부 스크롤 차단: 화면 고정 + 내부 영역만 스크롤
    <div className="h-screen overflow-hidden flex flex-col">
      <InlineStyle />

      {/* 상단 헤더 */}
      <header className="px-4 py-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 text-white">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <PageTitle title="메모" />
          <div className="flex items-center gap-2">
            <input
              className="w-[260px] h-10 px-3 rounded-xl text-gray-800 outline-none"
              placeholder="검색어 입력"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <button
              onClick={newMemo}
              className="h-10 px-4 rounded-xl bg-white text-indigo-700 font-medium hover:bg-gray-100"
            >
              새 메모
            </button>
          </div>
        </div>
      </header>

      {/* 본문: 내부 고정 높이 + 내부 스크롤만 허용 */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-[1400px] mx-auto h-full px-4 py-4">
          <div className="grid grid-cols-[360px,1fr] gap-4 h-full">
            {/* ───────────────── 좌측: 목록 (이 영역만 스크롤) ───────────────── */}
            <aside className="h-full bg-white rounded-2xl border shadow p-3 grid grid-rows-[auto,1fr]">
              <div className="px-2 pb-2 text-sm font-semibold">모든 노트</div>

              {/* ✔ 내부 스크롤 컨테이너 */}
              <div className="overflow-auto thin-scroll pr-1">
                {loading && (
                  <div className="text-gray-400 text-sm px-2 py-8">불러오는 중…</div>
                )}
                {!loading && filtered.length === 0 && (
                  <div className="text-gray-400 text-sm px-2 py-8">메모가 없습니다.</div>
                )}
                <div className="space-y-2">
                  {filtered.map((m) => {
                    const active = selectedId === m.id;
                    const color = m.color || COLORS[0];
                    return (
                      <button
                        key={m.id}
                        className={`w-full text-left rounded-xl border px-3 py-3 bg-white hover:shadow transition ${
                          active ? "outline outline-2 outline-indigo-300" : ""
                        }`}
                        style={{ borderLeft: `6px solid ${color}` }}
                        onClick={() => {
                          setSelectedId(m.id);
                          setForm({
                            title: s(m.title),
                            content: s(m.content),
                            color,
                            pinned: !!m.pinned,
                          });
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium line-clamp-1 flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ background: color }}
                            />
                            {s(m.title) || "(제목 없음)"}
                          </div>
                          <div className="text-xs text-gray-400">
                            {fmtDateKR(m.updatedAt || m.createdAt)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            {/* ───────────────── 우측: 에디터 (상/중/하 3행 그리드) ───────────────── */}
            <section className="h-full bg-white rounded-2xl border shadow grid grid-rows-[auto,1fr,auto]">
              {/* 상단 바: 제목/핀/색상 */}
              <div className="p-4 border-b">
                <div className="flex items-center gap-3">
                  <input
                    className="flex-1 h-11 px-3 rounded-lg border outline-none"
                    placeholder="제목을 입력하세요"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  />
                  <button
                    onClick={togglePin}
                    className={`h-10 px-3 rounded-lg border ${
                      form.pinned ? "bg-amber-100 border-amber-300 text-amber-700" : "bg-white"
                    }`}
                    title="상단 고정"
                  >
                    <i className={form.pinned ? "ri-pushpin-2-fill" : "ri-pushpin-2-line"} />
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, color: c }))}
                      className="w-6 h-6 rounded-full border"
                      style={{
                        background: c,
                        boxShadow: form.color === c ? "0 0 0 2px rgba(99,102,241,.4)" : "none",
                      }}
                      title="노트 색상"
                    />
                  ))}
                </div>
              </div>

              {/* 중앙: 내용창(이 영역만 스크롤) */}
              <div className="overflow-auto thin-scroll p-4">
                <textarea
                  className="w-full h-full min-h-[520px] px-3 py-2 rounded-lg border outline-none text-[14px]"
                  style={{ resize: "vertical" }}
                  placeholder="메모 내용을 입력하세요"
                  value={form.content}
                  onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                />
              </div>

              {/* 하단: 버튼바 (항상 보임) */}
              <div className="p-4 border-t flex justify-end gap-2">
                {selectedId && (
                  <button
                    onClick={remove}
                    className="h-10 px-4 rounded-lg border text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={saving}
                  className="h-10 px-5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? "저장 중..." : selectedId ? "수정 저장" : "추가 저장"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
