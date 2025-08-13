import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import { doc, setDoc } from "firebase/firestore";
import "./DataTable.css";

export default function DataTable({
  columns,
  data,
  onAdd,
  onEdit,
  onDelete,
  searchableKeys = [],
  itemsPerPage = 15,
  sortKey: initialSortKey,
  sortOrder: initialSortOrder = "asc",
  enableExcel = false,
  excelFields = [],
}) {
  const defaultSortKey = "code";
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState(initialSortKey ?? defaultSortKey);
  const [sortOrder, setSortOrder] = useState(initialSortOrder);

  const sortedData = useMemo(() => {
    const copied = [...data];
    if (sortKey) {
      copied.sort((a, b) => {
        const valA = a[sortKey] ?? "";
        const valB = b[sortKey] ?? "";
        return valA.toString().localeCompare(valB.toString()) * (sortOrder === "asc" ? 1 : -1);
      });
    }
    return copied;
  }, [data, sortKey, sortOrder]);

  const filteredData = useMemo(() => {
    if (!searchText) return sortedData;
    return sortedData.filter((row) =>
      searchableKeys.some((key) =>
        (row[key] || "").toString().toLowerCase().includes(searchText.toLowerCase())
      )
    );
  }, [sortedData, searchText, searchableKeys]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  // 📤 엑셀 다운로드
  const handleExcelDownload = () => {
    const confirmDownload = window.confirm("엑셀 파일을 다운로드하시겠습니까?");
    if (!confirmDownload) return;

    const exportData = data.map((row) => {
      const entry = {};
      excelFields.forEach((field) => {
        entry[field] = row[field] ?? "";
      });
      return entry;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "빌라정보");
    XLSX.writeFile(wb, "빌라목록.xlsx");
  };

  // 📥 엑셀 업로드
  const handleExcelUpload = async (event) => {
    const confirmUpload = window.confirm("이 엑셀 파일을 업로드하여 데이터를 변경하시겠습니까?");
    if (!confirmUpload) return;

    const file = event.target.files[0];
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    for (const item of json) {
      if (item.code) {
        await setDoc(doc(db, "villas", item.code), item, { merge: true });
      }
    }

    alert("엑셀 업로드 완료! 페이지를 새로고침 해주세요.");
  };

  return (
    <div className="data-table-wrapper">
      {/* 상단: 등록 버튼 + 검색 */}
      <div className="table-controls">
        <div className="control-left">
          {onAdd && (
            <button className="register-button" onClick={onAdd}>
              ➕ 등록
            </button>
          )}
          <input
            type="text"
            className="search-input"
            placeholder="검색어 입력"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {/* 테이블 */}
      <div className="scroll-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>번호</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{ cursor: "pointer" }}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="sort-arrow">{sortOrder === "asc" ? " ▲" : " ▼"}</span>
                  )}
                </th>
              ))}
              {(onEdit || onDelete) && <th>관리</th>}
            </tr>
          </thead>
          <tbody>
            {currentData.map((row, i) => (
              <tr key={row.id || i}>
                <td>{startIndex + i + 1}</td>
                {columns.map((col) => (
                  <td key={col.key}>
                    {col.format ? col.format(row[col.key]) : row[col.key] ?? "-"}
                  </td>
                ))}
                {(onEdit || onDelete) && (
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                      {onEdit && (
                        <button className="icon-button" onClick={() => onEdit(row)} title="수정">✏️</button>
                      )}
                      {onDelete && (
                        <button className="icon-button" onClick={() => onDelete(row)} title="삭제">🗑️</button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {currentData.length === 0 && (
              <tr>
                <td colSpan={columns.length + (onEdit || onDelete ? 2 : 1)} style={{ textAlign: "center" }}>
                  표시할 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ✅ 하단: 엑셀 버튼(좌) + 페이지네이션(우) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "15px",
          flexWrap: "wrap",
        }}
      >
        {/* 📤 엑셀 버튼 좌측 */}
        {enableExcel && (
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={handleExcelDownload}>📤 엑셀 다운로드</button>
            <label style={{ cursor: "pointer" }}>
              📥 엑셀 업로드
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleExcelUpload}
                style={{ display: "none" }}
              />
            </label>
          </div>
        )}

        {/* ▶ 페이지네이션 우측 */}
        <div className="pagination">
          <button onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1}>
            ◀
          </button>
          {Array.from({ length: totalPages }, (_, idx) => (
            <button
              key={idx}
              className={currentPage === idx + 1 ? "active" : ""}
              onClick={() => setCurrentPage(idx + 1)}
            >
              {idx + 1}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
