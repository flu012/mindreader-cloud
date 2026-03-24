#!/usr/bin/env node
/**
 * MindReader API Integration Test Suite
 *
 * Tests all API endpoints against a test server instance.
 * Records timing for each call. Cleans up test data afterwards.
 * Outputs results to docs/test-results.md
 *
 * Usage:
 *   node scripts/test-api.mjs                    # uses demo Neo4j on port 7688
 *   NEO4J_PORT=7687 node scripts/test-api.mjs    # uses real Neo4j (careful!)
 */

import { startServer } from "../packages/mindreader-ui/server/server.js";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const TEST_PORT = 18999;
const NEO4J_PORT = process.env.NEO4J_PORT || "7688";
const NEO4J_PASS = process.env.NEO4J_PASS || "demo-password";
const BASE = `http://localhost:${TEST_PORT}`;
const TEST_PREFIX = "__test__"; // prefix for all test entities

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const results = [];
let passCount = 0;
let failCount = 0;
let skipCount = 0;

async function test(group, name, fn) {
  const start = performance.now();
  let status = "PASS";
  let error = "";
  try {
    await fn();
    passCount++;
  } catch (e) {
    status = "FAIL";
    error = String(e.message || e).slice(0, 200);
    failCount++;
  }
  const ms = (performance.now() - start).toFixed(1);
  results.push({ group, name, status, ms, error });
  const icon = status === "PASS" ? "\u2713" : "\u2717";
  const errSuffix = error ? ` \u2014 ${error}` : "";
  console.log(`  ${icon} ${name} (${ms}ms)${errSuffix}`);
}

function skip(group, name, reason) {
  results.push({ group, name, status: "SKIP", ms: "-", error: reason });
  skipCount++;
  console.log(`  \u25CB ${name} (SKIP: ${reason})`);
}

async function api(method, urlPath, body, expectStatus = 200) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${urlPath}`, opts);
  if (res.status !== expectStatus) {
    const text = await res.text().catch(() => "");
    throw new Error(`Expected ${expectStatus}, got ${res.status}: ${text.slice(0, 120)}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) return res.json();
  return res.text();
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion failed");
}

// ---------------------------------------------------------------------------
// Test Data Seed & Cleanup (via Neo4j HTTP API)
// ---------------------------------------------------------------------------
const NEO4J_HTTP_PORT = NEO4J_PORT === "7688" ? "7475" : "7474";
const NEO4J_URL = `http://localhost:${NEO4J_HTTP_PORT}/db/neo4j/tx/commit`;
const NEO4J_AUTH = "Basic " + Buffer.from(`neo4j:${NEO4J_PASS}`).toString("base64");

async function cypher(statement, params = {}) {
  const res = await fetch(NEO4J_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: NEO4J_AUTH },
    body: JSON.stringify({ statements: [{ statement, parameters: params }] }),
  });
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors[0].message);
  return data.results[0];
}

async function seedTestData() {
  await cypher(`
    UNWIND $entities AS e
    CREATE (n:Entity {
      name: e.name, summary: e.summary, category: e.cat,
      group_id: e.cat, tags: e.tags, node_type: 'entity',
      created_at: datetime(), uuid: randomUUID()
    })
  `, {
    entities: [
      { name: `${TEST_PREFIX}Alice`, summary: "Test person entity", cat: "person", tags: ["test", "person"] },
      { name: `${TEST_PREFIX}Bob`, summary: "Another test person", cat: "person", tags: ["test", "person"] },
      { name: `${TEST_PREFIX}ProjectX`, summary: "Test project entity", cat: "project", tags: ["test", "project"] },
      { name: `${TEST_PREFIX}ToolY`, summary: "Test tool entity", cat: "infrastructure", tags: ["test", "tool"] },
      { name: `${TEST_PREFIX}OrgZ`, summary: "Test organization", cat: "companies", tags: ["test", "org"] },
      { name: `${TEST_PREFIX}MergeSrc`, summary: "Entity to merge from", cat: "person", tags: ["test", "merge"] },
      { name: `${TEST_PREFIX}MergeDst`, summary: "Entity to merge into", cat: "person", tags: ["test", "merge"] },
      { name: `${TEST_PREFIX}ToDelete`, summary: "Entity to be deleted", cat: "other", tags: ["test", "delete"] },
    ],
  });

  // Create relationships
  const rels = [
    { a: `${TEST_PREFIX}Alice`, b: `${TEST_PREFIX}ProjectX`, name: "works_on", fact: "Alice works on ProjectX" },
    { a: `${TEST_PREFIX}Bob`, b: `${TEST_PREFIX}OrgZ`, name: "member_of", fact: "Bob is member of OrgZ" },
    { a: `${TEST_PREFIX}ProjectX`, b: `${TEST_PREFIX}ToolY`, name: "uses", fact: "ProjectX uses ToolY" },
    { a: `${TEST_PREFIX}MergeSrc`, b: `${TEST_PREFIX}Alice`, name: "knows", fact: "MergeSrc knows Alice" },
    { a: `${TEST_PREFIX}ToDelete`, b: `${TEST_PREFIX}Bob`, name: "to_delete_rel", fact: "ToDelete relates to Bob" },
  ];
  for (const r of rels) {
    await cypher(`
      MATCH (a:Entity {name: $a}), (b:Entity {name: $b})
      CREATE (a)-[:RELATES_TO {name: $name, fact: $fact, created_at: datetime(), uuid: randomUUID()}]->(b)
    `, r);
  }
}

async function cleanupTestData() {
  await cypher(`MATCH (n:Entity) WHERE n.name STARTS WITH $prefix DETACH DELETE n`, { prefix: TEST_PREFIX });
  await cypher(`MATCH (c:Category) WHERE c.key STARTS WITH $prefix DETACH DELETE c`, { prefix: TEST_PREFIX });
}

// ---------------------------------------------------------------------------
// API Tests
// ---------------------------------------------------------------------------
async function runApiTests() {

  // == Graph & Entity ======================================================
  console.log("\n\uD83D\uDCCA Graph & Entity Endpoints");

  await test("Graph", "GET /api/graph", async () => {
    const data = await api("GET", "/api/graph");
    assert(Array.isArray(data.nodes), "nodes should be array");
    assert(Array.isArray(data.links), "links should be array");
    assert(data.nodes.length > 0, "should have nodes");
  });

  await test("Graph", "GET /api/graph?limit=5", async () => {
    const data = await api("GET", "/api/graph?limit=5");
    assert(Array.isArray(data.nodes), "nodes should be array");
  });

  await test("Entity", "GET /api/entity/:name (found)", async () => {
    const data = await api("GET", `/api/entity/${encodeURIComponent(`${TEST_PREFIX}Alice`)}`);
    assert(data.entity, "should have entity");
    assert(data.entity.name === `${TEST_PREFIX}Alice`, "name should match");
    assert(Array.isArray(data.relationships), "should have relationships");
  });

  await test("Entity", "GET /api/entity/:name (not found)", async () => {
    await api("GET", `/api/entity/${encodeURIComponent("nonexistent_entity_12345")}`, null, 404);
  });

  await test("Entity", "PUT /api/entity/:name (update tags)", async () => {
    const data = await api("PUT", `/api/entity/${encodeURIComponent(`${TEST_PREFIX}Alice`)}`, {
      tags: ["test", "person", "updated"],
    });
    assert(data.entity, "should return entity object");
  });

  await test("Entity", "PUT /api/entity/:name (update category)", async () => {
    const data = await api("PUT", `/api/entity/${encodeURIComponent(`${TEST_PREFIX}ToolY`)}`, {
      category: "infrastructure",
    });
    assert(data.entity, "should return entity object");
  });

  await test("Entity", "PUT /api/entity/:name/summary", async () => {
    const data = await api("PUT", `/api/entity/${encodeURIComponent(`${TEST_PREFIX}Alice`)}/summary`, {
      summary: "Updated test person summary",
    });
    assert(data.ok === true, "should return ok: true");
  });

  await test("Entity", "GET /api/entity/:name/delete-preview", async () => {
    const data = await api("GET", `/api/entity/${encodeURIComponent(`${TEST_PREFIX}ToDelete`)}/delete-preview`);
    assert(data.entity, "should have entity");
    assert(Array.isArray(data.relationships), "should have relationships array");
    assert(typeof data.episodicLinks === "number", "should have episodicLinks count");
  });

  await test("Entity", "DELETE /api/entity/:name", async () => {
    await api("DELETE", `/api/entity/${encodeURIComponent(`${TEST_PREFIX}ToDelete`)}`);
    await api("GET", `/api/entity/${encodeURIComponent(`${TEST_PREFIX}ToDelete`)}`, null, 404);
  });

  // == Listing & Search ====================================================
  console.log("\n\uD83D\uDD0D Listing & Search Endpoints");

  await test("Search", "GET /api/entities", async () => {
    const data = await api("GET", "/api/entities?limit=10");
    assert(Array.isArray(data.entities), "should have entities array");
    assert(typeof data.total === "number", "should have total count");
  });

  await test("Search", "GET /api/entities?q=<query>", async () => {
    const data = await api("GET", `/api/entities?q=${TEST_PREFIX}Alice&limit=5`);
    assert(Array.isArray(data.entities), "should have entities array");
  });

  await test("Search", "GET /api/entities?sort=created_at&order=desc", async () => {
    const data = await api("GET", "/api/entities?sort=created_at&order=desc&limit=5");
    assert(Array.isArray(data.entities), "should have entities array");
  });

  await test("Search", "GET /api/search", async () => {
    const data = await api("GET", `/api/search?q=${TEST_PREFIX}&limit=5`);
    assert(Array.isArray(data.entities), "entities should be array");
  });

  await test("Search", "GET /api/timeline", async () => {
    const data = await api("GET", "/api/timeline?days=30");
    assert(data.timeline, "should have timeline object");
    assert("today" in data.timeline || "earlier" in data.timeline, "should have time groups");
  });

  // == Link & Merge ========================================================
  console.log("\n\uD83D\uDD17 Link & Merge Endpoints");

  await test("Link", "POST /api/link", async () => {
    const data = await api("POST", "/api/link", {
      sourceName: `${TEST_PREFIX}Bob`,
      targetName: `${TEST_PREFIX}ProjectX`,
      relationName: "contributes_to",
      fact: "Bob contributes to ProjectX",
    });
    assert(data.ok === true, "should return ok: true");
  });

  await test("Link", "POST /api/link (missing fields)", async () => {
    await api("POST", "/api/link", { sourceName: "A" }, 400);
  });

  await test("Merge", "POST /api/merge", async () => {
    const data = await api("POST", "/api/merge", {
      keepName: `${TEST_PREFIX}MergeDst`,
      mergeName: `${TEST_PREFIX}MergeSrc`,
    });
    assert(data.ok === true, "should return ok: true");
    assert(typeof data.transferred === "number", "should report transferred count");
    // Verify source is gone
    await api("GET", `/api/entity/${encodeURIComponent(`${TEST_PREFIX}MergeSrc`)}`, null, 404);
  });

  await test("Merge", "POST /api/merge (missing fields)", async () => {
    await api("POST", "/api/merge", { keepName: "A" }, 400);
  });

  // == Categories ==========================================================
  console.log("\n\uD83C\uDFF7\uFE0F Category Endpoints");

  await test("Categories", "GET /api/categories", async () => {
    const data = await api("GET", "/api/categories");
    assert(Array.isArray(data), "should return categories array");
    assert(data.length > 0, "should have categories");
    assert(data[0].key, "category should have key");
  });

  await test("Categories", "POST /api/categories (create)", async () => {
    const data = await api("POST", "/api/categories", {
      key: `${TEST_PREFIX}custom`,
      label: "Test Custom",
      color: "#ff0000",
      keywords: "test,custom",  // comma-separated string
      order: 99,
    });
    assert(data.created || data.key || data.ok, "should confirm category created");
  });

  await test("Categories", "PUT /api/categories/:key", async () => {
    const data = await api("PUT", `/api/categories/${TEST_PREFIX}custom`, {
      label: "Test Custom Updated",
      color: "#00ff00",
    });
    assert(data.ok === true, "should return ok: true");
  });

  await test("Categories", "GET /api/categories/:key/entities", async () => {
    const data = await api("GET", "/api/categories/person/entities");
    assert(Array.isArray(data), "should return entities array");
  });

  await test("Categories", "DELETE /api/categories/:key", async () => {
    const data = await api("DELETE", `/api/categories/${TEST_PREFIX}custom`);
    assert(data.deleted === `${TEST_PREFIX}custom`, "should confirm deletion");
  });

  // == Stats & Info ========================================================
  console.log("\n\uD83D\uDCC8 Stats & Info Endpoints");

  await test("Stats", "GET /api/stats", async () => {
    const data = await api("GET", "/api/stats");
    assert(data.totals, "should have totals");
    assert(typeof data.totals.nodes === "number" || typeof data.totals.relationships === "number", "totals should have counts");
  });

  await test("Stats", "GET /api/projects", async () => {
    const data = await api("GET", "/api/projects");
    assert(Array.isArray(data) || data.projects, "should return projects");
  });

  await test("Stats", "GET /api/tokens", async () => {
    const data = await api("GET", "/api/tokens");
    assert(data !== undefined, "should return token data");
  });

  // == Cleanup & Maintenance ===============================================
  console.log("\n\uD83E\uDDF9 Cleanup & Maintenance Endpoints");

  await test("Cleanup", "GET /api/cleanup/scan", async () => {
    const data = await api("GET", "/api/cleanup/scan");
    assert(data !== undefined, "should return scan results");
  });

  await test("Cleanup", "POST /api/cleanup/execute (empty actions = 400)", async () => {
    await api("POST", "/api/cleanup/execute", { actions: [], orphan_uuids: [] }, 400);
  });

  await test("Cleanup", "POST /api/cleanup/execute (dry run)", async () => {
    const data = await api("POST", "/api/cleanup/execute", {
      actions: ["expired_relationships"],
      orphan_uuids: [],
      dryRun: true,
    });
    assert(data !== undefined, "should return execution results");
  });

  // == Relationships =======================================================
  console.log("\n\uD83D\uDD00 Relationship Endpoints");

  await test("Relationships", "GET /api/relationships/scan", async () => {
    const data = await api("GET", "/api/relationships/scan");
    assert(data !== undefined, "should return relationship scan");
  });

  // == Audit ===============================================================
  console.log("\n\uD83D\uDCCB Audit Endpoints");

  await test("Audit", "GET /api/audit", async () => {
    const data = await api("GET", "/api/audit");
    assert(data !== undefined, "should return audit data");
  });

  await test("Audit", "GET /api/audit/node/:name", async () => {
    const data = await api("GET", `/api/audit/node/${encodeURIComponent(`${TEST_PREFIX}Alice`)}`);
    assert(data !== undefined, "should return node audit data");
  });

  // == Custom Query ========================================================
  console.log("\n\uD83D\uDD27 Advanced Endpoints");

  await test("Query", "POST /api/query (read-only)", async () => {
    const data = await api("POST", "/api/query", {
      cypher: "MATCH (n:Entity) RETURN count(n) AS cnt",
      params: {},
    });
    assert(data.results !== undefined, "should return results");
  });

  await test("Query", "POST /api/query (write blocked = 403)", async () => {
    await api("POST", "/api/query", {
      cypher: "CREATE (n:Entity {name: 'hack'}) RETURN n",
      params: {},
    }, 403);
  });

  // == CLI Integration Endpoints ===========================================
  console.log("\n\uD83D\uDCBB CLI Integration Endpoints");

  await test("CLI API", "GET /api/cli/search", async () => {
    const data = await api("GET", `/api/cli/search?q=${TEST_PREFIX}&limit=5`);
    assert(data !== undefined, "should return search results");
  });

  await test("CLI API", "GET /api/cli/entities", async () => {
    const data = await api("GET", "/api/cli/entities?limit=5");
    assert(data !== undefined, "should return entities");
  });

  await test("CLI API", "POST /api/cli/recall", async () => {
    const data = await api("POST", "/api/cli/recall", {
      entities: [`${TEST_PREFIX}Alice`],
    });
    assert(data !== undefined, "should return recall results");
  });

  await test("CLI API", "POST /api/cli/capture", async () => {
    const data = await api("POST", "/api/cli/capture", {
      context: `${TEST_PREFIX} user discussed a new topic`,
      source: "test-script",
    });
    assert(data !== undefined, "should return capture result");
  });

  // cli/store calls python subprocess which requires graphiti — skip if unavailable
  skip("CLI API", "POST /api/cli/store", "Requires Python graphiti_core");

  // == LLM-dependent =======================================================
  console.log("\n\uD83E\uDD16 LLM-Dependent Endpoints");

  const hasLlmKey = !!process.env.LLM_API_KEY;
  if (hasLlmKey) {
    await test("LLM", "GET /api/entity/:name/summarize", async () => {
      const data = await api("GET", `/api/entity/${encodeURIComponent(`${TEST_PREFIX}Alice`)}/summarize`);
      assert(data.explanation || data.summary, "should return summary");
    });

    await test("LLM", "POST /api/recategorize (batch)", async () => {
      const data = await api("POST", "/api/recategorize", {
        scope: "other",
        batchSize: 2,
        skip: 0,
      });
      assert(data !== undefined, "should return recategorize result");
    });

    await test("LLM", "POST /api/entity/:name/evolve (SSE)", async () => {
      // Test that the SSE endpoint starts streaming
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(`${BASE}/api/entity/${encodeURIComponent(`${TEST_PREFIX}Alice`)}/evolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ focusQuestion: "test" }),
          signal: ctrl.signal,
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const ct = res.headers.get("content-type") || "";
        assert(ct.includes("text/event-stream"), "should be SSE stream");
        // Read first chunk to confirm streaming works
        const reader = res.body.getReader();
        const { value } = await reader.read();
        assert(value, "should receive data");
        reader.cancel();
      } finally {
        clearTimeout(timer);
      }
    });

    await test("LLM", "POST /api/entity/:name/evolve/save", async () => {
      const data = await api("POST", `/api/entity/${encodeURIComponent(`${TEST_PREFIX}Alice`)}/evolve/save`, {
        entities: [{ name: `${TEST_PREFIX}EvolvedEntity`, summary: "Test evolved", tags: ["test"] }],
        relationships: [],
      });
      assert(data !== undefined, "should return save result");
      // Cleanup evolved entity
      await cypher(`MATCH (n:Entity {name: $name}) DETACH DELETE n`, { name: `${TEST_PREFIX}EvolvedEntity` });
    });
  } else {
    skip("LLM", "GET /api/entity/:name/summarize", "No LLM_API_KEY");
    skip("LLM", "POST /api/recategorize", "No LLM_API_KEY");
    skip("LLM", "POST /api/entity/:name/evolve (SSE)", "No LLM_API_KEY");
    skip("LLM", "POST /api/entity/:name/evolve/save", "No LLM_API_KEY");
  }
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------
function generateReport() {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const totalMs = results.reduce((sum, r) => sum + (parseFloat(r.ms) || 0), 0).toFixed(1);

  let md = `# MindReader Test Results\n\n`;
  md += `**Run:** ${now}  \n`;
  md += `**Server:** localhost:${TEST_PORT}  \n`;
  md += `**Neo4j:** bolt://localhost:${NEO4J_PORT}  \n`;
  md += `**Total:** ${results.length} tests \u2014 ${passCount} passed, ${failCount} failed, ${skipCount} skipped  \n`;
  md += `**Total Time:** ${totalMs}ms  \n\n`;

  if (failCount === 0) {
    md += `> All tests passed.\n\n`;
  } else {
    md += `> ${failCount} test(s) failed.\n\n`;
  }

  // Group by category
  const groups = {};
  for (const r of results) {
    if (!groups[r.group]) groups[r.group] = [];
    groups[r.group].push(r);
  }

  for (const [group, tests] of Object.entries(groups)) {
    md += `## ${group}\n\n`;
    md += `| Status | Test | Time | Error |\n`;
    md += `|--------|------|------|-------|\n`;
    for (const t of tests) {
      const statusIcon = t.status === "PASS" ? "PASS" : t.status === "FAIL" ? "FAIL" : "SKIP";
      const errCell = t.error ? t.error.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 100) : "";
      md += `| ${statusIcon} | ${t.name} | ${t.ms}ms | ${errCell} |\n`;
    }
    md += "\n";
  }

  md += `---\n*Generated by \`scripts/test-api.mjs\`*\n`;

  const outPath = path.join(MONOREPO_ROOT, "docs", "test-results.md");
  writeFileSync(outPath, md);
  console.log(`\n\uD83D\uDCC4 Report saved to docs/test-results.md`);
  return outPath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("\uD83E\uDDEA MindReader Integration Tests");
  console.log(`   Neo4j: bolt://localhost:${NEO4J_PORT}`);
  console.log(`   Server: localhost:${TEST_PORT}`);

  let server;
  try {
    // Start test server
    console.log("\n\u23F3 Starting test server...");
    server = await startServer(
      {
        neo4jUri: `bolt://localhost:${NEO4J_PORT}`,
        neo4jUser: "neo4j",
        neo4jPassword: NEO4J_PASS,
        uiPort: TEST_PORT,
        llmApiKey: process.env.LLM_API_KEY || "",
        llmBaseUrl: process.env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
        llmModel: process.env.LLM_MODEL || "qwen3.5-flash",
        llmExtractModel: process.env.LLM_EXTRACT_MODEL || process.env.LLM_MODEL || "qwen3.5-flash",
        llmEvolveModel: process.env.LLM_EVOLVE_MODEL || process.env.LLM_MODEL || "qwen3.5-plus",
        apiToken: "",
        autoCapture: false,
        autoRecall: false,
        seqUrl: "",
      },
      { info: console.log, warn: console.warn, error: console.error }
    );
    console.log(`   \u2713 Server running on port ${TEST_PORT}`);

    // Seed test data
    console.log("\n\u23F3 Seeding test data...");
    await seedTestData();
    console.log("   \u2713 Test data seeded (8 entities, 5 relationships)");

    // Run tests
    await runApiTests();

  } catch (e) {
    console.error("\n\uD83D\uDCA5 Fatal error:", e.message);
    failCount++;
    results.push({ group: "Setup", name: "Server/Seed", status: "FAIL", ms: "-", error: e.message });
  } finally {
    // Cleanup test data
    console.log("\n\uD83E\uDDF9 Cleaning up test data...");
    try {
      await cleanupTestData();
      console.log("   \u2713 Test data cleaned up");
    } catch (e) {
      console.error("   \u2717 Cleanup failed:", e.message);
    }

    // Stop server
    if (server) {
      server.close?.();
      console.log("   \u2713 Server stopped");
    }

    // Generate report
    generateReport();

    // Summary
    console.log(`\n${"=".repeat(50)}`);
    console.log(`  Results: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
    console.log(`${"=".repeat(50)}`);

    process.exit(failCount > 0 ? 1 : 0);
  }
}

main();
