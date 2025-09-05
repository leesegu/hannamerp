import React, { useState, useRef, useEffect } from "react";
import { db } from "../firebase";
import {
  getDoc,
  getDocs,
  query,
  where,
  doc,
  collection,
  addDoc,
  setDoc,
} from "firebase/firestore";

export default function VillaRegisterModal({ onClose, onSaved, editItem }) {
  // ✅ 버튼 스타일을 전역에 주입 (이미 전역 CSS에 있으면 아래 useEffect는 무시해도 OK)
  useEffect(() => {
    const styleId = "vrm-btn-styles";
    if (!document.getElementById(styleId)) {
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = `
        .save-btn, .close-btn { font-size: 14px; padding: 10px 20px; border-radius: 6px; border: none; cursor: pointer; font-weight: 600; }
        .save-btn { background-color: #7A5FFF; color: white; border: 2px solid transparent; transition: all 0.2s ease; }
        .save-btn:hover { background-color: #9B7DFF; border: 2px solid #BFAEFF; box-shadow: 0 0 0 3px rgba(122, 95, 255, 0.3); }
        .close-btn { background-color: #ccc; color: black; border: 2px solid transparent; transition: all 0.2s ease; }
        .close-btn:hover { background-color: #e0e0e0; border: 2px solid #aaa; box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1); }
      `;
      document.head.appendChild(s);
    }
  }, []);

  const [form, setForm] = useState({
    code: "",
    name: "",
    district: "", // ✅ 구 필드 추가
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
    "code", "name", "district", "address", "telco", "elevator", "septic",
    "fireSafety", "electricSafety", "water", "publicElectric",
    "cleaning", "cctv"
  ];

  const fieldLabels = {
    code: "코드번호",
    name: "빌라명",
    district: "구", // ✅ 레이블 추가
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
    "district", // ✅ 드롭다운에 추가
    "telco", "elevator", "septic",
    "fireSafety", "electricSafety", "cleaning", "cctv"
  ];

  const firebaseKeys = {
    telco: "통신사",
    elevator: "승강기",
    septic: "정화조",
    fireSafety: "소방안전",
    electricSafety: "전기안전",
    cleaning: "건물청소",
    cctv: "CCTV",
  };

  const [dropdownOptions, setDropdownOptions] = useState({
    district: ["대덕구", "동구", "서구", "유성구", "중구"], // ✅ 고정 목록
  });

  const inputRefs = useRef([]);

  useEffect(() => {
    if (editItem) {
      setForm((prev) => ({ ...prev, ...editItem }));
    }
  }, [editItem]);

  // ✅ 드롭다운 항목 로딩 (vendors에서 가져오는 필드만)
  useEffect(() => {
    const fetchDropdownData = async () => {
      const options = { district: dropdownOptions.district }; // 구는 고정

      for (const key of dropdownFields) {
        if (key === "district") continue; // 구는 스킵

        try {
          const snap = await getDoc(doc(db, "vendors", firebaseKeys[key]));
          if (snap.exists()) {
            const items = snap.data().items;
            options[key] = Array.isArray(items)
              ? items.filter((item) => String(item).trim() !== "")
              : [];
          } else {
            options[key] = [];
          }
        } catch (error) {
          console.error(`${key} 항목 로드 실패`, error);
          options[key] = [];
        }
      }

      setDropdownOptions(options);
    };

    fetchDropdownData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      alert("코드번호와 빌라명은 필수 항목입니다.");
      return;
    }

    try {
      const q = query(collection(db, "villas"), where("code", "==", form.code));
      const snap = await getDocs(q);

      if (
        (!editItem && !snap.empty) ||
        (editItem && !snap.empty && snap.docs[0].id !== editItem.id)
      ) {
        alert("❌ 해당 코드번호는 이미 등록되어 있습니다.");
        return;
      }

      let savedItem;

      if (editItem?.id) {
        await setDoc(doc(db, "villas", editItem.id), form);
        savedItem = { id: editItem.id, ...form };
      } else {
        const docRef = await addDoc(collection(db, "villas"), form);
        savedItem = { id: docRef.id, ...form };
      }

      alert("✅ 저장되었습니다.");
      onSaved(savedItem);
      onClose();
    } catch (error) {
      console.error("🔥 저장 실패:", error);
      alert("❌ 저장에 실패했습니다.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg w-[900px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-6">
          {editItem ? "빌라 정보 수정" : "신규 빌라 등록"}
        </h3>

        <div className="grid grid-cols-3 gap-x-6 gap-y-8 text-sm">
          {inputOrder.map((key, idx) => {
            const label = fieldLabels[key];
            const isSelect = dropdownFields.includes(key);
            const options = dropdownOptions[key] || [];

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
                    <option value="">선택 안 함</option>
                    {options.map((option, i) => (
                      <option key={i} value={option}>
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

        {/* ✅ 버튼 순서: 저장 → 닫기 / 디자인: save-btn, close-btn */}
        <div className="flex justify-end gap-2 mt-10">
          <button onClick={handleSave} className="save-btn">
            저장
          </button>
          <button onClick={onClose} className="close-btn">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
