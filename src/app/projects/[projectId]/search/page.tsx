"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

export default function ProjectSearch() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: projectId, query, k: 8 }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Search failed");

      setResults(json.results ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Search Project</h1>

      <div style={{ display: "flex", gap: 12, margin: "12px 0 24px" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. SOFR + CSA + margin"
          style={{ flex: 1, padding: 10 }}
        />
        <button onClick={run} disabled={!query.trim() || loading || !projectId}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 12, color: "crimson" }}>
          Error: {error}
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {results.map((r) => (
          <div key={r.chunk_id} style={{ border: "1px solid #ddd", padding: 14 }}>
            <div style={{ fontWeight: 700 }}>{r.document_title}</div>
            <div style={{ opacity: 0.8, marginTop: 4 }}>
              pages {r.page_start ?? "?"}–{r.page_end ?? "?"} • distance{" "}
              {r.distance?.toFixed?.(4)}
            </div>
            <pre style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
              {String(r.content).slice(0, 1200)}
            </pre>
          </div>
        ))}
      </div>
    </main>
  );
}

