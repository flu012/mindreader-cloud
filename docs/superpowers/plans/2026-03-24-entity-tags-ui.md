# Entity Tags UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tag editing to the entity detail panel, extend search to match tags, consolidate graph search into the global search bar, and show tags in search results and hover tooltips.

**Architecture:** Pure frontend changes plus one backend query modification. Tags are read/written via existing `PUT /api/entity/:name` with `{ tags: [...] }`. The global search bar becomes context-aware — on Graph tab it filters Sigma nodes locally; on other tabs it queries the API. Tags are displayed as small pill badges throughout the UI.

**Tech Stack:** React (JSX), Sigma.js (graph), Express/Neo4j (backend), CSS custom properties

---

## File Structure

| File | Role | Change |
|------|------|--------|
| `packages/mindreader-ui/ui/src/index.css` | Global styles | Add tag pill CSS classes |
| `packages/mindreader-ui/server/server.js` | Backend API | Extend `/api/entities` query to search and return tags |
| `packages/mindreader-ui/ui/src/components/DetailPanel.jsx` | Entity detail | Add `TagEditor` component |
| `packages/mindreader-ui/ui/src/components/GraphView.jsx` | Graph visualization | Remove standalone search, accept `searchQuery`/`onSearchSelect` props |
| `packages/mindreader-ui/ui/src/App.jsx` | App shell | Pass search props to GraphView, handle context-aware search |
| `packages/mindreader-ui/ui/src/components/ListView.jsx` | Entity list | Show tag pills on entity cards |
| `packages/mindreader-ui/ui/src/components/HoverTooltip.jsx` | Graph tooltip | Show tags on hover |

---

### Task 1: Tag Pill CSS Styles

**Files:**
- Modify: `packages/mindreader-ui/ui/src/index.css`

Add reusable tag pill styles used across DetailPanel, ListView, HoverTooltip, and graph search dropdown.

- [ ] **Step 1: Add tag pill CSS**

Add these styles at the end of `index.css` (before the closing comment if any):

```css
/* Tag pills */
.tag-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  background: rgba(74, 255, 255, 0.12);
  border: 1px solid rgba(74, 255, 255, 0.25);
  color: var(--text-primary);
  white-space: nowrap;
}

.tag-pill--small {
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: 8px;
}

.tag-pill .tag-remove {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 10px;
  padding: 0 1px;
  line-height: 1;
  opacity: 0.6;
}

.tag-pill .tag-remove:hover {
  opacity: 1;
  color: var(--accent-red);
}

.tag-add-btn {
  background: none;
  border: 1px dashed rgba(74, 255, 255, 0.3);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 10px;
}

.tag-add-btn:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
}

.tag-add-input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(74, 255, 255, 0.3);
  color: var(--text-primary);
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 10px;
  outline: none;
  width: 100px;
}

.tag-add-input:focus {
  border-color: var(--accent-cyan);
}
```

- [ ] **Step 2: Verify styles load**

Open the MindReader UI in the browser. Open DevTools and confirm the `.tag-pill` class is available in the stylesheet. No visual changes yet since nothing uses these classes.

- [ ] **Step 3: Commit**

```bash
git add packages/mindreader-ui/ui/src/index.css
git commit -m "feat: add tag pill CSS styles"
```

---

### Task 2: Backend — Tag-Aware Entity Search

**Files:**
- Modify: `packages/mindreader-ui/server/server.js:1114-1163`

Extend `GET /api/entities` to search tags and return them in the response.

- [ ] **Step 1: Extend WHERE clause to match tags**

In `server.js`, find the `GET /api/entities` handler (~line 1126). Change the search condition from:

```js
whereClauses.push("(toLower(e.name) CONTAINS toLower($q) OR toLower(e.summary) CONTAINS toLower($q))");
```

to:

```js
whereClauses.push("(toLower(e.name) CONTAINS toLower($q) OR toLower(e.summary) CONTAINS toLower($q) OR ANY(t IN COALESCE(e.tags, []) WHERE t CONTAINS toLower($q)))");
```

- [ ] **Step 2: Add tags to RETURN clause**

In the same handler, find the `RETURN` clause (~line 1148). Change:

```
RETURN e.uuid AS uuid, e.name AS name, e.summary AS summary,
       e.created_at AS created_at, e.category AS category, e.node_type AS node_type, relCount
```

to:

```
RETURN e.uuid AS uuid, e.name AS name, e.summary AS summary,
       e.created_at AS created_at, e.category AS category, e.node_type AS node_type, e.tags AS tags, relCount
```

- [ ] **Step 3: Extend search relevance ranking**

Find the relevance `ORDER BY` (~line 1134). Change:

```js
const orderClause = q
  ? `ORDER BY
      CASE WHEN toLower(e.name) = toLower($q) THEN 0
           WHEN toLower(e.name) STARTS WITH toLower($q) THEN 1
           WHEN toLower(e.name) CONTAINS toLower($q) THEN 2
           ELSE 3 END ASC,
      relCount DESC, e.${safeSort} ${safeOrder}`
  : `ORDER BY e.${safeSort} ${safeOrder}`;
```

to:

```js
const orderClause = q
  ? `ORDER BY
      CASE WHEN toLower(e.name) = toLower($q) THEN 0
           WHEN toLower(e.name) STARTS WITH toLower($q) THEN 1
           WHEN toLower(e.name) CONTAINS toLower($q) THEN 2
           WHEN ANY(t IN COALESCE(e.tags, []) WHERE t = toLower($q)) THEN 3
           ELSE 4 END ASC,
      relCount DESC, e.${safeSort} ${safeOrder}`
  : `ORDER BY e.${safeSort} ${safeOrder}`;
```

- [ ] **Step 4: Include tags in response objects**

Find the entity mapping (~line 1156). In the object returned by `records.map()`, add `tags` after `node_type`:

```js
tags: Array.isArray(rec.tags) ? rec.tags : [],
```

- [ ] **Step 5: Test the endpoint**

Restart the server. Test with curl:

```bash
# Should return entities with tags in response
curl -s "http://localhost:3333/api/entities?q=swimmer&limit=5" | python3 -m json.tool | head -30
```

Expected: entities tagged "swimmer" appear in results even if "swimmer" isn't in their name/summary. Each entity has a `tags` array.

- [ ] **Step 6: Commit**

```bash
git add packages/mindreader-ui/server/server.js
git commit -m "feat: extend /api/entities to search and return tags"
```

---

### Task 3: TagEditor Component in Detail Panel

**Files:**
- Modify: `packages/mindreader-ui/ui/src/components/DetailPanel.jsx:1-22`

Add a `TagEditor` component and render it between NodeTypeSelector and EditableSummary.

- [ ] **Step 1: Add TagEditor component**

Add the `TagEditor` function component above the `export default function DetailPanel` in `DetailPanel.jsx`:

```jsx
function TagEditor({ tags, entityName, onTagsChanged }) {
  const [adding, setAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const saveTags = async (newTags) => {
    const normalized = [...new Set(newTags.filter(t => t.trim()).map(t => t.toLowerCase().trim()))].sort();
    try {
      const res = await fetch(`/api/entity/${encodeURIComponent(entityName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: normalized }),
      });
      if (res.ok && onTagsChanged) onTagsChanged();
    } catch (err) {
      console.error("Failed to update tags:", err);
    }
  };

  const handleAdd = () => {
    const tag = inputValue.toLowerCase().trim();
    if (!tag) return;
    const merged = [...new Set([...tags, tag])].sort();
    setInputValue("");
    saveTags(merged);
  };

  const handleRemove = (tag) => {
    saveTags(tags.filter(t => t !== tag));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
    if (e.key === "Escape") { setAdding(false); setInputValue(""); }
  };

  return (
    <div className="tag-pills" style={{ margin: "8px 0" }}>
      {tags.map(tag => (
        <span key={tag} className="tag-pill">
          {tag}
          <button className="tag-remove" onClick={() => handleRemove(tag)}>✕</button>
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          className="tag-add-input"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (!inputValue.trim()) setAdding(false); }}
          placeholder="tag name"
        />
      ) : (
        <button className="tag-add-btn" onClick={() => setAdding(true)}>+</button>
      )}
      {tags.length === 0 && !adding && (
        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: 4 }}>(no tags)</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render TagEditor in detail panel**

In the `DetailPanel` component's JSX, add the TagEditor between NodeTypeSelector (line 19) and the editable summary comment (line 21). Change:

```jsx
      <NodeTypeSelector entityName={entity.name} currentNodeType={entity.node_type || "normal"} onRefresh={onEntityUpdate || onRefresh} />

      {/* Editable summary */}
```

to:

```jsx
      <NodeTypeSelector entityName={entity.name} currentNodeType={entity.node_type || "normal"} onRefresh={onEntityUpdate || onRefresh} />

      <TagEditor tags={entity.tags || []} entityName={entity.name} onTagsChanged={onEntityUpdate || onRefresh} />

      {/* Editable summary */}
```

- [ ] **Step 3: Test in browser**

1. Open MindReader UI
2. Click any entity to open the detail panel
3. Verify tags appear as cyan pills between the node type selector and summary
4. Click `+` to add a tag — type "test-tag" and press Enter
5. Verify the pill appears
6. Click `✕` on the pill to remove it
7. Verify it disappears

- [ ] **Step 4: Commit**

```bash
git add packages/mindreader-ui/ui/src/components/DetailPanel.jsx
git commit -m "feat: add TagEditor component to entity detail panel"
```

---

### Task 4: Context-Aware Global Search Bar

**Files:**
- Modify: `packages/mindreader-ui/ui/src/components/GraphView.jsx:32-50, 215-252, 320-399`
- Modify: `packages/mindreader-ui/ui/src/App.jsx:138-139, 290-297`

Remove the standalone search from GraphView, accept search props from App, and make the global search bar context-aware.

- [ ] **Step 1: Modify GraphView to accept search props instead of internal state**

In `GraphView.jsx`, change the component signature (line 32-33) from:

```jsx
const GraphView = forwardRef(function GraphView(
  { data, colors, onNodeClick, selectedNode, onNodeHover },
  ref
) {
```

to:

```jsx
const GraphView = forwardRef(function GraphView(
  { data, colors, onNodeClick, selectedNode, onNodeHover, searchQuery: externalSearchQuery, onSearchSelect },
  ref
) {
```

- [ ] **Step 2: Replace internal search state with external props**

Remove the internal search state lines (lines 48-50):

```jsx
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
```

Replace with:

```jsx
  const [searchResults, setSearchResults] = useState([]);
```

- [ ] **Step 3: Update search filter effect**

Change the search filter effect (lines 216-227) to use the external prop:

```jsx
  // Search filter (driven by global search bar)
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !externalSearchQuery?.trim()) { setSearchResults([]); return; }
    const q = externalSearchQuery.toLowerCase();
    const results = [];
    graph.forEachNode((node, attrs) => {
      if (attrs.label && attrs.label.toLowerCase().includes(q)) {
        results.push({ id: node, label: attrs.label, category: attrs.category, color: attrs.origColor || attrs.color });
      }
    });
    setSearchResults(results.slice(0, 10));
  }, [externalSearchQuery]);
```

- [ ] **Step 4: Update handleSearchSelect to use callback**

Change `handleSearchSelect` (lines 230-252) to call the parent callback:

```jsx
  const handleSearchSelect = useCallback((nodeId) => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma || !graph.hasNode(nodeId)) return;

    const nodeAttrs = graph.getNodeAttributes(nodeId);
    highlightStateRef.current.selectedNode = nodeId;
    applyHighlight();

    // Animate camera
    const nodePosition = sigma.getNodeDisplayData(nodeId);
    if (nodePosition) {
      sigma.getCamera().animate({ x: nodePosition.x, y: nodePosition.y, ratio: 0.3 }, { duration: 500 });
    }

    if (onNodeClick) {
      onNodeClick({ name: nodeAttrs.label, id: nodeId, category: nodeAttrs.category });
    }

    // Clear global search via parent callback
    if (onSearchSelect) onSearchSelect();
  }, [applyHighlight, onNodeClick, onSearchSelect]);
```

- [ ] **Step 5: Replace the standalone search bar with a results-only dropdown**

Replace the entire return block (lines 320-399) with a version that has no search input — just the dropdown and graph canvas:

```jsx
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0a0a1a 0%, #0d1025 50%, #0a0a1a 100%)",
          cursor: "grab",
        }}
      />
      {/* Search results dropdown (driven by global search bar) */}
      {searchResults.length > 0 && (
        <div style={{
          position: "absolute", top: 12, left: "50%",
          transform: "translateX(-50%)", zIndex: 100, width: 320,
        }}>
          <div style={{
            background: "rgba(15, 15, 35, 0.85)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(74, 158, 255, 0.2)",
            borderRadius: 10,
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            maxHeight: 280, overflowY: "auto",
          }}>
            {searchResults.map((r) => {
              // Look up tags from original data
              const nodeData = data?.nodes?.find(n => n.id === r.id);
              const tags = nodeData?.tags || [];
              return (
                <div
                  key={r.id}
                  onMouseDown={(e) => { e.preventDefault(); handleSearchSelect(r.id); }}
                  style={{
                    padding: "8px 12px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: 13, color: "#d0d0e8",
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(74, 158, 255, 0.1)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color || "#6688aa", flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>
                    {r.label}
                    {tags.length > 0 && (
                      <span className="tag-pills" style={{ display: "inline-flex", marginLeft: 6, gap: 3 }}>
                        {tags.slice(0, 3).map(t => (
                          <span key={t} className="tag-pill tag-pill--small">{t}</span>
                        ))}
                        {tags.length > 3 && <span style={{ fontSize: 10, color: "#8888aa" }}>+{tags.length - 3}</span>}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, color: "#8888aa", textTransform: "uppercase", letterSpacing: 1 }}>{r.category}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
```

- [ ] **Step 6: Remove the searchInputRef**

Find and remove the `searchInputRef` declaration (should be around line 51 area):

```jsx
  const searchInputRef = useRef(null);
```

Remove this line entirely since the search input is now in the global bar.

- [ ] **Step 7: Update App.jsx to pass search props to GraphView**

In `App.jsx`, find where GraphView is rendered (~line 290). Change:

```jsx
                <GraphView
                  ref={graphRef}
                  data={filteredData}
                  colors={catColors}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  selectedNode={selectedNode}
                />
```

to:

```jsx
                <GraphView
                  ref={graphRef}
                  data={filteredData}
                  colors={catColors}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  selectedNode={selectedNode}
                  searchQuery={searchQuery}
                  onSearchSelect={() => setSearchQuery("")}
                />
```

- [ ] **Step 8: Test in browser**

1. Open MindReader UI, switch to Graph tab
2. Verify the standalone search bar is gone from the graph
3. Type in the global search bar (top right) — verify the dropdown appears centered in the graph area showing matching nodes with tag pills
4. Click a result — verify camera animates to the node and the search clears
5. Press Ctrl+K — verify the global search bar focuses
6. Switch to List tab — verify search still works as before (API-based)

- [ ] **Step 9: Commit**

```bash
git add packages/mindreader-ui/ui/src/components/GraphView.jsx packages/mindreader-ui/ui/src/App.jsx
git commit -m "feat: consolidate graph search into global search bar"
```

---

### Task 5: Tags in List View Search Results

**Files:**
- Modify: `packages/mindreader-ui/ui/src/components/ListView.jsx:105-117`

Show read-only tag pills on entity cards in the list view.

- [ ] **Step 1: Add tag pills to entity cards**

In `ListView.jsx`, find the entity card between the summary and meta sections. After the summary div (line 109) and before the `list-item-meta` div (line 110), add:

```jsx
                {entity.summary && (
                  <div className="list-item-summary">
                    {entity.summary.length > 150 ? entity.summary.slice(0, 150) + "..." : entity.summary}
                  </div>
                )}
                {entity.tags && entity.tags.length > 0 && (
                  <div className="tag-pills" style={{ marginTop: 4 }}>
                    {entity.tags.map(tag => (
                      <span key={tag} className="tag-pill tag-pill--small">{tag}</span>
                    ))}
                  </div>
                )}
                <div className="list-item-meta">
```

This replaces the existing summary + meta block. Make sure to preserve the existing summary div and add the tags block between them.

- [ ] **Step 2: Test in browser**

1. Open MindReader UI on the List tab
2. Verify entities with tags show small cyan pills below the summary
3. Entities without tags should show no extra row
4. Search for "swimmer" — verify tagged entities appear in results

- [ ] **Step 3: Commit**

```bash
git add packages/mindreader-ui/ui/src/components/ListView.jsx
git commit -m "feat: show tag pills in list view entity cards"
```

---

### Task 6: Tags in Graph Hover Tooltip

**Files:**
- Modify: `packages/mindreader-ui/ui/src/components/HoverTooltip.jsx`
- Modify: `packages/mindreader-ui/ui/src/components/GraphView.jsx` (hover handler)
- Modify: `packages/mindreader-ui/ui/src/App.jsx` (hover handler)

The hover tooltip currently receives `{ name, category, id }` from Sigma node attributes. Tags are not stored in Sigma. We need to look up tags from the original graph data and pass them through.

- [ ] **Step 1: Enrich hover data in App.jsx**

In `App.jsx`, change the `handleNodeHover` callback (~line 107) to look up tags from `graphData`:

```jsx
  const handleNodeHover = useCallback((node) => {
    if (!node) { setHoveredNode(null); return; }
    // Enrich with tags from original graph data
    const full = graphData.nodes.find(n => n.id === node.id);
    setHoveredNode({ ...node, tags: full?.tags || [], summary: full?.summary });
  }, [graphData.nodes]);
```

- [ ] **Step 2: Add tags to HoverTooltip**

In `HoverTooltip.jsx`, add a tag pills row after the `tooltip-meta` div and before the closing `</div>`. Find the closing of the component (before the final `</div>` of the tooltip):

After the `tooltip-meta` div (line 37), add:

```jsx
      {node.tags && node.tags.length > 0 && (
        <div className="tag-pills" style={{ marginTop: 4, padding: "0 10px 6px" }}>
          {node.tags.slice(0, 5).map(tag => (
            <span key={tag} className="tag-pill tag-pill--small">{tag}</span>
          ))}
          {node.tags.length > 5 && (
            <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>+{node.tags.length - 5} more</span>
          )}
        </div>
      )}
```

Place this between the `tooltip-meta` div and the closing `</div>` of the tooltip.

- [ ] **Step 3: Test in browser**

1. Open MindReader UI, switch to Graph tab
2. Hover over a node — verify the tooltip now shows tag pills below the meta line
3. Hover over an entity without tags — verify no extra row appears
4. Hover over an entity with >5 tags — verify "+N more" truncation

- [ ] **Step 4: Commit**

```bash
git add packages/mindreader-ui/ui/src/components/HoverTooltip.jsx packages/mindreader-ui/ui/src/App.jsx
git commit -m "feat: show tags in graph hover tooltip"
```
