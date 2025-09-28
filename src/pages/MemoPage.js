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

/* ─────────────────────────────────────────────── */
const s = (v) => String(v ?? "").trim();
const fmtDateKR = (ms) => {
  if (!ms) return "-";
  const d = new Date(ms);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};
const COLORS = ["#2563eb", "#f59e0b", "#10b981", "#6b7280", "#f97316", "#22c55e"];

/* ▶ 패널 전체 높이를 화면보다 살짝 줄이는 오프셋(px) */
const PANEL_OFFSET_PX = 84;

/* 색상 유틸 */
const hexToRgba = (hex, a = 1) => {
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
const isLight = (hex) => {
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 160;
};

/* ─────────────────────────────────────────────── */
export default function MemoPage({ userId }) {
  const [memos, setMemos] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ title: "", content: "", color: COLORS[0], pinned: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 정렬
  const sortMemos = (arr) =>
    [...arr].sort((a, b) => {
      if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
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

  // 외부 스크롤 **강제 차단**
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");

    const prevHtml = { overflowY: html.style.overflowY, scrollbarWidth: html.style.scrollbarWidth };
    const prevBody = { overflowY: body.style.overflowY };
    const prevRoot = { overflowY: root?.style.overflowY };

    html.style.overflowY = "hidden";
    body.style.overflowY = "hidden";
    if (root) root.style.overflowY = "hidden";
    html.style.scrollbarWidth = "none";

    const STYLE_ID = "memo-no-page-scroll";
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement("style");
      s.id = STYLE_ID;
      s.textContent = `
        html::-webkit-scrollbar, body::-webkit-scrollbar, #root::-webkit-scrollbar {
          width: 0 !important; height: 0 !important; background: transparent !important;
        }
      `;
      document.head.appendChild(s);
    }

    return () => {
      html.style.overflowY = prevHtml.overflowY;
      html.style.scrollbarWidth = prevHtml.scrollbarWidth;
      body.style.overflowY = prevBody.overflowY;
      if (root) root.style.overflowY = prevRoot?.overflowY || "";
    };
  }, []);

  // 검색 필터
  const filtered = useMemo(() => {
    const k = s(keyword).toLowerCase();
    if (!k) return memos;
    return memos.filter(
      (m) => s(m.title).toLowerCase().includes(k) || s(m.content).toLowerCase().includes(k)
    );
  }, [memos, keyword]);

  const newMemo = () => {
    setSelectedId(null);
    setForm({ title: "", content: "", color: COLORS[0], pinned: false });
  };

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

  // 전역/스크롤 스타일
  const InlineStyle = () => (
    <style>{`
      html, body, #root { height: 100%; overflow: hidden; overscroll-behavior: none; }
      .page-no-scroll { overflow: clip; }
      .page-no-scroll :not(.thin-scroll) { scrollbar-width: none; }
      .page-no-scroll :not(.thin-scroll)::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
      .thin-scroll { scrollbar-width: thin; scrollbar-color: #a78bfa rgba(167, 139, 250, .18); }
      .thin-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
      .thin-scroll::-webkit-scrollbar-track { background: rgba(167,139,250,.18); border-radius: 999px; }
      .thin-scroll::-webkit-scrollbar-thumb { background: #a78bfa; border-radius: 999px; }
      .thin-scroll::-webkit-scrollbar-thumb:hover { background: #8b5cf6; }
      .lift:hover { transform: translateY(-1px); }
    `}</style>
  );

  return (
    <>
      {/* ✅ 부모 레이아웃 범위 안에서만 차지하도록 fixed 제거 */}
      <div
        className="w-full h-full overflow-hidden grid place-items-center page-no-scroll"
        style={{ scrollbarGutter: "stable both-edges" }}
      >
        <InlineStyle />

        {/* 본문 */}
        <main className="w-full">
          {/* 확장된 전체 가로폭(1600px) + 중앙정렬 */}
          <div className="max-w-[1600px] w-full mx-auto px-4">
            <div className="min-h-0" style={{ height: `calc(100vh - ${PANEL_OFFSET_PX}px)` }}>
              {/* 좌측 패널 폭 440px */}
              <div className="grid grid-cols-[440px,1fr] gap-4 h-full min-h-0">
                {/* 좌측 패널 */}
                <aside className="h-full min-h-0 bg-white rounded-2xl border border-gray-300 shadow-sm grid grid-rows-[auto,auto,1fr]">
                  <div className="flex items-center justify-between px-3 py-3 border-b border-gray-300">
                    <div className="text-sm font-semibold">모든 노트</div>
                    <button
                      onClick={newMemo}
                      className="h-9 px-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm"
                      title="새 메모 추가"
                    >
                      새 메모
                    </button>
                  </div>

                  <div className="px-3 py-2 border-b border-gray-300">
                    <input
                      className="w-full h-10 px-3 rounded-lg border border-gray-300 outline-none bg-gray-50 focus:bg-white"
                      placeholder="메모 검색"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                    />
                  </div>

                  <div className="overflow-auto thin-scroll px-3 py-3 min-h-0">
                    {loading && <div className="text-gray-400 text-sm py-6">불러오는 중…</div>}
                    {!loading && filtered.length === 0 && (
                      <div className="text-gray-400 text-sm py-6">메모가 없습니다.</div>
                    )}
                    <div className="space-y-2">
                      {filtered.map((m) => {
                        const active = selectedId === m.id;
                        const color = m.color || COLORS[0];
                        const bgSoft = hexToRgba(color, 0.16);
                        const bgHover = hexToRgba(color, 0.24);
                        const textDark = isLight(color) ? "text-gray-900" : "text-gray-900";
                        return (
                          <button
                            key={m.id}
                            className={`w-full text-left rounded-xl border border-gray-300 transition lift ${
                              active ? "ring-2 ring-indigo-300" : ""
                            }`}
                            style={{ background: bgSoft }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = bgHover)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = bgSoft)}
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
                            <div className="px-3 py-3">
                              <div className={`flex items-center justify-between gap-3 ${textDark}`}>
                                <div className="font-medium line-clamp-1 flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                                  {s(m.title) || "(제목 없음)"}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-xs text-gray-700/80">
                                    {fmtDateKR(m.updatedAt || m.createdAt)}
                                  </div>
                                  {m.pinned && (
                                    <i className="ri-pushpin-2-fill text-[16px] text-purple-500/80" title="고정" />
                                  )}
                                </div>
                              </div>
                              <div className="mt-2 text-xs text-gray-800/80 line-clamp-2">
                                {s(m.content) ? s(m.content) : "내용 없음"}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </aside>

                {/* 우측 에디터 */}
                <section className="h-full min-h-0 bg-white rounded-2xl border border-gray-300 shadow-sm grid grid-rows-[auto,1fr,auto]">
                  <div className="p-4 border-b border-gray-300">
                    <div className="flex items-center gap-3">
                      {/* 제목 입력 폭 640px */}
                      <input
                        className="flex-none w-[640px] h-11 px-3 rounded-lg border border-gray-300 outline-none"
                        placeholder="제목을 입력하세요"
                        value={form.title}
                        onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                      />

                      <div className="ml-auto flex items-center gap-2">
                        {COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, color: c }))}
                            className="w-6 h-6 rounded-full border border-gray-300"
                            style={{
                              background: c,
                              boxShadow: form.color === c ? "0 0 0 2px rgba(99,102,241,.4)" : "none",
                            }}
                            title="노트 색상"
                          />
                        ))}

                        <button
                          onClick={togglePin}
                          className={`h-10 px-3 rounded-lg border border-gray-300 ${
                            form.pinned ? "bg-amber-100 border-amber-300 text-amber-700" : "bg-white"
                          }`}
                          title="상단 고정"
                        >
                          <i className={form.pinned ? "ri-pushpin-2-fill" : "ri-pushpin-2-line"} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 min-h-0 overflow-hidden">
                    <textarea
                      className="w-full h-full overflow-auto thin-scroll px-3 py-2 rounded-lg border border-gray-300 outline-none text-[14px]"
                      style={{ resize: "none" }}
                      placeholder="메모 내용을 입력하세요"
                      value={form.content}
                      onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                    />
                  </div>

                  <div className="p-4 border-t border-gray-300 flex justify-end gap-2">
                    {selectedId && (
                      <button
                        onClick={remove}
                        className="h-10 px-4 rounded-lg border border-gray-300 text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    )}
                    <button
                      onClick={save}
                      disabled={saving}
                      className="h-10 px-5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {saving ? "저장 중..." : selectedId ? "수정" : "추가"}
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
