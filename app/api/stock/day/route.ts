import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function fetchYahooDay(symbol: string, date: string) {
  const p1 = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
  const p2 = p1 + 86400;
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${p1}&period2=${p2}`,
    { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store" }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const q = data?.chart?.result?.[0]?.indicators?.quote?.[0];
  if (!q?.high?.[0]) return null;
  return { high: q.high[0], low: q.low[0], close: q.close[0] };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const market = searchParams.get("market");
  const date   = searchParams.get("date");

  if (!ticker || !market || !date) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  // US stocks: Yahoo only
  if (market === "US") {
    const r = await fetchYahooDay(ticker, date);
    if (r) return NextResponse.json({ date, ...r, currency: "USD" });
    return NextResponse.json({ error: "免費資料庫無法取得資料" }, { status: 404 });
  }

  // TW: try TWSE (上市) first
  try {
    const [y, m] = date.split("-");
    const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${y}${m}01&stockNo=${ticker}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      if (json.stat === "OK" && json.data) {
        for (const row of json.data) {
          const [rocY, mm, dd] = (row[0] as string).split("/");
          const isoDate = `${parseInt(rocY) + 1911}-${mm}-${dd}`;
          if (isoDate === date) {
            const high  = parseFloat((row[4] as string).replace(/,/g, ""));
            const low   = parseFloat((row[5] as string).replace(/,/g, ""));
            const close = parseFloat((row[6] as string).replace(/,/g, ""));
            return NextResponse.json({ date, high, low, close, currency: "TWD" });
          }
        }
      }
    }
  } catch { /**/ }

  // Fallback: Yahoo .TWO (上櫃)
  const twoResult = await fetchYahooDay(`${ticker}.TWO`, date);
  if (twoResult) return NextResponse.json({ date, ...twoResult, currency: "TWD" });

  // Fallback: Yahoo .TW
  const twResult = await fetchYahooDay(`${ticker}.TW`, date);
  if (twResult) return NextResponse.json({ date, ...twResult, currency: "TWD" });

  return NextResponse.json({ error: "免費資料庫無法取得資料（可能為興櫃、假日或下市）" }, { status: 404 });
}
