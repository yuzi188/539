"use client";

import { useEffect, useMemo, useState } from "react";
import { seedHistory, type Draw } from "./lib/lotto-data";

type Mode = "balanced" | "hot" | "cold" | "value";
type EditMode = "lock" | "exclude";

const fallbackHistory = seedHistory;

const allNumbers = Array.from({ length: 39 }, (_, index) => index + 1);

const modes: { id: Mode; label: string; detail: string }[] = [
  { id: "balanced", label: "平衡", detail: "冷熱、奇偶、大小混合" },
  { id: "hot", label: "熱號", detail: "近期高頻優先" },
  { id: "cold", label: "補冷", detail: "遺漏較久優先" },
  { id: "value", label: "和值", detail: "避開極端和值" },
];

const pad = (value: number) => value.toString().padStart(2, "0");

function sum(numbers: number[]) {
  return numbers.reduce((total, number) => total + number, 0);
}

function getHits(candidate: number[], draw: Draw) {
  return candidate.filter((number) => draw.numbers.includes(number)).length;
}

function buildStats(draws: Draw[]) {
  return allNumbers.map((number) => {
    const frequency = draws.filter((draw) => draw.numbers.includes(number)).length;
    const lastIndex = draws.findIndex((draw) => draw.numbers.includes(number));
    const missing = lastIndex === -1 ? draws.length : lastIndex;
    return { number, frequency, missing };
  });
}

function scoreNumber(
  number: number,
  mode: Mode,
  stats: ReturnType<typeof buildStats>,
) {
  const stat = stats.find((item) => item.number === number);
  const frequency = stat?.frequency ?? 0;
  const missing = stat?.missing ?? 0;
  const centerBias = 20 - Math.abs(20 - number);
  const tailBalance = 5 - Math.abs(5 - (number % 10));

  if (mode === "hot") return frequency * 10 + centerBias * 0.35 - missing;
  if (mode === "cold") return missing * 6 + tailBalance - frequency * 1.5;
  if (mode === "value") return centerBias * 2 + frequency * 2 + tailBalance;
  return frequency * 4 + missing * 2 + centerBias * 0.7 + tailBalance;
}

function normalizeCombo(numbers: number[]) {
  return [...numbers].sort((a, b) => a - b);
}

function makeCombo(
  mode: Mode,
  stats: ReturnType<typeof buildStats>,
  locked: number[],
  excluded: number[],
  offset: number,
) {
  const chosen = new Set(locked.slice(0, 5));
  const blocked = new Set(excluded);
  const candidates = allNumbers
    .filter((number) => !chosen.has(number) && !blocked.has(number))
    .map((number) => ({
      number,
      score:
        scoreNumber(number, mode, stats) +
        Math.sin((number + 3) * (offset + 1)) * 1.7,
    }))
    .sort((a, b) => b.score - a.score);

  for (const candidate of candidates) {
    if (chosen.size >= 5) break;
    const next = [...chosen, candidate.number];
    const odd = next.filter((number) => number % 2 === 1).length;
    const low = next.filter((number) => number <= 19).length;
    const currentSum = sum(next);
    const balancedEnough =
      mode !== "balanced" ||
      (odd >= 1 && odd <= 4 && low >= 1 && low <= 4 && currentSum <= 145);

    if (balancedEnough || chosen.size < 3) {
      chosen.add(candidate.number);
    }
  }

  return normalizeCombo([...chosen].slice(0, 5));
}

function makeFreshCombo(
  mode: Mode,
  stats: ReturnType<typeof buildStats>,
  locked: number[],
  excluded: number[],
) {
  const chosen = new Set(locked.slice(0, 5));
  const blocked = new Set(excluded);
  const weighted = allNumbers
    .filter((number) => !chosen.has(number) && !blocked.has(number))
    .map((number) => {
      const score = Math.max(1, scoreNumber(number, mode, stats));
      return { number, weight: score + Math.random() * 12 };
    });

  while (chosen.size < 5 && weighted.length) {
    const total = weighted.reduce((acc, item) => acc + item.weight, 0);
    let cursor = Math.random() * total;
    const index = weighted.findIndex((item) => {
      cursor -= item.weight;
      return cursor <= 0;
    });
    const picked = weighted.splice(Math.max(0, index), 1)[0];
    chosen.add(picked.number);
  }

  return normalizeCombo([...chosen]);
}

function describeCombo(numbers: number[]) {
  const odd = numbers.filter((number) => number % 2 === 1).length;
  const low = numbers.filter((number) => number <= 19).length;
  const tails = new Set(numbers.map((number) => number % 10)).size;
  return `奇偶 ${odd}:${5 - odd} / 大小 ${5 - low}:${low} / 和值 ${sum(
    numbers,
  )} / 尾數 ${tails} 種`;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("balanced");
  const [editMode, setEditMode] = useState<EditMode>("lock");
  const [locked, setLocked] = useState<number[]>([8, 16]);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [generated, setGenerated] = useState<number[][]>([]);
  const [history, setHistory] = useState<Draw[]>(fallbackHistory);
  const [dataSource, setDataSource] = useState("示範資料");
  const [betAmount, setBetAmount] = useState(50);
  const [isLatestFiveOpen, setIsLatestFiveOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadStaticHistory = () =>
      fetch("/data/lotto539_daily_cash_history.json")
        .then((response) => (response.ok ? response.json() : null))
        .then((draws: Draw[] | null) => {
          if (!isMounted || !draws?.length) return;
          setHistory(draws);
          setDataSource("5年爬蟲資料");
        });

    fetch("/api/draws")
      .then((response) => response.json())
      .then((payload: { draws?: Draw[]; source?: string }) => {
        if (!isMounted || !payload.draws?.length) return;
        if (payload.source !== "database") {
          void loadStaticHistory();
          return;
        }
        setHistory(payload.draws);
        setDataSource("資料庫");
      })
      .catch(() => {
        if (isMounted) void loadStaticHistory();
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => buildStats(history), [history]);
  const latest = history[0] ?? fallbackHistory[0];
  const latestFive = history.slice(0, 5);
  const hot = [...stats].sort((a, b) => b.frequency - a.frequency).slice(0, 8);
  const cold = [...stats].sort((a, b) => b.missing - a.missing).slice(0, 8);
  const predictions = modes.map((item, index) => ({
    ...item,
    numbers: makeCombo(item.id, stats, locked, excluded, index),
  }));
  const backtestBase = locked.length === 5 ? normalizeCombo(locked) : predictions[0].numbers;
  const backtest = history.map((draw) => getHits(backtestBase, draw));
  const backtestWinCount = backtest.filter((hit) => hit >= 2).length;
  const backtestLabel = locked.length === 5 ? "你鎖定的 5 個號碼" : "目前平衡主推組合";
  const prizes = backtest.reduce(
    (acc, hit) => acc + (hit === 5 ? 8000000 : hit === 4 ? 20000 : hit === 3 ? 300 : hit === 2 ? 50 : 0),
    0,
  );
  const cost = history.length * betAmount;
  const profit = prizes - cost;

  function toggleNumber(number: number) {
    if (editMode === "lock") {
      setExcluded((items) => items.filter((item) => item !== number));
      setLocked((items) =>
        items.includes(number)
          ? items.filter((item) => item !== number)
          : items.length < 5
            ? normalizeCombo([...items, number])
            : items,
      );
      return;
    }

    setLocked((items) => items.filter((item) => item !== number));
    setExcluded((items) =>
      items.includes(number)
        ? items.filter((item) => item !== number)
        : normalizeCombo([...items, number]),
    );
  }

  function generate() {
    setGenerated(
      Array.from({ length: 6 }, () => makeFreshCombo(mode, stats, locked, excluded)),
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f2ea] text-[#22201c]">
      <section className="hero-band">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
          <div className="headline-panel">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6c4a00]">
              <span>今彩539分析站</span>
              <span className="status-dot" />
              <span>下一期參考模型</span>
              <span className="source-pill">{dataSource}</span>
            </div>
            <h1>539 Predictor Lab</h1>
            <p>
              以歷史開獎資料建立冷熱、遺漏、奇偶、大小、和值與尾數模型，
              每期留下預測紀錄，開獎後自動回測命中狀況。
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={generate}>
                產生本期參考
              </button>
              <a className="secondary-button" href="#lab">
                進入分析台
              </a>
              <a className="secondary-button" href="/history">
                歷史開獎
              </a>
              <a className="secondary-button" href="/member">
                會員中心
              </a>
            </div>
          </div>

          <div className="latest-panel">
            <div className="panel-label">最新開獎</div>
            <div className="latest-meta">
              <strong>第 {latest.period} 期</strong>
              <span>{latest.date}</span>
            </div>
            <div className="balls-row">
              {latest.numbers.map((number) => (
                <span className="ball big" key={number}>
                  {pad(number)}
                </span>
              ))}
            </div>
            <div className={`latest-draw-list ${isLatestFiveOpen ? "open" : ""}`} aria-label="近5期開獎紀錄">
              <div className="latest-list-title">
                <button
                  aria-expanded={isLatestFiveOpen}
                  onClick={() => setIsLatestFiveOpen((value) => !value)}
                  type="button"
                >
                  <span>近 5 期紀錄</span>
                  <strong>{isLatestFiveOpen ? "收合" : "展開"}</strong>
                </button>
                <a href="/history">全部歷史</a>
              </div>
              {isLatestFiveOpen ? (
                <div className="latest-draw-items">
                  {latestFive.map((draw) => (
                    <article className="latest-draw-row" key={draw.period}>
                      <div>
                        <strong>第 {draw.period} 期</strong>
                        <span>{draw.date}</span>
                      </div>
                      <div className="balls-row mini">
                        {draw.numbers.map((number) => (
                          <span className="ball tiny" key={`${draw.period}-${number}`}>
                            {pad(number)}
                          </span>
                        ))}
                      </div>
                      <b>{sum(draw.numbers)}</b>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="guide-band" aria-labelledby="guide-title">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="guide-panel">
            <div className="guide-heading">
              <div>
                <span>第一次使用</span>
                <h2 id="guide-title">照這 4 步看懂本期參考</h2>
              </div>
              <a className="secondary-button" href="#lab">
                開始操作
              </a>
              <a className="secondary-button" href="/history">
                查看歷史開獎
              </a>
            </div>
            <div className="guide-grid">
              <article>
                <strong>1</strong>
                <h3>先看資料來源</h3>
                <p>左上角顯示「資料庫」或「5年爬蟲資料」時，代表分析已使用歷史開獎資料。</p>
              </article>
              <article>
                <strong>2</strong>
                <h3>選擇分析模型</h3>
                <p>平衡適合一般參考；熱號看近期高頻；補冷看遺漏較久；和值避開極端組合。</p>
              </article>
              <article>
                <strong>3</strong>
                <h3>鎖定或排除號碼</h3>
                <p>右側先切換「鎖定」或「排除」，再點 01-39。最多鎖定 5 個號碼。</p>
              </article>
              <article>
                <strong>4</strong>
                <h3>產生後看回測</h3>
                <p>按「重新產生」取得組合，再看近 5 年命中 2 碼以上的次數與模擬成本。</p>
              </article>
            </div>
            <p className="guide-note">
              使用規則：本頁只做數據分析與號碼參考，不保證中獎；建議每期先看資料來源，再用固定模型產生組合，避免憑感覺加碼。
            </p>
          </div>
        </div>
      </section>

      <section id="lab" className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <div className="space-y-4">
          <div className="toolbar">
            <div>
              <h2>每期預測</h2>
              <p>固定保存模型輸出，開獎後核對命中數。</p>
            </div>
            <div className="segmented">
              {modes.map((item) => (
                <button
                  className={mode === item.id ? "active" : ""}
                  key={item.id}
                  onClick={() => setMode(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="prediction-grid">
            {(generated.length
              ? generated.map((numbers, index) => ({
                  id: `gen-${index}`,
                  label: `產生 ${index + 1}`,
                  detail: modes.find((item) => item.id === mode)?.detail ?? "",
                  numbers,
                }))
              : predictions
            ).map((item) => (
              <article className="prediction-card" key={item.id}>
                <div className="card-topline">
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
                <div className="balls-row compact">
                  {item.numbers.map((number) => (
                    <span className="ball" key={number}>
                      {pad(number)}
                    </span>
                  ))}
                </div>
                <p>{describeCombo(item.numbers)}</p>
              </article>
            ))}
          </div>

          <div className="analysis-grid">
            <section className="data-panel">
              <div className="section-title">
                <h2>冷熱號</h2>
                <span>近 {history.length} 期</span>
              </div>
              <div className="rank-columns">
                <div>
                  <h3>熱號</h3>
                  {hot.map((item) => (
                    <div className="rank-row" key={item.number}>
                      <span>{pad(item.number)}</span>
                      <div className="bar-track">
                        <i style={{ width: `${item.frequency * 16}%` }} />
                      </div>
                      <strong>{item.frequency}</strong>
                    </div>
                  ))}
                </div>
                <div>
                  <h3>遺漏</h3>
                  {cold.map((item) => (
                    <div className="rank-row amber" key={item.number}>
                      <span>{pad(item.number)}</span>
                      <div className="bar-track">
                        <i style={{ width: `${Math.min(100, item.missing * 8)}%` }} />
                      </div>
                      <strong>{item.missing}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="data-panel">
              <div className="section-title">
                <h2>回測試算</h2>
                <span>{backtestLabel}</span>
              </div>
              <p className="backtest-intro">
                把下方這組號碼套回近 {history.length.toLocaleString()} 期開獎，假設每期都下同一組，用來看歷史上中幾次、花多少、拿回多少。
              </p>
              <div className="backtest-current">
                <span>目前拿去回測的號碼</span>
                <div className="balls-row compact">
                  {backtestBase.map((number) => (
                    <span className="ball muted" key={number}>
                      {pad(number)}
                    </span>
                  ))}
                </div>
              </div>
              <label className="inline-amount-control">
                每期投注金額
                <input
                  min={0}
                  step={50}
                  type="number"
                  value={betAmount}
                  onChange={(event) =>
                    setBetAmount(Math.max(0, Number(event.target.value) || 0))
                  }
                />
              </label>
              <p className="backtest-formula">
                試算方式：{history.length.toLocaleString()} 期 × 每期 {betAmount.toLocaleString()} 元 = 假設投入 {cost.toLocaleString()} 元
              </p>
              <div className="backtest-grid">
                <div>
                  <span>假設投入</span>
                  <strong>{cost.toLocaleString()} 元</strong>
                </div>
                <div>
                  <span>歷史派彩</span>
                  <strong>{prizes.toLocaleString()} 元</strong>
                </div>
                <div>
                  <span>中 2 碼以上</span>
                  <strong>{backtestWinCount} 期</strong>
                </div>
                <div>
                  <span>試算損益</span>
                  <strong className={profit >= 0 ? "profit-positive" : "profit-negative"}>
                    {profit >= 0 ? "+" : ""}
                    {profit.toLocaleString()} 元
                  </strong>
                </div>
              </div>
              <div className="hit-strip-title">
                <span>最近 16 期命中碼數</span>
                <strong>紅色代表中 2 碼以上</strong>
              </div>
              <div className="hit-strip">
                {backtest.slice(0, 16).map((hit, index) => (
                  <span className={hit >= 2 ? "hit" : ""} key={`${hit}-${index}`}>
                    {hit}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </div>

        <aside className="control-panel">
          <div className="section-title">
            <h2>號碼實驗室</h2>
            <span>{locked.length}/5 鎖定</span>
          </div>

          <div className="segmented full">
            <button
              className={editMode === "lock" ? "active" : ""}
              onClick={() => setEditMode("lock")}
            >
              鎖定
            </button>
            <button
              className={editMode === "exclude" ? "active" : ""}
              onClick={() => setEditMode("exclude")}
            >
              排除
            </button>
          </div>

          <div className="number-grid" aria-label="01到39號碼選擇">
            {allNumbers.map((number) => {
              const isLocked = locked.includes(number);
              const isExcluded = excluded.includes(number);
              return (
                <button
                  className={`${isLocked ? "locked" : ""} ${isExcluded ? "excluded" : ""}`}
                  key={number}
                  onClick={() => toggleNumber(number)}
                >
                  {pad(number)}
                </button>
              );
            })}
          </div>

          <button className="primary-button wide" onClick={generate}>
            重新產生
          </button>

          <div className="mini-summary">
            <div>
              <span>已鎖定</span>
              <strong>{locked.length ? locked.map(pad).join(" ") : "無"}</strong>
            </div>
            <div>
              <span>已排除</span>
              <strong>{excluded.length ? excluded.map(pad).join(" ") : "無"}</strong>
            </div>
          </div>

          <div className="rules-box">
            <strong>操作規則</strong>
            <ol>
              <li>先選模型，再調整鎖定或排除號碼。</li>
              <li>綠色代表鎖定，斜線代表排除。</li>
              <li>每次產生後都看回測，不只看單組號碼。</li>
            </ol>
          </div>

          <p className="risk-note">
            僅供數據參考。今彩539為隨機遊戲，請量力投注。
          </p>
        </aside>
      </section>
    </main>
  );
}
