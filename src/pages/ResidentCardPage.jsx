// src/pages/ResidentCardPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, collectionGroup, onSnapshot, query, orderBy, where, getDocs } from "firebase/firestore";
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
const [searchTerm, setSearchTerm] = useState(""); // ✅ [수정] 검색어 상태 추가

// ✅ Functions (서울 리전)
const functions = useMemo(() => getFunctions(undefined, "asia-northeast3"), []);

// ===== 링크 생성/목록 모달 =====
const [linkModalOpen, setLinkModalOpen] = useState(false);
const [creating, setCreating] = useState(false);
const [form, setForm] = useState({ villaName: "", unitNo: "", phone: "" });
const [activeLinks, setActiveLinks] = useState([]);
const [isLoadingLinks, setIsLoadingLinks] = useState(false);
const [linksError, setLinksError] = useState(""); // [신규] 오류 메시지(경고창 대신 UI 하단 노출)
const [modalSearchTerm, setModalSearchTerm] = useState(""); // ✅ [추가] 모달 내 목록 검색어

const villaRef = useRef(null);
const unitRef = useRef(null);
const phoneRef = useRef(null);

/* ---------- 유틸: createdAt 안전 변환 ---------- */
// ✅ Updated toDateSafe from IntakeLinkManager for consistency
const toDateSafe = (v) => {
try {
if (!v) return null;
if (typeof v.toDate === "function") {
return v.toDate();
}
if (typeof v.seconds === "number") {
return new Date(v.seconds * 1000 + (v.nanoseconds || 0) / 1000000);
}
if (typeof v._seconds === "number") {
return new Date(v._seconds * 1000 + (v._nanoseconds || 0) / 1000000);
}
if (typeof v === "number") {
return new Date(v);
}
if (typeof v === "string") {
const d1 = new Date(v);
if (!isNaN(d1.getTime())) return d1;
// Add Korean parser if needed here, similar to IntakeLinkManager
// const d2 = parseKoDateString(v); // Assuming parseKoDateString is defined/imported
// if (d2) return d2;
console.warn("toDateSafe (ResidentCard): Could not parse date string:", v);
return null;
}
console.warn("toDateSafe (ResidentCard): Unsupported date type:", typeof v, v);
return null;
} catch (error) {
console.error("toDateSafe Error (ResidentCard):", error, "Input:", v);
return null;
}
};


/* ---------- 링크 응답 정규화 ---------- */
const normalizeLinksArray = (data) => {
let arr = [];
if (Array.isArray(data)) arr = data;
else if (Array.isArray(data?.items)) arr = data.items;
else if (data?.items && typeof data.items === "object") arr = Object.values(data.items);
else if (Array.isArray(data?.data)) arr = data.data;
else if (data && typeof data === "object") {
const guess = Object.values(data).find((v) => Array.isArray(v));
if (Array.isArray(guess)) arr = guess;
}
// 필드 보정 + ✅ 하이픈 포함된 전화번호 유지 시도
return (arr || []).map((r) => {
// Try to find an already formatted phone number if available
let formattedPhone = r.formattedPhone || r.phone || r.tel || "";
// If only digits are present, format it (basic formatting)
if (formattedPhone && /^\d+$/.test(formattedPhone.replace(/-/g, ""))) {
const digits = formattedPhone.replace(/-/g, "");
if (digits.length === 11) {
formattedPhone = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
} else if (digits.length === 10) { // e.g., 02-123-4567 or 010-123-4567
if (digits.startsWith('02')) {
formattedPhone = `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5, 9)}`;
} else {
formattedPhone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}
} // Add more formatting rules if needed
}

return {
id: r.id || r.docId || r.key || r.url || `${r.villaName || ""}-${r.unitNo || ""}-${r.phone || ""}`,
villaName: r.villaName || r.villa_name || r.villa || "",
unitNo: r.unitNo || r.unit_no || r.unit || r.hosu || "",
phone: formattedPhone, // Use the potentially formatted phone
url: r.url || r.link || "",
createdAt: r.createdAt || r.created_at || r.createdAtMs || r.createdAtISO || null,
submitted: r.submitted ?? r.used ?? false,
};
});
};


/* ---------- Firestore 폴백 조회 ---------- */
const fetchLinksFromFirestore = async () => {
const tryCollections = ["intake_links", "resident_intake_links", "tenant_intake_sessions"]; // Include tenant_intake_sessions
let hits = [];

// Try Collection Group first for tenant_intake_sessions
try {
const qg = query(collectionGroup(db, "tenant_intake_sessions"), where("status", "==", "open"), orderBy("createdAt", "desc"));
const sg = await getDocs(qg);
if (!sg.empty) {
hits = sg.docs.map((d) => ({
id: d.id,
...d.data(),
submitted: false // Assuming 'open' means not submitted
}));
// Format phone numbers if needed, similar to normalizeLinksArray
hits.forEach(hit => {
let formattedPhone = hit.phone || "";
if (formattedPhone && /^\d+$/.test(formattedPhone.replace(/-/g, ""))) {
const digits = formattedPhone.replace(/-/g, "");
if (digits.length === 11) formattedPhone = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
else if (digits.length === 10) formattedPhone = digits.startsWith('02') ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}` : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
hit.phone = formattedPhone;
}
});
return hits; // Return immediately if found via collection group
}
} catch(cgError) {
console.warn("[CollectionGroup 폴백 실패]", cgError);
// Continue to try individual collections
}


for (const col of tryCollections.slice(0, 2)) { // Only try the first two if collection group failed
// 우선 submitted==false
try {
const q1 = query(
collection(db, col),
where("submitted", "==", false),
orderBy("createdAt", "desc")
);
const s1 = await getDocs(q1);
if (!s1.empty) {
hits = s1.docs.map((d) => {
const o = d.data() || {};
// Add phone formatting here too
let formattedPhone = o.phone || "";
// ... formatting logic ...
return {
id: d.id,
villaName: o.villaName || o.villa_name || "",
unitNo: o.unitNo || o.unit_no || "",
phone: formattedPhone,
url: o.url || "",
createdAt: o.createdAt || null,
submitted: o.submitted ?? false,
};
});
break; // Exit loop once data found
}
} catch (_) {}

// 다음: used==false
try {
const q2 = query(
collection(db, col),
where("used", "==", false),
orderBy("createdAt", "desc")
);
const s2 = await getDocs(q2);
if (!s2.empty) {
hits = s2.docs.map((d) => {
const o = d.data() || {};
// Add phone formatting
let formattedPhone = o.phone || "";
// ... formatting logic ...
return {
id: d.id,
villaName: o.villaName || o.villa_name || "",
unitNo: o.unitNo || o.unit_no || "",
phone: formattedPhone,
url: o.url || "",
createdAt: o.createdAt || null,
submitted: o.submitted ?? o.used ?? false,
};
});
break; // Exit loop
}
} catch (_) {}
}
return hits;
};


const loadActiveLinks = async () => {
setIsLoadingLinks(true);
setLinksError("");
try {
const listActive = httpsCallable(functions, "listActiveIntakeLinks");
const res = await listActive();

const normalized = normalizeLinksArray(res?.data);
// Filter for pending links (not submitted/used)
// Adjust the condition based on your actual data structure (e.g., status === 'open')
const pending = normalized.filter((r) => r.submitted === false || r.status === 'open');
// Sort by creation date descending
pending.sort((a, b) => {
const da = toDateSafe(a.createdAt)?.getTime() ?? 0;
const db = toDateSafe(b.createdAt)?.getTime() ?? 0;
return db - da;
});
setActiveLinks(pending);
if (pending.length === 0 && Array.isArray(res?.data) && res.data.length > 0) {
    // If function returned data but all were filtered out
    setLinksError("대기중(미제출) 링크가 없습니다.");
} else if (pending.length === 0) {
     // If function returned empty or failed, try fallback
    throw new Error("Function returned no active links"); // Force fallback
}

} catch (e) {
console.error("[listActiveIntakeLinks 실패 또는 빈 결과]", e);

// 🔁 Firestore 폴백
try {
const fallback = await fetchLinksFromFirestore();
// Sort fallback results as well
fallback.sort((a, b) => {
const da = toDateSafe(a.createdAt)?.getTime() ?? 0;
const db = toDateSafe(b.createdAt)?.getTime() ?? 0;
return db - da;
});
setActiveLinks(fallback);
if (fallback.length === 0) {
setLinksError("대기 링크가 없습니다.");
}
} catch (e2) {
console.error("[Firestore 폴백 실패]", e2);
setActiveLinks([]);
setLinksError("대기 링크 목록을 불러오지 못했습니다. (함수/폴백 모두 실패)");
}
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
const res = await create({
villaName: form.villaName, // Pass correct fields
unitNo: form.unitNo,
phone: form.phone.replace(/-/g, ""), // Pass digits only
});

if (res?.data?.url) {
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
await loadActiveLinks(); // Reload the list in the modal
villaRef.current?.focus?.();
} catch (e) {
console.error("[createIntakeLink 실패]", e);
alert(`링크 생성에 실패했습니다: ${e.message}`); // Show more error details
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
} else { // If it's the last input (phoneRef)
if (form.villaName && form.unitNo && form.phone && !creating) {
onCreateLink(); // Trigger creation on Enter in last field
}
}
}
};

// [신규] 연락처 자동 하이픈 포맷터
const handlePhoneChange = (e) => {
const value = e.target.value.replace(/[^\d]/g, "");
let formattedValue = "";
if (value.length < 4) {
formattedValue = value;
} else if (value.length < 8) {
formattedValue = `${value.slice(0, 3)}-${value.slice(3)}`;
} else {
formattedValue = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
}
setForm((f) => ({ ...f, phone: formattedValue }));
};

useEffect(() => {
// 제출본 실시간 구독
const qRows = query(collection(db, "resident_cards"), orderBy("createdAt", "desc"));
const unsubRows = onSnapshot(qRows, (snap) => {
const next = [];
snap.forEach((d) => next.push({ id: d.id, ...d.data() }));
setRows(next);
}, (error) => { // Add error handling for snapshot listener
console.error("Error fetching resident cards:", error);
// Optionally set an error state to display to the user
});


// 로그인 상태 확정 (필수는 아니지만, 함수 보안에 따라 필요할 수 있음)
const unsubAuth = onAuthStateChanged(auth, (_user) => {
// 필요 시 처리
});

return () => {
unsubRows();
unsubAuth();
};
}, []);

// [수정] 하자체크 그룹화 로직
const openChecklist = (row) => {
const items = Object.entries(row.checklist || {})
.filter(([, v]) => !!v)
.map(([k]) => k.split("_")); // Assuming format "Category_Item"
const grouped = items.reduce((acc, parts) => {
if (parts.length >= 2) {
const category = parts[0];
const item = parts.slice(1).join("_"); // Handle items with underscores
if (!acc[category]) acc[category] = [];
acc[category].push(item);
} else {
// Handle items without a clear category if necessary
const category = "기타"; // Default category
if (!acc[category]) acc[category] = [];
acc[category].push(parts[0]);
}
return acc;
}, {});
setModal({ open: true, type: "list", title: "하자체크", content: grouped });
};


const openNotes = (row) =>
setModal({ open: true, type: "text", title: "기타내용", content: row.notes || "" });

const openPhotos = (row) =>
setModal({ open: true, type: "photos", title: "사진", content: row.photos || [] });

// [수정] 삭제 딜레이 개선 (Optimistic UI)
const onDelete = async (row) => {
if (!window.confirm("정말 삭제할까요? (복구 불가)")) return;
const rowToDelete = row;
// Optimistically remove from UI
setRows((prevRows) => prevRows.filter((r) => r.id !== rowToDelete.id));
try {
const del = httpsCallable(functions, "deleteResidentCard");
await del({ id: rowToDelete.id });
// No need to reload, already removed
} catch (e) {
console.error("[deleteResidentCard 실패]", e);
alert("삭제에 실패했습니다. 목록을 복원합니다.");
// Rollback UI change on failure
setRows((prevRows) => {
// Find the original index to insert back (or just add to top/bottom)
const originalIndex = rows.findIndex(r => r.id === rowToDelete.id); // Use original `rows` state if needed
if (originalIndex !== -1) {
const nextRows = [...prevRows];
nextRows.splice(originalIndex, 0, rowToDelete);
return nextRows;
}
return [rowToDelete, ...prevRows]; // Fallback: add to top
});
}
};


const openLinkModal = async () => {
setLinkModalOpen(true);
setModalSearchTerm(""); // ✅ [수정] 모달 검색어 초기화
await loadActiveLinks(); // Load links when modal opens
setTimeout(() => villaRef.current?.focus?.(), 50); // Slight delay for focus
};

// [신규] 상세 모달 닫기 (라이트박스도 함께 닫기)
const closeModal = () => {
setModal((m) => ({ ...m, open: false, type: "", content: null, title: "" })); // Reset modal state
setLightboxSrc(null);
};

// ✅ [수정] 제출 내역 검색 필터링 로직
const filteredRows = useMemo(() => {
if (!searchTerm) return rows;
const lowerSearch = searchTerm.toLowerCase();
const cleanSearch = lowerSearch.replace(/-/g, ""); // 하이픈 없는 검색어

return rows.filter((r) => {
const villa = (r.villa_name || r.villaName || "").toLowerCase();
const unit = (r.unitNo || r.unit_no || "").toLowerCase(); // ✅ 호수 검색 추가
const name = (r.name || "").toLowerCase();
const phone = (r.phone || "").replace(/-/g, ""); // 하이픈 없는 데이터

return (
villa.includes(lowerSearch) ||
unit.includes(lowerSearch) || // ✅ 호수 검색 조건
name.includes(lowerSearch) ||
phone.includes(cleanSearch)
);
});
}, [rows, searchTerm]);

// ✅ [추가] 모달 내 링크 목록 검색 필터링 로직
const filteredActiveLinks = useMemo(() => {
if (!modalSearchTerm) return activeLinks;
const lowerSearch = modalSearchTerm.toLowerCase().replace(/-/g, "");
return activeLinks.filter((r) => {
const villa = (r.villaName || "").toLowerCase();
const unit = (r.unitNo || "").toLowerCase();
const phone = (r.phone || "").replace(/-/g, "");
return (
villa.includes(lowerSearch) ||
unit.includes(lowerSearch) ||
phone.includes(lowerSearch)
);
});
}, [activeLinks, modalSearchTerm]);

return (
<div className="rcp">
{/* ===== [수정] 상단 패널 제거, 헤더+버튼 통합 ===== */}
<div className="page-header">
<h3 className="section-title">
<IconPage /> <span>입주자카드 제출 내역</span>
</h3>
<button className="btn-primary" onClick={openLinkModal} title="링크 생성/목록">
<IconPlus /> <span>링크 생성 / 목록</span>
</button>
</div>

{/* ===== 하단: 제출 내역 테이블 ===== */}
<div className="card">
{/* ===== [수정] 검색창 추가 ===== */}
<div className="rcp-search-wrapper">
<input
type="text"
className="ipt rcp-search-input" // Class for styling size
placeholder="검색" // Updated placeholder
value={searchTerm}
onChange={(e) => setSearchTerm(e.target.value)}
/>
</div>

<div className="table-wrapper">
<table className="rcp-table">
<thead>
<tr>
<th>입주날짜</th>
<th>빌라명</th>
<th>호수</th> {/* ✅ 호수 헤더 추가 */}
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
{/* ✅ [수정] filteredRows.length로 변경 */}
{filteredRows.length === 0 && (
<tr>
{/* ✅ Colspan updated to 11 */}
<td colSpan={11} className="py-10 text-center text-gray-500">
{searchTerm ? "검색 결과가 없습니다." : "제출 내역이 없습니다."}
</td>
</tr>
)}
{/* ✅ [수정] rows.map -> filteredRows.map */}
{filteredRows.map((r) => {
const hasChecklist = Object.values(r.checklist || {}).some(Boolean);
const hasNotes = !!(r.notes && String(r.notes).trim());
const hasPhotos = Array.isArray(r.photos) && r.photos.length > 0;
const created = toDateSafe(r.createdAt);
return (
<tr key={r.id}>
<td>{r.move_in_date || ""}</td>
<td>{r.villa_name || r.villaName || ""}</td>
<td>{r.unitNo || r.unit_no || ""}</td> {/* ✅ 호수 데이터 표시 */}
<td className="truncate">{r.address || ""}</td>
<td>{r.name || ""}</td>
<td>{r.phone || ""}</td>
<td className="text-center">
{hasChecklist && (
<button
className="icon icon-checklist"
onClick={() => openChecklist(r)}
title="하자체크 보기"
>
<IconListCheck />
</button>
)}
</td>
<td className="text-center">
{hasNotes && (
<button
className="icon icon-notes"
onClick={() => openNotes(r)}
title="기타내용 보기"
>
<IconNote />
</button>
)}
</td>
<td className="text-center">
{hasPhotos && (
<button
className="icon icon-photo"
onClick={() => openPhotos(r)}
title="사진 보기"
>
<IconImage />
</button>
)}
</td>
{/* ✅ 날짜 표시 형식 수정 */}
<td>{created ? created.toLocaleString("ko-KR", { dateStyle: 'medium', timeStyle: 'short'}) : ""}</td>
<td className="text-center">
<button className="icon danger" onClick={() => onDelete(r)} title="삭제">
<IconTrashCan />
</button>
</td>
</tr>
);
})}
</tbody>
</table>
</div>
</div>

{/* ===== [수정] 상세 모달 (디자인 개편) ===== */}
{/* ✅ onClick 핸들러 수정: 배경 클릭 시 닫기 */}
{modal.open && (
<div className="modal-backdrop" onClick={closeModal}> {/* Changed class */}
{/* ✅ onClick 중단 추가 */}
<div className="modal-panel" onClick={(e) => e.stopPropagation()}> {/* Changed class */}
<div className="panel-header">
<h3 className="modal-title">{modal.title}</h3>
<button className="icon close" onClick={closeModal}>
<IconStylishX />
</button>
</div>

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
<span key={i} className="checklist-item-tag">
{item}
</span>
))}
</div>
</div>
))}
</div>
)}
</div>
)}

{modal.type === "text" && (
<div className="modal-content notes-content whitespace-pre-wrap"> {/* Added class */}
{modal.content || <span className="text-gray-500">없음</span>}
</div>
)}

{modal.type === "photos" && (
<div className="modal-content photo-grid"> {/* Changed class */}
{(modal.content || []).length === 0 ? (
<p className="text-gray-500">사진 없음</p>
) : (
(modal.content || []).map((src, i) => (
<button key={i} className="photo-thumb" onClick={() => setLightboxSrc(src)}>
<img src={src} alt={`photo-${i}`} loading="lazy"/> {/* Added lazy loading */}
</button>
))
)}
</div>
)}
</div>
</div>
)}


{/* ===== [신규] 사진 라이트박스 ===== */}
{lightboxSrc && (
<div className="lightbox" onClick={() => setLightboxSrc(null)}>
<img src={lightboxSrc} alt="Enlarged" onClick={(e) => e.stopPropagation()} />
<button className="icon close lightbox-close" onClick={() => setLightboxSrc(null)}> {/* Added class */}
<IconStylishX />
</button>
</div>
)}

{/* ===== 링크 생성/목록 모달 ===== */}
{linkModalOpen && (
<div className="rcp-modal" onClick={() => setLinkModalOpen(false)}>
{/* ✅ Modal panel class name */}
<div className="panel link-modal-panel" onClick={(e) => e.stopPropagation()}>
<div className="flex items-center justify-between mb-5">
<h3 className="modal-title">
<IconLink />
<span>링크 생성 / 목록</span>
</h3>
<button className="icon close" onClick={() => setLinkModalOpen(false)}>
<IconStylishX />
</button>
</div>

{/* ✅ [수정] 링크 생성 레이아웃 변경 */}
<div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
{/* NOTE: Inline styles are used here for simplicity. Consider moving to CSS for better maintainability. */}
<div className="creation-area" style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
    <div className="creation-inputs" style={{ flexGrow: 1, display: 'flex', gap: '0.75rem' }}>
        <input
            ref={villaRef}
            className="ipt ipt-sm"
            placeholder="빌라명"
            value={form.villaName}
            onChange={(e) => setForm((f) => ({ ...f, villaName: e.target.value }))}
            onKeyDown={(e) => handleKeyDown(e, unitRef)}
            style={{ flex: '1 1 160px', minWidth: '120px' }} // Original style restored
        />
        <input
            ref={unitRef}
            className="ipt ipt-sm"
            placeholder="호수"
            value={form.unitNo}
            onChange={(e) => setForm((f) => ({ ...f, unitNo: e.target.value }))}
            onKeyDown={(e) => handleKeyDown(e, phoneRef)}
            style={{ flex: '1 1 160px', minWidth: '120px' }} // Original style restored
        />
        <input
            ref={phoneRef}
            className="ipt ipt-sm"
            placeholder="연락처"
            value={form.phone}
            onChange={handlePhoneChange}
            onKeyDown={(e) => handleKeyDown(e, null)} // Trigger create on Enter
            maxLength="13"
            style={{ flex: '1 1 160px', minWidth: '120px' }} // Original style restored
        />
    </div>
    <button
        className="btn-primary btn-sm creation-button"
        disabled={creating}
        onClick={onCreateLink}
        style={{ flexShrink: 0, whiteSpace: 'nowrap' }} // Original style restored
    >
        {creating ? "생성중..." : "생성+복사"}
    </button>
</div>
</div>

{/* ✅ [수정] 모달 내 검색창 (우측 정렬 wrapper 추가) */}
<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
    <div className="modal-search-bar" style={{ marginBottom: 0 }}> {/* 기존 margin 제거 */}
        <input
            type="text"
            className="ipt" // 기존 ipt 스타일 사용
            placeholder="생성된 목록 검색"
            value={modalSearchTerm}
            onChange={(e) => setModalSearchTerm(e.target.value)}
            style={{ maxWidth: '200px', fontSize: '0.85rem', padding: '.4rem .7rem' }} // width: '100%' 제거
        />
    </div>
</div>

{/* Link List Section */}
<div className="waiting-list">
<div className="list-head"> {/* Consider making this sticky if list is long */}
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
// ✅ [수정] filteredActiveLinks.length 로 변경
) : filteredActiveLinks.length === 0 ? (
<div className="empty">
    {/* ✅ [수정] 검색어 여부에 따라 다른 메시지 표시 */}
    {modalSearchTerm ? "검색 결과가 없습니다." : (linksError ? linksError : "대기중(미제출) 링크가 없습니다.")}
</div>
) : (
// ✅ [수정] activeLinks.map -> filteredActiveLinks.map
filteredActiveLinks.map((r) => {
const when = toDateSafe(r.createdAt);
const url = r.url || "";
const phone = r.phone || ""; // Should have hyphens from normalize/fetch
return (
<div className="row" key={r.id}>
<div className="c c-when">
    {/* ✅ [수정] 날짜만 표시 (시간 제외) */}
    {when ? when.toLocaleDateString("ko-KR", { year: 'numeric', month: 'short', day: 'numeric'}) : ""}
</div>
<div className="c c-villa">{r.villaName || ""}</div>
<div className="c c-unit">{r.unitNo || ""}</div>
<div className="c c-phone">{phone}</div>{/* Display formatted phone */}
<div className="c truncate" title={url}>
{url ? (
<a className="link" href={url} target="_blank" rel="noreferrer">
{url}
</a>
) : (
<span className="text-gray-400">URL 없음</span>
)}
</div>
<td className="c c-act">
<button
className="icon icon-sm" // Smaller icon button
onClick={async () => {
try { if (url) { await navigator.clipboard.writeText(url); alert("복사됨"); } } catch {}
}}
title="링크 복사"
disabled={!url}
>
<IconCopy />
</button>
</td>
</div>
);
})
)}
</div>
<div className="list-footer hint">
<div className="flex-1">
※ 입주자가 제출을 완료하면 해당 링크는 목록에서 자동으로 사라집니다.
</div>
<button className="btn btn-sm" onClick={loadActiveLinks} title="새로고침"> {/* Smaller button */}
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