"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function DocViewer({ params }: { params: { docId: string } }) {
  const docId = params.docId;
  const [doc, setDoc] = useState<any>(null);
  const [pages, setPages] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: d } = await supabaseBrowser
        .from("documents")
        .select("*")
        .eq("id", docId)
        .single();
      setDoc(d);

      const { data: p } = await supabaseBrowser
        .from("document_pages")
        .select("*")
        .eq("document_id", docId)
        .order("page_num", { ascending: true });

      setPages(p ?? []);
    })();
  }, []);

  if (!doc) return <main style={{ padding: 24 }}>Loading...</main>;

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>{doc.title}</h1>
      <div style={{ marginBottom: 12 }}>Status: {doc.status}</div>

      {pages.map((p) => (
        <section key={p.id} style={{ border: "1px solid #ddd", padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Page {p.page_num}</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>{p.text}</pre>
        </section>
      ))}
    </main>
  );
}

