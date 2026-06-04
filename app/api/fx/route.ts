import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 取 USD → TWD 即時匯率（open.er-api.com 免費，無需 API key）
export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 }, // cache 1 hour
    });
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    const rate: number = data.rates?.TWD;
    if (!rate) throw new Error("no TWD rate");
    return NextResponse.json({ rate, updatedAt: data.time_last_update_utc ?? null });
  } catch {
    // fallback to a reasonable default if API fails
    return NextResponse.json({ rate: 32.5, updatedAt: null, fallback: true });
  }
}
