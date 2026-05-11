"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase ENV variables");
}

const supabase = createClient(
  supabaseUrl || "",
  supabaseKey || ""
);

type Probabilities = {
  month: number;
  six: number;
  year: number;
};

type NewsItem = {
  id: number;
  text: string;
  image: string | null;
  created_at: string;
};

export default function Home() {
  const [period, setPeriod] = useState<"month" | "six" | "year">("month");
  const [historyOpen, setHistoryOpen] = useState(false);

  const [data, setData] = useState<Probabilities>({
    month: 0,
    six: 0,
    year: 0,
  });

  const [news, setNews] = useState<NewsItem[]>([]);

  // =========================
  // LOAD DATA
  // =========================
  useEffect(() => {
    loadProbabilities();
    loadNews();
  }, []);

async function loadProbabilities() {
  const response = await supabase
    .from("probabilities")
    .select("*");

  console.log("SUPABASE RESPONSE:", response);

  const probs = response.data;

  if (!probs) return;

  const formatted: Probabilities = {
    month: 0,
    six: 0,
    year: 0,
  };

  probs.forEach((item) => {
    formatted[item.id as keyof Probabilities] = item.value;
  });

  setData(formatted);
}

  async function loadNews() {
    const { data: newsData } = await supabase
      .from("news")
      .select("*")
      .order("created_at", { ascending: false });

    if (!newsData) return;

    setNews(newsData);
  }

  return (
    <main className="min-h-screen bg-[#0f0f10] text-white flex flex-col items-center p-6">

      {/* CARD 1 */}
      <div className="w-full max-w-md bg-[#1a1a1d] rounded-[32px] p-6 shadow-2xl">

        <h1 className="text-2xl font-semibold text-center mb-6">
          Peace Probability
        </h1>

        <div className="flex gap-2 justify-center mb-8">

          <button
            onClick={() => setPeriod("month")}
            className={`px-4 py-2 rounded-full ${
              period === "month" ? "bg-white text-black" : "bg-[#2a2a2d]"
            }`}
          >
            1 Month
          </button>

          <button
            onClick={() => setPeriod("six")}
            className={`px-4 py-2 rounded-full ${
              period === "six" ? "bg-white text-black" : "bg-[#2a2a2d]"
            }`}
          >
            6 Months
          </button>

          <button
            onClick={() => setPeriod("year")}
            className={`px-4 py-2 rounded-full ${
              period === "year" ? "bg-white text-black" : "bg-[#2a2a2d]"
            }`}
          >
            1 Year
          </button>

        </div>

        <div className="text-center">
          <div className="text-7xl font-bold">
            {data[period]}%
          </div>

          <p className="text-gray-400 mt-2">
            Updated live
          </p>
        </div>

      </div>

      {/* CARD 2 */}
      <div className="w-full max-w-md bg-[#1a1a1d] rounded-[32px] p-6 shadow-2xl mt-6">

        <h2 className="text-xl font-semibold mb-4">
          Latest Update
        </h2>

        {/* LATEST (hidden when history open) */}
        {!historyOpen && (
          <>
            {news.length > 0 ? (
              <>
                {news[0].image && (
                  <img
                    src={news[0].image}
                    alt=""
                    className="w-full rounded-2xl mb-4"
                  />
                )}

                <p className="text-gray-300 text-sm">
                  {news[0].text}
                </p>
              </>
            ) : (
              <p className="text-gray-500 text-sm">
                No updates yet
              </p>
            )}
          </>
        )}

        {/* HISTORY BUTTON */}
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="mt-4 bg-[#2a2a2d] px-4 py-2 rounded-full"
        >
          {historyOpen ? "Close history" : "Open history"}
        </button>

        {/* HISTORY */}
        {historyOpen && (
          <div className="mt-6 space-y-4">

            {news.map((item) => (
              <div
                key={item.id}
                className="bg-[#222226] rounded-2xl p-4"
              >
                {item.image && (
                  <img
                    src={item.image}
                    alt=""
                    className="w-full rounded-2xl mb-3"
                  />
                )}

                <p className="text-sm text-gray-300">
                  {item.text}
                </p>

                <p className="text-xs text-gray-500 mt-2">
                  {new Date(item.created_at).toLocaleString()}
                </p>
              </div>
            ))}

          </div>
        )}

      </div>

      {/* FOOTER */}
      <footer className="mt-10 text-gray-500 text-sm">
        support project — @peacemeterbot
      </footer>

    </main>
  );
}