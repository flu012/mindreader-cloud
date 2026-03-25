# Memory Storage Quality Improvement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a preprocessing layer to MindReader's store/capture pipeline that classifies information as entity attributes vs new relationships, preventing junk entity creation and improving memory quality.

**Architecture:** Split 3000-line server.js into route modules + lib utilities. Add `lib/llm.js` (Node.js OpenAI-compatible fetch wrapper), `lib/preprocessor.js` (classify facts, update tags/summary directly, feed only relationships to Graphiti). Modify mg_daemon to forward `custom_extraction_instructions` to Graphiti.

**Tech Stack:** Node.js/Express, Neo4j (bolt), OpenAI-compatible LLM APIs via fetch, Python Graphiti (via mg_daemon stdin/stdout protocol)

**Spec:** `docs/superpowers/specs/2026-03-25-memory-quality-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/mindreader-ui/server/lib/llm.js` | Shared LLM utility (Node.js fetch, OpenAI-compatible) |
| Create | `packages/mindreader-ui/server/lib/preprocessor.js` | Preprocessing pipeline: findKnownEntities, classifyFacts, extractAndClassify, filterMessages, applyEntityUpdate, executePreprocessResult |
| Create | `packages/mindreader-ui/server/lib/daemon.js` | mgDaemon spawning, communication, lifecycle (extracted from server.js:2424-2584) |
| Create | `packages/mindreader-ui/server/lib/categorizer.js` | autoCategorizeNewEntities + getCategories + seedDefaultCategories + categorizeEntity helpers (extracted from server.js:2742-3030) |
| Create | `packages/mindreader-ui/server/routes/graph.js` | GET /api/graph (extracted from server.js:53-161) |
| Create | `packages/mindreader-ui/server/routes/entity.js` | /api/entity/:name CRUD, summarize, evolve, evolve/save, delete-preview, delete, summary update, merge, link (extracted from server.js:163-1007) |
| Create | `packages/mindreader-ui/server/routes/categories.js` | /api/categories CRUD, merge, /api/recategorize, /api/categories/:key/* (extracted from server.js:1015-1552) |
| Create | `packages/mindreader-ui/server/routes/search.js` | /api/search, /api/entities, /api/timeline, /api/projects, /api/stats, /api/query (extracted from server.js:1257-1671) |
| Create | `packages/mindreader-ui/server/routes/cleanup.js` | /api/cleanup/*, /api/relationships/* (extracted from server.js:1679-2275) |
| Create | `packages/mindreader-ui/server/routes/audit.js` | /api/audit, /api/audit/node/:name (extracted from server.js:2284-2376) |
| Create | `packages/mindreader-ui/server/routes/tokens.js` | /api/tokens (extracted from server.js:2385-2419) |
| Create | `packages/mindreader-ui/server/routes/cli.js` | /api/cli/* — store, search, entities, recall, capture (extracted from server.js:2586-2723, rewired through preprocessor) |
| Modify | `packages/mindreader-ui/server/server.js` | Slim down to app setup + route assembly (~100 lines) |
| Modify | `packages/mindgraph/python/mg_daemon.py:187-273` | Accept `custom_instructions` arg, forward to `add_episode(custom_extraction_instructions=...)` |
| Modify | `packages/mindgraph/python/mg_worker.py:41-59` | Read `custom_instructions` from queue JSON, forward to `add_episode` |

---

### Task 1: Create lib/llm.js — Shared LLM Utility

**Files:**
- Create: `packages/mindreader-ui/server/lib/llm.js`

This is a standalone module with no dependencies on other project files. It calls OpenAI-compatible APIs via `fetch`.

- [ ] **Step 1: Create lib directory and llm.js**

```js
// packages/mindreader-ui/server/lib/llm.js

/**
 * Shared LLM calling utility — Node.js fetch, OpenAI-compatible.
 * Used by preprocessor. Does NOT replace existing Python inline LLM scripts.
 */

/**
 * Call an OpenAI-compatible chat completions API.
 *
 * @param {object} opts
 * @param {string} opts.prompt - User message content
 * @param {object} opts.config - Must have llmApiKey, llmBaseUrl, llmModel
 * @param {boolean} [opts.jsonMode=false] - If true, request JSON response format
 * @param {number} [opts.timeoutMs=10000] - Timeout in ms
 * @param {string} [opts.systemPrompt] - Optional system message
 * @returns {Promise<object|string>} Parsed JSON (if jsonMode) or text
 */
export async function callLLM({ prompt, config, jsonMode = false, timeoutMs = 10000, systemPrompt }) {
  const baseUrl = (config.llmBaseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const isDashscope = baseUrl.includes("dashscope");
  const model = config.llmModel || "gpt-4o-mini";

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const body = { model, messages, temperature: 0.1, max_tokens: 2000 };
  if (jsonMode) body.response_format = { type: "json_object" };
  if (isDashscope) body.enable_thinking = false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llmApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("LLM returned empty content");

    if (jsonMode) {
      return JSON.parse(content);
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Verify the module loads without errors**

Run: `cd /mnt/e/project/mindreaderv2 && node -e "import('./packages/mindreader-ui/server/lib/llm.js').then(m => console.log('OK:', typeof m.callLLM))"`
Expected: `OK: function`

- [ ] **Step 3: Commit**

```bash
git add packages/mindreader-ui/server/lib/llm.js
git commit -m "feat: add lib/llm.js — shared Node.js LLM calling utility"
```

---

### Task 2: Create lib/preprocessor.js — Preprocessing Pipeline

**Files:**
- Create: `packages/mindreader-ui/server/lib/preprocessor.js`

**Dependencies:** `lib/llm.js`, `neo4j.js` (for query/readQuery)

- [ ] **Step 1: Create preprocessor.js with all functions**

```js
// packages/mindreader-ui/server/lib/preprocessor.js

/**
 * Memory storage preprocessor.
 *
 * Classifies incoming facts as entity attribute updates (written directly to Neo4j)
 * vs new relationships (forwarded to Graphiti add_episode).
 *
 * Two entry points:
 *   preprocessStore(content, ...) — for /api/cli/store
 *   preprocessCapture(messages, ...) — for /api/cli/capture
 *
 * Both return a PreprocessResult: { entityUpdates, forGraphiti }
 */

import { callLLM } from "./llm.js";

// Graphiti custom_extraction_instructions — always injected as last line of defense
export const EXTRACTION_INSTRUCTIONS = `CRITICAL: Attributes are NOT entities. Do NOT create separate entity nodes for:
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
people, organizations, projects, products, technologies, places, events.`;

// English stopwords to exclude from entity lookup keywords
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "that", "this",
  "these", "those", "what", "which", "who", "whom", "its", "his", "her",
  "their", "our", "my", "your", "about", "also", "like", "been", "get",
  "got", "him", "her", "them", "they", "she", "he", "it", "we", "you",
]);

/**
 * Extract significant keywords from text for entity lookup.
 */
function extractKeywords(text) {
  return [...new Set(
    text.split(/[\s,.;:!?()\[\]{}"']+/)
      .map(w => w.trim())
      .filter(w => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()))
  )].slice(0, 20);
}

/**
 * Find known entities that match keywords from the input text.
 * Returns array of { name, summary, tags, category }.
 */
export async function findKnownEntities(text, driver, timeoutMs = 3000) {
  const words = extractKeywords(text);
  if (words.length === 0) return [];

  try {
    const session = driver.session();
    try {
      const result = await Promise.race([
        session.run(
          `MATCH (e:Entity)
           WHERE ANY(word IN $words WHERE toLower(e.name) CONTAINS toLower(word))
           RETURN e.name AS name, e.summary AS summary, e.tags AS tags, e.category AS category
           ORDER BY size(e.name) ASC
           LIMIT 10`,
          { words }
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
      ]);
      return result.records.map(r => ({
        name: r.get("name"),
        summary: (r.get("summary") || "").slice(0, 200),
        tags: r.get("tags") || [],
        category: r.get("category") || "other",
      }));
    } finally {
      await session.close();
    }
  } catch {
    return [];
  }
}

/**
 * Build the LLM classification prompt.
 */
function buildClassifyPrompt(text, knownEntities) {
  const entityList = knownEntities.length > 0
    ? knownEntities.map(e => {
        const tags = Array.isArray(e.tags) && e.tags.length ? `. Tags: ${e.tags.join(", ")}` : "";
        return `- ${e.name} [${e.category}]: ${e.summary || "no summary"}${tags}`;
      }).join("\n")
    : "(none found)";

  return `You are a knowledge graph preprocessor. Given TEXT and a list of KNOWN ENTITIES from the graph, classify each piece of information.

KNOWN ENTITIES:
${entityList}

TEXT: "${text}"

For each fact in the text, output ONE of:
- "attribute": information that describes an existing entity (role, skill, trait, preference, status). Provide entity_name + add_tags + summary_append.
- "relationship": a connection between two entities that should be stored as a graph edge. Provide the original text.

Return JSON:
{
  "facts": [
    { "type": "attribute", "entity_name": "ExactName", "add_tags": ["lowercase-tag"], "summary_append": "Short sentence." },
    { "type": "relationship", "text": "Original text about the relationship" }
  ]
}

Rules:
- Tags must be lowercase, hyphenated, 1-3 words each
- entity_name MUST exactly match a name from KNOWN ENTITIES
- If the text mentions an entity not in KNOWN ENTITIES, classify as "relationship" (Graphiti will create the new entity)
- Prefer "attribute" over "relationship" when information describes a single entity
- If the text is noise or has no meaningful facts, return {"facts": []}`;
}

/**
 * Build the merged capture prompt (extract facts + classify in one call).
 */
function buildMergedCapturePrompt(conversationText, knownEntities) {
  const entityList = knownEntities.length > 0
    ? knownEntities.map(e => {
        const tags = Array.isArray(e.tags) && e.tags.length ? `. Tags: ${e.tags.join(", ")}` : "";
        return `- ${e.name} [${e.category}]: ${e.summary || "no summary"}${tags}`;
      }).join("\n")
    : "(none found)";

  return `You are a knowledge graph preprocessor. Extract facts worth remembering long-term from this conversation, then classify each.

KNOWN ENTITIES:
${entityList}

CONVERSATION:
${conversationText}

Step 1: Extract facts worth remembering (max 10). Keep: user preferences, personal info, decisions, project status changes, workflow preferences. Ignore: code details, debugging, tool output, temporary state.

Step 2: For each fact, classify as:
- "attribute": describes an existing KNOWN ENTITY (role, skill, trait, preference). Provide entity_name + add_tags + summary_append.
- "relationship": a connection between two entities. Provide the text.

Return JSON:
{
  "facts": [
    { "type": "attribute", "entity_name": "ExactName", "add_tags": ["tag"], "summary_append": "Short sentence." },
    { "type": "relationship", "text": "Description of the relationship" }
  ]
}

Rules:
- Tags must be lowercase, hyphenated, 1-3 words each
- entity_name MUST exactly match a name from KNOWN ENTITIES
- If the text mentions an entity not in KNOWN ENTITIES, classify as "relationship"
- Prefer "attribute" when information describes a single entity
- If nothing is worth remembering, return {"facts": []}`;
}

/**
 * Build the two-pass extraction prompt (extract facts only, no classification).
 */
function buildExtractPrompt(conversationText) {
  return `Extract facts worth remembering long-term from this conversation. One fact per line, max 10.

Keep: user preferences, personal info, decisions, project status changes, workflow preferences, important conclusions.
Ignore: code implementation details, debugging processes, tool output, temporary state, known project structure.

CONVERSATION:
${conversationText}

Return JSON:
{
  "facts": ["fact 1", "fact 2", ...]
}

If nothing worth remembering, return {"facts": []}`;
}

/**
 * Parse LLM classification response into PreprocessResult.
 */
function parseClassifyResponse(response, source, project, knownEntityNames) {
  const result = { entityUpdates: [], forGraphiti: [] };
  const facts = response?.facts;
  if (!Array.isArray(facts)) return result;

  for (const fact of facts) {
    if (fact.type === "attribute" && fact.entity_name && knownEntityNames.has(fact.entity_name)) {
      result.entityUpdates.push({
        name: fact.entity_name,
        addTags: Array.isArray(fact.add_tags) ? fact.add_tags.map(t => String(t).toLowerCase().trim()).filter(Boolean) : [],
        summaryAppend: typeof fact.summary_append === "string" ? fact.summary_append.trim() : "",
      });
    } else if (fact.type === "relationship" && fact.text) {
      result.forGraphiti.push({ content: fact.text, source, project });
    }
  }
  return result;
}

/**
 * Apply a single entity update to Neo4j (add tags + append summary).
 */
export async function applyEntityUpdate(update, driver) {
  if (!update.name) return;
  const session = driver.session();
  try {
    // Fetch existing tags for deduplication
    const existing = await session.run(
      `MATCH (e:Entity) WHERE toLower(e.name) = toLower($name)
       RETURN e.tags AS tags, e.summary AS summary`,
      { name: update.name }
    );
    if (existing.records.length === 0) return;

    const oldTags = existing.records[0].get("tags") || [];
    const oldSummary = existing.records[0].get("summary") || "";

    // Deduplicate tags in JS
    const mergedTags = [...new Set([...oldTags, ...update.addTags])];

    // Append summary with separator, cap at 1000 chars
    let newSummary = oldSummary;
    if (update.summaryAppend) {
      const sep = oldSummary ? ". " : "";
      newSummary = (oldSummary + sep + update.summaryAppend).slice(0, 1000);
    }

    await session.run(
      `MATCH (e:Entity) WHERE toLower(e.name) = toLower($name)
       SET e.tags = $tags, e.summary = $summary`,
      { name: update.name, tags: mergedTags, summary: newSummary }
    );
  } finally {
    await session.close();
  }
}

/**
 * Execute a PreprocessResult: apply entity updates, then feed items to Graphiti.
 */
export async function executePreprocessResult(result, driver, mgDaemon, config, logger) {
  // 1. Apply entity updates directly to Neo4j
  for (const update of result.entityUpdates) {
    try {
      await applyEntityUpdate(update, driver);
      logger?.info?.(`Preprocessor: updated ${update.name} tags=[${update.addTags}]`);
    } catch (err) {
      logger?.warn?.(`Preprocessor: entity update failed for ${update.name}: ${err.message}`);
    }
  }

  // 2. Feed remaining items to Graphiti (with custom_extraction_instructions)
  for (const item of result.forGraphiti) {
    try {
      await mgDaemon("add", {
        content: item.content,
        source: item.source,
        project: item.project || undefined,
        custom_instructions: EXTRACTION_INSTRUCTIONS,
      }, 120000);
    } catch (err) {
      logger?.warn?.(`Preprocessor: Graphiti add failed: ${err.message}`);
    }
  }
}

/**
 * Filter conversation messages for capture preprocessing.
 * Removes tool_use/tool_result, strips <relevant-memories>, keeps user+assistant text.
 */
export function filterMessages(messages, maxChars = 4000) {
  // Process all messages first, then take the LAST ones that fit
  // (recent context is more relevant for auto-capture)
  const allLines = [];

  for (const msg of (messages || [])) {
    if (!msg || typeof msg !== "object") continue;
    if (msg.role !== "user" && msg.role !== "assistant") continue;

    const content = typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.filter(b => b?.type === "text").map(b => b.text).join("\n")
        : "";
    if (!content || content.length < 10) continue;

    const cleaned = content
      .replace(/<relevant-memories>[\s\S]*?<\/relevant-memories>/g, "")
      .trim();
    if (cleaned.length < 10) continue;

    allLines.push(`${msg.role}: ${cleaned.slice(0, 1000)}`);
  }

  // Take last N lines that fit within maxChars (prioritize recent messages)
  const lines = [];
  let totalLen = 0;
  for (let i = allLines.length - 1; i >= 0; i--) {
    if (totalLen + allLines[i].length > maxChars) break;
    lines.unshift(allLines[i]);
    totalLen += allLines[i].length;
  }

  return lines.join("\n");
}

// ---- Main entry points ----

/**
 * Preprocess a store request.
 * @returns {PreprocessResult}
 */
export async function preprocessStore(content, source, project, driver, config, logger) {
  const knownEntities = await findKnownEntities(content, driver);
  const knownNames = new Set(knownEntities.map(e => e.name));

  const prompt = buildClassifyPrompt(content, knownEntities);
  const response = await callLLM({ prompt, config, jsonMode: true, timeoutMs: 10000 });

  return parseClassifyResponse(response, source, project, knownNames);
}

/**
 * Preprocess a capture request.
 * @returns {PreprocessResult}
 */
export async function preprocessCapture(messages, driver, config, logger) {
  const filtered = filterMessages(messages);
  if (filtered.length < 30) return { entityUpdates: [], forGraphiti: [] };

  const knownEntities = await findKnownEntities(filtered, driver);
  const knownNames = new Set(knownEntities.map(e => e.name));
  const mode = process.env.PREPROCESS_MODE || "merged";

  if (mode === "two-pass") {
    // Step 1: extract facts
    const extractPrompt = buildExtractPrompt(filtered);
    const extracted = await callLLM({ prompt: extractPrompt, config, jsonMode: true, timeoutMs: 10000 });
    const facts = Array.isArray(extracted?.facts) ? extracted.facts : [];
    if (facts.length === 0) return { entityUpdates: [], forGraphiti: [] };

    // Step 2: classify each fact
    const combined = { entityUpdates: [], forGraphiti: [] };
    for (const fact of facts) {
      if (typeof fact !== "string" || fact.length < 10) continue;
      const classifyPrompt = buildClassifyPrompt(fact, knownEntities);
      try {
        const resp = await callLLM({ prompt: classifyPrompt, config, jsonMode: true, timeoutMs: 10000 });
        const partial = parseClassifyResponse(resp, "auto-capture", undefined, knownNames);
        combined.entityUpdates.push(...partial.entityUpdates);
        combined.forGraphiti.push(...partial.forGraphiti);
      } catch (err) {
        // Single fact classification failed, degrade: send raw to Graphiti
        combined.forGraphiti.push({ content: fact, source: "auto-capture" });
        logger?.warn?.(`Preprocessor: classify failed for fact, degrading: ${err.message}`);
      }
    }
    return combined;
  }

  // Default: merged — one LLM call for extract + classify
  const mergedPrompt = buildMergedCapturePrompt(filtered, knownEntities);
  const response = await callLLM({ prompt: mergedPrompt, config, jsonMode: true, timeoutMs: 10000 });
  return parseClassifyResponse(response, "auto-capture", undefined, knownNames);
}
```

- [ ] **Step 2: Verify the module loads**

Run: `cd /mnt/e/project/mindreaderv2 && node -e "import('./packages/mindreader-ui/server/lib/preprocessor.js').then(m => console.log('OK:', Object.keys(m)))"`
Expected: `OK: [ 'EXTRACTION_INSTRUCTIONS', 'findKnownEntities', 'applyEntityUpdate', 'executePreprocessResult', 'filterMessages', 'preprocessStore', 'preprocessCapture' ]`

- [ ] **Step 3: Commit**

```bash
git add packages/mindreader-ui/server/lib/preprocessor.js
git commit -m "feat: add lib/preprocessor.js — memory storage preprocessing pipeline"
```

---

### Task 3: Modify mg_daemon.py — Forward custom_instructions

**Files:**
- Modify: `packages/mindgraph/python/mg_daemon.py:187-273`

- [ ] **Step 1: Edit mg_daemon.py cmd_add to accept and forward custom_instructions**

In `cmd_add` function at line 187, add `custom_instructions = args.get("custom_instructions")` and pass it to both the sync `add_episode` call and the queue JSON.

Changes to apply:

After line 191 (`do_async = args.get("async", False)`), add:
```python
    custom_instructions = args.get("custom_instructions")
```

In the sync path (line 246), change the `add_episode` call to:
```python
        await g.add_episode(
            name=f"memory-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
            episode_body=project_content,
            source_description=source,
            reference_time=datetime.now(timezone.utc),
            group_id=group,
            custom_extraction_instructions=custom_instructions,
        )
```

In the queue path (line 227), add `custom_instructions` to the item dict:
```python
        item = {
            "content": project_content,
            "source": source,
            "group_id": group,
            "custom_instructions": custom_instructions,
            "queued_at": datetime.now(timezone.utc).isoformat(),
        }
```

- [ ] **Step 2: Verify daemon still starts**

Run: `cd /mnt/e/project/mindreaderv2/packages/mindgraph/python && source .venv/bin/activate && python -c "import mg_daemon; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add packages/mindgraph/python/mg_daemon.py
git commit -m "feat: mg_daemon accepts custom_instructions, forwards to Graphiti add_episode"
```

---

### Task 4: Modify mg_worker.py — Forward custom_instructions from queue

**Files:**
- Modify: `packages/mindgraph/python/mg_worker.py:41-59`

- [ ] **Step 1: Edit process_queue_item to read and forward custom_instructions**

At line 49, after `group_id = item.get('group_id', '')`, add:
```python
        custom_instructions = item.get('custom_instructions')
```

At line 53, change the `add_episode` call to include the new parameter:
```python
        await g.add_episode(
            name=f"memory-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
            episode_body=content,
            source_description=source,
            reference_time=datetime.now(timezone.utc),
            group_id=group_id,
            custom_extraction_instructions=custom_instructions,
        )
```

- [ ] **Step 2: Verify worker still imports**

Run: `cd /mnt/e/project/mindreaderv2/packages/mindgraph/python && source .venv/bin/activate && python -c "import mg_worker; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add packages/mindgraph/python/mg_worker.py
git commit -m "feat: mg_worker forwards custom_instructions from queue to Graphiti"
```

---

### Task 5: Extract lib/daemon.js from server.js

**Files:**
- Create: `packages/mindreader-ui/server/lib/daemon.js`
- Modify: `packages/mindreader-ui/server/server.js`

Extract the daemon management code (lines 2424-2584 of server.js) into a standalone module.

- [ ] **Step 1: Create lib/daemon.js**

Extract the following from `server.js` into `lib/daemon.js`:
- `_startDaemon()` function (line 2430)
- `_stopDaemon()` function (line 2505)
- `mgDaemon()` function (line 2516)
- `mgExec()` function (line 2541)
- All daemon state variables (`_daemonProc`, `_daemonReady`, `_daemonPending`, `_daemonBuffer`, `_reqCounter`)
- The eager daemon start (line 2583)

The module should export a factory function:

```js
// lib/daemon.js
export function createDaemon(config, logger) {
  // ... all daemon state and functions ...

  // Start eagerly
  try { _startDaemon(); } catch (err) { logger?.warn?.("Could not start Python daemon:", err.message); }

  return { mgDaemon, mgExec, stop: _stopDaemon };
}
```

- [ ] **Step 2: Update server.js to import and use createDaemon**

Replace the daemon code block in server.js with:
```js
import { createDaemon } from "./lib/daemon.js";
// ... inside createServer():
const { mgDaemon, mgExec, stop: stopDaemon } = createDaemon(config, logger);
app._stopDaemon = stopDaemon;
```

- [ ] **Step 3: Run test suite to verify nothing broke**

Run: `cd /mnt/e/project/mindreaderv2 && node scripts/test-api.mjs 2>&1 | tail -5`
Expected: All tests pass (50 passed, 0 failed)

- [ ] **Step 4: Commit**

```bash
git add packages/mindreader-ui/server/lib/daemon.js packages/mindreader-ui/server/server.js
git commit -m "refactor: extract lib/daemon.js from server.js"
```

---

### Task 6: Extract lib/categorizer.js from server.js

**Files:**
- Create: `packages/mindreader-ui/server/lib/categorizer.js`
- Modify: `packages/mindreader-ui/server/server.js`

Extract `getCategories`, `seedDefaultCategories`, `categorizeNode`, `categorizeEntity`, `autoCategorizeNewEntities` (lines 2742-3030).

- [ ] **Step 1: Create lib/categorizer.js**

Extract all category-related functions from server.js into `lib/categorizer.js`. Export:
```js
export { getCategories, seedDefaultCategories, categorizeNode, categorizeEntity, createAutoCategorizer };
```

`createAutoCategorizer(driver, config, logger)` returns `{ start(), stop() }` — wraps the interval + lock logic.

- [ ] **Step 2: Update server.js to import from lib/categorizer.js**

Replace inline category functions with imports. Update `startServer()` to use `createAutoCategorizer`.

- [ ] **Step 3: Run test suite**

Run: `cd /mnt/e/project/mindreaderv2 && node scripts/test-api.mjs 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/mindreader-ui/server/lib/categorizer.js packages/mindreader-ui/server/server.js
git commit -m "refactor: extract lib/categorizer.js from server.js"
```

---

### Task 7: Extract route files from server.js

**Files:**
- Create: `packages/mindreader-ui/server/routes/graph.js`
- Create: `packages/mindreader-ui/server/routes/entity.js`
- Create: `packages/mindreader-ui/server/routes/categories.js`
- Create: `packages/mindreader-ui/server/routes/search.js`
- Create: `packages/mindreader-ui/server/routes/cleanup.js`
- Create: `packages/mindreader-ui/server/routes/audit.js`
- Create: `packages/mindreader-ui/server/routes/tokens.js`
- Create: `packages/mindreader-ui/server/routes/cli.js`
- Modify: `packages/mindreader-ui/server/server.js`

This is the largest task. Each route file exports a function:
```js
export function registerRoutes(app, { driver, config, logger, mgDaemon, mgExec }) { ... }
```

- [ ] **Step 1: Create routes/graph.js**

Extract `GET /api/graph` (server.js lines 53-161). Needs: `driver`, `query`, `categorizeNode` (from lib/categorizer.js).

- [ ] **Step 2: Create routes/entity.js**

Extract all `/api/entity/:name` routes (lines 163-1007): GET, PUT, summarize, evolve, evolve/save, delete-preview, DELETE, PUT summary, POST merge, POST link. Needs: `driver`, `query`, `readQuery`, `nodeToPlain`, `relToPlain`, `config`, `logger`, `neo4j`.

- [ ] **Step 3: Create routes/categories.js**

Extract all `/api/categories` routes + `/api/recategorize` (lines 1015-1552). Needs: `driver`, `query`, `getCategories` (from lib/categorizer.js), `config`, `logger`.

- [ ] **Step 4: Create routes/search.js**

Extract `/api/search`, `/api/entities`, `/api/timeline`, `/api/projects`, `/api/stats`, `/api/query` (lines 1257-1671). Needs: `driver`, `query`, `readQuery`, `categorizeEntity` (from lib/categorizer.js).

- [ ] **Step 5: Create routes/cleanup.js**

Extract `/api/cleanup/*` and `/api/relationships/*` (lines 1679-2275). Needs: `driver`, `query`, `neo4j`, `config`, `logger`.

- [ ] **Step 6: Create routes/audit.js**

Extract `/api/audit` and `/api/audit/node/:name` (lines 2284-2376). Needs: `driver`, `query`.

- [ ] **Step 7: Create routes/tokens.js**

Extract `/api/tokens` (lines 2385-2419). Needs: `driver`, `readQuery`.

- [ ] **Step 8: Create routes/cli.js (WITHOUT preprocessing — that's Task 8)**

Extract `/api/cli/*` routes (lines 2586-2723): search, store, entities, recall, capture. Keep the current behavior — preprocessing wiring happens in Task 8. Needs: `driver`, `config`, `logger`, `mgDaemon`.

- [ ] **Step 9: Rewrite server.js as thin assembly**

server.js should now be ~100-150 lines:
```js
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDriver, closeDriver } from "./neo4j.js";
import { loadConfig } from "./config.js";
import { createDaemon } from "./lib/daemon.js";
import { createAutoCategorizer, getCategories, seedDefaultCategories } from "./lib/categorizer.js";

// Import route modules
import { registerRoutes as graphRoutes } from "./routes/graph.js";
import { registerRoutes as entityRoutes } from "./routes/entity.js";
import { registerRoutes as categoriesRoutes } from "./routes/categories.js";
import { registerRoutes as searchRoutes } from "./routes/search.js";
import { registerRoutes as cleanupRoutes } from "./routes/cleanup.js";
import { registerRoutes as auditRoutes } from "./routes/audit.js";
import { registerRoutes as tokensRoutes } from "./routes/tokens.js";
import { registerRoutes as cliRoutes } from "./routes/cli.js";

export function createServer(config, logger) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const uiDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../ui/dist");
  app.use(express.static(uiDist));

  const driver = getDriver(config);
  const { mgDaemon, mgExec, stop: stopDaemon } = createDaemon(config, logger);
  app._stopDaemon = stopDaemon;

  // Auth middleware
  if (config.apiToken) {
    app.use("/api", (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${config.apiToken}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      next();
    });
  }

  const ctx = { driver, config, logger, mgDaemon, mgExec };
  graphRoutes(app, ctx);
  entityRoutes(app, ctx);
  categoriesRoutes(app, ctx);
  searchRoutes(app, ctx);
  cleanupRoutes(app, ctx);
  auditRoutes(app, ctx);
  tokensRoutes(app, ctx);
  cliRoutes(app, ctx);

  // SPA fallback
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: `Unknown API route: ${req.method} ${req.path}` });
    } else {
      res.sendFile(path.join(uiDist, "index.html"));
    }
  });

  return app;
}

export function startServer(configOverrides, logger) {
  const config = loadConfig(configOverrides || {});
  const port = config.uiPort || 18900;
  const app = createServer(config, logger);

  const driver = getDriver(config);
  import("./init-indexes.js").then(({ initIndexes }) => initIndexes(driver, logger)).catch(() => {});
  seedDefaultCategories(driver, logger).then(() => getCategories(driver)).catch(() => {});

  const autoCat = createAutoCategorizer(driver, config, logger);
  autoCat.start();

  const server = app.listen(port, () => {
    logger?.info?.(`🧠 MindReader UI: http://localhost:${port}`);
  });

  server.on("close", () => {
    autoCat.stop();
    if (app._stopDaemon) app._stopDaemon();
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      logger?.warn?.(`🧠 MindReader: Port ${port} already in use.`);
    } else {
      logger?.error?.(`🧠 MindReader: Server error: ${err.message}`);
    }
  });

  return server;
}
```

- [ ] **Step 10: Run test suite**

Run: `cd /mnt/e/project/mindreaderv2 && node scripts/test-api.mjs 2>&1 | tail -5`
Expected: All 50 tests pass. If failures, debug and fix before proceeding.

- [ ] **Step 11: Commit**

```bash
git add packages/mindreader-ui/server/routes/ packages/mindreader-ui/server/server.js
git commit -m "refactor: split server.js into route modules — graph, entity, categories, search, cleanup, audit, tokens, cli"
```

---

### Task 8: Wire Preprocessing into CLI Routes

**Files:**
- Modify: `packages/mindreader-ui/server/routes/cli.js`

This is the key task — connect the preprocessor to the store and capture endpoints.

- [ ] **Step 1: Update cli.js store route to use preprocessing**

Add import at top of cli.js:
```js
import { preprocessStore, preprocessCapture, executePreprocessResult, filterMessages, EXTRACTION_INSTRUCTIONS } from "../lib/preprocessor.js";
```

Replace the store handler with preprocessing + degradation:

```js
app.post("/api/cli/store", async (req, res) => {
  try {
    const { content, source = "agent", project, async: isAsync } = req.body || {};
    if (!content) return res.status(400).json({ error: "Missing content" });

    const doWork = async () => {
      try {
        const result = await preprocessStore(content, source, project, driver, config, logger);
        await executePreprocessResult(result, driver, mgDaemon, config, logger);
        const attrCount = result.entityUpdates.length;
        const relCount = result.forGraphiti.length;
        return `Stored: ${attrCount} attribute update(s), ${relCount} relationship(s) to graph.`;
      } catch (err) {
        // Degrade: raw Graphiti with custom instructions
        logger?.warn?.(`Preprocessor failed, degrading: ${err.message}`);
        const resp = await mgDaemon("add", {
          content, source, project: project || undefined,
          custom_instructions: EXTRACTION_INSTRUCTIONS,
        }, 120000);
        return resp.output || "Memory stored (degraded).";
      }
    };

    if (isAsync !== false) {
      res.json({ output: "Memory store queued.", async: true });
      doWork()
        .then(out => logger?.info?.(`MindReader: async store complete — ${out}`))
        .catch(err => logger?.warn?.(`MindReader: async store failed — ${err.message}`));
    } else {
      const output = await doWork();
      res.json({ output });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Update cli.js capture route to use preprocessing**

Replace the capture handler:

```js
app.post("/api/cli/capture", async (req, res) => {
  try {
    const { messages, captureMaxChars = 4000 } = req.body || {};

    try {
      const result = await preprocessCapture(messages, driver, config, logger);
      if (result.entityUpdates.length === 0 && result.forGraphiti.length === 0) {
        return res.json({ stored: 0, output: "No facts worth storing." });
      }
      await executePreprocessResult(result, driver, mgDaemon, config, logger);
      const total = result.entityUpdates.length + result.forGraphiti.length;
      res.json({ stored: total, output: `Processed ${total} fact(s).` });
    } catch (err) {
      // Degrade: old behavior — concat messages, feed raw to Graphiti
      logger?.warn?.(`Capture preprocessor failed, degrading: ${err.message}`);
      const filtered = filterMessages(messages, captureMaxChars);
      if (filtered.length < 30) return res.json({ stored: 0 });
      const resp = await mgDaemon("add", {
        content: filtered.slice(0, captureMaxChars),
        source: "auto-capture",
        custom_instructions: EXTRACTION_INSTRUCTIONS,
      }, 120000);
      res.json({ stored: 1, output: resp.output });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Run test suite**

Run: `cd /mnt/e/project/mindreaderv2 && node scripts/test-api.mjs 2>&1 | tail -10`
Expected: All tests pass. The store/capture tests may need updating since responses changed (e.g., "Memory store queued." instead of old output).

- [ ] **Step 4: Manual smoke test**

```bash
# Test store with sync mode
curl -X POST http://localhost:18999/api/cli/store \
  -H "Content-Type: application/json" \
  -d '{"content": "Dell is a software developer with 15 years experience", "async": false}'
# Expected: JSON with attribute update count + relationship count

# Test capture
curl -X POST http://localhost:18999/api/cli/capture \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role":"user","content":"I prefer dark mode in all my apps"},{"role":"assistant","content":"Noted, I will remember your preference for dark mode."}]}'
# Expected: JSON with stored count
```

- [ ] **Step 5: Commit**

```bash
git add packages/mindreader-ui/server/routes/cli.js
git commit -m "feat: wire preprocessing pipeline into store and capture endpoints"
```

---

### Task 9: Sync to Extension Directory and Final Validation

**Files:**
- Sync: all changed server files to `~/.openclaw/extensions/mindreader/`

- [ ] **Step 1: Run full test suite**

Run: `cd /mnt/e/project/mindreaderv2 && node scripts/test-api.mjs 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 2: Sync server files to extension**

The extension's `node_modules/@mindreader/ui` is likely symlinked to the source. Verify:
```bash
ls -la ~/.openclaw/extensions/mindreader/node_modules/@mindreader/ui/server/
# If symlinked, no copy needed. If not:
cp -r packages/mindreader-ui/server/* ~/.openclaw/extensions/mindreader/server/
```

- [ ] **Step 3: Sync Python daemon changes**

```bash
# mg_daemon.py and mg_worker.py are in packages/mindgraph/python/
# These may also be symlinked. Check and copy if needed.
```

- [ ] **Step 4: Commit all remaining changes**

```bash
git add -A
git commit -m "chore: final sync and validation for memory quality preprocessing"
```
