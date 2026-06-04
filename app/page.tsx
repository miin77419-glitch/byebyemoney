"use client";

import { useState } from "react";
import TimeMachineTab from "@/components/TimeMachineTab";
import RecordsTab from "@/components/RecordsTab";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"records" | "timemachine">("records");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--border)" }} className="px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <span className="text-2xl">💸</span>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--fg)" }}>ByeByeMoney</h1>
            <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>錢錢再見的計算機</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1 pt-3">
            {[
              { key: "records",     label: "💊 後悔藥" },
              { key: "timemachine", label: "⏳ 時光機" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as "records" | "timemachine")}
                className="px-5 py-2.5 text-sm font-medium rounded-t-lg transition-all cursor-pointer"
                style={
                  activeTab === key
                    ? { background: "#4f46e5", color: "#fff" }
                    : { color: "var(--fg-muted)" }
                }
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
          {activeTab === "records" ? <RecordsTab /> : <TimeMachineTab />}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs" style={{ color: "var(--fg-subtle)" }}>
        所有資料僅儲存在您的瀏覽器本機，不上傳任何伺服器 🔒
      </footer>
    </div>
  );
}
