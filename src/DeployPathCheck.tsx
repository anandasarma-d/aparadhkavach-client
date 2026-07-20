import { useState } from "react";

/**
 * Throwaway page proving CORS, auth headers, and env config work end-to-end against the
 * deployed API Gateway on Catalyst Slate. Gets replaced by real feature pages next - no UI
 * polish intended. Bearer token stays in component state only, never localStorage/
 * sessionStorage (AGENTS.md ~3), even for this throwaway test.
 */
export function DeployPathCheck() {
  const baseUrl = import.meta.env.VITE_API_GATEWAY_URL;
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function callHealth() {
    setStatus(null);
    setBody(null);
    setError(null);

    if (!baseUrl) {
      setError(
        "VITE_API_GATEWAY_URL is not set - see .env.example. Refusing to fall back to localhost.",
      );
      return;
    }

    try {
      const res = await fetch(`${baseUrl}/health`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const text = await res.text();
      setStatus(`${res.status} ${res.statusText}`);
      setBody(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="p-6 font-mono text-sm">
      <h1 className="mb-4 text-lg font-bold">Deploy Path Check</h1>
      <p className="mb-2">
        Target: <code>{baseUrl ? `${baseUrl}/health` : "(VITE_API_GATEWAY_URL unset)"}</code>
      </p>

      <label className="mb-2 block">
        Bearer token (optional, kept in memory only):
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="ml-2 border px-2 py-1"
        />
      </label>

      <button onClick={callHealth} className="mt-2 border px-3 py-1">
        Call API Gateway /health
      </button>

      {status && <p className="mt-4">Status: {status}</p>}
      {error && <p className="mt-4 text-red-600">Error: {error}</p>}
      {body && <pre className="mt-2 whitespace-pre-wrap border p-2">{body}</pre>}
    </div>
  );
}
