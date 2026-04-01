# MindReader Cloud

Multi-tenant cloud version of [MindReader V2](https://github.com/flu012/mindreaderv2) -- personal knowledge graph as a service.

## Quick Start

### Prerequisites

- Docker + Docker Compose
- An LLM API key (OpenAI, DashScope, Anthropic, or Ollama)
- Clone the open-source MindReader V2 repo alongside this one

### Setup

```bash
# Clone both repos
git clone https://github.com/flu012/mindreaderv2.git
git clone https://github.com/flu012/mindreader-cloud.git
cd mindreader-cloud

# Configure LLM
cp .env.example .env
# Edit .env with your LLM API key

# Start all services
docker compose up -d
```

The API will be available at `http://localhost:5000`.

### Register & Use

```bash
# Register
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourPass123!","name":"Your Name"}'

# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourPass123!"}'

# Use the token to access graph APIs
curl http://localhost:5000/api/v1/graph/graph?limit=100 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Architecture

```
User -> Cloud API (.NET 8, port 5000)
         | proxy with X-Tenant-Id
       MindReader Express (internal)
         |
       Neo4j (knowledge graph)
```

- **.NET API** handles auth, tenants, usage limits
- **MindReader Express** handles graph operations (internal only)
- **Neo4j** stores the knowledge graph
- **SQL Server** stores users, tenants, billing

## Free Tier

- 100 entities
- 500 relationships
- 5 evolves per day

## License

MIT
