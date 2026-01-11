import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseServer } from "@/lib/supabaseServer";
import { randomUUID } from "crypto";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const embeddingCache = new Map<string, number[]>();

function sanitizeQuery(q: string): string {
  return q.replace(/[^\x20-\x7E]/g, ""); // remove weird Unicode
}

function keywordScore(text: string, query: string): number {
  const queryTokens = query.toLowerCase().split(/\s+/);
  const textTokens = text.toLowerCase().split(/\s+/);
  const overlap = queryTokens.filter(t => textTokens.includes(t)).length;
  return overlap / queryTokens.length; // 0.0–1.0
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { project_id, query, k } = body;

    if (!project_id || !query) {
      return NextResponse.json(
        { ok: false, error: "Missing project_id or query" },
        { status: 400 }
      );
    }

    const cleanQuery = sanitizeQuery(String(query).trim());

    if (!cleanQuery || cleanQuery.length === 0 || cleanQuery === "undefined") {
      return NextResponse.json(
        { ok: false, error: "Query must be a non-empty string" },
        { status: 400 }
      );
    }

    // In-memory cache for embeddings (flushes on restart)
    let queryEmbedding: number[];
    if (embeddingCache.has(cleanQuery)) {
      queryEmbedding = embeddingCache.get(cleanQuery)!;
    } else {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: cleanQuery,
      });
      queryEmbedding = embeddingResponse.data[0].embedding;
      embeddingCache.set(cleanQuery, queryEmbedding);
    }

    const sb = supabaseServer();

    // Fetch nearest chunks
    const { data: rawChunks, error } = await sb.rpc("match_chunks", {
      p_project_id: project_id,
      p_query_embedding: queryEmbedding,
      p_match_count: k ?? 20, // fetch more and re-rank
    });

    if (error) {
      console.error("❌ Supabase RPC error:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Re-rank with hybrid score: embedding distance and keyword match
    const enriched = rawChunks.map(chunk => {
      const kwScore = keywordScore(chunk.content, cleanQuery);
      return {
        ...chunk,
        keyword_score: kwScore,
        hybrid_score: chunk.distance - kwScore, // lower is better
      };
    });

    const sorted = enriched.sort((a, b) => a.hybrid_score - b.hybrid_score).slice(0, k ?? 8);

    // Log query anonymously
    await sb.from("query_logs").insert({
      id: randomUUID(),
      project_id,
      query: cleanQuery,
    });

    return NextResponse.json({ ok: true, results: sorted });
  } catch (err: any) {
    console.error("🔥 Fatal error in /api/search route:", err.message || err);
    return NextResponse.json({ ok: false, error: err.message || "Unknown error" }, { status: 500 });
  }
}

