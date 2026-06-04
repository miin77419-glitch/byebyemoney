import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface PriceRow { date: string; close: number }

// ── 台股：TWSE 逐月 ────────────────────────────────────────────────────────
async function fetchTaiwanHistory(code: string, startDate: string, endDate: string): Promise<PriceRow[]> {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  const months: string[] = [];

  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    months.push(`${y}${m}01`);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  const rows: PriceRow[] = [];

  await Promise.allSettled(
    months.map(async (dateStr) => {
      try {
        const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${code}`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (json.stat !== "OK" || !json.data) return;

        for (const row of json.data) {
          const rocDate: string = row[0];
          const close = parseFloat((row[6] as string).replace(/,/g, ""));
          if (isNaN(close)) continue;
          const [rocY, m2, d] = rocDate.split("/");
          const isoDate = `${parseInt(rocY) + 1911}-${m2}-${d}`;
          if (isoDate >= startDate && isoDate <= endDate) {
            rows.push({ date: isoDate, close });
          }
        }
      } catch { /* skip */ }
    })
  );

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

// ── 美股：Yahoo Finance ────────────────────────────────────────────────────
async function fetchUSHistory(symbol: string, startDate: string, endDate: string): Promise<PriceRow[]> {
  const p1 = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
  const p2 = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return [];

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return [];

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[]        = result.timestamp ?? [];
  const closes: (number | null)[]   = result.indicators?.quote?.[0]?.close ?? [];

  const rows: PriceRow[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    rows.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), close: Math.round(c * 100) / 100 });
  }
  return rows;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const codesParam = searchParams.get("codes") ?? "";
  const startDate  = searchParams.get("start")  ?? "";
  const endDate    = searchParams.get("end")    ?? "";

  if (!codesParam || !startDate || !endDate) {
    return NextResponse.json({ error: "codes, start, end 為必填" }, { status: 400 });
  }

  const entries = codesParam.split(",").map(c => {
    const [rawCode, rawMarket] = c.split(":");
    return { code: (rawCode ?? "").trim(), market: (rawMarket ?? "").trim() === "美股" ? "美股" : "台股" };
  }).filter(e => e.code);

  const results = await Promise.allSettled(
    entries.map(async ({ code, market }) => {
      const rows = market === "美股"
        ? await fetchUSHistory(code, startDate, endDate)
        : await fetchTaiwanHistory(code, startDate, endDate);
      return { code, rows };
    })
  );

  const data: Record<string, PriceRow[]> = {};
  for (const r of results) {
    if (r.status === "fulfilled") data[r.value.code] = r.value.rows;
  }

  return NextResponse.json(data);
}
