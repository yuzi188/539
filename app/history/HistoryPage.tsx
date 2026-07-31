"use client";

import { useEffect, useMemo, useState } from "react";
import type { Draw } from "../lib/lotto-data";

const pad = (value: number) => value.toString().padStart(2, "0");

export function HistoryPage() {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [source, setSource] = useState("讀取中");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    let mounted = true;

    const loadStatic = () =>
      fetch("/data/lotto539_daily_cash_history.json")
        .then((response) => (response.ok ? response.json() : []))
        .then((rows: Draw[]) => {
          if (!mounted) return;
          setDraws(rows);
          setSource("5年爬蟲資料");
        });

    fetch("/api/draws")
      .then((response) => response.json())
      .then((payload: { draws?: Draw[]; source?: string }) => {
        if (!mounted) return;
        if (payload.source === "database" && payload.draws?.length) {
          setDraws(payload.draws);
          setSource("資料庫");
        } else {
          void loadStatic();
        }
      })
      .catch(() => void loadStatic());

    return () => {
      mounted = false;
    };
  }, []);

  const months = useMemo(() => {
    const values = new Set(draws.map((draw) => draw.date.slice(0, 7)));
    return [...values].sort((a, b) => b.localeCompare(a));
  }, [draws]);

  const filtered = useMemo(() => {
    const normalized = query.trim();
    return draws
      .filter((draw) => (month === "all" ? true : draw.date.startsWith(month)))
      .filter((draw) => {
        if (!normalized) return true;
        return (
          draw.period.includes(normalized) ||
          draw.date.includes(normalized) ||
          draw.numbers.some((number) => pad(number).includes(normalized))
        );
      });
  }, [draws, month, query]);

  const visible = filtered.slice(0, limit);

  return (
    <main className="min-h-screen bg-[#f6f2ea] text-[#22201c]">
      <section className="history-shell">
        <div className="member-heading">
          <div>
            <a className="back-link" href="/">
              返回分析頁
            </a>
            <h1>歷史開獎</h1>
            <p>查詢今彩539歷史期別、日期與 5 顆開獎號碼。資料會優先讀網站資料庫，沒有資料庫時使用 5 年爬蟲資料。</p>
          </div>
          <a className="secondary-button" href="/member">
            會員中心
          </a>
        </div>

        <div className="history-summary">
          <div>
            <span>資料來源</span>
            <strong>{source}</strong>
          </div>
          <div>
            <span>總筆數</span>
            <strong>{draws.length.toLocaleString()} 期</strong>
          </div>
          <div>
            <span>目前顯示</span>
            <strong>{visible.length.toLocaleString()} 期</strong>
          </div>
        </div>

        <div className="history-filters">
          <label>
            搜尋
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="期別、日期或號碼"
            />
          </label>
          <label>
            年月
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              <option value="all">全部年月</option>
              {months.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            顯示筆數
            <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              <option value={50}>最近 50 期</option>
              <option value={100}>最近 100 期</option>
              <option value={300}>最近 300 期</option>
              <option value={2000}>全部</option>
            </select>
          </label>
        </div>

        <section className="history-table-card">
          <div className="history-table">
            <div className="history-table-head">
              <span>期別</span>
              <span>日期</span>
              <span>開獎號碼</span>
              <span>和值</span>
            </div>
            {visible.map((draw) => (
              <article className="history-row" key={draw.period}>
                <strong>第 {draw.period} 期</strong>
                <span>{draw.date}</span>
                <div className="balls-row compact">
                  {draw.numbers.map((number) => (
                    <span className="ball small" key={`${draw.period}-${number}`}>
                      {pad(number)}
                    </span>
                  ))}
                </div>
                <span>{draw.numbers.reduce((total, number) => total + number, 0)}</span>
              </article>
            ))}
          </div>
          {!visible.length ? <p className="member-hint">找不到符合條件的開獎資料。</p> : null}
        </section>
      </section>
    </main>
  );
}
