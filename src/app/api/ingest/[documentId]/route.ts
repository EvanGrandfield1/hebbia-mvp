export const runtime = "nodejs";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseServer } from "@/lib/supabaseServer";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Simple chunker: ~5000 chars with overlap
function chunkText(text: string, chunkSize = 5000, overlap = 500) {
  const clean = text.replace(/\u0000/g, "").trim();
  const chunks: { content: string }[] = [];
  let i = 0;

  while (i < clean.length) {
    const end = Math.min(i + chunkSize, clean.length);
    chunks.push({ content: clean.slice(i, end) });
    if (end === clean.length) break;
    i = Math.max(0, end - overlap);
  }

  return chunks;
}

async function pdfToTextPages(pdfBytes: Buffer): Promise<string[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hebbia-"));
  const pdfPath = path.join(tmpDir, "doc.pdf");
  const txtPath = path.join(tmpDir, "out.txt");

  try {
    await fs.writeFile(pdfPath, pdfBytes);

    // pdftotext writes a single text file; it usually separates pages with form-feed \f
    // -layout helps preserve tables/columns a bit.
    await execFileAsync("pdftotext", ["-layout", pdfPath, txtPath], {
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
    });

    const txt = await fs.readFile(txtPath, "utf-8");

    // Split into pages by form-feed; fallback to whole text if no form-feeds
    const rawPages = txt.split("\f").map((p) => p.trim()).filter(Boolean);
    return rawPages.length > 0 ? rawPages : [txt.trim()];
  } finally {
    // best-effort cleanup
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await ctx.params;
  const sb = supabaseServer();

  console.log("INGEST route hit", { documentId });

  // set processing
  {
    const { error } = await sb
      .from("documents")
      .update({ status: "processing", error: null })
      .eq("id", documentId);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  try {
    // load doc
    const { data: doc, error: docErr } = await sb
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (docErr || !doc) throw new Error(docErr?.message ?? "Doc not found");

    // download file from storage
    const { data: fileBlob, error: dlErr } = await sb.storage
      .from("docs")
      .download(doc.storage_path);
    if (dlErr || !fileBlob) throw new Error(dlErr?.message ?? "Download failed");

    const arrayBuffer = await fileBlob.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    // clear previous pages/chunks on re-ingest
    {
      const { error: pDelErr } = await sb.from("document_pages").delete().eq("document_id", documentId);
      if (pDelErr) throw new Error(`delete pages failed: ${pDelErr.message}`);
      const { error: cDelErr } = await sb.from("document_chunks").delete().eq("document_id", documentId);
      if (cDelErr) throw new Error(`delete chunks failed: ${cDelErr.message}`);
    }

    const isPdf =
      (doc.mime_type && doc.mime_type.includes("pdf")) ||
      (doc.title && doc.title.toLowerCase().endsWith(".pdf"));

    let pages: string[] = [];
    if (isPdf) {
      pages = await pdfToTextPages(buf);
    } else {
      pages = [buf.toString("utf-8")];
    }

    const joined = pages.join("\n\n");
    if (!joined.trim()) throw new Error("No text extracted (empty).");

    // insert pages
    {
      const pageRows = pages.map((text, i) => ({
        document_id: documentId,
        page_num: i + 1,
        text,
      }));
      const { error: pageInsErr } = await sb.from("document_pages").insert(pageRows);
      if (pageInsErr) throw new Error(`insert pages failed: ${pageInsErr.message}`);
    }

    // chunk
    const chunks = chunkText(joined);

    // embed + insert chunks (batched)
    const batchSize = 64;
    let chunkIndex = 0;

    for (let b = 0; b < chunks.length; b += batchSize) {
      const batch = chunks.slice(b, b + batchSize);

      const emb = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: batch.map((c) => c.content),
      });

      const rows = batch.map((c, j) => ({
        document_id: documentId,
        chunk_index: chunkIndex++,
        page_start: 1,
        page_end: Math.max(1, pages.length),
        heading: null,
        content: c.content,
        embedding: emb.data[j].embedding,
      }));

      const { error: insErr } = await sb.from("document_chunks").insert(rows);
      if (insErr) throw new Error(`insert chunks failed: ${insErr.message}`);
    }

    // set ready
    {
      const { error: readyErr } = await sb
        .from("documents")
        .update({ status: "ready" })
        .eq("id", documentId);
      if (readyErr) throw new Error(`set ready failed: ${readyErr.message}`);
    }

    return NextResponse.json({ ok: true, pages: pages.length, chunks: chunks.length });
  } catch (e: any) {
    console.error("INGEST failed", e);

    await sb
      .from("documents")
      .update({ status: "failed", error: e?.message ?? String(e) })
      .eq("id", documentId);

    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

