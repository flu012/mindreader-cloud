# Entity Tags UI — Design Spec

## Goal

Add tag viewing/editing UI to the entity detail panel, extend entity search to match tags, consolidate the graph's standalone search bar into the global search bar, and show tags in search results and graph hover tooltips.

## Architecture

Pure frontend changes to the MindReader UI React app, plus one backend query modification. The existing `PUT /api/entity/:name` endpoint already supports `{ tags: [...] }` — no new endpoints needed. The global search bar becomes context-aware: on the Graph tab it filters/highlights Sigma nodes; on all other tabs it searches entities via the API.

## Constraints

- No new backend endpoints
- All tag mutations use existing `PUT /api/entity/:name` with `{ tags: [...] }`
- Tags are always lowercase, deduplicated, sorted alphabetically (normalization in frontend before sending)
- Backward compatible — entities without tags treated as `[]`

---

## 1. Tag Pills in Detail Panel

**File:** `packages/mindreader-ui/ui/src/components/DetailPanel.jsx`

### 1.1 Location

Between the category/node-type selectors and the editable summary. New `TagEditor` component rendered inline.

### 1.2 Display

- Horizontal flex-wrap row of pill badges
- Each pill: tag text + `×` remove button
- Style: small rounded pills using `--accent-cyan` background at 20% opacity, `--accent-cyan` border, `--text-primary` text
- `+` button at end of row to add new tag

### 1.3 Add Tag

- Clicking `+` shows an inline text input (replaces the `+` button)
- Type tag text, press Enter to add (or Escape/blur to cancel)
- Input auto-lowercases, trims whitespace
- On submit: merge new tag into existing array, deduplicate, sort, call `PUT /api/entity/:name` with `{ tags: mergedArray }`
- Input clears after successful add, stays visible for adding more tags
- Press Escape or click away to close input

### 1.4 Remove Tag

- Click `×` on any pill
- Immediately removes from array, calls `PUT /api/entity/:name` with updated tags
- No confirmation dialog (low-risk, easily re-added)

### 1.5 Empty State

Show `+` button with faded "(no tags)" placeholder text beside it.

### 1.6 Component Structure

New `TagEditor` component (defined inside `DetailPanel.jsx` or extracted to own file if large):

```jsx
<TagEditor
  tags={entity.tags || []}
  entityName={entity.name}
  onTagsChanged={(newTags) => { /* refetch entity detail */ }}
/>
```

**Refresh after mutation:** `onTagsChanged` must call the parent's `onEntityUpdate` callback (which refetches entity detail via `GET /api/entity/:name`) so the detail panel, graph, and list views all reflect the updated tags.

## 2. Context-Aware Global Search Bar

**File:** `packages/mindreader-ui/ui/src/App.jsx`, `packages/mindreader-ui/ui/src/components/GraphView.jsx`

### 2.1 Remove Graph Standalone Search

Delete the search bar UI from `GraphView.jsx` (lines ~320-398) — the search input, dropdown results, and local filter state.

### 2.2 Graph Search via Global Bar

When `activeTab === "graph"`:
- The global search bar's `onChange` passes the query to GraphView via a new `searchQuery` prop
- GraphView uses the query to filter nodes in the Sigma graph (same logic the standalone bar used — match node labels, show dropdown of top 10 matches)
- Add a new `onSearchSelect` callback prop: when user selects a result from the dropdown, GraphView animates the camera to that node and triggers `onNodeClick`. The `onSearchSelect` handler in App.jsx must also clear `searchQuery` (set to `""`) so the search text doesn't persist after selection.
- The dropdown renders inside GraphView (positioned below the top bar) since it needs access to Sigma node data

### 2.3 Other Tabs Unchanged

When `activeTab !== "graph"`, the global search bar behaves exactly as it does now — updates `searchQuery` state which is passed to ListView/TimelineView for API-based filtering.

### 2.4 Search Results Dropdown for Graph

GraphView renders a dropdown (absolutely positioned below the top bar area) showing up to 10 matching nodes when `searchQuery` is non-empty. The search matches node labels only (consistent with the original graph search behavior). Each result shows:
- Entity name
- Category badge (colored dot)
- Tags as small read-only pills (looked up from the original `data.nodes` array, since Sigma node attributes don't include tags)

Clicking a result: animates camera to node, highlights it, calls `onSearchSelect` (which clears the search and calls `onNodeClick`).

## 3. Tag-Aware Entity Search

**File:** `packages/mindreader-ui/server/server.js` (~line 1127)

### 3.1 Backend Query Change

Extend the `GET /api/entities` WHERE clause to also match tags:

Current:
```cypher
(toLower(e.name) CONTAINS toLower($q) OR toLower(e.summary) CONTAINS toLower($q))
```

New:
```cypher
(toLower(e.name) CONTAINS toLower($q) OR toLower(e.summary) CONTAINS toLower($q) OR ANY(t IN COALESCE(e.tags, []) WHERE t CONTAINS toLower($q)))
```

### 3.2 Return Tags in Response

Add `e.tags AS tags` to the RETURN clause of the entities query. Include `tags` in the response objects:

```js
tags: Array.isArray(rec.tags) ? rec.tags : []
```

### 3.3 Search Result Relevance

Extend the relevance ORDER BY to rank tag matches:
```cypher
CASE WHEN toLower(e.name) = toLower($q) THEN 0
     WHEN toLower(e.name) STARTS WITH toLower($q) THEN 1
     WHEN toLower(e.name) CONTAINS toLower($q) THEN 2
     WHEN ANY(t IN COALESCE(e.tags, []) WHERE t = toLower($q)) THEN 3
     ELSE 4 END ASC
```

## 4. Tags in Search Results Display

**File:** `packages/mindreader-ui/ui/src/components/ListView.jsx`

### 4.1 List View Entity Cards

Each entity card in the list view currently shows name, category badge, summary, and relationship count. Add a row of small read-only tag pills below the summary:

- Same pill style as detail panel but smaller (font-size 0.7rem, padding 2px 6px)
- No `×` buttons, no `+` button — read-only in search results
- Only shown if entity has tags (hide row if empty)

## 5. Tags in Graph Hover Tooltip

**File:** `packages/mindreader-ui/ui/src/components/HoverTooltip.jsx`

### 5.1 Tooltip Enhancement

The hover tooltip currently shows entity name and category. Add tags below:

- Small read-only pills, same style as list view
- Max 5 tags shown in tooltip (truncate with "+N more" if >5)
- Only shown if entity has tags

### 5.2 Data Availability

The `/api/graph` endpoint already returns `tags` in node objects (added in the entity-tags backend work). HoverTooltip receives the node object which includes tags.

---

## File Changes Summary

| File | Change |
|------|--------|
| `packages/mindreader-ui/ui/src/components/DetailPanel.jsx` | Add `TagEditor` component for view/add/remove tags |
| `packages/mindreader-ui/ui/src/components/GraphView.jsx` | Remove standalone search bar, accept `searchQuery` + `onSearchSelect` props, render search dropdown |
| `packages/mindreader-ui/ui/src/App.jsx` | Pass `searchQuery` and `onSearchSelect` to GraphView when on graph tab |
| `packages/mindreader-ui/ui/src/components/ListView.jsx` | Show tag pills in entity cards |
| `packages/mindreader-ui/ui/src/components/HoverTooltip.jsx` | Show tags in hover tooltip |
| `packages/mindreader-ui/server/server.js` | Extend `/api/entities` query to search tags, return tags in response |
| `packages/mindreader-ui/ui/src/index.css` | Add tag pill CSS styles |

## Non-Goals

- No tag filtering/faceting UI (e.g. click a tag to filter all entities by that tag)
- No tag autocomplete/suggestions when adding tags
- No bulk tag operations from the UI
- No changes to the backend tag extraction or tagger module
