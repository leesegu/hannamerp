// src/pages/MessageExtractor.jsx
import React, { useState } from "react";

/**
 * 전기요금 추출 페이지 (컨텐츠 영역 가득 + 스크롤 없음)
 * - 흰 배경이 부모 컨테이너(메인 영역)를 정확히 덮도록 absolute inset-0 사용
 * - 결과 컬럼: 일자, 주소, 금액, 은행, 계좌번호, 납부마감일
 * - 초기화 분리: 메시지 초기화(입력만), 결과 초기화(결과만)
 * - 추출 시 결과 누적
 * - 주소 라벨 없는 문장(고객지정계좌안내 등)도 한국 주소 휴리스틱으로 추출
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

  return (
    <div className="relative h-full w-full">
      {/* 흰 배경이 컨텐츠 영역을 완전히 덮도록 고정 */}
      <div className="absolute inset-0 bg-white overflow-hidden">
        {/* 헤더: 좌우 여백 최소화, 낮은 높이 */}
        <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200">
          <h1 className="text-[13px] font-semibold tracking-tight">전기요금 추출</h1>
          <div className="flex gap-1">
            <button
              onClick={onExtract}
              className="rounded px-2 py-0.5 text-[11px] font-medium ring-1 ring-gray-300 bg-white hover:bg-gray-100"
            >
              추출하기
            </button>
            <button
              onClick={clearMessage}
              className="rounded px-2 py-0.5 text-[11px] font-medium ring-1 ring-gray-300 bg-white hover:bg-gray-100"
              title="입력창만 비움"
            >
              메시지 초기화
            </button>
            <button
              onClick={clearResults}
              className="rounded px-2 py-0.5 text-[11px] font-medium ring-1 ring-red-300 bg-white hover:bg-red-50"
              title="결과만 비움"
            >
              결과 초기화
            </button>
          </div>
        </div>

        {/* 본문: 부모 높이에 맞춰 정확히 계산, 내부/외부 스크롤 없음 */}
        <div className="flex w-full" style={{ height: "calc(100% - 30px)" }}>
          {/* 왼쪽 입력(더 작게) */}
          <div className="basis-[16%] border-r border-gray-200">
            <div className="px-2 py-1">
              <div className="mb-1 text-[10px] font-medium text-gray-600">메시지 붙여넣기</div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="문자 내용을 그대로 붙여넣으세요"
                className="w-full rounded border border-gray-200 p-1.5 text-[12px] outline-none focus:ring-2 focus:ring-violet-400"
                style={{
                  height: "calc(100% - 40px)", // 패딩/라벨 높이 보정
                  resize: "none",
                  overflow: "hidden", // 넘치면 잘림(스크롤 X)
                }}
                spellCheck={false}
              />
              <div className="mt-1 text-[10px] text-gray-500">
                여러 메시지는 빈 줄 또는 <code className="rounded bg-gray-100 px-1">제목</code>으로 구분됩니다.
              </div>
            </div>
          </div>

          {/* 가운데 결과(좁게) */}
          <div className="basis-[60%]">
            <div className="px-2 py-1 h-full">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[11px] font-medium text-gray-600">
                  결과 미리보기 <span className="text-gray-400">({rows.length}건)</span>
                </div>
              </div>
              <div className="rounded border border-gray-200 overflow-hidden" style={{ height: "calc(100% - 26px)" }}>
                <ResultTable rows={rows} />
              </div>
            </div>
          </div>

          {/* 오른쪽 여백(화이트, 오버플로우 방지용) */}
          <div className="flex-1 bg-white" />
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
  const normalized = text.replace(/\r\n?/g, "\n");
  const parts = normalized
    .split(/\n(?=제목\b|제목:)/g)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts;
  return normalized
    .split(/\n\s*\n+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseOne(block) {
  const original = block;
  const text = collapseSpaces(block);

  const bank =
    matchFirst(text, /(농협|농협은행|국민|신한|우리|하나|기업|SC제일|씨티|카카오|토스)\s*은행?/) ||
    inferBankFromText(text);

  const account =
    matchFirst(text, /(?:계좌|계좌번호|지정계좌)\s*[:：]?\s*([0-9][0-9\-\s]{5,})/) ||
    matchFirst(text, /(\b\d{2,3}[\s-]\d{2,6}[\s-]\d{2,6}\b)/) ||
    matchFirst(text, /(\b\d{6,}[\-\s]\d{2,6}[\-\s]\d{2,6}\b)/);

  const due =
    matchFirst(text, /납부마감일\s*[:：]?\s*(\d{4}[.\/]\d{2}[.\/]\d{2})/) ||
    matchFirst(text, /(\d{4}[.\/]\d{2}[.\/]\d{2})\s*까지/);

  const settleDate = matchFirst(text, /정산일자\s*[:：]?\s*(\d{4}[.\/]\d{2}[.\/]\d{2})/);
  const applyDate  = matchFirst(text, /신청일자\s*[:：]?\s*(\d{4}[.\/]\d{2}[.\/]\d{2})/);
  const moveDate   = matchFirst(text, /이사일자\s*[:：]?\s*(\d{4}[.\/]\d{2}[.\/]\d{2})/);
  const date = settleDate || applyDate || moveDate || "";

  let address = matchFirst(text, /(전기사용장소|주소)\s*[:：]?\s*([^\n]+?)(?:\s{2,}|\n|  |$)/);
  if (!address) address = extractAddressHeuristic(original);

  let amount = matchFirst(text, /정산요금\s*[:：]?\s*([\d,]+)\s*원/);
  if (!amount) {
    const strong = matchFirst(text, /납부(?:할)?요금(?:은)?\s*([\d,]+)\s*원/);
    if (strong) amount = strong;
  }
  if (!amount) {
    const allNumbers = [...text.matchAll(/(\d{1,3}(?:,\d{3})+)(?:\s*원)?/g)].map((m) => m[1]);
    if (allNumbers.length) amount = allNumbers.sort((a, b) => toNumber(b) - toNumber(a))[0];
  }
  const amountDisplay = amount ? withWon(amount) : "";

  const accountClean = account ? account.replace(/\s{2,}/g, " ").trim() : "";

  if (!date && !address && !amountDisplay && !accountClean && !due && !bank) return null;

  return {
    일자: date,
    주소: address || "",
    금액: amountDisplay,
    은행: bank || "",
    계좌번호: accountClean,
    납부마감일: due || "",
  };
}

/* ---------- 주소 휴리스틱 ---------- */
function extractAddressHeuristic(raw) {
  const line = collapseSpaces(raw).replace(/\n/g, " ").trim();

  const metro = "(서울|부산|대구|인천|광주|대전|울산|세종|제주)(?:특별자치|특별|광역)?시";
  const province = "(경기|강원|충북|충남|전북|전남|경북|경남)(?:특별자치)?도";
  const daejeonGu = "(중구|동구|서구|대덕구|유성구)";
  const anyGu =
    "(?:중구|동구|서구|대덕구|유성구|남구|북구|수성구|달서구|달성군|연수구|남동구|부평구|계양구|미추홀구|해운대구|수영구|사하구|사상구|동래구|금정구|기장군|용인시|성남시|수원시|고양시|화성시|청주시|천안시)?";

  const road = "(?:[가-힣A-Za-z]+로\\s*\\d+(?:번길)?(?:\\s*\\d+)?)";
  const lot  = "(?:\\([가-힣0-9\\-\\s]*동\\s*\\d+[\\-\\d]*\\))";
  const ho   = "\\d{1,4}\\s*호";

  const reDaejeonStrong = new RegExp(
    `(대전광역시)\\s*${daejeonGu}[^\\n]{0,120}?(?:${road})?[^\\n]{0,80}?(?:${lot})?[^\\n]{0,40}?(?:${ho})`,
    "u"
  );
  const m1 = line.match(reDaejeonStrong);
  if (m1) return normalizeAddress(m1[0]);

  const reGeneral = new RegExp(
    `((?:${metro}|${province}))\\s*${anyGu}[^\\n]{0,140}?(?:${road})?[^\\n]{0,80}?(?:${lot})?[^\\n]{0,40}?(?:${ho})`,
    "u"
  );
  const m2 = line.match(reGeneral);
  if (m2) return normalizeAddress(m2[0]);

  const reLoose = new RegExp(
    `((?:${metro}|${province}))\\s*${anyGu}[^\\n]{0,160}?(?:${road})`,
    "u"
  );
  const m3 = line.match(reLoose);
  if (m3) return normalizeAddress(m3[0]);

  const m4 = line.match(/(\S+(?:빌|빌라|아파트|타운|하우스)\S*\s*\d{1,4}\s*호)/u);
  if (m4) return normalizeAddress(m4[0]);

  return "";
}

function normalizeAddress(s) {
  let a = s.trim();
  a = a.replace(/\s{2,}/g, " ");
  a = a.replace(/(로|길)(\d)/g, "$1 $2");
  a = a.replace(/\s*\(\s*/g, " (").replace(/\s*\)\s*/g, ") ");
  a = a.replace(/\(\s*([^)]+?)\s*\)/g, "($1)");
  a = a.replace(/호[^0-9가-힣).]*$/u, "호").trim();
  return a;
}

/* ---------- 공통 유틸 ---------- */
function collapseSpaces(s) { return s.replace(/\r\n?/g, "\n").replace(/[\t\u00A0]+/g, " "); }
function matchFirst(text, re) { const m = text.match(re); return m ? (m[2] ?? m[1] ?? "").toString().trim() : ""; }
function withWon(n) { const num = toNumber(n); return num ? num.toLocaleString() + "원" : ""; }
function toNumber(n) { return parseInt(String(n).replace(/[^0-9]/g, ""), 10) || 0; }
function inferBankFromText(text) {
  if (/농협/.test(text)) return "농협";
  if (/국민/.test(text)) return "국민";
  if (/신한/.test(text)) return "신한";
  if (/우리/.test(text)) return "우리";
  if (/하나/.test(text)) return "하나";
  if (/기업/.test(text)) return "기업";
  if (/카카오/.test(text)) return "카카오";
  if (/토스/.test(text)) return "토스";
  return "";
}

/* ========================= 테이블 ========================= */
function ResultTable({ rows }) {
  const HEADERS = ["일자", "주소", "금액", "은행", "계좌번호", "납부마감일"];
  return (
    <table className="min-w-full text-left text-[12px] table-fixed">
      <colgroup>
        <col className="w-[11%]" />
        <col className="w-[45%]" />
        <col className="w-[10%]" />
        <col className="w-[7%]" />
        <col className="w-[17%]" />
        <col className="w-[10%]" />
      </colgroup>
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          {HEADERS.map((h) => (
            <th key={h} className="whitespace-nowrap border-b px-2 py-1 font-semibold">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={HEADERS.length} className="px-2 py-5 text-center text-gray-400">추출 결과가 여기에 표시됩니다.</td></tr>
        ) : (
          rows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              <Td>{r.일자}</Td>
              <Td className="truncate" title={r.주소}>{r.주소}</Td>
              <Td>{r.금액}</Td>
              <Td className={!r.은행 ? "text-gray-400" : ""}>{r.은행 || ""}</Td>
              <Td className="truncate" title={r.계좌번호}>{r.계좌번호}</Td>
              <Td>{r.납부마감일}</Td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
function Td({ children, className = "" }) {
  return <td className={`border-b px-2 py-1 text-gray-800 ${className}`}>{children}</td>;
}
