"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface SaleRecord {
  id: string;
  ticker: string;
  stockName?: string;
  market: "TW" | "US";
  sellDate: string;
  sellPrice: number;
  shares: number;
  note?: string;
  maxHigh?: number | null;
  maxHighDate?: string | null;
  lastClose?: number | null;
  currency?: string;
  fetchedAt?: number;
  fetchError?: string;
}

const STORAGE_KEY = "byebyemoney_records_v2";

function loadRecords(): SaleRecord[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function saveRecords(r: SaleRecord[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); }

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("zh-TW", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtCurrency(n: number, currency: string) {
  return currency === "TWD" ? `NT$ ${fmt(n, 0)}` : `$${fmt(n)}`;
}

const cardStyle  = { background: "var(--bg-card)",  border: "1px solid var(--border)" };
const inputStyle = { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--fg)" };

export default function RecordsTab() {
  const [records,   setRecords]   = useState<SaleRecord[]>([]);
  const [showForm,  setShowForm]  = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [usdToTwd,  setUsdToTwd]  = useState<number | null>(null);
  const [fxUpdated, setFxUpdated] = useState<string | null>(null);
  const [fxFallback, setFxFallback] = useState(false);

  // Form state
  const [ticker,   setTicker]   = useState("");
  const [market,   setMarket]   = useState<"TW" | "US">("TW");
  const [sellDate, setSellDate] = useState(new Date().toISOString().split("T")[0]);
  const [sellPrice, setSellPrice] = useState("");
  const [shares,   setShares]   = useState("");
  const [note,     setNote]     = useState("");

  // Ticker lookup
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult,  setLookupResult]  = useState<{ name: string; ticker: string } | null>(null);
  const [lookupError,   setLookupError]   = useState("");
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecords(loadRecords());
    // fetch USD→TWD rate
    fetch("/api/fx").then(r => r.json()).then(d => {
      setUsdToTwd(d.rate);
      setFxFallback(!!d.fallback);
      if (d.updatedAt) {
        // format: "Thu, 05 Jun 2026 00:02:31 +0000" → just date
        try { setFxUpdated(new Date(d.updatedAt).toLocaleDateString("zh-TW")); } catch { setFxUpdated(null); }
      }
    }).catch(() => { setUsdToTwd(32.5); setFxFallback(true); });
  }, []);

  const persistRecords = (r: SaleRecord[]) => { setRecords(r); saveRecords(r); };

  // Auto-lookup ticker/name as user types
  useEffect(() => {
    if (!ticker.trim()) { setLookupResult(null); setLookupError(""); return; }
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(async () => {
      setLookupLoading(true);
      setLookupError("");
      try {
        const res = await fetch(`/api/stocks/lookup?code=${encodeURIComponent(ticker.trim())}`);
        if (res.ok) {
          const d = await res.json();
          setLookupResult({ name: d.name, ticker: d.ticker });
        } else {
          setLookupResult(null);
        }
      } catch { setLookupResult(null); } finally { setLookupLoading(false); }
    }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const fetchStockData = useCallback(async (record: SaleRecord): Promise<Partial<SaleRecord>> => {
    const params = new URLSearchParams({ ticker: record.ticker, market: record.market, sellDate: record.sellDate });
    const res = await fetch(`/api/stock?${params}`);
    if (!res.ok) {
      const err = await res.json();
      return { fetchError: err.error ?? "查詢失敗", fetchedAt: Date.now() };
    }
    const data = await res.json();
    return {
      maxHigh:     data.maxHigh,
      maxHighDate: data.maxHighDate,
      lastClose:   data.lastClose,
      currency:    data.currency,
      fetchError:  undefined,
      fetchedAt:   Date.now(),
    };
  }, []);

  const refreshRecord = async (id: string) => {
    const record = records.find(r => r.id === id);
    if (!record) return;
    setLoadingId(id);
    const updated = await fetchStockData(record);
    persistRecords(records.map(r => r.id === id ? { ...r, ...updated } : r));
    setLoadingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedTicker = lookupResult?.ticker ?? ticker.trim().toUpperCase();
    const resolvedName   = lookupResult?.name;
    const newRecord: SaleRecord = {
      id: Date.now().toString(),
      ticker:    resolvedTicker,
      stockName: resolvedName,
      market,
      sellDate,
      sellPrice: parseFloat(sellPrice),
      shares:    parseFloat(shares),
      note:      note.trim() || undefined,
    };
    const baseRecords = [...records, newRecord];
    persistRecords(baseRecords);
    setShowForm(false);
    setTicker(""); setSellPrice(""); setShares(""); setNote(""); setLookupResult(null);

    setLoadingId(newRecord.id);
    const updated = await fetchStockData(newRecord);
    persistRecords(baseRecords.map(r => r.id === newRecord.id ? { ...r, ...updated } : r));
    setLoadingId(null);
  };

  const deleteRecord = (id: string) => {
    if (!confirm("確定刪除這筆紀錄？")) return;
    persistRecords(records.filter(r => r.id !== id));
  };

  // Dashboard — all amounts converted to TWD
  const fxRate = usdToTwd ?? 32.5;
  const toTWD = (amount: number, currency: string) =>
    currency === "TWD" ? amount : amount * fxRate;

  const recordsWithData  = records.filter(r => r.maxHigh != null);
  const totalMissedTWD   = recordsWithData.reduce((sum, r) => {
    const currency = r.currency ?? (r.market === "TW" ? "TWD" : "USD");
    const missed   = (r.maxHigh! - r.sellPrice) * r.shares;
    return sum + (missed > 0 ? toTWD(missed, currency) : 0);
  }, 0);
  const biggestMiss = recordsWithData.reduce((best, r) => {
    if (r.maxHigh == null) return best;
    const pct = ((r.maxHigh - r.sellPrice) / r.sellPrice) * 100;
    return pct > best.pct ? { pct, record: r } : best;
  }, { pct: -Infinity, record: null as SaleRecord | null });
  const hasUSDRecords = records.some(r => r.market === "US" && r.maxHigh != null);

  return (
    <div className="space-y-6">
      {/* Storage notice */}
      <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-xs"
        style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", color: "#a16207" }}>
        <span className="text-base mt-0.5">🔒</span>
        <span style={{ color: "inherit" }}>
          資料只儲存在您的瀏覽器本機（localStorage），不上傳任何伺服器。
          同一個瀏覽器可查到上次紀錄，但換瀏覽器或清快取就不見了。
        </span>
      </div>

      {/* Dashboard */}
      {records.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl p-5" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <p className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>總共少賺了（新台幣）</p>
              <p className="text-3xl font-bold text-red-500">
                {totalMissedTWD === 0 ? "—" : `NT$ ${fmt(totalMissedTWD, 0)}`}
              </p>
              {hasUSDRecords && usdToTwd && (
                <p className="text-xs mt-1" style={{ color: "var(--fg-subtle)" }}>
                  {fxFallback ? "⚠️ 匯率估算" : `匯率 1 USD = ${fmt(usdToTwd, 2)} TWD`}
                  {fxUpdated && !fxFallback ? `（${fxUpdated}）` : ""}
                </p>
              )}
            </div>
            <div className="rounded-2xl p-5" style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.2)" }}>
              <p className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>最痛一筆</p>
              {biggestMiss.record ? (
                <>
                  <p className="text-3xl font-bold text-orange-500">+{fmt(biggestMiss.pct, 1)}%</p>
                  <p className="text-xs mt-1 font-mono" style={{ color: "var(--fg-subtle)" }}>
                    {biggestMiss.record.stockName ?? biggestMiss.record.ticker} · {biggestMiss.record.market}
                  </p>
                </>
              ) : <p className="text-3xl font-bold" style={{ color: "var(--fg-subtle)" }}>—</p>}
            </div>
          </div>
        </div>
      )}

      {/* Header + Add button */}
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-base" style={{ color: "var(--fg)" }}>
          後悔藥紀錄 {records.length > 0 && <span className="text-sm font-normal" style={{ color: "var(--fg-subtle)" }}>({records.length} 筆)</span>}
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
        >
          {showForm ? "✕ 取消" : "+ 新增"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl p-5 space-y-4 fade-in" style={cardStyle}>
          <div className="grid grid-cols-2 gap-4">
            {/* Stock input */}
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs mb-1.5 block" style={{ color: "var(--fg-muted)" }}>
                股票代號或名稱
              </label>
              <input
                required
                placeholder={market === "TW" ? "如 2330、台積電、0050" : "如 NVDA、AAPL、MSFT"}
                value={ticker}
                onChange={e => setTicker(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={inputStyle}
              />
              <div className="mt-1 h-4 text-xs">
                {lookupLoading && <span style={{ color: "var(--fg-subtle)" }}>🔍 查詢中...</span>}
                {!lookupLoading && lookupResult && (
                  <span style={{ color: "#22c55e" }}>✓ {lookupResult.name} ({lookupResult.ticker})</span>
                )}
                {!lookupLoading && lookupError && <span className="text-red-500">{lookupError}</span>}
              </div>
            </div>

            {/* Market */}
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs mb-1.5 block" style={{ color: "var(--fg-muted)" }}>市場</label>
              <select
                value={market}
                onChange={e => { setMarket(e.target.value as "TW" | "US"); setLookupResult(null); setTicker(""); }}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ ...inputStyle }}
              >
                <option value="TW">🇹🇼 台股 (TWSE)</option>
                <option value="US">🇺🇸 美股 (Yahoo Finance)</option>
              </select>
              <p className="text-xs mt-1" style={{ color: "var(--fg-subtle)" }}>
                {market === "TW" ? "台股資料來源：證交所 TWSE" : "美股資料來源：Yahoo Finance"}
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--fg-muted)" }}>賣出日期</label>
            <input
              type="date"
              required
              value={sellDate}
              max={new Date().toISOString().split("T")[0]}
              onChange={e => setSellDate(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ ...inputStyle, colorScheme: "auto" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: "var(--fg-muted)" }}>
                賣出價格 ({market === "TW" ? "NT$" : "USD"})
              </label>
              <input
                type="number" required min="0.01" step="0.01" placeholder="0.00"
                value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: "var(--fg-muted)" }}>股數（張 × 1000 或股）</label>
              <input
                type="number" required min="1" step="1" placeholder="1000"
                value={shares} onChange={e => setShares(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--fg-muted)" }}>備註（選填）</label>
            <input
              placeholder="e.g. 以為要跌了所以賣掉..."
              value={note} onChange={e => setNote(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={inputStyle}
            />
          </div>

          <button type="submit"
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors cursor-pointer">
            新增紀錄並查詢最高股價
          </button>
        </form>
      )}

      {/* Records list */}
      {records.length === 0 ? (
        <div className="text-center py-16" style={{ color: "var(--fg-subtle)" }}>
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm">還沒有紀錄</p>
          <p className="text-xs mt-1">點「新增」把你賣飛的股票加進來</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(r => {
            const sellTotal = r.sellPrice * r.shares;
            const isLoading = loadingId === r.id;
            const currency  = r.currency ?? (r.market === "TW" ? "TWD" : "USD");
            let missedAmount: number | null = null;
            let missedPct:    number | null = null;
            if (r.maxHigh != null) {
              missedAmount = (r.maxHigh - r.sellPrice) * r.shares;
              missedPct    = ((r.maxHigh - r.sellPrice) / r.sellPrice) * 100;
            }
            const isMissed = missedAmount != null && missedAmount > 0;

            return (
              <div key={r.id} className="rounded-2xl p-4 space-y-3 transition-all hover:shadow-sm" style={cardStyle}>
                {/* Top */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-lg px-2 py-0.5 text-xs font-bold font-mono"
                      style={{ background: "var(--bg-hover)", color: "var(--fg)" }}>
                      {r.ticker}
                    </span>
                    {r.stockName && (
                      <span className="text-sm font-medium" style={{ color: "var(--fg)" }}>{r.stockName}</span>
                    )}
                    <span className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                      {r.market === "TW" ? "🇹🇼 台股" : "🇺🇸 美股"} · 賣出 {r.sellDate}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => refreshRecord(r.id)} disabled={isLoading} title="重新查詢"
                      className="text-xs transition-colors cursor-pointer disabled:opacity-50"
                      style={{ color: "var(--fg-subtle)" }}>
                      {isLoading ? "⏳" : "🔄"}
                    </button>
                    <button onClick={() => deleteRecord(r.id)} title="刪除"
                      className="text-xs transition-colors cursor-pointer hover:text-red-500"
                      style={{ color: "var(--fg-subtle)" }}>
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs mb-0.5" style={{ color: "var(--fg-subtle)" }}>賣出均價</p>
                    <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>{fmtCurrency(r.sellPrice, currency)}</p>
                    <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>{fmt(r.shares, 0)} 股 = {fmtCurrency(sellTotal, currency)}</p>
                  </div>

                  <div>
                    <p className="text-xs mb-0.5" style={{ color: "var(--fg-subtle)" }}>賣出後最高價</p>
                    {isLoading ? (
                      <p className="text-sm animate-pulse" style={{ color: "var(--fg-subtle)" }}>查詢中...</p>
                    ) : r.fetchError ? (
                      <p className="text-xs text-red-500">{r.fetchError}</p>
                    ) : r.maxHigh != null ? (
                      <p className="text-sm font-medium text-yellow-500">{fmtCurrency(r.maxHigh, currency)}</p>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>—</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs mb-0.5" style={{ color: "var(--fg-subtle)" }}>最高價日期</p>
                    {isLoading ? (
                      <p className="text-sm animate-pulse" style={{ color: "var(--fg-subtle)" }}>—</p>
                    ) : r.maxHighDate ? (
                      <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>{r.maxHighDate}</p>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>—</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs mb-0.5" style={{ color: "var(--fg-subtle)" }}>少賺了</p>
                    {isLoading ? (
                      <p className="text-sm animate-pulse" style={{ color: "var(--fg-subtle)" }}>—</p>
                    ) : missedAmount != null ? (
                      <>
                        <p className={`text-sm font-bold ${isMissed ? "text-red-500" : "text-emerald-500"}`}>
                          {isMissed ? "+" : ""}{fmtCurrency(missedAmount, currency)}
                        </p>
                        <p className={`text-xs ${isMissed ? "text-red-400" : "text-emerald-400"}`}>
                          {isMissed ? "+" : ""}{fmt(missedPct!, 1)}%
                        </p>
                      </>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>—</p>
                    )}
                  </div>
                </div>

                {r.note && (
                  <p className="text-xs border-t pt-2" style={{ color: "var(--fg-subtle)", borderColor: "var(--border-muted)" }}>
                    💬 {r.note}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
