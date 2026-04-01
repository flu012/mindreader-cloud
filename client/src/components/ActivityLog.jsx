import { useState, useEffect, useCallback } from "react";

function relativeTime(iso) {
  if (!iso) return "";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

const SOURCE_COLORS = {
  "auto-capture": "var(--accent-blue)",
  agent: "var(--accent-purple)",
  manual: "var(--accent-green)",
};

const CATEGORY_COLORS = {
  credential: "var(--accent-red)",
  infrastructure: "var(--accent-blue)",
  decision: "var(--accent-purple)",
  entity: "var(--accent-green)",
  relationship: "var(--accent-orange)",
  event: "var(--accent-cyan)",
  preference: "#ff4aff",
  procedure: "#cccc44",
};

export default function ActivityLog() {
  const [tab, setTab] = useState("capture");
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/audit?type=${tab}&limit=${limit}&offset=${offset}`
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load audit events:", err);
    }
    setLoading(false);
  }, [tab, offset]);

  useEffect(() => {
    setOffset(0);
  }, [tab]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return (
    <div className="activity-log">
      <div className="activity-header">
        <h2 className="activity-title">Activity Log</h2>
        <button className="activity-refresh" onClick={fetchEvents} title="Refresh">
          🔄
        </button>
      </div>

      <div className="activity-tabs">
        <button
          className={`activity-tab ${tab === "capture" ? "active" : ""}`}
          onClick={() => setTab("capture")}
        >
          Captured
        </button>
        <button
          className={`activity-tab ${tab === "recall" ? "active" : ""}`}
          onClick={() => setTab("recall")}
        >
          Recalled
        </button>
      </div>

      <div className="activity-list">
        {loading ? (
          <div className="activity-loading">
            <div className="loading-spinner" />
          </div>
        ) : events.length === 0 ? (
          <div className="activity-empty">
            {tab === "capture"
              ? "No captured memories yet."
              : "No recall events yet."}
          </div>
        ) : (
          events.map((evt, i) => (
            <div
              key={evt.id || i}
              className="activity-item"
              style={{ animationDelay: `${Math.min(i, 10) * 0.02}s` }}
            >
              <div className="activity-item-header">
                <span className="activity-time">
                  {relativeTime(evt.timestamp)}
                </span>
                {tab === "capture" && evt.source && (
                  <span
                    className="activity-badge"
                    style={{
                      background: `${SOURCE_COLORS[evt.source] || "var(--text-secondary)"}22`,
                      color: SOURCE_COLORS[evt.source] || "var(--text-secondary)",
                    }}
                  >
                    {evt.source}
                  </span>
                )}
                {tab === "capture" && evt.category && (
                  <span
                    className="activity-badge"
                    style={{
                      background: `${CATEGORY_COLORS[evt.category] || "var(--text-secondary)"}22`,
                      color: CATEGORY_COLORS[evt.category] || "var(--text-secondary)",
                    }}
                  >
                    {evt.category}
                  </span>
                )}
                {tab === "recall" && evt.resultCount != null && (
                  <span
                    className="activity-badge"
                    style={{
                      background: "rgba(74, 158, 255, 0.15)",
                      color: "var(--accent-blue)",
                    }}
                  >
                    {evt.resultCount} result{evt.resultCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="activity-item-body">
                {tab === "capture"
                  ? (evt.content || "").slice(0, 120) +
                    (evt.content?.length > 120 ? "..." : "")
                  : evt.query || ""}
              </div>
              {evt.trigger && (
                <div className="activity-item-trigger">{evt.trigger}</div>
              )}
            </div>
          ))
        )}
      </div>

      {total > limit && (
        <div className="activity-pagination">
          <button
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
          >
            ← Prev
          </button>
          <span className="activity-page-info">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            disabled={offset + limit >= total}
            onClick={() => setOffset((o) => o + limit)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact activity history for the detail panel.
 * Fetches audit events for a specific entity name.
 */
export function EntityActivityHistory({ entityName }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityName) return;
    setLoading(true);
    fetch(`/api/audit/node/${encodeURIComponent(entityName)}`)
      .then((r) => r.json())
      .then((data) => {
        setEvents((data.events || []).slice(0, 5));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [entityName]);

  if (loading) {
    return (
      <div className="entity-activity">
        <h3>📋 Activity History</h3>
        <div className="activity-loading-small">
          <div className="loading-spinner" style={{ width: 20, height: 20 }} />
        </div>
      </div>
    );
  }

  if (events.length === 0) return null;

  return (
    <div className="entity-activity">
      <h3>📋 Activity History</h3>
      {events.map((evt, i) => (
        <div key={i} className="entity-activity-item">
          <span className="entity-activity-icon">
            {evt.type === "capture" ? "💾" : "🔍"}
          </span>
          <span className="entity-activity-time">
            {relativeTime(evt.timestamp)}
          </span>
          <span className="entity-activity-text">
            {evt.type === "capture"
              ? (evt.content || "").slice(0, 60) +
                (evt.content?.length > 60 ? "..." : "")
              : `Searched: "${(evt.query || "").slice(0, 40)}"`}
          </span>
        </div>
      ))}
    </div>
  );
}
