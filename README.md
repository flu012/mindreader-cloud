<div align="center">

# MindReader V2

**Give your AI a memory it can see, manage, and maintain.**

[English](README.md) | [中文](README.zh.md)

<!-- Replace with actual screenshot -->
![MindReader Graph View](docs/images/graph-view.png)

</div>

---

## The Problem with AI Memory Today

AI assistants forget everything between conversations. The emerging solutions — vector stores, RAG pipelines, memory plugins — all share the same fundamental problems:

| Pain Point | What Happens |
|---|---|
| **No visibility** | Your memories are buried in a vector database. You can't see what's stored, how things connect, or what's wrong. |
| **No control** | You can't edit, merge, categorize, or delete individual memories. It's a black box. |
| **No self-maintenance** | Memories pile up with duplicates, contradictions, and outdated facts. Nobody cleans them up. |
| **No self-evolution** | The system only knows what you explicitly tell it. It never learns on its own. |

MindReader V2 solves all of this.

## What is MindReader V2?

MindReader is a **personal knowledge graph** that captures, organizes, and recalls information from your AI conversations. Unlike flat memory stores, it builds a structured graph of entities and relationships — and gives you a full visual interface to see and manage everything.

### Key Principles

- **See everything** — Interactive graph visualization shows your entire memory landscape
- **Control everything** — Edit entities, manage tags, merge duplicates, create relationships manually
- **Self-maintaining** — LLM-powered auto-categorization, auto-tagging, relationship cleanup, and deduplication
- **Self-evolving** — *(Coming soon)* Auto-expand knowledge by self-directed research

---

## Features

### Visual Knowledge Graph

Explore your memories as an interactive force-directed graph. Nodes represent entities (people, projects, tools, locations), edges represent relationships and facts.

- Zoom, pan, click to explore
- Nodes sized by connection count — important entities are larger
- Color-coded by category (person, project, company, etc.)
- Hover for quick preview with tags and summary
- Filter by category to focus on what matters

<!-- Replace with actual screenshot -->
![Graph Visualization](docs/images/graph-hover.png)

### Entity Management

Click any entity to open the detail panel. Full control over your memories:

- **Tags** — Add descriptive tags (auto-extracted by LLM, manually editable)
- **Categories** — 12 built-in categories, fully customizable
- **Summary** — Click-to-edit summaries
- **AI Explanation** — Generate a 200-word analysis of any entity and its connections
- **Relationships** — Browse incoming/outgoing connections, navigate between entities
- **Merge** — Combine duplicate entities, preserving all relationships
- **Link** — Manually create relationships between entities
- **Delete** — Remove with impact preview (shows affected relationships)

<!-- Replace with actual screenshot -->
![Detail Panel](docs/images/detail-panel.png)

### Smart Search

Search across entity names, summaries, and tags from a single search bar (Ctrl+K).

- **Tag-aware search** — Search "swimmer" finds entities tagged "swimmer" even if the word isn't in the name
- **Context-aware** — On the graph tab, search highlights and zooms to matching nodes
- **Relevance ranking** — Exact name match > prefix match > contains match > tag match

### Multiple Views

| View | Purpose |
|---|---|
| **List** | Browse and search entities with pagination, filter by category |
| **Timeline** | See memories organized chronologically (Today, Yesterday, This Week, Earlier) |
| **Graph** | Interactive visual exploration of entities and relationships |
| **Categories** | Browse and manage entity categories |
| **Activity** | Audit log of captured and recalled memories |
| **Tokens** | Track LLM API usage and costs |
| **Maintenance** | Cleanup tools, relationship repair, batch re-categorization |

### Auto-Maintenance

MindReader doesn't just store memories — it keeps them clean.

| Feature | How It Works |
|---|---|
| **Auto-Categorization** | LLM classifies new entities every 60 seconds |
| **Auto-Tagging** | Extracts descriptive tags (roles, skills, locations, relationships) in the same LLM call |
| **Duplicate Detection** | Scans for entities with similar names and properties |
| **Relationship Repair** | Detects reversed, misspelled, and vague relationships (rule-based + LLM) |
| **Orphan Cleanup** | Finds and removes disconnected entities |
| **Expired Edge Cleanup** | Removes relationships that have been invalidated |

<!-- Replace with actual screenshot -->
![Maintenance Hub](docs/images/maintenance.png)

### CLI Tool

Full command-line interface for power users and automation:

```bash
mg search "swimming competitions"     # Semantic search with entity profiles
mg search "Aria" --json               # Machine-readable JSON output
mg tags "Aria Lu"                     # View tags: Aria Lu [person]: swimmer, daughter
mg tags "Aria Lu" --add "competitive" # Add a tag
mg tags --backfill                    # LLM-extract tags for all entities
mg add "Alice is a data scientist"    # Store a new memory
mg entities --limit 20                # List entities
mg maint scan                        # Scan for issues
mg maint fix                         # Auto-fix duplicates and orphans
```

### AI Agent Integration

MindReader integrates with AI agent frameworks (OpenClaw) to provide automatic memory:

- **Auto-recall** — Relevant memories injected into agent prompts before execution
- **Auto-capture** — Facts extracted from agent conversations and stored automatically
- **Tools** — Agents can search, store, and list memories via tool calls

### Self-Evolution *(Coming Soon)*

The next frontier: MindReader will proactively expand its knowledge by:

- Identifying knowledge gaps in the graph
- Researching to fill those gaps autonomously
- Building richer, more connected memory over time

---

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

## Requirements

- Node.js 18+
- Python 3.11+
- Neo4j 5.x (Docker setup included, or bring your own)
- An LLM API key (OpenAI, Anthropic via proxy, or DashScope)

## Architecture

MindReader is organized as an npm workspaces monorepo:

```
mindreaderv2/
  packages/
    mindgraph/         # Python core - Graphiti memory engine, CLI, background worker
    mindreader-ui/     # Express server + React UI - visualization & management
    openclaw-plugin/   # Optional AI agent integration - auto-recall/capture
```

### How It Works

```
Conversations ──> Capture ──> Neo4j Knowledge Graph ──> Recall ──> AI Context
                    │                    │                           │
                    ▼                    ▼                           ▼
              Entity extraction    Auto-categorize           Semantic search
              Fact extraction      Auto-tag                  Entity profiles
              Dedup detection      Relationship repair       Structured JSON
```

1. **Capture** — Conversations are processed into entities and relationships, stored in Neo4j
2. **Organize** — LLM auto-categorizes, auto-tags, and maintains the graph continuously
3. **Recall** — Semantic search retrieves relevant memories with full entity context

## LLM Providers

| Provider | Status | Default Model |
|---|---|---|
| OpenAI | Supported | `gpt-4o-mini` |
| DashScope (Alibaba) | Supported | `qwen3.5-flash` |
| Anthropic | Supported (via proxy) | Requires OpenAI-compatible proxy (e.g. LiteLLM) |

## Configuration

Configuration is stored in `.env` at the monorepo root. The setup wizard generates this automatically, or configure manually:

```bash
cp .env.example .env
```

Key variables: `LLM_PROVIDER`, `LLM_API_KEY`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`.

## Development

```bash
# Dev mode (server + UI with hot reload)
npm run dev

# Build the UI for production
npm run build

# CLI tool
mg --help   # or: python3 packages/mindgraph/python/mg_cli.py --help
```

## License

MIT
