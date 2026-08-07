import { useEffect, useMemo, useState, type FormEvent } from "react";
import IronCrownGame from "./components/IronCrownGame";

type Session = { token: string; player: { username: string; displayName: string } };
const STORAGE_KEY = "iron-crown-session-v1";

export default function App() {
  const apiUrl = useMemo(() => (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, ""), []);
  const [session, setSession] = useState<Session | null>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
  });
  const [checking, setChecking] = useState(Boolean(session));

  useEffect(() => {
    if (!session) { setChecking(false); return; }
    fetch(`${apiUrl}/api/auth/me`, { headers: { authorization: `Bearer ${session.token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error("expired");
        const data = await response.json();
        const next = { token: session.token, player: data.player };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setSession(next);
      })
      .catch(() => { localStorage.removeItem(STORAGE_KEY); setSession(null); })
      .finally(() => setChecking(false));
  }, [apiUrl]);

  const logout = () => { localStorage.removeItem(STORAGE_KEY); setSession(null); };
  if (checking) return <div className="account-shell"><div className="server-wake"><span>♛</span><b>IRON CROWN</b><p>서버에서 모험을 불러오는 중…</p></div></div>;
  if (!session) return <AccountScreen apiUrl={apiUrl} onSession={(next) => { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setSession(next); }} />;
  return <IronCrownGame playerName={session.player.displayName} apiUrl={apiUrl} token={session.token} onLogout={logout} />;
}

function AccountScreen({ apiUrl, onSession }: { apiUrl: string; onSession: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password, displayName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "서버에 연결하지 못했습니다.");
      onSession(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "서버에 연결하지 못했습니다."); }
    finally { setBusy(false); }
  };

  return <main className="account-shell"><section className="account-card">
    <div className="account-crown">♛</div><small>ONLINE ACTION FARMING RPG</small><h1>IRON <span>CROWN</span></h1>
    <div className="account-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>로그인</button><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>새 계정</button></div>
    <form onSubmit={submit}>
      <label>아이디<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" minLength={3} maxLength={20} required placeholder="영문/숫자 3~20자" /></label>
      {mode === "register" && <label>캐릭터 이름<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={16} required placeholder="게임에 표시될 이름" /></label>}
      <label>비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} maxLength={72} required placeholder="8자 이상" /></label>
      {error && <p className="account-error">{error}</p>}
      <button className="account-submit" disabled={busy}>{busy ? "서버 연결 중…" : mode === "login" ? "모험 계속하기" : "계정 만들고 시작"}</button>
    </form>
    <p className="account-note">진행 상황은 서버에 저장되어 다른 기기에서도 이어서 할 수 있습니다.</p>
  </section></main>;
}
