"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from "recharts";
import { ChevronDown, ChevronUp, RefreshCw, Trash2, Plus, X, AlertCircle, ShieldCheck, Pencil } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────
interface SaleRecord {
  id: string;
  ticker: string;
  stockName?: string;
  market: "TW" | "US";
  sellDate: string;
  sellPrice: number;
  shares: number;
  includeToday: boolean;
  useClose: boolean;   // true = compare closing price, false = compare daily high
  note?: string;
  maxHigh?: number | null;
  maxHighDate?: string | null;
  lastClose?: number | null;
  currency?: string;
  fetchedAt?: number;
  fetchError?: string;
}

interface DayOHLC { high: number; low: number; close?: number }
interface ChartRow  { date: string; close: number }

// ── Storage ───────────────────────────────────────────────────────────────
const STORAGE_KEY = "byebyemoney_records_v2";
function loadRecords(): SaleRecord[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function saveRecords(r: SaleRecord[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); }

// ── Helpers ───────────────────────────────────────────────────────────────
function fmt(n: number, d = 2) {
  return n.toLocaleString("zh-TW", { minimumFractionDigits: d, maximumFractionDigits: d });
}
// Show price with 2 decimal places for both TWD and USD
function fmtP(n: number, currency: string) {
  return currency === "TWD" ? `NT$ ${fmt(n, 2)}` : `$${fmt(n, 2)}`;
}

const cardStyle:  React.CSSProperties = { background: "var(--bg-card)",  border: "1px solid var(--border)" };
const inputStyle: React.CSSProperties = {
  background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--fg)",
  borderRadius: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.875rem",
  width: "100%", outline: "none",
};
const labelStyle: React.CSSProperties = { color: "var(--fg-subtle)", fontSize: "0.75rem", marginBottom: "0.25rem", display: "block" };

// ── Toggle switch ─────────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} className="relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0"
      style={{ background: value ? "#4f46e5" : "var(--bg-hover)", border: "1px solid var(--border)" }}>
      <div className="absolute top-0.5 rounded-full w-4 h-4 bg-white shadow transition-all"
        style={{ left: value ? "calc(100% - 1.125rem)" : "0.125rem" }} />
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────
function Section({ title, icon, count, accentColor, children, defaultOpen = true }:
  { title: string; icon: React.ReactNode; count: number; accentColor: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl overflow-hidden" style={cardStyle}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-5 py-4 cursor-pointer"
        style={{ borderBottom: open ? "1px solid var(--border)" : "none" }}>
        <div className="flex items-center gap-2.5">
          {icon}
          <span className="font-semibold text-sm" style={{ color: "var(--fg)" }}>{title}</span>
          <span className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: accentColor + "20", color: accentColor }}>{count} 筆</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4" style={{ color: "var(--fg-subtle)" }} />
               : <ChevronDown className="h-4 w-4" style={{ color: "var(--fg-subtle)" }} />}
      </button>
      {open && <div className="divide-y" style={{ borderColor: "var(--border-muted)" }}>{children}</div>}
    </div>
  );
}

// ── Inline Edit Form ──────────────────────────────────────────────────────
function EditForm({ record, onSave, onCancel }: {
  record: SaleRecord;
  onSave: (updated: Partial<SaleRecord>) => void;
  onCancel: () => void;
}) {
  const [sellPrice,    setSellPrice]    = useState(String(record.sellPrice));
  const [shares,       setShares]       = useState(String(record.shares));
  const [sellDate,     setSellDate]     = useState(record.sellDate);
  const [includeToday, setIncludeToday] = useState(record.includeToday);
  const [useClose,     setUseClose]     = useState(record.useClose ?? true);
  const [note,         setNote]         = useState(record.note ?? "");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = parseFloat(sellPrice);
    const sh = parseFloat(shares);
    if (isNaN(sp) || isNaN(sh) || sp <= 0 || sh <= 0) return;
    onSave({ sellPrice: sp, shares: sh, sellDate, includeToday, useClose, note: note.trim() || undefined });
  };

  return (
    <form onSubmit={handleSave} className="px-4 py-4 space-y-3 border-t" style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--fg-muted)" }}>✏️ 編輯紀錄</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={labelStyle}>賣出均價</label>
          <input type="number" required min="0.0001" step="any" value={sellPrice}
            onChange={e => setSellPrice(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>股數</label>
          <input type="number" required min="0.0001" step="any" value={shares}
            onChange={e => setShares(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>賣出日期</label>
        <input type="date" required value={sellDate} max={new Date().toISOString().split("T")[0]}
          onChange={e => setSellDate(e.target.value)} style={{ ...inputStyle, colorScheme: "auto" }} />
      </div>
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <Toggle value={useClose} onChange={setUseClose} />
        <span className="text-sm" style={{ color: "var(--fg)" }}>只計算收盤價</span>
        <span className="text-xs" style={{ color: "var(--fg-subtle)" }}>
          {useClose ? "比較收盤價" : "比較當日最高價"}
        </span>
      </label>
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <Toggle value={includeToday} onChange={setIncludeToday} />
        <span className="text-sm" style={{ color: "var(--fg)" }}>計算當天價格</span>
        <span className="text-xs" style={{ color: "var(--fg-subtle)" }}>
          {includeToday ? "含賣出當天" : "只算往後"}
        </span>
      </label>
      <div>
        <label style={labelStyle}>備註</label>
        <input placeholder="備註（選填）" value={note} onChange={e => setNote(e.target.value)} style={inputStyle} />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit"
          className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer">
          儲存並重新查詢
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer"
          style={{ ...inputStyle, width: "auto" }}>
          取消
        </button>
      </div>
    </form>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function RecordsTab() {
  const [records,     setRecords]     = useState<SaleRecord[]>([]);
  const [showForm,    setShowForm]    = useState(false);
  const [loadingId,   setLoadingId]   = useState<string | null>(null);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [chartCache,  setChartCache]  = useState<Record<string, ChartRow[]>>({});
  const [chartLoading, setChartLoading] = useState<string | null>(null);

  const [usdToTwd,   setUsdToTwd]   = useState<number | null>(null);
  const [fxUpdated,  setFxUpdated]  = useState<string | null>(null);
  const [fxFallback, setFxFallback] = useState(false);

  // Form state
  const [market,       setMarket]       = useState<"TW" | "US">("TW");
  const [twInputMode,  setTwInputMode]  = useState<"ticker" | "name">("ticker");
  const [tickerRaw,    setTickerRaw]    = useState("");
  const [resolved,     setResolved]     = useState<{ ticker: string; name: string } | null>(null);
  const [lookupState,  setLookupState]  = useState<"idle" | "loading" | "found" | "error">("idle");
  const [sellDate,     setSellDate]     = useState(new Date().toISOString().split("T")[0]);
  const [includeToday, setIncludeToday] = useState(false);
  const [useClose,     setUseClose]     = useState(true);   // default ON
  const [dayOHLC,      setDayOHLC]      = useState<DayOHLC | null>(null);
  const [dayOHLCError, setDayOHLCError] = useState<string | null>(null);
  const [dayLoading,   setDayLoading]   = useState(false);
  const [sellPrice,    setSellPrice]    = useState("");
  const [shares,       setShares]       = useState("");
  const [note,         setNote]         = useState("");

  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dayTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecords(loadRecords());
    fetch("/api/fx").then(r => r.json()).then(d => {
      setUsdToTwd(d.rate); setFxFallback(!!d.fallback);
      if (d.updatedAt) try { setFxUpdated(new Date(d.updatedAt).toLocaleDateString("zh-TW")); } catch { /**/ }
    }).catch(() => { setUsdToTwd(32.5); setFxFallback(true); });
  }, []);

  const persistRecords = (r: SaleRecord[]) => { setRecords(r); saveRecords(r); };

  // Ticker/name lookup
  useEffect(() => {
    const raw = tickerRaw.trim();
    if (!raw) { setResolved(null); setLookupState("idle"); return; }
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    setLookupState("loading");
    lookupTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/lookup?code=${encodeURIComponent(raw)}`);
        if (res.ok) { const d = await res.json(); setResolved({ ticker: d.ticker, name: d.name }); setLookupState("found"); }
        else { setResolved(null); setLookupState("error"); }
      } catch { setResolved(null); setLookupState("error"); }
    }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerRaw]);

  // Day OHLC fetch
  useEffect(() => {
    const ticker = resolved?.ticker ?? (market === "US" ? tickerRaw.trim().toUpperCase() : "");
    if (!ticker || !sellDate) { setDayOHLC(null); setDayOHLCError(null); return; }
    if (dayTimer.current) clearTimeout(dayTimer.current);
    setDayLoading(true); setDayOHLC(null); setDayOHLCError(null);
    dayTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stock/day?ticker=${encodeURIComponent(ticker)}&market=${market}&date=${sellDate}`);
        if (res.ok) { setDayOHLC(await res.json()); setDayOHLCError(null); }
        else { const e = await res.json(); setDayOHLCError(e.error ?? "無法取得當日行情"); setDayOHLC(null); }
      } catch { setDayOHLCError("查詢失敗"); setDayOHLC(null); }
      setDayLoading(false);
    }, 700);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, tickerRaw, market, sellDate]);

  // Fetch maxHigh data
  const fetchStockData = useCallback(async (record: SaleRecord): Promise<Partial<SaleRecord>> => {
    const params = new URLSearchParams({
      ticker: record.ticker, market: record.market,
      sellDate: record.sellDate, includeToday: String(record.includeToday),
      useClose: String(record.useClose ?? true),
    });
    const res = await fetch(`/api/stock?${params}`);
    if (!res.ok) { const e = await res.json(); return { fetchError: e.error ?? "查詢失敗", fetchedAt: Date.now() }; }
    const data = await res.json();
    // API can return fetchError in 200 response for unsupported stocks
    return {
      maxHigh:     data.maxHigh,
      maxHighDate: data.maxHighDate,
      lastClose:   data.lastClose,
      currency:    data.currency,
      fetchError:  data.fetchError ?? undefined,
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

  // Save edit
  const saveEdit = async (id: string, changes: Partial<SaleRecord>) => {
    const record = records.find(r => r.id === id);
    if (!record) return;
    const updated = { ...record, ...changes, maxHigh: undefined, maxHighDate: undefined, lastClose: undefined, fetchError: undefined };
    persistRecords(records.map(r => r.id === id ? updated : r));
    setEditingId(null);
    // Clear chart cache for this record
    setChartCache(prev => { const n = { ...prev }; delete n[id]; return n; });
    // Refetch
    setLoadingId(id);
    const fetched = await fetchStockData(updated);
    persistRecords(records.map(r => r.id === id ? { ...updated, ...fetched } : r));
    setLoadingId(null);
  };

  // Expand chart
  const toggleExpand = async (record: SaleRecord) => {
    const id = record.id;
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (chartCache[id]) return;
    setChartLoading(id);
    try {
      const mktLabel = record.market === "TW" ? "台股" : "美股";
      const today = new Date().toISOString().split("T")[0];
      const startDate = record.includeToday ? record.sellDate
        : (() => { const d = new Date(record.sellDate); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })();
      const res = await fetch(`/api/research?codes=${encodeURIComponent(`${record.ticker}:${mktLabel}`)}&start=${startDate}&end=${today}`);
      if (res.ok) {
        const data = await res.json();
        setChartCache(prev => ({ ...prev, [id]: data[record.ticker] ?? [] }));
      }
    } catch { /**/ }
    setChartLoading(null);
  };

  // Submit new record
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTicker = resolved?.ticker ?? tickerRaw.trim().toUpperCase();
    if (!finalTicker) return;
    const newRecord: SaleRecord = {
      id: Date.now().toString(),
      ticker: finalTicker, stockName: resolved?.name,
      market, sellDate, includeToday, useClose,
      sellPrice: parseFloat(sellPrice), shares: parseFloat(shares),
      note: note.trim() || undefined,
    };
    const base = [...records, newRecord];
    persistRecords(base);
    setShowForm(false);
    setTickerRaw(""); setResolved(null); setLookupState("idle");
    setSellPrice(""); setShares(""); setNote(""); setDayOHLC(null);
    setLoadingId(newRecord.id);
    const updated = await fetchStockData(newRecord);
    persistRecords(base.map(r => r.id === newRecord.id ? { ...r, ...updated } : r));
    setLoadingId(null);
  };

  const deleteRecord = (id: string) => {
    if (!confirm("確定刪除這筆紀錄？")) return;
    persistRecords(records.filter(r => r.id !== id));
    if (expandedId === id) setExpandedId(null);
    if (editingId === id) setEditingId(null);
  };

  // ── Dashboard ─────────────────────────────────────────────────────────
  const fxRate = usdToTwd ?? 32.5;
  const toTWD  = (amount: number, currency: string) => currency === "TWD" ? amount : amount * fxRate;

  const regretRecords  = records.filter(r => r.maxHigh != null && r.maxHigh > r.sellPrice);
  const dodgedRecords  = records.filter(r => r.maxHigh != null && r.maxHigh <= r.sellPrice);
  const pendingRecords = records.filter(r => r.maxHigh == null && !r.fetchError);
  const errorRecords   = records.filter(r => !!r.fetchError);

  const totalMissedTWD = regretRecords.reduce((sum, r) => {
    const cur = r.currency ?? (r.market === "TW" ? "TWD" : "USD");
    return sum + toTWD((r.maxHigh! - r.sellPrice) * r.shares, cur);
  }, 0);
  const totalSavedTWD = dodgedRecords.reduce((sum, r) => {
    const cur = r.currency ?? (r.market === "TW" ? "TWD" : "USD");
    return sum + toTWD((r.sellPrice - r.maxHigh!) * r.shares, cur);
  }, 0);
  const hasUSD = records.some(r => r.market === "US" && r.maxHigh != null);

  // ── Record Card ───────────────────────────────────────────────────────
  const RecordCard = ({ r, isRegret }: { r: SaleRecord; isRegret: boolean }) => {
    const isLoading  = loadingId === r.id;
    const isExpanded = expandedId === r.id;
    const isEditing  = editingId === r.id;
    const currency   = r.currency ?? (r.market === "TW" ? "TWD" : "USD");
    const sellTotal  = r.sellPrice * r.shares;
    const rawMissed  = r.maxHigh != null ? (r.maxHigh - r.sellPrice) * r.shares : null;
    const rawPct     = r.maxHigh != null ? ((r.maxHigh - r.sellPrice) / r.sellPrice) * 100 : null;
    const displayAmt = rawMissed != null ? Math.abs(rawMissed) : null;
    const displayPct = rawPct    != null ? Math.abs(rawPct)    : null;
    const amountColor = isRegret ? "#ef4444" : "#22c55e";
    const chartRows  = chartCache[r.id] ?? [];
    const maxCloseRow = chartRows.reduce<ChartRow | null>(
      (best, row) => (!best || row.close > best.close ? row : best), null
    );

    return (
      <div>
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-lg px-2 py-0.5 text-xs font-bold font-mono"
                style={{ background: "var(--bg-hover)", color: "var(--fg)" }}>{r.ticker}</span>
              {r.stockName && <span className="text-sm font-medium" style={{ color: "var(--fg)" }}>{r.stockName}</span>}
              <span className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                {r.market === "TW" ? "🇹🇼" : "🇺🇸"} 賣出 {r.sellDate}
                {r.includeToday && <span className="ml-1" style={{ color: "#818cf8" }}>（含當日）</span>}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Edit */}
              <button onClick={() => setEditingId(isEditing ? null : r.id)} title="編輯"
                className="p-1.5 rounded-lg border transition-colors cursor-pointer"
                style={{ ...inputStyle, padding: "0.375rem", width: "auto",
                  background: isEditing ? "#4f46e5" : "var(--bg-input)",
                  borderColor: isEditing ? "#4f46e5" : "var(--border)" }}>
                <Pencil className="h-3.5 w-3.5" style={{ color: isEditing ? "#fff" : "var(--fg-muted)" }} />
              </button>
              {/* Chart toggle */}
              <button onClick={() => toggleExpand(r)} title="走勢圖"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs border transition-colors cursor-pointer"
                style={{ ...inputStyle, padding: "0.25rem 0.5rem", width: "auto" }}>
                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                <span style={{ color: "var(--fg-muted)" }}>走勢</span>
              </button>
              {/* Refresh */}
              <button onClick={() => refreshRecord(r.id)} disabled={isLoading} title="重新查詢"
                className="p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-40"
                style={{ ...inputStyle, padding: "0.375rem", width: "auto" }}>
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} style={{ color: "var(--fg-muted)" }} />
              </button>
              {/* Delete */}
              <button onClick={() => deleteRecord(r.id)} title="刪除"
                className="p-1.5 rounded-lg border transition-colors cursor-pointer hover:border-red-500/50"
                style={{ ...inputStyle, padding: "0.375rem", width: "auto" }}>
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </button>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-xs mb-0.5" style={{ color: "var(--fg-subtle)" }}>賣出均價</p>
              <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>{fmtP(r.sellPrice, currency)}</p>
              <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>{fmt(r.shares)} 股 ＝ {fmtP(sellTotal, currency)}</p>
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: "var(--fg-subtle)" }}>
                {(r.useClose ?? true) ? "最高收盤價" : "最高當日高點"}
                {r.includeToday ? "（含當日）" : ""}
              </p>
              {isLoading ? <p className="text-sm animate-pulse" style={{ color: "var(--fg-subtle)" }}>查詢中...</p>
                : r.fetchError ? <p className="text-xs text-orange-500">{r.fetchError}</p>
                : r.maxHigh != null ? <p className="text-sm font-medium text-yellow-500">{fmtP(r.maxHigh, currency)}</p>
                : <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>—</p>}
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: "var(--fg-subtle)" }}>最高價日期</p>
              {isLoading ? <p className="text-sm animate-pulse" style={{ color: "var(--fg-subtle)" }}>—</p>
                : r.maxHighDate ? <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>{r.maxHighDate}</p>
                : <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>—</p>}
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: "var(--fg-subtle)" }}>
                {isRegret ? "少賺了（負）" : "躲過損失（正）"}
              </p>
              {isLoading ? <p className="text-sm animate-pulse" style={{ color: "var(--fg-subtle)" }}>—</p>
                : displayAmt != null ? (
                  <>
                    <p className="text-sm font-bold" style={{ color: amountColor }}>
                      {isRegret ? "−" : "+"}{fmtP(displayAmt, currency)}
                    </p>
                    <p className="text-xs" style={{ color: amountColor }}>
                      {isRegret ? "−" : "+"}{fmt(displayPct!, 1)}%
                    </p>
                  </>
                ) : <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>—</p>}
            </div>
          </div>

          {r.note && (
            <p className="text-xs mt-3 border-t pt-2" style={{ color: "var(--fg-subtle)", borderColor: "var(--border-muted)" }}>
              💬 {r.note}
            </p>
          )}
        </div>

        {/* Edit form */}
        {isEditing && (
          <EditForm record={r}
            onSave={(changes) => saveEdit(r.id, changes)}
            onCancel={() => setEditingId(null)} />
        )}

        {/* Chart */}
        {isExpanded && !isEditing && (
          <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-medium mb-3" style={{ color: "var(--fg-muted)" }}>
              📈 {r.stockName ?? r.ticker} 走勢（{r.sellDate} ～ 今日）
            </p>
            {chartLoading === r.id ? (
              <div className="h-48 flex items-center justify-center" style={{ color: "var(--fg-subtle)" }}>
                <span className="text-sm animate-pulse">載入中...</span>
              </div>
            ) : chartRows.length === 0 ? (
              <div className="h-16 flex items-center justify-center" style={{ color: "var(--fg-subtle)" }}>
                <span className="text-sm">無法載入走勢資料</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: "var(--fg-subtle)", fontSize: 10 }} tickLine={false}
                    axisLine={{ stroke: "var(--border)" }} interval="preserveStartEnd" tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fill: "var(--fg-subtle)", fontSize: 10 }} tickLine={false} axisLine={false}
                    width={52} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "0.75rem", fontSize: 12 }}
                    labelStyle={{ color: "var(--fg-muted)" }} itemStyle={{ color: "var(--fg)" }}
                    formatter={(v) => [typeof v === "number" ? fmt(v) : v, "收盤價"]}
                  />
                  <ReferenceLine y={r.sellPrice} stroke="#f87171" strokeDasharray="4 4"
                    label={{ value: `賣出 ${fmt(r.sellPrice)}`, fill: "#f87171", fontSize: 10, position: "insideTopRight" }} />
                  {r.maxHigh && (
                    <ReferenceLine y={r.maxHigh} stroke="#fbbf24" strokeDasharray="4 4"
                      label={{ value: `${(r.useClose ?? true) ? "最高收盤" : "最高"} ${fmt(r.maxHigh)}`, fill: "#fbbf24", fontSize: 10, position: "insideTopRight" }} />
                  )}
                  <Line type="monotone" dataKey="close" stroke="#818cf8" strokeWidth={2} dot={false} connectNulls />
                  {r.maxHighDate && maxCloseRow && (
                    <ReferenceDot x={r.maxHighDate} y={maxCloseRow.close} r={5} fill="#fbbf24" stroke="#fff" strokeWidth={2} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Storage notice */}
      <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-xs"
        style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", color: "#a16207" }}>
        <span className="text-base mt-0.5">🔒</span>
        <span>資料只儲存在您的瀏覽器本機，不上傳任何伺服器。同一個瀏覽器可查到上次紀錄，換瀏覽器或清快取就不見了。</span>
      </div>

      {/* Dashboard */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl p-5" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>💊 後悔藥總損失（新台幣）</p>
            <p className="text-2xl font-bold text-red-500">
              {regretRecords.length === 0 ? "—" : `−NT$ ${fmt(totalMissedTWD, 0)}`}
            </p>
            {hasUSD && usdToTwd && (
              <p className="text-xs mt-1" style={{ color: "var(--fg-subtle)" }}>
                {fxFallback ? "⚠️ 估算匯率 32.5" : `1 USD = ${fmt(usdToTwd, 2)} TWD`}
                {fxUpdated && !fxFallback ? `（${fxUpdated}）` : ""}
              </p>
            )}
          </div>
          <div className="rounded-2xl p-5" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>🛡️ 逃過一劫總金額（新台幣）</p>
            <p className="text-2xl font-bold text-emerald-500">
              {dodgedRecords.length === 0 ? "—" : `+NT$ ${fmt(totalSavedTWD, 0)}`}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--fg-subtle)" }}>{dodgedRecords.length} 筆賣對了 🎉</p>
          </div>
        </div>
      )}

      {/* Header + Add button */}
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-base" style={{ color: "var(--fg)" }}>
          我的紀錄{records.length > 0 && <span className="text-sm font-normal ml-1.5" style={{ color: "var(--fg-subtle)" }}>({records.length} 筆)</span>}
        </h2>
        <button onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer">
          {showForm ? <><X className="h-3.5 w-3.5" /> 取消</> : <><Plus className="h-3.5 w-3.5" /> 新增</>}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl p-5 space-y-5 fade-in" style={cardStyle}>
          {/* Market */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide mb-2 block" style={{ color: "var(--fg-muted)" }}>① 選擇市場</label>
            <div className="flex gap-2">
              {(["TW", "US"] as const).map(m => (
                <button key={m} type="button"
                  onClick={() => { setMarket(m); setTickerRaw(""); setResolved(null); setLookupState("idle"); setDayOHLC(null); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all cursor-pointer"
                  style={market === m ? { background: "#4f46e5", borderColor: "#4f46e5", color: "#fff" }
                    : { ...inputStyle, borderRadius: "0.75rem", padding: "0.625rem", width: "auto" }}>
                  {m === "TW" ? "🇹🇼 台股（TWSE）" : "🇺🇸 美股（Yahoo）"}
                </button>
              ))}
            </div>
          </div>

          {/* Ticker */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide mb-2 block" style={{ color: "var(--fg-muted)" }}>② 輸入股票</label>
            {market === "TW" && (
              <div className="flex gap-2 mb-2">
                {(["ticker", "name"] as const).map(mode => (
                  <button key={mode} type="button"
                    onClick={() => { setTwInputMode(mode); setTickerRaw(""); setResolved(null); setLookupState("idle"); }}
                    className="px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer"
                    style={twInputMode === mode
                      ? { background: "var(--fg)", color: "var(--bg)", borderColor: "var(--fg)" }
                      : { ...inputStyle, borderRadius: "0.5rem", padding: "0.25rem 0.75rem", width: "auto" }}>
                    {mode === "ticker" ? "📌 輸入代號" : "🔍 輸入名稱"}
                  </button>
                ))}
              </div>
            )}
            <input required value={tickerRaw}
              onChange={e => setTickerRaw(market === "US" ? e.target.value.toUpperCase() : e.target.value)}
              placeholder={
                market === "US" ? "美股代號，如 NVDA、AAPL" :
                twInputMode === "ticker" ? "台股代號，如 2330、0050、1785" :
                "公司名稱，如 台積電、和碩、聯發科"
              }
              style={inputStyle} />
            <div className="mt-1.5 h-5 text-xs flex items-center gap-1.5">
              {lookupState === "loading" && <span style={{ color: "var(--fg-subtle)" }}>🔍 查詢中...</span>}
              {lookupState === "found"   && resolved && <span style={{ color: "#22c55e" }}>✓ {resolved.name} ({resolved.ticker})</span>}
              {lookupState === "error"   && tickerRaw.trim() && <span className="text-red-500">找不到此股票</span>}
            </div>
          </div>

          {/* Date + includeToday */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide mb-2 block" style={{ color: "var(--fg-muted)" }}>③ 賣出日期</label>
            <input type="date" required value={sellDate} max={new Date().toISOString().split("T")[0]}
              onChange={e => setSellDate(e.target.value)} style={{ ...inputStyle, colorScheme: "auto" }} />

            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <Toggle value={useClose} onChange={setUseClose} />
                <span className="text-sm" style={{ color: "var(--fg)" }}>只計算收盤價</span>
                <span className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                  {useClose ? "以每日收盤價比較" : "以每日最高價比較"}
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <Toggle value={includeToday} onChange={setIncludeToday} />
                <span className="text-sm" style={{ color: "var(--fg)" }}>計算當天價格</span>
                <span className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                  {includeToday ? "含賣出當天" : "只算往後日期"}
                </span>
              </label>
            </div>

            {(dayLoading || dayOHLC || dayOHLCError) && (
              <div className="mt-2 rounded-xl px-4 py-2.5" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
                {dayLoading ? (
                  <span className="text-xs animate-pulse" style={{ color: "var(--fg-subtle)" }}>查詢當日行情...</span>
                ) : dayOHLCError ? (
                  <span className="text-xs" style={{ color: "var(--fg-subtle)" }}>ℹ️ {dayOHLCError}</span>
                ) : dayOHLC && (
                  <div className="flex items-center gap-4">
                    <div className="text-xs"><span style={{ color: "var(--fg-subtle)" }}>當日最高 </span><span className="font-semibold text-emerald-500">{fmt(dayOHLC.high)}</span></div>
                    <div className="text-xs"><span style={{ color: "var(--fg-subtle)" }}>最低 </span><span className="font-semibold text-red-500">{fmt(dayOHLC.low)}</span></div>
                    {dayOHLC.close && <div className="text-xs"><span style={{ color: "var(--fg-subtle)" }}>收盤 </span><span className="font-semibold" style={{ color: "var(--fg)" }}>{fmt(dayOHLC.close)}</span></div>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Price + Shares */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide mb-2 block" style={{ color: "var(--fg-muted)" }}>④ 賣出條件</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>賣出均價 ({market === "TW" ? "NT$" : "USD"})</label>
                <input type="number" required min="0.0001" step="any" placeholder="0.00"
                  value={sellPrice} onChange={e => setSellPrice(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>股數（支援小數）</label>
                <input type="number" required min="0.0001" step="any" placeholder="1000"
                  value={shares} onChange={e => setShares(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          <input placeholder="備註（選填）" value={note} onChange={e => setNote(e.target.value)} style={inputStyle} />

          <button type="submit"
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors cursor-pointer">
            新增並查詢最高股價 →
          </button>
        </form>
      )}

      {/* Empty */}
      {records.length === 0 && !showForm && (
        <div className="text-center py-16" style={{ color: "var(--fg-subtle)" }}>
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm">還沒有紀錄，點「新增」開始記錄</p>
        </div>
      )}

      {/* Pending / Error */}
      {(pendingRecords.length > 0 || errorRecords.length > 0) && (
        <div className="space-y-2">
          {[...pendingRecords, ...errorRecords].map(r => (
            <div key={r.id} className="rounded-xl px-4 py-3 flex items-center justify-between gap-3" style={cardStyle}>
              <div className="flex items-center gap-2.5 min-w-0">
                {r.fetchError
                  ? <AlertCircle className="h-4 w-4 text-orange-400 shrink-0" />
                  : <RefreshCw className="h-4 w-4 text-indigo-400 shrink-0 animate-spin" />}
                <span className="text-sm font-mono shrink-0" style={{ color: "var(--fg)" }}>{r.ticker}</span>
                {r.stockName && <span className="text-sm truncate" style={{ color: "var(--fg-muted)" }}>{r.stockName}</span>}
                {r.fetchError && <span className="text-xs text-orange-500 truncate">{r.fetchError}</span>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {r.fetchError && (
                  <button onClick={() => refreshRecord(r.id)} disabled={loadingId === r.id}
                    className="inline-flex items-center gap-1 text-xs rounded-lg px-2.5 py-1 border cursor-pointer disabled:opacity-50"
                    style={{ ...inputStyle, padding: "0.25rem 0.625rem", width: "auto" }}>
                    <RefreshCw className="h-3 w-3" /> 重試
                  </button>
                )}
                <button onClick={() => deleteRecord(r.id)}
                  className="p-1.5 rounded-lg border cursor-pointer" style={{ ...inputStyle, padding: "0.375rem", width: "auto" }}>
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 後悔藥 */}
      {regretRecords.length > 0 && (
        <Section title="後悔藥" icon={<AlertCircle className="h-4 w-4" style={{ color: "#ef4444" }} />}
          count={regretRecords.length} accentColor="#ef4444">
          {regretRecords.map(r => <RecordCard key={r.id} r={r} isRegret={true} />)}
        </Section>
      )}

      {/* 逃過一劫 */}
      {dodgedRecords.length > 0 && (
        <Section title="逃過一劫" icon={<ShieldCheck className="h-4 w-4" style={{ color: "#22c55e" }} />}
          count={dodgedRecords.length} accentColor="#22c55e">
          {dodgedRecords.map(r => <RecordCard key={r.id} r={r} isRegret={false} />)}
        </Section>
      )}
    </div>
  );
}
