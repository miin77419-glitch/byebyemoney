"use client";

export default function RegretTab() {
  const studies = [
    {
      emoji: "📊",
      title: "散戶提早賣贏家，死抱輸家",
      author: "Odean (1998) — Journal of Finance",
      finding:
        "研究美國 10,000 個散戶帳戶，發現投資人出售獲利股票的機率比虧損股票高出 50%。而那些被賣掉的股票，後來平均比繼續持有的股票多賺了 3.4%。",
      lesson: "你的「停利」，可能只是在幫股票換主人。",
      color: "from-indigo-500/20 to-purple-500/20",
      border: "border-indigo-500/30",
    },
    {
      emoji: "🧠",
      title: "心理帳戶讓你賣在最不對的時機",
      author: "Thaler (1985) — Mental Accounting",
      finding:
        "人類大腦會把不同來源的錢分開處理，導致我們對「已賺到的」股票過度保護，對「還沒賺到的」部位反而死撐。這種行為讓散戶的年化報酬率平均比大盤少 1.5% 至 2%。",
      lesson: "你以為在保護獲利，其實是在放棄更大的獲利。",
      color: "from-pink-500/20 to-rose-500/20",
      border: "border-pink-500/30",
    },
    {
      emoji: "💡",
      title: "賣出決策比買入決策更影響報酬",
      author: "Frazzini (2006) — Journal of Finance",
      finding:
        "分析共同基金的研究顯示，基金經理人的賣出決策比買入決策更容易出錯。被賣掉的股票在未來 12 個月，平均比買進的新股票多漲 70 個基點。「賣什麼」比「買什麼」更難對。",
      lesson: "賣出才是最難的決策，但我們花最少時間在上面。",
      color: "from-amber-500/20 to-orange-500/20",
      border: "border-amber-500/30",
    },
    {
      emoji: "📉",
      title: "散戶交易越頻繁，賠越多",
      author: "Barber & Odean (2000) — Journal of Finance",
      finding:
        "研究 66,465 個家庭帳戶，交易最頻繁的 20% 散戶，年均報酬比買入持有策略少了 6.5%。交易成本只能解釋一部分，更大的損失來自於「賣掉了後來漲更多的股票」。",
      lesson: "動作多不代表賺更多，動作多通常代表賺更少。",
      color: "from-emerald-500/20 to-teal-500/20",
      border: "border-emerald-500/30",
    },
    {
      emoji: "🔮",
      title: "後見之明偏誤讓你忘記你有多幸運",
      author: "Kahneman & Riepe (1998) — Behavioral Finance",
      finding:
        "人在回憶自己的投資決策時，傾向記住自己「正確判斷」的部分，而淡化運氣成分。這讓我們對自己的選股眼光過度自信，更容易在不對的時機賣出或買入。",
      lesson: "你上次賣對，可能只是運氣。這次也是。",
      color: "from-violet-500/20 to-indigo-500/20",
      border: "border-violet-500/30",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div
        className="rounded-2xl p-6 border border-white/10"
        style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))" }}
      >
        <h2 className="text-2xl font-bold text-white mb-2">💊 後悔藥</h2>
        <p className="text-gray-300 text-sm leading-relaxed">
          你有沒有賣掉一支股票，然後眼睜睜看著它繼續漲？
          <br />
          你不孤單。學術研究告訴我們，這是人類的天性——而且幾乎每個散戶都會犯。
        </p>
      </div>

      {/* Studies */}
      <div className="space-y-4">
        {studies.map((s, i) => (
          <div
            key={i}
            className={`rounded-xl p-5 border ${s.border} bg-gradient-to-br ${s.color}`}
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl mt-0.5">{s.emoji}</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold text-base mb-0.5">{s.title}</h3>
                <p className="text-gray-500 text-xs mb-3 font-mono">{s.author}</p>
                <p className="text-gray-300 text-sm leading-relaxed mb-3">{s.finding}</p>
                <div className="bg-black/30 rounded-lg px-4 py-2.5 border border-white/10">
                  <p className="text-indigo-300 text-sm font-medium">👉 {s.lesson}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="rounded-xl p-5 border border-white/10 bg-white/5 text-center">
        <p className="text-gray-400 text-sm">
          研究都看完了？去「賣飛紀錄」算算你這次少賺了多少吧 😅
        </p>
      </div>
    </div>
  );
}
