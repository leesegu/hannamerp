import React, { useState, useMemo } from "react";
import "./DataTable.css";

export default function DataTable({
  columns,
  data,
  onAdd,
  onEdit,
  onDelete,
  searchableKeys = [],
  itemsPerPage = 10,
}) {
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc"); // or "desc"

  // 🔁 정렬 처리
  const sortedData = useMemo(() => {
    const copied = [...data];
    if (sortKey) {
      copied.sort((a, b) => {
        const valA = a[sortKey] ?? "";
        const valB = b[sortKey] ?? "";
        const aStr = valA.toString().toLowerCase();
        const bStr = valB.toString().toLowerCase();
        if (aStr < bStr) return sortOrder === "asc" ? -1 : 1;
        if (aStr > bStr) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }
    return copied;
  }, [data, sortKey, sortOrder]);

  // 🔍 검색 필터링
  const filteredData = useMemo(() => {
    return sortedData.filter((row) =>
      searchableKeys.some((key) =>
        (row[key] || "").toString().toLowerCase().includes(searchText.toLowerCase())
      )
    );
  }, [sortedData, searchText, searchableKeys]);

  // 📄 페이징 계산
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  // 🔼 정렬 토글 핸들러
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  return (
    <div className="data-table-wrapper">
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

      {/* 📋 테이블 */}
      <div className="scroll-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>번호</th>
              {columns.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)} style={{ cursor: "pointer" }}>
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
              <tr key={i}>
                <td>{startIndex + i + 1}</td>
                {columns.map((col) => (
                  <td key={col.key}>{row[col.key]}</td>
                ))}
                {(onEdit || onDelete) && (
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                      {onEdit && (
                        <button className="icon-button" onClick={() => onEdit(row)} title="수정">
                          ✏️
                        </button>
                      )}
                      {onDelete && (
                        <button className="icon-button" onClick={() => onDelete(row)} title="삭제">
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ⏬ 하단 페이지네이션 */}
      <div className="pagination">
        <button
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          disabled={currentPage === 1}
        >
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
  );
}
