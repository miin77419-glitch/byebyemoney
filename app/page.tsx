"use client";

import { useState } from "react";
import RegretTab from "@/components/RegretTab";
import RecordsTab from "@/components/RecordsTab";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"regret" | "records">("records");

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f" }}>
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <span className="text-2xl">💸</span>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">ByeByeMoney</h1>
            <p className="text-xs text-gray-500">錢錢再見的計算機</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1 pt-3">
            {[
              { key: "records", label: "📋 賣飛紀錄" },
              { key: "regret", label: "💊 後悔藥" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as "regret" | "records")}
                className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-all cursor-pointer ${
                  activeTab === key
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="fade-in" key={activeTab}>
          {activeTab === "records" ? <RecordsTab /> : <RegretTab />}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-600 text-xs">
        資料僅儲存在您的瀏覽器本機，重新整理不會消失，但換瀏覽器就沒了 🫥
      </footer>
    </div>
  );
}
