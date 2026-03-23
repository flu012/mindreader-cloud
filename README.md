# MindReader

A personal knowledge graph that captures, organizes, and recalls information from your conversations. Built on Neo4j and Graphiti with multi-provider LLM support.

## Quick Start

```bash
# Clone the repo
git clone https://github.com/flu012/mindreaderv2.git
cd mindreaderv2

# Run the interactive setup wizard
./scripts/setup.sh

# Start the server
npm start
```

Open `http://localhost:18900` to access the web UI.

## Architecture

MindReader is organized as an npm workspaces monorepo with three packages:

| Package | Description |
|---|---|
| `packages/mindgraph` | Python core — Graphiti-based memory graph engine, CLI tool, background worker |
| `packages/mindreader-ui` | Standalone Express server + React UI — graph visualization, entity management, maintenance tools |
| `packages/openclaw-plugin` | Optional OpenClaw integration — auto-recall/capture hooks, memory search/store tools |

### How it works

1. **Capture** — conversations are processed into discrete facts and stored as entities + relationships in Neo4j
2. **Recall** — semantic search retrieves relevant memories based on natural language queries
3. **Organize** — automatic categorization, relationship cleanup, and entity deduplication keep the graph clean

## Requirements

- Node.js 18+
- Python 3.11+
- Neo4j 5.x (Docker setup included, or bring your own)
- An LLM API key (OpenAI, Anthropic via proxy, or DashScope)

## LLM Providers

| Provider | Status | Notes |
|---|---|---|
| OpenAI | Supported | Default: `gpt-4o-mini` |
| DashScope | Supported | Default: `qwen3.5-flash` |
| Anthropic | Supported (via proxy) | Requires OpenAI-compatible proxy (e.g. LiteLLM) |

## Configuration

Configuration is stored in `.env` at the monorepo root. The setup wizard generates this automatically, or copy `.env.example` and edit manually:

```bash
cp .env.example .env
```

Key variables: `LLM_PROVIDER`, `LLM_API_KEY`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`.

## Development

```bash
# Start in dev mode (server + UI with hot reload)
npm run dev

# Build the UI
npm run build

# CLI tool
python3 packages/mindgraph/python/mg_cli.py --help
```

## License

MIT
