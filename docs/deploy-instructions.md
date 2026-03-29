# MindReader V2 — Deployment Instructions

These instructions deploy MindReader V2 from the monorepo at `/mnt/e/project/mindreaderv2/` to both standalone mode and the OpenClaw extension at `~/.openclaw/extensions/mindreader/`.

## Prerequisites

- MindReader monorepo at `/mnt/e/project/mindreaderv2/` with latest code on `main` branch
- Node.js 18+ installed
- Neo4j running at `bolt://localhost:7687`
- `.env` file configured at monorepo root

## Step 1: Build the standalone UI

```bash
cd /mnt/e/project/mindreaderv2/packages/mindreader-ui/ui
npm install --silent
npx vite build
```

Verify: `ls dist/assets/index-*.js` should show a compiled JS bundle.

## Step 2: Sync server files to OpenClaw extension

```bash
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/server.js ~/.openclaw/extensions/mindreader/server/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/config.js ~/.openclaw/extensions/mindreader/server/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/neo4j.js ~/.openclaw/extensions/mindreader/server/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/init-indexes.js ~/.openclaw/extensions/mindreader/server/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/lib/constants.js ~/.openclaw/extensions/mindreader/server/lib/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/lib/decay.js ~/.openclaw/extensions/mindreader/server/lib/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/lib/details.js ~/.openclaw/extensions/mindreader/server/lib/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/lib/llm.js ~/.openclaw/extensions/mindreader/server/lib/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/lib/migrations.js ~/.openclaw/extensions/mindreader/server/lib/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/lib/preprocessor.js ~/.openclaw/extensions/mindreader/server/lib/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/lib/categorizer.js ~/.openclaw/extensions/mindreader/server/lib/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/lib/daemon.js ~/.openclaw/extensions/mindreader/server/lib/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/routes/graph.js ~/.openclaw/extensions/mindreader/server/routes/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/routes/entity.js ~/.openclaw/extensions/mindreader/server/routes/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/routes/evolve.js ~/.openclaw/extensions/mindreader/server/routes/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/routes/search.js ~/.openclaw/extensions/mindreader/server/routes/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/routes/cli.js ~/.openclaw/extensions/mindreader/server/routes/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/routes/cleanup.js ~/.openclaw/extensions/mindreader/server/routes/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/routes/decay.js ~/.openclaw/extensions/mindreader/server/routes/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/routes/audit.js ~/.openclaw/extensions/mindreader/server/routes/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/routes/tokens.js ~/.openclaw/extensions/mindreader/server/routes/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/routes/directEntity.js ~/.openclaw/extensions/mindreader/server/routes/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/server/routes/categories.js ~/.openclaw/extensions/mindreader/server/routes/
```

## Step 3: Sync UI source to extension and build

```bash
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/ui/src/App.jsx ~/.openclaw/extensions/mindreader/ui/src/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/ui/src/main.jsx ~/.openclaw/extensions/mindreader/ui/src/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/ui/src/index.css ~/.openclaw/extensions/mindreader/ui/src/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/ui/src/constants.js ~/.openclaw/extensions/mindreader/ui/src/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/ui/src/useCategoryColors.js ~/.openclaw/extensions/mindreader/ui/src/
cp /mnt/e/project/mindreaderv2/packages/mindreader-ui/ui/src/components/*.jsx ~/.openclaw/extensions/mindreader/ui/src/components/

cd ~/.openclaw/extensions/mindreader/ui
npm install --silent
npx vite build
```

Verify: `ls dist/assets/index-*.js` should show a compiled JS bundle.

## Step 4: Sync plugin files

```bash
cp /mnt/e/project/mindreaderv2/packages/openclaw-plugin/index.js ~/.openclaw/extensions/mindreader/
cp /mnt/e/project/mindreaderv2/packages/openclaw-plugin/openclaw.plugin.json ~/.openclaw/extensions/mindreader/
cp /mnt/e/project/mindreaderv2/packages/openclaw-plugin/package.json ~/.openclaw/extensions/mindreader/
```

## Step 5: Restart OpenClaw gateway

```bash
openclaw gateway restart
```

## Step 6: Verify

```bash
# Check server is responding
curl -s http://localhost:18900/api/stats | python3 -m json.tool

# Check migrations ran
curl -s http://localhost:18900/api/decay/status | python3 -m json.tool

# Check UI is serving new build (look at the JS filename in the HTML)
curl -s http://localhost:18900/ | grep 'index-.*\.js'
```

Expected:
- `/api/stats` returns node/relationship counts
- `/api/decay/status` returns entity/edge stats with `avgStrength` values
- HTML references a recent `index-*.js` bundle

## Troubleshooting

| Issue | Fix |
|---|---|
| `vite: not found` | Run `npm install` in the `ui/` directory first |
| UI shows old version | Forgot to run `npx vite build` — source changes need compilation |
| Server changes not taking effect | Forgot to copy to extension dir or restart gateway |
| Migration errors in logs | Check Neo4j is running: `curl http://localhost:7687` |
| `EADDRINUSE` on port 18900 | Another instance is already running — kill it or change `UI_PORT` in `.env` |
