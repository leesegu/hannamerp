// src/pages/VillaEndPage.jsx
import React, { useEffect, useState, useRef } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  doc,
} from "firebase/firestore";
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

  // ✅ 체크된 카드들
  const [selectedIds, setSelectedIds] = useState([]);

  // ✅ PDF 대상 카드들 (숨김 DOM 렌더용)
  const [pdfTargets, setPdfTargets] = useState([]);

  const selectedVilla = list.find((v) => v.id === selectedId) || null;

  const detailRef = useRef(null); // 실제 상세 모달 DOM
  const pdfDetailRef = useRef(null); // 숨김 PDF용 전체 래퍼 DOM

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

  // ✅ 카드 삭제 처리 (선택된 것들)
  const handleDeleteSelected = async () => {
    if (!selectedIds.length) {
      alert("삭제할 카드를 먼저 선택해 주세요.");
      return;
    }

    const targets = list.filter((v) => selectedIds.includes(v.id));
    if (!targets.length) {
      alert("선택된 카드가 목록에 없습니다.");
      return;
    }

    const ok = window.confirm(
      `${targets.length}개의 관리종료 카드를 삭제하시겠습니까?\n(삭제 시 되돌릴 수 없습니다.)`
    );
    if (!ok) return;

    try {
      await Promise.all(
        targets.map((villa) => deleteDoc(doc(db, "villas_end", villa.id)))
      );
      setList((prev) => prev.filter((v) => !selectedIds.includes(v.id)));
      setSelectedIds([]);
      if (selectedVilla && selectedIds.includes(selectedVilla.id)) {
        setSelectedId(null);
      }
      alert("선택한 관리종료 카드가 삭제되었습니다.");
    } catch (err) {
      console.error("관리종료 카드 삭제 실패:", err);
      alert("삭제 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
  };

  // 카드 클릭 → 상세 보기
  const handleCardClick = (id) => {
    const villa = list.find((v) => v.id === id);
    if (!villa) return;
    setSelectedId(id);
  };

  // 체크박스 토글
  const handleToggleSelect = (id, checked) => {
    setSelectedIds((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      }
      return prev.filter((x) => x !== id);
    });
  };

  // ✅ PDF 저장 버튼: 선택된 카드들로 PDF 생성
  const handlePdfSaveClick = () => {
    if (!selectedIds.length) {
      alert("PDF로 저장할 카드를 먼저 선택해 주세요.");
      return;
    }
    const targets = list.filter((v) => selectedIds.includes(v.id));
    if (!targets.length) {
      alert("선택된 카드가 목록에 없습니다.");
      return;
    }

    const ok = window.confirm(
      `${targets.length}개의 관리종료 카드를 PDF로 저장할까요?`
    );
    if (!ok) return;

    // ✅ 선택된 카드들을 PDF용 숨김 DOM에 렌더하기 위해 상태에 세팅
    setPdfTargets(targets);
  };

  /**
   * ✅ pdfTargets 변경 시: 숨김 DOM 기반 PDF 생성
   *  - 한 빌라당 2페이지
   *    - 1페이지: 기본정보~정화조
   *    - 2페이지: 소방안전~CCTV
   *  - 관리종료/코드번호/구 제외, 빌라명/주소 + 나머지 상세 내용 포함
   *  - 여백: 상/하/좌/우 10mm 유지
   */
  useEffect(() => {
    if (!pdfTargets.length || !pdfDetailRef.current) return;

    const run = async () => {
      const wrapper = pdfDetailRef.current;

      // 숨김 DOM 내부의 각 페이지(빌라 1개당 2개) 선택
      const nodes = Array.from(
        wrapper.querySelectorAll(".v-end-detail-pdf-card")
      );
      if (!nodes.length) {
        setPdfTargets([]);
        return;
      }

      try {
        const pdf = new jsPDF("p", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const margin = 10; // 사방 여백
        const usableWidth = pageWidth - margin * 2;
        const usableHeight = pageHeight - margin * 2;

        let isFirstPage = true;

        for (const node of nodes) {
          const dataUrl = await htmlToImage.toPng(node, {
            cacheBust: true,
            backgroundColor: "#ffffff",
          });

          const imgProps = pdf.getImageProperties(dataUrl);
          const imgWidthPx = imgProps.width;
          const imgHeightPx = imgProps.height;

          // 폭/높이 모두 고려해서 A4 내부(여백 포함) 최대 크기
          const scale = Math.min(
            usableWidth / imgWidthPx,
            usableHeight / imgHeightPx
          );
          const imgWidthMm = imgWidthPx * scale;
          const imgHeightMm = imgHeightPx * scale;

          if (!isFirstPage) {
            pdf.addPage();
          }

          const x = (pageWidth - imgWidthMm) / 2;
          const y = (pageHeight - imgHeightMm) / 2;

          pdf.addImage(dataUrl, "PNG", x, y, imgWidthMm, imgHeightMm);

          isFirstPage = false;
        }

        const first = pdfTargets[0];
        const safeCode = (first.code || "villa")
          .toString()
          .replace(/[^\w가-힣-]+/g, "_");
        const safeName = (first.name || "")
          .toString()
          .replace(/[^\w가-힣-]+/g, "_");

        let filename;
        if (pdfTargets.length === 1) {
          filename = `관리종료_${safeCode}_${safeName}.pdf`;
        } else {
          filename = `관리종료_${safeCode}_${safeName}_외${
            pdfTargets.length - 1
          }개.pdf`;
        }

        pdf.save(filename);
      } catch (err) {
        console.error("PDF 저장 중 오류:", err);
        alert("PDF 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        // ✅ 완료 후 숨김 DOM 제거
        setPdfTargets([]);
      }
    };

    run();
  }, [pdfTargets]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  return (
    <div className="page-wrapper v-end">
      <PageTitle>관리종료</PageTitle>

      <div className="v-end-subheader">
        <div className="v-end-subheader-left">
          <div className="v-end-count">
            총 <strong>{list.length}</strong> 개의 관리종료 빌라
            {selectedIds.length > 0 && (
              <span className="v-end-count-selected">
                &nbsp; / 선택: <strong>{selectedIds.length}</strong> 개
              </span>
            )}
          </div>
        </div>

        <div className="v-end-actions">
          {/* PDF 저장 버튼 */}
          <button
            type="button"
            className="v-end-image-btn"
            onClick={handlePdfSaveClick}
          >
            <i className="ri-file-pdf-2-line" />
            <span>PDF 저장</span>
          </button>

          {/* 삭제 버튼 */}
          <button
            type="button"
            className="v-end-delete-btn"
            onClick={handleDeleteSelected}
          >
            <i className="ri-delete-bin-5-line" />
            <span>삭제</span>
          </button>

          {/* 검색창 */}
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
            const checked = selectedIds.includes(villa.id);

            return (
              <button
                key={villa.id}
                type="button"
                className={`v-end-card ${
                  matched ? "v-end-card--highlight" : ""
                }`}
                onClick={() => handleCardClick(villa.id)}
              >
                {/* ✅ 카드 상단 중앙 체크박스 */}
                <label
                  className="v-end-card-select"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      handleToggleSelect(villa.id, e.target.checked)
                    }
                  />
                </label>

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
                    <span className="v-end-card-footer-label">상세 보기</span>
                    <span className="v-end-arrow">⟶</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 🔍 상세 오버레이 (화면용, 기존 그대로 유지) */}
      {selectedVilla && (
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
      {pdfTargets.length > 0 && (
        <div className="v-end-detail-pdf-wrapper">
          <div ref={pdfDetailRef} style={{ width: "1024px" }}>
            {pdfTargets.map((villa) => {
              // 페이지 분할용 섹션 키
              const PAGE1_KEYS = ["basic", "telco", "elevator", "septic"];
              const PAGE2_KEYS = [
                "fireSafety",
                "electricSafety",
                "water",
                "publicElectric",
                "cleaning",
                "cctv",
              ];

              const page1Sections = SECTION_DEFS.filter((sec) =>
                PAGE1_KEYS.includes(sec.objKey)
              );
              const page2Sections = SECTION_DEFS.filter((sec) =>
                PAGE2_KEYS.includes(sec.objKey)
              );

              // 기본정보에서 코드/구 제외
              const filterFieldsForPdf = (section) => {
                if (section.objKey === "basic") {
                  return section.fields.filter(
                    (field) =>
                      field.label !== "코드번호" && field.label !== "구"
                  );
                }
                return section.fields;
              };

              return (
                <React.Fragment key={villa.id}>
                  {/* 🔹 1페이지: 기본정보~정화조 */}
                  <div className="v-end-detail-pdf-card">
                    <header className="v-end-detail-header">
                      <div className="v-end-detail-header-main">
                        <div className="v-end-detail-title">
                          {s(villa.name) || "무제 빌라"}
                        </div>
                        <div className="v-end-detail-subtitle">
                          {s(villa.address) || "주소 정보 없음"}
                        </div>
                      </div>
                    </header>

                    <div
                      className="v-end-detail-body"
                      style={{ overflowY: "visible" }}
                    >
                      {page1Sections.map((section) => {
                        const fieldsForPdf = filterFieldsForPdf(section);
                        if (!fieldsForPdf.length) return null;
                        return (
                          <section
                            key={section.title}
                            className="v-end-detail-section"
                          >
                            <h3 className="v-end-detail-section-title">
                              {section.title}
                            </h3>
                            <table className="v-end-detail-table">
                              <tbody>
                                {fieldsForPdf.map((field) => (
                                  <tr key={field.label}>
                                    <th>{field.label}</th>
                                    <td>{getValue(villa, section, field)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </section>
                        );
                      })}
                    </div>
                  </div>

                  {/* 🔹 2페이지: 소방안전~CCTV */}
                  <div className="v-end-detail-pdf-card">
                    <header className="v-end-detail-header">
                      <div className="v-end-detail-header-main">
                        <div className="v-end-detail-title">
                          {s(villa.name) || "무제 빌라"}
                        </div>
                        <div className="v-end-detail-subtitle">
                          {s(villa.address) || "주소 정보 없음"}
                        </div>
                      </div>
                    </header>

                    <div
                      className="v-end-detail-body"
                      style={{ overflowY: "visible" }}
                    >
                      {page2Sections.map((section) => {
                        const fieldsForPdf = filterFieldsForPdf(section);
                        if (!fieldsForPdf.length) return null;
                        return (
                          <section
                            key={section.title}
                            className="v-end-detail-section"
                          >
                            <h3 className="v-end-detail-section-title">
                              {section.title}
                            </h3>
                            <table className="v-end-detail-table">
                              <tbody>
                                {fieldsForPdf.map((field) => (
                                  <tr key={field.label}>
                                    <th>{field.label}</th>
                                    <td>{getValue(villa, section, field)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </section>
                        );
                      })}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
