import React, { useEffect, useState } from "react";
import { db } from "../firebase"; // Firebase 초기화 파일
import { getDoc, doc, setDoc } from "firebase/firestore";
import PageTitle from "../components/PageTitle";

export default function VendorRegisterPage() {
  const categories = [
    "통신사",
    "승강기",
    "정화조",
    "소방안전",
    "전기안전",
    "건물청소",
    "CCTV",
  ];

  // ✅ 항목별 데이터 상태
  const [vendorData, setVendorData] = useState(
    Object.fromEntries(categories.map((cat) => [cat, [""]]))
  );

  // ✅ Firestore에서 데이터 불러오기
  useEffect(() => {
    const fetchData = async () => {
      const newData = {};
      for (const category of categories) {
        const snap = await getDoc(doc(db, "vendors", category));
        if (snap.exists()) {
          newData[category] = snap.data().items || [""];
        } else {
          newData[category] = [""];
        }
      }
      setVendorData(newData);
    };

    fetchData();
  }, []);

  // ✅ 값 변경
  const handleChange = (category, index, value) => {
    const updated = [...vendorData[category]];
    updated[index] = value;
    setVendorData({ ...vendorData, [category]: updated });
  };

  // ✅ 항목별 행 추가
  const handleAdd = (category) => {
    setVendorData({
      ...vendorData,
      [category]: [...vendorData[category], ""],
    });
  };

  // ✅ 항목별 행 삭제
  const handleDelete = (category, index) => {
    const updated = vendorData[category].filter((_, i) => i !== index);
    setVendorData({
      ...vendorData,
      [category]: updated.length ? updated : [""], // 최소 1개 유지
    });
  };

  // ✅ Firebase에 저장
const handleSave = async () => {
  try {
    for (const category in vendorData) {
      const cleanedItems = vendorData[category]
        .map((item) => item.trim())
        .filter((item) => item !== ""); // ❗빈 문자열 제거

      await setDoc(doc(db, "vendors", category), {
        items: cleanedItems.length ? cleanedItems : [""], // 최소 1개는 유지
      });
    }
    alert("✅ Firebase에 저장 완료!");
  } catch (error) {
    console.error("Firebase 저장 오류:", error);
    alert("❌ 저장 실패");
  }
};

  return (
    <div className="page-wrapper">
      <PageTitle>거래처명 등록</PageTitle>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border text-sm text-center">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              {categories.map((cat) => (
                <th key={cat} className="border px-3 py-2 whitespace-nowrap align-top">
                  <div className="flex justify-center items-center gap-2">
                    {cat}
                    <button
                      onClick={() => handleAdd(cat)}
                      className="text-xs px-2 py-0.5 border rounded hover:bg-gray-200"
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
              {categories.map((cat) => (
                <td key={cat} className="border px-2 py-2 align-top">
                  <div className="flex flex-col gap-1">
                    {vendorData[cat].map((value, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <input
                          value={value}
                          onChange={(e) => handleChange(cat, idx, e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm"
                          placeholder={cat}
                        />
                        {vendorData[cat].length > 1 && (
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

      <div className="flex justify-end mt-8">
        <button
          onClick={handleSave}
          className="bg-purple-600 text-white px-6 py-2 rounded hover:bg-purple-700"
        >
          저장
        </button>
      </div>
    </div>
  );
}
