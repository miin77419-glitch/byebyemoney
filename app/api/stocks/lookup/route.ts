import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

// Check if string contains Chinese characters (= name search)
function hasChinese(s: string) {
  return /[一-鿿㐀-䶿]/.test(s);
}

// ── Name → ticker via FinMind TaiwanStockInfo (cached 24h by Next.js) ───
async function nameToTicker(name: string): Promise<{ ticker: string; name: string } | null> {
  try {
    const res = await fetch(
      "https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo",
      { next: { revalidate: 86400 } } // cache 24 hours
    );
    if (!res.ok) return null;
    const data = await res.json();
    const stocks: { stock_id: string; stock_name: string }[] = data.data ?? [];

    // Exact match first, then partial
    const exact   = stocks.find(s => s.stock_name === name);
    const partial  = stocks.find(s => s.stock_name.includes(name) || name.includes(s.stock_name));
    const match = exact ?? partial;
    if (!match) return null;
    return { ticker: match.stock_id, name: match.stock_name };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  // ── Chinese name search ───────────────────────────────────────────────
  if (hasChinese(code)) {
    const match = await nameToTicker(code);
    if (match) {
      return NextResponse.json({ name: match.name, ticker: match.ticker, exchange: "台股" });
    }
    return NextResponse.json({ error: "找不到此股票名稱" }, { status: 404 });
  }

  const upper = code.toUpperCase();

  // ── Ticker search: TSE (上市) ─────────────────────────────────────────
  try {
    const res = await fetch(
      `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${upper}.tw&json=1&delay=0`,
      { headers: { "User-Agent": UA }, cache: "no-store" }
    );
    const data = await res.json();
    const info = data.msgArray?.[0];
    if (info?.n && info.n !== "-") {
      return NextResponse.json({ name: info.n, ticker: upper, exchange: "台股" });
    }
  } catch { /* continue */ }

  // ── OTC (上櫃) ────────────────────────────────────────────────────────
  try {
    const res = await fetch(
      `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=otc_${upper}.tw&json=1&delay=0`,
      { headers: { "User-Agent": UA }, cache: "no-store" }
    );
    const data = await res.json();
    const info = data.msgArray?.[0];
    if (info?.n && info.n !== "-") {
      return NextResponse.json({ name: info.n, ticker: upper, exchange: "台股" });
    }
  } catch { /* continue */ }

  // ── US stocks (Yahoo Finance) ─────────────────────────────────────────
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${upper}&fields=shortName,longName`,
      { headers: { "User-Agent": UA }, cache: "no-store" }
    );
    const data = await res.json();
    const info = data.quoteResponse?.result?.[0];
    if (info?.shortName) {
      return NextResponse.json({ name: info.shortName, ticker: upper, exchange: "美股" });
    }
  } catch { /* continue */ }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
