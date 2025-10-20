// src/pages/MessageExtractor.jsx
import React, { useMemo, useState, useEffect } from "react";
/* ✅ Firestore에 직접 저장하도록 추가 */
import { db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * 전기요금 추출 — 스크롤/폰트 업그레이드 & 설명 제거 버전 (요구사항 보강)
 * - 파서 보강:
 *   1) (동 번지) + [건물/호] 우선 추출
 *   2) '/402호' 같은 슬래시 호수 보강 + '인수인계' 주소 말미 부착
 *   3) 연속 숫자 계좌번호(10~20자리) 추출 추가
 *   4) 주소 중복 토큰/은행 토큰 제거
 *   5) 단독 '+' 줄을 메시지 구분선으로 인식
 */

export default function MessageExtractor() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState([]);

  const onExtract = () => {
    const parsed = parseMessages(input);
    if (parsed.length) setRows((prev) => [...prev, ...parsed]); // 누적
  };

  const clearMessage = () => setInput("");
  const clearResults = () => setRows([]);

  const totalMonthly = useMemo(
    () => rows.reduce((acc, r) => acc + toNumber(r.금액), 0),
    [rows]
  );

  /** ===== 출금보류 연동(저장/중복 검사) ===== */
  const HOLD_DOC = doc(db, "acct_expense_hold", "current");
  const LS_HOLD_KEY = "ExpensePage:HOLD:v1";

  const normalizeForCompare = (x) => {
    const desc = String(x?.desc ?? x?.내용 ?? "").trim();
    const bank = String(x?.bank ?? x?.은행 ?? "").trim();
    const accountNo = cleanAccount(x?.accountNo ?? x?.계좌번호 ?? "");
    const amount = toNumber(x?.amount ?? x?.금액 ?? 0);
    return { desc, bank, accountNo, amount };
  };

  const fetchHoldRows = async () => {
    try {
      const snap = await getDoc(HOLD_DOC);
      const rows = Array.isArray(snap.data()?.rows) ? snap.data().rows : [];
      return rows;
    } catch {
      return [];
    }
  };

  const saveHoldRows = async (newRows) => {
    await setDoc(
      HOLD_DOC,
      { rows: newRows, updatedAt: serverTimestamp() },
      { merge: true }
    );
    try {
      localStorage.setItem(LS_HOLD_KEY, JSON.stringify(newRows));
    } catch {}
  };

  const existsDuplicate = (existingRows, candidate) => {
    const want = normalizeForCompare(candidate);
    return existingRows.some((h) => {
      const got = normalizeForCompare(h);
      return (
        got.desc === want.desc &&
        got.bank === want.bank &&
        got.accountNo === want.accountNo &&
        got.amount === want.amount
      );
    });
  };

  /** 전송 payload 생성 (요청한 필드 매핑 적용) */
  const buildHoldPayload = (r) => {
    const desc = r.주소 || ""; // 내용
    const bank = r.은행 || "";
    const accountNo = cleanAccount(r.계좌번호 || "");
    const amount = toNumber(r.금액);
    const noteParts = [];
    if (r.일자) noteParts.push(`일자:${r.일자}`);
    if (r.납부마감일) noteParts.push(`납부마감일:${r.납부마감일}`);
    const note = noteParts.join(" / ");

    // HoldTable 컬럼과 일치하는 키(영문) + 호환(한글) 동시 포함
    return {
      type: "",          // 기본 비움
      desc,              // 내용
      bank,              // 은행
      accountNo,         // 계좌번호
      amount: amount ? amount.toLocaleString() : "", // 입력 필드용 콤마 표기
      note,              // 비고(일자/납부마감일)
      // 호환(기존 이벤트 핸들러 대비)
      내용: desc,
      은행: bank,
      계좌번호: accountNo,
      금액: amount,
      비고: note,
    };
  };

  /** 단건 전송 → Firestore에 즉시 반영 (중복 차단) */
  const handleSendRow = async (row, idx) => {
    const payload = buildHoldPayload(row);
    const current = await fetchHoldRows();
    if (existsDuplicate(current, payload)) {
      alert("이미 같은 내용이 있습니다. (주소·은행·금액·계좌번호 모두 동일)");
      return;
    }
    const updated = [...current, payload];
    await saveHoldRows(updated);     // ✅ Firestore + LocalStorage 저장
    setRows((prev) => prev.filter((_, i) => i !== idx)); // ✅ 미리보기에서 제거
  };

  /** 전체 보내기 → Firestore에 일괄 반영 (중복 차단) */
  const handleSendAll = async () => {
    if (!rows.length) return;
    const current = await fetchHoldRows();

    const toAdd = [];
    let skipped = 0;
    for (const r of rows) {
      const payload = buildHoldPayload(r);
      if (existsDuplicate(current.concat(toAdd), payload)) {
        skipped++;
      } else {
        toAdd.push(payload);
      }
    }

    if (!toAdd.length) {
      alert("보낼 항목이 없습니다. (모두 중복으로 판단)");
      return;
    }

    const updated = [...current, ...toAdd];
    await saveHoldRows(updated);     // ✅ Firestore + LocalStorage 저장
    // 전송된 항목 제거(중복으로 스킵된 것만 남김)
    setRows((prev) =>
      prev.filter((r) => existsDuplicate(updated, buildHoldPayload(r)))
    );
    if (skipped > 0) alert(`중복으로 전송되지 않은 항목: ${skipped}건`);
  };

  const handleDeleteRow = (idx) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  // 커스텀 스크롤바(옅은 퍼플)
  useEffect(() => {
    const id = "message-extractor-scrollbar";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.innerHTML = `
      .me-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
      .me-scroll::-webkit-scrollbar-thumb { background: rgba(124, 58, 237, .25); border-radius: 8px; }
      .me-scroll::-webkit-scrollbar-track { background: rgba(124, 58, 237, .08); }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <div className="relative h-full w-full">
      {/* 배경 */}
      <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_20%_0%,rgba(124,58,237,.18),transparent),radial-gradient(900px_500px_at_80%_100%,rgba(14,165,233,.18),transparent)] bg-white" />

      <div className="absolute inset-0 overflow-hidden p-3">
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between rounded-2xl px-4 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-white/70 bg-white/80">
          <div className="text-[18px] font-extrabold tracking-tight bg-gradient-to-r from-violet-700 to-indigo-600 bg-clip-text text-transparent">
            전기요금 추출
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50/80 px-3 py-1 whitespace-nowrap">
              <span className="text-[12px] font-semibold text-violet-700 whitespace-nowrap">
                당월이사정산요금 합계
              </span>
              <span className="text-[13px] font-extrabold text-violet-900 whitespace-nowrap">
                {totalMonthly.toLocaleString()}원
              </span>
            </div>
            <button
              onClick={handleSendAll}
              className="whitespace-nowrap rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow hover:opacity-95"
              title="전체 내역을 출금보류창으로 보냅니다"
            >
              전체 보내기
            </button>
          </div>
        </div>

        {/* 2열 */}
        <div className="mt-3 grid h-[calc(100%-56px)] grid-cols-[22%_78%] gap-3">
          {/* 입력 */}
          <div className="rounded-2xl border border-white/80 bg-white/85 p-3 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[14px] font-semibold text-gray-700">메시지 붙여넣기</div>
              <div className="flex gap-1.5">
                <button
                  onClick={onExtract}
                  className="whitespace-nowrap rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-[13px] font-semibold text-violet-700 hover:bg-violet-100"
                >
                  추출하기
                </button>
                <button
                  onClick={clearMessage}
                  className="whitespace-nowrap rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-[13px] text-sky-700 hover:bg-sky-100"
                  title="입력창만 비움"
                >
                  메시지 초기화
                </button>
              </div>
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="me-scroll h-[560px] w-full resize-none overflow-auto rounded-xl border border-gray-200 bg-white/90 p-3 text-[12px] leading-6 outline-none ring-0 focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
              spellCheck={false}
            />
          </div>

          {/* 결과 */}
          <div className="rounded-2xl border border-white/80 bg-white/85 p-3 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
            <div className="mb-2 flex items-center justify-between">
              <div className="whitespace-nowrap text-[14px] font-semibold text-gray-700">
                결과 미리보기 <span className="text-gray-400 text-[12px]">({rows.length}건)</span>
              </div>
              <button
                onClick={clearResults}
                className="whitespace-nowrap rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700 hover:bg-rose-100"
                title="결과만 비움"
              >
                결과 초기화
              </button>
            </div>
            <div className="me-scroll h-[calc(100%-42px)] min-h-[320px] overflow-auto rounded-xl border border-gray-200 bg-white">
              <ResultTable rows={rows} onSend={handleSendRow} onDelete={handleDeleteRow} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================= 파서/유틸 ========================= */
function parseMessages(all) {
  const blocks = splitIntoBlocks(all);
  return blocks.map(parseOne).filter(Boolean);
}

function splitIntoBlocks(text) {
  const normalized = (text || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  // 1) 단독 '+' 줄을 구분선으로 먼저 분리
  const chunks = normalized.split(/\n\s*\+\s*\n/g);
  const parts = [];
  for (const chunk of chunks) {
    // 2) WEB발신/제목 구분
    const ss = chunk
      .split(/\n(?=\s*(?:WEB발신|Web발신|제목\s*:))/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ss.length) parts.push(...ss);
    else if (chunk.trim()) parts.push(chunk.trim());
  }
  return parts.length ? parts : [normalized];
}

function parseOne(block) {
  const original = block;
  const text = collapseSpaces(block);

  const tags = [];
  const hasInSuingye = /인수인계/.test(original);
  if (hasInSuingye) tags.push("인수인계");
  if (/이사정산\s*TV수신료\s*청구정보/.test(original) || /TV수신료\s*지정계좌\s*안내/.test(original)) tags.push("TV수신료");
  if (/이사정산요금\s*관련\s*(정보|내역)/.test(original)) tags.push("정산요금");

  const vendor = matchFirst(original, /(CNCITY에너지|씨엔시티에너지)/) || "";
  const contractNo = matchFirst(text, /(계약번호|고객번호)\s*[:：]?\s*([0-9][0-9-*]{3,})/) || "";

  let bank =
    matchFirst(text, /(농협|농협은행|국민|국민은행|신한|신한은행|우리|하나|KEB하나|하나은행|기업|기업은행|새마을금고|SC제일|씨티|카카오|토스)\s*은행?/) ||
    inferBankFromText(text);

  const desig = extractDesignatedAccount(text);
  let account = "";
  if (desig) {
    bank = normalizeBank(desig.bank || bank);
    account = desig.account || "";
  }

  // 은행별 목록형
  if (!account) {
    const bankMap = extractBankAccountsList(original);
    if (Object.keys(bankMap).length) {
      const picked = pickPreferredBank(bankMap);
      if (picked) {
        bank = picked.bank || bank;
        account = picked.acct;
      }
    }
  }

  // 새마을금고 (예금주) 특례
  if (!account) {
    const holder = matchFirst(text, /(새마을금고)[(（]([^)）]{1,12})[)）]/);
    const acct2 = matchFirst(text, /(?:^|\n)\s*([0-9][0-9- ]{7,})\s*(?:$|\n)/);
    if (holder && acct2) {
      bank = "새마을금고";
      const name = holder.split(")")[0].split("(")[1]?.trim() || "";
      account = `${cleanAccount(acct2)} ${name}`.trim();
    }
  }

  // ✅ 계좌 패턴 강화 (4그룹 + 연속숫자 10~20)
  if (!account) {
    account =
      matchFirst(text, /(?:납부계좌|계좌|계좌번호)\s*[:：]?\s*(\d{2,6}(?:[\s-]\d{2,6}){1,3})/) ||
      matchFirst(text, /(\d{2,6}(?:[\s-]\d{2,6}){1,3})/) ||
      matchFirst(text, /(?:납부계좌|계좌|계좌번호)\s*[:：]?\s*([0-9]{10,20})/) ||
      matchFirst(text, /(?:농협|국민|신한|우리|하나|기업|새마을금고)[^\n]{0,8}?([0-9]{10,20})/) ||
      matchFirst(text, /(\b\d{6,}[\-\s]\d{2,6}[\-\s]\d{2,6}\b)/);
  }

  if (!account && hasInSuingye) account = "인수인계";

  const settleDate = matchFirst(text, /정산일자\s*[:：]?\s*(\d{4}[./-]\d{2}[./-]\d{2})/);
  const applyDate = matchFirst(text, /신청일자\s*[:：]?\s*(\d{4}[./-]\d{2}[./-]\d{2})/);
  const moveDate = matchFirst(text, /이사일자\s*[:：]?\s*(\d{4}[./-]\d{2}[./-]\d{2})/);
  const date = settleDate || applyDate || moveDate || "";

  // ===== 주소 후보 생성 =====
  let address =
    matchFirst(original, /(전기사용장소|주소|대상)\s*[:：]?\s*([^\n]+?)(?:\n|$)/) || "";

  // (동 번지) + [건물/호] 우선 패턴 시도
  const pref = extractDongLotPreferred(original);
  if (pref) address = pref;

  // 괄호 안 상세만 추리는 기존 보조
  if (!pref) {
    const parenDetail = extractParenDetail(address);
    const parenRunOn = extractParenRunOn(original);
    if (parenRunOn) address = parenRunOn;
    else if (parenDetail) address = parenDetail;
  }

  // 대상: 라인 특례
  const targetLine = matchFirst(original, /대상\s*[:：]?\s*([^\n]+)/);
  if (!pref && targetLine) address = cleanMaskedAddress(targetLine);

  // 백업 휴리스틱
  if (!address) address = extractAddressHeuristic(original);

  // 슬래시 호수 보강
  const slashHo = extractSlashHo(original);
  if (slashHo && (!address || !address.includes(slashHo))) {
    address = (address ? `${address} ` : "") + slashHo;
  }

  address = cleanMaskedAddress(address || "");

  // 끝부분 힌트 (빌라명·호수 등) 보강
  const trailing = trailAddressHint(original);
  if (trailing && !address.includes(trailing)) {
    address = (address ? `${address} ` : "") + trailing;
  }

  // 인라인 한 줄 힌트 보강
  const inlineLine = inlineAddressLine(original);
  if (inlineLine && !address.includes(inlineLine)) {
    address = (address ? `${address} ` : "") + inlineLine;
  }

  // ★ 추가: 맨 아래줄 '공간XXXX (###호|숫자호|없음)' 힌트 보강
  const bottomSpace = extractBottomSpaceHint(original);
  if (bottomSpace && !address.includes(bottomSpace)) {
    address = (address ? `${address} ` : "") + bottomSpace;
  }

  // ✅ 주소 후처리: 은행 제거 + 중복어절 제거
  address = dedupeAddress(address);

  // '인수인계'는 주소 말미에 노출(중복 방지)
  if (hasInSuingye && !/인수인계/.test(address)) {
    address = `${address} 인수인계`.trim();
  }

  // 부가 태그/계약번호는 주소 뒤에 ' · '로 묶지 않도록 유지

  let amount =
    matchFirst(text, /(?:^|[\n\r])\s*[□-]?\s*정산요금\s*[:：]?\s*([\d,]+)\s*원/) ||
    matchFirst(text, /전기요금\s*정산금액\s*[:：]?\s*([\d,]+)\s*원/) ||
    matchFirst(text, /정산요금합계\s*[:：]?\s*([\d,]+)\s*원/);
  if (!amount) {
    const breakdown = sumBreakdown(text);
    if (breakdown) amount = breakdown;
  }
  if (!amount) {
    amount =
      matchFirst(text, /납부(?:할)?요금(?:은)?\s*([\d,]+)\s*원/) ||
      matchFirst(text, /₩\s*([\d,]+)/) ||
      largestMoneyLike(text);
  }
  const amountDisplay = amount ? withWon(amount) : "";

  const due =
    matchFirst(text, /납부마감일\s*[:：]?\s*(\d{4}[./]\d{2}[./]\d{2})/) ||
    matchFirst(text, /입금일\s*[:：]?\s*(\d{4}[./]\d{2}[./]\d{2})\s*까지/) ||
    matchFirst(text, /(\d{4}[./]\d{2}[./]\d{2})\s*까지/);

  if (!bank && account) bank = inferBankFromAccountNeighborhood(original, account) || bank;

  if (account && contractNo) {
    const d = digits(contractNo);
    if (d && digits(account) === d) account = ""; // 계약번호 동일 → 계좌로 보지 않음
  }

  account = account ? cleanAccount(account) : "";
  bank = normalizeBank(bank || "");

  if (!date && !address && !amountDisplay && !account && !due && !bank) return null;

  return {
    일자: date,
    주소: address || "",
    금액: amountDisplay,
    은행: bank,
    계좌번호: account,
    납부마감일: due || "",
  };
}

/* ---------- (동 번지) + [건물/호] 우선 패턴 ---------- */
/**
 * A) "(도마동 34-12) 아망떼 402호"  -> "도마동 34-12 아망떼 402호"
 * B) "(월평동 617) 202호"           -> "월평동 617 202호"
 * C) "(대흥동 3-13) 504 네잎클로버" -> "대흥동 3-13 504 네잎클로버"
 */
function extractDongLotPreferred(raw) {
  const R = (re) => {
    const m = (raw || "").match(re);
    return m ? m.slice(1).map((x) => (x || "").trim()).filter(Boolean) : null;
  };
  // A: 동번지) 건물명 호
  let g =
    R(/\(([가-힣A-Za-z0-9\s.-]*동\s+[0-9-]+)\)\s+([가-힣A-Za-z0-9.-]+)\s+(\d{1,4}\s*호)/);
  if (g) return `${g[0]} ${g[1]} ${g[2]}`.trim();

  // B: 동번지) 호
  g = R(/\(([가-힣A-Za-z0-9\s.-]*동\s+[0-9-]+)\)\s+(\d{1,4}\s*호)/);
  if (g) return `${g[0]} ${g[1]}`.trim();

  // C: 동번지) 숫자 건물명
  g = R(/\(([가-힣A-Za-z0-9\s.-]*동\s+[0-9-]+)\)\s+(\d{1,4})\s+([가-힣A-Za-z0-9.-]+)\b/);
  if (g) return `${g[0]} ${g[1]} ${g[2]}`.trim();

  return "";
}

/* ---------- 지정/납부 계좌 라인 파싱 (보강 포인트) ---------- */
function extractDesignatedAccount(text) {
  const re =
    /(지정계좌|납부계좌)\s*[:：]?\s*(?:([^\s\n]*)\s*은행)?\s*([0-9]{10,20}|[0-9][0-9-\s]{5,})/;
  const m = String(text || "").match(re);
  if (m) {
    const bankRaw = m[2] ? `${m[2]}은행` : "";
    return { bank: bankRaw, account: cleanAccount(m[3]) };
  }
  return null;
}

/* ---------- 슬래시 호수 보강 ---------- */
function extractSlashHo(raw) {
  const m = (raw || "").match(/\/\s*(\d{1,4}\s*호)/);
  return m ? (m[1] || "").trim() : "";
}

/* ---------- 주소 처리(기존 + 보강) ---------- */
function extractParenDetail(s) {
  const m = (s || "").match(/\(([^)]*?)\)$/);
  if (!m) return "";
  const body = m[1] || "";
  if (body.includes("*")) return "";
  if (/(호|동\s*\d|[0-9-]+,\s*[가-힣A-Za-z])/.test(body)) {
    return body.replace(/\s{2,}/g, " ").trim();
  }
  return "";
}
function extractParenRunOn(raw) {
  const re = /\(([^$]*?)\)\s*([^\n]*?(?:\d{1,4}\s*호[^\n]*?)?)/u;
  const m = (raw || "").match(re);
  if (!m) return "";
  const inParen = (m[1] || "").trim();
  const after = (m[2] || "").trim();
  if (!inParen || inParen.includes("*")) return "";
  const joined = `${inParen} ${after}`.replace(/\s{2,}/g, " ").trim();
  return joined.replace(/\.+$/g, "");
}
function cleanMaskedAddress(s) {
  let a = (s || "").trim();
  a = a.replace(/\([^)]*\)$/g, (m) => (m.includes("*") ? "" : m));
  a = a.replace(/\*/g, "");
  a = a.replace(/\s{2,}/g, " ");
  a = a.replace(/(로|길)(\d)/g, "$1 $2");
  a = a.replace(/[.,\s]+$/g, "").trim();
  return a;
}
function trailAddressHint(raw) {
  const lines = (raw || "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const v = lines[i];
    if (/^[.–—-]+$/.test(v) || /^감사합니다[.!]?$/.test(v)) continue;
    if (/^\*+$/.test(v)) continue;
    const m =
      v.match(/([가-힣A-Za-z]+(?:빌|빌라|하임|타운|하우스|아파트|팰리스|캐슬|리버|코트|타워|힐|플루메리아|아뜰리에|늘봄|한남)[\sA-Za-z0-9-]*\s?\d{0,4}\s?호?)/u) ||
      v.match(/([가-힣A-Za-z]+)\s?\d{1,4}\s?호/u);
    if (m) return m[0].replace(/\*/g, "").trim();
  }
  return "";
}
function inlineAddressLine(raw) {
  const lines = (raw || "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const v of lines) {
    if (/입금바로|청구/.test(v)) continue;
    const m =
      v.match(/([가-힣A-Za-z]+(?:힐|하임|팰리스|아파트|빌라|캐슬|리버|타워|코트|플루메리아|아뜰리에|늘봄)[\sA-Za-z0-9-]*\s?\d{0,4}\s?호[^\n]*)/u) ||
      v.match(/([가-힣A-Za-z]+[\s-]?\d{1,4}\s?호[^\n]*)/u);
    if (m) return m[0].replace(/\*/g, "").trim();
  }
  return "";
}

/* ★ 추가: 맨 아래 줄의 '공간XXXX (옵션: ###호 또는 숫자호)' 감지 */
function extractBottomSpaceHint(raw) {
  // 마지막 non-empty 라인만 검사 (오탐 최소화)
  const lines = String(raw || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "";

  const last = lines[lines.length - 1];

  // 허용 패턴:
  //   - 공간907
  //   - 공간 907
  //   - 공간907 205호
  //   - 공간907 ###호 (###호 그대로 인정)
  //   - (라인 전체가 이 패턴에 '가깝다'가 아니라 '정확히' 이 패턴이어야 함)
  const m =
    last.match(/^공간\s*?(\d{1,4})(?:\s*(\d{1,4}\s*호|###\s*호|###호))?$/) ||
    null;

  if (!m) return "";

  const num = (m[1] || "").replace(/\s+/g, "");
  const hoRaw = (m[2] || "").replace(/\s+/g, "");
  return hoRaw ? `공간${num} ${hoRaw}` : `공간${num}`;
}

/* ✅ 주소 후처리 */
function dedupeAddress(addr) {
  let a = (addr || "").trim();
  if (!a) return "";

  a = a.replace(/\b[가-힣A-Za-z]*은행\b/g, "").replace(/\s{2,}/g, " ").trim();
  a = a.replace(/(\S+?\s*\d{1,4}\s*호)(?:\s+\1)+/g, "$1");

  const tokens = a.split(/\s+/);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i];
    const prev = out[out.length - 1];
    if (cur !== prev) out.push(cur);
  }
  a = out.join(" ").replace(/\s{2,}/g, " ").trim();

  a = a.replace(/\s*\)+$/g, ")").replace(/\(\s*\)/g, "").trim();
  return a;
}

/* ---------- 금액 합계(①~⑤) ---------- */
function sumBreakdown(text) {
  const pick = (re) => toNumber(matchFirst(text, re));
  const a = pick(/당월이사정산요금\s*[:：]?\s*([\d,]+)\s*원/);
  const b = pick(/직전월요금\s*[:：]?\s*([\d,]+)\s*원/);
  const c = pick(/미납요금\s*[:：]?\s*([\д,]+)\s*원/);
  const d = pick(/착오수납(?:금액)?\s*[:：]?\s*([\д,]+)\s*원/);
  const e = pick(/분납(?:청구)?금액\s*[:：]?\s*([\д,]+)\s*원/);
  const sum = a + b + c + d + e;
  return sum > 0 ? String(sum) : "";
}

/* ---------- CNCITY 목록형 ---------- */
function extractBankAccountsList(raw) {
  const map = {};
  const lines = (raw || "").replace(/\r\n?/g, "\n").split("\n");
  const re = /^(농협|농협은행|신한|신한은행|국민|국민은행|KEB하나|하나|하나은행|우리)\s*([0-9][0-9-\s]{5,})?/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const bank = normalizeBank(m[1]);
      const acct = m[2] ? cleanAccount(m[2]) : "";
      if (acct) map[bank] = acct;
    }
  }
  return map;
}
function pickPreferredBank(map) {
  const order = ["농협", "신한", "국민"];
  for (const b of order) {
    if (map[b]) return { bank: b, acct: map[b] };
  }
  const k = Object.keys(map)[0];
  return k ? { bank: k, acct: map[k] } : null;
}

/* ---------- 은행 보조 ---------- */
function normalizeBank(name) {
  const s = String(name || "").replace(/은행$/, "");
  if (/농협/.test(s)) return "농협";
  if (/국민/.test(s)) return "국민";
  if (/신한/.test(s)) return "신한";
  if (/우리/.test(s)) return "우리";
  if (/하나|KEB/.test(s)) return "하나";
  if (/기업|기업은행/.test(s)) return "기업";
  if (/새마을금고/.test(s)) return "새마을금고";
  if (/SC제일/.test(s)) return "SC제일";
  if (/씨티/.test(s)) return "씨티";
  if (/카카오/.test(s)) return "카카오";
  if (/토스/.test(s)) return "토스";
  return s || "";
}
function inferBankFromText(text) {
  if (/농협/.test(text)) return "농협";
  if (/신한/.test(text)) return "신한";
  if (/국민/.test(text)) return "국민";
  if (/우리/.test(text)) return "우리";
  if (/하나|KEB/.test(text)) return "하나";
  if (/기업|기업은행/.test(text)) return "기업";
  if (/새마을금고/.test(text)) return "새마을금고";
  if (/SC제일/.test(text)) return "SC제일";
  if (/씨티/.test(text)) return "씨티";
  if (/카카오/.test(text)) return "카카오";
  if (/토스/.test(text)) return "토스";
  return "";
}
function inferBankFromAccountNeighborhood(raw, acct) {
  const a = cleanAccount(acct).split(" ")[0];
  const lines = (raw || "").replace(/\r\n?/g, "\n").split("\n");
  const idx = lines.findIndex((ln) => ln.includes(a));
  const search = [];
  if (idx >= 0) {
    for (let i = Math.max(0, idx - 1); i <= Math.min(lines.length - 1, idx + 1); i++) {
      search.push(lines[i]);
    }
  }
  const around = search.join(" ");
  return inferBankFromText(around);
}

/* ---------- 공통 유틸 ---------- */
function collapseSpaces(s) {
  return String(s || "").replace(/\r\n?/g, "\n").replace(/[\t\u00A0]+/g, " ");
}
function matchFirst(text, re) {
  const m = String(text || "").match(re);
  return m ? (m[2] ?? m[1] ?? "").toString().trim() : "";
}
function withWon(n) {
  const num = toNumber(n);
  return num ? num.toLocaleString() + "원" : "";
}
function toNumber(n) {
  return parseInt(String(n).replace(/[^0-9]/g, ""), 10) || 0;
}
function largestMoneyLike(text) {
  const all = [...String(text || "").matchAll(/(\d{1,3}(?:,\d{3})+)\s*원?/g)].map((m) => m[1]);
  if (!all.length) return "";
  return all.sort((a, b) => toNumber(b) - toNumber(a))[0];
}
function cleanAccount(a) {
  return String(a || "").replace(/[^\d- ]/g, "").replace(/\s{2,}/g, " ").trim();
}
function digits(s) {
  return String(s || "").replace(/[^0-9]/g, "");
}

/* ---------- 주소 휴리스틱(백업) ---------- */
function extractAddressHeuristic(raw) {
  const line = collapseSpaces(raw).replace(/\n/g, " ").trim();
  const metro = "(서울|부산|대구|인천|광주|대전|울산|세종|제주)(?:특별자치|특별|광역)?시";
  const province = "(경기|강원|충북|충남|전북|전남|경북|경남)(?:특별자치)?도";
  const anyGu = "(?:중구|동구|서구|대덕구|유성구|남구|북구|수성구|달서구|달성군|연수구|남동구|부평구|계양구|미추홀구|해운대구|수영구|사하구|사상구|동래구|금정구|기장군|용인시|성남시|수원시|고양시|화성시|청주시|천안시)?";
  const road = "(?:[가-힣A-Za-z]+로\\s*\\d+(?:번길)?(?:\\s*\\d+)?)";
  const lot = "(?:\\([가-힣0-9\\-\\s]*동\\s*\\d+[\\-\\d]*\\))";
  const ho = "\\d{1,4}\\s*호";
  const re = new RegExp(
    `((?:${metro}|${province}))\\s*${anyGu}[^\\n]{0,160}?(?:${road})?[^\\n]{0,80}?(?:${lot})?[^\\n]{0,40}?(?:${ho})`,
    "u"
  );
  const m = line.match(re);
  if (m) return cleanMaskedAddress(m[0]);
  const m2 = line.match(/(\S+(?:빌|빌라|하임|타운|하우스|아파트|팰리스|힐)\S*\s*\d{1,4}\s*호)/u);
  if (m2) return cleanMaskedAddress(m2[0]);
  return "";
}

/* ========================= 결과 테이블 ========================= */
function ResultTable({ rows, onSend, onDelete }) {
  const HEADERS = ["일자", "주소", "금액", "은행", "계좌번호", "납부마감일", "보내기"];
  return (
    <table className="min-w-full table-fixed text-left text-[12px]">
      <colgroup>
        <col className="w-[10%]" />
        <col className="w-[54%]" />
        <col className="w-[9%]" />
        <col className="w-[7%]" />
        <col className="w-[13%]" />
        <col className="w-[3%]" />
        <col className="w-[7%]" />
      </colgroup>
      <thead className="bg-gradient-to-r from-gray-50 to-gray-100 text-gray-700">
        <tr>
          {HEADERS.map((h) => (
            <th
              key={h}
              className="border-b px-3 py-2 font-semibold text-center whitespace-nowrap"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="[&>tr:nth-child(odd)]:bg-white [&>tr:nth-child(even)]:bg-gray-50">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={HEADERS.length} className="px-3 py-8 text-center text-gray-400 whitespace-nowrap">
              결과 미리보기 (0건)
            </td>
          </tr>
        ) : (
          rows.map((r, i) => (
            <tr key={i} className="hover:bg-violet-50/60">
              <Td>{r.일자}</Td>
              <Td className="truncate" title={r.주소}>{r.주소}</Td>
              <Td className="text-right tabular-nums">{r.금액}</Td>
              <Td className={`text-center ${!r.은행 ? "text-gray-400" : ""}`}>{r.은행 || ""}</Td>
              <Td className="truncate" title={r.계좌번호}>{r.계좌번호}</Td>
              <Td className="text-center">{r.납부마감일}</Td>
              <Td>
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => onSend?.(r, i)}
                    className="whitespace-nowrap rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-[12px] font-semibold text-violet-700 hover:bg-violet-100"
                    title="이 행을 출금보류창으로 보냅니다"
                  >
                    보내기
                  </button>
                  <button
                    onClick={() => onDelete?.(i)}
                    className="whitespace-nowrap rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[12px] text-rose-700 hover:bg-rose-100"
                    title="이 행 삭제"
                  >
                    삭제
                  </button>
                </div>
              </Td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
function Td({ children, className = "" }) {
  return <td className={`border-b px-3 py-2 text-gray-800 ${className}`}>{children}</td>;
}
