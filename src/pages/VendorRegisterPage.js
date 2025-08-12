import React, { useState } from "react";

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

  const [vendorData, setVendorData] = useState(
    Object.fromEntries(categories.map((cat) => [cat, [""]]))
  );

  // 값 변경
  const handleChange = (category, index, value) => {
    const updated = [...vendorData[category]];
    updated[index] = value;
    setVendorData({ ...vendorData, [category]: updated });
  };

  // 항목별 행 추가
  const handleAdd = (category) => {
    setVendorData({
      ...vendorData,
      [category]: [...vendorData[category], ""],
    });
  };

  // 항목별 행 삭제
  const handleDelete = (category, index) => {
    const updated = vendorData[category].filter((_, i) => i !== index);
    setVendorData({
      ...vendorData,
      [category]: updated.length ? updated : [""], // 최소 1개 유지
    });
  };

  const handleSave = () => {
    console.log("✅ 저장된 거래처 목록:", vendorData);
    alert("저장되었습니다. (콘솔 출력)");
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-6">거래처등록</h2>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border text-sm text-center">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              {categories.map((cat) => (
                <th key={cat} className="border px-3 py-2 whitespace-nowrap">
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
            {/* 최대 행 길이 계산 */}
            {Array.from({
              length: Math.max(
                ...categories.map((cat) => vendorData[cat].length)
              ),
            }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {categories.map((cat) => {
                  const value = vendorData[cat][rowIndex] ?? "";
                  return (
                    <td key={cat} className="border px-2 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          value={value}
                          onChange={(e) =>
                            handleChange(cat, rowIndex, e.target.value)
                          }
                          className="w-full border rounded px-2 py-1 text-sm"
                          placeholder={cat}
                        />
                        {vendorData[cat].length > 1 && (
                          <button
                            onClick={() => handleDelete(cat, rowIndex)}
                            className="text-red-500 text-xs hover:underline"
                            title="삭제"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
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
