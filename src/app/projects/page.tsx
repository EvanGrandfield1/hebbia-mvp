"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Project = { id: string; name: string; created_at: string };

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");

  async function load() {
    const { data, error } = await supabaseBrowser
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setProjects(data);
  }

  async function createProject() {
    if (!name.trim()) return;
    await supabaseBrowser.from("projects").insert({ name });
    setName("");
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Projects</h1>

      <div style={{ display: "flex", gap: 12, margin: "12px 0 24px" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name"
          style={{ flex: 1, padding: 10 }}
        />
        <button onClick={createProject} style={{ padding: "10px 14px" }}>
          Create
        </button>
      </div>

      <ul style={{ display: "grid", gap: 10, listStyle: "none", padding: 0 }}>
        {projects.map((p) => (
          <li key={p.id} style={{ border: "1px solid #ddd", padding: 14 }}>
            <Link href={`/projects/${p.id}`}>{p.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

