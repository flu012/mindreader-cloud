# Memory Storage Quality Improvement — Design Spec

## Goal

Improve the quality of knowledge stored in MindReader's graph by adding a preprocessing layer that classifies information before storage, prevents junk entity creation, and extracts structured attributes from conversations.

## Problem

Graphiti's `add_episode` treats everything as entities + relationships. When given "Dell is a developer with 15 years experience", it creates separate entity nodes for "Developer" and "15 Years Experience" — these should be attributes (tags/summary) of the "Dell" entity, not independent nodes. The auto-capture path is worse: raw conversation text (including code, debug output, tool results) is truncated and fed directly to Graphiti, producing high volumes of low-quality entities.

## Architecture

### Two entry points, one preprocessing pipeline

```
POST /api/cli/store    → preprocessStore()  → classifyFacts()      → execute
POST /api/cli/capture  → preprocessCapture() → extract + classify  → execute
```

Both converge on the same output structure and execution logic.

### Server.js Refactor

Split the 3000-line `server.js` into focused modules:

```
server/
  server.js              — app setup, middleware, startServer() (~100 lines)
  routes/
    graph.js             — GET /api/graph
    entity.js            — /api/entity/:name (CRUD, summarize, evolve, delete)
    categories.js        — /api/categories (CRUD, merge, recategorize)
    cleanup.js           — /api/cleanup/*, /api/relationships/*
    audit.js             — /api/audit/*
    tokens.js            — /api/tokens
    search.js            — /api/search, /api/entities, /api/timeline, /api/projects, /api/stats, /api/query
    cli.js               — /api/cli/* (store, search, entities, recall, capture)
  lib/
    daemon.js            — mgDaemon spawning/communication
    categorizer.js       — autoCategorizeNewEntities + helpers
    llm.js               — shared LLM calling utility (Node.js fetch, OpenAI-compatible)
    preprocessor.js      — ★ NEW: storage preprocessing logic
  neo4j.js               — unchanged
  config.js              — unchanged
  start.js               — unchanged
```

Each route file exports a `(app, { driver, config, logger, mgDaemon }) => void` function. `server.js` becomes pure assembly. Daemon lifecycle management (spawning, restarting, health checks) stays in `server.js`/`lib/daemon.js`; only the `mgDaemon(cmd, args, timeout)` call function is passed to routes.

### lib/llm.js — Shared LLM Utility

A Node.js function for calling OpenAI-compatible APIs via `fetch`. Used by the new preprocessor. Existing Python inline LLM scripts (auto-categorizer, recategorize, relationship review) remain unchanged in this spec — `lib/llm.js` is additive, not a migration.

```js
// llm.js
export async function callLLM({ prompt, config, jsonMode, timeoutMs }) → parsed object or string
```

- `jsonMode: true` sends `response_format: { type: "json_object" }` and parses the response as JSON
- DashScope detection: if `config.llmBaseUrl` contains `"dashscope"`, adds `enable_thinking: false` to request body
- Timeout via `AbortController` (default 10s)
- Throws on HTTP error, parse error, or timeout — callers catch and degrade

### lib/preprocessor.js — Preprocessing Pipeline

#### Shared types

```ts
interface PreprocessResult {
  entityUpdates: EntityUpdate[];  // direct Neo4j writes
  forGraphiti: GraphitiItem[];    // texts to feed add_episode
}

interface EntityUpdate {
  name: string;          // existing entity name (must match graph exactly)
  addTags: string[];     // tags to append (deduplicated against existing)
  summaryAppend: string; // text to append to summary
}

interface GraphitiItem {
  content: string;       // text to feed add_episode
  source: string;        // preserved from original request ("agent", "auto-capture")
  project?: string;      // preserved from original request
}
```

#### Entity update Cypher semantics

```cypher
// addTags: merge with existing, deduplicate
MATCH (e:Entity) WHERE toLower(e.name) = toLower($name)
SET e.tags = apoc.coll.toSet(coalesce(e.tags, []) + $newTags)

// summaryAppend: append with separator, cap at 1000 chars
SET e.summary = left(coalesce(e.summary, '') +
  CASE WHEN e.summary IS NOT NULL AND e.summary <> '' THEN '. ' ELSE '' END
  + $append, 1000)
```

If APOC is not available, deduplication is done in JS before the Cypher call.

#### Known entity lookup

Extract significant words (3+ chars, not stopwords) from input text, then:

```cypher
MATCH (e:Entity)
WHERE ANY(word IN $words WHERE toLower(e.name) CONTAINS toLower(word))
RETURN e.name, e.summary, e.tags, e.category
ORDER BY size(e.name) ASC
LIMIT 10
```

Returns name + summary + tags so the LLM has enough context to classify attributes. 3s timeout; on failure returns empty array (classification proceeds without entity context).

#### LLM classification prompt

Input to the LLM (JSON mode):

```
You are a knowledge graph preprocessor. Given TEXT and a list of KNOWN ENTITIES
from the graph, classify each piece of information.

KNOWN ENTITIES:
- Dell [person]: AI consultant, Chipmunks owner. Tags: ai-consultant, chipmunks
- ChippyV2 [project]: Franchise management system. Tags: dotnet, react

TEXT: "Dell is a developer with 15 years experience"

For each fact in the text, output ONE of:
- "attribute": information that describes an existing entity (role, skill, trait,
  preference, status). Provide entity_name + add_tags + summary_append.
- "relationship": a connection between two entities that should be stored as a
  graph edge. Provide the original text.

Return JSON:
{
  "facts": [
    { "type": "attribute", "entity_name": "Dell",
      "add_tags": ["software-developer", "15-years-experience"],
      "summary_append": "Software developer with 15 years of experience." },
    { "type": "relationship",
      "text": "Dell works on the ChippyV2 project" }
  ]
}

Rules:
- Tags must be lowercase, hyphenated, 1-3 words each
- entity_name MUST exactly match a name from KNOWN ENTITIES
- If the text mentions an entity not in KNOWN ENTITIES, classify as "relationship"
  (Graphiti will create the new entity)
- Prefer "attribute" over "relationship" when information describes a single entity
```

#### Store path: `preprocessStore(content, driver, llm, logger)`

1. **Find known entities** — Cypher keyword match (3s timeout)
2. **LLM classify** — one call with prompt above, JSON mode (10s timeout)
3. Return `PreprocessResult`

#### Capture path: `preprocessCapture(messages, driver, llm, logger)`

1. **Filter messages** — remove tool_use/tool_result, strip `<relevant-memories>` blocks, keep only user+assistant text, truncate to 4000 chars (doubled from current 2000 to give the fact-extraction LLM more context for better quality; the LLM output is short structured JSON so this does not significantly increase downstream cost)
2. **Find known entities** — same as store path
3. **Extract + classify** — mode depends on `PREPROCESS_MODE` env var:
   - `"merged"` (default): one LLM call does fact extraction + classification together
   - `"two-pass"`: first LLM call extracts facts as plain text, second classifies each against known entities
4. Return `PreprocessResult`

#### Execution (shared by both paths)

```js
async function executePreprocessResult(result, driver, mgDaemon, config, logger) {
  // 1. Apply entity updates directly to Neo4j
  for (const update of result.entityUpdates) {
    await applyEntityUpdate(update, driver);  // tags += , summary +=
  }

  // 2. Feed remaining texts to Graphiti (with custom_extraction_instructions)
  for (const item of result.forGraphiti) {
    await mgDaemon("add", {
      content: item.content,
      source: item.source,
      project: item.project,
      custom_instructions: EXTRACTION_INSTRUCTIONS,
    });
  }
}
```

#### Async store interaction

The current `/api/cli/store` defaults to async (respond immediately, process in background). Preprocessing runs **inside** the background task, not before the response:

```js
// cli.js store route
if (isAsync !== false) {
  res.json({ output: "Memory store queued.", async: true });
  // Background: preprocess + execute
  preprocessAndExecute(content, source, project, driver, mgDaemon, config, logger)
    .catch(err => logger?.warn?.(`store failed: ${err.message}`));
} else {
  // Sync: preprocess + execute, then respond
  const result = await preprocessAndExecute(content, source, project, ...);
  res.json({ output: result });
}
```

### Graphiti custom_extraction_instructions

Always injected into `add_episode` calls, regardless of whether preprocessing succeeded:

```
CRITICAL: Attributes are NOT entities. Do NOT create separate entity nodes for:
- Roles, job titles, occupations (e.g. "software engineer", "manager", "CEO")
- Experience levels, years of experience, seniority
- Skills, expertise, proficiencies (e.g. "React expert", "fluent in Python")
- Quantities, measurements, counts, ages
- Statuses, states, conditions (e.g. "active", "deprecated", "in progress")
- Descriptions, adjectives, characteristics (e.g. "large-scale", "high-performance")
- Versions, editions (e.g. "v2", "Enterprise Edition")
- Dates, time periods (e.g. "2024", "last quarter")

These are ATTRIBUTES of their parent entity, not independent entities.
Capture them in the edge 'fact' field or the entity's summary instead.

Only create entity nodes for things with independent identity:
people, organizations, projects, products, technologies, places, events.
```

### PREPROCESS_MODE Environment Variable

Controls capture preprocessing strategy:

| Value | Behavior | LLM Calls (capture) |
|-------|----------|---------------------|
| `"merged"` (default) | One LLM call: extract facts + classify in single prompt | 1 |
| `"two-pass"` | Two-stage: extract facts first, then classify each | 1 + N |

Store path always uses single-call classification (not affected by this flag).

Both modes produce identical `PreprocessResult` output for easy A/B comparison.

### mg_daemon Protocol Change

`cmd_add` must accept and forward `custom_instructions` to Graphiti's `add_episode(custom_extraction_instructions=...)`.

```python
# mg_daemon.py cmd_add changes:
custom_instructions = args.get("custom_instructions")

# Sync path
await g.add_episode(
    ...,
    custom_extraction_instructions=custom_instructions,
)

# Queue path (async): persist custom_instructions in the queue JSON file
item = {
    "content": project_content,
    "source": source,
    "group_id": group,
    "custom_instructions": custom_instructions,  # ← NEW
    "queued_at": ...,
}
```

The queue worker (`mg_worker.py`) must also read and forward `custom_instructions` from queued items when calling `add_episode`.

## Error Handling / Degradation

Preprocessing is best-effort enhancement, never a blocker.

| Failure | Behavior |
|---------|----------|
| Preprocessor LLM timeout/error | Skip preprocessing, feed raw content to Graphiti (with custom_extraction_instructions) |
| LLM returns unparseable JSON | Same — degrade to raw Graphiti |
| Neo4j known-entity query fails | Skip entity context, still attempt LLM classification (less accurate) |
| entity_update write fails | Log warning, continue to Graphiti step |
| Graphiti add_episode fails | Existing behavior, unrelated to preprocessing |

Timeouts:
- Preprocessor LLM call: 10s
- Known entity query: 3s
- Entity update writes: 5s per update

## Complete End-to-End Flow

### Path A: Manual Store (memory_store tool)

```
Agent calls memory_store({ content: "Dell is a developer..." })
  → POST /api/cli/store
  → preprocessStore():
      1. Find known entities (Cypher, no LLM)
      2. LLM classify: attribute vs relationship (10s timeout)
         → fail? degrade to raw Graphiti
  → executePreprocessResult():
      3a. entity_updates → write Neo4j directly (tags/summary)
      3b. forGraphiti → mgDaemon("add", { custom_instructions }) → Graphiti add_episode
         → skip_graphiti? done here
  → Respond to agent (async by default)
  → [Background] autoCategorizeNewEntities (60s interval)
```

### Path B: Auto-Capture (conversation end)

```
agent_end hook fires
  → POST /api/cli/capture { messages }
  → preprocessCapture():
      0. Filter messages (remove tools, memories, truncate 4000)
      1. Find known entities (Cypher)
      2. LLM extract + classify (mode: merged or two-pass)
         → fail? degrade to raw Graphiti with old behavior
  → executePreprocessResult():
      3a. attribute facts → write Neo4j directly
      3b. relationship facts → Graphiti add_episode (with custom_instructions)
  → Respond 200
  → [Background] autoCategorizeNewEntities (60s interval)
```

### Path C: Recall (read, no storage)

```
before_prompt_build hook
  → POST /api/cli/recall { prompt, limit }
  → mgDaemon("search") → Graphiti semantic search
  → Return <relevant-memories> context
  (no changes in this spec)
```

## LLM Call Budget

| Scenario | Before | After (merged) | After (two-pass) |
|----------|--------|-----------------|-------------------|
| Store (pure attribute) | 1× Graphiti (~14s) | 1× classify (~2s) | 1× classify (~2s) |
| Store (new relationship) | 1× Graphiti (~14s) | 1× classify + 1× Graphiti (~16s) | 1× classify + 1× Graphiti (~16s) |
| Capture (typical) | 1× Graphiti (~14s) | 1× extract+classify (~3s) + 0-N× Graphiti | 1× extract + N× classify + 0-N× Graphiti |
| Capture (pure attributes) | 1× Graphiti → junk entities | 1× extract+classify (~3s), 0× Graphiti | 1× extract + N× classify, 0× Graphiti |

## Out of Scope

- Migrating existing Python inline LLM scripts to Node.js (future work)
- Changing recall/search logic
- Modifying Graphiti's internal prompts (we only use the `custom_extraction_instructions` parameter)
- UI changes
