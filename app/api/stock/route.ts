import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface DayRow { date: string; value: number } // value = high or close

function nextDay(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

// ── TWSE 上市 ─────────────────────────────────────────────────────────────
async function fetchTWSEPeak(
  ticker: string, startDate: string, useClose: boolean
): Promise<{ maxHigh: number | null; maxHighDate: string | null; lastClose: number | null }> {
  const sell = new Date(startDate);
  const now  = new Date();
  const months: string[] = [];
  let cur = new Date(sell.getFullYear(), sell.getMonth(), 1);
  while (cur <= now) {
    months.push(`${cur.getFullYear()}${String(cur.getMonth() + 1).padStart(2, "0")}01`);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  const rows: DayRow[] = [];
  await Promise.allSettled(months.map(async (dateStr) => {
    try {
      const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${ticker}`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } });
      if (!res.ok) return;
      const json = await res.json();
      if (json.stat !== "OK" || !json.data) return;
      for (const row of json.data) {
        // row[4]=high, row[6]=close
        const colIdx = useClose ? 6 : 4;
        const value = parseFloat((row[colIdx] as string).replace(/,/g, ""));
        if (isNaN(value)) continue;
        const [rocY, m, d] = (row[0] as string).split("/");
        const isoDate = `${parseInt(rocY) + 1911}-${m}-${d}`;
        if (isoDate >= startDate) rows.push({ date: isoDate, value });
      }
    } catch { /**/ }
  }));

  if (!rows.length) return { maxHigh: null, maxHighDate: null, lastClose: null };

  let maxVal = -Infinity, maxDate = "";
  for (const r of rows) { if (r.value > maxVal) { maxVal = r.value; maxDate = r.date; } }

  // last close (always close price for reference)
  let lastClose: number | null = null;
  try {
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, "0");
    const res = await fetch(`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${y}${m}01&stockNo=${ticker}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } });
    if (res.ok) {
      const json = await res.json();
      if (json.stat === "OK" && json.data?.length) {
        const c = parseFloat((json.data[json.data.length - 1][6] as string).replace(/,/g, ""));
        if (!isNaN(c)) lastClose = c;
      }
    }
  } catch { /**/ }

  return { maxHigh: maxVal, maxHighDate: maxDate, lastClose };
}

// ── Yahoo Finance（上櫃 .TWO / 美股） ─────────────────────────────────────
async function fetchYahooPeak(
  symbol: string, startDate: string, useClose: boolean
): Promise<{ maxHigh: number | null; maxHighDate: string | null; lastClose: number | null }> {
  const p1 = Math.floor(new Date(startDate).getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${p1}&period2=${p2}`,
    { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, next: { revalidate: 3600 } }
  );
  if (!res.ok) return { maxHigh: null, maxHighDate: null, lastClose: null };

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return { maxHigh: null, maxHighDate: null, lastClose: null };

  const highs:      (number | null)[] = result.indicators?.quote?.[0]?.high  ?? [];
  const closes:     (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const timestamps: number[]          = result.timestamp ?? [];
  const series = useClose ? closes : highs;

  let maxVal = -Infinity, maxDate = "";
  for (let i = 0; i < timestamps.length; i++) {
    const v = series[i];
    if (v == null || isNaN(v)) continue;
    if (v > maxVal) { maxVal = v; maxDate = new Date(timestamps[i] * 1000).toISOString().split("T")[0]; }
  }

  const validCloses = closes.filter((c): c is number => c != null && !isNaN(c));
  return {
    maxHigh:     maxVal === -Infinity ? null : maxVal,
    maxHighDate: maxDate || null,
    lastClose:   validCloses.at(-1) ?? null,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker       = searchParams.get("ticker");
  const market       = searchParams.get("market");
  const sellDate     = searchParams.get("sellDate");
  const includeToday = searchParams.get("includeToday") === "true";
  const useClose     = searchParams.get("useClose") !== "false"; // default true

  if (!ticker || !market || !sellDate) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const startDate = includeToday ? sellDate : nextDay(sellDate);

  try {
    if (market === "US") {
      const result = await fetchYahooPeak(ticker, startDate, useClose);
      let shortName = ticker;
      try {
        const qr = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}&fields=shortName`,
          { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 86400 } });
        if (qr.ok) { const qd = await qr.json(); shortName = qd.quoteResponse?.result?.[0]?.shortName ?? ticker; }
      } catch { /**/ }
      return NextResponse.json({ symbol: ticker, shortName, currency: "USD", ...result });
    }

    // TW: TWSE → Yahoo .TWO → Yahoo .TW
    const twseResult = await fetchTWSEPeak(ticker, startDate, useClose);
    if (twseResult.maxHigh !== null) {
      return NextResponse.json({ symbol: ticker, currency: "TWD", source: "TWSE", ...twseResult });
    }

    const twoResult = await fetchYahooPeak(`${ticker}.TWO`, startDate, useClose);
    if (twoResult.maxHigh !== null) {
      return NextResponse.json({ symbol: ticker, currency: "TWD", source: "Yahoo-TWO", ...twoResult });
    }

    const twResult = await fetchYahooPeak(`${ticker}.TW`, startDate, useClose);
    if (twResult.maxHigh !== null) {
      return NextResponse.json({ symbol: ticker, currency: "TWD", source: "Yahoo-TW", ...twResult });
    }

    return NextResponse.json({
      symbol: ticker, currency: "TWD",
      maxHigh: null, maxHighDate: null, lastClose: null,
      fetchError: "免費資料庫無法取得此股票資料（可能為興櫃或下市股票）",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
