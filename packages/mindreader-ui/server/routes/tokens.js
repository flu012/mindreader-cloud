/**
 * Token usage routes — /api/tokens
 */
import neo4j from "neo4j-driver";
import { query } from "../neo4j.js";

export function registerRoutes(app, ctx) {
  const { driver, logger } = ctx;

  /**
   * GET /api/tokens — Token usage aggregated by date and model
   * Query params: days (default 30)
   */
  app.get("/api/tokens", async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const maxDays = Math.min(parseInt(days) || 30, 365);

      const records = await query(driver,
        `MATCH (t:TokenUsage)
         WHERE t.timestamp >= datetime() - duration({days: $days})
         RETURN t.date AS date, t.model AS model,
                t.promptTokens AS promptTokens,
                t.completionTokens AS completionTokens,
                t.totalTokens AS totalTokens,
                t.operation AS operation,
                t.timestamp AS timestamp
         ORDER BY t.timestamp DESC`,
        { days: neo4j.int(maxDays) }
      );

      // Build totals by model
      const totals = {};
      for (const r of records) {
        const model = r.model || "unknown";
        if (!totals[model]) totals[model] = { prompt: 0, completion: 0, total: 0 };
        totals[model].prompt += r.promptTokens || 0;
        totals[model].completion += r.completionTokens || 0;
        totals[model].total += r.totalTokens || 0;
      }

      res.json({ usage: records, totals });
    } catch (err) {
      logger?.error?.(`MindReader tokens API error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });
}
