import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const market = searchParams.get("market"); // "TW" or "US"
  const sellDate = searchParams.get("sellDate"); // YYYY-MM-DD

  if (!ticker || !market || !sellDate) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const symbol = market === "TW" ? `${ticker}.TW` : ticker;
  const sellTimestamp = Math.floor(new Date(sellDate).getTime() / 1000);
  const nowTimestamp = Math.floor(Date.now() / 1000);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${sellTimestamp}&period2=${nowTimestamp}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Stock not found" }, { status: 404 });
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ error: "No data" }, { status: 404 });
    }

    const highs: number[] = result.indicators?.quote?.[0]?.high ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
    const timestamps: number[] = result.timestamp ?? [];

    const validHighs = highs.filter((h) => h != null && !isNaN(h));
    const maxHigh = validHighs.length > 0 ? Math.max(...validHighs) : null;

    const lastClose = closes.filter((c) => c != null && !isNaN(c)).pop() ?? null;
    const lastTimestamp = timestamps[timestamps.length - 1] ?? null;

    const meta = result.meta;
    const currency = meta?.currency ?? "USD";
    const shortName = meta?.shortName ?? symbol;

    return NextResponse.json({
      symbol,
      shortName,
      currency,
      maxHigh,
      lastClose,
      lastDate: lastTimestamp
        ? new Date(lastTimestamp * 1000).toISOString().split("T")[0]
        : null,
    });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
