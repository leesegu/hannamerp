/* =========================================
 * Firebase Functions (Gen2, JS)
 * Endpoints:
 *   - ping:                   GET  → "pong" (헬스체크)
 *   - importIncomeFromExcel:  POST { downloadUrl, recentMonths? }
 *   - migrateIncomeToStorage: GET/POST (?from=YYYY-MM&to=YYYY-MM&dryRun=1&rewrite=1&startAfter=DOCID)
 * Storage layout:
 *   gs://<bucket>/acct_income_json/<YYYY-MM>.json
 *   payload = { meta:{updatedAt}, items:{ [id]: Row } }
 * ========================================= */

const admin = require("firebase-admin");
const ExcelJS = require("exceljs");
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

// 🚀 전역 옵션 (서울 리전). Node 런타임은 package.json의 engines.node.
setGlobalOptions({ region: "asia-northeast3", maxInstances: 10 });

admin.initializeApp();

/* ------------------------- 공통 유틸 ------------------------- */
const MAX_TEXT = 2000;
const s = (v) => String(v ?? "").trim();
const toNumber = (v) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const pad2 = (n) => String(n).padStart(2, "0");
const monthKeyOf = (dateStr) => (dateStr ? String(dateStr).slice(0, 7) : "");
const trimField = (v, max = MAX_TEXT) => s(v).slice(0, max);
const isYyyyMm = (mk) => /^\d{4}-\d{2}$/.test(mk);

// FNV-1a 32bit
function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const makeDupKey = (r) =>
  [r.date, r.time || "00:00:00", toNumber(r.inAmt), s(r.record)].join("|");

const bucket = () => admin.storage().bucket();
const monthPath = (mk) => `acct_income_json/${mk}.json`;

async function readMonthItems(mk) {
  const file = bucket().file(monthPath(mk));
  try {
    const [exists] = await file.exists();
    if (!exists) return {};
    const [buf] = await file.download();
    const obj = JSON.parse(buf.toString() || "{}");
    return obj?.items || {};
  } catch {
    return {};
  }
}
async function writeMonthJSON(mk, items, { merge = true } = {}) {
  const file = bucket().file(monthPath(mk));
  let base = {};
  if (merge) base = await readMonthItems(mk);
  const merged = { ...base, ...items };
  const payload = { meta: { updatedAt: Date.now() }, items: merged };
  await file.save(JSON.stringify(payload), { contentType: "application/json" });
  return Object.keys(merged).length;
}

/* ------------------------- 엑셀 파싱 ------------------------- */
function normalizeExcel2D(ws) {
  const rows = [];
  const rowCount = ws.rowCount;
  const colCount = ws.columnCount;
  for (let r = 1; r <= rowCount; r++) {
    const row = ws.getRow(r);
    const arr = [];
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      const val = cell.value;
      if (val instanceof Date) arr.push(val);
      else if (typeof val === "number") arr.push(val);
      else arr.push(cell.text || "");
    }
    rows.push(arr);
  }
  return rows;
}
function findHeaderRow(rows) {
  const lim = Math.min(rows.length, 50);
  for (let i = 0; i < lim; i++) {
    const t = (rows[i] || []).map(s);
    const hasDT = t.some((c) => c.includes("거래일시"));
    const hasD =
      t.some((c) => c.includes("일자")) ||
      t.some((c) => c.includes("거래일")) ||
      t.some((c) => c.includes("거래일자"));
    const hasIn = t.some((c) => c.includes("입금금액"));
    if ((hasDT || hasD) && hasIn) return i;
  }
  return -1;
}
function findFollowingValue(rows, r0, c0, maxRadius = 8) {
  for (let c = c0 + 1; c <= c0 + maxRadius; c++) {
    const v = rows[r0]?.[c];
    if (s(v)) return s(v);
  }
  for (let r = r0 + 1; r <= r0 + maxRadius; r++) {
    const v = rows[r]?.[c0 + 1] ?? rows[r]?.[c0];
    if (s(v)) return s(v);
  }
  for (let dr = 0; dr <= maxRadius; dr++) {
    for (let dc = 0; dc <= maxRadius; dc++) {
      const v = rows[r0 + dr]?.[c0 + dc];
      if (s(v)) return s(v);
    }
  }
  return "";
}
function parseMeta(rows) {
  const meta = {};
  const lim = Math.min(rows.length, 30);
  for (let i = 0; i < lim; i++) {
    const r = rows[i] || [];
    for (let j = 0; j < r.length; j++) {
      const cell = s(r[j]);
      if (!cell) continue;
      if (cell.includes("계좌번호")) {
        meta.accountNo = s(r[j + 1]) || findFollowingValue(rows, i, j);
      }
      if (cell.includes("예금주명")) {
        meta.holder = s(r[j + 1]) || findFollowingValue(rows, i, j);
      }
    }
  }
  return meta;
}

const EXCEL_EPS = 1e-7;
function excelSerialToLocalDate(val, { truncateTime = false, date1904 = false } = {}) {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  let serial = val;
  if (Math.abs(serial - Math.round(serial)) < EXCEL_EPS) serial = Math.round(serial);
  if (truncateTime) serial = Math.floor(serial + EXCEL_EPS);

  const base = new Date(date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30));
  const ms = Math.floor(serial * 24 * 60 * 60 * 1000);
  const d = new Date(base.getTime() + ms);
  if (truncateTime) d.setUTCHours(0, 0, 0, 0);
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds()
  );
}
function parseKoreanDateTime(v) {
  const raw = s(v);
  if (!raw) return null;
  const norm = raw.replace(/[.\-]/g, "/").replace(/\s+/g, " ").trim();
  const m = norm.match(
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!m) return null;
  const [, Y, M, D, hh = "0", mm = "0", ss = "0"] = m;
  const dt = new Date(+Y, +M - 1, +D, +hh, +mm, +ss);
  return isNaN(dt) ? null : dt;
}
function normalizeExcelCellToLocalDate(cell, { truncateTime = false, date1904 = false } = {}) {
  if (cell == null || cell === "") return null;
  if (cell instanceof Date) {
    const d = new Date(cell.getTime());
    if (truncateTime) d.setHours(0, 0, 0, 0);
    return d;
  }
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return excelSerialToLocalDate(cell, { truncateTime, date1904 });
  }
  const d = parseKoreanDateTime(cell);
  if (!(d instanceof Date) || isNaN(d)) return null;
  if (truncateTime) d.setHours(0, 0, 0, 0);
  return d;
}
const fmtDateLocal = (d) => {
  if (!(d instanceof Date) || isNaN(d)) return "";
  const ld = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  return `${ld.getFullYear()}-${pad2(ld.getMonth() + 1)}-${pad2(ld.getDate())}`;
};
const fmtTimeLocal = (d) =>
  d instanceof Date && !isNaN(d)
    ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
    : "";
const parseHms = (t) => {
  const m = s(t).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return [0, 0, 0];
  return [+(m[1] || 0), +(m[2] || 0), +(m[3] || 0)];
};

function rowsToRecords(rows, headerRowIdx, meta, { date1904 = false } = {}) {
  const header = (rows[headerRowIdx] || []).map(s);
  const idx = (key) => header.findIndex((h) => h.includes(key));

  const col = {
    seq: idx("순번"),
    dateTime: idx("거래일시"),
    dateOnly: (() => {
      const cands = ["일자", "거래일자", "거래일"];
      for (const k of cands) {
        const i = idx(k);
        if (i >= 0) return i;
      }
      return -1;
    })(),
    timeOnly: idx("시간"),
    inAmt: idx("입금금액"),
    outAmt: idx("출금금액"),
    balance: idx("거래후잔액"),
    record: idx("거래기록사항"),
    memo: idx("거래메모"),
    category: idx("구분"),
  };

  const out = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const hasAny = row.some((c) => s(c) !== "");
    if (!hasAny) continue;

    let dateStr = "", timeStr = "";

    if (col.dateTime >= 0) {
      const d = normalizeExcelCellToLocalDate(row[col.dateTime], { truncateTime: false, date1904 });
      if (d) { dateStr = fmtDateLocal(d); timeStr = fmtTimeLocal(d); }
    }

    if (!dateStr && col.dateOnly >= 0) {
      const d = normalizeExcelCellToLocalDate(row[col.dateOnly], { truncateTime: true, date1904 });
      if (d) dateStr = fmtDateLocal(d);
      if (col.timeOnly >= 0) {
        const [hh, mm, ss] = parseHms(s(row[col.timeOnly]));
        timeStr = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
      }
      if (dateStr && !timeStr) timeStr = "00:00:00";
    }

    const inAmt = col.inAmt >= 0 ? toNumber(row[col.inAmt]) : 0;
    const outAmt = col.outAmt >= 0 ? toNumber(row[col.outAmt]) : 0;

    out.push({
      accountNo: s(meta.accountNo),
      holder: s(meta.holder),
      date: dateStr,
      time: timeStr || "00:00:00",
      datetime: `${dateStr} ${timeStr || "00:00:00"}`,
      inAmt,
      outAmt,
      balance: col.balance >= 0 ? toNumber(row[col.balance]) : 0,
      record: s(row[col.record]) || "",
      memo: s(row[col.memo]) || "",
      category: s(row[col.category]) || "",
      _seq: s(row[col.seq]) || "",
      type: inAmt > 0 ? "입금" : outAmt > 0 ? "출금" : "",
      unconfirmed: false,
    });
  }
  return out;
}

/* ------------------------- 핑(헬스체크) ------------------------- */
exports.ping = onRequest((req, res) => {
  res.status(200).send("pong");
});

/* ------------------------- IMPORT API ------------------------- */
exports.importIncomeFromExcel = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Use POST" }); return;
    }
    const { downloadUrl, recentMonths } = req.body || {};
    if (!s(downloadUrl)) {
      res.status(400).json({ ok: false, error: "downloadUrl required" }); return;
    }

    // 1) 엑셀 로드
    const wb = new ExcelJS.Workbook();
    const resp = await fetch(downloadUrl);
    if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
    const ab = await resp.arrayBuffer();
    await wb.xlsx.load(Buffer.from(ab));

    const ws = wb.worksheets[0];
    if (!ws) throw new Error("No sheet");
    const aoo = normalizeExcel2D(ws);

    const is1904 = !!wb.properties?.date1904;

    // 2) 파싱
    const meta = parseMeta(aoo);
    const headerRowIdx = findHeaderRow(aoo);
    if (headerRowIdx === -1) throw new Error("헤더(일자/거래일시/입금금액 등) 탐지 실패");

    const recs = rowsToRecords(aoo, headerRowIdx, meta, { date1904: is1904 });

    // 3) 월별 그룹 → Storage JSON 병합 저장
    const byMonth = {};
    for (const r of recs) {
      const mk = monthKeyOf(r.date);
      if (!mk) continue;
      (byMonth[mk] ||= []).push(r);
    }

    let total = 0, hotSaved = 0, coldSaved = 0;
    const now = new Date();
    const hotSet = new Set();
    if (recentMonths && Number(recentMonths) > 0) {
      for (let i = 0; i < Number(recentMonths); i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        hotSet.add(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
      }
    }

    for (const mk of Object.keys(byMonth)) {
      const items = {};
      for (const r of byMonth[mk]) {
        const id = `r_${hash(makeDupKey(r)).toString(16)}`;
        items[id] = {
          _id: id,
          date: s(r.date),
          time: s(r.time || "00:00:00"),
          datetime: s(r.datetime || `${s(r.date)} ${s(r.time || "00:00:00")}`),
          accountNo: s(r.accountNo),
          holder: s(r.holder),
          category: s(r.category || ""),
          inAmt: toNumber(r.inAmt),
          outAmt: toNumber(r.outAmt),
          balance: toNumber(r.balance),
          record: trimField(r.record),
          memo: trimField(r.memo),
          _seq: s(r._seq || ""),
          type: r.type || (toNumber(r.inAmt) > 0 ? "입금" : toNumber(r.outAmt) > 0 ? "출금" : ""),
          unconfirmed: !!r.unconfirmed,
          monthKey: mk,
        };
      }
      await writeMonthJSON(mk, items, { merge: true });
      total += Object.keys(items).length;
      if (hotSet.has(mk)) hotSaved += Object.keys(items).length;
      else coldSaved += Object.keys(items).length;
    }

    res.json({ ok: true, total, hotSaved, coldSaved });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/* ------------------------- 마이그레이션 ------------------------- */
exports.migrateIncomeToStorage = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();

    const dryRun = s(req.query.dryRun) === "1";
    let rewriteOnce = s(req.query.rewrite) === "1";
    const startAfter = s(req.query.startAfter);
    const fromMonth = s(req.query.from);
    const toMonth = s(req.query.to);
    const useMonthFilter = isYyyyMm(fromMonth) && isYyyyMm(toMonth);

    const COLL = "acct_income";
    let q = db.collection(COLL).orderBy(admin.firestore.FieldPath.documentId());
    if (startAfter) q = q.startAfter(startAfter);

    const batchSize = 5000;
    let migrated = 0;
    let lastDocId = "";
    let loops = 0;

    const monthBuckets = {}; // { mk: { id: Row } }

    while (true) {
      loops++;
      const snap = await q.limit(batchSize).get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const data = doc.data() || {};
        const id = s(data._id || doc.id);
        const date = s(data.date);
        const time = s(data.time || "00:00:00");
        const mk = s(data.monthKey || monthKeyOf(date));
        if (!id || !mk || !date) { lastDocId = doc.id; continue; }

        if (useMonthFilter && (mk < fromMonth || mk > toMonth)) {
          lastDocId = doc.id; continue;
        }

        const inAmt = toNumber(data.inAmt);
        const outAmt = toNumber(data.outAmt);

        const row = {
          _id: id,
          date, time,
          datetime: s(data.datetime || (date ? `${date} ${time}` : "")),
          accountNo: s(data.accountNo),
          holder: s(data.holder),
          category: s(data.category),
          inAmt, outAmt,
          balance: toNumber(data.balance),
          record: trimField(data.record),
          memo: trimField(data.memo),
          _seq: s(data._seq),
          type: s(data.type || (inAmt > 0 ? "입금" : outAmt > 0 ? "출금" : "")),
          unconfirmed: !!data.unconfirmed,
          monthKey: mk,
        };

        (monthBuckets[mk] ||= {})[id] = row;
        lastDocId = doc.id;
      }

      // 메모리 보호: 버퍼가 커지면 중간 flush
      const TH = 100_000;
      const totalBuffered = Object.values(monthBuckets).reduce((n, m) => n + Object.keys(m).length, 0);
      if (totalBuffered >= TH) {
        for (const mk of Object.keys(monthBuckets)) {
          const upserts = monthBuckets[mk];
          if (!Object.keys(upserts).length) continue;
          if (!dryRun) await writeMonthJSON(mk, upserts, { merge: !rewriteOnce });
          rewriteOnce = false;
          migrated += Object.keys(upserts).length;
          monthBuckets[mk] = {};
        }
      }

      q = db.collection(COLL).orderBy(admin.firestore.FieldPath.documentId()).startAfter(lastDocId);
    }

    // 잔여 flush
    for (const mk of Object.keys(monthBuckets)) {
      const upserts = monthBuckets[mk];
      if (!Object.keys(upserts).length) continue;
      if (!dryRun) await writeMonthJSON(mk, upserts, { merge: !rewriteOnce });
      rewriteOnce = false;
      migrated += Object.keys(upserts).length;
      monthBuckets[mk] = {};
    }

    res.json({ ok: true, migrated, lastDocId, loops, dryRun, fromMonth, toMonth });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});
