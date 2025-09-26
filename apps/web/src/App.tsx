import { useState } from "react";
import Lobby from "./components/Lobby";
import { triggerUpdate } from "./api/admin";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>("");

  const onUpdate = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await triggerUpdate();
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "2rem auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>BoardBeam — Admin</h1>
      <p>Press the button to check & apply updates.</p>
      <button onClick={onUpdate} disabled={loading} style={{ padding: "0.6rem 1rem" }}>
        {loading ? "Updating..." : "Update"}
      </button>

      {error && (
        <pre style={{ background: "#fee", padding: "1rem", marginTop: "1rem", whiteSpace: "pre-wrap" }}>
          {error}
        </pre>
      )}

      {result && (
        <pre style={{ background: "#eef", padding: "1rem", marginTop: "1rem", whiteSpace: "pre-wrap" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      <Lobby />
    </div>
  );
}
