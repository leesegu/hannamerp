import React, { useState, useRef } from "react";

export default function VillaRegisterModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    code: "",
    name: "",
    address: "",
    telco: "",
    elevator: "",
    septic: "",
    fireSafety: "",
    electricSafety: "",
    water: "",
    publicElectric: "",
    cleaning: "",
    cctv: "",
  });

  const inputOrder = [
    "code", "name", "address", "telco", "elevator", "septic",
    "fireSafety", "electricSafety", "water", "publicElectric",
    "cleaning", "cctv"
  ];

  const fieldLabels = {
    code: "코드번호",
    name: "빌라명",
    address: "주소",
    telco: "통신사",
    elevator: "승강기",
    septic: "정화조",
    fireSafety: "소방안전",
    electricSafety: "전기안전",
    water: "상수도",
    publicElectric: "공용전기",
    cleaning: "건물청소",
    cctv: "CCTV",
  };

  const dropdownFields = [
    "telco", "elevator", "septic",
    "fireSafety", "electricSafety", "cleaning", "cctv"
  ];

  const dropdownOptions = {
    telco: ["KT", "LGU+", "SKB"],
    elevator: ["없음", "설치", "점검필요"],
    septic: ["정상", "정기점검", "이상"],
    fireSafety: ["2024-11", "2025-07", "점검필요"],
    electricSafety: ["2025-01", "2025-03", "이상"],
    cleaning: ["직영", "외주"],
    cctv: ["없음", "2대", "4대", "8대"],
  };

  const inputRefs = useRef([]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Enter") {
      e.preventDefault();
      focusNext(index);
    }
  };

  const handleSelectChange = (e, index) => {
    handleChange(e);
    focusNext(index);
  };

  const focusNext = (index) => {
    const next = inputRefs.current[index + 1];
    if (next) next.focus();
  };

  const handleSave = () => {
    if (!form.code || !form.name) {
      alert("코드번호와 빌라명은 필수 항목입니다.");
      return;
    }
    onSaved(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg w-[900px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-6">신규 빌라 등록</h3>

        <div className="grid grid-cols-3 gap-x-6 gap-y-8 text-sm">
          {inputOrder.map((key, idx) => {
            const label = fieldLabels[key];
            const isSelect = dropdownFields.includes(key);

            return (
              <div key={key} className="flex flex-col py-2">
                <label className="block mb-1 font-medium text-gray-700">{label}</label>

                {isSelect ? (
                  <select
                    name={key}
                    value={form[key]}
                    onChange={(e) => handleSelectChange(e, idx)}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    className={`border p-2.5 rounded focus:outline-purple-500 ${
                      form[key] === "" ? "text-gray-400" : "text-gray-700"
                    }`}
                  >
                    <option value="" disabled hidden className="text-gray-400">
                      선택
                    </option>
                    {(dropdownOptions[key] || []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name={key}
                    value={form[key]}
                    onChange={handleChange}
                    onKeyDown={(e) => handleKeyDown(e, idx)}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    className="border p-2.5 rounded focus:outline-purple-500"
                    placeholder={label}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 mt-10">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded text-gray-600"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-purple-600 text-white rounded"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
