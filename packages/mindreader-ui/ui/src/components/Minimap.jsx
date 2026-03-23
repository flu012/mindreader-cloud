import { useRef, useEffect, useState } from "react";

export default function Minimap({ data, colors }) {
  const canvasRef = useRef(null);
  const [tick, setTick] = useState(0);

  // Re-render minimap every 2 seconds to pick up updated positions
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.nodes.length) return;
    const ctx = canvas.getContext("2d");
    const w = 180, h = 180;

    ctx.fillStyle = "rgba(10, 10, 30, 0.9)";
    ctx.fillRect(0, 0, w, h);

    // Calculate bounds from actual positions
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let hasPositions = false;

    for (const n of data.nodes) {
      const x = n.x, y = n.y;
      if (x === undefined || y === undefined) continue;
      hasPositions = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    if (!hasPositions) {
      // No positions yet — draw placeholder
      ctx.fillStyle = "#8888aa";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Loading...", w / 2, h / 2);
      return;
    }

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 15;

    const mapX = (x) => pad + (x - minX) / rangeX * (w - 2 * pad);
    const mapY = (y) => pad + (y - minY) / rangeY * (h - 2 * pad);

    // Draw links
    ctx.strokeStyle = "rgba(74, 158, 255, 0.1)";
    ctx.lineWidth = 0.5;
    for (const link of data.links) {
      const s = typeof link.source === "object" ? link.source : null;
      const t = typeof link.target === "object" ? link.target : null;
      if (!s || !t || s.x == null || t.x == null) continue;
      ctx.beginPath();
      ctx.moveTo(mapX(s.x), mapY(s.y));
      ctx.lineTo(mapX(t.x), mapY(t.y));
      ctx.stroke();
    }

    // Draw nodes with bloom-like glow
    for (const n of data.nodes) {
      if (n.x == null || n.y == null) continue;
      const px = mapX(n.x);
      const py = mapY(n.y);
      const color = colors[n.group] || colors.other || "#8888aa";

      // Outer glow (larger semi-transparent circle)
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = color.replace(")", ", 0.15)").replace("rgb(", "rgba(");
      // Use a simpler approach for hex colors
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Inner dot
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }, [data, colors, tick]);

  return (
    <div className="minimap">
      <div className="minimap-label">Overview</div>
      <canvas ref={canvasRef} width={180} height={180} style={{ display: "block" }} />
    </div>
  );
}
