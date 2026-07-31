"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { seedHistory, type Draw } from "./lib/lotto-data";

type Mode = "balanced" | "hot" | "cold" | "value";
type EditMode = "lock" | "exclude";
type PlayType = "official5" | "star2" | "star3" | "star4";
type YouTubeLive = {
  videoId: string;
  title: string;
  url: string;
  published?: string;
  source?: string;
  drawTargetDate?: string;
  drawSwitchTime?: string;
  isAfterDrawTime?: boolean;
};

const fallbackHistory = seedHistory;

const allNumbers = Array.from({ length: 39 }, (_, index) => index + 1);

const modes: { id: Mode; label: string; detail: string }[] = [
  { id: "balanced", label: "平衡", detail: "冷熱、奇偶、大小混合" },
  { id: "hot", label: "熱號", detail: "近期高頻優先" },
  { id: "cold", label: "補冷", detail: "遺漏較久優先" },
  { id: "value", label: "和值", detail: "避開極端和值" },
];

const playRules: {
  id: PlayType;
  label: string;
  size: number;
  defaultPrize: number;
  detail: string;
}[] = [
  {
    id: "official5",
    label: "官方 5 號",
    size: 5,
    defaultPrize: 50,
    detail: "選滿 5 個號碼，依命中 2 到 5 顆做一般回測。",
  },
  {
    id: "star2",
    label: "二星",
    size: 2,
    defaultPrize: 5300,
    detail: "選 2 個以上號碼，系統自動連碰成每組 2 碼。",
  },
  {
    id: "star3",
    label: "三星",
    size: 3,
    defaultPrize: 57000,
    detail: "選 3 個以上號碼，系統自動連碰成每組 3 碼。",
  },
  {
    id: "star4",
    label: "四星",
    size: 4,
    defaultPrize: 750000,
    detail: "選 4 個以上號碼，系統自動連碰成每組 4 碼。",
  },
];

const modeDescriptions: Record<Mode, string> = {
  balanced: "平衡會把冷熱、奇偶、大小混合，適合一般參考。",
  hot: "熱號會優先選近期常開的號碼，偏向追近期趨勢。",
  cold: "補冷會優先選比較久沒開的號碼，偏向補遺漏。",
  value: "和值會避開總和太高或太低的組合，讓號碼落在中間區間。",
};

const pad = (value: number) => value.toString().padStart(2, "0");

function nextPeriod(period: string) {
  const value = Number(period);
  return Number.isFinite(value) ? String(value + 1) : period;
}

function nextDrawDate(date: string) {
  const [year, month, day] = date.split(/[/-]/).map(Number);
  if (!year || !month || !day) return "";

  const next = new Date(year, month - 1, day);
  do {
    next.setDate(next.getDate() + 1);
  } while (next.getDay() === 0);

  return `${next.getFullYear()}/${pad(next.getMonth() + 1)}/${pad(next.getDate())}`;
}

function sum(numbers: number[]) {
  return numbers.reduce((total, number) => total + number, 0);
}

function getHits(candidate: number[], draw: Draw) {
  return candidate.filter((number) => draw.numbers.includes(number)).length;
}

function buildCombinations(numbers: number[], size: number, cap = 3000) {
  const normalized = normalizeCombo(numbers);
  const results: number[][] = [];

  function walk(start: number, combo: number[]) {
    if (results.length >= cap) return;
    if (combo.length === size) {
      results.push(combo);
      return;
    }

    for (let index = start; index < normalized.length; index += 1) {
      walk(index + 1, [...combo, normalized[index]]);
    }
  }

  walk(0, []);
  return results;
}

function getOfficialPrize(hit: number) {
  if (hit === 5) return 8000000;
  if (hit === 4) return 20000;
  if (hit === 3) return 300;
  if (hit === 2) return 50;
  return 0;
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
  const [playType, setPlayType] = useState<PlayType>("star2");
  const [playPayout, setPlayPayout] = useState(5300);
  const [isLatestFiveOpen, setIsLatestFiveOpen] = useState(false);
  const [youtubeLive, setYoutubeLive] = useState<YouTubeLive | null>(null);
  const [youtubeStatus, setYoutubeStatus] = useState("正在抓取今日開獎直播");
  const [youtubeReloadKey, setYoutubeReloadKey] = useState(0);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isLogicOpen, setIsLogicOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [savingPrediction, setSavingPrediction] = useState(false);
  const [predictionMessage, setPredictionMessage] = useState("");
  const [calculationMessage, setCalculationMessage] = useState("");
  const predictionRef = useRef<HTMLDivElement | null>(null);
  const backtestRef = useRef<HTMLElement | null>(null);
  const playRule = playRules.find((item) => item.id === playType) ?? playRules[1];
  const maxSelectable = playType === "official5" ? 5 : 12;

  useEffect(() => {
    setLocked((items) => items.slice(0, maxSelectable));
  }, [maxSelectable]);

  useEffect(() => {
    setPlayPayout(playRule.defaultPrize);
  }, [playRule.defaultPrize]);

  useEffect(() => {
    setIsDarkMode(window.localStorage.getItem("lotto539-theme") === "dark");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("lotto539-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

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

  useEffect(() => {
    let isMounted = true;

    const loadLive = () => {
      fetch(`/api/youtube-live?ts=${Date.now()}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((payload: YouTubeLive & { error?: string }) => {
          if (!isMounted) return;
          if (payload.videoId) {
            setYoutubeLive(payload);
            setYoutubeStatus(payload.source ?? "YouTube");
          } else {
            setYoutubeStatus(payload.error ?? "目前沒有抓到可播放開獎影片");
          }
        })
        .catch(() => {
          if (isMounted) setYoutubeStatus("目前沒有抓到可播放開獎影片");
        });
    };

    loadLive();
    const timer = window.setInterval(loadLive, 60000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const stats = useMemo(() => buildStats(history), [history]);
  const latest = history[0] ?? fallbackHistory[0];
  const targetPeriod = nextPeriod(latest.period);
  const targetDate = nextDrawDate(latest.date);
  const latestFive = history.slice(0, 5);
  const hot = [...stats].sort((a, b) => b.frequency - a.frequency).slice(0, 8);
  const cold = [...stats].sort((a, b) => b.missing - a.missing).slice(0, 8);
  const predictions = modes.map((item, index) => ({
    ...item,
    numbers: makeCombo(item.id, stats, locked, excluded, index),
  }));
  const currentMode = modes.find((item) => item.id === mode) ?? modes[0];
  const selectedNumbers = normalizeCombo(locked);
  const officialBacktestBase =
    selectedNumbers.length === 5 ? selectedNumbers : predictions[0].numbers;
  const starTickets =
    playType === "official5" ? [] : buildCombinations(selectedNumbers, playRule.size);
  const ticketCount = playType === "official5" ? 1 : starTickets.length;
  const backtestBase =
    playType === "official5" ? officialBacktestBase : selectedNumbers;
  const backtestReady = playType === "official5" || selectedNumbers.length >= playRule.size;
  const backtest = backtestReady
    ? history.map((draw) => {
        if (playType === "official5") {
          const hit = getHits(officialBacktestBase, draw);
          return {
            hit,
            winTickets: hit >= 2 ? 1 : 0,
            prize: getOfficialPrize(hit),
          };
        }

        const winTickets = starTickets.filter((ticket) =>
          ticket.every((number) => draw.numbers.includes(number)),
        ).length;
        return {
          hit: getHits(selectedNumbers, draw),
          winTickets,
          prize: winTickets * playPayout * (betAmount / 10),
        };
      })
    : [];
  const backtestWinCount = backtest.filter((item) => item.winTickets > 0).length;
  const backtestWinningTickets = backtest.reduce((acc, item) => acc + item.winTickets, 0);
  const backtestLabel =
    playType === "official5"
      ? selectedNumbers.length === 5
        ? "官方 5 號回測"
        : "官方 5 號主推組合"
      : `${playRule.label}連碰回測`;
  const prizes = backtest.reduce((acc, item) => acc + item.prize, 0);
  const cost = backtestReady ? history.length * ticketCount * betAmount : 0;
  const profit = prizes - cost;

  function toggleNumber(number: number) {
    if (editMode === "lock") {
      setExcluded((items) => items.filter((item) => item !== number));
      setLocked((items) =>
        items.includes(number)
          ? items.filter((item) => item !== number)
          : items.length < maxSelectable
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

  function runBacktestCalculation() {
    if (!backtestReady) {
      setCalculationMessage(`請至少選 ${playRule.size} 個號碼，才能試算 ${playRule.label}。`);
      window.setTimeout(() => {
        document.getElementById("number-lab")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 30);
      return;
    }

    setCalculationMessage(
      `${playRule.label}已完成試算：自動拆 ${ticketCount.toLocaleString()} 注，近 ${history.length.toLocaleString()} 期命中 ${backtestWinCount.toLocaleString()} 期。`,
    );
    window.setTimeout(() => {
      backtestRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 30);
  }

  function generate() {
    setPredictionMessage("");
    setGenerated(
      Array.from({ length: 6 }, () => makeFreshCombo(mode, stats, locked, excluded)),
    );
    window.setTimeout(() => {
      predictionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function savePrediction() {
    if (!generated.length) {
      setPredictionMessage("請先按「產生本期預測」，再保存到會員。");
      return;
    }

    setSavingPrediction(true);
    setPredictionMessage("");
    try {
      const response = await fetch("/api/member/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: targetPeriod,
          drawDate: targetDate,
          model: mode,
          sets: generated,
          locked,
          excluded,
          note: `${currentMode.label}模型自動保存`,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "保存失敗。");
      setPredictionMessage("已保存到會員中心，開獎後會自動顯示命中數。");
    } catch (error) {
      setPredictionMessage(
        error instanceof Error ? error.message : "保存失敗，請稍後再試。",
      );
    } finally {
      setSavingPrediction(false);
    }
  }

  return (
    <main className={`min-h-screen bg-[#f6f2ea] text-[#22201c] ${isDarkMode ? "dark-mode" : ""}`}>
      <section className="hero-band">
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <div className="top-action-row">
            <a className="secondary-button" href="#lab">
              進入分析台
            </a>
            <a className="secondary-button" href="/history">
              歷史開獎
            </a>
            <a className="secondary-button" href="/member">
              會員中心
            </a>
            <button
              aria-pressed={isDarkMode}
              className="secondary-button theme-toggle"
              onClick={() => setIsDarkMode((value) => !value)}
              type="button"
            >
              {isDarkMode ? "淺色模式" : "深色模式"}
            </button>
          </div>
        </div>
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
            <section className="youtube-live-panel" aria-label="539 開獎直播播放器">
              <div className="youtube-live-copy">
                <span>每日自動抓取</span>
                <strong>539 開獎直播</strong>
              </div>
              <div className="youtube-frame">
                {youtubeLive?.videoId ? (
                  <iframe
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    key={`${youtubeLive.videoId}-${youtubeReloadKey}`}
                    loading="eager"
                    referrerPolicy="strict-origin-when-cross-origin"
                    src={`https://www.youtube.com/embed/${youtubeLive.videoId}?autoplay=1&mute=1&rel=0&playsinline=1&controls=1`}
                    title={youtubeLive.title}
                  />
                ) : (
                  <div className="youtube-empty">{youtubeStatus}</div>
                )}
              </div>
              <div className="youtube-live-meta">
                <span>{youtubeLive?.title ?? youtubeStatus}</span>
                {youtubeLive?.url ? (
                  <div className="youtube-live-actions">
                    <button onClick={() => setYoutubeReloadKey((value) => value + 1)} type="button">
                      重新播放
                    </button>
                    <a href={youtubeLive.url} rel="noreferrer" target="_blank">
                      到 YouTube 看直播
                    </a>
                  </div>
                ) : null}
              </div>
              <p className="youtube-live-rule">
                {youtubeLive?.drawSwitchTime
                  ? youtubeLive.isAfterDrawTime
                    ? `已到今日開獎時間，正在播放當日開獎影片；目前對應 ${youtubeLive.drawTargetDate ?? "今天"}。`
                    : `今日尚未到開獎時間，先播放上一個開獎日影片；台灣時間 ${youtubeLive.drawSwitchTime} 後自動切換當日。`
                  : "今日尚未到開獎時間會播放昨天，台灣時間 20:30 後自動切換當日。"}
                影片會先靜音自動播放，若瀏覽器擋住請直接按播放器。
              </p>
            </section>
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
              <div className="guide-actions">
                <button
                  className="secondary-button"
                  onClick={() => setIsGuideOpen((value) => !value)}
                  type="button"
                >
                  {isGuideOpen ? "收合說明" : "展開說明"}
                </button>
                <a className="secondary-button" href="#lab">
                  開始操作
                </a>
                <a className="secondary-button" href="/history">
                  查看歷史開獎
                </a>
              </div>
            </div>
            {isGuideOpen ? (
              <>
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
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section id="lab" className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <div className="lab-main">
          <div className="workflow-strip" aria-label="操作流程">
            <span>1 選模型</span>
            <span>2 鎖定或排除號碼</span>
            <span>3 產生 6 組參考</span>
          </div>

          <div className="toolbar">
            <div>
              <h2>每期預測</h2>
              <p>固定保存模型輸出，開獎後核對命中數。</p>
            </div>
            <div className="toolbar-actions">
              <div className="segmented">
                {modes.map((item) => (
                  <button
                    aria-label={`${item.label}模型：${item.detail}`}
                    className={mode === item.id ? "active" : ""}
                    key={item.id}
                    onClick={() => setMode(item.id)}
                    title={item.detail}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button className="primary-button generate-button" onClick={generate} type="button">
                產生本期預測
              </button>
            </div>
          </div>

          <div className="mode-helper" aria-live="polite">
            <span>模型功能</span>
            <strong>{currentMode.label}</strong>
            <p>{modeDescriptions[mode]}</p>
          </div>

          <div className={`logic-panel ${isLogicOpen ? "open" : ""}`}>
            <button
              aria-expanded={isLogicOpen}
              onClick={() => setIsLogicOpen((value) => !value)}
              type="button"
            >
              <span>預測邏輯</span>
              <strong>{isLogicOpen ? "收合" : "展開"}</strong>
            </button>
            {isLogicOpen ? (
              <div className="logic-grid">
                <article>
                  <strong>資料</strong>
                  <p>先讀取歷史開獎，統計每個號碼近期出現次數與多久沒開。</p>
                </article>
                <article>
                  <strong>模型</strong>
                  <p>依照平衡、熱號、補冷、和值四種模型，給每個號碼不同權重。</p>
                </article>
                <article>
                  <strong>條件</strong>
                  <p>會套用你右側鎖定與排除的號碼，再檢查奇偶、大小、和值與尾數分散。</p>
                </article>
                <article>
                  <strong>產生</strong>
                  <p>按下產生後，依權重抽出 6 組 5 碼參考，每次會有些微變化。</p>
                </article>
              </div>
            ) : null}
          </div>

          <div className="result-heading" ref={predictionRef}>
            <div>
              <span>產生結果</span>
              <h3>本期號碼參考</h3>
            </div>
            <div className="result-actions">
              <strong>
                {generated.length
                  ? `已產生 ${generated.length} 組 / 第 ${targetPeriod} 期`
                  : "預覽 4 種模型"}
              </strong>
              <button
                className="secondary-button save-prediction-button"
                disabled={!generated.length || savingPrediction}
                onClick={savePrediction}
                type="button"
              >
                {savingPrediction ? "保存中" : "保存到會員"}
              </button>
            </div>
          </div>
          {predictionMessage ? (
            <div className="member-message compact-message">{predictionMessage}</div>
          ) : null}

          <div className="prediction-grid" aria-label="本期號碼參考結果">
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

            <section className="data-panel backtest-panel" id="backtest-results" ref={backtestRef}>
              <div className="section-title">
                <h2>回測試算</h2>
                <span>{backtestLabel}</span>
              </div>
              {calculationMessage ? (
                <div className="calculation-message">{calculationMessage}</div>
              ) : null}
              <p className="backtest-intro">
                這裡只做玩法模擬。官方 5 號用命中碼數回測；二星、三星、四星會把你選的號碼自動連碰拆組，再套回近 {history.length.toLocaleString()} 期。
              </p>
              <div className="backtest-help">
                <strong>不用只選 5 個號碼</strong>
                <span>
                  例如二星選 6 個號碼，系統會自動拆成 {buildCombinations([1, 2, 3, 4, 5, 6], 2).length} 注二星組合；只要其中一注 2 碼都出現在當期開獎號，就列為命中。
                </span>
                <a href="#number-lab">去選號碼</a>
              </div>
              <div className="backtest-settings">
                <label className="inline-amount-control">
                  每注金額
                  <input
                    min={0}
                    step={10}
                    type="number"
                    value={betAmount}
                    onChange={(event) =>
                      setBetAmount(Math.max(0, Number(event.target.value) || 0))
                    }
                  />
                </label>
                {playType !== "official5" ? (
                  <label className="inline-amount-control">
                    每注模擬派彩
                    <input
                      min={0}
                      step={100}
                      type="number"
                      value={playPayout}
                      onChange={(event) =>
                        setPlayPayout(Math.max(0, Number(event.target.value) || 0))
                      }
                    />
                  </label>
                ) : null}
              </div>
              <div className="backtest-current">
                <span>
                  目前回測號碼 {playType !== "official5" ? `／自動拆 ${ticketCount} 注` : ""}
                </span>
                <div className="balls-row compact">
                  {backtestBase.length ? (
                    backtestBase.map((number) => (
                      <span className="ball muted" key={number}>
                        {pad(number)}
                      </span>
                    ))
                  ) : (
                    <span className="play-warning">請至少選 {playRule.size} 個號碼</span>
                  )}
                </div>
              </div>
              <p className="backtest-formula">
                試算方式：{history.length.toLocaleString()} 期 × {ticketCount.toLocaleString()} 注 × 每注 {betAmount.toLocaleString()} 元 = 假設投入 {cost.toLocaleString()} 元
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
                  <span>命中期數</span>
                  <strong>{backtestWinCount} 期</strong>
                </div>
                <div>
                  <span>命中注數</span>
                  <strong>{backtestWinningTickets.toLocaleString()} 注</strong>
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
                <span>最近 16 期回測</span>
                <strong>{playType === "official5" ? "數字是命中碼數" : "數字是命中注數"}</strong>
              </div>
              <div className="hit-strip">
                {backtest.slice(0, 16).map((item, index) => (
                  <span className={item.winTickets > 0 ? "hit" : ""} key={`${item.hit}-${index}`}>
                    {playType === "official5" ? item.hit : item.winTickets}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </div>

        <aside id="number-lab" className="control-panel">
          <div className="section-title">
            <h2>回測號碼選擇</h2>
            <span>
              {locked.length}/{maxSelectable} 已選
            </span>
          </div>
          <p className="number-lab-hint">
            先選玩法，再點號碼。二星、三星、四星不用選滿 5 個，選多個號碼時會自動連碰拆注回測。
          </p>

          <div className="play-type-panel">
            <span>玩法</span>
            <div className="segmented play-type">
              {playRules.map((item) => (
                <button
                  className={playType === item.id ? "active" : ""}
                  key={item.id}
                  onClick={() => setPlayType(item.id)}
                  title={item.detail}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p>{playRule.detail}</p>
          </div>

          <div className="segmented full">
            <button
              className={editMode === "lock" ? "active" : ""}
              onClick={() => setEditMode("lock")}
              type="button"
            >
              選號
            </button>
            <button
              className={editMode === "exclude" ? "active" : ""}
              onClick={() => setEditMode("exclude")}
              type="button"
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
                  type="button"
                >
                  {pad(number)}
                </button>
              );
            })}
          </div>

          <div className="mini-summary">
            <div>
              <span>已選號碼</span>
              <strong>{locked.length ? locked.map(pad).join(" ") : "無"}</strong>
            </div>
            <div>
              <span>自動拆注</span>
              <strong>
                {playType === "official5"
                  ? "1 注"
                  : backtestReady
                    ? `${ticketCount.toLocaleString()} 注`
                    : `至少 ${playRule.size} 個號碼`}
              </strong>
            </div>
            <div>
              <span>已排除</span>
              <strong>{excluded.length ? excluded.map(pad).join(" ") : "無"}</strong>
            </div>
          </div>

          <button
            className="primary-button wide backtest-action-button"
            onClick={runBacktestCalculation}
            type="button"
          >
            開始試算
          </button>

          <div className="backtest-mini-result" aria-live="polite">
            <div>
              <span>目前玩法</span>
              <strong>{playRule.label}</strong>
            </div>
            <div>
              <span>投入 / 派彩</span>
              <strong>
                {cost.toLocaleString()} / {prizes.toLocaleString()} 元
              </strong>
            </div>
            <div>
              <span>試算損益</span>
              <strong className={profit >= 0 ? "profit-positive" : "profit-negative"}>
                {profit >= 0 ? "+" : ""}
                {profit.toLocaleString()} 元
              </strong>
            </div>
          </div>

          <div className="rules-box">
            <strong>操作規則</strong>
            <ol>
              <li>官方 5 號最多選 5 個號碼。</li>
              <li>二星、三星、四星可選多個號碼，系統自動連碰。</li>
              <li>綠色代表已選，斜線代表排除。</li>
            </ol>
          </div>

          <p className="risk-note">
            本站只做資料分析、玩法說明與回測模擬，不提供收注、代簽、付款或任何實際投注服務。
          </p>
        </aside>
      </section>
    </main>
  );
}
