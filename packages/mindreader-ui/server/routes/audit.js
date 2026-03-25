/**
 * Audit routes — /api/audit, /api/audit/node/:name
 */
import neo4j from "neo4j-driver";
import { query, nodeToPlain } from "../neo4j.js";

export function registerRoutes(app, ctx) {
  const { driver, logger } = ctx;

  /**
   * GET /api/audit — List audit events
   * Query params: type (capture|recall), limit (default 50), offset (default 0)
   */
  app.get("/api/audit", async (req, res) => {
    try {
      const { type, limit = 50, offset = 0 } = req.query;
      const maxLimit = Math.min(parseInt(limit) || 50, 200);
      const safeOffset = Math.max(parseInt(offset) || 0, 0);

      let whereClause = "";
      const params = { limit: neo4j.int(maxLimit), offset: neo4j.int(safeOffset) };
      if (type === "capture" || type === "recall") {
        whereClause = "WHERE a.type = $type";
        params.type = type;
      }

      const countResult = await query(driver,
        `MATCH (a:AuditLog) ${whereClause} RETURN count(a) AS total`,
        params
      );
      const total = countResult[0]?.total || 0;

      const records = await query(driver,
        `MATCH (a:AuditLog)
         ${whereClause}
         RETURN a
         ORDER BY a.timestamp DESC
         SKIP $offset LIMIT $limit`,
        params
      );

      const events = records.map((rec) => {
        const n = rec.a ? nodeToPlain(rec.a) : rec;
        return {
          id: n.uuid || n._id,
          type: n.type,
          timestamp: n.timestamp,
          content: n.content,
          source: n.source,
          trigger: n.trigger,
          query: n.query,
          resultCount: n.resultCount,
          results: n.results,
          category: n.category || null,
        };
      });

      res.json({ events, total });
    } catch (err) {
      logger?.error?.(`MindReader audit API error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/audit/node/:name — Audit history for a specific entity
   */
  app.get("/api/audit/node/:name", async (req, res) => {
    try {
      const { name } = req.params;
      const searchName = name.toLowerCase();

      const records = await query(driver,
        `MATCH (a:AuditLog)
         WHERE toLower(a.content) CONTAINS $name
            OR toLower(a.query) CONTAINS $name
            OR toLower(a.results) CONTAINS $name
         RETURN a
         ORDER BY a.timestamp DESC
         LIMIT 20`,
        { name: searchName }
      );

      const events = records.map((rec) => {
        const n = rec.a ? nodeToPlain(rec.a) : rec;
        return {
          id: n.uuid || n._id,
          type: n.type,
          timestamp: n.timestamp,
          content: n.content,
          source: n.source,
          trigger: n.trigger,
          query: n.query,
          resultCount: n.resultCount,
          results: n.results,
          category: n.category || null,
        };
      });

      res.json({ events });
    } catch (err) {
      logger?.error?.(`MindReader audit node API error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });
}
