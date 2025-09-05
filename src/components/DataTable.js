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
  searchableKeys,
  itemsPerPage = 15,
  sortKey: initialSortKey,
  sortOrder: initialSortOrder = "asc",
  enableExcel = false,
  excelFields = [],

  // 새로 추가: 좌측 커스텀 컨트롤(필터 등) 렌더 슬롯
  leftControls = null,

  // ⚠️ 아래는 엑셀 업로드에 필요 (해당 페이지에서 사용 안 하면 생략 가능)
  collectionName,
  idKey,
  idAliases = [],
  idResolver,
  onUploadComplete,
}) {
  const defaultSortKey = columns?.[0]?.key ?? "code";
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState(initialSortKey ?? defaultSortKey);
  const [sortOrder, setSortOrder] = useState(initialSortOrder);

  const EXCEL_PASSWORD = "20453948";
  const fileInputRef = useRef(null);
  const allowUploadRef = useRef(false);

  // ====== ✅ 기본값 자동 추론 (여기만 추가됨) ======
  const resolveIdKeyFromColumns = (cols) => {
    if (!Array.isArray(cols)) return undefined;
    // 1) isId 명시
    const byIsId = cols.find((c) => c?.isId);
    if (byIsId?.key) return byIsId.key;
    // 2) key에 code 포함
    const byKey = cols.find((c) =>
      String(c?.key ?? "").toLowerCase().includes("code")
    );
    if (byKey?.key) return byKey.key;
    // 3) 라벨에 "코드" 포함
    const byLabel = cols.find((c) =>
      String(c?.label ?? "").toLowerCase().includes("코드")
    );
    if (byLabel?.key) return byLabel.key;
    // 4) 최후의 기본값
    return "code";
  };

  const resolvedCollectionName = collectionName ?? "villas";
  const resolvedIdKey = idKey ?? resolveIdKeyFromColumns(columns);
  const resolvedIdAliases =
    (Array.isArray(idAliases) && idAliases.length > 0)
      ? idAliases
      : ["코드", "코드번호", "빌라코드", "ID", "id"];

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
    const copied = [...(data ?? [])];
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
      try { out.push(v.toLocaleString()); } catch {}
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(base)) out.push(base.slice(2));
    if (/^\d{2}-\d{2}-\d{2}$/.test(base)) {
      const [yy, mm, dd] = base.split("-");
      out.push(`20${yy}-${mm}-${dd}`);
    }
    return out;
  };

  const getSearchableStringsFromColumn = (row, col) => {
    if (typeof col.search === "function") return normalizeForSearch(col.search(row));
    if (col.key) {
      const direct = getByPath(row, col.key);
      const norm = normalizeForSearch(direct);
      if (norm.length) return norm;
    }
    if (typeof col.format === "function") {
      try {
        const formatted = col.format(getByPath(row, col.key), row);
        if (["string","number","boolean"].includes(typeof formatted)) {
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
        const rowStrings = Object.values(row ?? {})
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
  const totalPages = Math.ceil((filteredData.length || 0) / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  const handleSort = (key) => {
    if (!key) return;
    if (sortKey === key) setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortOrder("asc"); }
  };

  // ---------- (엑셀 관련 유틸: 필요 시 사용) ----------
  const normalizeAmount = (v) => {
    if (v === null || v === undefined) return "";
    const raw = String(v).trim();
    if (raw === "" || raw === "-") return "";
    const cleaned = raw.replace(/[^\d.-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === "-.") return "";
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
    if (typeof value === "object" && value?.seconds) return toYYMMDD(new Date(value.seconds * 1000));
    if (value instanceof Date) return toYYMMDD(value);
    if (typeof value === "number") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? "" : toYYMMDD(d);
    }
    const s = String(value).trim();
    if (s === "" || s === "-") return "";
    if (/^\d{8}$/.test(s)) return `${s.slice(2,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    if (/^\d{6}$/.test(s))  return `${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;
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

  const normalizeExcelFields = () => {
    if (Array.isArray(excelFields) && excelFields.length > 0) {
      return excelFields.map((f) =>
        typeof f === "string"
          ? { key: f, label: columns.find((c) => c.key === f)?.label || f }
          : { key: f.key, label: f.label || columns.find((c) => c.key === f.key)?.label || f.key }
      );
    }
    if (Array.isArray(columns) && columns.length > 0) {
      return columns.map((c) => ({ key: c.key, label: c.label || c.key }));
    }
    if (data && data.length > 0) {
      return Object.keys(data[0]).map((k) => ({ key: k, label: k }));
    }
    return [];
  };

  const safeDocId = (raw) => {
    if (raw == null) return "";
    let s = String(raw).trim();
    s = s.replace(/\//g, "∕");
    if (s.length > 1500) s = s.slice(0, 1500);
    return s;
  };

  const handleExcelDownload = () => {
    if (!askPassword()) return;
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

  const normalizeHeader = (s) =>
    String(s || "")
      .replace(/\ufeff/g, "")
      .replace(/\s+/g, "")
      .replace(/[(){}\[\]]/g, "")
      .toLowerCase()
      .trim();

  const buildKeyIndex = (rowObj) => {
    const idx = {};
    Object.keys(rowObj).forEach((k) => {
      const norm = normalizeHeader(k);
      idx[norm] = k;
    });
    return idx;
  };

  const lookupByKeyOrLabel = (rowObj, keyIndex, key, label) => {
    const tryKeyList = [key, (columns.find((c) => c.key === key)?.label || null), label]
      .filter(Boolean)
      .map((x) => normalizeHeader(x));

    for (const norm of tryKeyList) {
      if (norm && keyIndex[norm] !== undefined) {
        const realKey = keyIndex[norm];
        return rowObj[realKey];
      }
    }
    return undefined;
  };

  const getFromRow = (rowObj, keyIndex, key, label) => {
    if (rowObj[key] !== undefined) return rowObj[key];
    if (label && rowObj[label] !== undefined) return rowObj[label];
    const val = lookupByKeyOrLabel(rowObj, keyIndex, key, label);
    if (val !== undefined) return val;
    return undefined;
  };

  const resolveUploadId = (originalRow, keyIndex, fields) => {
    if (typeof idResolver === "function") {
      const v = idResolver(originalRow, keyIndex, fields);
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    if (resolvedIdKey) {
      const v = getFromRow(
        originalRow,
        keyIndex,
        resolvedIdKey,
        columns.find((c) => c.key === resolvedIdKey)?.label || resolvedIdKey
      );
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    for (const alias of resolvedIdAliases) {
      const v = getFromRow(originalRow, keyIndex, alias, alias);
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return undefined;
  };

  const openUploadDialog = () => {
    if (!enableExcel) return;
    // ✅ 페이지에서 안 넘겨줘도 기본값으로 동작
    if (!resolvedCollectionName || !resolvedIdKey) {
      alert("엑셀 업로드가 비활성화되었습니다.\n(기본값 추론 실패: 컬렉션/ID 키를 확인하세요)");
      return;
    }
    if (!askPassword()) return;
    allowUploadRef.current = true;
    fileInputRef.current?.click();
  };

  const handleExcelUpload = async (event) => {
    const inputEl = event.target;

    if (!resolvedCollectionName || !resolvedIdKey) {
      alert("업로드할 수 없습니다. collectionName, idKey 추론에 실패했습니다.");
      inputEl.value = "";
      return;
    }

    if (!allowUploadRef.current) {
      if (!askPassword()) {
        inputEl.value = "";
        return;
      }
    }
    allowUploadRef.current = false;

    if (!window.confirm(`[${resolvedCollectionName}] 컬렉션에 이 엑셀을 업로드할까요?\n(ID 키: ${resolvedIdKey})`)) {
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
    let replacedCount = 0;

    const fields = normalizeExcelFields();

    for (const originalRow of json) {
      const keyIndex = buildKeyIndex(originalRow);

      const idValue = resolveUploadId(originalRow, keyIndex, fields);
      if (!idValue) { skipped++; continue; }

      const originalId = String(idValue);
      const docId = safeDocId(originalId);
      if (!docId) { skipped++; continue; }
      if (docId !== originalId) replacedCount++;

      const rowToSave = {};
      for (const f of fields) {
        const { key } = f;
        const col = columns.find((c) => c.key === key);
        const labelForMatch = f.label || col?.label || key;

        let val = getFromRow(originalRow, keyIndex, key, labelForMatch);

        if (String(key).toLowerCase().endsWith("amount"))      val = normalizeAmount(val);
        else if (["date","start","end","apply","expire"].some(t => String(key).toLowerCase().includes(t))) {
          val = normalizeDateYYMMDD(val);
        } else if (typeof val === "string") val = val.trim();

        if (val !== undefined) rowToSave[key] = val;
      }

      await setDoc(doc(db, resolvedCollectionName, docId), rowToSave, { merge: true });
      updated++;
    }

    alert(
      `엑셀 업로드 완료 (컬렉션: ${resolvedCollectionName}, ID 키: ${resolvedIdKey})\n업데이트: ${updated}건, 스킵: ${skipped}건` +
      (replacedCount ? `\n(참고: '/' 포함 ID ${replacedCount}건은 '∕'로 치환됨)` : "")
    );
    onUploadComplete?.({ updated, skipped });
    inputEl.value = "";
  };

  return (
    <div className="data-table-wrapper">
      {/* 상단 컨트롤 바: 좌측(커스텀) / 우측(등록+검색) */}
      <div
        className="table-controls"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <div className="control-left-slot" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {leftControls}
        </div>

        <div className="control-right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                  key={col.key || col.label}
                  onClick={col.key ? () => handleSort(col.key) : undefined}
                  style={{ cursor: col.key ? "pointer" : "default" }}
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
                {columns.map((col) => {
                  const val = getByPath(row, col.key);
                  const content =
                    typeof col.render === "function"
                      ? col.render(row)
                      : (col.format ? col.format(val, row) : (val ?? "-"));
                  return (
                    <td key={col.key || col.label} style={{ whiteSpace: "nowrap", verticalAlign: "middle" }}>
                      {content}
                    </td>
                  );
                })}
                {(onEdit || onDelete) && (
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                      {onEdit && (
                        <button
                          className="icon-button"
                          onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                          title="수정"
                        >
                          ✏️
                        </button>
                      )}
                      {onDelete && (
                        <button
                          className="icon-button"
                          onClick={(e) => { e.stopPropagation(); onDelete(row); }}
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
                  colSpan={1 + columns.length + (onEdit || onDelete ? 1 : 0)}
                  style={{ textAlign: "center" }}
                >
                  표시할 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 하단: 엑셀 + 페이지네이션 */}
      <div className="table-footer">
        {enableExcel && (
          <div className="excel-btn-group">
            <button className="excel-btn" onClick={handleExcelDownload}>📤 엑셀 다운로드</button>
            <button className="excel-btn" onClick={openUploadDialog}>📥 엑셀 업로드</button>
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
          <button onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1}>◀</button>
          {(() => {
            const pageBlockSize = 5;
            const startPage = Math.floor((currentPage - 1) / pageBlockSize) * pageBlockSize + 1;
            const endPage = Math.min(startPage + pageBlockSize - 1, totalPages);
            const buttons = [];
            for (let p = startPage; p <= endPage; p++) {
              buttons.push(
                <button key={p} className={currentPage === p ? "active" : ""} onClick={() => setCurrentPage(p)}>
                  {p}
                </button>
              );
            }
            return buttons;
          })()}
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages || totalPages === 0}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
