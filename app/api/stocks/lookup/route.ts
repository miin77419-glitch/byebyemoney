import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const upper = code.toUpperCase();

  // TSE (上市)
  try {
    const res = await fetch(
      `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${upper}.tw&json=1&delay=0`,
      { headers: { "User-Agent": UA }, cache: "no-store" }
    );
    const data = await res.json();
    const info = data.msgArray?.[0];
    if (info?.n) return NextResponse.json({ name: info.n, ticker: upper, exchange: "台股" });
  } catch { /* continue */ }

  // OTC (上櫃)
  try {
    const res = await fetch(
      `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=otc_${upper}.tw&json=1&delay=0`,
      { headers: { "User-Agent": UA }, cache: "no-store" }
    );
    const data = await res.json();
    const info = data.msgArray?.[0];
    if (info?.n) return NextResponse.json({ name: info.n, ticker: upper, exchange: "台股" });
  } catch { /* continue */ }

  // US stocks (Yahoo Finance)
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
