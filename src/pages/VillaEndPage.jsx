// src/pages/VillaEndPage.jsx
import React, { useEffect, useState, useRef } from "react";
import { db } from "../firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import PageTitle from "../components/PageTitle";
import * as htmlToImage from "html-to-image";
import { jsPDF } from "jspdf";

import "./VillaEndPage.css";

/**
 * 🔧 전제
 * - 관리종료된 빌라는 Firestore의 "villas_end" 컬렉션에 저장되어 있다고 가정합니다.
 * - 각 문서는 기존 villas 문서를 그대로 복사한 구조(빌라 기본정보 + telco/elevator/... 필드 포함)라고 가정합니다.
 * - 아래 SECTION_DEFS의 path는 실제 villas 컬렉션 필드명과 동일하게 맞춰놓았습니다.
 */

// 간단 헬퍼
const s = (v) => (v == null || v === "" ? "" : String(v));
const fmt = (v) => (v == null || v === "" ? "—" : String(v));

/** ✅ 정화조 작업검토일 계산 (SepticPage와 동일 로직) */
function computeReviewDate(dateStr) {
  if (!dateStr) return "";
  const s = String(dateStr).trim();
  const m = s.match(/^(\d{2}|\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return "";

  const [, yStr, moStr, dStr] = m;
  let year = yStr.length === 2 ? 2000 + Number(yStr) : Number(yStr);
  const month = Number(moStr);
  const day = Number(dStr);

  const base = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(base)) return "";

  // +1년 -1일
  const next = new Date(
    Date.UTC(base.getUTCFullYear() + 1, base.getUTCMonth(), base.getUTCDate())
  );
  next.setUTCDate(next.getUTCDate() - 1);

  const outYearFull = next.getUTCFullYear();
  const outMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
  const outDay = String(next.getUTCDate()).padStart(2, "0");

  if (yStr.length === 2) {
    const yy = String(outYearFull).slice(-2);
    return `${yy}-${outMonth}-${outDay}`;
  }
  return `${outYearFull}-${outMonth}-${outDay}`;
}

/** 🔹 섹션 정의 (루트 필드 기준) */
const SECTION_DEFS = [
  {
    objKey: "basic",
    title: "기본 정보",
    isBasic: true,
    fields: [
      { label: "코드번호", path: ["code"] },
      { label: "빌라명", path: ["name"] },
      { label: "구", path: ["district"] },
      { label: "주소", path: ["address"] },
    ],
  },
  {
    objKey: "telco",
    title: "통신사",
    fields: [
      { label: "통신사", path: ["telco"] },
      { label: "금액", path: ["telcoAmount"] },
      { label: "명의", path: ["telcoName"] },
      { label: "명세서번호", path: ["telcoBillNo"] },
      { label: "회선수", path: ["telcoLineCount"] },
      { label: "수신방법", path: ["telcoReceiveMethod"] },
      { label: "약정만료", path: ["telcoContract"] },
      { label: "지원금", path: ["telcoSupport"] },
      { label: "비고", path: ["telcoNote"] },
    ],
  },
  {
    objKey: "elevator",
    title: "승강기",
    fields: [
      { label: "승강기", path: ["elevator"] },
      { label: "제조사", path: ["manufacturer"] },
      { label: "금액", path: ["elevatorAmount"] },
      { label: "제조번호", path: ["serialNumber"] },
      { label: "정기신청", path: ["regularApply"] },
      { label: "정기만료", path: ["regularExpire"] },
      { label: "보험사", path: ["insuranceCompany"] },
      { label: "계약일", path: ["contractStart"] },
      { label: "계약만기", path: ["contractEnd"] },
      { label: "비고", path: ["elevatorNote"] },
    ],
  },
  {
    objKey: "septic",
    title: "정화조",
    fields: [
      { label: "정화조", path: ["septic"] },
      { label: "창살제거", path: ["septicGrate"] },
      { label: "작업날짜", path: ["septicDate"] },
      {
        label: "작업검토",
        compute: (doc) => computeReviewDate(doc.septicDate),
      },
      { label: "금액", path: ["septicAmount"] },
      { label: "비고", path: ["septicNote"] },
    ],
  },
  {
    objKey: "fireSafety",
    title: "소방안전",
    fields: [
      { label: "소방안전", path: ["fireSafety"] },
      { label: "금액", path: ["fireSafetyAmount"] },
      { label: "안전관리자", path: ["fireSafetyManager"] },
      { label: "교육일자", path: ["fireSafetyTrainingDate"] },
      { label: "비고", path: ["fireSafetyNote"] },
    ],
  },
  {
    objKey: "electricSafety",
    title: "전기안전",
    fields: [
      { label: "전기안전", path: ["electricSafety"] },
      { label: "금액", path: ["electricSafetyAmount"] },
      { label: "비고", path: ["electricSafetyNote"] },
    ],
  },
  {
    objKey: "water",
    title: "상수도",
    fields: [
      { label: "상수도", path: ["water"] },
      { label: "전자수용가번호", path: ["waterNumber"] },
      { label: "명의", path: ["waterOwner"] },
      { label: "비고", path: ["waterNote"] },
    ],
  },
  {
    objKey: "publicElectric",
    title: "공용전기",
    fields: [
      { label: "공용전기", path: ["publicElectric"] },
      { label: "명의", path: ["publicElectricOwner"] },
      { label: "비고", path: ["publicElectricNote"] },
    ],
  },
  {
    objKey: "cleaning",
    title: "건물청소",
    fields: [
      { label: "건물청소", path: ["cleaning"] },
      { label: "주", path: ["cleaningWeek"] },
      { label: "금액", path: ["cleaningAmount"] },
      { label: "비고", path: ["cleaningNote"] },
    ],
  },
  {
    objKey: "cctv",
    title: "CCTV",
    fields: [
      { label: "CCTV", path: ["cctv"] },
      { label: "도메인", path: ["cctvDomain"] },
      { label: "아이디", path: ["cctvId"] },
      { label: "비밀번호", path: ["cctvPw"] },
      { label: "포트", path: ["cctvPort"] },
      { label: "최근확인일자", path: ["cctvLastCheck"] },
      { label: "비고", path: ["cctvNote"] },
    ],
  },
];

// ✅ 값 가져오기
function getValue(doc, section, field) {
  if (typeof field.compute === "function") {
    try {
      return fmt(field.compute(doc));
    } catch (e) {
      console.error("compute field error:", e);
      return "—";
    }
  }

  if (!field.path || field.path.length === 0) return "—";

  let cur = doc;
  for (const key of field.path) {
    if (!cur || typeof cur !== "object") return "—";
    cur = cur[key];
  }
  return fmt(cur);
}

// 🔍 검색용 텍스트 생성
function buildSearchText(villa) {
  const values = [];

  const collect = (v) => {
    if (v == null || v === "") return;
    const t = typeof v;
    if (t === "string" || t === "number") {
      values.push(String(v));
    } else if (Array.isArray(v)) {
      v.forEach(collect);
    } else if (t === "object") {
      Object.values(v).forEach(collect);
    }
  };

  collect(villa);
  return values.join(" ").toLowerCase();
}

export default function VillaEndPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // ✅ PDF 선택 모드 & 대상 빌라
  const [pdfMode, setPdfMode] = useState(false);
  const [pdfTargetVilla, setPdfTargetVilla] = useState(null);

  const selectedVilla = list.find((v) => v.id === selectedId) || null;

  const detailRef = useRef(null);      // 실제 상세 모달 DOM
  const pdfDetailRef = useRef(null);   // 숨김 PDF용 상세 DOM

  useEffect(() => {
    const fetchEnded = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "villas_end"), orderBy("code", "asc"));
        const snap = await getDocs(q);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setList(rows);
      } catch (err) {
        console.error("🔥 관리종료 목록 로딩 실패:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEnded();
  }, []);

  // 카드 클릭
  const handleCardClick = (id) => {
    const villa = list.find((v) => v.id === id);
    if (!villa) return;

    // ✅ PDF 선택 모드일 때: 상세보기 없이 PDF 저장
    if (pdfMode) {
      const ok = window.confirm("이 카드로 PDF를 저장할까요?");
      if (!ok) return;
      setPdfTargetVilla(villa); // 숨김 DOM 렌더 후 PDF 생성
      return;
    }

    // ✅ 일반 모드: 상세보기
    setSelectedId(id);
  };

  // ✅ PDF 저장 버튼: 선택 모드로 전환
  const handlePdfSaveClick = () => {
    if (!list.length) {
      alert("관리종료된 빌라가 없습니다.");
      return;
    }
    setPdfMode(true);
    alert("PDF로 저장할 카드를 선택해 주세요.");
  };

  // ✅ pdfTargetVilla 설정 시: 숨김 DOM 기반으로 PDF 생성
  useEffect(() => {
    if (!pdfTargetVilla || !pdfDetailRef.current) return;

    const run = async () => {
      const detailNode = pdfDetailRef.current;
      const bodyNode = detailNode.querySelector(".v-end-detail-body");

      // 상세 전체 내용이 잘리되지 않도록 스타일 풀어주기
      const prevDetailStyles = {
        maxHeight: detailNode.style.maxHeight,
        height: detailNode.style.height,
        overflow: detailNode.style.overflow,
        width: detailNode.style.width,
      };
      const prevBodyStyles = bodyNode
        ? {
            maxHeight: bodyNode.style.maxHeight,
            overflowY: bodyNode.style.overflowY,
          }
        : null;

      // 화면처럼 보이되 높이 제한 해제
      detailNode.style.maxHeight = "none";
      detailNode.style.height = "auto";
      detailNode.style.overflow = "visible";
      // 화면 기준 폭 비슷하게 (실제 렌더와 비슷한 비율)
      detailNode.style.width = "1024px";

      if (bodyNode) {
        bodyNode.style.maxHeight = "none";
        bodyNode.style.overflowY = "visible";
      }

      try {
        // 레이아웃 적용 대기
        await new Promise((resolve) => setTimeout(resolve, 200));

        const dataUrl = await htmlToImage.toPng(detailNode, {
          cacheBust: true,
          backgroundColor: "#ffffff",
        });

        const pdf = new jsPDF("p", "mm", "a4");
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        const imgProps = pdf.getImageProperties(dataUrl);
        const imgWidthPx = imgProps.width;
        const imgHeightPx = imgProps.height;

        // 📐 화면 느낌에 가깝게: 좌우 여백 확보 + 비율 유지
        const margin = 8; // mm
        const printableWidth = pdfWidth - margin * 2;
        const scale = printableWidth / imgWidthPx;
        const imgWidth = printableWidth;
        const imgHeight = imgHeightPx * scale;

        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(dataUrl, "PNG", margin, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        // 긴 내용은 여러 페이지로 분할
        while (heightLeft > 0) {
          position -= pdfHeight;
          pdf.addPage();
          pdf.addImage(dataUrl, "PNG", margin, position, imgWidth, imgHeight);
          heightLeft -= pdfHeight;
        }

        const safeCode = (pdfTargetVilla.code || "villa")
          .toString()
          .replace(/[^\w가-힣-]+/g, "_");
        const safeName = (pdfTargetVilla.name || "")
          .toString()
          .replace(/[^\w가-힣-]+/g, "_");

        pdf.save(`관리종료_${safeCode}_${safeName}.pdf`);
      } catch (err) {
        console.error("PDF 저장 중 오류:", err);
        alert("PDF 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        // 스타일 복원
        detailNode.style.maxHeight = prevDetailStyles.maxHeight || "";
        detailNode.style.height = prevDetailStyles.height || "";
        detailNode.style.overflow = prevDetailStyles.overflow || "";
        detailNode.style.width = prevDetailStyles.width || "";

        if (bodyNode && prevBodyStyles) {
          bodyNode.style.maxHeight = prevBodyStyles.maxHeight || "";
          bodyNode.style.overflowY = prevBodyStyles.overflowY || "";
        }

        setPdfTargetVilla(null);
        setPdfMode(false); // 한 번 저장 후 모드 종료
      }
    };

    run();
  }, [pdfTargetVilla]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  return (
    <div className="page-wrapper v-end">
      <PageTitle>관리종료</PageTitle>

      <div className="v-end-subheader">
        <div className="v-end-subheader-left">
          <div className="v-end-count">
            총 <strong>{list.length}</strong> 개의 관리종료 빌라
          </div>
          {pdfMode && (
            <div className="v-end-image-hint">
              <i className="ri-information-line" />
              PDF로 저장할 카드를 클릭해 주세요.
            </div>
          )}
        </div>

        <div className="v-end-actions">
          <button
            type="button"
            className="v-end-image-btn"
            onClick={handlePdfSaveClick}
          >
            <i className="ri-file-pdf-2-line" />
            <span>PDF 저장</span>
          </button>

          <div className="v-end-search-wrap">
            <i className="ri-search-line v-end-search-icon" />
            <input
              type="text"
              className="v-end-search-input"
              placeholder="관리종료 카드 내용 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="v-end-loading">목록을 불러오는 중입니다...</div>
      ) : list.length === 0 ? (
        <div className="v-end-empty">아직 관리종료 처리된 빌라가 없습니다.</div>
      ) : (
        <div className="v-end-grid">
          {list.map((villa) => {
            const haystack = buildSearchText(villa);
            const matched = normalizedSearch
              ? haystack.includes(normalizedSearch)
              : false;

            return (
              <button
                key={villa.id}
                type="button"
                className={`v-end-card ${
                  matched ? "v-end-card--highlight" : ""
                } ${pdfMode ? "v-end-card--capture-mode" : ""}`}
                onClick={() => handleCardClick(villa.id)}
              >
                <div className="v-end-card-bezel" />
                <div className="v-end-card-inner">
                  <div className="v-end-card-top">
                    <div className="v-end-card-name">
                      {s(villa.name) || "무제 빌라"}
                    </div>
                    <div className="v-end-card-district">
                      {s(villa.district) || "구 미지정"}
                    </div>
                  </div>

                  <div className="v-end-card-address">
                    {s(villa.address) || "주소 정보 없음"}
                  </div>

                  <div className="v-end-card-meta">
                    <span className="v-end-chip v-end-chip--primary">
                      코드번호: <strong>{s(villa.code) || "—"}</strong>
                    </span>

                    {villa.telco && (
                      <span className="v-end-chip">
                        통신사: <strong>{s(villa.telco)}</strong>
                      </span>
                    )}
                    {villa.elevator && (
                      <span className="v-end-chip">
                        승강기: <strong>{s(villa.elevator)}</strong>
                      </span>
                    )}
                  </div>

                  <div className="v-end-card-footer">
                    <span className="v-end-card-footer-label">
                      {pdfMode ? "PDF 대상 선택" : "상세 보기"}
                    </span>
                    <span className="v-end-arrow">⟶</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 🔍 상세 오버레이 (일반 모드에서만 사용) */}
      {selectedVilla && !pdfMode && (
        <div
          className="v-end-detail-backdrop"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="v-end-detail"
            onClick={(e) => e.stopPropagation()}
            ref={detailRef}
          >
            <header className="v-end-detail-header">
              <div className="v-end-detail-header-main">
                <div className="v-end-detail-tag-row">
                  <span className="v-end-detail-chip">관리종료 빌라</span>
                  {selectedVilla.code && (
                    <span className="v-end-detail-chip v-end-detail-chip--ghost">
                      코드번호: {s(selectedVilla.code)}
                    </span>
                  )}
                  {selectedVilla.district && (
                    <span className="v-end-detail-chip v-end-detail-chip--ghost">
                      {s(selectedVilla.district)}
                    </span>
                  )}
                </div>

                <div className="v-end-detail-title">
                  {s(selectedVilla.name) || "무제 빌라"}
                </div>
                <div className="v-end-detail-subtitle">
                  {s(selectedVilla.address) || "주소 정보 없음"}
                </div>
              </div>

              <button
                type="button"
                className="v-end-detail-close"
                onClick={() => setSelectedId(null)}
              >
                ✕
              </button>
            </header>

            <div className="v-end-detail-body">
              {SECTION_DEFS.map((section) => (
                <section
                  key={section.title}
                  className="v-end-detail-section"
                >
                  <h3 className="v-end-detail-section-title">
                    {section.title}
                  </h3>
                  <table className="v-end-detail-table">
                    <tbody>
                      {section.fields.map((field) => (
                        <tr key={field.label}>
                          <th>{field.label}</th>
                          <td>{getValue(selectedVilla, section, field)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ✅ PDF용 숨김 상세 DOM (사용자에겐 보이지 않음) */}
      {pdfTargetVilla && (
        <div className="v-end-detail-pdf-wrapper">
          <div
            className="v-end-detail"
            ref={pdfDetailRef}
            style={{
              maxHeight: "none",
              height: "auto",
              overflow: "visible",
              width: "1024px",
              boxShadow: "none",
            }}
          >
            <header className="v-end-detail-header">
              <div className="v-end-detail-header-main">
                <div className="v-end-detail-tag-row">
                  <span className="v-end-detail-chip">관리종료 빌라</span>
                  {pdfTargetVilla.code && (
                    <span className="v-end-detail-chip v-end-detail-chip--ghost">
                      코드번호: {s(pdfTargetVilla.code)}
                    </span>
                  )}
                  {pdfTargetVilla.district && (
                    <span className="v-end-detail-chip v-end-detail-chip--ghost">
                      {s(pdfTargetVilla.district)}
                    </span>
                  )}
                </div>

                <div className="v-end-detail-title">
                  {s(pdfTargetVilla.name) || "무제 빌라"}
                </div>
                <div className="v-end-detail-subtitle">
                  {s(pdfTargetVilla.address) || "주소 정보 없음"}
                </div>
              </div>
            </header>

            <div className="v-end-detail-body">
              {SECTION_DEFS.map((section) => (
                <section
                  key={section.title}
                  className="v-end-detail-section"
                >
                  <h3 className="v-end-detail-section-title">
                    {section.title}
                  </h3>
                  <table className="v-end-detail-table">
                    <tbody>
                      {section.fields.map((field) => (
                        <tr key={field.label}>
                          <th>{field.label}</th>
                          <td>{getValue(pdfTargetVilla, section, field)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
