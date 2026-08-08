export function buildAuthPayload(mode: "login" | "register", username: string, password: string, displayName: string) {
  const base = { username: username.trim().toLowerCase(), password };
  return mode === "register" ? { ...base, displayName: displayName.trim() } : base;
}
