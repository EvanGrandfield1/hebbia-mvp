'use client';

import { useState } from "react";
import { useParams } from "next/navigation";

type Chunk = {
  chunk_id: string;
  content: string;
  heading: string;
  distance: number;
  keyword_score: number;
  hybrid_score: number;
};

function highlight(text: string, query: string | null) {
  if (!query) return text;
  const words = query.split(/\s+/).filter(Boolean);
  const pattern = new RegExp(`(${words.join("|")})`, "gi");
  return text.split(pattern).map((part, i) =>
    pattern.test(part) ? (
      <mark key={i} className="bg-yellow-200 px-1 rounded-sm">{part}</mark>
    ) : (
      part
    )
  );
}

export default function SearchPage() {
  const { projectId } = useParams();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          query,
          k: 10,
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResults(data.results);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Semantic Search</h1>

      <div className="flex gap-2 mb-6">
        <input
          className="flex-1 border px-4 py-2 rounded"
          placeholder="Enter a query..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-3 mb-4 rounded">{error}</div>
      )}

      {results.map((chunk) => (
        <div
          key={chunk.chunk_id}
          className="border border-gray-300 p-4 rounded mb-4 shadow-sm"
        >
          <h3 className="font-semibold mb-1">{chunk.heading}</h3>
          <p className="text-xs text-gray-500 mb-2">
            Distance: {chunk.distance.toFixed(4)} • Match:{" "}
            {(chunk.keyword_score * 100).toFixed(1)}%
          </p>
          <div className="text-sm leading-relaxed">
            {highlight(chunk.content, query)}
          </div>
        </div>
      ))}
    </div>
  );
}

