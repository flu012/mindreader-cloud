import { useState, useEffect, useCallback, useRef } from "react";

const CATEGORY_COLORS = {
  credential: "#ff4a4a",
  infrastructure: "#4a9eff",
  decision: "#9e4aff",
  entity: "#4aff9e",
  relationship: "#ff9e4a",
  event: "#4affff",
  preference: "#ff4aff",
  procedure: "#ffff4a",
};

export default function TokenDashboard() {
  const [usage, setUsage] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tokens?days=${days}`);
      if (res.ok) {
        const data = await res.json();
        setUsage(data.usage || []);
        setTotals(data.totals || {});
      }
    } catch (err) {
      console.error("Failed to load token usage:", err);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // Group usage by date (total + per-operation)
  const byDate = {};
  const operations = new Set();
  for (const row of usage) {
    const dateStr = typeof row.date === "string"
      ? row.date.slice(0, 10)
      : row.date?.toString?.()?.slice(0, 10) || "unknown";
    if (!byDate[dateStr]) byDate[dateStr] = { prompt: 0, completion: 0, total: 0, count: 0 };
    byDate[dateStr].prompt += row.promptTokens || 0;
    byDate[dateStr].completion += row.completionTokens || 0;
    byDate[dateStr].total += row.totalTokens || 0;
    byDate[dateStr].count += 1;
    // Per-operation tracking
    const op = row.operation || "unknown";
    operations.add(op);
    if (!byDate[dateStr][op]) byDate[dateStr][op] = 0;
    byDate[dateStr][op] += row.totalTokens || 0;
  }

  const sortedDates = Object.keys(byDate).sort().reverse();
  const opList = [...operations].sort();

  const grandTotal = Object.values(totals).reduce(
    (acc, m) => ({ prompt: acc.prompt + m.prompt, completion: acc.completion + m.completion, total: acc.total + m.total }),
    { prompt: 0, completion: 0, total: 0 }
  );

  return (
    <div className="token-dashboard">
      <div className="token-header">
        <h3 className="token-title">Token Usage</h3>
        <div className="token-controls">
          <select
            className="token-select"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button className="token-refresh" onClick={fetchTokens} title="Refresh">
            🔄
          </button>
        </div>
      </div>

      {loading ? (
        <div className="activity-loading">
          <div className="loading-spinner" />
        </div>
      ) : usage.length === 0 ? (
        <div className="activity-empty">No token usage recorded yet.</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="token-summary">
            <div className="token-card">
              <div className="token-card-label">Total Tokens</div>
              <div className="token-card-value">{grandTotal.total.toLocaleString()}</div>
            </div>
            <div className="token-card">
              <div className="token-card-label">Prompt</div>
              <div className="token-card-value">{grandTotal.prompt.toLocaleString()}</div>
            </div>
            <div className="token-card">
              <div className="token-card-label">Completion</div>
              <div className="token-card-value">{grandTotal.completion.toLocaleString()}</div>
            </div>
            <div className="token-card">
              <div className="token-card-label">Requests</div>
              <div className="token-card-value">{usage.length.toLocaleString()}</div>
            </div>
          </div>

          {/* Line chart */}
          {sortedDates.length > 1 && (
            <TokenLineChart dates={[...sortedDates].reverse()} byDate={byDate} operations={opList} />
          )}

          {/* Per-model totals */}
          {Object.keys(totals).length > 0 && (
            <div className="token-models">
              {Object.entries(totals).map(([model, t]) => (
                <div key={model} className="token-model-row">
                  <span className="token-model-name">{model}</span>
                  <span className="token-model-stat">{t.total.toLocaleString()} tokens</span>
                </div>
              ))}
            </div>
          )}

          {/* Daily table */}
          <div className="token-table-wrap">
            <table className="token-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Requests</th>
                  <th>Prompt</th>
                  <th>Completion</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedDates.map((date) => (
                  <tr key={date}>
                    <td>{date}</td>
                    <td>{byDate[date].count}</td>
                    <td>{byDate[date].prompt.toLocaleString()}</td>
                    <td>{byDate[date].completion.toLocaleString()}</td>
                    <td>{byDate[date].total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const OP_COLORS = {
  extraction: "#4a9eff",
  embedding: "#4aff9e",
  dedup: "#ff9e4a",
  unknown: "#8888aa",
};

function TokenLineChart({ dates, byDate, operations }) {
  const [hover, setHover] = useState(null);
  const W = 600, H = 220, PAD = { top: 20, right: 20, bottom: 30, left: 55 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Build lines per operation + total
  const allSeries = [
    { key: "total", label: "Total", color: "#ffffff", width: 2, dash: "" },
    ...operations.map(op => ({
      key: op, label: op.charAt(0).toUpperCase() + op.slice(1),
      color: OP_COLORS[op] || "#8888aa", width: 1.5, dash: "",
    })),
  ];

  const maxVal = Math.max(...dates.map(d => byDate[d]?.total || 0), 1);

  const getPoints = (key) => dates.map((d, i) => ({
    x: PAD.left + (dates.length === 1 ? chartW / 2 : (i / (dates.length - 1)) * chartW),
    y: PAD.top + chartH - ((byDate[d]?.[key] || 0) / maxVal) * chartH,
    val: byDate[d]?.[key] || 0,
    date: d,
  }));

  const makePath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
    y: PAD.top + chartH - pct * chartH,
    label: Math.round(maxVal * pct).toLocaleString(),
  }));

  const step = Math.max(1, Math.floor(dates.length / 5));
  const xLabels = dates.filter((_, i) => i % step === 0 || i === dates.length - 1).map(d => ({
    x: PAD.left + (dates.indexOf(d) / Math.max(dates.length - 1, 1)) * chartW,
    label: d.slice(5),
  }));

  const totalPoints = getPoints("total");

  return (
    <div style={{
      marginBottom: 16, padding: 14,
      background: "var(--bg-secondary)", borderRadius: 10,
      border: "1px solid rgba(74,158,255,0.1)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
          Daily Token Usage
        </span>
        <div style={{ display: "flex", gap: 12 }}>
          {allSeries.map(s => (
            <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: s.color }}>
              <span style={{ width: 12, height: 2, background: s.color, display: "inline-block", borderRadius: 1 }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y}
              stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={PAD.left - 6} y={t.y + 4} textAnchor="end"
              fill="rgba(255,255,255,0.3)" fontSize={9}>{t.label}</text>
          </g>
        ))}

        {/* Total area fill */}
        <path d={makePath(totalPoints) + ` L${totalPoints[totalPoints.length - 1].x},${PAD.top + chartH} L${totalPoints[0].x},${PAD.top + chartH} Z`}
          fill="rgba(255,255,255,0.04)" />

        {/* Per-operation lines */}
        {operations.map(op => {
          const pts = getPoints(op);
          const color = OP_COLORS[op] || "#8888aa";
          return <path key={op} d={makePath(pts)} fill="none" stroke={color} strokeWidth={1.5}
            strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />;
        })}

        {/* Total line */}
        <path d={makePath(totalPoints)} fill="none" stroke="#ffffff" strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Hover targets (invisible wider hit areas) */}
        {totalPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 5 : 3}
            fill={hover === i ? "#fff" : "rgba(255,255,255,0.6)"} stroke="#fff" strokeWidth={1}
            style={{ cursor: "pointer", transition: "r 0.15s" }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}

        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 6} textAnchor="middle"
            fill="rgba(255,255,255,0.3)" fontSize={9}>{l.label}</text>
        ))}

        {hover !== null && totalPoints[hover] && (
          <g>
            <line x1={totalPoints[hover].x} y1={PAD.top} x2={totalPoints[hover].x} y2={PAD.top + chartH}
              stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3,3" />
            <rect x={Math.min(totalPoints[hover].x - 55, W - PAD.right - 110)}
              y={Math.max(totalPoints[hover].y - 14 - operations.length * 14, PAD.top)}
              width={110} height={16 + operations.length * 14}
              rx={6} fill="rgba(10,10,26,0.92)" stroke="rgba(255,255,255,0.15)" />
            <text x={Math.min(totalPoints[hover].x, W - PAD.right - 55)}
              y={Math.max(totalPoints[hover].y - operations.length * 14, PAD.top + 12)}
              textAnchor="middle" fill="#fff" fontSize={10} fontWeight={600}>
              {totalPoints[hover].date.slice(5)} · {totalPoints[hover].val.toLocaleString()}
            </text>
            {operations.map((op, oi) => {
              const v = byDate[dates[hover]]?.[op] || 0;
              const ty = Math.max(totalPoints[hover].y - operations.length * 14, PAD.top + 12) + 14 * (oi + 1);
              return (
                <text key={op}
                  x={Math.min(totalPoints[hover].x, W - PAD.right - 55)}
                  y={ty} textAnchor="middle"
                  fill={OP_COLORS[op] || "#888"} fontSize={9}>
                  {op}: {v.toLocaleString()}
                </text>
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}
