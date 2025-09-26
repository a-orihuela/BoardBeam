// apps/web/src/api/admin.ts
const API_BASE = (import.meta.env.VITE_API_BASE || "").trim(); // e.g. http://localhost:8080

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForServer(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${API_BASE}/healthz`, { cache: "no-store" });
      if (r.ok) return;
    } catch { /* keep polling */ }
    await sleep(1500);
  }
  throw new Error("Server did not come back in time");
}

export async function triggerUpdate(): Promise<any> {
  try {
    const resp = await fetch(`${API_BASE}/admin/update`, { method: "POST" });
    if (resp.status === 202) {
      await waitForServer();
      return { ok: true, message: "Update triggered and server is back." };
    }
    const text = await resp.text();
    try { return JSON.parse(text); } catch { return { raw: text }; }
  } catch {
    await waitForServer();
    return { ok: true, message: "Update triggered; server restarted." };
  }
}
