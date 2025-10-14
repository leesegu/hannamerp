// src/components/DataTable.js
import React, { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import { doc, setDoc, addDoc, collection } from "firebase/firestore";
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

  // 좌/우 컨트롤
  leftControls = null,
  rightControls = null,

  // 등록 버튼
  addButtonLabel = "등록",
  addButtonIcon = "➕",

  // 엑셀 업로드 관련
  collectionName,
  idKey,
  idAliases = [],
  idResolver,
  onUploadComplete,

  // 포커스
  focusId,
  rowIdKey = "id",

  // ✅ ID 없이도 업로드(append) 허용
  appendWithoutId = false,
}) {
  const defaultSortKey = columns?.[0]?.key ?? "code";
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState(initialSortKey ?? defaultSortKey);
  const [sortOrder, setSortOrder] = useState(initialSortOrder);

  const EXCEL_PASSWORD = "20453948";
  const fileInputRef = useRef(null);
  const allowUploadRef = useRef(false);

  const tableContainerRef = useRef(null);
  const rowRefs = useRef({});

  // ====== 기본값 자동 추론 ======
  const resolveIdKeyFromColumns = (cols) => {
    if (!Array.isArray(cols)) return undefined;
    const byIsId = cols.find((c) => c?.isId);
    if (byIsId?.key) return byIsId.key;
    const byKey = cols.find((c) => String(c?.key ?? "").toLowerCase().includes("code"));
    if (byKey?.key) return byKey.key;
    const byLabel = cols.find((c) => String(c?.label ?? "").toLowerCase().includes("코드"));
    if (byLabel?.key) return byLabel.key;
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
    if (v == null) return out;

    const base =
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : "";

    if (base) out.push(base);

    // 숫자 타입: "15000" + "15,000" 모두 색인
    if (typeof v === "number" && Number.isFinite(v)) {
      try { out.push(v.toLocaleString()); } catch {}
    }

    // ✅ 문자열이지만 금액/숫자 형태에 콤마가 포함된 경우: 콤마 제거 버전도 색인 (예: "15,000" -> "15000")
    if (typeof v === "string" && /[0-9]/.test(v)) {
      const stripped = v.replace(/[,\s]/g, "");
      if (stripped !== v) out.push(stripped);
    }

    // 날짜 변형 지원
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

  const columnKeys = Array.isArray(columns) ? columns.map(c => c.key).filter(Boolean) : [];
  const activeColumns =
    Array.isArray(searchableKeys) && searchableKeys.length > 0
      ? columns.filter((c) => searchableKeys.includes(c.key))
      : columns;

  // ✅ 컬럼 외의 가상키(search_* 등)도 검색 가능하게 처리
  const extraSearchKeys = useMemo(() => {
    if (!Array.isArray(searchableKeys) || searchableKeys.length === 0) return [];
    const set = new Set(columnKeys);
    return searchableKeys.filter(k => typeof k === "string" && !set.has(k));
  }, [searchableKeys, columnKeys]);

  // ---------- 필터링 ----------
  const filteredData = useMemo(() => {
    if (!searchText) return sortedData;

    // ✅ 입력 검색어의 변형(원문 + 콤마/공백 제거) 모두 사용
    const needleRaw = searchText.toLowerCase();
    const needleNoComma = needleRaw.replace(/[,\s]/g, "");
    const needles = needleNoComma && needleNoComma !== needleRaw
      ? [needleRaw, needleNoComma]
      : [needleRaw];

    return sortedData.filter((row) => {
      // 1) 컬럼 기반 색인
      const colStrings = activeColumns
        .flatMap((col) => getSearchableStringsFromColumn(row, col))
        .map((s) => s.toLowerCase());

      // 2) 가상키(search_total_raw, search_elec_raw, search_money 등) 색인
      const extraStrings = extraSearchKeys
        .flatMap((k) => normalizeForSearch(getByPath(row, k)))
        .map((s) => s.toLowerCase());

      let haystack = [...colStrings, ...extraStrings];

      // 3) searchableKeys 미지정 시: 행 전체도 보조 색인(기존 동작 유지)
      if (!Array.isArray(searchableKeys) || searchableKeys.length === 0) {
        const rowStrings = Object.values(row ?? {})
          .flatMap((v) => normalizeForSearch(v))
          .map((s) => s.toLowerCase());
        const set = new Set(haystack);
        rowStrings.forEach((s) => set.add(s));
        haystack = Array.from(set);
      }

      // ✅ needles 중 하나라도 포함되면 매칭
      return haystack.some((str) => needles.some((n) => str.includes(n)));
    });
  }, [sortedData, searchText, activeColumns, searchableKeys, extraSearchKeys]);

  // ---------- 페이지네이션 ----------
  const totalPages = Math.ceil((filteredData.length || 0) / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  const handleSort = (key) => {
    if (!key) return;
    if (sortKey === key) setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortOrder("asc"); }
  };

  // ---------- 엑셀 유틸 ----------
  const normalizeAmount = (v) => {
    if (v == null) return "";
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

  // ✅ 엑셀 날짜 직렬값 → 날짜
  const excelSerialToDate = (serial) => {
    // 엑셀 기준일: 1899-12-30
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  };

  const normalizeDateYYMMDD = (value) => {
    if (!value && value !== 0) return "";

    // Firestore Timestamp(seconds)
    if (typeof value === "object" && value?.seconds) return toYYMMDD(new Date(value.seconds * 1000));
    if (value instanceof Date) return toYYMMDD(value);

    if (typeof value === "number") {
      // ✅ 엑셀 직렬값 범위 추정 처리
      if (value > 20000 && value < 60000) {
        const d = excelSerialToDate(value);
        return d ? toYYMMDD(d) : "";
      }
      // 일반 timestamp(ms)일 수 있음
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
    if (!resolvedCollectionName) {
      alert("엑셀 업로드가 비활성화되었습니다.\n(컬렉션 이름이 필요합니다)");
      return;
    }
    if (!appendWithoutId && !resolvedIdKey) {
      alert("엑셀 업로드가 비활성화되었습니다.\n(ID 키를 찾을 수 없습니다)");
      return;
    }
    if (!askPassword()) return;
    allowUploadRef.current = true;
    fileInputRef.current?.click();
  };

  const handleExcelUpload = async (event) => {
    const inputEl = event.target;

    if (!resolvedCollectionName) {
      alert("업로드할 수 없습니다. collectionName 이 필요합니다.");
      inputEl.value = "";
      return;
    }
    if (!appendWithoutId && !resolvedIdKey) {
      alert("업로드할 수 없습니다. idKey 추론에 실패했습니다.");
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

    if (!window.confirm(`[${resolvedCollectionName}] 컬렉션에 이 엑셀을 업로드할까요?`)) {
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

      // ✅ amount만 있는 시트라면 totalAmount도 채워서 목록에서 바로 보이게
      if (rowToSave.amount != null && rowToSave.totalAmount == null) {
        rowToSave.totalAmount = rowToSave.amount;
      }

      if (!idValue && appendWithoutId) {
        await addDoc(collection(db, resolvedCollectionName), rowToSave);
        updated++;
        continue;
      }

      if (!idValue) { skipped++; continue; }

      const originalId = String(idValue);
      const docId = safeDocId(originalId);
      if (!docId) { skipped++; continue; }
      if (docId !== originalId) replacedCount++;

      await setDoc(doc(db, resolvedCollectionName, docId), rowToSave, { merge: true });
      updated++;
    }

    alert(
      `엑셀 업로드 완료 (컬렉션: ${resolvedCollectionName})\n업데이트/추가: ${updated}건, 스킵: ${skipped}건` +
      (replacedCount ? `\n(참고: '/' 포함 ID ${replacedCount}건은 '∕'로 치환됨)` : "")
    );
    onUploadComplete?.({ updated, skipped });
    inputEl.value = "";
  };

  // ========================= 포커스 스크롤/하이라이트 =========================
  useEffect(() => {
    if (!focusId) return;
    const idx = filteredData.findIndex((r) => String(r?.[rowIdKey]) === String(focusId));
    if (idx === -1) return;
    const targetPage = Math.floor(idx / itemsPerPage) + 1;
    if (targetPage !== currentPage) setCurrentPage(targetPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, filteredData, itemsPerPage]);

  useEffect(() => {
    if (!focusId) return;
    const has = currentData.some((r) => String(r?.[rowIdKey]) === String(focusId));
    if (!has) return;
    const t = setTimeout(() => {
      const el = rowRefs.current[focusId];
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("row-flash");
        setTimeout(() => el.classList.remove("row-flash"), 1500);
      }
    }, 60);
    return () => clearTimeout(t);
  }, [focusId, currentData, rowIdKey]);

  // ========================= 마우스 휠로 페이지 전환 =========================
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;

    let last = 0;
    const THROTTLE_MS = 350;

    const onWheel = (e) => {
      // 확대/축소(Ctrl+Wheel)나 가로 스크롤 중심 입력은 무시
      if (e.ctrlKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const now = Date.now();
      if (now - last < THROTTLE_MS) return;
      last = now;

      // 페이지 전환 시 스크롤 동작은 막음
      e.preventDefault();

      if (e.deltaY > 0) {
        setCurrentPage((p) => Math.min(p + 1, totalPages || 1));
      } else if (e.deltaY < 0) {
        setCurrentPage((p) => Math.max(p - 1, 1));
      }
    };

    // scroll-table 영역에 마우스를 올렸을 때만 동작
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel, { passive: false });
    };
  }, [totalPages]);

  return (
    <div className="data-table-wrapper">
      {/* 상단 컨트롤 바 */}
      <div
        className="table-controls"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <div className="control-left-slot" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {leftControls}
        </div>

        <div className="control-right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {rightControls}

          {onAdd && (
            <button className="register-button" onClick={onAdd}>
              {addButtonIcon} {addButtonLabel}
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
      <div className="scroll-table" ref={tableContainerRef}>
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
            {currentData.map((row, i) => {
              const rid = row?.[rowIdKey] ?? row?.id ?? `${startIndex + i}`;
              return (
                <tr
                  key={rid}
                  ref={(el) => { if (el) rowRefs.current[rid] = el; }}
                  data-rowid={rid}
                  className="hover:bg-gray-50 transition-colors"
                >
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
              );
            })}
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

      {/* 하이라이트 효과 스타일 */}
      <style>{`
        .row-flash {
          background-color: #fff3cd !important;
          transition: background-color 300ms ease;
        }
      `}</style>

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
