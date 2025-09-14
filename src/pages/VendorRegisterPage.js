// src/pages/VendorRegisterPage.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { db } from "../firebase";
import { getDoc, doc, setDoc } from "firebase/firestore";
import PageTitle from "../components/PageTitle";

/* 재사용 가능한 편집 테이블 */
function EditableCategoryTable({ collectionName, categories = [], onReadyChange }) {
  const safeCategories = useMemo(() => (Array.isArray(categories) ? categories : []), [categories]);
  const [data, setData] = useState(() => Object.fromEntries(safeCategories.map((cat) => [cat, [""]])));
  const [loading, setLoading] = useState(true);

  const onReadyRef = useRef(onReadyChange);
  useEffect(() => { onReadyRef.current = onReadyChange; }, [onReadyChange]);

  useEffect(() => {
    setData(Object.fromEntries(safeCategories.map((cat) => [cat, [""]])));
  }, [safeCategories]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const newData = {};
        for (const category of safeCategories) {
          const snap = await getDoc(doc(db, collectionName, category));
          if (snap.exists()) {
            const arr = snap.data()?.items;
            newData[category] = Array.isArray(arr) && arr.length ? arr : [""];
          } else {
            newData[category] = [""];
          }
        }
        if (!mounted) return;
        setData(newData);
      } finally {
        if (mounted) {
          setLoading(false);
          onReadyRef.current?.(true);
        }
      }
    })();
    return () => { mounted = false; };
  }, [collectionName, safeCategories]);

  const handleChange = (category, index, value) => {
    setData((prev) => {
      const next = { ...prev };
      const list = Array.isArray(next[category]) ? [...next[category]] : [""];
      list[index] = value;
      next[category] = list;
      return next;
    });
  };

  const handleAdd = (category) => {
    setData((prev) => {
      const next = { ...prev };
      const list = Array.isArray(next[category]) ? next[category] : [""];
      next[category] = [...list, ""];
      return next;
    });
  };

  const handleDelete = (category, index) => {
    const target = (data?.[category]?.[index] ?? "").trim();
    if (!window.confirm(`삭제하시겠어요?\n${target ? `- 항목: ${target}` : ""}`)) return;
    setData((prev) => {
      const next = { ...prev };
      const list = (prev?.[category] || []).filter((_, i) => i !== index);
      next[category] = list.length ? list : [""];
      return next;
    });
  };

  const save = async () => {
    for (const category of safeCategories) {
      const raw = data?.[category] || [""];
      const cleanedItems = raw.map((item) => (item || "").trim()).filter((item) => item !== "");
      await setDoc(doc(db, collectionName, category), {
        items: cleanedItems.length ? cleanedItems : [""],
      });
    }
  };

  useEffect(() => {
    if (!loading) onReadyRef.current?.(true, save);
  }, [loading, data]);

  if (loading) {
    return <div className="w-full min-h-[30vh] flex items-center justify-center text-gray-500">불러오는 중...</div>;
  }
  if (!safeCategories.length) {
    return <div className="w-full min-h-[30vh] flex items-center justify-center text-gray-400">설정할 항목이 없습니다.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] border text-sm text-center">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            {safeCategories.map((cat) => (
              <th key={cat} className="border px-3 py-2 whitespace-nowrap align-top">
                <div className="flex justify-center items-center gap-2">
                  {cat}
                  <button onClick={() => handleAdd(cat)} className="text-xs px-2 py-0.5 border rounded hover:bg-gray-200" title="행 추가">+</button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {safeCategories.map((cat) => (
              <td key={cat} className="border px-2 py-2 align-top">
                <div className="flex flex-col gap-1">
                  {(data?.[cat] || [""]).map((value, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <input
                        value={value}
                        onChange={(e) => handleChange(cat, idx, e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm"
                        placeholder={cat}
                      />
                      {(data?.[cat]?.length || 0) > 1 && (
                        <button onClick={() => handleDelete(cat, idx)} className="text-red-500 text-xs hover:underline" title="삭제">×</button>
                      )}
                    </div>
                  ))}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* -----------------------------------------
   내부 페이지 임베드 (사이드바/헤더 숨김)
   - 같은 오리진의 라우트를 iframe으로 불러온 뒤,
     onLoad 시 스타일을 주입해 사이드바/외곽 UI를 숨깁니다.
----------------------------------------- */
function EmbeddedInternalPage({ src, title = "내장 페이지", minHeight = "70vh" }) {
  const iframeRef = useRef(null);

  const injectCleanStyles = useCallback(() => {
    const ifr = iframeRef.current;
    if (!ifr) return;
    try {
      const doc = ifr.contentDocument || ifr.contentWindow?.document;
      if (!doc) return;
      // 스타일 중복 주입 방지
      if (doc.getElementById("embed-clean-style")) return;

      const style = doc.createElement("style");
      style.id = "embed-clean-style";
      style.textContent = `
        /* ===== 임베드 클린 모드 ===== */
        /* 좌측/우측 사이드바 및 글로벌 헤더 유력 후보들 숨김 */
        [class*="sidebar" i],
        [id*="sidebar" i],
        aside,
        nav[role="navigation"],
        header[class*="header" i],
        [data-role="sidebar"] { display: none !important; }

        /* 레이아웃 여백/패딩 초기화 */
        body, #root { margin: 0 !important; padding: 0 !important; }
        main, [class*="content" i], [id*="content" i] {
          margin: 0 !important;
          padding: 16px !important;       /* 내용 가독성 보장 */
          width: 100% !important;
          max-width: 100% !important;
        }

        /* 흔히 쓰는 그리드/컨테이너 폭 확장 */
        .container, .container-fluid, .wrap, .page-wrapper {
          max-width: 100% !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          margin: 0 !important;
          border: 0 !important;
          box-shadow: none !important;
        }

        /* 화면 높이 꽉 채우기 */
        html, body {
          height: 100%;
          overflow: auto !important;
          background: #fff !important;
        }
      `;
      doc.head.appendChild(style);

      // 다이나믹 마운트되는 사이드바에 대비: MutationObserver로 1회 더 정리
      const mo = new MutationObserver(() => {
        // 다시 한 번 스타일이 유지되도록 보장
        if (!doc.getElementById("embed-clean-style")) {
          doc.head.appendChild(style.cloneNode(true));
        }
      });
      mo.observe(doc.documentElement, { childList: true, subtree: true });
      // iframe 안쪽에서 네비게이션이 바뀌더라도 observer는 살아있음
    } catch (e) {
      // 동일 오리진이 아닐 경우 접근 불가할 수 있음
      // 이 경우 내부 라우트에 ?embed=1 등을 붙여 조건부 렌더링하도록 차선책 사용 가능
      console.warn("Embed style injection failed:", e);
    }
  }, []);

  return (
    <div className="w-full">
      <iframe
        ref={iframeRef}
        title={title}
        src={src.includes("embed=") ? src : `${src}${src.includes("?") ? "&" : "?"}embed=1`}
        className="w-full rounded border"
        style={{ minHeight }}
        onLoad={injectCleanStyles}
      />
    </div>
  );
}

/* -----------------------------------------
   메인 페이지
----------------------------------------- */
export default function VendorRegisterPage() {
  // 'villa' | 'service' | 'acct' | null
  const [activePanel, setActivePanel] = useState(null);

  // 저장 버튼 제어
  const [showSave, setShowSave] = useState(false);
  const [saveFn, setSaveFn] = useState(null);

  useEffect(() => {
    // 회계설정(acct) 패널은 외부 페이지 임베드이므로 저장 버튼 숨김
    setShowSave(activePanel === "villa" || activePanel === "service");
    if (activePanel !== "villa" && activePanel !== "service") setSaveFn(null);
  }, [activePanel]);

  const villaCategories = useMemo(
    () => ["통신사", "승강기", "정화조", "소방안전", "전기안전", "건물청소", "CCTV"],
    []
  );
  const serviceCategories = useMemo(() => ["거래처", "입금자"], []);

  const handlePanelReady = useCallback((ready, save) => {
    if (activePanel === "villa" || activePanel === "service") {
      setShowSave(Boolean(ready && save));
      setSaveFn(() => (typeof save === "function" ? save : null));
    }
  }, [activePanel]);

  const onClickSave = async () => {
    if (!saveFn) return;
    try {
      await saveFn();
      alert("✅ 저장이 완료되었습니다!");
    } catch (e) {
      console.error(e);
      alert("❌ 저장 실패");
    }
  };

  const renderPanel = () => {
    if (activePanel === "villa") {
      return (
        <EditableCategoryTable
          key="panel-villa"
          collectionName="vendors"
          categories={villaCategories}
          onReadyChange={handlePanelReady}
        />
      );
    }
    if (activePanel === "service") {
      return (
        <EditableCategoryTable
          key="panel-service"
          collectionName="serviceSettings"
          categories={serviceCategories}
          onReadyChange={handlePanelReady}
        />
      );
    }
    if (activePanel === "acct") {
      // ✅ 버튼 아래 영역에 회계설정 페이지를 임베드 (사이드바/헤더는 숨김 주입)
      return (
        <div className="mt-2">
          <EmbeddedInternalPage
            title="관리비회계설정"
            src={"/main?go=기초등록&sub=관리비회계설정"}
            minHeight="78vh"
          />
        </div>
      );
    }
    // 초기 화면
    return (
      <div className="w-full min-h-[50vh] flex items-center justify-center text-gray-400">
        좌측 상단 버튼을 눌러 설정을 시작하세요.
      </div>
    );
  };

  return (
    <div className="page-wrapper">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <PageTitle>기초설정</PageTitle>
          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={() => setActivePanel("villa")}
              className={`px-3 py-2 rounded border ${
                activePanel === "villa" ? "bg-purple-600 text-white border-purple-600" : "border-purple-300 text-purple-700 hover:bg-purple-50"
              }`}
            >
              빌라정보 설정
            </button>
            <button
              onClick={() => setActivePanel("service")}
              className={`px-3 py-2 rounded border ${
                activePanel === "service" ? "bg-purple-600 text-white border-purple-600" : "border-purple-300 text-purple-700 hover:bg-purple-50"
              }`}
            >
              부가서비스 설정
            </button>
            {/* ✅ 관리비회계 설정: 페이지로 이동하지 않고, 버튼 아래에 임베드 */}
            <button
              onClick={() => setActivePanel("acct")}
              className={`px-3 py-2 rounded border ${
                activePanel === "acct" ? "bg-purple-600 text-white border-purple-600" : "border-purple-300 text-purple-700 hover:bg-purple-50"
              }`}
            >
              관리비회계 설정
            </button>
          </div>
        </div>

        {/* 우측: 저장 버튼(편집 가능한 패널일 때만) */}
        {showSave && (
          <button onClick={onClickSave} className="bg-purple-600 text-white px-5 py-2 rounded-md hover:bg-purple-700">
            저장
          </button>
        )}
      </div>

      {/* 선택된 패널 내용: 버튼 아래 표시 */}
      {renderPanel()}
    </div>
  );
}
