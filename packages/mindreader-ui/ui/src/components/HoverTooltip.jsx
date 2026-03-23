import { useCategoryColors } from "../useCategoryColors";

export default function HoverTooltip({ node, position }) {
  const { colors } = useCategoryColors();
  if (!node) return null;

  const glowColor = colors[node.category] || colors.other || "#8888aa";

  return (
    <div
      className="hover-tooltip"
      style={{
        position: "fixed",
        left: position?.x || 0,
        top: position?.y || 0,
        transform: "translate(15px, 15px)",
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      <div
        className="tooltip-glow-bar"
        style={{ backgroundColor: glowColor, color: glowColor }}
      />
      <div className="tooltip-header">
        <span className="tooltip-name">{node.name}</span>
        <span className="tooltip-type">{node.category}</span>
      </div>
      {node.summary && (
        <div className="tooltip-summary">
          {node.summary.length > 200 ? node.summary.slice(0, 200) + "…" : node.summary}
        </div>
      )}
      <div className="tooltip-meta">
        <span>{"\uD83D\uDCCA"} {node.labels?.join(", ") || "Entity"}</span>
        {node.created_at && <span>{"\uD83D\uDCC5"} {formatDate(node.created_at)}</span>}
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-NZ", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateStr;
  }
}
