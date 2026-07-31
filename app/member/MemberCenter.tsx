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

const statusLabels: Record<string, string> = {
  planned: "預計下注",
  placed: "已下注",
  settled: "已結算",
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

export function MemberCenter() {
  const [member, setMember] = useState<Member | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
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

  const totalStake = useMemo(
    () => orders.reduce((total, order) => total + order.stake, 0),
    [orders],
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

  async function loadMember() {
    const response = await fetch("/api/auth/me");
    const payload = (await response.json()) as { member: Member | null };
    setMember(payload.member);
    if (payload.member) void loadOrders();
  }

  useEffect(() => {
    void loadMember();
  }, []);

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
      if (!response.ok) throw new Error(payload.error ?? "操作失敗");
      setMember(payload.member ?? null);
      setPassword("");
      setMessage(mode === "register" ? "註冊成功，已登入。" : "登入成功。");
      await loadOrders();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMember(null);
    setOrders([]);
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
      if (!response.ok) throw new Error(payload.error ?? "儲存失敗");
      setNumbers("");
      setNote("");
      setMessage("下注紀錄已儲存。");
      await loadOrders();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f2ea] text-[#22201c]">
      <section className="member-shell">
        <div className="member-heading">
          <div>
            <a className="back-link" href="/">
              返回分析頁
            </a>
            <h1>會員中心</h1>
            <p>註冊後可以保存每期下注號碼、金額、期別與備註，之後回來查自己的紀錄。</p>
          </div>
          {member ? (
            <button className="secondary-button" onClick={logout}>
              登出
            </button>
          ) : null}
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
                暱稱
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
          <section className="member-grid-layout">
            <div className="member-card">
              <div className="section-title">
                <h2>新增下注紀錄</h2>
                <span>{member.displayName}</span>
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
                    <option value="placed">已下注</option>
                    <option value="settled">已結算</option>
                  </select>
                </label>
                <label className="wide-field">
                  備註
                  <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：平衡模型第 1 組" />
                </label>
              </div>
              <button className="primary-button wide" disabled={busy} onClick={saveOrder}>
                儲存下注紀錄
              </button>
            </div>

            <div className="member-card">
              <div className="section-title">
                <h2>我的紀錄</h2>
                <span>{orders.length} 筆 / {totalStake.toLocaleString()} 元</span>
              </div>
              <div className="order-list">
                {orders.length ? (
                  orders.map((order) => (
                    <article className="order-row" key={order.id}>
                      <div>
                        <strong>第 {order.period} 期</strong>
                        <span>{order.drawDate || order.createdAt.slice(0, 10)} · {statusLabels[order.status] ?? order.status}</span>
                      </div>
                      <div className="balls-row compact">
                        {order.numbers.map((number) => (
                          <span className="ball small" key={number}>{pad(number)}</span>
                        ))}
                      </div>
                      <p>{order.stake.toLocaleString()} 元{order.note ? ` · ${order.note}` : ""}</p>
                    </article>
                  ))
                ) : (
                  <p className="member-hint">還沒有下注紀錄。先新增一筆，之後就會出現在這裡。</p>
                )}
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
