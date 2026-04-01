import { useState, useCallback } from "react";

const CATEGORIES = [
  { key: "duplicate_entities", icon: "\u{1F465}", label: "Duplicate Entities" },
  { key: "garbage_episodic", icon: "\u{1F5D1}\uFE0F", label: "Garbage Episodic" },
  { key: "test_episodic", icon: "\u{1F9EA}", label: "Test Episodic" },
  { key: "expired_relationships", icon: "\u23F0", label: "Expired Relationships" },
  { key: "duplicate_relationships", icon: "\u{1F517}", label: "Duplicate Relationships" },
  { key: "orphan_entities", icon: "\u{1F47B}", label: "Orphan Entities" },
];

export default function CleanupView() {
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [report, setReport] = useState(null);
  const [results, setResults] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [selected, setSelected] = useState({});
  const [selectedOrphans, setSelectedOrphans] = useState({});
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setResults(null);
    setSelected({});
    setSelectedOrphans({});
    try {
      const res = await fetch("/api/cleanup/scan");
      if (!res.ok) throw new Error("Scan failed");
      const data = await res.json();
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }, []);

  const execute = useCallback(async () => {
    const actions = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (actions.length === 0) return;

    const orphan_uuids = actions.includes("orphan_entities")
      ? Object.entries(selectedOrphans).filter(([, v]) => v).map(([k]) => k)
      : [];

    setExecuting(true);
    setError(null);
    try {
      const res = await fetch("/api/cleanup/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions, orphan_uuids }),
      });
      if (!res.ok) throw new Error("Cleanup failed");
      const data = await res.json();
      setResults(data);
      setReport(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setExecuting(false);
      // 5-second cooldown to prevent accidental double-clicks
      setCooldown(true);
      setTimeout(() => setCooldown(false), 5000);
    }
  }, [selected, selectedOrphans]);

  const toggleExpanded = (key) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleSelected = (key) =>
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleOrphan = (uuid) =>
    setSelectedOrphans((prev) => ({ ...prev, [uuid]: !prev[uuid] }));

  const anySelected = Object.values(selected).some(Boolean);

  if (results) {
    return (
      <div className="cleanup-view">
        <div className="cleanup-results">
          <div className="cleanup-results-header">{"\u2705"} Cleanup Complete</div>
          <div className="cleanup-results-body">
            {Object.entries(results.results).map(([key, val]) => {
              const cat = CATEGORIES.find((c) => c.key === key);
              return (
                <div key={key} className="cleanup-result-row">
                  <span>{cat?.icon} {cat?.label}</span>
                  <span className="cleanup-result-count">{val.deleted} deleted</span>
                </div>
              );
            })}
            <div className="cleanup-totals">
              <div className="cleanup-totals-header">Database Totals</div>
              <div className="cleanup-result-row">
                <span>Entities</span><span>{results.totals_after.entities}</span>
              </div>
              <div className="cleanup-result-row">
                <span>Episodic</span><span>{results.totals_after.episodic}</span>
              </div>
              <div className="cleanup-result-row">
                <span>Relationships</span><span>{results.totals_after.relationships}</span>
              </div>
            </div>
          </div>
          <button className="scan-button" onClick={scan}>Scan Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cleanup-view">
      {error && <div className="cleanup-error">{error}</div>}

      {!report && (
        <div className="cleanup-initial">
          <div className="cleanup-initial-icon">{"\u{1F9F9}"}</div>
          <div className="cleanup-initial-text">Scan your database for duplicates, garbage data, and orphaned nodes.</div>
          <button className="scan-button" onClick={scan} disabled={scanning}>
            {scanning ? "Scanning..." : "Scan Database"}
          </button>
        </div>
      )}

      {report && (
        <>
          <div className="cleanup-summary">
            Found <strong>{report.summary.total_issues}</strong> issue{report.summary.total_issues !== 1 ? "s" : ""} across {
              CATEGORIES.filter((c) => report.summary[c.key] > 0).length
            } categories
          </div>

          {CATEGORIES.map(({ key, icon, label }) => {
            const count = report.summary[key];
            const items = report.details[key];
            const isExpanded = expanded[key];
            const isSelected = selected[key];

            return (
              <div key={key} className={`cleanup-card ${count === 0 ? "empty" : ""}`}>
                <div className="cleanup-card-header" onClick={() => count > 0 && toggleExpanded(key)}>
                  <div className="cleanup-card-title">
                    {count > 0 && (
                      <label className="cleanup-checkbox" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={!!isSelected}
                          onChange={() => toggleSelected(key)}
                          disabled={count === 0}
                        />
                      </label>
                    )}
                    <span className="cleanup-card-icon">{icon}</span>
                    <span>{label}</span>
                    <span className={`issue-badge ${count === 0 ? "zero" : ""}`}>{count}</span>
                  </div>
                  {count > 0 && <span className="cleanup-expand">{isExpanded ? "\u25B2" : "\u25BC"}</span>}
                </div>

                {isExpanded && count > 0 && (
                  <div className="cleanup-card-body">
                    {key === "duplicate_entities" && items.map((item, i) => (
                      <div key={i} className="cleanup-item">
                        <strong>{item.name}</strong> — {item.count} copies
                        <div className="cleanup-item-detail">
                          UUIDs: {item.uuids.slice(0, 3).join(", ")}{item.uuids.length > 3 ? "..." : ""}
                        </div>
                      </div>
                    ))}

                    {(key === "garbage_episodic" || key === "test_episodic") && items.map((item, i) => (
                      <div key={i} className="cleanup-item">
                        <div className="cleanup-item-preview">{item.content_preview}</div>
                        <div className="cleanup-item-detail">
                          Source: {item.source || "n/a"} | {item.created_at || "no date"}
                        </div>
                      </div>
                    ))}

                    {key === "expired_relationships" && items.map((item, i) => (
                      <div key={i} className="cleanup-item">
                        {item.source} <span className="cleanup-rel-arrow">→</span> <em>{item.relation}</em> <span className="cleanup-rel-arrow">→</span> {item.target}
                        <div className="cleanup-item-detail">Expired: {item.expired_at}</div>
                      </div>
                    ))}

                    {key === "duplicate_relationships" && items.map((item, i) => (
                      <div key={i} className="cleanup-item">
                        {item.source} <span className="cleanup-rel-arrow">→</span> <em>{item.relation}</em> <span className="cleanup-rel-arrow">→</span> {item.target}
                        <span className="cleanup-item-detail"> ({item.count}x)</span>
                      </div>
                    ))}

                    {key === "orphan_entities" && items.map((item, i) => (
                      <div key={i} className="cleanup-item">
                        <label className="cleanup-checkbox" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={!!selectedOrphans[item.uuid]}
                            onChange={() => toggleOrphan(item.uuid)}
                          />
                        </label>
                        <strong>{item.name}</strong>
                        {item.summary && <div className="cleanup-item-detail">{item.summary}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="cleanup-actions">
            <button
              className="scan-button cleanup-execute"
              onClick={execute}
              disabled={!anySelected || executing || cooldown}
            >
              {executing ? "Cleaning..." : cooldown ? "Please wait..." : "Clean Selected"}
            </button>
            <button className="scan-button secondary" onClick={scan} disabled={scanning}>
              {scanning ? "Scanning..." : "Rescan"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
