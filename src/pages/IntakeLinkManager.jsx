// src/pages/IntakeLinkManager.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth"; // ✅ 로그인 확인
import { auth, db } from "../firebase";            // ✅ db 폴백 조회용으로 추가
import {
collectionGroup, // ✅ 수정: 'collection' 대신 'collectionGroup'을 사용
query as fsQuery,
getDocs,
limit,
} from "firebase/firestore";
import "./IntakeLinkManager.css";

export default function IntakeLinkManager() {
// 🔧 기본 앱 사용 + 리전 고정(서울)
const functions = useMemo(() => getFunctions(undefined, "asia-northeast3"), []);

const [rows, setRows] = useState([]);
const [open, setOpen] = useState(false);
const [form, setForm] = useState({ villaName: "", unitNo: "", phone: "" });
const [creating, setCreating] = useState(false);
const [loading, setLoading] = useState(false);
const [loadError, setLoadError] = useState("");
const [searchTerm, setSearchTerm] = useState(""); // ✅ 메인 테이블 검색어
const [modalSearchTerm, setModalSearchTerm] = useState(""); // ✅ 모달 내 목록 검색어

/* ===== 한국어 날짜 문자열 파서 (예: 2025년 10월 22일 오후 3시 20분 51초 UTC+9) ===== */
const parseKoDateString = (txt) => {
if (!txt || typeof txt !== "string") return null;
const m = txt.trim().match(
/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(오전|오후)\s*(\d{1,2})\s*시\s*(\d{1,2})\s*분\s*(\d{1,2})\s*초/
);
if (!m) return null;
let [, yy, mo, dd, ap, hh, mm, ss] = m;
yy = +yy; mo = +mo; dd = +dd; hh = +hh; mm = +mm; ss = +ss;
if (ap === "오후" && hh < 12) hh += 12;
if (ap === "오전" && hh === 12) hh = 0;
// Attempt to create a Date object assuming the Korean string represents KST (UTC+9)
// Create UTC date first, then adjust for KST offset
try {
  // Use UTC setters to avoid local timezone interference initially
  const d = new Date(0); // Start with epoch
  d.setUTCFullYear(yy);
  d.setUTCMonth(mo - 1);
  d.setUTCDate(dd);
  d.setUTCHours(hh - 9); // Adjust hour for KST to UTC
  d.setUTCMinutes(mm);
  d.setUTCSeconds(ss);
  d.setUTCMilliseconds(0);
  if (isNaN(d.getTime())) return null; // Check validity after setting components
  return d;
} catch {
  return null; // Catch potential errors during Date construction
}
};

/* ===== createdAt 안전 변환 ===== */
const toDateSafe = (v) => {
try {
if (!v) return null;
// Firestore Timestamp (preferred)
if (typeof v.toDate === "function") {
return v.toDate();
}
// Object with seconds/nanoseconds (common from Functions/Admin SDK)
if (typeof v.seconds === "number") {
return new Date(v.seconds * 1000 + (v.nanoseconds || 0) / 1000000);
}
// Object with _seconds/_nanoseconds (alternative serialization)
if (typeof v._seconds === "number") {
return new Date(v._seconds * 1000 + (v._nanoseconds || 0) / 1000000);
}
// Milliseconds timestamp
if (typeof v === "number") {
// Basic sanity check for timestamp range (e.g., avoid year 1970 issues if 0 is invalid)
if (v === 0) return null; // Or handle as needed
// Check if it's likely seconds instead of ms (common mistake)
if (v > 0 && v < 3000000000) { // Arbitrary threshold (around year 2065 in seconds)
// Check if it's very unlikely to be ms (e.g., before year 2000)
const likelyDate = new Date(v * 1000);
if (likelyDate.getFullYear() > 1990) { // If it results in a reasonable date when treated as seconds
  console.warn("toDateSafe: Input number might be seconds, converting from seconds:", v);
  return likelyDate;
}
}
return new Date(v); // Assume milliseconds
}
// String parsing (ISO 8601, RFC 2822, etc., and Korean format)
if (typeof v === "string") {
// 1) Standard Date parser (handles ISO formats well)
const d1 = new Date(v);
if (!isNaN(d1.getTime())) return d1;
// 2) Korean string parser
const d2 = parseKoDateString(v);
if (d2) return d2;
console.warn("toDateSafe: Could not parse date string:", v);
return null;
}
console.warn("toDateSafe: Unsupported date type:", typeof v, v);
return null;
} catch (error) {
console.error("toDateSafe Error:", error, "Input:", v);
return null;
}
};


/* ===== Firestore 폴백 (로그인 사용자 전체 조회) ===== */
const fetchLinksFromFirestore = async () => {
const results = [];
try {
const q = fsQuery(collectionGroup(db, "tenant_intake_sessions"), limit(500));
const snap = await getDocs(q);
snap.forEach((d) => results.push({ id: d.id, ...d.data() }));
} catch (e) {
console.error("[Firestore 폴백 실패]", e);
return [];
}

// ✅ 전 건(대기/사용완료 포함) 표시 — 정렬만 최신순
results.sort((a, b) => {
const da = toDateSafe(a.createdAt)?.getTime?.() ?? 0;
const db = toDateSafe(b.createdAt)?.getTime?.() ?? 0;
return db - da;
});

return results;
};

/* ===== 목록 로드 ===== */
const load = async () => {
setLoading(true);
setLoadError("");
try {
const listActive = httpsCallable(functions, "listActiveIntakeLinks");
const res = await listActive();
const data = Array.isArray(res?.data) ? res.data : [];
// ✅ 함수 응답도 전 건 표시 (필터 제거)
let all = [...data];
// createdAt 기준 정렬(실패해도 표시에는 영향 없음)
try {
all = all.sort((a, b) => {
const da = toDateSafe(a.createdAt)?.getTime?.() ?? 0;
const db = toDateSafe(b.createdAt)?.getTime?.() ?? 0;
return db - da;
});
} catch {}
setRows(all); // Set all loaded rows here
if (all.length === 0) {
const fallback = await fetchLinksFromFirestore();
setRows(fallback); // Set fallback rows here
if (fallback.length === 0)
setLoadError("세션이 없습니다. (함수/폴백 모두 비어있음)");
}
} catch (e) {
console.error("[listActiveIntakeLinks 실패]", e);
const fallback = await fetchLinksFromFirestore();
setRows(fallback); // Set fallback rows on error too
if (fallback.length === 0)
setLoadError("세션을 불러오지 못했습니다. (함수/폴백 모두 실패)");
} finally {
setLoading(false);
}
};

/* ===== 생성 ===== */
const onCreate = async () => {
if (!form.villaName || !form.unitNo || !form.phone)
return alert("모두 입력하세요");
try {
setCreating(true);
const create = httpsCallable(functions, "createIntakeLink");
const res = await create({
villaName: form.villaName,
unitNo: form.unitNo,
phone: String(form.phone).replace(/-/g, ""), // Send digits only
});

await load(); // Reload the list after creation
setOpen(false); // Close modal
setForm({ villaName: "", unitNo: "", phone: "" }); // Reset form

if (res?.data?.url) {
try {
await navigator.clipboard.writeText(res.data.url);
alert("생성 완료! 링크가 클립보드에 복사되었습니다.");
} catch {
alert("생성 완료! (브라우저 정책으로 복사 실패)");
}
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

/* ===== 로그인 후 로드 ===== */
useEffect(() => {
const unsub = onAuthStateChanged(auth, (user) => {
if (user) {
load();
} else {
setRows([]);
setLoadError("로그인이 필요합니다.");
}
});
return () => unsub();
}, []); // eslint-disable-line react-hooks/exhaustive-deps

/* ===== 전화번호 입력 포맷터 ===== */
const handlePhoneChange = (val) => {
const digits = String(val || "").replace(/[^\d]/g, "");
let out = "";
if (digits.length < 4) {
out = digits;
} else if (digits.length < 8) {
out = `${digits.slice(0, 3)}-${digits.slice(3)}`;
} else {
// Limit to 11 digits total (e.g., 010-1234-5678)
out = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}
setForm((f) => ({ ...f, phone: out }));
};

// ✅ [수정] 메인 테이블 검색 필터링 로직
const filteredRows = useMemo(() => {
if (!searchTerm) return rows;
const lowerSearch = searchTerm.toLowerCase().replace(/-/g, ""); // 하이픈 제거 및 소문자화
return rows.filter((r) => {
const villa = (r.villaName || "").toLowerCase();
const unit = (r.unitNo || "").toLowerCase();
const phone = (r.phone || "").replace(/-/g, ""); // 데이터에서도 하이픈 제거

return (
villa.includes(lowerSearch) ||
unit.includes(lowerSearch) ||
phone.includes(lowerSearch) // 하이픈 없이 비교
);
});
}, [rows, searchTerm]);

// ✅ [추가] 모달 내 목록 검색 필터링 로직
const filteredModalRows = useMemo(() => {
const allLinksForModal = rows; // Use the main rows data for the modal list
if (!modalSearchTerm) return allLinksForModal;
const lowerSearch = modalSearchTerm.toLowerCase().replace(/-/g, "");
return allLinksForModal.filter((r) => {
const villa = (r.villaName || "").toLowerCase();
const unit = (r.unitNo || "").toLowerCase();
const phone = (r.phone || "").replace(/-/g, "");
return (
villa.includes(lowerSearch) ||
unit.includes(lowerSearch) ||
phone.includes(lowerSearch)
);
});
}, [rows, modalSearchTerm]); // Depends on the main 'rows' state


return (
<div className="ilm px-6 py-6">
<div className="flex items-center justify-between mb-4">
<h2 className="text-xl font-bold">입주자카드 · 링크 생성/관리</h2>
<button className="btn-primary" onClick={() => { setOpen(true); setModalSearchTerm(''); }}> {/* Reset modal search on open */}
링크 생성
</button>
</div>

{/* ===== [수정] 검색창 추가 (테이블 위) ===== */}
<div className="search-bar">
<input
type="text"
className="ipt"
placeholder="빌라명, 호수, 연락처로 검색..."
value={searchTerm}
onChange={(e) => setSearchTerm(e.target.value)}
/>
</div>

<div className="card">
<table className="w-full table-fixed">
<thead>
<tr>
<th className="w-40">생성날짜</th>
<th className="w-40">빌라명</th>
<th className="w-24">호수</th>
<th className="w-32">상태</th>{/* ✅ status 표시 */}
<th className="w-40">연락처</th>
<th>링크주소</th>
<th className="w-20">복사</th>
</tr>
</thead>
<tbody>
{loading ? (
<tr>
<td colSpan={7} className="py-6 text-center text-gray-500">
불러오는 중...
</td>
</tr>
) : filteredRows.length === 0 ? (
<tr>
<td colSpan={7} className="py-6 text-center text-gray-500">
{loadError || (searchTerm ? "검색 결과가 없습니다." : "세션이 없습니다.")}
</td>
</tr>
) : (
filteredRows.map((r) => {
const when = toDateSafe(r.createdAt);
const url = r.url || "";
const status = String(r.status || "").toLowerCase();
const statusLabel =
status === "used" ? "사용완료" :
status === "open" ? "대기" : (r.status || "-");
return (
<tr key={r.id}>
{/* ✅ 날짜 표시: toLocaleString 사용 */}
<td>{when ? when.toLocaleString("ko-KR", { dateStyle: 'medium', timeStyle: 'medium' }) : "날짜 정보 없음"}</td>
<td>{r.villaName}</td>
<td>{r.unitNo}</td>
<td>{statusLabel}</td>{/* ✅ 상태 표시 */}
<td>{r.phone}</td> {/* ✅ 하이픈 포함된 전화번호 표시 */}
<td className="truncate">
{url ? (
<a
className="text-blue-600 underline"
href={url}
target="_blank"
rel="noreferrer"
title={url} // Add title for full URL on hover
>
{url}
</a>
) : (
<span className="text-gray-400">URL 없음</span>
)}
</td>
<td className="text-center">
<button
className="btn"
onClick={async () => {
try {
if (url) {
await navigator.clipboard.writeText(url);
alert("복사되었습니다.");
} else {
alert("복사할 URL이 없습니다."); // Handle case where URL is missing
}
} catch (err) {
console.error("Clipboard write failed:", err);
alert("클립보드 복사에 실패했습니다.");
}
}}
disabled={!url} // Disable button if no URL
>
복사
</button>
</td>
</tr>
);
})
)}
</tbody>
</table>
</div>

{/* ===== 생성 모달 ===== */}
{open && (
<div className="modal">
{/* ✅ modal-panel-large 클래스 추가 */}
<div className="panel modal-panel-large">
<h3 className="title">링크 생성 / 목록</h3>
{/* ✅ [수정] 모달 내 입력/버튼 영역 레이아웃 */}
<div className="creation-area">
<div className="creation-inputs">
<input
className="ipt input-narrow" /* ✅ Smaller input class */
placeholder="빌라명"
value={form.villaName}
onChange={(e) =>
setForm((f) => ({ ...f, villaName: e.target.value }))
}
/>
<input
className="ipt input-narrow" /* ✅ Smaller input class */
placeholder="호수"
value={form.unitNo}
onChange={(e) =>
setForm((f) => ({ ...f, unitNo: e.target.value }))
}
/>
<input
className="ipt input-narrow" /* ✅ Smaller input class */
placeholder="연락처" /* Simplified placeholder */
value={form.phone}
maxLength={13}
onChange={(e) => handlePhoneChange(e.target.value)}
/>
</div>
{/* ✅ 생성 버튼 위치 조정 */
<button
className="btn-primary creation-button"
disabled={creating}
onClick={onCreate}
>
{creating ? "생성중..." : "생성+복사"} {/* 버튼 텍스트 변경 */}
</button>
</div>

{/* ✅ [추가] 모달 내 검색창 (생성 버튼 아래) */}
<div className="modal-search-bar">
<input
type="text"
className="ipt"
placeholder="생성된 목록 검색 (빌라명, 호수, 연락처)..."
value={modalSearchTerm}
onChange={(e) => setModalSearchTerm(e.target.value)}
/>
</div>

{/* ✅ [추가] 모달 내 링크 목록 */}
<div className="modal-link-list">
{/* Optional headers */}
<div className="modal-list-header">
<span className="list-col date">생성날짜</span>
<span className="list-col villa">빌라명</span>
<span className="list-col unit">호수</span>
<span className="list-col phone">연락처</span>
<span className="list-col status">상태</span>
<span className="list-col url">링크주소</span>
<span className="list-col action">복사</span>
</div>
{filteredModalRows.length === 0 ? (
<p className="empty-list-message">{modalSearchTerm ? "검색 결과가 없습니다." : "생성된 링크가 없습니다."}</p>
) : (
filteredModalRows.map(row => {
const when = toDateSafe(row.createdAt);
const url = row.url || "";
const status = String(row.status || "").toLowerCase();
const statusLabel = status === "used" ? "사용완료" : status === "open" ? "대기" : (row.status || "-");
return (
<div key={row.id} className="modal-list-row">
{/* ✅ 날짜만 표시 */}
<span className="list-col date">{when ? when.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</span>
<span className="list-col villa">{row.villaName}</span>
<span className="list-col unit">{row.unitNo}</span>
<span className="list-col phone">{row.phone}</span> {/* 하이픈 포함 */}
<span className="list-col status">{statusLabel}</span>
<span className="list-col url truncate" title={url}>{url || '-'}</span>
<span className="list-col action"> {/* Wrapper span for button alignment */}
<button
className="btn btn-copy-modal"
onClick={async () => {
try { if (url) { await navigator.clipboard.writeText(url); alert("복사됨"); } } catch {}
}}
disabled={!url}
>
복사
</button>
</span>
</div>
);
})
)}
</div>


<div className="flex gap-3 justify-end mt-5 modal-close-area">
<button className="btn" onClick={() => setOpen(false)}>
닫기
</button>
</div>
</div>
</div>
)}
</div>
);
}