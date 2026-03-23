/**
 * Initialize Neo4j indexes for search performance.
 * Creates full-text indexes if they don't exist.
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
}
