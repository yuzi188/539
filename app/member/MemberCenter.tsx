"use client";

import { useEffect, useMemo, useState } from "react";

type Member = {
  id: number;
  email: string;
  displayName: string;
};

type Order = {
  id: number;
  period: string;
  drawDate: string;
  numbers: number[];
  stake: number;
  status: string;
  note: string;
  createdAt: string;
};

type PredictionResult = {
  numbers: number[];
  hitCount: number | null;
  prize: number | null;
};

type Prediction = {
  id: number;
  period: string;
  drawDate: string;
  model: string;
  sets: number[][];
  locked: number[];
  excluded: number[];
  note: string;
  createdAt: string;
  drawNumbers: number[] | null;
  results: PredictionResult[];
  bestHit: number | null;
  totalPrize: number | null;
  status: "waiting" | "settled";
};

const statusLabels: Record<string, string> = {
  planned: "預計下注",
  placed: "已下單",
  settled: "已結算",
};

const modelLabels: Record<string, string> = {
  balanced: "平衡",
  hot: "熱號",
  cold: "補冷",
  value: "和值",
};

const pad = (value: number) => value.toString().padStart(2, "0");

function parseNumberText(value: string) {
  return value
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite)
    .slice(0, 5)
    .sort((a, b) => a - b);
}

function numberLine(numbers: number[]) {
  return numbers.map(pad).join(" ");
}

export function MemberCenter() {
  const [member, setMember] = useState<Member | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [period, setPeriod] = useState("");
  const [drawDate, setDrawDate] = useState("");
  const [numbers, setNumbers] = useState("");
  const [stake, setStake] = useState(50);
  const [status, setStatus] = useState("placed");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const totalStake = useMemo(
    () => orders.reduce((total, order) => total + order.stake, 0),
    [orders],
  );
  const settledPredictions = useMemo(
    () => predictions.filter((prediction) => prediction.status === "settled").length,
    [predictions],
  );
  const bestHit = useMemo(
    () =>
      predictions.reduce(
        (best, prediction) => Math.max(best, prediction.bestHit ?? 0),
        0,
      ),
    [predictions],
  );

  async function loadOrders() {
    const response = await fetch("/api/member/orders");
    if (!response.ok) {
      setOrders([]);
      return;
    }
    const payload = (await response.json()) as { member: Member; orders: Order[] };
    setMember(payload.member);
    setOrders(payload.orders);
  }

  async function loadPredictions() {
    const response = await fetch("/api/member/predictions");
    if (!response.ok) {
      setPredictions([]);
      return;
    }
    const payload = (await response.json()) as {
      member: Member;
      predictions: Prediction[];
    };
    setMember(payload.member);
    setPredictions(payload.predictions);
  }

  async function refreshMemberData() {
    await Promise.all([loadOrders(), loadPredictions()]);
  }

  async function loadMember() {
    const response = await fetch("/api/auth/me");
    const payload = (await response.json()) as { member: Member | null };
    setMember(payload.member);
    if (payload.member) void refreshMemberData();
  }

  useEffect(() => {
    void loadMember();
  }, []);

  useEffect(() => {
    setIsDarkMode(window.localStorage.getItem("lotto539-theme") === "dark");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("lotto539-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  async function submitAuth() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      const payload = (await response.json()) as { member?: Member; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "操作失敗。");
      setMember(payload.member ?? null);
      setPassword("");
      setMessage(mode === "register" ? "註冊完成，已登入會員。" : "登入成功。");
      await refreshMemberData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMember(null);
    setOrders([]);
    setPredictions([]);
    setMessage("已登出。");
  }

  async function saveOrder() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/member/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period,
          drawDate,
          numbers: parseNumberText(numbers),
          stake,
          status,
          note,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "保存失敗。");
      setNumbers("");
      setNote("");
      setMessage("下單紀錄已保存。");
      await loadOrders();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失敗。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`min-h-screen bg-[#f6f2ea] text-[#22201c] ${isDarkMode ? "dark-mode" : ""}`}>
      <section className="member-shell">
        <div className="member-heading">
          <div>
            <a className="back-link" href="/">
              回到分析台
            </a>
            <h1>會員中心</h1>
            <p>保存每期預測、下注紀錄與開獎後命中狀況。預測紀錄不綁 GPT，只綁網站會員帳號。</p>
          </div>
          <div className="member-heading-actions">
            <button
              aria-pressed={isDarkMode}
              className="secondary-button theme-toggle"
              onClick={() => setIsDarkMode((value) => !value)}
              type="button"
            >
              {isDarkMode ? "淺色模式" : "深色模式"}
            </button>
            {member ? (
              <button className="secondary-button" onClick={logout}>
                登出
              </button>
            ) : null}
          </div>
        </div>

        {message ? <div className="member-message">{message}</div> : null}

        {!member ? (
          <section className="member-card auth-card">
            <div className="segmented full">
              <button
                className={mode === "register" ? "active" : ""}
                onClick={() => setMode("register")}
              >
                註冊
              </button>
              <button
                className={mode === "login" ? "active" : ""}
                onClick={() => setMode("login")}
              >
                登入
              </button>
            </div>
            {mode === "register" ? (
              <label>
                顯示名稱
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
            ) : null}
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </label>
            <label>
              密碼
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                minLength={8}
              />
            </label>
            <button className="primary-button wide" disabled={busy} onClick={submitAuth}>
              {mode === "register" ? "建立會員" : "登入會員"}
            </button>
            <p className="member-hint">密碼至少 8 個字；系統只保存加密後的密碼雜湊。</p>
          </section>
        ) : (
          <>
            <section className="member-summary-grid">
              <div>
                <span>會員</span>
                <strong>{member.displayName}</strong>
              </div>
              <div>
                <span>保存預測</span>
                <strong>{predictions.length} 筆</strong>
              </div>
              <div>
                <span>已開獎比對</span>
                <strong>{settledPredictions} 筆</strong>
              </div>
              <div>
                <span>最高命中</span>
                <strong>{bestHit} 碼</strong>
              </div>
            </section>

            <section className="member-grid-layout">
              <div className="member-card">
                <div className="section-title">
                  <h2>新增下單紀錄</h2>
                  <span>{member.email}</span>
                </div>
                <div className="form-grid">
                  <label>
                    期別
                    <input value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="115000185" />
                  </label>
                  <label>
                    開獎日期
                    <input value={drawDate} onChange={(event) => setDrawDate(event.target.value)} placeholder="2026/07/31" />
                  </label>
                  <label className="wide-field">
                    號碼
                    <input value={numbers} onChange={(event) => setNumbers(event.target.value)} placeholder="01 08 16 24 39" />
                  </label>
                  <label>
                    金額
                    <input value={stake} onChange={(event) => setStake(Number(event.target.value))} type="number" min={0} step={50} />
                  </label>
                  <label>
                    狀態
                    <select value={status} onChange={(event) => setStatus(event.target.value)}>
                      <option value="planned">預計下注</option>
                      <option value="placed">已下單</option>
                      <option value="settled">已結算</option>
                    </select>
                  </label>
                  <label className="wide-field">
                    備註
                    <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：參考第 1 組" />
                  </label>
                </div>
                <button className="primary-button wide" disabled={busy} onClick={saveOrder}>
                  保存下單紀錄
                </button>
              </div>

              <div className="member-card">
                <div className="section-title">
                  <h2>我的預測</h2>
                  <span>{predictions.length} 筆</span>
                </div>
                <div className="prediction-list">
                  {predictions.length ? (
                    predictions.map((prediction) => (
                      <article className="prediction-record" key={prediction.id}>
                        <div className="prediction-record-head">
                          <div>
                            <strong>第 {prediction.period} 期</strong>
                            <span>{prediction.drawDate || prediction.createdAt.slice(0, 10)} / {modelLabels[prediction.model] ?? prediction.model}</span>
                          </div>
                          <b className={prediction.status === "settled" ? "settled" : ""}>
                            {prediction.status === "settled"
                              ? `最高 ${prediction.bestHit ?? 0} 碼`
                              : "等待開獎"}
                          </b>
                        </div>
                        {prediction.drawNumbers ? (
                          <p className="member-hint">開獎：{numberLine(prediction.drawNumbers)}</p>
                        ) : null}
                        <div className="prediction-set-list">
                          {prediction.results.map((result, index) => (
                            <div key={`${prediction.id}-${index}`}>
                              <span>第 {index + 1} 組</span>
                              <strong>{numberLine(result.numbers)}</strong>
                              <em>
                                {result.hitCount == null
                                  ? "待比對"
                                  : `中 ${result.hitCount} 碼`}
                              </em>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="member-hint">還沒有保存預測。回到首頁產生本期預測後，按「保存到會員」。</p>
                  )}
                </div>
              </div>
            </section>

            <section className="member-card">
              <div className="section-title">
                <h2>下單紀錄</h2>
                <span>{orders.length} 筆 / {totalStake.toLocaleString()} 元</span>
              </div>
              <div className="order-list">
                {orders.length ? (
                  orders.map((order) => (
                    <article className="order-row" key={order.id}>
                      <div>
                        <strong>第 {order.period} 期</strong>
                        <span>{order.drawDate || order.createdAt.slice(0, 10)} / {statusLabels[order.status] ?? order.status}</span>
                      </div>
                      <div className="balls-row compact">
                        {order.numbers.map((number) => (
                          <span className="ball small" key={number}>{pad(number)}</span>
                        ))}
                      </div>
                      <p>{order.stake.toLocaleString()} 元{order.note ? ` / ${order.note}` : ""}</p>
                    </article>
                  ))
                ) : (
                  <p className="member-hint">還沒有下單紀錄。保存預測後，也可以把實際下注的組合另外記在這裡。</p>
                )}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
