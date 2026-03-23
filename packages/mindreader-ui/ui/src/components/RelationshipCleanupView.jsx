import { useState, useCallback } from "react";

export default function RelationshipCleanupView() {
  const [state, setState] = useState("idle"); // idle | scanning | reviewing | fixing | done
  const [issues, setIssues] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [log, setLog] = useState([]);
  const [mode, setMode] = useState("programmatic"); // programmatic | llm
  const [batchSize, setBatchSize] = useState(30);

  const runProgrammaticScan = useCallback(async () => {
    setState("scanning");
    setError(null);
    setIssues([]);
    setSelected(new Set());
    setLog([]);

    try {
      const res = await fetch("/api/relationships/scan");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIssues(data.issues || []);
      // Auto-select high severity
      const autoSelect = new Set();
      (data.issues || []).forEach((issue, i) => {
        if (issue.severity === "high") autoSelect.add(i);
      });
      setSelected(autoSelect);
      setState("reviewing");
      setLog([`Found ${data.total} issues (${data.issues?.filter(i => i.severity === "high").length || 0} high, ${data.issues?.filter(i => i.severity === "medium").length || 0} medium, ${data.issues?.filter(i => i.severity === "low").length || 0} low)`]);
    } catch (err) {
      setError(err.message);
      setState("idle");
    }
  }, []);

  const runLLMReview = useCallback(async () => {
    setState("scanning");
    setError(null);
    setIssues([]);
    setSelected(new Set());
    setLog([]);
    try {
      const res = await fetch("/api/relationships/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setIssues(data.issues || []);
      const autoSelect = new Set();
      (data.issues || []).forEach((issue, i) => {
        if (issue.severity === "high") autoSelect.add(i);
      });
      setSelected(autoSelect);
      setState("reviewing");
      setLog([`LLM reviewed ${data.reviewed} of ${data.total} relationships, found ${data.issues?.length || 0} issues`]);
    } catch (err) {
      setError(err.message);
      setState("idle");
    }
  }, [batchSize]);

  const toggleSelect = useCallback((idx) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(issues.map((_, i) => i)));
  }, [issues]);

  const selectNone = useCallback(() => {
    setSelected(new Set());
  }, []);

  // Build operations from selected issues: fix (reverse/rename) or delete
  const fixAndCleanup = useCallback(async () => {
    const operations = [...selected].map((i) => {
      const issue = issues[i];
      if (!issue) return null;
      if (issue.action === "fix" && issue.type === "reversed") {
        return { eid: issue.eid, action: "reverse" };
      }
      if (issue.action === "fix" && (issue.type === "typo" || issue.type === "vague") && issue.suggestedName) {
        return { eid: issue.eid, action: "rename", suggestedName: issue.suggestedName };
      }
      return { eid: issue.eid, action: "delete" };
    }).filter(Boolean);

    if (operations.length === 0) return;

    setState("fixing");
    try {
      const res = await fetch("/api/relationships/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data);
      const parts = [];
      if (data.deleted > 0) parts.push(`${data.deleted} deleted`);
      if (data.reversed > 0) parts.push(`${data.reversed} reversed`);
      if (data.renamed > 0) parts.push(`${data.renamed} renamed`);
      setLog((prev) => [...prev, `Fixed ${data.fixed} relationships: ${parts.join(", ")}`]);
      setState("done");
    } catch (err) {
      setError(err.message);
      setState("reviewing");
    }
  }, [selected, issues]);

  const reset = useCallback(() => {
    setState("idle");
    setIssues([]);
    setSelected(new Set());
    setResults(null);
    setError(null);
    setLog([]);
  }, []);

  const severityColor = { high: "#ff4a4a", medium: "#ffaa4a", low: "#4a9eff" };
  const typeLabels = {
    self_loop: "Self-Loop",
    garbage_name: "Garbage",
    duplicate: "Duplicate",
    multi_edge: "Multi-Edge",
    nonsensical: "Nonsensical",
    reversed: "Reversed",
    vague: "Vague",
    redundant: "Redundant",
    garbage: "Garbage",
    typo: "Typo",
  };
  const actionLabels = {
    fix: "\u{1F527} Fix",
    delete: "\u{1F5D1} Delete",
  };
  const actionColors = {
    fix: "rgba(74, 255, 158, 0.15)",
    delete: "rgba(255, 74, 74, 0.15)",
  };

  // Count fix vs delete in selection
  const selectedIssues = [...selected].map((i) => issues[i]).filter(Boolean);
  const fixCount = selectedIssues.filter((i) => i.action === "fix").length;
  const deleteCount = selectedIssues.filter((i) => i.action !== "fix").length;

  return (
    <div className="cleanup-view">
      {error && <div className="cleanup-error">{error}</div>}

      {/* Idle state */}
      {state === "idle" && (
        <div className="cleanup-initial">
          <div className="cleanup-initial-icon">{"\u{1F517}"}</div>
          <div className="cleanup-initial-text">
            Scan relationships between entities for issues like self-loops, duplicates, garbage data, nonsensical connections, and redundancy.
            Fixable issues (reversed direction, typos) will be corrected in-place; unfixable ones will be removed.
          </div>

          <div className="org-options">
            <div className="org-option">
              <label className="org-option-label">Scan Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="org-select">
                <option value="programmatic">Quick Scan (structural issues)</option>
                <option value="llm">AI Review (semantic quality)</option>
              </select>
            </div>
            {mode === "llm" && (
              <div className="org-option">
                <label className="org-option-label">Batch size</label>
                <select value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} className="org-select">
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                </select>
              </div>
            )}
          </div>

          <div className="cleanup-actions">
            <button
              className="scan-button"
              onClick={mode === "programmatic" ? runProgrammaticScan : runLLMReview}
            >
              {mode === "programmatic" ? "Quick Scan" : "AI Review"}
            </button>
          </div>
        </div>
      )}

      {/* Scanning */}
      {state === "scanning" && (
        <div className="cleanup-initial">
          <div className="org-spinner" />
          <div className="cleanup-initial-text">
            {mode === "programmatic" ? "Scanning for structural issues..." : "Sending relationships to LLM for review..."}
          </div>
        </div>
      )}

      {/* Reviewing */}
      {state === "reviewing" && (
        <div>
          <div className="cleanup-summary">
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>

          {issues.length > 0 ? (
            <div className="cleanup-card">
              <div className="cleanup-card-header">
                <div className="cleanup-card-title">
                  <span className="cleanup-card-icon">{"\u{1F517}"}</span>
                  <span>Relationship Issues</span>
                  <span className="issue-badge">{issues.length}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={selectAll} className="rel-select-btn">Select All</button>
                  <button onClick={selectNone} className="rel-select-btn">Select None</button>
                </div>
              </div>
              <div className="cleanup-card-body" style={{ maxHeight: 450 }}>
                {issues.map((issue, i) => (
                  <div
                    key={i}
                    className={`cleanup-item rel-issue-item ${selected.has(i) ? "rel-selected" : ""}`}
                    onClick={() => toggleSelect(i)}
                  >
                    <div className="rel-issue-checkbox">
                      <input type="checkbox" checked={selected.has(i)} readOnly />
                    </div>
                    <div className="rel-issue-content">
                      <div className="rel-issue-header">
                        <span className="rel-issue-type" style={{ background: severityColor[issue.severity] || "#888" }}>
                          {typeLabels[issue.type] || issue.type}
                        </span>
                        <span className="rel-action-badge" style={{ background: actionColors[issue.action] || actionColors.delete }}>
                          {actionLabels[issue.action] || actionLabels.delete}
                        </span>
                        <span className="rel-issue-edge">
                          {issue.from} <span className="cleanup-rel-arrow">{"\u2192"}</span> {issue.to}
                        </span>
                      </div>
                      <div className="rel-issue-relation">
                        [{issue.relation}]
                        {issue.suggestedName && (
                          <span className="rel-suggested-name">
                            {" \u2192 "}{issue.suggestedName}
                          </span>
                        )}
                      </div>
                      {issue.type === "reversed" && (
                        <div className="rel-fix-preview">
                          Will reverse to: {issue.to} <span className="cleanup-rel-arrow">{"\u2192"}</span> {issue.from}
                        </div>
                      )}
                      <div className="rel-issue-desc">{issue.description}</div>
                      {issue.fact && (
                        <div className="rel-issue-fact">{issue.fact.slice(0, 150)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="cleanup-summary">{"\u2705"} No issues found!</div>
          )}

          <div className="cleanup-actions">
            {issues.length > 0 && selected.size > 0 && (
              <button className="scan-button cleanup-execute" onClick={fixAndCleanup}>
                Fix & Cleanup {selected.size} Selected
                {fixCount > 0 && deleteCount > 0 && ` (${fixCount} fix, ${deleteCount} remove)`}
                {fixCount > 0 && deleteCount === 0 && ` (${fixCount} fix)`}
                {fixCount === 0 && deleteCount > 0 && ` (${deleteCount} remove)`}
              </button>
            )}
            <button className="scan-button secondary" onClick={reset}>Back</button>
          </div>
        </div>
      )}

      {/* Fixing */}
      {state === "fixing" && (
        <div className="cleanup-initial">
          <div className="org-spinner" />
          <div className="cleanup-initial-text">Fixing and cleaning up relationships...</div>
        </div>
      )}

      {/* Done */}
      {state === "done" && (
        <div className="cleanup-results">
          <div className="cleanup-results-header">{"\u2705"} Fix & Cleanup Complete</div>
          <div className="cleanup-results-body">
            {results?.deleted > 0 && (
              <div className="cleanup-result-row">
                <span>Relationships removed</span>
                <span className="cleanup-result-count">{results.deleted}</span>
              </div>
            )}
            {results?.reversed > 0 && (
              <div className="cleanup-result-row">
                <span>Directions reversed</span>
                <span className="cleanup-result-count">{results.reversed}</span>
              </div>
            )}
            {results?.renamed > 0 && (
              <div className="cleanup-result-row">
                <span>Relations renamed</span>
                <span className="cleanup-result-count">{results.renamed}</span>
              </div>
            )}
            <div className="cleanup-result-row">
              <span>Total fixed</span>
              <span className="cleanup-result-count">{results?.fixed || 0}</span>
            </div>
          </div>
          <div className="org-log" style={{ marginBottom: 16 }}>
            {log.map((line, i) => (
              <div key={i} className="org-log-line">{line}</div>
            ))}
          </div>
          <button className="scan-button" onClick={reset}>Back</button>
        </div>
      )}
    </div>
  );
}
