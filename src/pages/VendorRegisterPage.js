// src/pages/VendorRegisterPage.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { db } from "../firebase"; // Firebase 초기화 파일
import { getDoc, doc, setDoc } from "firebase/firestore";
import PageTitle from "../components/PageTitle";

/* -----------------------------------------
   재사용 가능한 편집 패널 (컬렉션/카테고리만 바꿔 재사용)
   - categories가 undefined여도 안전하게 동작하도록 방어 처리
----------------------------------------- */
function EditableCategoryTable({
  collectionName,                 // 예: "vendors", "serviceSettings"
  categories = [],                // ✅ 기본값: []
  onReadyChange,                  // (ready:boolean, saveFn?: ()=>Promise<void>)
}) {
  const safeCategories = useMemo(
    () => (Array.isArray(categories) ? categories : []),
    [categories]
  );

  const [data, setData] = useState(() =>
    Object.fromEntries(safeCategories.map((cat) => [cat, [""]]))
  );
  const [loading, setLoading] = useState(true);

  // 최신 onReadyChange를 ref에 보관 (의존성 루프 방지)
  const onReadyRef = useRef(onReadyChange);
  useEffect(() => {
    onReadyRef.current = onReadyChange;
  }, [onReadyChange]);

  // categories가 바뀌면 초기 state 재구성 (로딩은 아래 fetch 이펙트에서만 켠다)
  useEffect(() => {
    setData(Object.fromEntries(safeCategories.map((cat) => [cat, [""]])));
  }, [safeCategories]);

  // 원격 데이터 로드 (collectionName/safeCategories 변경 시)
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
          // 준비 완료 신호 (최초 바인딩)
          onReadyRef.current?.(true);
        }
      }
    })();

    return () => {
      mounted = false;
    };
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
    const ok = window.confirm(
      `삭제하시겠어요?\n${target ? `- 항목: ${target}` : ""}`
    );
    if (!ok) return;

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
      const cleanedItems = raw
        .map((item) => (item || "").trim())
        .filter((item) => item !== "");
      await setDoc(doc(db, collectionName, category), {
        items: cleanedItems.length ? cleanedItems : [""],
      });
    }
  };

  // 저장 함수 바인딩 신호 (로딩 끝나고 data가 준비될 때)
  useEffect(() => {
    if (!loading) {
      onReadyRef.current?.(true, save);
    }
  }, [loading, data]); // onReadyChange는 ref로 처리

  if (loading) {
    return (
      <div className="w-full min-h-[30vh] flex items-center justify-center text-gray-500">
        불러오는 중...
      </div>
    );
  }

  // 카테고리가 비어있으면 안내
  if (!safeCategories.length) {
    return (
      <div className="w-full min-h-[30vh] flex items-center justify-center text-gray-400">
        설정할 항목이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] border text-sm text-center">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            {safeCategories.map((cat) => (
              <th
                key={cat}
                className="border px-3 py-2 whitespace-nowrap align-top"
              >
                <div className="flex justify-center items-center gap-2">
                  {cat}
                  <button
                    onClick={() => handleAdd(cat)}
                    className="text-xs px-2 py-0.5 border rounded hover:bg-gray-200"
                    title="행 추가"
                  >
                    +
                  </button>
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
                        <button
                          onClick={() => handleDelete(cat, idx)}
                          className="text-red-500 text-xs hover:underline"
                          title="삭제"
                        >
                          ×
                        </button>
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
   메인 페이지
----------------------------------------- */
export default function VendorRegisterPage() {
  // 'villa' | 'service' | 'accounting' | null
  const [activePanel, setActivePanel] = useState(null);

  // 저장 버튼 제어
  const [showSave, setShowSave] = useState(false);
  const [saveFn, setSaveFn] = useState(null);

  // 패널이 바뀌면 저장 버튼/함수 초기화
  useEffect(() => {
    setShowSave(false);
    setSaveFn(null);
  }, [activePanel]);

  // 각 패널 카테고리
  const villaCategories = useMemo(
    () => ["통신사", "승강기", "정화조", "소방안전", "전기안전", "건물청소", "CCTV"],
    []
  );
  const serviceCategories = useMemo(() => ["거래처", "입금자"], []);

  // ✅ 콜백 안정화 (자식 의존성 루프 방지)
  const handlePanelReady = useCallback((ready, save) => {
    setShowSave(Boolean(ready && save));
    setSaveFn(() => (typeof save === "function" ? save : null));
  }, []);

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
          key="panel-villa"               // ✅ 패널 전환 시 강제 리마운트
          collectionName="vendors"
          categories={villaCategories}
          onReadyChange={handlePanelReady}
        />
      );
    }
    if (activePanel === "service") {
      return (
        <EditableCategoryTable
          key="panel-service"            // ✅ 패널 전환 시 강제 리마운트
          collectionName="serviceSettings"
          categories={serviceCategories}
          onReadyChange={handlePanelReady}
        />
      );
    }
    if (activePanel === "accounting") {
      return (
        <div className="w-full min-h-[30vh] flex items-center justify-center text-gray-500">
          관리비회계 설정은 추후 항목 정의 후 연동 예정입니다.
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
      {/* 상단 헤더: 좌측 버튼들, 우측 저장 버튼 */}
      <div className="flex items-center justify-between gap-4 mb-4">
        {/* 좌측: 제목 + 버튼들(좌측 정렬) */}
        <div className="flex items-center gap-3">
          <PageTitle>기초설정</PageTitle>
          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={() => setActivePanel("villa")}
              className={`px-3 py-2 rounded border ${
                activePanel === "villa"
                  ? "bg-purple-600 text-white border-purple-600"
                  : "border-purple-300 text-purple-700 hover:bg-purple-50"
              }`}
            >
              {/* 라벨: 빌라정보 설정 */}
              빌라정보 설정
            </button>
            <button
              onClick={() => setActivePanel("service")}
              className={`px-3 py-2 rounded border ${
                activePanel === "service"
                  ? "bg-purple-600 text-white border-purple-600"
                  : "border-purple-300 text-purple-700 hover:bg-purple-50"
              }`}
            >
              부가서비스 설정
            </button>
            <button
              onClick={() => setActivePanel("accounting")}
              className={`px-3 py-2 rounded border ${
                activePanel === "accounting"
                  ? "bg-purple-600 text-white border-purple-600"
                  : "border-purple-300 text-purple-700 hover:bg-purple-50"
              }`}
            >
              관리비회계 설정
            </button>
          </div>
        </div>

        {/* 우측: 저장 버튼(편집 가능한 패널일 때만 노출) */}
        {showSave && (
          <button
            onClick={onClickSave}
            className="bg-purple-600 text-white px-5 py-2 rounded-md hover:bg-purple-700"
          >
            저장
          </button>
        )}
      </div>

      {/* 선택된 패널 내용 */}
      {renderPanel()}
    </div>
  );
}
