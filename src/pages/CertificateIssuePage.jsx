// src/pages/CertificateIssuePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./CertificateIssuePage.css";
import sealImg from "../assets/seal-square.png";
/* ✅ PDF 저장용 */
import * as htmlToImage from "html-to-image";
import { jsPDF } from "jspdf";

/* ===== 상수 ===== */
const CERT_TYPES = [
  { value: "employment", label: "재직증명서" },
  { value: "career", label: "경력증명서" },
  { value: "retire", label: "퇴직증명서" },
];

const BIZ = {
  name: "한남주택관리",
  bizNo: "763-03-01741",
  ceo: "이세구",
  address: "대전광역시 서구 탄방동 86-27번지 3층",
  tel: "042-489-8555",
};

/* ===== 유틸 ===== */
const todayStr = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}년 ${mm}월 ${dd}일`;
};
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
function calcSpan(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  let years = b.getFullYear() - a.getFullYear();
  let months = b.getMonth() - a.getMonth();
  let days = b.getDate() - a.getDate();
  if (days < 0) {
    months--;
    const lastDayOfPrevMonth = new Date(b.getFullYear(), b.getMonth(), 0).getDate();
    days += lastDayOfPrevMonth;
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  const parts = [];
  if (years > 0) parts.push(`${years}년`);
  if (months > 0) parts.push(`${months}개월`);
  if (parts.length === 0) parts.push("0개월");
  return parts.join(" ");
}

/* ===== 발급번호/발급내역(로컬) ===== */
const ISSUE_COUNTER_KEY = "cert:issueCounterByDate";
const ISSUE_LOG_KEY = "cert:issueLog";

function nextIssueNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const map = JSON.parse(localStorage.getItem(ISSUE_COUNTER_KEY) || "{}");
  const next = (map[ymd] || 0) + 1;
  map[ymd] = next;
  localStorage.setItem(ISSUE_COUNTER_KEY, JSON.stringify(map));
  return `${ymd}-${String(next).padStart(3, "0")}`;
}
function appendIssueLog(row) {
  const arr = JSON.parse(localStorage.getItem(ISSUE_LOG_KEY) || "[]");
  arr.unshift(row);
  localStorage.setItem(ISSUE_LOG_KEY, JSON.stringify(arr));
}
function readIssueLog() {
  return JSON.parse(localStorage.getItem(ISSUE_LOG_KEY) || "[]");
}
function writeIssueLog(arr) {
  localStorage.setItem(ISSUE_LOG_KEY, JSON.stringify(arr));
}

/* ===== 메인 컴포넌트 ===== */
export default function CertificateIssuePage({ onClose, employeeList = [] }) {
  const [certType, setCertType] = useState(CERT_TYPES[0].value);
  const [employees, setEmployees] = useState(employeeList);
  const [empId, setEmpId] = useState(employeeList[0]?.id || "");
  const emp = useMemo(() => employees.find((x) => x.id === empId), [employees, empId]);
  const paperRef = useRef(null);

  const [vals, setVals] = useState({
    dept: "",
    position: "",
    purpose: "",
    duty: "",
    retireReason: "",
    retireDate: "",
    careerEnd: "",
  });

  /* 발급부서(사무팀만) */
  const officeOptions = useMemo(
    () => employees.filter((e) => (e.dept || "").includes("사무팀")),
    [employees]
  );
  const [issuerId, setIssuerId] = useState(officeOptions[0]?.id || "");
  const issuer = useMemo(
    () => officeOptions.find((x) => x.id === issuerId),
    [officeOptions, issuerId]
  );
  const [issuerInfo, setIssuerInfo] = useState({
    dept: "",
    position: "",
    name: "",
    phone: BIZ.tel,
  });

  /* 발급번호/발급내역 */
  const [issueNo] = useState(() => nextIssueNo());
  const [showLog, setShowLog] = useState(false);
  const [logs, setLogs] = useState(() => readIssueLog());
  const deleteLog = (idx) => {
    const arr = [...logs];
    arr.splice(idx, 1);
    setLogs(arr);
    writeIssueLog(arr);
  };

  /* 수정 모드 */
  const [editing, setEditing] = useState(false);

  /* PDF 저장 상태 (saving / done / error) */
  const [pdfStatus, setPdfStatus] = useState(null);

  /* 동기화 */
  useEffect(() => {
    setEmployees(employeeList);
    const exists = employees.some((e) => e.id === empId);
    if (employees.length > 0 && !exists) setEmpId(employees[0].id);
    else if (employees.length === 0) setEmpId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeList]);

  useEffect(() => {
    if (!emp) return;
    setVals((p) => ({
      ...p,
      dept: emp.dept || p.dept,
      position: emp.position || p.position,
    }));
  }, [emp]);

  useEffect(() => {
    if (!issuer) return;
    setIssuerInfo({
      dept: issuer.dept || "",
      position: issuer.position || "",
      name: issuer.name || "",
      phone: BIZ.tel,
    });
  }, [issuer]);

  /* 발급내역 기록 */
  function recordIssue() {
    const row = {
      발급일자: todayStr(),
      구분: CERT_TYPES.find((c) => c.value === certType)?.label || "",
      발급번호: issueNo,
      부서명: vals.dept || "",
      직위: vals.position || "",
      발급용도: vals.purpose || "",
    };
    appendIssueLog(row);
    setLogs((prev) => [row, ...prev]);
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const employeeOptions = useMemo(
    () => employees.map((e) => ({ value: e.id, label: e.name || "" })),
    [employees]
  );

  const commonProps = {
    emp,
    BIZ,
    vals,
    setVals,
    issueNo,
    issuerInfo,
    editing,
  };

  const handleToggleEdit = () => {
    // 수정 모드 → 종료 시 기록
    if (editing) {
      recordIssue();
    }
    setEditing((prev) => !prev);
  };

  /* ✅ PDF 저장 핸들러: .doc 영역만 캡쳐하고, 폭+높이 둘 다 고려해서 항상 페이지 안에 맞춤 */
  const handlePdfSave = async () => {
    if (!paperRef.current) {
      alert("증명서 내용을 찾을 수 없습니다.");
      return;
    }
    try {
      setPdfStatus("saving");

      // 캡쳐 대상: 실제 증명서 내용(.doc)
      const container = paperRef.current;
      const node = container.querySelector(".doc") || container;

      // 레이아웃이 안정된 다음 프레임에서 캡쳐
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));

      const dataUrl = await htmlToImage.toPng(node, {
        cacheBust: true,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 10; // 사방 여백 10mm
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const imgProps = pdf.getImageProperties(dataUrl);
      const imgWidthPx = imgProps.width;
      const imgHeightPx = imgProps.height;

      // ✅ 폭/높이 둘 다 고려해서 더 작은 쪽에 맞춤 → 위/아래도 잘리지 않게 약간 더 작게
      const scale = Math.min(
        usableWidth / imgWidthPx,
        usableHeight / imgHeightPx
      );
      const imgWidthMm = imgWidthPx * scale;
      const imgHeightMm = imgHeightPx * scale;

      // 중앙 정렬 (좌우/상하 모두 가운데)
      const x = (pageWidth - imgWidthMm) / 2;
      const y = (pageHeight - imgHeightMm) / 2;

      pdf.addImage(dataUrl, "PNG", x, y, imgWidthMm, imgHeightMm);

      const certLabel =
        CERT_TYPES.find((c) => c.value === certType)?.label || "증명서";
      const name = emp?.name || "이름미상";
      pdf.save(`${certLabel}_${name}.pdf`);

      // 발급내역 추가
      recordIssue();
      setPdfStatus("done");
      setTimeout(() => setPdfStatus(null), 2000);
    } catch (err) {
      console.error("PDF 저장 실패:", err);
      alert("PDF 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setPdfStatus("error");
      setTimeout(() => setPdfStatus(null), 2500);
    }
  };

  return (
    <div className="cert-modal-overlay" onClick={handleOverlayClick}>
      <div className="cert-modal-content">
        <div className="cert-wrap is-modal">
          {/* 툴바 */}
          <div className="cert-toolbar no-print">
            <div className="row">
              <div className="field">
                <label>증명서 종류</label>
                <select
                  value={certType}
                  onChange={(e) => setCertType(e.target.value)}
                  className="w-sm"
                >
                  {CERT_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>
                      {ct.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>사원 선택</label>
                <select
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  className="w-sm"
                >
                  {employeeOptions.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>발급부서(사무팀)</label>
                <select
                  value={issuerId}
                  onChange={(e) => setIssuerId(e.target.value)}
                  className="w-sm"
                >
                  {officeOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="spacer" />

              {/* 수정 버튼 */}
              <button className="btn edit" onClick={handleToggleEdit}>
                {editing ? "수정완료" : "수정"}
              </button>

              {/* 발급내역 보기 */}
              <button className="btn history" onClick={() => setShowLog(true)}>
                발급내역
              </button>

              {/* PDF 저장 버튼 */}
              <button className="btn pdf" onClick={handlePdfSave}>
                PDF 저장
              </button>

              <button className="btn btn-close" onClick={onClose} title="닫기">
                ×
              </button>
            </div>
          </div>

          {/* 증명서 영역 */}
          <div className="paper-a4-scroll">
            <div className="paper-a4" ref={paperRef}>
              {certType === "employment" && <EmploymentTemplate {...commonProps} />}
              {certType === "career" && <CareerTemplate {...commonProps} />}
              {certType === "retire" && <RetireTemplate {...commonProps} />}
            </div>
          </div>
        </div>
      </div>

      {/* 발급내역 모달 */}
      {showLog && (
        <div
          className="history-modal"
          onClick={(e) => e.target === e.currentTarget && setShowLog(false)}
        >
          <div className="history-panel">
            <div className="history-head">
              <div className="h-title">발급내역</div>
              <button className="btn btn-close" onClick={() => setShowLog(false)}>
                ×
              </button>
            </div>
            <div className="history-body">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>발급일자</th>
                    <th>구분</th>
                    <th>발급번호</th>
                    <th>부서명</th>
                    <th>직위</th>
                    <th>발급용도</th>
                    <th>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((r, i) => (
                    <tr key={i}>
                      <td>{r.발급일자}</td>
                      <td>{r.구분}</td>
                      <td>{r.발급번호}</td>
                      <td>{r.부서명}</td>
                      <td>{r.직위}</td>
                      <td>{r.발급용도}</td>
                      <td>
                        <button
                          className="btn btn-mini danger"
                          onClick={() => deleteLog(i)}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", color: "#6b7280" }}>
                        발급내역이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PDF 저장 상태 토스트 (상단 표시) */}
      {pdfStatus && (
        <div
          className={
            pdfStatus === "saving"
              ? "cert-toast cert-toast--saving"
              : pdfStatus === "done"
              ? "cert-toast cert-toast--done"
              : "cert-toast cert-toast--error"
          }
        >
          {pdfStatus === "saving" && "PDF 파일을 저장 중입니다..."}
          {pdfStatus === "done" && "PDF 파일이 저장되었습니다."}
          {pdfStatus === "error" && "PDF 파일 저장 중 오류가 발생했습니다."}
        </div>
      )}
    </div>
  );
}

/* ===== 템플릿: 재직 ===== */
function EmploymentTemplate({ emp, BIZ, vals, setVals, issueNo, issuerInfo, editing }) {
  return (
    <div className="doc">
      <div className="doc-title">재직증명서</div>
      <div className="doc-subhead">
        <span className="issue-no">발급번호 : {issueNo}</span>
      </div>

      {/* 인적사항 */}
      <table className="kv">
        <tbody>
          <tr>
            <th rowSpan={3}>인적사항</th>
            <th>성명</th>
            <td>{emp?.name || ""}</td>
          </tr>
          <tr>
            <th>주민등록번호</th>
            <td>{emp?.ssn || emp?.resRegNo || ""}</td>
          </tr>
          <tr>
            <th>주소</th>
            <td>{emp?.address || ""}</td>
          </tr>
        </tbody>
      </table>

      {/* 재직사항 */}
      <table className="kv">
        <tbody>
          <tr>
            <th rowSpan={6}>재직사항</th>
            <th>회사명</th>
            <td>{BIZ.name}</td>
          </tr>
          <tr>
            <th>사업자등록번호</th>
            <td>{BIZ.bizNo}</td>
          </tr>
          <tr>
            <th>부서명</th>
            <td>{emp?.dept || vals.dept || ""}</td>
          </tr>
          <tr>
            <th>입사일</th>
            <td>{fmtDate(emp?.joinDate)}</td>
          </tr>
          <tr>
            <th>직위</th>
            <td>{emp?.position || vals.position || ""}</td>
          </tr>
          <tr>
            <th>근속기간</th>
            <td>{emp?.joinDate ? calcSpan(emp.joinDate, new Date()) : ""}</td>
          </tr>
        </tbody>
      </table>

      {/* 발급부서 */}
      <table className="kv">
        <tbody>
          <tr>
            <th rowSpan={4}>발급부서</th>
            <th>부서명</th>
            <td>{issuerInfo.dept}</td>
          </tr>
          <tr>
            <th>직위</th>
            <td>{issuerInfo.position}</td>
          </tr>
          <tr>
            <th>성명</th>
            <td>{issuerInfo.name}</td>
          </tr>
          <tr>
            <th>전화번호</th>
            <td>{issuerInfo.phone}</td>
          </tr>
        </tbody>
      </table>

      {/* 발급용도 */}
      <table className="kv">
        <tbody>
          <tr>
            <th>발급용도</th>
            <td>
              {editing ? (
                <input
                  type="text"
                  className="cert-input full"
                  value={vals.purpose || ""}
                  onChange={(e) =>
                    setVals((p) => ({
                      ...p,
                      purpose: e.target. value,
                    }))
                  }
                  placeholder="발급용도를 입력하세요."
                />
              ) : (
                vals.purpose || ""
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <BottomIssuer />
    </div>
  );
}

/* ===== 템플릿: 경력 ===== */
function CareerTemplate({ emp, BIZ, vals, setVals, issueNo, issuerInfo, editing }) {
  const to = emp?.leaveDate ? new Date(emp.leaveDate) : new Date();
  const span = emp?.joinDate ? calcSpan(emp.joinDate, to) : "";
  const defaultEnd = fmtDate(emp?.leaveDate) || "현재";
  const careerEndValue = vals.careerEnd || defaultEnd;

  return (
    <div className="doc">
      <div className="doc-title">경력증명서</div>
      <div className="doc-subhead">
        <span className="issue-no">발급번호 : {issueNo}</span>
      </div>

      {/* 인적사항 */}
      <table className="kv">
        <tbody>
          <tr>
            <th rowSpan={3}>인적사항</th>
            <th>성명</th>
            <td>{emp?.name || ""}</td>
          </tr>
          <tr>
            <th>주민등록번호</th>
            <td>{emp?.ssn || emp?.resRegNo || ""}</td>
          </tr>
          <tr>
            <th>주소</th>
            <td>{emp?.address || ""}</td>
          </tr>
        </tbody>
      </table>

      {/* 경력사항 */}
      <table className="kv">
        <tbody>
          <tr>
            <th rowSpan={6}>경력사항</th>
            <th>회사명</th>
            <td>{BIZ.name}</td>
          </tr>
          <tr>
            <th>사업자등록번호</th>
            <td>{BIZ.bizNo}</td>
          </tr>
          <tr>
            <th>근무부서</th>
            <td>{emp?.dept || vals.dept || ""}</td>
          </tr>
          <tr>
            <th>직위</th>
            <td>{emp?.position || vals.position || ""}</td>
          </tr>
          <tr>
            <th>담당업무</th>
            <td>
              {editing ? (
                <input
                  type="text"
                  className="cert-input full"
                  value={vals.duty || ""}
                  onChange={(e) =>
                    setVals((p) => ({
                      ...p,
                      duty: e.target.value,
                    }))
                  }
                  placeholder="담당업무를 입력하세요."
                />
              ) : (
                vals.duty || ""
              )}
            </td>
          </tr>
          <tr>
            <th>근무연한</th>
            <td>
              {fmtDate(emp?.joinDate)} &nbsp;~&nbsp;
              {editing ? (
                <input
                  type="text"
                  className="cert-input inline"
                  value={vals.careerEnd || ""}
                  onChange={(e) =>
                    setVals((p) => ({
                      ...p,
                      careerEnd: e.target.value,
                    }))
                  }
                  placeholder={defaultEnd}
                />
              ) : (
                careerEndValue
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 발급부서 */}
      <table className="kv">
        <tbody>
          <tr>
            <th rowSpan={4}>발급부서</th>
            <th>부서명</th>
            <td>{issuerInfo.dept}</td>
          </tr>
          <tr>
            <th>직위</th>
            <td>{issuerInfo.position}</td>
          </tr>
          <tr>
            <th>성명</th>
            <td>{issuerInfo.name}</td>
          </tr>
          <tr>
            <th>전화번호</th>
            <td>{issuerInfo.phone}</td>
          </tr>
        </tbody>
      </table>

      {/* 발급용도 */}
      <table className="kv">
        <tbody>
          <tr>
            <th>발급용도</th>
            <td>
              {editing ? (
                <input
                  type="text"
                  className="cert-input full"
                  value={vals.purpose || ""}
                  onChange={(e) =>
                    setVals((p) => ({
                      ...p,
                      purpose: e.target.value,
                    }))
                  }
                  placeholder="발급용도를 입력하세요."
                />
              ) : (
                vals.purpose || ""
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <BottomIssuer />
    </div>
  );
}

/* ===== 템플릿: 퇴직 ===== */
function RetireTemplate({ emp, BIZ, vals, setVals, issueNo, issuerInfo, editing }) {
  const retireDate = vals.retireDate || emp?.leaveDate || "";
  const span =
    emp?.joinDate && retireDate
      ? calcSpan(emp.joinDate, new Date(retireDate))
      : "";

  return (
    <div className="doc">
      <div className="doc-title">퇴직증명서</div>
      <div className="doc-subhead">
        <span className="issue-no">발급번호 : {issueNo}</span>
      </div>

      {/* 인적사항 */}
      <table className="kv">
        <tbody>
          <tr>
            <th rowSpan={3}>인적사항</th>
            <th>성명</th>
            <td>{emp?.name || ""}</td>
          </tr>
          <tr>
            <th>주민등록번호</th>
            <td>{emp?.ssn || emp?.resRegNo || ""}</td>
          </tr>
          <tr>
            <th>주소</th>
            <td>{emp?.address || ""}</td>
          </tr>
        </tbody>
      </table>

      {/* 재직사항 */}
      <table className="kv">
        <tbody>
          <tr>
            <th rowSpan={7}>재직사항</th>
            <th>회사명</th>
            <td>{BIZ.name}</td>
          </tr>
          <tr>
            <th>사업자등록번호</th>
            <td>{BIZ.bizNo}</td>
          </tr>
          <tr>
            <th>부서명</th>
            <td>{emp?.dept || vals.dept || ""}</td>
          </tr>
          <tr>
            <th>직위</th>
            <td>{emp?.position || vals.position || ""}</td>
          </tr>
          <tr>
            <th>입사일</th>
            <td>{fmtDate(emp?.joinDate)}</td>
          </tr>
          <tr>
            <th>퇴사일</th>
            <td>
              {editing ? (
                <input
                  type="text"
                  className="cert-input inline"
                  value={retireDate}
                  onChange={(e) =>
                    setVals((p) => ({
                      ...p,
                      retireDate: e.target.value,
                    }))
                  }
                  placeholder="YYYY-MM-DD"
                />
              ) : (
                retireDate
              )}
            </td>
          </tr>
          <tr>
            <th>근속기간</th>
            <td>{span || ""}</td>
          </tr>
        </tbody>
      </table>

      {/* 발급부서 */}
      <table className="kv">
        <tbody>
          <tr>
            <th rowSpan={4}>발급부서</th>
            <th>부서명</th>
            <td>{issuerInfo.dept}</td>
          </tr>
          <tr>
            <th>직위</th>
            <td>{issuerInfo.position}</td>
          </tr>
          <tr>
            <th>성명</th>
            <td>{issuerInfo.name}</td>
          </tr>
          <tr>
            <th>전화번호</th>
            <td>{issuerInfo.phone}</td>
          </tr>
        </tbody>
      </table>

      {/* 퇴직사유/발급용도 */}
      <table className="kv">
        <tbody>
          <tr>
            <th>퇴직사유</th>
            <td>
              {editing ? (
                <input
                  type="text"
                  className="cert-input full"
                  value={vals.retireReason || ""}
                  onChange={(e) =>
                    setVals((p) => ({
                      ...p,
                      retireReason: e.target.value,
                    }))
                  }
                  placeholder="퇴직사유를 입력하세요."
                />
              ) : (
                vals.retireReason || ""
              )}
            </td>
          </tr>
          <tr>
            <th>발급용도</th>
            <td>
              {editing ? (
                <input
                  type="text"
                  className="cert-input full"
                  value={vals.purpose || ""}
                  onChange={(e) =>
                    setVals((p) => ({
                      ...p,
                      purpose: e.target.value,
                    }))
                  }
                  placeholder="발급용도를 입력하세요."
                />
              ) : (
                vals.purpose || ""
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <BottomIssuer />
    </div>
  );
}

/* ===== 하단: 날짜/회사/대표 + 도장 ===== */
function BottomIssuer() {
  const textRef = useRef(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const update = () => {
      if (textRef.current) setOffset(textRef.current.offsetWidth / 2);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div className="issuer">
      <div className="issuer-text" ref={textRef}>
        <div className="issued-date">{todayStr()}</div>
        <div className="company">한남주택관리</div>
        <div className="ceo">대표 이세구</div>
      </div>

      <img
        className="seal-inline"
        src={sealImg}
        alt=""
        aria-hidden
        style={{ left: `calc(50% + ${offset + 8}px)` }}
      />
    </div>
  );
}
