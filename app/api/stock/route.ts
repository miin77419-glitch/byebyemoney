import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface DayHigh { date: string; high: number }

// ── TWSE 台股：逐月抓歷史最高價 ──────────────────────────────────────────
async function fetchTWMaxHigh(ticker: string, sellDate: string): Promise<{ maxHigh: number | null; maxHighDate: string | null; lastClose: number | null }> {
  const sell = new Date(sellDate);
  const now  = new Date();
  const months: string[] = [];

  // collect YYYYMMDD for first day of each month in range
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
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          next: { revalidate: 3600 },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json.stat !== "OK" || !json.data) return;

        for (const row of json.data) {
          // row[0] = date (ROC, e.g. "115/01/02"), row[4] = high, row[6] = close
          const rocDate: string = row[0]; // "115/01/02"
          const high = parseFloat((row[4] as string).replace(/,/g, ""));
          if (isNaN(high)) continue;

          // Convert ROC year to Gregorian
          const [rocY, m, d] = rocDate.split("/");
          const gYear = parseInt(rocY) + 1911;
          const isoDate = `${gYear}-${m}-${d}`;

          // Only include rows >= sellDate
          if (isoDate >= sellDate) {
            rows.push({ date: isoDate, high });
          }
        }
      } catch { /* skip failed months */ }
    })
  );

  if (!rows.length) return { maxHigh: null, maxHighDate: null, lastClose: null };

  let maxHigh = -Infinity;
  let maxHighDate = "";
  for (const r of rows) {
    if (r.high > maxHigh) { maxHigh = r.high; maxHighDate = r.date; }
  }

  // last close: fetch current month
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
async function fetchUSMaxHigh(ticker: string, sellDate: string): Promise<{ maxHigh: number | null; maxHighDate: string | null; lastClose: number | null }> {
  const sellTimestamp = Math.floor(new Date(sellDate).getTime() / 1000);
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
  const ticker   = searchParams.get("ticker");
  const market   = searchParams.get("market");
  const sellDate = searchParams.get("sellDate");

  if (!ticker || !market || !sellDate) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  try {
    if (market === "TW") {
      const { maxHigh, maxHighDate, lastClose } = await fetchTWMaxHigh(ticker, sellDate);
      return NextResponse.json({ symbol: ticker, currency: "TWD", maxHigh, maxHighDate, lastClose });
    } else {
      const { maxHigh, maxHighDate, lastClose } = await fetchUSMaxHigh(ticker, sellDate);
      // Get shortName from Yahoo
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
      return NextResponse.json({ symbol: ticker, shortName, currency: "USD", maxHigh, maxHighDate, lastClose });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
