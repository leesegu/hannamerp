// src/pages/CertificateIssuePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./CertificateIssuePage.css";
/* html → image 저장 */
import * as htmlToImage from "html-to-image";

/**
 * - 모달 컴포넌트 (새창 X)
 * - props: onClose, employeeList
 * - 드롭다운: 증명서 종류 / 사원선택
 */

const CERT_TYPES = [
  { value: "contract", label: "표준근로계약서" },
  { value: "employment", label: "재직증명서" },
  { value: "career", label: "경력증명서" },
  { value: "retire", label: "퇴직증명서" },
];

// 🔧 BIZ 정보
const BIZ = {
  name: "한남주택관리",
  bizNo: "763-03-01741",
  ceo: "이세구",
  sealText: "인",
  address: "대전광역시 서구 탄방동 86-27번지 3층",
  tel: "042-489-8555",
};

// YYYY-MM-DD
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// 오늘: 숫자 없이 "년  월  일" 만
const todayK = () => "년  월  일";

// 근속기간
function calcSpan(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  b.setDate(b.getDate() + 1);
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
  if (days > 0) parts.push(`${days}일`);
  return parts.length > 0 ? parts.join(" ") : "1일";
}

export default function CertificateIssuePage({ onClose, employeeList = [] }) {
  const [certType, setCertType] = useState(CERT_TYPES[0].value);
  const [employees, setEmployees] = useState(employeeList);
  const [empId, setEmpId] = useState(employeeList[0]?.id || "");
  const emp = useMemo(() => employees.find((x) => x.id === empId), [employees, empId]);
  const paperRef = useRef(null);

  // 외부 목록 변경 동기화
  useEffect(() => {
    setEmployees(employeeList);
    const exists = employeeList.some((e) => e.id === empId);
    if (employeeList.length > 0 && !exists) setEmpId(employeeList[0].id);
    else if (employeeList.length === 0) setEmpId("");
  }, [employeeList, empId]);

  const filename = useMemo(() => {
    // 파일명은 선택한 사원이 있을 때만 이름 포함 (계약서는 드롭다운 비활성화/빈옵션)
    const e = employees.find((x) => x.id === empId);
    const name = e?.name ? `_${e.name}` : "";
    const label = CERT_TYPES.find((c) => c.value === certType)?.label || "증명서";
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
      d.getDate()
    ).padStart(2, "0")}`;
    return `${label}${name}_${ymd}.png`;
  }, [certType, empId, employees]);

  const saveAsImage = async () => {
    if (!paperRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(paperRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      a.click();
    } catch (e) {
      console.error("이미지 저장 실패:", e);
      alert("이미지 저장에 실패했습니다.");
    }
  };

  const handlePrint = () => window.print();

  // 오버레이 클릭 → 닫기
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  // 사원 드롭다운 옵션 생성 로직
  const employeeOptions = useMemo(() => {
    if (certType === "contract") {
      // 계약서일 때는 목록을 비워서 아무 내용도 나오지 않게
      return [];
    }
    // 그 외는 "이름만" 표시 (괄호/숫자 제거)
    return employees.map((e) => ({ value: e.id, label: e.name || "" }));
  }, [certType, employees]);

  const isContract = certType === "contract";

  return (
    <div className="cert-modal-overlay" onClick={handleOverlayClick}>
      <div className="cert-modal-content">
        <div className="cert-wrap is-modal">
          {/* 툴바 */}
          <div className="cert-toolbar no-print">
            <div className="row">
              <div className="field">
                <label>증명서 종류</label>
                <select value={certType} onChange={(e) => setCertType(e.target.value)}>
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
                  disabled={isContract}
                  className={isContract ? "disabled" : ""}
                  title={isContract ? "" : ""}
                >
                  {employeeOptions.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="spacer" />
              {/* 버튼 디자인 업그레이드 + 프린터 아이콘 변경 */}
              <button className="btn luxe" onClick={saveAsImage}>
                <span className="btn-ico">
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path fill="currentColor" d="M6 2h12v6H6V2Zm12 9h2a2 2 0 0 1 2 2v5h-4v4H6v-4H2v-5a2 2 0 0 1 2-2h2v3h12v-3Zm-4 9v-5H10v5h4Z"/>
                  </svg>
                </span>
                이미지저장
              </button>
              <button className="btn luxe print" onClick={handlePrint}>
                <span className="btn-ico">
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path fill="currentColor" d="M19 8H5V3h14v5Zm3 2v7h-4v4H6v-4H2v-7a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3ZM8 19h8v-3H8v3Z"/>
                  </svg>
                </span>
                인쇄
              </button>
              <button className="btn btn-close" onClick={onClose} title="닫기">×</button>
            </div>
          </div>

          {/* 증명서 영역 */}
          <div className="paper-a4-scroll">
            <div className="paper-a4" ref={paperRef}>
              <div className="doc-logo-watermark" />
              {certType === "contract" && <ContractTemplate emp={emp} BIZ={BIZ} />}
              {certType === "employment" && <EmploymentTemplate emp={emp} BIZ={BIZ} />}
              {certType === "career" && <CareerTemplate emp={emp} BIZ={BIZ} />}
              {certType === "retire" && <RetireTemplate emp={emp} BIZ={BIZ} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ 템플릿: 표준근로계약서 (요구사항 반영) ============ */
function ContractTemplate({ emp, BIZ }) {
  const Check = ({ checked }) => (
    <span className={`chk ${checked ? "on" : ""}`} aria-hidden />
  );

  return (
    <div className="doc contract">
      <div className="doc-title">표준 근로계약서</div>

      {/* 상단 당사자 표시 */}
      <div className="contract-topline">
        <div className="ct-left">
          <div className="ct-box">
            <div className="ct-name">한남주택관리</div>
            <div className="ct-caption"> (이하 “사업주”라 함)과</div>
          </div>
        </div>
        <div className="ct-right">
          {/* 이 줄(근로자 표기)만 밑줄 유지 */}
          <div className="ct-blank" />
          <div className="ct-caption"> (이하 “근로자”라 함)은</div>
        </div>
      </div>
      <p className="contract-desc">다음과 같이 근로계약을 체결한다.</p>

      {/* 본문 표 (1~11항) — 숫자 뒤 점(.) 제거, 모든 기입칸 밑줄 제거 */}
      <table className="contract-table">
        <tbody>
          {/* 1 근로개시일 → '년 월 일' 형태 + 각 단위 앞 간격 6글자 */}
          <tr>
            <th className="no">1</th>
            <th className="head">근로개시일</th>
            <td colSpan={3}>
              <span className="gap6" />년
              <span className="gap6" />월
              <span className="gap6" />일
            </td>
          </tr>

          {/* 2 근무장소 */}
          <tr>
            <th className="no">2</th>
            <th className="head">근무장소</th>
            <td colSpan={3} />
          </tr>

          {/* 3 업무의 내용 */}
          <tr>
            <th className="no">3</th>
            <th className="head">업무의 내용</th>
            <td colSpan={3} />
          </tr>

          {/* 4 근무시간 + 휴게시간 (각 '시/분' 앞 6글자 간격) */}
          <tr>
            <th className="no">4</th>
            <th className="head">근무시간</th>
            <td colSpan={3} className="grid-4col">
              <div className="sub nowrap">
                근무시간:
                <span className="gap6" />시
                <span className="gap6" />분부터
                <span className="gap6" />시
                <span className="gap6" />분까지
              </div>
              <div className="sub nowrap">
                휴게시간:
                <span className="gap6" />시
                <span className="gap6" />분부터
                <span className="gap6" />시
                <span className="gap6" />분
              </div>
            </td>
          </tr>

          {/* 5 근무일/휴일 → '요일' 앞 6글자 간격 */}
          <tr>
            <th className="no">5</th>
            <th className="head">근무일/휴일</th>
            <td colSpan={3}>
              <div className="sub nowrap">
                근무일: 매주 <span className="gap6" />요일 &nbsp;&nbsp;|&nbsp;&nbsp; 주휴일 <span className="gap6" />요일
              </div>
            </td>
          </tr>

          {/* 6 임금 (② 계산방법 삭제, 간격 조정, 줄바꿈 금지) */}
          <tr>
            <th className="no">6</th>
            <th className="head">임금</th>
            <td colSpan={3} className="wage-wrap">
              <div className="wage-row">
                <div className="w-title">① 임금</div>
                <div className="w-body">
                  <div className="nowrap">기본급 <span className="gap10" />원</div>
                  <div className="nowrap">
                    상여금 <Check /> 있음 <Check /> 없음 <span className="gap10" />원
                  </div>
                  <div className="nowrap">
                    기타수당 <Check /> 있음 <Check /> 없음 <span className="gap10" />원
                  </div>
                </div>
              </div>

              {/* ② 계산방법 — 삭제 */}

              <div className="wage-row">
                <div className="w-title">③ 지급일</div>
                <div className="w-body nowrap">
                  매월(매주 또는 매일)<span className="gap3" />일 (휴일의 경우는 전일 지급)
                </div>
              </div>

              <div className="wage-row">
                <div className="w-title">④ 지급방법</div>
                <div className="w-body nowrap">
                  <Check /> 근로자에게 직접지급 &nbsp;/&nbsp; <Check /> 근로자 명의 예금통장에 입금
                </div>
              </div>
            </td>
          </tr>

          {/* 7 연차유급휴가 */}
          <tr>
            <th className="no">7</th>
            <th className="head">연차유급휴가</th>
            <td colSpan={3}>연차유급휴가는 근로기준법에서 정하는 바에 따라 부여함</td>
          </tr>

          {/* 8 사회보험 */}
          <tr>
            <th className="no">8</th>
            <th className="head">사회보험 적용여부</th>
            <td colSpan={3}>
              <label className="chkline"><Check /> 고용보험</label>
              <label className="chkline"><Check /> 산재보험</label>
              <label className="chkline"><Check /> 국민연금</label>
              <label className="chkline"><Check /> 건강보험</label>
            </td>
          </tr>

          {/* 9 교부 */}
          <tr>
            <th className="no">9</th>
            <th className="head">근로계약서 교부</th>
            <td colSpan={3}>
              사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자에게 교부함
              <span className="muted"> (근로기준법 제17조 이행)</span>
            </td>
          </tr>

          {/* 10 제목 줄바꿈 */}
          <tr>
            <th className="no">10</th>
            <th className="head">
              근로계약 취업규칙<br/>이행
            </th>
            <td colSpan={3}>
              사업주와 근로자는 각자 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 함
            </td>
          </tr>

          {/* 11 기타 */}
          <tr>
            <th className="no">11</th>
            <th className="head">기타</th>
            <td colSpan={3}>이 계약에 정함이 없는 사항은 근로기준법령에 의함</td>
          </tr>
        </tbody>
      </table>

      {/* 날짜 (숫자 없이, 각 단위 앞 5글자 간격) */}
      <div className="date-line">
        <span className="gap5" />년
        <span className="gap5" />월
        <span className="gap5" />일
      </div>

      {/* 서명/표기 — 도장 삭제, 정렬/간격/줄바꿈 제어 */}
      <div className="sign-area">
        <div className="sign-col business">
          <div className="sign-title">사업주</div>
          <div className="sign-kv sign-grid">
            <div className="row"><span className="key">상호</span><span className="val">{BIZ.name}</span></div>
            <div className="row nowrap"><span className="key">주소</span><span className="val no-wrap">{BIZ.address}</span></div>
            <div className="row"><span className="key">전화</span><span className="val">{BIZ.tel}</span></div>
            <div className="row"><span className="key">대표자</span><span className="val">이세구</span></div>
          </div>
        </div>

        <div className="sign-col">
          <div className="sign-title">근로자</div>
          <div className="sign-kv sign-grid">
            <div className="row"><span className="key">주소</span><span className="val" /></div>
            <div className="row"><span className="key">연락처</span><span className="val" /></div>
            <div className="row"><span className="key">성명</span><span className="val" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ 템플릿: 재직증명서 ============ */
function EmploymentTemplate({ emp, BIZ }) {
  return (
    <div className="doc">
      <div className="doc-title">재 직 증 명 서</div>

      <table className="kv">
        <tbody>
          <tr><th>성명</th><td>{emp?.name || ""}</td></tr>
          <tr><th>주민등록번호</th><td>{emp?.ssn || emp?.resRegNo || ""}</td></tr>
          <tr><th>주소</th><td>{emp?.address || ""}</td></tr>
          <tr><th>회사명</th><td>{BIZ.name}</td></tr>
          <tr><th>사업자등록번호</th><td>{BIZ.bizNo}</td></tr>
          <tr><th>부서명</th><td>{emp?.dept || ""}</td></tr>
          <tr><th>직위</th><td>{emp?.position || ""}</td></tr>
          <tr><th>입사일</th><td>{fmtDate(emp?.joinDate)}</td></tr>
          <tr><th>발급용도</th><td>재직확인</td></tr>
        </tbody>
      </table>

      <p className="para center">상기인은 현재 위와 같이 당사에 재직하고 있음을 증명합니다.</p>
      <div className="date-line">{todayK()}</div>

      <div className="issuer">
        <div className="issuer-text">
          <div className="company">{BIZ.name}</div>
          <div className="ceo">대표 {BIZ.ceo}</div>
        </div>
        <div className="seal-stamp">
          <span>한남주택관리</span>
        </div>
      </div>
    </div>
  );
}

/* ============ 템플릿: 경력증명서 ============ */
function CareerTemplate({ emp, BIZ }) {
  const span = emp?.joinDate && emp?.leaveDate ? calcSpan(emp.joinDate, emp.leaveDate) : "재직 중";
  return (
    <div className="doc">
      <div className="doc-title">경 력 증 명 서</div>

      <table className="kv">
        <tbody>
          <tr><th>성명</th><td>{emp?.name || ""}</td></tr>
          <tr><th>주민등록번호</th><td>{emp?.ssn || emp?.resRegNo || ""}</td></tr>
          <tr><th>주소</th><td>{emp?.address || ""}</td></tr>
          <tr><th>회사명</th><td>{BIZ.name}</td></tr>
          <tr><th>사업자등록번호</th><td>{BIZ.bizNo}</td></tr>
          <tr><th>근무부서</th><td>{emp?.dept || ""}</td></tr>
          <tr><th>직위</th><td>{emp?.position || ""}</td></tr>
          <tr><th>담당업무</th><td /></tr>
          <tr>
            <th>근무연한</th>
            <td>
              {fmtDate(emp?.joinDate)} ~ {fmtDate(emp?.leaveDate) || "현재"} {span && ` ( ${span} )`}
            </td>
          </tr>
          <tr><th>발급용도</th><td /></tr>
        </tbody>
      </table>

      <p className="para center">위와 같이 경력을 증명합니다.</p>
      <div className="date-line">{todayK()}</div>

      <div className="issuer">
        <div className="issuer-text">
          <div className="company">{BIZ.name}</div>
          <div className="ceo">대표 {BIZ.ceo}</div>
        </div>
        <div className="seal-stamp">
          <span>한남주택관리</span>
        </div>
      </div>
    </div>
  );
}

/* ============ 템플릿: 퇴직증명서 ============ */
function RetireTemplate({ emp, BIZ }) {
  const span = emp?.joinDate && emp?.leaveDate ? calcSpan(emp.joinDate, emp.leaveDate) : "";
  return (
    <div className="doc">
      <div className="doc-title">퇴 직 증 명 서</div>

      <table className="kv">
        <tbody>
          <tr><th>성명</th><td>{emp?.name || ""}</td></tr>
          <tr><th>주민등록번호</th><td>{emp?.ssn || emp?.resRegNo || ""}</td></tr>
          <tr><th>주소</th><td>{emp?.address || ""}</td></tr>
          <tr><th>회사명</th><td>{BIZ.name}</td></tr>
          <tr><th>사업자등록번호</th><td>{BIZ.bizNo}</td></tr>
          <tr><th>부서명</th><td>{emp?.dept || ""}</td></tr>
          <tr><th>직위</th><td>{emp?.position || ""}</td></tr>
          <tr><th>입사일</th><td>{fmtDate(emp?.joinDate)}</td></tr>
          <tr><th>퇴사일</th><td>{fmtDate(emp?.leaveDate) || "____-__-__"}</td></tr>
          <tr><th>근속기간</th><td>{span || "___년 __개월 __일"}</td></tr>
          <tr><th>퇴직사유</th><td /></tr>
          <tr><th>발급용도</th><td /></tr>
        </tbody>
      </table>

      <p className="para center">위와 같이 경력을 증명합니다.</p>
      <div className="date-line">{todayK()}</div>
    </div>
  );
}
