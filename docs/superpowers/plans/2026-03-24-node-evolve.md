# Node Evolve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users click "Evolve" on any entity to research it via an LLM with web search, stream discovered entities/relationships live into a modal with a mini-graph, and save selected results back to the knowledge graph.

**Architecture:** Single POST endpoint with SSE streaming using the `openai` npm package directly (not the Python subprocess pattern). Frontend modal with a Sigma.js mini-graph and a stream feed. Review-then-save flow with checkboxes.

**Tech Stack:** Express + openai npm SDK (backend streaming), React + Sigma.js + graphology + graphology-layout-forceatlas2 (frontend modal), Neo4j (persistence)

**Spec:** `docs/superpowers/specs/2026-03-24-node-evolve-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/mindreader-ui/server/config.js` | Add `llmEvolveModel` config |
| `packages/mindreader-ui/server/server.js` | Add `/api/entity/:name/evolve` (SSE) and `/api/entity/:name/evolve/save` endpoints |
| `packages/mindreader-ui/ui/src/components/EvolveModal.jsx` | New: Full evolution modal (stream feed, mini-graph, review) |
| `packages/mindreader-ui/ui/src/components/DetailPanel.jsx` | Add "Evolve" button to action bar |
| `packages/mindreader-ui/ui/src/index.css` | Add evolve modal styles |
| `packages/mindreader-ui/package.json` | Add `openai` dependency |
| `packages/mindreader-ui/ui/package.json` | Add `graphology-layout-forceatlas2` dependency |
| `.env.example` | Add `LLM_EVOLVE_MODEL` |
| `scripts/setup.sh` | Add optional evolve model question |

---

### Task 1: Configuration — Add `LLM_EVOLVE_MODEL`

**Files:**
- Modify: `packages/mindreader-ui/server/config.js:47` (after `llmExtractModel`)
- Modify: `.env.example:11-12`
- Modify: `scripts/setup.sh` (after LLM model selection)

- [ ] **Step 1: Add `llmEvolveModel` to config.js**

In `packages/mindreader-ui/server/config.js`, add a new line after line 47 (`llmExtractModel:`):

```js
llmEvolveModel: overrides.llmEvolveModel || process.env.LLM_EVOLVE_MODEL || overrides.llmModel || process.env.LLM_MODEL || llmPreset.defaultModel || "gpt-4o-mini",
```

This follows the exact same fallback chain as `llmExtractModel`.

- [ ] **Step 2: Add `LLM_EVOLVE_MODEL` to .env.example**

In `.env.example`, after line 12 (`# LLM_SMALL_MODEL=`), add:

```env
# LLM_EVOLVE_MODEL=         # Model with web search for Node Evolve (defaults to LLM_MODEL)
```

- [ ] **Step 3: Add evolve model question to setup.sh**

In `scripts/setup.sh`, after line 263 (`LLM_API_KEY="$(ask_secret "API key for ${LLM_PROVIDER}")"`) and before the Embedder section, add:

```bash
    # Node Evolve model (optional)
    echo
    info "Node Evolve uses a separate model with web search capability."
    info "Leave blank to use the same model as LLM_MODEL (${LLM_MODEL})."
    LLM_EVOLVE_MODEL="$(ask "Evolve model (blank = same as LLM)" "")"
    echo
```

Then in the `write_env()` function, after line 559 (`LLM_API_KEY=${LLM_API_KEY}`), add:

```bash
LLM_EVOLVE_MODEL=${LLM_EVOLVE_MODEL}
```

- [ ] **Step 4: Verify config loads correctly**

Run the server and check no errors:
```bash
cd /mnt/e/project/mindreaderv2 && node -e "
import { loadConfig } from './packages/mindreader-ui/server/config.js';
const c = loadConfig();
console.log('evolveModel:', c.llmEvolveModel);
console.log('OK');
"
```

Expected: prints `evolveModel:` followed by the model name (or default), then `OK`.

- [ ] **Step 5: Commit**

```bash
git add packages/mindreader-ui/server/config.js .env.example scripts/setup.sh
git commit -m "feat(evolve): add LLM_EVOLVE_MODEL configuration"
```

---

### Task 2: Install Dependencies

**Dependency note:** Task 5 (EvolveModal) and Task 7 (DetailPanel wiring) depend on these packages being installed first.

**Files:**
- Modify: `packages/mindreader-ui/package.json`
- Modify: `packages/mindreader-ui/ui/package.json`

- [ ] **Step 1: Add `openai` to the server package**

```bash
cd /mnt/e/project/mindreaderv2/packages/mindreader-ui && npm install openai
```

This adds the `openai` npm package for direct LLM streaming from Node.js (instead of the Python subprocess pattern used by other endpoints).

- [ ] **Step 2: Add `graphology-layout-forceatlas2` to the UI package**

```bash
cd /mnt/e/project/mindreaderv2/packages/mindreader-ui/ui && npm install graphology-layout-forceatlas2
```

This provides the ForceAtlas2 layout algorithm for the mini-graph in the evolve modal.

- [ ] **Step 3: Verify both packages installed**

```bash
cd /mnt/e/project/mindreaderv2 && node -e "import OpenAI from 'openai'; console.log('openai OK');" 2>/dev/null || echo "openai FAIL"
cd /mnt/e/project/mindreaderv2/packages/mindreader-ui/ui && node -e "import('graphology-layout-forceatlas2').then(() => console.log('fa2 OK')).catch(() => console.log('fa2 FAIL'))"
```

Expected: Both print OK.

- [ ] **Step 4: Commit**

```bash
cd /mnt/e/project/mindreaderv2
git add packages/mindreader-ui/package.json packages/mindreader-ui/package-lock.json packages/mindreader-ui/ui/package.json packages/mindreader-ui/ui/package-lock.json
git commit -m "feat(evolve): add openai and graphology-layout-forceatlas2 dependencies"
```

---

### Task 3: Backend — SSE Streaming Endpoint

**Files:**
- Modify: `packages/mindreader-ui/server/server.js` (add after the `/api/entity/:name/summarize` endpoint at ~line 389)

**Context:** The existing summarize endpoint (lines 271-389) uses a Python subprocess for LLM calls. The evolve endpoint uses the `openai` npm package directly for streaming support. It follows the same Neo4j query pattern for fetching entity context.

- [ ] **Step 1: Add the `POST /api/entity/:name/evolve` SSE endpoint**

Add this code after line 389 (after the closing of the summarize endpoint) in `packages/mindreader-ui/server/server.js`:

```js
  // ========================================================================
  // Node Evolve — SSE streaming endpoint
  // ========================================================================

  /**
   * POST /api/entity/:name/evolve — Evolve an entity via LLM with web search
   * Streams discovered entities/relationships as SSE events.
   * Request body: { focusQuestion?: string }
   */
  app.post("/api/entity/:name/evolve", async (req, res) => {
    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendSSE = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let aborted = false;
    let streamController = null;
    req.on("close", () => {
      aborted = true;
      if (streamController) {
        try { streamController.abort(); } catch {}
      }
    });

    try {
      const { name } = req.params;
      const { focusQuestion } = req.body || {};

      // Fetch entity + connections (same pattern as /summarize)
      const results = await query(driver,
        `MATCH (start:Entity)
         WHERE toLower(start.name) = toLower($name)
         OPTIONAL MATCH (start)-[r:RELATES_TO]-(other:Entity)
         WHERE r.expired_at IS NULL
         WITH start,
              collect(DISTINCT {name: other.name, summary: other.summary, category: COALESCE(other.group_id, other.category, '')}) AS connected,
              collect(DISTINCT {relation: r.name, fact: r.fact, otherName: other.name}) AS relFacts
         RETURN start, connected[0..30] AS connected, relFacts[0..50] AS relFacts`,
        { name }
      );

      if (!results.length) {
        sendSSE("error", { message: "Entity not found" });
        return res.end();
      }

      const startNode = results[0].start?.properties || {};
      const connected = results[0].connected || [];
      const relFacts = results[0].relFacts || [];

      // Build prompt
      const entityInfo = [
        `Name: ${startNode.name || name}`,
        `Category: ${startNode.group_id || startNode.category || "unknown"}`,
        startNode.summary ? `Summary: ${startNode.summary}` : null,
        startNode.tags?.length ? `Tags: ${startNode.tags.join(", ")}` : null,
      ].filter(Boolean).join("\n");

      const connectionsInfo = relFacts.map(r =>
        `- ${r.fact || `${startNode.name} [${r.relation}] ${r.otherName}`}`
      ).join("\n") || "None";

      const connectedEntities = connected.slice(0, 20).map(n =>
        `- ${n.name} (${n.category}): ${(n.summary || "").slice(0, 100)}`
      ).join("\n") || "None";

      const taskSection = focusQuestion
        ? `Research focus: ${focusQuestion}`
        : "Research this entity broadly. Discover important facts, related people, organizations, events, locations, and other entities.";

      const llmPrompt = `You are a knowledge graph researcher. Your task is to research an entity and discover new related entities and relationships.

## Target Entity
${entityInfo}

## Known Connections
${connectionsInfo}

## Connected Entities
${connectedEntities}

## Task
${taskSection}

Search the web for current information about this entity. Then output your discoveries in this exact format:

For each new entity you discover, output on its own line:
[ENTITY] {"name": "Entity Name", "category": "person|organization|project|location|event|concept|tool|other", "summary": "One sentence description", "tags": ["tag1", "tag2"]}

For each relationship between entities, output on its own line:
[REL] {"source": "Source Entity", "target": "Target Entity", "label": "short_label", "fact": "Describes the relationship in a full sentence"}

The "source" is the entity performing the action, "target" is the entity being acted upon.

You may include reasoning text between these lines. Aim for 3-10 entities and their relationships. Do not rediscover entities that are already in the Known Connections section. Entity names should be proper nouns or specific names, not generic descriptions.`;

      // Call LLM with streaming via openai npm package
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: config.llmApiKey,
        baseURL: config.llmBaseUrl,
      });

      const evolveModel = config.llmEvolveModel || config.llmModel;
      const createParams = {
        model: evolveModel,
        messages: [{ role: "user", content: llmPrompt }],
        temperature: 0.5,
        max_tokens: 2000,
        stream: true,
      };

      // Dashscope/Qwen workaround
      if (config.llmBaseUrl && config.llmBaseUrl.includes("dashscope")) {
        createParams.extra_body = { enable_thinking: false };
      }

      const abortCtrl = new AbortController();
      streamController = abortCtrl;

      const stream = await client.chat.completions.create(createParams, {
        signal: abortCtrl.signal,
      });

      // Streaming parser state
      let lineBuffer = "";
      let entityCount = 0;
      let relationshipCount = 0;
      let totalUsage = null;

      for await (const chunk of stream) {
        if (aborted) break;

        // Capture usage from final chunk if available
        if (chunk.usage) {
          totalUsage = {
            promptTokens: chunk.usage.prompt_tokens || 0,
            completionTokens: chunk.usage.completion_tokens || 0,
            totalTokens: chunk.usage.total_tokens || 0,
          };
        }

        const text = chunk.choices?.[0]?.delta?.content || "";
        if (!text) continue;

        // Send raw text for live display
        sendSSE("token", { text });

        // Buffer and parse line-by-line
        lineBuffer += text;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop(); // keep incomplete last line in buffer

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith("[ENTITY]")) {
            try {
              const json = trimmed.slice("[ENTITY]".length).trim();
              const entity = JSON.parse(json);
              entityCount++;
              sendSSE("entity", entity);
            } catch { /* malformed — already sent as token text */ }
          } else if (trimmed.startsWith("[REL]")) {
            try {
              const json = trimmed.slice("[REL]".length).trim();
              const rel = JSON.parse(json);
              relationshipCount++;
              sendSSE("relationship", rel);
            } catch { /* malformed — already sent as token text */ }
          }
        }
      }

      // Process any remaining buffer
      if (lineBuffer.trim()) {
        const trimmed = lineBuffer.trim();
        if (trimmed.startsWith("[ENTITY]")) {
          try {
            const json = trimmed.slice("[ENTITY]".length).trim();
            const entity = JSON.parse(json);
            entityCount++;
            sendSSE("entity", entity);
          } catch {}
        } else if (trimmed.startsWith("[REL]")) {
          try {
            const json = trimmed.slice("[REL]".length).trim();
            const rel = JSON.parse(json);
            relationshipCount++;
            sendSSE("relationship", rel);
          } catch {}
        }
      }

      // Log token usage
      if (totalUsage) {
        try {
          await query(driver,
            `CREATE (t:TokenUsage {
               date: date(),
               model: $model,
               promptTokens: $promptTokens,
               completionTokens: $completionTokens,
               totalTokens: $totalTokens,
               operation: "evolve",
               timestamp: datetime()
             })`,
            {
              model: evolveModel,
              promptTokens: neo4j.int(totalUsage.promptTokens),
              completionTokens: neo4j.int(totalUsage.completionTokens),
              totalTokens: neo4j.int(totalUsage.totalTokens),
            }
          );
        } catch (tokenErr) {
          logger?.warn?.(`Failed to log evolve token usage: ${tokenErr.message}`);
        }
      }

      // Send done event
      sendSSE("done", {
        totalTokens: totalUsage?.totalTokens || 0,
        promptTokens: totalUsage?.promptTokens || 0,
        completionTokens: totalUsage?.completionTokens || 0,
        entityCount,
        relationshipCount,
      });

      res.end();
    } catch (err) {
      if (!aborted) {
        logger?.error?.(`Node evolve error: ${err.message}`);
        try { sendSSE("error", { message: err.message }); } catch {}
      }
      res.end();
    }
  });
```

- [ ] **Step 2: Test the SSE endpoint with curl**

Start the server, then test:

```bash
curl -X POST http://localhost:18900/api/entity/test-entity/evolve \
  -H "Content-Type: application/json" \
  -d '{}' \
  --no-buffer
```

Expected: Either a 404 error SSE event (if "test-entity" doesn't exist) or streaming SSE events. Verify the response has `Content-Type: text/event-stream` and events start with `event:` and `data:`.

- [ ] **Step 3: Commit**

```bash
git add packages/mindreader-ui/server/server.js
git commit -m "feat(evolve): add POST /api/entity/:name/evolve SSE streaming endpoint"
```

---

### Task 4: Backend — Save Endpoint

**Files:**
- Modify: `packages/mindreader-ui/server/server.js` (add after the evolve SSE endpoint)

- [ ] **Step 1: Add the `POST /api/entity/:name/evolve/save` endpoint**

Add this code immediately after the evolve SSE endpoint:

```js
  /**
   * POST /api/entity/:name/evolve/save — Save evolved entities and relationships
   * Request body: { entities: [...], relationships: [...] }
   */
  app.post("/api/entity/:name/evolve/save", async (req, res) => {
    try {
      const { name: targetName } = req.params;
      const { entities = [], relationships = [] } = req.body;

      if (!entities.length && !relationships.length) {
        return res.status(400).json({ error: "No entities or relationships to save" });
      }

      let entitiesCreated = 0;
      let entitiesSkipped = 0;
      const skippedNames = [];

      // Create entities
      for (const ent of entities) {
        if (!ent.name) continue;

        // Check if already exists (case-insensitive)
        const existing = await query(driver,
          `MATCH (e:Entity) WHERE toLower(e.name) = toLower($name) RETURN e.name AS name LIMIT 1`,
          { name: ent.name }
        );

        if (existing.length > 0) {
          entitiesSkipped++;
          skippedNames.push(ent.name);
          continue;
        }

        // Append source tags
        const tags = [
          ...(Array.isArray(ent.tags) ? ent.tags : []),
          "source:evolve",
          `evolved-from:${targetName.toLowerCase()}`,
        ];
        const normalizedTags = [...new Set(tags.map(t => t.toLowerCase().trim()))].sort();

        await query(driver,
          `CREATE (e:Entity {
             name: $name,
             summary: $summary,
             group_id: $category,
             tags: $tags,
             created_at: datetime(),
             uuid: randomUUID()
           })`,
          {
            name: ent.name,
            summary: ent.summary || "",
            category: ent.category || "",
            tags: normalizedTags,
          }
        );
        entitiesCreated++;
      }

      // Create relationships
      let relationshipsCreated = 0;
      for (const rel of relationships) {
        if (!rel.source || !rel.target || !rel.fact) continue;

        // Both source and target must exist in the graph
        const endpoints = await query(driver,
          `OPTIONAL MATCH (s:Entity) WHERE toLower(s.name) = toLower($source)
           OPTIONAL MATCH (t:Entity) WHERE toLower(t.name) = toLower($target)
           RETURN s IS NOT NULL AS sourceExists, t IS NOT NULL AS targetExists`,
          { source: rel.source, target: rel.target }
        );

        if (!endpoints.length || !endpoints[0].sourceExists || !endpoints[0].targetExists) {
          continue;
        }

        await query(driver,
          `MATCH (s:Entity) WHERE toLower(s.name) = toLower($source)
           MATCH (t:Entity) WHERE toLower(t.name) = toLower($target)
           CREATE (s)-[:RELATES_TO {
             name: $label,
             fact: $fact,
             created_at: datetime(),
             uuid: randomUUID()
           }]->(t)`,
          {
            source: rel.source,
            target: rel.target,
            label: rel.label || "related_to",
            fact: rel.fact,
          }
        );
        relationshipsCreated++;
      }

      res.json({
        entitiesCreated,
        entitiesSkipped,
        relationshipsCreated,
        skippedNames,
      });
    } catch (err) {
      logger?.error?.(`Node evolve save error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 2: Test the save endpoint**

```bash
curl -X POST http://localhost:18900/api/entity/TestEntity/evolve/save \
  -H "Content-Type: application/json" \
  -d '{"entities": [{"name": "Test Evolved Entity", "category": "concept", "summary": "A test", "tags": ["test"]}], "relationships": []}'
```

Expected: `{"entitiesCreated":1,"entitiesSkipped":0,"relationshipsCreated":0,"skippedNames":[]}`

Then clean up the test entity:

```bash
curl -X DELETE http://localhost:18900/api/entity/Test%20Evolved%20Entity
```

- [ ] **Step 3: Commit**

```bash
git add packages/mindreader-ui/server/server.js
git commit -m "feat(evolve): add POST /api/entity/:name/evolve/save endpoint"
```

---

### Task 5: Frontend — EvolveModal Component

**Files:**
- Create: `packages/mindreader-ui/ui/src/components/EvolveModal.jsx`

This is the largest task. The modal has three phases: Input, Streaming, Review.

- [ ] **Step 1: Create EvolveModal.jsx**

Create `packages/mindreader-ui/ui/src/components/EvolveModal.jsx` with the following content:

```jsx
import { useState, useRef, useEffect, useCallback } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { CATEGORY_COLORS } from "../constants";

// ForceAtlas2 — use synchronous layout since we have few nodes
let forceAtlas2Layout = null;
import("graphology-layout-forceatlas2").then(mod => {
  forceAtlas2Layout = mod.default || mod;
}).catch(() => {
  console.warn("graphology-layout-forceatlas2 not available, using random layout");
});

function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.other || "#6688aa";
}

export default function EvolveModal({ entityName, onClose, onSaved }) {
  const [phase, setPhase] = useState("input"); // "input" | "streaming" | "review"
  const [focusQuestion, setFocusQuestion] = useState("");
  // Feed items: interleaved array of { type: "text"|"entity"|"relationship", data: ... }
  const [feedItems, setFeedItems] = useState([]);
  const [entities, setEntities] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [checkedEntities, setCheckedEntities] = useState(new Set());
  const [checkedRels, setCheckedRels] = useState(new Set());
  const [tokenInfo, setTokenInfo] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  const abortRef = useRef(null);
  const feedRef = useRef(null);
  const graphContainerRef = useRef(null);
  const sigmaRef = useRef(null);
  const graphRef = useRef(null);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [feedItems]);

  // Initialize mini-graph
  useEffect(() => {
    if (!graphContainerRef.current) return;

    const graph = new Graph();
    graphRef.current = graph;

    // Add target node at center
    graph.addNode(entityName, {
      label: entityName,
      x: 0,
      y: 0,
      size: 14,
      color: "#4affff",
      type: "circle",
    });

    const sigma = new Sigma(graph, graphContainerRef.current, {
      renderLabels: true,
      labelSize: 11,
      labelColor: { color: "#ffffff" },
      labelFont: "Inter, system-ui, sans-serif",
      defaultEdgeType: "line",
      defaultEdgeColor: "#ffffff33",
      enableEdgeEvents: false,
      allowInvalidContainer: true,
    });
    sigmaRef.current = sigma;

    return () => {
      sigma.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [entityName]);

  // Apply layout when new nodes are added
  const applyLayout = useCallback(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma || graph.order < 2) return;

    if (forceAtlas2Layout) {
      try {
        forceAtlas2Layout.assign(graph, {
          iterations: 50,
          settings: {
            gravity: 1,
            scalingRatio: 3,
            barnesHutOptimize: false,
          },
        });
      } catch {
        // Fallback: random layout around center
        randomLayout(graph);
      }
    } else {
      randomLayout(graph);
    }
    sigma.refresh();
  }, []);

  function randomLayout(graph) {
    let i = 0;
    graph.forEachNode((node, attrs) => {
      if (node === entityName) return; // keep target at center
      const angle = (i / (graph.order - 1)) * 2 * Math.PI;
      const radius = 2 + Math.random();
      graph.setNodeAttribute(node, "x", Math.cos(angle) * radius);
      graph.setNodeAttribute(node, "y", Math.sin(angle) * radius);
      i++;
    });
  }

  // Add entity to mini-graph
  const addEntityToGraph = useCallback((ent) => {
    const graph = graphRef.current;
    if (!graph || graph.hasNode(ent.name)) return;

    const angle = Math.random() * 2 * Math.PI;
    const radius = 2 + Math.random();
    graph.addNode(ent.name, {
      label: ent.name,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      size: 8,
      color: getCategoryColor(ent.category),
    });
    applyLayout();
  }, [applyLayout, entityName]);

  // Add relationship to mini-graph
  const addRelToGraph = useCallback((rel) => {
    const graph = graphRef.current;
    if (!graph) return;
    const srcExists = graph.hasNode(rel.source);
    const tgtExists = graph.hasNode(rel.target);
    if (!srcExists || !tgtExists) return;

    const edgeId = `${rel.source}-${rel.target}-${rel.label}`;
    if (graph.hasEdge(edgeId)) return;

    try {
      graph.addEdgeWithKey(edgeId, rel.source, rel.target, {
        label: rel.label || "",
        size: 1.5,
        color: "rgba(255,255,255,0.3)",
      });
      sigmaRef.current?.refresh();
    } catch { /* edge may already exist */ }
  }, []);

  // Start evolution
  const handleEvolve = useCallback(async () => {
    setPhase("streaming");
    setFeedItems([]);
    setEntities([]);
    setRelationships([]);
    setCheckedEntities(new Set());
    setCheckedRels(new Set());
    setTokenInfo(null);
    setError(null);

    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;

    try {
      const res = await fetch(`/api/entity/${encodeURIComponent(entityName)}/evolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focusQuestion: focusQuestion.trim() || undefined }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      const discoveredEntities = [];
      const discoveredRels = [];
      const entityChecks = new Set();
      const relChecks = new Set();
      const items = [];
      let pendingText = "";

      const flushText = () => {
        if (pendingText.trim()) {
          items.push({ type: "text", data: pendingText });
          setFeedItems([...items]);
        }
        pendingText = "";
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const messages = sseBuffer.split("\n\n");
        sseBuffer = messages.pop(); // keep incomplete message

        for (const msg of messages) {
          const eventMatch = msg.match(/^event:\s*(.+)$/m);
          const dataMatch = msg.match(/^data:\s*(.+)$/m);
          if (!eventMatch || !dataMatch) continue;

          const event = eventMatch[1].trim();
          let data;
          try { data = JSON.parse(dataMatch[1]); } catch { continue; }

          switch (event) {
            case "token":
              pendingText += data.text;
              // Update the last text item in real-time for smooth streaming
              if (items.length > 0 && items[items.length - 1].type === "text") {
                items[items.length - 1].data += data.text;
              } else {
                items.push({ type: "text", data: data.text });
              }
              setFeedItems([...items]);
              break;
            case "entity": {
              flushText();
              const idx = discoveredEntities.length;
              discoveredEntities.push(data);
              entityChecks.add(idx);
              items.push({ type: "entity", data, idx });
              setFeedItems([...items]);
              setEntities([...discoveredEntities]);
              setCheckedEntities(new Set(entityChecks));
              addEntityToGraph(data);
              break;
            }
            case "relationship": {
              flushText();
              const idx = discoveredRels.length;
              discoveredRels.push(data);
              relChecks.add(idx);
              items.push({ type: "relationship", data, idx });
              setFeedItems([...items]);
              setRelationships([...discoveredRels]);
              setCheckedRels(new Set(relChecks));
              addRelToGraph(data);
              break;
            }
            case "done":
              setTokenInfo(data);
              break;
            case "error":
              setError(data.message);
              break;
          }
        }
      }

      setPhase("review");
    } catch (err) {
      if (err.name === "AbortError") {
        // User stopped — show partial results for review
        setPhase("review");
      } else {
        setError(err.message);
        setPhase("review");
      }
    }
  }, [entityName, focusQuestion, addEntityToGraph, addRelToGraph]);

  // Stop streaming
  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  // Toggle checks — also update mini-graph node appearance
  const toggleEntity = (idx) => {
    setCheckedEntities(prev => {
      const next = new Set(prev);
      const wasChecked = next.has(idx);
      wasChecked ? next.delete(idx) : next.add(idx);

      // Grey out / restore node in mini-graph
      const graph = graphRef.current;
      const ent = entities[idx];
      if (graph && ent && graph.hasNode(ent.name)) {
        graph.setNodeAttribute(ent.name, "color", wasChecked ? "#444" : getCategoryColor(ent.category));
        sigmaRef.current?.refresh();
      }

      return next;
    });
  };

  const toggleRel = (idx) => {
    setCheckedRels(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  // Save
  const handleSave = useCallback(async (saveAll = false) => {
    setSaving(true);
    setError(null);

    const selectedEntities = saveAll
      ? entities
      : entities.filter((_, i) => checkedEntities.has(i));
    const selectedRels = saveAll
      ? relationships
      : relationships.filter((_, i) => checkedRels.has(i));

    try {
      const res = await fetch(`/api/entity/${encodeURIComponent(entityName)}/evolve/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entities: selectedEntities,
          relationships: selectedRels,
        }),
      });

      if (!res.ok) throw new Error("Save failed");
      const result = await res.json();
      setSaveResult(result);

      // Close after brief delay to show result
      setTimeout(() => {
        if (onSaved) onSaved(result);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }, [entities, relationships, checkedEntities, checkedRels, entityName, onSaved, onClose]);

  const totalChecked = checkedEntities.size + checkedRels.size;
  const totalItems = entities.length + relationships.length;
  const allChecked = totalChecked === totalItems;

  return (
    <div className="evolve-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && phase !== "streaming") onClose(); }}>
      <div className="evolve-modal">
        {/* Header */}
        <div className="evolve-modal-header">
          <span className="evolve-modal-title">Evolve: {entityName}</span>
          <button
            className="evolve-modal-close"
            onClick={phase === "streaming" ? handleStop : onClose}
          >
            {phase === "streaming" ? "Stop" : "✕"}
          </button>
        </div>

        {/* Main content */}
        <div className="evolve-modal-body">
          {/* Left: Mini-graph */}
          <div className="evolve-modal-graph">
            <div ref={graphContainerRef} style={{ width: "100%", height: "100%" }} />
          </div>

          {/* Right: Stream feed + cards */}
          <div className="evolve-modal-feed" ref={feedRef}>
            {phase === "input" && (
              <div className="evolve-input-section">
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                  Evolve will search the web to discover new entities and relationships connected to <strong style={{ color: "var(--text-primary)" }}>{entityName}</strong>.
                </div>
                <input
                  type="text"
                  className="evolve-focus-input"
                  placeholder="Leave blank for broad research, or type a focus question..."
                  value={focusQuestion}
                  onChange={(e) => setFocusQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleEvolve(); }}
                  autoFocus
                />
                <button className="evolve-start-btn" onClick={handleEvolve}>
                  Evolve
                </button>
              </div>
            )}

            {(phase === "streaming" || phase === "review") && (
              <>
                {/* Interleaved feed: text blocks, entity cards, relationship cards */}
                {feedItems.map((item, fi) => {
                  if (item.type === "text") {
                    return (
                      <div key={`t-${fi}`} className="evolve-stream-text">
                        {item.data}
                      </div>
                    );
                  }
                  if (item.type === "entity") {
                    const ent = item.data;
                    const idx = item.idx;
                    return (
                      <div key={`e-${idx}`} className={`evolve-card evolve-card-entity ${!checkedEntities.has(idx) ? "evolve-card-unchecked" : ""}`}>
                        <label className="evolve-card-check">
                          <input
                            type="checkbox"
                            checked={checkedEntities.has(idx)}
                            onChange={() => toggleEntity(idx)}
                            disabled={phase === "streaming"}
                          />
                        </label>
                        <div className="evolve-card-content">
                          <div className="evolve-card-name">
                            <span className="evolve-card-dot" style={{ background: getCategoryColor(ent.category) }} />
                            {ent.name}
                          </div>
                          <div className="evolve-card-category">{ent.category}</div>
                          {ent.summary && <div className="evolve-card-summary">{ent.summary}</div>}
                          {ent.tags?.length > 0 && (
                            <div className="evolve-card-tags">
                              {ent.tags.map(t => <span key={t} className="tag-pill tag-pill--small">{t}</span>)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (item.type === "relationship") {
                    const rel = item.data;
                    const idx = item.idx;
                    return (
                      <div key={`r-${idx}`} className={`evolve-card evolve-card-rel ${!checkedRels.has(idx) ? "evolve-card-unchecked" : ""}`}>
                        <label className="evolve-card-check">
                          <input
                            type="checkbox"
                            checked={checkedRels.has(idx)}
                            onChange={() => toggleRel(idx)}
                            disabled={phase === "streaming"}
                          />
                        </label>
                        <div className="evolve-card-content">
                          <div className="evolve-card-name">
                            {rel.source} <span style={{ color: "var(--accent-cyan)", fontSize: 11 }}>—{rel.label}→</span> {rel.target}
                          </div>
                          {rel.fact && <div className="evolve-card-summary">{rel.fact}</div>}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}

                {phase === "streaming" && entities.length === 0 && !error && (
                  <div className="evolve-streaming-indicator">
                    <div className="loading-spinner" style={{ width: 16, height: 16 }} />
                    <span>Researching...</span>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="evolve-error">
                {error}
                <button onClick={handleEvolve} className="evolve-retry-btn">Retry</button>
              </div>
            )}

            {saveResult && (
              <div className="evolve-save-result">
                Created {saveResult.entitiesCreated} entities, {saveResult.relationshipsCreated} relationships
                {saveResult.entitiesSkipped > 0 && ` (${saveResult.entitiesSkipped} skipped)`}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="evolve-modal-footer">
          <div className="evolve-footer-stats">
            {tokenInfo && <span>Tokens: {tokenInfo.totalTokens.toLocaleString()}</span>}
            <span>Entities: {entities.length}</span>
            <span>Rels: {relationships.length}</span>
          </div>

          <div className="evolve-footer-actions">
            {phase === "review" && entities.length + relationships.length > 0 && !saveResult && (
              <>
                <button
                  className="evolve-save-all-btn"
                  onClick={() => handleSave(true)}
                  disabled={saving}
                >
                  {saving ? "Saving..." : `Save All (${totalItems})`}
                </button>
                {!allChecked && (
                  <button
                    className="evolve-save-selected-btn"
                    onClick={() => handleSave(false)}
                    disabled={saving || totalChecked === 0}
                  >
                    Save Selected ({totalChecked}/{totalItems})
                  </button>
                )}
                <button className="evolve-cancel-btn" onClick={onClose} disabled={saving}>
                  Cancel
                </button>
              </>
            )}
            {phase === "review" && entities.length + relationships.length === 0 && !error && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                No entities or relationships discovered.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file has no syntax errors**

```bash
cd /mnt/e/project/mindreaderv2/packages/mindreader-ui/ui && node -e "import('./src/components/EvolveModal.jsx')" 2>&1 || echo "Note: import errors are expected (JSX needs transpiling), check for syntax errors only"
```

Alternatively, just run the full Vite build after Task 7 wires it in — that's the real validation.

- [ ] **Step 3: Commit**

```bash
git add packages/mindreader-ui/ui/src/components/EvolveModal.jsx
git commit -m "feat(evolve): add EvolveModal component with mini-graph and stream feed"
```

---

### Task 6: Frontend — CSS Styles for EvolveModal

**Files:**
- Modify: `packages/mindreader-ui/ui/src/index.css`

- [ ] **Step 1: Add evolve modal CSS**

Append to the end of `packages/mindreader-ui/ui/src/index.css`:

```css
/* ===== Evolve Modal ===== */
.evolve-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.evolve-modal {
  width: 80vw;
  height: 80vh;
  max-width: 1200px;
  max-height: 800px;
  background: var(--bg-primary);
  border: 1px solid rgba(74, 255, 255, 0.2);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.evolve-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.evolve-modal-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--accent-cyan);
}

.evolve-modal-close {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 6px;
  transition: all 0.2s;
}

.evolve-modal-close:hover {
  border-color: rgba(255, 255, 255, 0.3);
  color: var(--text-primary);
}

.evolve-modal-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.evolve-modal-graph {
  width: 55%;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
  background: var(--bg-secondary);
}

.evolve-modal-feed {
  width: 45%;
  overflow-y: auto;
  padding: 16px;
}

.evolve-input-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 20px;
}

.evolve-focus-input {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-secondary);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.evolve-focus-input:focus {
  border-color: var(--accent-cyan);
}

.evolve-focus-input::placeholder {
  color: var(--text-secondary);
}

.evolve-start-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, rgba(74, 255, 255, 0.15), rgba(74, 255, 158, 0.15));
  border: 1px solid rgba(74, 255, 255, 0.3);
  border-radius: 8px;
  color: var(--accent-cyan);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.evolve-start-btn:hover {
  background: linear-gradient(135deg, rgba(74, 255, 255, 0.25), rgba(74, 255, 158, 0.25));
  border-color: rgba(74, 255, 255, 0.5);
}

.evolve-stream-text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 12px;
  max-height: 150px;
  overflow-y: auto;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  line-height: 1.5;
}

.evolve-card {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: rgba(74, 255, 255, 0.05);
  border: 1px solid rgba(74, 255, 255, 0.12);
  border-radius: 8px;
  transition: all 0.2s;
  animation: evolve-card-in 0.3s ease-out;
}

@keyframes evolve-card-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.evolve-card-unchecked {
  opacity: 0.4;
  background: transparent;
  border-color: rgba(255, 255, 255, 0.05);
}

.evolve-card-check {
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
}

.evolve-card-check input[type="checkbox"] {
  accent-color: var(--accent-cyan);
  cursor: pointer;
}

.evolve-card-content {
  flex: 1;
  min-width: 0;
}

.evolve-card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.evolve-card-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.evolve-card-category {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.evolve-card-summary {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

.evolve-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.evolve-streaming-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--text-secondary);
  font-size: 13px;
}

.evolve-error {
  padding: 12px;
  background: rgba(255, 74, 74, 0.1);
  border: 1px solid rgba(255, 74, 74, 0.3);
  border-radius: 8px;
  color: var(--accent-red);
  font-size: 13px;
  margin-top: 8px;
}

.evolve-retry-btn {
  margin-left: 8px;
  background: none;
  border: none;
  color: var(--accent-blue);
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline;
}

.evolve-save-result {
  padding: 12px;
  background: rgba(74, 255, 158, 0.1);
  border: 1px solid rgba(74, 255, 158, 0.3);
  border-radius: 8px;
  color: var(--accent-green);
  font-size: 13px;
  margin-top: 8px;
  text-align: center;
}

.evolve-modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.evolve-footer-stats {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.evolve-footer-actions {
  display: flex;
  gap: 8px;
}

.evolve-save-all-btn {
  padding: 8px 16px;
  background: linear-gradient(135deg, rgba(74, 255, 255, 0.15), rgba(74, 255, 158, 0.15));
  border: 1px solid rgba(74, 255, 255, 0.3);
  border-radius: 8px;
  color: var(--accent-cyan);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.evolve-save-all-btn:hover {
  background: linear-gradient(135deg, rgba(74, 255, 255, 0.25), rgba(74, 255, 158, 0.25));
}

.evolve-save-all-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.evolve-save-selected-btn {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.evolve-save-selected-btn:hover {
  border-color: rgba(255, 255, 255, 0.3);
  color: var(--text-primary);
}

.evolve-save-selected-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.evolve-cancel-btn {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.evolve-cancel-btn:hover {
  border-color: rgba(255, 255, 255, 0.2);
  color: var(--text-primary);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/mindreader-ui/ui/src/index.css
git commit -m "feat(evolve): add CSS styles for evolve modal"
```

---

### Task 7: Frontend — Wire Evolve Button in DetailPanel

**Files:**
- Modify: `packages/mindreader-ui/ui/src/components/DetailPanel.jsx`

- [ ] **Step 1: Import EvolveModal at the top of DetailPanel.jsx**

Add after the existing imports (after line 3):

```jsx
import EvolveModal from "./EvolveModal";
```

- [ ] **Step 2: Add evolve modal state to the DetailPanel component**

In the `DetailPanel` function body (after line 74 `const [activeAction, setActiveAction] = useState(null);`), add:

```jsx
  const [showEvolve, setShowEvolve] = useState(false);
```

Also reset it when entity changes. After the existing `activeAction` state, add a useEffect:

```jsx
  // Reset evolve modal when entity changes
  useEffect(() => {
    setShowEvolve(false);
    setActiveAction(null);
  }, [entity?.name]);
```

- [ ] **Step 3: Add the Evolve button to the action bar**

In the action button row (around line 146), add a new button BEFORE the existing Link/Merge/Delete buttons. The button row starts with `<div style={{ marginTop: 16, display: "flex", gap: 8 }}>`. Add the Evolve button as the first child:

```jsx
        <button
          onClick={() => setShowEvolve(true)}
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: "pointer", transition: "all 0.2s",
            background: "linear-gradient(135deg, rgba(74, 255, 255, 0.12), rgba(74, 255, 158, 0.12))",
            border: "1px solid rgba(74, 255, 255, 0.25)",
            color: "var(--accent-cyan)",
          }}
        >Evolve</button>
```

- [ ] **Step 4: Render the EvolveModal**

At the very end of the DetailPanel return, just before the closing `</div>` of the detail-panel (line 199), add:

```jsx
      {showEvolve && (
        <EvolveModal
          entityName={entity.name}
          onClose={() => setShowEvolve(false)}
          onSaved={() => {
            setShowEvolve(false);
            if (onRefresh) onRefresh();
          }}
        />
      )}
```

- [ ] **Step 5: Test the integration**

```bash
cd /mnt/e/project/mindreaderv2/packages/mindreader-ui/ui && npx vite build 2>&1 | tail -5
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/mindreader-ui/ui/src/components/DetailPanel.jsx
git commit -m "feat(evolve): wire Evolve button and modal in DetailPanel"
```

---

### Task 8: Integration Testing

**Files:** None (testing only)

- [ ] **Step 1: Start the server**

```bash
cd /mnt/e/project/mindreaderv2 && npm start
```

- [ ] **Step 2: Open the UI and test the evolve flow**

Open `http://localhost:18900` in the browser. Navigate to the Graph tab, click on any entity to open the detail panel. Verify:

1. The "Evolve" button appears in the action bar (cyan gradient)
2. Clicking it opens a large modal with the entity name in the header
3. The left side shows a mini-graph with the target node
4. The right side shows the focus question input and "Evolve" button
5. Clicking "Evolve" starts streaming — text appears in the feed
6. Entity and relationship cards appear as they're extracted
7. New nodes appear in the mini-graph
8. After streaming completes, "Save All" and "Save Selected" buttons appear
9. Unchecking items greys them out
10. Clicking "Save All" saves entities/relationships and closes the modal
11. The main graph refreshes to show new nodes

- [ ] **Step 3: Test the stop functionality**

1. Click Evolve on an entity
2. While streaming, click "Stop"
3. Verify: streaming stops, partial results shown for review
4. Verify: you can still save partial results

- [ ] **Step 4: Test focused question**

1. Click Evolve on an entity
2. Type a focus question (e.g., "What projects are they involved in?")
3. Click Evolve
4. Verify: the LLM response is focused on the question topic

- [ ] **Step 5: Verify token tracking**

After completing at least one evolution, go to the Tokens tab and verify an entry with operation "evolve" appears.

- [ ] **Step 6: Verify source tags**

After saving evolved entities, search for `source:evolve` in the search bar. Verify the evolved entities appear. Click one and check its tags include `source:evolve` and `evolved-from:<entity-name>`.
