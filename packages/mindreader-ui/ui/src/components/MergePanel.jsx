import { useState, useCallback, useEffect } from "react";
import { useCategoryColors } from "../useCategoryColors";

export default function MergePanel() {
  const { labels: GROUP_LABELS } = useCategoryColors();
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [resultsA, setResultsA] = useState([]);
  const [resultsB, setResultsB] = useState([]);
  const [entityA, setEntityA] = useState(null);
  const [entityB, setEntityB] = useState(null);
  const [merging, setMerging] = useState(false);
  const [result, setResult] = useState(null);
  const [keepName, setKeepName] = useState("a");
  const [targetGroup, setTargetGroup] = useState("");
  const [customSummary, setCustomSummary] = useState("");

  const searchEntities = useCallback(async (q, setter) => {
    if (!q || q.length < 2) { setter([]); return; }
    try {
      const res = await fetch(`/api/entities?q=${encodeURIComponent(q)}&limit=8`);
      if (res.ok) {
        const data = await res.json();
        setter(data.entities || []);
      }
    } catch { setter([]); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchEntities(searchA, setResultsA), 200);
    return () => clearTimeout(t);
  }, [searchA, searchEntities]);

  useEffect(() => {
    const t = setTimeout(() => searchEntities(searchB, setResultsB), 200);
    return () => clearTimeout(t);
  }, [searchB, searchEntities]);

  const selectEntity = useCallback(async (entity, side) => {
    try {
      const res = await fetch(`/api/entity/${encodeURIComponent(entity.name)}`);
      if (res.ok) {
        const data = await res.json();
        if (side === "a") {
          setEntityA(data);
          setSearchA("");
          setResultsA([]);
        } else {
          setEntityB(data);
          setSearchB("");
          setResultsB([]);
        }
      }
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    if (entityA && entityB) {
      setCustomSummary(
        keepName === "a"
          ? (entityA.entity?.summary || "")
          : (entityB.entity?.summary || "")
      );
    }
  }, [entityA, entityB, keepName]);

  const handleMerge = useCallback(async () => {
    if (!entityA || !entityB) return;
    setMerging(true);
    setResult(null);
    try {
      const res = await fetch("/api/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keepName: keepName === "a" ? entityA.entity.name : entityB.entity.name,
          mergeName: keepName === "a" ? entityB.entity.name : entityA.entity.name,
          newSummary: customSummary || undefined,
          newGroup: targetGroup || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Merge failed");
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setMerging(false);
    }
  }, [entityA, entityB, keepName, customSummary, targetGroup]);

  const reset = () => {
    setEntityA(null);
    setEntityB(null);
    setSearchA("");
    setSearchB("");
    setResult(null);
    setKeepName("a");
    setTargetGroup("");
    setCustomSummary("");
  };

  if (result) {
    return (
      <div className="merge-panel">
        <div style={{
          padding: 20,
          background: result.error ? "rgba(255,74,74,0.1)" : "rgba(74,255,120,0.1)",
          borderRadius: 12,
          border: `1px solid ${result.error ? "var(--accent-red)" : "rgba(74,255,120,0.3)"}`,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{result.error ? "❌" : "✅"}</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
            {result.error ? "Merge Failed" : "Merge Complete"}
          </div>
          {result.error ? (
            <div style={{ color: "var(--accent-red)", fontSize: 13 }}>{result.error}</div>
          ) : (
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              Transferred {result.transferred} relationships. "{result.deleted}" has been removed.
            </div>
          )}
          <button onClick={reset} style={{
            marginTop: 16, padding: "8px 20px",
            background: "var(--accent-blue)", border: "none", borderRadius: 8,
            color: "#fff", fontSize: 13, cursor: "pointer",
          }}>
            Merge Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="merge-panel">
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        {/* Entity A */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
            Entity A {entityA && `— ${entityA.entity.name}`}
          </div>
          {!entityA ? (
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={searchA}
                onChange={(e) => setSearchA(e.target.value)}
                placeholder="Search entity..."
                style={{
                  width: "100%", padding: "8px 12px",
                  background: "var(--bg-secondary)", border: "1px solid rgba(74,158,255,0.2)",
                  borderRadius: 8, color: "var(--text-primary)", fontSize: 13,
                  outline: "none", boxSizing: "border-box",
                }}
              />
              {resultsA.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                  background: "var(--bg-secondary)", border: "1px solid rgba(74,158,255,0.2)",
                  borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: "auto",
                }}>
                  {resultsA.map((e) => (
                    <div key={e.uuid} onClick={() => selectEntity(e, "a")} style={{
                      padding: "8px 12px", cursor: "pointer", fontSize: 13,
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                    onMouseEnter={(ev) => ev.currentTarget.style.background = "rgba(74,158,255,0.1)"}
                    onMouseLeave={(ev) => ev.currentTarget.style.background = "transparent"}
                    >
                      {e.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <EntityCard entity={entityA} onClear={() => setEntityA(null)} />
          )}
        </div>

        {/* Arrow */}
        <div style={{
          display: "flex", alignItems: "center", fontSize: 24, color: "var(--text-secondary)",
          paddingTop: 20,
        }}>→</div>

        {/* Entity B */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
            Entity B {entityB && `— ${entityB.entity.name}`}
          </div>
          {!entityB ? (
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={searchB}
                onChange={(e) => setSearchB(e.target.value)}
                placeholder="Search entity..."
                style={{
                  width: "100%", padding: "8px 12px",
                  background: "var(--bg-secondary)", border: "1px solid rgba(74,158,255,0.2)",
                  borderRadius: 8, color: "var(--text-primary)", fontSize: 13,
                  outline: "none", boxSizing: "border-box",
                }}
              />
              {resultsB.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                  background: "var(--bg-secondary)", border: "1px solid rgba(74,158,255,0.2)",
                  borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: "auto",
                }}>
                  {resultsB.map((e) => (
                    <div key={e.uuid} onClick={() => selectEntity(e, "b")} style={{
                      padding: "8px 12px", cursor: "pointer", fontSize: 13,
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                    onMouseEnter={(ev) => ev.currentTarget.style.background = "rgba(74,158,255,0.1)"}
                    onMouseLeave={(ev) => ev.currentTarget.style.background = "transparent"}
                    >
                      {e.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <EntityCard entity={entityB} onClear={() => setEntityB(null)} />
          )}
        </div>
      </div>

      {/* Merge options — show when both selected */}
      {entityA && entityB && (
        <div style={{
          padding: 16, background: "var(--bg-secondary)", borderRadius: 12,
          border: "1px solid rgba(74,158,255,0.15)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--accent-blue)" }}>
            Merge Options
          </div>

          {/* Keep which name */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Keep name:</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setKeepName("a")} style={{
                flex: 1, padding: "8px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                background: keepName === "a" ? "rgba(74,158,255,0.2)" : "transparent",
                border: `1px solid ${keepName === "a" ? "var(--accent-blue)" : "rgba(255,255,255,0.1)"}`,
                color: keepName === "a" ? "var(--accent-blue)" : "var(--text-secondary)",
              }}>
                {entityA.entity.name}
              </button>
              <button onClick={() => setKeepName("b")} style={{
                flex: 1, padding: "8px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                background: keepName === "b" ? "rgba(74,158,255,0.2)" : "transparent",
                border: `1px solid ${keepName === "b" ? "var(--accent-blue)" : "rgba(255,255,255,0.1)"}`,
                color: keepName === "b" ? "var(--accent-blue)" : "var(--text-secondary)",
              }}>
                {entityB.entity.name}
              </button>
            </div>
          </div>

          {/* Set group/project */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Set group (optional):</div>
            <select
              value={targetGroup}
              onChange={(e) => setTargetGroup(e.target.value)}
              style={{
                width: "100%", padding: "8px 12px",
                background: "var(--bg-primary)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none",
              }}
            >
              <option value="">Keep existing</option>
              {Object.entries(GROUP_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Summary */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Summary for merged entity:</div>
            <textarea
              value={customSummary}
              onChange={(e) => setCustomSummary(e.target.value)}
              placeholder="Enter summary..."
              style={{
                width: "100%", minHeight: 60, padding: 10,
                background: "var(--bg-primary)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, color: "var(--text-primary)", fontSize: 13,
                resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Merge button */}
          <button
            onClick={handleMerge}
            disabled={merging}
            style={{
              width: "100%", padding: "10px 16px",
              background: "linear-gradient(135deg, rgba(255, 165, 0, 0.2), rgba(255, 100, 0, 0.2))",
              border: "1px solid rgba(255, 165, 0, 0.4)",
              borderRadius: 8, color: "#ffaa44", fontSize: 13, fontWeight: 600,
              cursor: merging ? "wait" : "pointer", opacity: merging ? 0.6 : 1,
            }}
          >
            {merging ? "Merging..." : `Merge "${keepName === "a" ? entityB.entity.name : entityA.entity.name}" into "${keepName === "a" ? entityA.entity.name : entityB.entity.name}"`}
          </button>
        </div>
      )}
    </div>
  );
}

function EntityCard({ entity, onClear }) {
  const e = entity.entity;
  const rels = entity.relationships || [];
  return (
    <div style={{
      padding: 12, background: "var(--bg-secondary)", borderRadius: 10,
      border: "1px solid rgba(74,158,255,0.15)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <strong style={{ fontSize: 14 }}>{e.name}</strong>
        <button onClick={onClear} style={{
          background: "none", border: "none", color: "var(--text-secondary)",
          cursor: "pointer", fontSize: 14,
        }}>✕</button>
      </div>
      {e.summary && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
          {e.summary.slice(0, 100)}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
        {rels.length} relationships
      </div>
    </div>
  );
}
