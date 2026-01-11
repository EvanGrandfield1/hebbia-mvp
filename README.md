This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started


# 🔍 Semantic Search MVP

This project implements a hybrid semantic + keyword RAG search system using:
- OpenAI Embeddings
- Supabase (Postgres + pgvector)
- Next.js App Router
- Token-overlap highlighting
- Embedding cache + query history

## 🔧 Setup

1. Copy `.env.example` → `.env` and fill in your keys.
2. Run locally:

```bash
npm install
npm run dev
```

or via Docker 
```
docker build -t search-mvp .
docker run -p 3000:3000 --env-file .env search-mvp
```

First, run the development server:

Open [http://localhost:3000](http://localhost:3000/projects) with your browser to see the result.

