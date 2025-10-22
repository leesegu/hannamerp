// functions/intake.js
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const admin = require("firebase-admin");
const { onRequest, onCall } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

// ✅ 서울 리전 고정
setGlobalOptions({ region: "asia-northeast3", maxInstances: 10 });

if (!admin.apps.length) admin.initializeApp();

/* ========= 공통 유틸 ========= */
const s = (v) => String(v ?? "").trim();
const toNumber = (v) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const pad2 = (n) => String(n).padStart(2, "0");
const monthKeyOf = (dateStr) => (dateStr ? String(dateStr).slice(0, 7) : "");
const MAX_TEXT = 2000;
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

/* ========= 엑셀 → 수입 JSON (기존 그대로) ========= */
// (중략) — 기존 importIncomeFromExcel/migrateIncomeToStorage 유틸/함수들은 손대지 않았습니다.
// ※ 여러분 파일에 있던 동일 코드 그대로 두세요.

/* ------------------------- 핑(헬스체크) ------------------------- */
exports.ping = onRequest((req, res) => {
  res.status(200).send("pong");
});

/* ================================================================
 * 👇👇👇  여기부터: 입주자카드(onCall)  👇👇👇
 * ================================================================ */

// 공용 유틸(토큰)
const b64url = (buf) => buf.toString("base64url");
const sha256 = (s2) => crypto.createHash("sha256").update(s2).digest("base64url");

/** 링크 생성 — 로그인되어 있으면 OK */
exports.createIntakeLink = onCall(async (req) => {
  const { auth, data } = req;
  if (!auth) throw new Error("unauthenticated: Sign-in required");

  const { villaName, unitNo, phone, expiresInHours = 24 * 14 } = data || {};
  if (!s(villaName) || !s(unitNo) || !s(phone)) {
    throw new Error("invalid-argument: villaName, unitNo, phone required");
  }

  const db = admin.firestore();
  const sessionRef = db.collection("tenant_intake_sessions").doc();

  const sessionId = sessionRef.id;
  const rand = crypto.randomBytes(16);
  const expSec = Math.floor((Date.now() + Number(expiresInHours) * 3600 * 1000) / 1000);

  // 토큰 = sessionId.rand.exp  (서명 대신 해시로 검증)
  const token = `${sessionId}.${b64url(rand)}.${expSec}`;
  const tokenHash = sha256(token);

  // ✅ 실제 호스팅 도메인으로 지정 (요청하신 도메인 사용)
  const url = `https://hannam-move-calculate.web.app/intake.html?t=${encodeURIComponent(token)}`;

  await sessionRef.set({
    villaName: s(villaName),
    unitNo: s(unitNo),
    phone: s(phone),
    status: "active",
    tokenHash,
    expiresAt: admin.firestore.Timestamp.fromMillis(expSec * 1000),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: auth.uid,
    url,
  });

  return { url, sessionId, expiresAt: new Date(expSec * 1000).toISOString() };
});

/** 대기(미제출) 링크 목록 — 로그인되어 있으면 OK
 *  🔧 인덱스 없이 동작하도록 orderBy 제거 → 서버에서 정렬 후 반환
 */
exports.listActiveIntakeLinks = onCall(async (req) => {
  if (!req.auth) throw new Error("unauthenticated: Sign-in required");
  const db = admin.firestore();

  // where(status=='active')만 사용 → 기본 단일 인덱스로 OK
  const qs = await db
    .collection("tenant_intake_sessions")
    .where("status", "==", "active")
    .limit(200)
    .get();

  const rows = qs.docs.map((d) => ({ id: d.id, ...d.data() }));

  // createdAt 기준 내림차순 정렬 (서버측 배열 정렬)
  rows.sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    return tb - ta;
  });

  return rows;
});

/** 토큰 검증 — 익명 허용 */
exports.verifyIntakeToken = onCall(async (req) => {
  const token = s(req.data?.token || "");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid-argument: bad token format");

  const [sessionId, _rand, expStr] = parts;
  const expSec = Number(expStr);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(expSec) || nowSec > expSec) {
    return { status: "expired" };
  }

  const db = admin.firestore();
  const snap = await db.doc(`tenant_intake_sessions/${sessionId}`).get();
  if (!snap.exists) throw new Error("not-found: session missing");
  const sdoc = snap.data() || {};

  if (sdoc.status !== "active") {
    return { status: sdoc.status, alreadySubmitted: !!sdoc.submissionId };
  }

  const tokenHash = sha256(token);
  if (tokenHash !== sdoc.tokenHash) {
    throw new Error("permission-denied: invalid token");
  }

  return {
    status: "active",
    sessionId,
    prefill: { villa_name: sdoc.villaName, address: "", unitNo: sdoc.unitNo },
  };
});

/** 제출 — 익명 허용, 트랜잭션 1회 소진 */
exports.submitResidentCard = onCall(async (req) => {
  const token = s(req.data?.token || "");
  const payload = req.data?.payload || {};

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid-argument: bad token");
  const [sessionId, _rand, expStr] = parts;
  const expSec = Number(expStr);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(expSec) || nowSec > expSec) {
    throw new Error("deadline-exceeded: token expired");
  }

  const db = admin.firestore();
  const sessionRef = db.doc(`tenant_intake_sessions/${sessionId}`);
  const submissionRef = db.collection("resident_cards").doc();

  await db.runTransaction(async (tx) => {
    const ss = await tx.get(sessionRef);
    if (!ss.exists) throw new Error("not-found: session missing");
    const sdoc = ss.data() || {};

    const tokenHash = sha256(token);
    if (tokenHash !== sdoc.tokenHash) throw new Error("permission-denied: invalid token");
    if (sdoc.status !== "active") throw new Error("failed-precondition: already used/expired");

    const {
      move_in_date, villa_name, address, name, phone,
      checklist, notes, photos,
    } = payload;

    tx.set(submissionRef, {
      move_in_date: s(move_in_date),
      villa_name: s(villa_name || sdoc.villaName || ""),
      address: s(address),
      name: s(name),
      phone: s(phone),
      checklist: checklist || {},
      notes: s(notes || ""),
      photos: Array.isArray(photos) ? photos.slice(0, 20) : [],
      sessionId,
      villaName: sdoc.villaName,
      unitNo: sdoc.unitNo,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.update(sessionRef, {
      status: "used",
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
      submissionId: submissionRef.id,
    });
  });

  return { ok: true, submissionId: submissionRef.id };
});

/** 삭제 — 로그인된 사용자 OK (요청대로) */
exports.deleteResidentCard = onCall(async (req) => {
  if (!req.auth) throw new Error("unauthenticated: Sign-in required");
  const id = s(req.data?.id || "");
  if (!id) throw new Error("invalid-argument: id required");
  await admin.firestore().doc(`resident_cards/${id}`).delete();
  return { ok: true };
});
