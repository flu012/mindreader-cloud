import { useState, useCallback, useEffect, useRef } from "react";

const MAX_BATCHES = 100;

export default function OrganizeCategoriesView() {
  const [state, setState] = useState("idle"); // idle | scanning | reviewing | executing | done
  const [scope, setScope] = useState("other"); // all | other | uncategorized
  const [batchSize, setBatchSize] = useState(30);
  const [changes, setChanges] = useState([]);
  const [processed, setProcessed] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalChanged, setTotalChanged] = useState(0);
  const [totalDeleted, setTotalDeleted] = useState(0);
  const [error, setError] = useState(null);
  const [log, setLog] = useState([]);
  const [deleteOther, setDeleteOther] = useState(true);
  const [stats, setStats] = useState(null);
  const cancelRef = useRef(false);

  // Fetch current category stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const runBatch = useCallback(async () => {
    setState("scanning");
    setError(null);

    try {
      const res = await fetch("/api/recategorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, batchSize }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();

      if (data.processed === 0) {
        setLog((prev) => [...prev, `No more entities to process.`]);
        setState("done");
        fetchStats();
        return;
      }

      setChanges(data.changes || []);
      setProcessed(data.processed);
      setRemaining(data.remaining);
      setState("reviewing");
    } catch (err) {
      setError(err.message);
      setState("idle");
    }
  }, [scope, batchSize, fetchStats]);

  const runAllBatches = useCallback(async () => {
    setState("executing");
    setError(null);
    setLog([]);
    setTotalProcessed(0);
    setTotalChanged(0);
    setTotalDeleted(0);
    cancelRef.current = false;

    let batchNum = 0;
    let totalP = 0;
    let totalC = 0;
    let currentSkip = 0;

    try {
      while (batchNum < MAX_BATCHES) {
        if (cancelRef.current) {
          setLog((prev) => [...prev, `Cancelled by user after ${batchNum} batches.`]);
          break;
        }
        batchNum++;
        setLog((prev) => [...prev, `Batch ${batchNum}: processing...`]);

        const body = { scope, batchSize };
        if (scope === "all") body.skip = currentSkip;

        const res = await fetch("/api/recategorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data = await res.json();

        if (data.processed === 0) {
          setLog((prev) => [...prev, `No more entities to process.`]);
          break;
        }

        totalP += data.processed;
        totalC += data.changed;
        if (scope === "all") currentSkip += data.processed;
        setTotalProcessed(totalP);
        setTotalChanged(totalC);
        setRemaining(data.remaining);

        const changeSummary = data.changes?.length
          ? data.changes.map((c) => `${c.name}: ${c.from} → ${c.to}`).join(", ")
          : "no changes";
        setLog((prev) => [
          ...prev,
          `Batch ${batchNum}: ${data.processed} processed, ${data.changed} changed (${changeSummary})`,
        ]);

        if (data.remaining === 0) break;

        // Small delay between batches to avoid rate limiting
        await new Promise((r) => setTimeout(r, 500));
      }

      if (batchNum >= MAX_BATCHES) {
        setLog((prev) => [...prev, `Stopped after ${MAX_BATCHES} batches (safety limit).`]);
      }

      // Delete "other" entities if option is selected
      if (deleteOther && !cancelRef.current) {
        setLog((prev) => [...prev, `Cleaning up "other" entities...`]);
        const delRes = await fetch("/api/cleanup/delete-other", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        });
        if (delRes.ok) {
          const delData = await delRes.json();
          setTotalDeleted(delData.deleted || 0);
          setLog((prev) => [
            ...prev,
            `Deleted ${delData.deleted || 0} noise entities, ${delData.orphansDeleted || 0} orphaned episodes`,
          ]);
        }
      }

      setState("done");
      fetchStats();
    } catch (err) {
      setError(err.message);
      setState("idle");
    }
  }, [scope, batchSize, deleteOther, fetchStats]);

  const reset = useCallback(() => {
    setState("idle");
    setChanges([]);
    setLog([]);
    setProcessed(0);
    setRemaining(0);
    setTotalProcessed(0);
    setTotalChanged(0);
    setTotalDeleted(0);
    setError(null);
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="cleanup-view">
      {error && <div className="cleanup-error">{error}</div>}

      {/* Current stats */}
      {stats && (
        <div className="org-stats">
          <div className="org-stats-title">Current Category Distribution</div>
          <div className="org-stats-grid">
            {Object.entries(stats.entityGroups || {}).map(([key, count]) => (
              <div key={key} className="org-stat-item">
                <span className="org-stat-label">{key}</span>
                <span className="org-stat-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Idle state */}
      {state === "idle" && (
        <div className="cleanup-initial">
          <div className="cleanup-initial-icon">{"\u{1F3F7}\uFE0F"}</div>
          <div className="cleanup-initial-text">
            Use AI to re-categorize entities for accurate classification. The LLM analyzes each entity's name and summary to assign the best category.
          </div>

          <div className="org-options">
            <div className="org-option">
              <label className="org-option-label">Scope</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="org-select">
                <option value="other">Miscategorized & Other</option>
                <option value="uncategorized">Uncategorized only</option>
                <option value="all">All entities</option>
              </select>
            </div>
            <div className="org-option">
              <label className="org-option-label">Batch size</label>
              <select value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} className="org-select">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="org-option">
              <label className="org-option-label org-checkbox-label">
                <input type="checkbox" checked={deleteOther} onChange={(e) => setDeleteOther(e.target.checked)} />
                Delete entities classified as "other" (noise)
              </label>
            </div>
          </div>

          <div className="cleanup-actions">
            <button className="scan-button" onClick={runBatch} disabled={state !== "idle"}>
              Preview One Batch
            </button>
            <button className="scan-button cleanup-execute" onClick={runAllBatches} disabled={state !== "idle"}>
              Run All Batches
            </button>
          </div>
        </div>
      )}

      {/* Scanning */}
      {state === "scanning" && (
        <div className="cleanup-initial">
          <div className="org-spinner" />
          <div className="cleanup-initial-text">Sending batch to LLM for categorization...</div>
        </div>
      )}

      {/* Reviewing a single batch */}
      {state === "reviewing" && (
        <div>
          <div className="cleanup-summary">
            Processed <strong>{processed}</strong> entities, <strong>{changes.length}</strong> re-categorized, <strong>{remaining}</strong> remaining
          </div>

          {changes.length > 0 ? (
            <div className="cleanup-card">
              <div className="cleanup-card-header">
                <div className="cleanup-card-title">
                  <span className="cleanup-card-icon">{"\u{1F504}"}</span>
                  <span>Category Changes</span>
                  <span className="issue-badge">{changes.length}</span>
                </div>
              </div>
              <div className="cleanup-card-body" style={{ maxHeight: 400 }}>
                {changes.map((c, i) => (
                  <div key={i} className="cleanup-item">
                    <strong>{c.name}</strong>
                    <div className="cleanup-item-detail">
                      <span className="org-cat-badge" data-cat={c.from}>{c.from}</span>
                      <span className="cleanup-rel-arrow">{"\u2192"}</span>
                      <span className="org-cat-badge" data-cat={c.to}>{c.to}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="cleanup-summary">No changes needed in this batch.</div>
          )}

          <div className="cleanup-actions">
            <button className="scan-button" onClick={runBatch} disabled={remaining === 0}>
              {remaining > 0 ? "Next Batch" : "No more"}
            </button>
            <button className="scan-button secondary" onClick={reset}>Done</button>
          </div>
        </div>
      )}

      {/* Executing all batches */}
      {state === "executing" && (
        <div>
          <div className="cleanup-summary">
            Processing... <strong>{totalProcessed}</strong> entities processed, <strong>{totalChanged}</strong> changed
            {remaining > 0 && <>, <strong>{remaining}</strong> remaining</>}
          </div>
          <div className="org-log">
            {log.map((line, i) => (
              <div key={i} className="org-log-line">{line}</div>
            ))}
            <div className="org-log-line org-log-active">
              <span className="org-spinner-inline" /> Working...
            </div>
          </div>
          <div className="cleanup-actions" style={{ marginTop: 12 }}>
            <button className="scan-button secondary" onClick={() => { cancelRef.current = true; }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Done */}
      {state === "done" && (
        <div className="cleanup-results">
          <div className="cleanup-results-header">{"\u2705"} Organization Complete</div>
          <div className="cleanup-results-body">
            <div className="cleanup-result-row">
              <span>Entities processed</span>
              <span className="cleanup-result-count">{totalProcessed}</span>
            </div>
            <div className="cleanup-result-row">
              <span>Categories changed</span>
              <span className="cleanup-result-count">{totalChanged}</span>
            </div>
            {totalDeleted > 0 && (
              <div className="cleanup-result-row">
                <span>Noise entities deleted</span>
                <span className="cleanup-result-count">{totalDeleted}</span>
              </div>
            )}
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
