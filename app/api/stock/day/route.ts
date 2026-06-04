import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Return the high/low/close for a specific trading day
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const market = searchParams.get("market");
  const date   = searchParams.get("date"); // YYYY-MM-DD

  if (!ticker || !market || !date) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  try {
    if (market === "TW") {
      // TWSE: fetch the month that contains this date
      const [y, m] = date.split("-");
      const dateStr = `${y}${m}01`;
      const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${ticker}`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
      if (!res.ok) return NextResponse.json({ error: "TWSE fetch failed" }, { status: 502 });
      const json = await res.json();
      if (json.stat !== "OK" || !json.data) return NextResponse.json({ error: "No data" }, { status: 404 });

      // Find the row matching this date
      for (const row of json.data) {
        const rocDate: string = row[0]; // e.g. "115/01/02"
        const [rocY, mm, dd] = rocDate.split("/");
        const isoDate = `${parseInt(rocY) + 1911}-${mm}-${dd}`;
        if (isoDate === date) {
          const high  = parseFloat((row[4] as string).replace(/,/g, ""));
          const low   = parseFloat((row[5] as string).replace(/,/g, ""));
          const close = parseFloat((row[6] as string).replace(/,/g, ""));
          return NextResponse.json({ date, high, low, close, currency: "TWD" });
        }
      }
      return NextResponse.json({ error: "Date not found (non-trading day?)" }, { status: 404 });

    } else {
      // Yahoo Finance: 1-day range
      const p1 = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
      const p2 = p1 + 86400;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${p1}&period2=${p2}`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) return NextResponse.json({ error: "Yahoo fetch failed" }, { status: 502 });
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result?.indicators?.quote?.[0]) return NextResponse.json({ error: "No data" }, { status: 404 });
      const q = result.indicators.quote[0];
      const high  = q.high?.[0]  ?? null;
      const low   = q.low?.[0]   ?? null;
      const close = q.close?.[0] ?? null;
      if (high == null) return NextResponse.json({ error: "No OHLC data for this date" }, { status: 404 });
      return NextResponse.json({ date, high, low, close, currency: "USD" });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
