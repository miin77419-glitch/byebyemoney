import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ByeByeMoney 💸 賣飛計算機",
  description: "記錄你賣飛的股票，計算你少賺了多少錢",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
