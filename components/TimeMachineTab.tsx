"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { Search, X, TrendingUp, Loader2, Plus, Star, Check, Clock } from "lucide-react";

const COLORS = [
  "#60a5fa","#34d399","#f87171","#fbbf24","#a78bfa",
  "#f472b6","#2dd4bf","#fb923c","#818cf8","#4ade80",
];

const STORAGE_KEY       = "timemachine-watchlist";
const MARKET_KEY        = "timemachine-market-map";
const DATE_KEY          = "timemachine-dates";
const DEFAULT_WATCHLIST = ["0050", "2330"];

type Market = "台股" | "美股";
const MARKETS: Market[] = ["台股", "美股"];

interface PriceRow { date: string; close: number }
type SeriesData = Record<string, PriceRow[]>;
interface ChartPoint { date: string; [code: string]: number | string }

const cardStyle  = { background: "var(--bg-card)",  border: "1px solid var(--border)" };
const inputStyle = { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--fg)" };

function MarketToggle({ value, onChange }: { value: Market; onChange: (m: Market) => void }) {
  return (
    <div className="inline-flex rounded-lg overflow-hidden border text-xs font-medium shrink-0"
      style={{ borderColor: "var(--border)" }}>
      {MARKETS.map(m => (
        <button key={m} type="button" onClick={() => onChange(m)}
          className="px-2.5 py-1.5 transition-colors cursor-pointer"
          style={value === m
            ? { background: m === "美股" ? "#4f46e5" : "#2563eb", color: "#fff" }
            : { background: "var(--bg-input)", color: "var(--fg-muted)" }}>
          {m}
        </button>
      ))}
    </div>
  );
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function yearStartStr() { return `${new Date().getFullYear()}-01-01`; }
function fmt(n: number, d = 2) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: d }).format(n);
}

export default function TimeMachineTab() {
  const [watchlist,      setWatchlist]      = useState<string[]>(DEFAULT_WATCHLIST);
  const [nameCache,      setNameCache]      = useState<Record<string, string>>({});
  const [marketMap,      setMarketMap]      = useState<Record<string, Market>>({});
  const [showWLInput,    setShowWLInput]    = useState(false);
  const [wlInput,        setWlInput]        = useState("");
  const [wlMarket,       setWlMarket]       = useState<Market>("台股");
  const [wlInputLoading, setWlInputLoading] = useState(false);
  const [wlError,        setWlError]        = useState("");
  const wlInputRef = useRef<HTMLInputElement>(null);

  const [inputCode, setInputCode] = useState("");
  const [addMarket, setAddMarket] = useState<Market>("台股");
  const [codes,     setCodes]     = useState<string[]>([]);
  const marketOf = (code: string): Market => marketMap[code] ?? "台股";

  const [startDate, setStartDate] = useState(yearStartStr());
  const [endDate,   setEndDate]   = useState(todayStr());
  const [series,    setSeries]    = useState<SeriesData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // localStorage read
  useEffect(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) setWatchlist(p); } } catch { /**/ }
    try { const s = localStorage.getItem(MARKET_KEY);  if (s) { const p = JSON.parse(s); if (p && typeof p === "object") setMarketMap(p); } } catch { /**/ }
    try {
      const s = localStorage.getItem(DATE_KEY);
      if (s) { const p = JSON.parse(s); if (p.start) setStartDate(p.start); if (p.end) setEndDate(p.end); }
    } catch { /**/ }
  }, []);

  // localStorage write
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist)); } catch { /**/ } }, [watchlist]);
  useEffect(() => { try { localStorage.setItem(MARKET_KEY,  JSON.stringify(marketMap));  } catch { /**/ } }, [marketMap]);
  useEffect(() => { try { localStorage.setItem(DATE_KEY, JSON.stringify({ start: startDate, end: endDate })); } catch { /**/ } }, [startDate, endDate]);

  // batch name lookup for watchlist
  useEffect(() => {
    const missing = watchlist.filter(c => !nameCache[c]);
    if (!missing.length) return;
    missing.forEach(async (code) => {
      try {
        const res = await fetch(`/api/stocks/lookup?code=${encodeURIComponent(code)}`);
        if (res.ok) { const d = await res.json(); if (d.name) setNameCache(prev => ({ ...prev, [code]: d.name })); }
      } catch { /**/ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist]);

  function toggleWatchlistCode(code: string) {
    setCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  }

  function removeFromWatchlist(code: string) {
    setWatchlist(prev => prev.filter(c => c !== code));
    setCodes(prev => prev.filter(c => c !== code));
    setSeries(prev => { const n = { ...prev }; delete n[code]; return n; });
  }

  async function addToWatchlist() {
    const code = wlInput.trim().toUpperCase();
    if (!code) return;
    if (watchlist.includes(code)) { setWlError("已在清單中"); return; }
    setWlInputLoading(true);
    setWlError("");
    setMarketMap(prev => ({ ...prev, [code]: wlMarket }));
    try {
      const res = await fetch(`/api/stocks/lookup?code=${encodeURIComponent(code)}`);
      if (res.ok) { const d = await res.json(); if (d.name) setNameCache(prev => ({ ...prev, [code]: d.name })); }
    } catch { /**/ }
    setWatchlist(prev => [...prev, code]);
    setWlInput("");
    setShowWLInput(false);
    setWlInputLoading(false);
  }

  function addCode(raw: string) {
    const code = raw.trim().toUpperCase();
    if (!code || codes.includes(code)) return;
    setMarketMap(prev => ({ ...prev, [code]: addMarket }));
    setCodes(prev => [...prev, code]);
    setInputCode("");
    inputRef.current?.focus();
  }

  function removeCode(code: string) {
    setCodes(prev => prev.filter(c => c !== code));
    setSeries(prev => { const n = { ...prev }; delete n[code]; return n; });
  }

  const fetchData = useCallback(async (queryCodes: string[], start: string, end: string) => {
    if (!queryCodes.length) return;
    setIsLoading(true);
    setError(null);
    try {
      const tagged = queryCodes.map(c => `${c}:${marketMap[c] ?? "台股"}`);
      const res = await fetch(`/api/research?codes=${encodeURIComponent(tagged.join(","))}&start=${start}&end=${end}`);
      if (!res.ok) throw new Error(`API 錯誤 (${res.status})`);
      const data: SeriesData = await res.json();
      const empty = queryCodes.filter(c => !data[c]?.length);
      if (empty.length) setError(`找不到資料：${empty.join(", ")}`);
      setSeries(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "查詢失敗");
    } finally {
      setIsLoading(false);
    }
  }, [marketMap]);

  const activeCodes = codes.filter(c => series[c]?.length);
  const isMulti = activeCodes.length > 1;

  const chartData: ChartPoint[] = (() => {
    if (!activeCodes.length) return [];
    const dateSet = new Set<string>();
    activeCodes.forEach(c => series[c].forEach(r => dateSet.add(r.date)));
    const dates = Array.from(dateSet).sort();
    const basePrice: Record<string, number> = {};
    activeCodes.forEach(c => { const first = series[c][0]; if (first) basePrice[c] = first.close; });
    const lookup: Record<string, Map<string, number>> = {};
    activeCodes.forEach(c => { lookup[c] = new Map(series[c].map(r => [r.date, r.close])); });
    return dates.map(date => {
      const point: ChartPoint = { date };
      activeCodes.forEach(c => {
        const close = lookup[c].get(date);
        if (close !== undefined) {
          point[c] = isMulti ? parseFloat(((close / basePrice[c] - 1) * 100).toFixed(2)) : close;
        }
      });
      return point;
    });
  })();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border px-4 py-3 text-sm shadow-xl"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--fg)" }}>
        <p className="mb-2 font-semibold" style={{ color: "var(--fg-muted)" }}>{label}</p>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span style={{ color: "var(--fg-muted)" }}>{p.dataKey}</span>
            <span className="ml-auto font-mono font-medium" style={{ color: "var(--fg)" }}>
              {isMulti ? `${p.value >= 0 ? "+" : ""}${fmt(p.value, 2)}%` : `$${fmt(p.value)}`}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const stats = activeCodes.map(code => {
    const rows = series[code];
    if (!rows?.length) return null;
    const first = rows[0].close;
    const last  = rows[rows.length - 1].close;
    const pct   = (last / first - 1) * 100;
    const max   = Math.max(...rows.map(r => r.close));
    const min   = Math.min(...rows.map(r => r.close));
    return { code, first, last, pct, max, min, days: rows.length };
  }).filter(Boolean) as { code: string; first: number; last: number; pct: number; max: number; min: number; days: number }[];

  return (
    <div className="space-y-6 py-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "var(--fg)" }}>
            <Clock className="h-6 w-6 text-indigo-500" /> 時光機
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--fg-muted)" }}>
            輸入台股或美股代號，比較多檔 ETF / 股票的歷史走勢
          </p>
        </div>
        <div className="rounded-lg px-3 py-2 text-xs shrink-0" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", color: "#a16207" }}>
          🔒 清單暫存在本機
        </div>
      </div>

      {/* Watchlist */}
      <div className="rounded-2xl px-5 py-4" style={cardStyle}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--fg)" }}>
            <Star className="h-3.5 w-3.5 text-amber-400" /> 常用 ETF / 股票
          </h2>
          <button
            onClick={() => { setShowWLInput(v => !v); setWlError(""); setWlInput(""); setTimeout(() => wlInputRef.current?.focus(), 50); }}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition-colors cursor-pointer"
            style={{ ...inputStyle, color: "var(--fg-muted)" }}>
            <Plus className="h-3 w-3" /> 新增
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {watchlist.map(code => {
            const isSelected = codes.includes(code);
            const name = nameCache[code];
            return (
              <div key={code} className="group relative">
                <button
                  onClick={() => toggleWatchlistCode(code)}
                  className="inline-flex items-center gap-1.5 rounded-full pl-3 pr-7 py-1.5 text-sm font-medium border transition-all cursor-pointer"
                  style={isSelected
                    ? { background: "#2563eb", borderColor: "#3b82f6", color: "#fff" }
                    : { background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--fg-muted)" }}>
                  {isSelected && <Check className="h-3 w-3 shrink-0" />}
                  <span className="font-mono">{code}</span>
                  {marketOf(code) === "美股" && (
                    <span className="text-[10px] font-semibold px-1 py-px rounded"
                      style={{ background: isSelected ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.15)", color: isSelected ? "#c7d2fe" : "#818cf8" }}>
                      美
                    </span>
                  )}
                  {name && <span className="text-xs max-w-[80px] truncate" style={{ color: isSelected ? "rgba(255,255,255,0.7)" : "var(--fg-subtle)" }}>{name}</span>}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFromWatchlist(code); }}
                  title="從清單移除"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  style={{ color: "var(--fg-subtle)" }}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          {watchlist.length === 0 && (
            <span className="text-xs py-1.5" style={{ color: "var(--fg-subtle)" }}>清單是空的，點「新增」加入常用標的</span>
          )}
        </div>

        {showWLInput && (
          <div className="mt-3 flex items-center gap-2 border-t pt-3 flex-wrap" style={{ borderColor: "var(--border)" }}>
            <MarketToggle value={wlMarket} onChange={setWlMarket} />
            <input ref={wlInputRef} value={wlInput}
              onChange={e => { setWlInput(e.target.value.toUpperCase()); setWlError(""); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addToWatchlist(); } if (e.key === "Escape") { setShowWLInput(false); setWlInput(""); } }}
              placeholder={wlMarket === "美股" ? "美股代號 (如 AAPL)" : "台股代號 (如 0050)"}
              className="rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 w-44"
              style={inputStyle} />
            <button onClick={addToWatchlist} disabled={!wlInput.trim() || wlInputLoading}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50 transition-colors cursor-pointer">
              {wlInputLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} 加入
            </button>
            <button onClick={() => { setShowWLInput(false); setWlInput(""); setWlError(""); }}
              className="rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer"
              style={{ ...inputStyle, color: "var(--fg-muted)" }}>
              取消
            </button>
            {wlError && <span className="text-xs text-red-500">{wlError}</span>}
          </div>
        )}

        {codes.length > 0 && (
          <p className="mt-2.5 text-xs" style={{ color: "var(--fg-subtle)" }}>
            已選 {codes.length} 檔（<span className="text-blue-500">{codes.join("、")}</span>），可繼續新增或直接查詢
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="rounded-2xl px-5 py-4 space-y-4" style={cardStyle}>
        <div>
          <label className="text-xs font-medium mb-2 block" style={{ color: "var(--fg-muted)" }}>手動新增代號</label>
          <div className="flex gap-2 flex-wrap">
            {codes.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium"
                style={{ background: COLORS[i % COLORS.length] + "33", color: COLORS[i % COLORS.length], border: `1px solid ${COLORS[i % COLORS.length]}66` }}>
                {c}
                {marketOf(c) === "美股" && <span className="text-[10px] font-semibold opacity-80">·美</span>}
                <button onClick={() => removeCode(c)} className="hover:opacity-70 cursor-pointer"><X className="h-3 w-3" /></button>
              </span>
            ))}
            <div className="flex gap-2">
              <MarketToggle value={addMarket} onChange={setAddMarket} />
              <input ref={inputRef} value={inputCode}
                onChange={e => setInputCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addCode(inputCode); } }}
                placeholder={addMarket === "美股" ? "美股代號按 Enter" : "台股代號按 Enter"}
                className="rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
                style={inputStyle} />
              <button onClick={() => addCode(inputCode)} disabled={!inputCode.trim()}
                className="rounded-xl px-3 py-1.5 text-sm disabled:opacity-40 transition-colors cursor-pointer"
                style={inputStyle}>
                新增
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          {[
            { label: "起始日", val: startDate, set: setStartDate },
            { label: "結束日", val: endDate,   set: setEndDate   },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--fg-muted)" }}>{label}</label>
              <input type="date" value={val} onChange={e => set(e.target.value)}
                className="rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ ...inputStyle, colorScheme: "auto" }} />
            </div>
          ))}
          <button onClick={() => fetchData(codes, startDate, endDate)}
            disabled={isLoading || !codes.length}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors cursor-pointer">
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> 查詢中...</> : <><Search className="h-4 w-4" /> 查詢</>}
          </button>
        </div>
        <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>📌 日期範圍已暫存在瀏覽器本機</p>
      </div>

      {error && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-500">{error}</div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="rounded-2xl p-5" style={cardStyle}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
              {isMulti ? "相對報酬率（以起始日收盤價為基準）" : `${activeCodes[0]} 收盤價走勢`}
            </p>
            <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>{startDate} ～ {endDate}</p>
          </div>
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} tickLine={false}
                axisLine={{ stroke: "var(--border)" }} interval="preserveStartEnd" tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: "var(--fg-muted)", fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={v => isMulti ? `${v}%` : `$${fmt(v, 0)}`} width={isMulti ? 52 : 68} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: 16 }}
                formatter={(value) => <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>{value}</span>} />
              {activeCodes.map((code, i) => (
                <Line key={code} type="monotone" dataKey={code} stroke={COLORS[i % COLORS.length]}
                  dot={false} strokeWidth={2} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stats */}
      {stats.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((s, i) => (
            <div key={s.code} className="rounded-2xl p-4" style={cardStyle}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-bold font-mono" style={{ color: "var(--fg)" }}>{s.code}</span>
                  <span className="ml-1.5 text-[10px] font-semibold px-1 py-px rounded"
                    style={marketOf(s.code) === "美股"
                      ? { background: "rgba(99,102,241,0.15)", color: "#818cf8" }
                      : { background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>
                    {marketOf(s.code)}
                  </span>
                  {nameCache[s.code] && <span className="ml-2 text-xs" style={{ color: "var(--fg-muted)" }}>{nameCache[s.code]}</span>}
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: COLORS[i % COLORS.length] + "22", color: COLORS[i % COLORS.length] }}>
                  {s.days} 個交易日
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: "起始價", val: `$${fmt(s.first)}`, color: "var(--fg)" },
                  { label: "最新價", val: `$${fmt(s.last)}`,  color: "var(--fg)" },
                  { label: "區間高點", val: `$${fmt(s.max)}`, color: "#34d399" },
                  { label: "區間低點", val: `$${fmt(s.min)}`, color: "#f87171" },
                ].map(({ label, val, color }) => (
                  <div key={label}>
                    <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>{label}</p>
                    <p className="font-semibold" style={{ color }}>{val}</p>
                  </div>
                ))}
              </div>
              <div className={`mt-3 text-center py-2 rounded-xl text-lg font-bold ${s.pct >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                {s.pct >= 0 ? "+" : ""}{fmt(s.pct, 2)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !chartData.length && !error && (
        <div className="rounded-2xl border py-16 text-center" style={{ borderColor: "var(--border)", color: "var(--fg-subtle)" }}>
          <TrendingUp className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">從常用清單勾選標的，或手動輸入代號後按「查詢」</p>
        </div>
      )}
    </div>
  );
}
