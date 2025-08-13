// src/components/DataTable.js
import React, { useState, useMemo, useRef } from "react";
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
  searchableKeys, // 넘어오지 않으면 모든 컬럼 + row 전체를 검색
  itemsPerPage = 15,
  sortKey: initialSortKey,
  sortOrder: initialSortOrder = "asc",
  enableExcel = false,
  excelFields = [], // 문자열 키 배열 또는 {label, key} 배열 지원
}) {
  const defaultSortKey = "code";
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState(initialSortKey ?? defaultSortKey);
  const [sortOrder, setSortOrder] = useState(initialSortOrder);

  const EXCEL_PASSWORD = "20453948";
  const fileInputRef = useRef(null);
  const allowUploadRef = useRef(false);

  const askPassword = () => {
    const input = window.prompt("엑셀 작업 비밀번호를 입력하세요");
    if (input === null) return false;
    if (input !== EXCEL_PASSWORD) {
      alert("비밀번호가 틀렸습니다.");
      return false;
    }
    return true;
  };

  // ---------- 정렬 ----------
  const sortedData = useMemo(() => {
    const copied = [...data];
    if (sortKey) {
      copied.sort((a, b) => {
        const valA = a?.[sortKey] ?? "";
        const valB = b?.[sortKey] ?? "";
        return (
          valA.toString().localeCompare(valB.toString()) *
          (sortOrder === "asc" ? 1 : -1)
        );
      });
    }
    return copied;
  }, [data, sortKey, sortOrder]);

  // ---------- 안전 접근 & 검색 ----------
  const getByPath = (obj, path) => {
    if (!path) return undefined;
    return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  };

  const normalizeForSearch = (v) => {
    const out = [];
    if (v === null || v === undefined) return out;
    const base =
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : "";
    if (base) out.push(base);
    if (typeof v === "number" && Number.isFinite(v)) {
      try {
        out.push(v.toLocaleString());
      } catch {}
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(base)) out.push(base.slice(2));
    if (/^\d{2}-\d{2}-\d{2}$/.test(base)) {
      const [yy, mm, dd] = base.split("-");
      out.push(`20${yy}-${mm}-${dd}`);
    }
    return out;
  };

  const getSearchableStringsFromColumn = (row, col) => {
    if (typeof col.search === "function") {
      return normalizeForSearch(col.search(row));
    }
    if (col.key) {
      const direct = getByPath(row, col.key);
      const norm = normalizeForSearch(direct);
      if (norm.length) return norm;
    }
    if (typeof col.format === "function") {
      try {
        const formatted = col.format(getByPath(row, col.key), row);
        if (
          typeof formatted === "string" ||
          typeof formatted === "number" ||
          typeof formatted === "boolean"
        ) {
          return normalizeForSearch(formatted);
        }
      } catch {}
    }
    return [];
  };

  const activeColumns =
    Array.isArray(searchableKeys) && searchableKeys.length > 0
      ? columns.filter((c) => searchableKeys.includes(c.key))
      : columns;

  // ---------- 필터링 ----------
  const filteredData = useMemo(() => {
    if (!searchText) return sortedData;
    const needle = searchText.toLowerCase();

    return sortedData.filter((row) => {
      const colStrings = activeColumns
        .flatMap((col) => getSearchableStringsFromColumn(row, col))
        .map((s) => s.toLowerCase());

      let haystack = colStrings;
      if (!Array.isArray(searchableKeys) || searchableKeys.length === 0) {
        const rowStrings = Object.values(row)
          .flatMap((v) => normalizeForSearch(v))
          .map((s) => s.toLowerCase());
        const set = new Set(haystack);
        rowStrings.forEach((s) => set.add(s));
        haystack = Array.from(set);
      }
      return haystack.some((str) => str.includes(needle));
    });
  }, [sortedData, searchText, activeColumns, searchableKeys]);

  // ---------- 페이지네이션 ----------
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

  // ---------- 금액/날짜 정규화 ----------
  const normalizeAmount = (v) => {
    if (v === null || v === undefined) return "";
    const raw = String(v).trim();
    if (raw === "" || raw === "-") return "";
    const cleaned = raw.replace(/[^\d.-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === "-.")
      return "";
    const n = Number(cleaned);
    return isNaN(n) ? "" : n;
  };

  const toYYMMDD = (d) => {
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  const normalizeDateYYMMDD = (value) => {
    if (!value && value !== 0) return "";
    if (typeof value === "object" && value?.seconds) {
      return toYYMMDD(new Date(value.seconds * 1000));
    }
    if (value instanceof Date) return toYYMMDD(value);
    if (typeof value === "number") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? "" : toYYMMDD(d);
    }
    const s = String(value).trim();
    if (s === "" || s === "-") return "";
    if (/^\d{8}$/.test(s)) {
      const yy = s.slice(2, 4),
        mm = s.slice(4, 6),
        dd = s.slice(6, 8);
      return `${yy}-${mm}-${dd}`;
    }
    if (/^\d{6}$/.test(s)) {
      const yy = s.slice(0, 2),
        mm = s.slice(2, 4),
        dd = s.slice(4, 6);
      return `${yy}-${mm}-${dd}`;
    }
    const parts = s.replace(/[./]/g, "-").split("-");
    if (parts.length === 3) {
      let [y, m, d] = parts.map((x) => x.padStart(2, "0"));
      if (y.length === 4) y = y.slice(2);
      return `${y}-${m}-${d}`;
    }
    const tryDate = new Date(s);
    return isNaN(tryDate.getTime()) ? s : toYYMMDD(tryDate);
  };

  const isDateField = (key) => {
    const k = String(key).toLowerCase();
    return (
      k.endsWith("date") ||
      k.includes("contract") ||
      k.includes("apply") ||
      k.includes("expire") ||
      k.endsWith("start") ||
      k.endsWith("end")
    );
  };

  const isAmountField = (key) => String(key).toLowerCase().endsWith("amount");

  // ---------- 엑셀 필드 정규화 유틸 ----------
  // excelFields: ["code","name"] 또는 [{label:"코드번호", key:"code"}, ...]
  const normalizeExcelFields = () => {
    if (Array.isArray(excelFields) && excelFields.length > 0) {
      return excelFields.map((f) =>
        typeof f === "string"
          ? {
              key: f,
              label: columns.find((c) => c.key === f)?.label || f,
            }
          : {
              key: f.key,
              label:
                f.label || columns.find((c) => c.key === f.key)?.label || f.key,
            }
      );
    }
    // excelFields가 비어있으면 columns로 대체
    if (Array.isArray(columns) && columns.length > 0) {
      return columns.map((c) => ({
        key: c.key,
        label: c.label || c.key,
      }));
    }
    // columns도 없으면 data[0] 키로 추정
    if (data && data.length > 0) {
      return Object.keys(data[0]).map((k) => ({ key: k, label: k }));
    }
    return [];
  };

  // ---------- 엑셀 (다운로드) - AoA 방식 ----------
  const handleExcelDownload = () => {
    if (!askPassword()) return;
    if (!window.confirm("엑셀 파일을 다운로드하시겠습니까?")) return;

    const fields = normalizeExcelFields();
    const headerLabels = fields.map((f) => f.label);
    const headerKeys = fields.map((f) => f.key);

    const rows = (data || []).map((row) =>
      headerKeys.map((k) => {
        let v = row[k] ?? "";
        if (isAmountField(k)) v = normalizeAmount(v);
        else if (isDateField(k)) v = normalizeDateYYMMDD(v);
        return v ?? "";
      })
    );

    const aoa = [headerLabels, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // 컬럼 너비 자동 추정
    const colWidths = headerLabels.map((label, idx) => {
      const maxLen = Math.max(
        String(label ?? "").length,
        ...rows.map((r) => String(r[idx] ?? "").length)
      );
      return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
    });
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "목록");
    XLSX.writeFile(wb, "목록.xlsx");
  };

  // ---------- 엑셀 (업로드) : 헤더 정규화/매칭 강화 ----------
  const buildKeyIndex = (rowObj) => {
    const idx = {};
    Object.keys(rowObj).forEach((k) => {
      const norm = String(k).toLowerCase().trim();
      idx[norm] = k; // 원래 키 보존
    });
    return idx;
  };

  const getFromRow = (rowObj, keyIndex, key, label) => {
    if (rowObj[key] !== undefined) return rowObj[key];

    const normKey = String(key).toLowerCase().trim();
    if (keyIndex[normKey] !== undefined) {
      const realKey = keyIndex[normKey];
      return rowObj[realKey];
    }

    if (label) {
      if (rowObj[label] !== undefined) return rowObj[label];
      const normLabel = String(label).toLowerCase().trim();
      if (keyIndex[normLabel] !== undefined) {
        const realLabelKey = keyIndex[normLabel];
        return rowObj[realLabelKey];
      }
    }

    return undefined;
  };

  const openUploadDialog = () => {
    if (!askPassword()) return;
    allowUploadRef.current = true;
    fileInputRef.current?.click();
  };

  const handleExcelUpload = async (event) => {
    const inputEl = event.target;
    if (!allowUploadRef.current) {
      if (!askPassword()) {
        inputEl.value = "";
        return;
      }
    }
    allowUploadRef.current = false;

    if (!window.confirm("이 엑셀 파일을 업로드하여 데이터를 변경하시겠습니까?")) {
      inputEl.value = "";
      return;
    }

    const file = inputEl.files?.[0];
    if (!file) return;

    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    let updated = 0;
    let skipped = 0;

    const fields = normalizeExcelFields(); // [{key, label}]
    for (const originalRow of json) {
      const keyIndex = buildKeyIndex(originalRow);

      const code =
        getFromRow(originalRow, keyIndex, "code", "코드번호") ??
        originalRow.code ??
        originalRow["코드번호"];

      if (!code) {
        skipped++;
        continue;
      }

      const rowToSave = {};

      for (const f of fields) {
        const { key, label } = f;
        const col = columns.find((c) => c.key === key);
        const labelForMatch = label || col?.label || key;

        let val = getFromRow(originalRow, keyIndex, key, labelForMatch);

        if (isAmountField(key)) {
          val = normalizeAmount(val);
        } else if (isDateField(key)) {
          val = normalizeDateYYMMDD(val);
        } else if (typeof val === "string") {
          val = val.trim();
        }

        if (val !== undefined) rowToSave[key] = val;
      }

      await setDoc(doc(db, "villas", String(code)), rowToSave, { merge: true });
      updated++;
    }

    alert(`엑셀 업로드 완료!\n업데이트: ${updated}건, 스킵: ${skipped}건`);
    inputEl.value = "";
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
                    <span className="sort-arrow">
                      {sortOrder === "asc" ? " ▲" : " ▼"}
                    </span>
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
                {columns.map((col) => {
                  const val = getByPath(row, col.key);
                  return (
                    <td key={col.key}>
                      {col.format ? col.format(val, row) : val ?? "-"}
                    </td>
                  );
                })}
                {(onEdit || onDelete) && (
                  <td>
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        justifyContent: "center",
                      }}
                    >
                      {onEdit && (
                        <button
                          className="icon-button"
                          onClick={() => onEdit(row)}
                          title="수정"
                        >
                          ✏️
                        </button>
                      )}
                      {onDelete && (
                        <button
                          className="icon-button"
                          onClick={() => onDelete(row)}
                          title="삭제"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {currentData.length === 0 && (
              <tr>
                <td
                  colSpan={
                    1 + columns.length + (onEdit || onDelete ? 1 : 0) // 번호 + 컬럼들 + 관리(옵션)
                  }
                  style={{ textAlign: "center" }}
                >
                  표시할 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 하단: 엑셀 버튼 + 페이지네이션 */}
      <div className="table-footer">
        {enableExcel && (
          <div className="excel-btn-group">
            <button className="excel-btn" onClick={handleExcelDownload}>
              📤 엑셀 다운로드
            </button>
            <button className="excel-btn" onClick={openUploadDialog}>
              📥 엑셀 업로드
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls"
              onChange={handleExcelUpload}
              style={{ display: "none" }}
            />
          </div>
        )}

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
            onClick={() =>
              setCurrentPage((p) => Math.min(p + 1, totalPages))
            }
            disabled={currentPage === totalPages || totalPages === 0}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
