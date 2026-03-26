/**
 * Initialize Neo4j indexes for search performance.
 * Creates full-text indexes if they don't exist.
 * Also sanitizes edge data to prevent graphiti-core pydantic errors.
 */
export async function initIndexes(driver, logger) {
  const { query } = await import("./neo4j.js");
  const indexes = [
    {
      name: "entity_fulltext",
      cypher: `CREATE FULLTEXT INDEX entity_fulltext IF NOT EXISTS FOR (n:Entity) ON EACH [n.name, n.summary]`,
    },
    {
      name: "entity_created_at",
      cypher: `CREATE INDEX entity_created_at IF NOT EXISTS FOR (n:Entity) ON (n.created_at)`,
    },
  ];

  for (const idx of indexes) {
    try {
      await query(driver, idx.cypher);
      logger?.info?.(`Index ${idx.name}: ready`);
    } catch (err) {
      // Index may already exist or syntax may differ across Neo4j versions
      logger?.debug?.(`Index ${idx.name}: ${err.message}`);
    }
  }

  // Sanitize edges: backfill NULL group_id and episodes fields.
  // graphiti-core's EntityEdge pydantic model requires these fields to be non-null.
  // NULL values can be created by direct Cypher writes (e.g. old evolve/save code).
  try {
    const result = await query(driver,
      `MATCH ()-[r:RELATES_TO]->()
       WHERE r.group_id IS NULL OR r.episodes IS NULL
       SET r.group_id = COALESCE(r.group_id, ""),
           r.episodes = COALESCE(r.episodes, [])
       RETURN count(r) AS fixed`
    );
    const fixed = result[0]?.fixed || 0;
    if (fixed > 0) {
      logger?.info?.(`Sanitized ${fixed} edges with NULL group_id/episodes`);
    }
  } catch (err) {
    logger?.warn?.(`Edge sanitization failed: ${err.message}`);
  }
}
