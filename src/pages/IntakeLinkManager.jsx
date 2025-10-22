// src/pages/IntakeLinkManager.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth"; // ✅ 추가
import { auth } from "../firebase";                 // ✅ 추가 (로그인 확인용)
import "./IntakeLinkManager.css";

export default function IntakeLinkManager() {
  // 🔧 기본 앱 사용 + 리전 고정(서울)
  const functions = useMemo(() => getFunctions(undefined, "asia-northeast3"), []);

  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ villaName: "", unitNo: "", phone: "" });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const listActive = httpsCallable(functions, "listActiveIntakeLinks");
      const res = await listActive();
      setRows(res.data || []);
    } catch (e) {
      console.error("[listActiveIntakeLinks 실패]", e);
      alert("대기 링크 목록을 불러오지 못했습니다.");
    }
  };

  const onCreate = async () => {
    if (!form.villaName || !form.unitNo || !form.phone) return alert("모두 입력하세요");
    try {
      setCreating(true);
      const create = httpsCallable(functions, "createIntakeLink");
      const res = await create(form);
      await load();
      setOpen(false);
      setForm({ villaName: "", unitNo: "", phone: "" });
      if (res.data?.url) {
        await navigator.clipboard.writeText(res.data.url);
        alert("생성 완료! 링크가 클립보드에 복사되었습니다.");
      } else {
        alert("생성 완료!");
      }
    } catch (e) {
      console.error("[createIntakeLink 실패]", e);
      alert("링크 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    // ✅ 로그인 상태 확정 후에만 목록 호출
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) load();
    });
    return () => unsub();
  }, []);

  return (
    <div className="ilm px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">입주자카드 · 링크 생성/관리</h2>
        <button className="btn-primary" onClick={() => setOpen(true)}>링크 생성</button>
      </div>

      <div className="card">
        <table className="w-full table-fixed">
          <thead>
            <tr>
              <th className="w-40">생성날짜</th>
              <th className="w-40">빌라명</th>
              <th className="w-24">호수</th>
              <th className="w-40">연락처</th>
              <th>링크주소</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-gray-500">대기중인 링크가 없습니다.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : ""}</td>
                <td>{r.villaName}</td>
                <td>{r.unitNo}</td>
                <td>{r.phone}</td>
                <td className="truncate">
                  <a className="text-blue-600 underline" href={r.url} target="_blank" rel="noreferrer">{r.url}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="modal">
          <div className="panel">
            <h3 className="title">링크 생성</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className="ipt" placeholder="빌라명" value={form.villaName} onChange={e => setForm(f => ({...f, villaName: e.target.value}))}/>
              <input className="ipt" placeholder="호수" value={form.unitNo} onChange={e => setForm(f => ({...f, unitNo: e.target.value}))}/>
              <input className="ipt" placeholder="연락처" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}/>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button className="btn" onClick={() => setOpen(false)}>닫기</button>
              <button className="btn-primary" disabled={creating} onClick={onCreate}>{creating ? "생성중..." : "생성"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
