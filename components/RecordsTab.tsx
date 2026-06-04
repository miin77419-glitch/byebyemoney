"use client";

import { useState, useEffect, useCallback } from "react";

interface SaleRecord {
  id: string;
  ticker: string;
  market: "TW" | "US";
  sellDate: string;
  sellPrice: number;
  shares: number;
  note?: string;
  // fetched
  maxHigh?: number | null;
  lastClose?: number | null;
  currency?: string;
  shortName?: string;
  fetchedAt?: number;
  fetchError?: string;
}

const STORAGE_KEY = "byebyemoney_records";

function loadRecords(): SaleRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecords(records: SaleRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("zh-TW", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrency(n: number, currency: string) {
  if (currency === "TWD") return `NT$ ${fmt(n, 0)}`;
  return `$${fmt(n)}`;
}

export default function RecordsTab() {
  const [records, setRecords] = useState<SaleRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    ticker: "",
    market: "TW" as "TW" | "US",
    sellDate: new Date().toISOString().split("T")[0],
    sellPrice: "",
    shares: "",
    note: "",
  });

  useEffect(() => {
    setRecords(loadRecords());
  }, []);

  const persistRecords = (r: SaleRecord[]) => {
    setRecords(r);
    saveRecords(r);
  };

  const fetchStockData = useCallback(async (record: SaleRecord): Promise<Partial<SaleRecord>> => {
    const params = new URLSearchParams({
      ticker: record.ticker,
      market: record.market,
      sellDate: record.sellDate,
    });
    const res = await fetch(`/api/stock?${params}`);
    if (!res.ok) {
      const err = await res.json();
      return { fetchError: err.error ?? "查詢失敗", fetchedAt: Date.now() };
    }
    const data = await res.json();
    return {
      maxHigh: data.maxHigh,
      lastClose: data.lastClose,
      currency: data.currency,
      shortName: data.shortName,
      fetchError: undefined,
      fetchedAt: Date.now(),
    };
  }, []);

  const refreshRecord = async (id: string) => {
    const record = records.find((r) => r.id === id);
    if (!record) return;
    setLoadingId(id);
    const updated = await fetchStockData(record);
    const newRecords = records.map((r) => (r.id === id ? { ...r, ...updated } : r));
    persistRecords(newRecords);
    setLoadingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newRecord: SaleRecord = {
      id: Date.now().toString(),
      ticker: form.ticker.trim().toUpperCase(),
      market: form.market,
      sellDate: form.sellDate,
      sellPrice: parseFloat(form.sellPrice),
      shares: parseFloat(form.shares),
      note: form.note.trim() || undefined,
    };
    const baseRecords = [...records, newRecord];
    persistRecords(baseRecords);
    setShowForm(false);
    setForm({ ticker: "", market: "TW", sellDate: new Date().toISOString().split("T")[0], sellPrice: "", shares: "", note: "" });

    // Auto-fetch
    setLoadingId(newRecord.id);
    const updated = await fetchStockData(newRecord);
    const final = baseRecords.map((r) => (r.id === newRecord.id ? { ...r, ...updated } : r));
    persistRecords(final);
    setLoadingId(null);
  };

  const deleteRecord = (id: string) => {
    if (!confirm("確定刪除這筆紀錄？")) return;
    persistRecords(records.filter((r) => r.id !== id));
  };

  // Dashboard calculations
  const recordsWithData = records.filter((r) => r.maxHigh != null);
  const totalSellValue = records.reduce((sum, r) => sum + r.sellPrice * r.shares, 0);
  const totalMissedValue = recordsWithData.reduce((sum, r) => {
    const missed = (r.maxHigh! - r.sellPrice) * r.shares;
    return sum + (missed > 0 ? missed : 0);
  }, 0);

  const biggestMiss = recordsWithData.reduce(
    (best, r) => {
      if (r.maxHigh == null) return best;
      const pct = ((r.maxHigh - r.sellPrice) / r.sellPrice) * 100;
      return pct > best.pct ? { pct, record: r } : best;
    },
    { pct: -Infinity, record: null as SaleRecord | null }
  );

  return (
    <div className="space-y-6">
      {/* Storage notice */}
      <div className="flex items-start gap-3 rounded-xl px-4 py-3 border border-yellow-500/20 bg-yellow-500/5 text-yellow-300/80 text-xs">
        <span className="text-base mt-0.5">🔒</span>
        <span>
          資料只儲存在您的瀏覽器本機（localStorage），不上傳到任何伺服器，無個資隱憂。
          同一個瀏覽器可查到上次的紀錄，但換瀏覽器或清快取就不見了。
        </span>
      </div>

      {/* Dashboard */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div
            className="rounded-2xl p-5 border border-red-500/20"
            style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.05))" }}
          >
            <p className="text-gray-400 text-xs mb-1">總共少賺了</p>
            <p className="text-3xl font-bold text-red-400">
              {totalMissedValue === 0 ? "—" : `+${fmt(totalMissedValue, 0)}`}
            </p>
            <p className="text-gray-600 text-xs mt-1">
              賣出總金額 {fmt(totalSellValue, 0)}
            </p>
          </div>

          <div
            className="rounded-2xl p-5 border border-orange-500/20"
            style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.1), rgba(234,88,12,0.05))" }}
          >
            <p className="text-gray-400 text-xs mb-1">最痛一筆</p>
            {biggestMiss.record ? (
              <>
                <p className="text-3xl font-bold text-orange-400">
                  +{fmt(biggestMiss.pct, 1)}%
                </p>
                <p className="text-gray-500 text-xs mt-1 font-mono">
                  {biggestMiss.record.ticker} · {biggestMiss.record.market}
                </p>
              </>
            ) : (
              <p className="text-3xl font-bold text-gray-600">—</p>
            )}
          </div>
        </div>
      )}

      {/* Add Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-white font-semibold text-base">
          賣飛紀錄 {records.length > 0 && <span className="text-gray-500 text-sm font-normal">({records.length} 筆)</span>}
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
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-5 border border-white/10 bg-white/5 space-y-4 fade-in"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">股票代號</label>
              <input
                required
                placeholder="如 2330 或 NVDA"
                value={form.ticker}
                onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">市場</label>
              <select
                value={form.market}
                onChange={(e) => setForm({ ...form, market: e.target.value as "TW" | "US" })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                style={{ background: "#1a1a2e" }}
              >
                <option value="TW">🇹🇼 台股</option>
                <option value="US">🇺🇸 美股</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1.5 block">賣出日期</label>
            <input
              type="date"
              required
              value={form.sellDate}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => setForm({ ...form, sellDate: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              style={{ colorScheme: "dark" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">
                賣出價格 ({form.market === "TW" ? "NT$" : "USD"})
              </label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={form.sellPrice}
                onChange={(e) => setForm({ ...form, sellPrice: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">股數</label>
              <input
                type="number"
                required
                min="1"
                step="1"
                placeholder="1000"
                value={form.shares}
                onChange={(e) => setForm({ ...form, shares: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1.5 block">備註（選填）</label>
            <input
              placeholder="e.g. 以為要跌了所以賣..."
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            新增紀錄並查詢股價
          </button>
        </form>
      )}

      {/* Records List */}
      {records.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm">還沒有紀錄</p>
          <p className="text-xs mt-1">點「新增」把你賣飛的股票加進來</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const sellTotal = r.sellPrice * r.shares;
            const isLoading = loadingId === r.id;
            let missedAmount: number | null = null;
            let missedPct: number | null = null;
            if (r.maxHigh != null) {
              missedAmount = (r.maxHigh - r.sellPrice) * r.shares;
              missedPct = ((r.maxHigh - r.sellPrice) / r.sellPrice) * 100;
            }
            const currency = r.currency ?? (r.market === "TW" ? "TWD" : "USD");
            const isMissed = missedAmount != null && missedAmount > 0;

            return (
              <div
                key={r.id}
                className="rounded-2xl p-4 border border-white/10 bg-white/3 space-y-3 hover:border-white/20 transition-colors"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                {/* Top Row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-lg px-2 py-0.5 text-xs font-bold bg-white/10 text-white font-mono">
                      {r.ticker}
                    </div>
                    <span className="text-gray-500 text-xs">
                      {r.market === "TW" ? "🇹🇼" : "🇺🇸"} · {r.sellDate}
                    </span>
                    {r.shortName && (
                      <span className="text-gray-600 text-xs truncate max-w-[120px]">{r.shortName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => refreshRecord(r.id)}
                      disabled={isLoading}
                      title="重新查詢股價"
                      className="text-gray-500 hover:text-white text-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isLoading ? "⏳" : "🔄"}
                    </button>
                    <button
                      onClick={() => deleteRecord(r.id)}
                      title="刪除"
                      className="text-gray-600 hover:text-red-400 text-xs transition-colors cursor-pointer"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">賣出均價 × 股數</p>
                    <p className="text-white text-sm font-medium">{fmtCurrency(r.sellPrice, currency)}</p>
                    <p className="text-gray-600 text-xs">{fmt(r.shares, 0)} 股 = {fmtCurrency(sellTotal, currency)}</p>
                  </div>

                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">賣出後最高價</p>
                    {isLoading ? (
                      <p className="text-gray-500 text-sm animate-pulse">查詢中...</p>
                    ) : r.fetchError ? (
                      <p className="text-red-400 text-xs">{r.fetchError}</p>
                    ) : r.maxHigh != null ? (
                      <p className="text-yellow-300 text-sm font-medium">{fmtCurrency(r.maxHigh, currency)}</p>
                    ) : (
                      <p className="text-gray-600 text-sm">—</p>
                    )}
                  </div>

                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">少賺了</p>
                    {isLoading ? (
                      <p className="text-gray-500 text-sm animate-pulse">—</p>
                    ) : missedAmount != null ? (
                      <>
                        <p className={`text-sm font-bold ${isMissed ? "text-red-400" : "text-emerald-400"}`}>
                          {isMissed ? "+" : ""}{fmtCurrency(missedAmount, currency)}
                        </p>
                        <p className={`text-xs ${isMissed ? "text-red-500" : "text-emerald-500"}`}>
                          {isMissed ? "+" : ""}{fmt(missedPct!, 1)}%
                        </p>
                      </>
                    ) : (
                      <p className="text-gray-600 text-sm">—</p>
                    )}
                  </div>
                </div>

                {/* Note */}
                {r.note && (
                  <p className="text-gray-500 text-xs border-t border-white/5 pt-2">
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
