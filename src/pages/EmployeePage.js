// src/pages/EmployeePage.js
import React, { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import DataTable from "../components/DataTable";
import PageTitle from "../components/PageTitle";
import GenericEditModal from "../components/GenericEditModal";

/* ✅ [추가] 모달 컴포넌트 임포트 */
import CertificateIssuePage from "./CertificateIssuePage";
/* ✅ [추가] 라우팅용 훅 */
import { useNavigate } from "react-router-dom";

// ✅ 유틸: 날짜를 YYYY-MM-DD로 정규화 (저장 시 적용)
function normalizeToYYYYMMDD(input) {
  if (!input && input !== 0) return "";
  let s = String(input).trim();

  // 숫자만: 20250814 또는 250814
  if (/^\d+$/.test(s)) {
    if (s.length === 8) {
      const y = s.slice(0, 4);
      const m = s.slice(4, 6);
      const d = s.slice(6, 8);
      return `${y}-${m}-${d}`;
    }
    if (s.length === 6) {
      const y = `20${s.slice(0, 2)}`;
      const m = s.slice(2, 4).padStart(2, "0");
      const d = s.slice(4, 6).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  // 구분자 통일
  s = s.replace(/[./\s]/g, "-").replace(/-+/g, "-");
  const parts = s.split("-");
  if (parts.length === 3) {
    let [yy, mm, dd] = parts;
    if (yy.length === 2) yy = `20${yy}`;
    mm = (mm + "").padStart(2, "0");
    dd = (dd + "").padStart(2, "0");
    if (/^\d{4}$/.test(yy) && /^\d{2}$/.test(mm) && /^\d{2}$/.test(dd)) {
      return `${yy}-${mm}-${dd}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

// ✅ 주민등록번호 입력 포맷(모달 입력 단계)
function formatRRNInput(v) {
  const digits = String(v || "").replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

// ✅ 한국 전화번호 입력 포맷(모달 입력 단계)
function formatKoreanPhoneInput(v) {
  const d = String(v || "").replace(/\D/g, "");
  const digits = d.slice(0, 11); // 일반적으로 11자리

  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `02-${digits.slice(2)}`;
    if (digits.length <= 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `02-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  } else if (digits.length >= 3 && digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  } else if (digits.length >= 8 && digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return digits;
}

// ✅ 주민등록번호 → 생년월일(Date) 파싱
function parseBirthFromRRN(rrn) {
  const digits = String(rrn || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  const yy = digits.slice(0, 2);
  const mm = digits.slice(2, 4); // ★ 오타 수정: digits slice → digits.slice
  const dd = digits.slice(4, 6);
  const centuryCode = digits[6];

  let century;
  if (["1", "2", "5", "6"].includes(centuryCode)) century = 1900;
  else if (["3", "4", "7", "8"].includes(centuryCode)) century = 2000;
  else return null;

  const year = century + Number(yy);
  const month = Number(mm) - 1;
  const day = Number(dd);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

// ✅ 국제식 나이 계산
function calcAgeFromRRN(rrn) {
  const birth = parseBirthFromRRN(rrn);
  if (!birth) return "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : "";
}

export default function EmployeePage() {
  const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [origId, setOrigId] = useState(null);

  /* ✅ [추가] 증명서 발급 모달 on/off */
  const [openCert, setOpenCert] = useState(false);

  /* ✅ [추가] 라우팅 훅 */
  const navigate = useNavigate();

  // 실시간 구독
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "employees"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEmployees(list);
    });
    return () => unsub();
  }, []);

  // 드롭다운 옵션
  const deptOptions = ["사무팀", "A/S팀"];
  const positionOptions = ["사원", "실장", "팀장", "부장"];
  const employmentTypeOptions = ["일용직", "계약직", "정규직"];
  const genderOptions = ["남자", "여자"];

  // 필드 정의
  const fields = useMemo(
    () => [
      "name",
      "dept",
      "position",
      "empNo",
      "resRegNo",
      "age",
      "gender",
      "joinDate",
      "address",
      "phone",
      "email",
      "bank",
      "accountNo",
    ],
    []
  );

  const labels = {
    name: "성명",
    dept: "부서명",
    position: "직위",
    empNo: "사원번호*",
    resRegNo: "주민등록번호",
    age: "나이",
    gender: "성별",
    joinDate: "입사일",
    phone: "전화번호",
    address: "주소",
    email: "E-Mail",
    bank: "은행명",
    accountNo: "계좌번호",
  };

  const types = {
    email: "email",
    phone: "text",
    accountNo: "text",
    resRegNo: "text",
    joinDate: "text",
    age: "number",
    dept: "select",
    position: "select",
    gender: "select",
  };

  const selectOptions = {
    dept: deptOptions,
    position: positionOptions,
    employmentType: employmentTypeOptions,
    gender: genderOptions,
  };

  const safeDocId = (raw) =>
    String(raw || "").trim().replace(/\//g, "∕").slice(0, 1500);

  const displayEmployees = useMemo(() => {
    return employees.map((e) => {
      const computed = calcAgeFromRRN(e.resRegNo);
      return { ...e, age: e.age !== "" && e.age != null ? e.age : computed };
    });
  }, [employees]);

  const byId = useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees]
  );

  // 등록
  const handleAdd = () => {
    setEditData({
      name: "",
      dept: "",
      position: "",
      empNo: "",
      resRegNo: "",
      age: "",
      gender: "",
      joinDate: "",
      phone: "",
      address: "",
      email: "",
      bank: "",
      accountNo: "",
    });
    setOrigId(null);
    setShowModal(true);
  };

  // 수정
  const handleEdit = (row) => {
    const src = byId[row.id] || row;
    setEditData({
      name: src.name || "",
      dept: src.dept || "",
      position: src.position || "",
      empNo: src.empNo || src.id || "",
      resRegNo: src.resRegNo || "",
      age: src.age !== "" && src.age != null ? src.age : calcAgeFromRRN(src.resRegNo),
      gender: src.gender || "",
      employmentType: src.employmentType || "",
      joinDate: src.joinDate || "",
      phone: src.phone || "",
      address: src.address || "",
      email: src.email || "",
      bank: src.bank || "",
      accountNo: src.accountNo || "",
    });
    setOrigId(src.id);
    setShowModal(true);
  };

  // 저장
  const handleSaveFromModal = async (form) => {
    const newId = safeDocId(form.empNo); // ★ safe → safeDocId
    if (!newId) {
      alert("사원번호는 필수입니다.");
      return;
    }
    const ageComputed = calcAgeFromRRN(form.resRegNo); // ★ 함수명 수정
    const dataToSave = {
      name: (form.name || "").trim(),
      dept: (form.dept || "").trim(),
      position: (form.position || "").trim(),
      empNo: (form.empNo || "").trim(),
      resRegNo: (form.resRegNo || "").trim(),
      age: ageComputed,
      gender: (form.gender || "").trim(),
      employmentType: (form.employmentType || "").trim(),
      joinDate: normalizeToYYYYMMDD(form.joinDate || ""),
      phone: (form.phone || "").trim(),
      address: (form.address || "").trim(),
      email: (form.email || "").trim(),
      bank: (form.bank || "").trim(),
      accountNo: (form.accountNo || "").trim(),
    };
    if (origId && origId !== newId) {
      await setDoc(doc(db, "employees", newId), dataToSave, { merge: true });
      await deleteDoc(doc(db, "employees", origId));
    } else {
      const targetId = origId || newId;
      await setDoc(doc(db, "employees", targetId), dataToSave, { merge: true });
    }
    setShowModal(false);
    setEditData(null);
    setOrigId(null);
  };

  // 삭제
  const handleDelete = async (row) => {
    if (!row?.id) return;
    if (!window.confirm(`${row.name || row.id} 항목을 삭제하시겠습니까?`)) return;
    await deleteDoc(doc(db, "employees", row.id));
  };

  // 입력단계 자동포맷
  const formatters = {
    resRegNo: formatRRNInput,
    phone: formatKoreanPhoneInput,
  };

  /* ✅ 급여대장 모달 열기 (새 창 없이, 페이지 위에 모달만 표시) */
  const [payrollOpen, setPayrollOpen] = useState(false);
  const openPayrollPopup = () => {
    setPayrollOpen(true);
  };

  return (
    <div className="page-wrapper">
      <PageTitle>사원정보</PageTitle>

      {/* ✅ 상단 왼쪽: 버튼 영역 (기존 유지 + 급여대장 버튼 추가) */}
      <div
        style={{
          height: 24,
          marginBottom: -22,
          position: "relative",
          display: "flex",
          gap: 8,
        }}
      >
        <button
          onClick={() => setOpenCert(true)}
          title="증명서 발급을 모달로 엽니다."
          style={{
            height: 40,
            padding: "0 16px",                 // 중앙 정렬을 위해 수직 패딩 균등
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background:
              "linear-gradient(180deg,#6C8CF5 0%, #4F73EA 100%), radial-gradient(800px 400px at 100% 0%, rgba(255,255,255,.18), transparent 60%)",
            color: "#fff",
            fontWeight: 700,
            letterSpacing: ".02em",
            cursor: "pointer",
            boxShadow: "0 8px 20px rgba(79,115,234,.35),0 2px 6px rgba(15,18,32,.18)",
            display: "inline-flex",
            alignItems: "center",              // 세로 중앙
            justifyContent: "center",          // 가로 중앙
            gap: 8,
            zIndex: 2,
          }}
          className="btn primary"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            aria-hidden="true"
            style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,.25))" }}
          >
            <path
              fill="currentColor"
              d="M5 2h10l6 6v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm9 1.5V8h4.5L14 3.5ZM7 12h10v2H7v-2Zm0 4h10v2H7v-2ZM7 8h5v2H7V8Z"
            />
          </svg>
          증명서 발급
        </button>

        {/* ✅ 추가: 급여대장 버튼 (페이지 내 모달로 열기) */}
        <button
          onClick={openPayrollPopup}
          title="급여대장 페이지를 모달로 엽니다"
          style={{
            height: 40,
            padding: "0 16px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background:
              "linear-gradient(180deg,#f59e0b 0%, #f97316 100%), radial-gradient(800px 400px at 100% 0%, rgba(255,255,255,.18), transparent 60%)",
            color: "#1f2937",
            fontWeight: 800,
            letterSpacing: ".02em",
            cursor: "pointer",
            boxShadow: "0 8px 20px rgba(245,158,11,.35),0 2px 6px rgba(15,18,32,.18)",
          }}
        >
          급여대장
        </button>
      </div>

      <DataTable
        columns={[
          { key: "name", label: "성명", editable: true },
          { key: "dept", label: "부서명", editable: true },
          { key: "position", label: "직위", editable: true },
          { key: "empNo", label: "사원번호", editable: true },
          { key: "resRegNo", label: "주민등록번호", editable: true },
          { key: "age", label: "나이", editable: false },
          { key: "gender", label: "성별", editable: true },
          { key: "employmentType", label: "고용형태", editable: true },
          { key: "joinDate", label: "입사일", editable: true },
          { key: "phone", label: "전화번호", editable: true },
          { key: "address", label: "주소", editable: true },
          { key: "email", label: "E-Mail", editable: true },
          { key: "bank", label: "은행명", editable: true },
          { key: "accountNo", label: "계좌번호", editable: true },
        ]}
        data={displayEmployees}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        sortKey="empNo"
        enableExcel
        collectionName="employees"
        idKey="empNo"
        idAliases={["사원번호", "사번"]}
        excelFields={[
          "name",
          "dept",
          "position",
          "empNo",
          "resRegNo",
          "age",
          "gender",
          "employmentType",
          "joinDate",
          "phone",
          "address",
          "email",
          "bank",
          "accountNo",
        ]}
        onUploadComplete={({ updated, skipped }) => {
          console.log(`업데이트: ${updated}, 스킵: ${skipped}`);
          alert("엑셀 업로드가 완료되었습니다.");
        }}
      />

      {showModal && (
        <GenericEditModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setEditData(null);
            setOrigId(null);
          }}
          onSave={handleSaveFromModal}
          villa={editData}
          headerKeys={[]}
          readOnlyKeys={["age"]}
          fields={fields}
          gridClass="modal-modern-grid"
          labels={labels}
          types={types}
          selectOptions={selectOptions}
          formatters={formatters}
        />
      )}

      {/* ✅ 증명서 발급 모달 */}
      {openCert && (
        <CertificateIssuePage
          onClose={() => setOpenCert(false)}
          employeeList={employees}
        />
      )}

      {/* ✅ 급여대장 모달 (새 창 없이 페이지 내 오버레이) */}
      {payrollOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="급여대장"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPayrollOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10040,
            background:
              "radial-gradient(1400px 900px at 80% 0%, rgba(108,140,245,.18), transparent 60%), radial-gradient(1000px 700px at 10% 100%, rgba(120,160,255,.12), transparent 60%), rgba(15,18,32,.55)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeIn .12s ease-out",
          }}
        >
          <div
            style={{
              width: "min(1600px, 96vw)",
              height: "min(950px, 94vh)",
              background: "linear-gradient(180deg,#ffffff 0%, #f8faff 100%)",
              border: "1px solid #e3e8f3",
              borderRadius: 24,
              boxShadow: "0 18px 48px rgba(15,18,32,.22), 0 2px 6px rgba(15,18,32,.14)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: 56,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 16px",
                borderBottom: "1px solid #e8ecf5",
                background: "linear-gradient(180deg,#f9fbff 0%, #f5f7ff 100%)",
              }}
            >
              <div style={{ fontWeight: 800, letterSpacing: ".02em", color: "#1f2937" }}>
                급여대장
              </div>
              <button
                onClick={() => setPayrollOpen(false)}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  fontWeight: 700,
                  color: "#111827",
                }}
              >
                닫기
              </button>
            </div>
            <div style={{ flex: "1 1 auto" }}>
              <iframe
                title="급여대장"
                src="/payroll-book"
                style={{ width: "100%", height: "100%", border: 0 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
