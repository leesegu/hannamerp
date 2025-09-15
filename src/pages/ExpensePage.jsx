// src/pages/ExpensePage.jsx
import React, {
  useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle,
} from "react";
import "./ExpensePage.css";
import { db } from "../firebase";
import {
  collection, getDocs, addDoc, serverTimestamp, query, orderBy, where, limit,
} from "firebase/firestore";

/** ====== 상수 ====== */
const INITIAL_ROWS = 20;
const LS_KEY = "ExpensePage:WIP:v1";

/** 숫자 유틸 */
const toNumber = (v) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmtComma = (v) => {
  const n = toNumber(v);
  return n ? n.toLocaleString() : "";
};
const todayYMD = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/** 행 기본값 */
const makeEmptyRow = (i) => ({
  no: i + 1,
  mainId: "",     // 대분류: acct_expense_main.id
  mainName: "",   // 표시용
  subName: "",    // 소분류는 문자열(해당 대분류의 subs 값)
  desc: "",
  amount: "",
  inAccount: "",  // 입금 계좌번호 (자유입력 + 제안 선택)
  outMethod: "",  // 출금계좌(결제방법) - 이름 문자열
  paid: "",       // ✅ 기본값 = 빈칸
  note: "",
});

/** ====== 간단 드롭다운 ====== */
const SimpleCombo = forwardRef(function SimpleCombo(
  { value, onPick, items = [], placeholder = "- 선택 -", render = (x) => x.name ?? x, getKey = (x) => x.id ?? x, getValue = (x) => x.name ?? x },
  ref
) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
    focus: () => {
      setFocus(true);
      setOpen(true);
      setTimeout(() => setFocus(false), 0);
    },
  }));

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (it) => {
    const val = getValue(it);
    onPick?.(it, val);
    setOpen(false);
  };

  const label = value || placeholder;

  return (
    <div className="scombo" ref={wrapRef}>
      <button
        type="button"
        className={`xp-input scombo-btn ${!value ? "scombo-placeholder" : ""}`}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => focus && setOpen(true)}
        title={label}
      >
        <span className="scombo-text">{label}</span>
        <i className="ri-arrow-down-s-line scombo-caret" />
      </button>
      {open && (
        <div className="scombo-panel">
          {items.length === 0 && <div className="scombo-empty">항목 없음</div>}
          {items.map((it) => (
            <button key={getKey(it)} type="button" className="scombo-item" onClick={() => pick(it)}>
              {render(it)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

/** ====== 검색형 콤보(입금 계좌번호) ====== */
const AccountCombo = forwardRef(function AccountCombo({ value, onChange, vendors, placeholder }, ref) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || "");

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => setQ(value || ""), [value]);

  const inputRef = useRef(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = vendors || [];
    if (!needle) return base.slice(0, 10);
    return base
      .filter((v) => {
        return (
          String(v.vendor).toLowerCase().includes(needle) ||
          String(v.accountName).toLowerCase().includes(needle) ||
          String(v.accountNo).toLowerCase().includes(needle)
        );
      })
      .slice(0, 12);
  }, [q, vendors]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (hit) => {
    const label = [hit.bank, hit.accountNo, hit.accountName].filter(Boolean).join(" ");
    onChange(label, hit);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      if (list.length > 0) {
        pick(list[0]);
      } else {
        onChange(q, null);
        setOpen(false);
      }
    }
  };

  return (
    <div className="combo" ref={wrapRef}>
      <input
        ref={inputRef}
        className="xp-input combo-input"
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="combo-panel">
          {list.length === 0 && <div className="combo-empty">검색 결과 없음</div>}
          {list.map((hit) => (
            <button
              key={hit.id}
              type="button"
              className="combo-item"
              onClick={() => pick(hit)}
              title={`${hit.vendor || "-"}`}
            >
              <div className="combo-line1">{hit.vendor || "-"}</div>
              <div className="combo-line2">
                <span className="combo-bank">{hit.bank || "-"}</span>
                <span className="combo-acc">{hit.accountNo || "-"}</span>
                <span className="combo-holder">{hit.accountName || "-"}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

/** ====== 출금확인 콤보 ======
 * - 목록: 출금대기 / 출금완료
 * - 기본 표시: 빈칸
 * - '출금완료' 시 회색 진하게 + 내용에 선
 */
const PaidCombo = forwardRef(function PaidCombo({ value, onPick }, ref) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const items = ["출금대기", "출금완료"]; // ✅ (공란) 제거, 기본표시는 value가 빈칸이라 버튼엔 공백으로만 보임

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
    focus: () => btnRef.current?.focus(),
  }));

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const btnRef = useRef(null);
  const label = value || ""; // ✅ 기본은 빈칸

  return (
    <div className="scombo" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`xp-input scombo-btn ${!value ? "scombo-placeholder" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={label}
      >
        <span className="scombo-text">{label}</span>
        <i className="ri-arrow-down-s-line scombo-caret" />
      </button>
      {open && (
        <div className="scombo-panel">
          {items.map((it) => (
            <button
              key={it}
              type="button"
              className="scombo-item"
              onClick={() => {
                onPick(it);
                setOpen(false);
              }}
            >
              {it}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

/** ====== 메인 컴포넌트 ====== */
export default function ExpensePage() {
  const dateRef = useRef(null);
  const [date, setDate] = useState(todayYMD());
  const [rows, setRows] = useState(() => Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i)));

  // 드롭다운 원본 데이터
  const [mainCats, setMainCats] = useState([]);     // [{id, name, subs:[]}]
  const [payMethods, setPayMethods] = useState([]); // [{id, name}]
  const [vendors, setVendors] = useState([]);       // [{id,vendor,bank,accountName,accountNo}]

  // 각 행 컨트롤 참조/오프너
  const openers = useRef({});
  const registerOpeners = (i, obj) => { openers.current[i] = obj; };

  /** 초기 로드 + 로컬 복구 */
  useEffect(() => {
    (async () => {
      try {
        const qsMain = await getDocs(query(collection(db, "acct_expense_main"), orderBy("order", "asc")));
        const mains = qsMain.docs.map((d) => {
          const x = { id: d.id, ...(d.data() || {}) };
          return { id: x.id, name: x.name || x.title || "", subs: Array.isArray(x.subs) ? x.subs : [] };
        });
        setMainCats(mains);
      } catch { setMainCats([]); }

      try {
        const qsPay = await getDocs(query(collection(db, "acct_payment_methods"), orderBy("order", "asc")));
        const pays = qsPay.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })).map((x) => ({ id: x.id, name: x.name || x.title || "" }));
        setPayMethods(pays);
      } catch { setPayMethods([]); }

      try {
        const qsVen = await getDocs(collection(db, "vendorsAll"));
        const v = qsVen.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })).map((x) => ({
          id: x.id,
          vendor: String(x.vendor || ""),
          bank: String(x.bank || ""),
          accountName: String(x.accountName || ""),
          accountNo: String(x.accountNo || ""),
        }));
        setVendors(v);
      } catch { setVendors([]); }

      // 로컬 미저장 작업 복구
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.date) setDate(parsed.date);
          if (Array.isArray(parsed?.rows) && parsed.rows.length) {
            setRows(parsed.rows.map((r, i) => ({ ...makeEmptyRow(i), ...r })));
          }
        }
      } catch {}
    })();
  }, []);

  /** 합계 */
  const total = useMemo(() => rows.reduce((acc, r) => acc + toNumber(r.amount), 0), [rows]);

  /** 행 변경 처리 */
  const updateRow = (idx, patch) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[idx], ...patch };
      if (patch.mainId !== undefined) {
        row.subName = "";
        row.mainName = mainCats.find((m) => m.id === patch.mainId)?.name || "";
      }
      next[idx] = row;
      return next;
    });
  };

  /** 빈 행 추가 */
  const addRows = (n = 10) => {
    setRows((prev) => {
      const start = prev.length;
      const extra = Array.from({ length: n }, (_, i) => makeEmptyRow(start + i));
      return [...prev, ...extra];
    });
  };

  /** 로컬 WIP 자동 저장 */
  useEffect(() => {
    const payload = { date, rows };
    try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch {}
  }, [date, rows]);

  /** 저장 */
  const onSave = async () => {
    const cleaned = rows
      .map((r) => ({ ...r, amount: toNumber(r.amount) }))
      .filter((r) =>
        r.mainId || r.subName || r.desc || r.amount || r.inAccount || r.outMethod || r.paid || r.note
      );

    if (cleaned.length === 0) {
      alert("저장할 내용이 없습니다.");
      return;
    }

    try {
      await addDoc(collection(db, "expenses"), {
        date,
        rows: cleaned.map((r) => ({
          no: r.no,
          mainId: r.mainId,
          mainName: r.mainName,
          subName: r.subName,
          desc: r.desc,
          amount: r.amount,
          inAccount: r.inAccount,
          outMethod: r.outMethod,
          paid: r.paid,
          note: r.note,
        })),
        total,
        createdAt: serverTimestamp(),
      });

      // ✅ 저장 성공 처리
      alert("저장되었습니다.");
      try { localStorage.removeItem(LS_KEY); } catch {}

      // ✅ 테이블 비우기(초기 빈 행으로 재설정)
      setRows(Array.from({ length: INITIAL_ROWS }, (_, i) => makeEmptyRow(i)));

    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  /** 불러오기: 현재 날짜 최신 1건 */
  const onLoad = async () => {
    try {
      const qs = await getDocs(
        query(
          collection(db, "expenses"),
          where("date", "==", date),
          orderBy("createdAt", "desc"),
          limit(1)
        )
      );
      if (qs.empty) {
        alert("해당 날짜의 저장된 데이터가 없습니다.");
        return;
      }
      const data = qs.docs[0].data() || {};
      const loadedRows = Array.isArray(data.rows) ? data.rows : [];

      const normalized = loadedRows.map((r, i) => ({
        ...makeEmptyRow(i),
        ...r,
        no: i + 1,
        amount: r.amount ? fmtComma(r.amount) : "",
        paid: r.paid || "", // ✅ 기본 빈칸 유지
      }));
      const pad = Math.max(0, INITIAL_ROWS - normalized.length);
      const padded = pad > 0
        ? [...normalized, ...Array.from({ length: pad }, (_, k) => makeEmptyRow(normalized.length + k))]
        : normalized;

      setRows(padded);
      try { localStorage.setItem(LS_KEY, JSON.stringify({ date, rows: padded })); } catch {}
      alert("불러오기가 완료되었습니다.");
    } catch (e) {
      console.error(e);
      alert("불러오기 중 오류가 발생했습니다.");
    }
  };

  const openNextRowMain = (i) => {
    const next = openers.current[i + 1];
    if (next?.openMain) next.openMain();
  };

  return (
    <div className="xp-page">
      {/* 상단 바: 좌측 버튼 / 우측 축소 패널 */}
      <div className="xp-top slim fancy">
        <div className="xp-actions">
          <button className="xp-btn xp-load small" onClick={onLoad} title="불러오기">불러오기</button>
          <button className="xp-btn xp-save small" onClick={onSave} title="저장">저장</button>
        </div>

        <div
          className="xp-side fancy-panel narrow"
          onClick={() => document.activeElement?.blur()}
        >
          <div className="xp-side-row xp-side-sum">
            <div className="xp-side-label">합계</div>
            <div className="xp-side-krw">₩</div>
            <div className="xp-side-val">{fmtComma(total) || "-"}</div>
          </div>
          <div
            className="xp-side-row xp-side-date"
            onClick={(e) => {
              const input = e.currentTarget.querySelector("input[type='date']");
              input?.showPicker?.();
            }}
          >
            <div className="xp-side-label">지출일자</div>
            <input
              ref={dateRef}
              type="date"
              className="xp-date-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 테이블 (스크롤 가능) */}
      <div className="xp-table-wrap scrollable">
        <table className="xp-table">
          <thead>
            <tr>
              <th style={{ width: 56 }}>번호</th>
              <th style={{ width: 140 }}>대분류</th>
              <th style={{ width: 160 }}>소분류</th>
              <th style={{ width: 320 }}>내용</th>
              <th style={{ width: 140 }}>금액</th>
              <th style={{ width: 260 }}>입금 계좌번호</th>
              <th style={{ width: 150 }}>출금계좌</th>
              <th style={{ width: 120 }}>출금확인</th>
              <th style={{ width: 240 }}>비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <RowEditor
                key={i}
                idx={i}
                row={r}
                mains={mainCats}
                payMethods={payMethods}
                vendors={vendors}
                onChange={(patch) => updateRow(i, patch)}
                registerOpeners={registerOpeners}
                openNextRowMain={() => openNextRowMain(i)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="xp-bottom-actions">
        <button className="xp-add-rows" onClick={() => addRows(10)}>+ 10줄 더 추가</button>
      </div>
    </div>
  );
}

/** ====== Row 컴포넌트 ====== */
function RowEditor({ idx, row, mains, payMethods, vendors, onChange, registerOpeners, openNextRowMain }) {
  const mainRef = useRef(null);
  const subRef = useRef(null);
  const descRef = useRef(null);
  const amtRef = useRef(null);
  const inAccRef = useRef(null);
  const outRef = useRef(null);
  const paidRef = useRef(null);
  const noteRef = useRef(null);

  useEffect(() => {
    registerOpeners(idx, {
      openMain: () => mainRef.current?.focus(),
    });
  }, [idx, registerOpeners]);

  const subItems = useMemo(() => {
    const m = mains.find((x) => x.id === row.mainId);
    return (m?.subs || []).map((name, i) => ({ id: `${m?.id || "m"}-${i}`, name }));
  }, [mains, row.mainId]);

  const onAmountChange = (e) => {
    const raw = e.target.value;
    const num = toNumber(raw);
    const withComma = num ? num.toLocaleString() : "";
    onChange({ amount: withComma });
  };

  const isPaidDone = row.paid === "출금완료";

  return (
    <tr className={isPaidDone ? "xp-tr-paid" : ""}>
      <td className="xp-td-no">{row.no}</td>

      {/* 대분류 */}
      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <SimpleCombo
          ref={mainRef}
          value={row.mainName}
          items={mains}
          onPick={(it) => {
            onChange({ mainId: it.id, mainName: it.name });
            setTimeout(() => subRef.current?.open(), 0);
          }}
          placeholder="- 선택 -"
        />
      </td>

      {/* 소분류 */}
      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <SimpleCombo
          ref={subRef}
          value={row.subName}
          items={subItems}
          onPick={(it) => {
            onChange({ subName: it.name });
            setTimeout(() => descRef.current?.focus(), 0);
          }}
          placeholder={row.mainId ? "- 선택 -" : "대분류 먼저 선택"}
        />
      </td>

      {/* 내용 */}
      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <input
          ref={descRef}
          className="xp-input"
          value={row.desc}
          onChange={(e) => onChange({ desc: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") amtRef.current?.focus(); }}
        />
      </td>

      {/* 금액 */}
      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <input
          ref={amtRef}
          className="xp-input xp-amt"
          inputMode="numeric"
          value={row.amount}
          onChange={onAmountChange}
          onKeyDown={(e) => { if (e.key === "Enter") { inAccRef.current?.focus(); inAccRef.current?.open(); } }}
        />
      </td>

      {/* 입금 계좌번호 */}
      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <AccountCombo
          ref={inAccRef}
          value={row.inAccount}
          onChange={(v) => onChange({ inAccount: v })}
          vendors={vendors}
          placeholder="거래처/예금주/계좌번호 검색"
        />
      </td>

      {/* 출금계좌 */}
      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <SimpleCombo
          ref={outRef}
          value={row.outMethod}
          items={payMethods}
          onPick={(it) => {
            onChange({ outMethod: it.name });
            setTimeout(() => { paidRef.current?.open(); }, 0);
          }}
          placeholder="- 선택 -"
        />
      </td>

      {/* 출금확인 */}
      <td className={isPaidDone ? "xp-td-dim-dark" : ""}>
        <PaidCombo
          ref={paidRef}
          value={row.paid}
          onPick={(v) => {
            onChange({ paid: v || "" }); // ✅ 빈칸 허용
            if (v) setTimeout(() => noteRef.current?.focus(), 0);
          }}
        />
      </td>

      {/* 비고 (회색 처리 제외) */}
      <td>
        <input
          ref={noteRef}
          className="xp-input"
          value={row.note}
          onChange={(e) => onChange({ note: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") openNextRowMain(); }}
        />
      </td>
    </tr>
  );
}
