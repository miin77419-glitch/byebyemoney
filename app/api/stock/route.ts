import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface DayHigh { date: string; high: number }

// Return day after date as YYYY-MM-DD
function nextDay(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

// ── TWSE 台股 ─────────────────────────────────────────────────────────────
async function fetchTWMaxHigh(
  ticker: string,
  sellDate: string,
  includeToday: boolean
): Promise<{ maxHigh: number | null; maxHighDate: string | null; lastClose: number | null }> {
  const startDate = includeToday ? sellDate : nextDay(sellDate);
  const sell = new Date(startDate);
  const now  = new Date();
  const months: string[] = [];

  let cur = new Date(sell.getFullYear(), sell.getMonth(), 1);
  while (cur <= now) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    months.push(`${y}${m}01`);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  const rows: DayHigh[] = [];

  await Promise.allSettled(
    months.map(async (dateStr) => {
      try {
        const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${ticker}`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } });
        if (!res.ok) return;
        const json = await res.json();
        if (json.stat !== "OK" || !json.data) return;

        for (const row of json.data) {
          const rocDate: string = row[0];
          const high  = parseFloat((row[4] as string).replace(/,/g, ""));
          if (isNaN(high)) continue;
          const [rocY, m, d] = rocDate.split("/");
          const isoDate = `${parseInt(rocY) + 1911}-${m}-${d}`;
          if (isoDate >= startDate) {
            rows.push({ date: isoDate, high });
          }
        }
      } catch { /* skip */ }
    })
  );

  if (!rows.length) return { maxHigh: null, maxHighDate: null, lastClose: null };

  let maxHigh = -Infinity;
  let maxHighDate = "";
  for (const r of rows) {
    if (r.high > maxHigh) { maxHigh = r.high; maxHighDate = r.date; }
  }

  // last close
  let lastClose: number | null = null;
  try {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${y}${m}01&stockNo=${ticker}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } });
    if (res.ok) {
      const json = await res.json();
      if (json.stat === "OK" && json.data?.length) {
        const last = json.data[json.data.length - 1];
        const c = parseFloat((last[6] as string).replace(/,/g, ""));
        if (!isNaN(c)) lastClose = c;
      }
    }
  } catch { /* ignore */ }

  return { maxHigh, maxHighDate, lastClose };
}

// ── Yahoo Finance 美股 ────────────────────────────────────────────────────
async function fetchUSMaxHigh(
  ticker: string,
  sellDate: string,
  includeToday: boolean
): Promise<{ maxHigh: number | null; maxHighDate: string | null; lastClose: number | null }> {
  const startDate = includeToday ? sellDate : nextDay(sellDate);
  const sellTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const nowTimestamp  = Math.floor(Date.now() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${sellTimestamp}&period2=${nowTimestamp}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return { maxHigh: null, maxHighDate: null, lastClose: null };

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return { maxHigh: null, maxHighDate: null, lastClose: null };

  const highs:      (number | null)[] = result.indicators?.quote?.[0]?.high   ?? [];
  const closes:     (number | null)[] = result.indicators?.quote?.[0]?.close  ?? [];
  const timestamps: number[]          = result.timestamp ?? [];

  let maxHigh = -Infinity;
  let maxHighDate = "";
  for (let i = 0; i < timestamps.length; i++) {
    const h = highs[i];
    if (h == null || isNaN(h)) continue;
    if (h > maxHigh) {
      maxHigh = h;
      maxHighDate = new Date(timestamps[i] * 1000).toISOString().split("T")[0];
    }
  }

  const validCloses = closes.filter((c): c is number => c != null && !isNaN(c));
  const lastClose = validCloses.length > 0 ? validCloses[validCloses.length - 1] : null;

  return {
    maxHigh:     maxHigh === -Infinity ? null : maxHigh,
    maxHighDate: maxHighDate || null,
    lastClose,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker       = searchParams.get("ticker");
  const market       = searchParams.get("market");
  const sellDate     = searchParams.get("sellDate");
  const includeToday = searchParams.get("includeToday") === "true";

  if (!ticker || !market || !sellDate) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  try {
    if (market === "TW") {
      const result = await fetchTWMaxHigh(ticker, sellDate, includeToday);
      return NextResponse.json({ symbol: ticker, currency: "TWD", ...result });
    } else {
      const result = await fetchUSMaxHigh(ticker, sellDate, includeToday);
      let shortName = ticker;
      try {
        const qr = await fetch(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}&fields=shortName`,
          { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 86400 } }
        );
        if (qr.ok) {
          const qd = await qr.json();
          shortName = qd.quoteResponse?.result?.[0]?.shortName ?? ticker;
        }
      } catch { /* ignore */ }
      return NextResponse.json({ symbol: ticker, shortName, currency: "USD", ...result });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
