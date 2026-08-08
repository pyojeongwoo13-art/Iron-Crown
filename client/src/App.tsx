import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import IronCrownGame from "./components/IronCrownGame";
import { buildAuthPayload } from "./game/auth";

type Session = { token: string; player: { username: string; displayName: string } };
const STORAGE_KEY = "iron-crown-session-v1";

export default function App() {
  const apiUrl = useMemo(() => { const configured=String(import.meta.env.VITE_API_URL||"").trim();if(configured)return configured.replace(/\/$/,"");if(location.hostname.endsWith(".github.io"))return "https://iron-crown-server.onrender.com";return "http://localhost:3001" }, []);
  const [session, setSession] = useState<Session | null>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
  });
  const [checking, setChecking] = useState(Boolean(session));
  const [sessionMessage,setSessionMessage]=useState("");

  useEffect(() => {
    if (!session) { setChecking(false); return; }
    fetch(`${apiUrl}/api/auth/me`, { headers: { authorization: `Bearer ${session.token}` } })
      .then(async (response) => {
        if (!response.ok) { const data=await response.json().catch(()=>({}));throw new Error(data.error||"로그인이 만료되었습니다."); }
        const data = await response.json();
        const next = { token: session.token, player: data.player };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setSession(next);
      })
      .catch((error) => { localStorage.removeItem(STORAGE_KEY); setSession(null);setSessionMessage(error instanceof Error?error.message:""); })
      .finally(() => setChecking(false));
  }, [apiUrl]);

  const logout = useCallback((reason?:string) => { localStorage.removeItem(STORAGE_KEY); setSession(null);setSessionMessage(reason??""); },[]);
  if (checking) return <div className="account-shell"><div className="server-wake"><span>♛</span><b>IRON CROWN</b><p>서버에서 모험을 불러오는 중…</p></div></div>;
  if (!session) return <AccountScreen apiUrl={apiUrl} initialMessage={sessionMessage} onSession={(next) => { localStorage.setItem(STORAGE_KEY, JSON.stringify(next));setSessionMessage("");setSession(next); }} />;
  return <IronCrownGame playerName={session.player.displayName} apiUrl={apiUrl} token={session.token} onLogout={logout} />;
}

function AccountScreen({ apiUrl, initialMessage, onSession }: { apiUrl: string; initialMessage:string; onSession: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const [serverState,setServerState]=useState<"checking"|"online"|"offline">("checking");

  useEffect(()=>{let active=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),70_000);fetch(`${apiUrl}/health`,{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error("offline");if(active)setServerState("online")}).catch(()=>{if(active)setServerState("offline")}).finally(()=>clearTimeout(timer));return()=>{active=false;clearTimeout(timer);controller.abort()}},[apiUrl]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const body=buildAuthPayload(mode,username,password,displayName),response = await fetch(`${apiUrl}/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(()=>({error:"온라인 서버 응답을 읽지 못했습니다."}));
      if (!response.ok) throw new Error(data.error || "서버에 연결하지 못했습니다.");
      setServerState("online");
      onSession(data);
    } catch (reason) { const networkError=reason instanceof TypeError;setServerState(networkError?"offline":"online");setError(networkError?"온라인 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.":reason instanceof Error ? reason.message : "서버에 연결하지 못했습니다."); }
    finally { setBusy(false); }
  };

  return <main className="account-shell"><section className="account-card">
    <div className="account-hero"><div className="account-crown">♛</div><small>ONLINE ACTION FARMING RPG</small><h1>IRON <span>CROWN</span></h1><p>싸우고, 얻고, 강화해서 철왕에게 도전하세요.</p></div>
    <div className="account-auth"><div className="account-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>로그인</button><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>새 계정</button></div>
    <form onSubmit={submit}>
      <label>아이디<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={20} required placeholder="영문/숫자 3~20자" /></label>
      {mode === "register" && <label>캐릭터 이름<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={16} required placeholder="게임에 표시될 이름" /></label>}
      <label>비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} maxLength={72} required placeholder="8자 이상" /></label>
      {error && <p className="account-error">{error}</p>}
      <button className="account-submit" disabled={busy}>{busy ? "서버 연결 중…" : mode === "login" ? "모험 계속하기" : "계정 만들고 시작"}</button>
    </form>
    <p className={`server-state ${serverState}`}>{serverState==="checking"?"온라인 서버를 깨우는 중…":serverState==="online"?"온라인 서버 연결됨 · 다른 기기 로그인 가능":"온라인 서버 연결 확인 필요"}<small>{apiUrl.replace(/^https?:\/\//,"")}</small></p><p className="account-note">같은 아이디와 비밀번호로 휴대폰·태블릿·PC에서 이어서 할 수 있습니다.</p></div>
  </section></main>;
}
