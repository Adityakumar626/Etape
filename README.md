# 🌍 Étape: Multi-Agent Travel Orchestration Engine

> **A production-grade, stateful multi-agent travel concierge platform powered by LangGraph, Model Context Protocol (MCP), Supabase PostgreSQL checkpointing, Docker multi-stage containers, and Next.js 16 Turbopack.**

[![Python 3.13](https://img.shields.io/badge/Python-3.13-blue.svg)](https://www.python.org/)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.2+-emerald.svg)](https://github.com/langchain-ai/langgraph)
[![LangSmith](https://img.shields.io/badge/Observability-LangSmith%20Tracing-orange.svg)](https://smith.langchain.com/)
[![DeepEval](https://img.shields.io/badge/Evals-DeepEval%20LLM%20Testing-blueviolet.svg)](https://github.com/confident-ai/deepeval)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-teal.svg)](https://fastapi.tiangolo.com/)
[![Next.js 16](https://img.shields.io/badge/Frontend-Next.js%2016%20Turbopack-black.svg)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.3-61DAFB.svg)](https://react.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38B2AC.svg)](https://tailwindcss.com/)
[![MCP](https://img.shields.io/badge/Protocol-MCP-purple.svg)](https://modelcontextprotocol.io/)
[![Docker](https://img.shields.io/badge/Container-Docker%20Compose-2496ED.svg)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ⚡ Overview

**Étape** replaces brittle, monolithic travel chatbots with an autonomous team of coordinated AI specialists. Built on **LangGraph**, it queries real-time aviation corridors, inspects boutique luxury stays, streams atmospheric weather telemetry, and models budget velocity. Execution halts at a mandatory **Human-in-the-Loop (HITL)** approval gate before delivering a quiet-luxury editorial journey proposal curated by virtual concierge **Sofia Laurent**.

---

## 🏛️ System Architecture

```mermaid
graph TD
    User(["Traveler"]) <--> NextApp["Next.js 16 (App Router + Turbopack)"]
    NextApp <--> FastAPI["FastAPI ASGI Gateway (app.py)"]
    
    subgraph StateMachine ["LangGraph Directed Cyclic Graph (src/gptrip/backend.py)"]
        Supervisor["Supervisor Node (Guardrail & Routing)"]
        Flight["Flight Agent (AviationStack MCP)"]
        Hotel["Hotel Agent (Tavily MCP)"]
        Weather["Weather Agent (FastMCP)"]
        Budget["Budget Agent (Financial Analysis)"]
        Itinerary["Itinerary Curator"]
        HITL{"Human Approval Gate (interrupt())"}
        Sofia["Sofia Laurent (Persona Synthesis)"]
        Blocked["Guardrail Blocked Node"]
    end

    FastAPI --> Supervisor
    Supervisor -- "Off-topic" --> Blocked
    Supervisor -- "Valid" --> Flight --> Hotel --> Weather --> Budget --> Itinerary --> HITL
    
    HITL -- "interrupt() commits frame" --> SupabaseDB[("Supabase PostgreSQL Checkpointer")]
    SupabaseDB -- "Awaiting Approval" --> NextApp
    User -- "Approve / Inject Directives" --> FastAPI
    FastAPI -- "Command(resume=...)" --> Sofia --> NextApp

    %% Observability
    StateMachine -. Real-Time Spans .-> LangSmith[("LangSmith Tracing")]
```

---

## 🤖 Multi-Agent Specialist Roster

| Agent Node | Technology | Role & Deliverable |
| :--- | :--- | :--- |
| **Supervisor** | Groq (`openai/gpt-oss-20b`) | Input guardrail validation, constraint parsing, and dynamic specialist dispatch. |
| **Aviation Radar** | AviationStack MCP + `airportsdata` | Resolves IATA gateways, queries live scheduled air corridors, and formats transit cards. |
| **Accommodations** | Tavily Search MCP | Scopes boutique luxury hotels and private villas strictly to the trip **destination**. |
| **Climate Radar** | FastMCP + OpenWeather API | Fetches current atmospheric metrics (temp, humidity, wind) and a 5-day weather forecast. |
| **Financial Analyst** | Deterministic Math + Groq | Audits capital allocation (stays, flights, dining, contingency) and daily burn rate. |
| **Itinerary Curator** | Groq (`openai/gpt-oss-20b`) | Synthesizes an unhurried, day-by-day travel narrative structured for traveler review. |
| **Approval Gate** | LangGraph `interrupt()` | Pauses graph execution, persists state snapshot to Supabase, and awaits human directives. |
| **Sofia Laurent** | Groq Editorial Voice | Weaves feedback and specialist data into a quiet-luxury editorial journey proposal. |

---

## 💡 Core Engineering Highlights

- **Dynamic Routing & Two-Phase Guardrails**: Validates travel purview before tool execution. Off-topic requests are blocked immediately, conserving API quotas.
- **Strict Origin vs. Destination Isolation**: Scopes departure hubs strictly to flights, ensuring hotel and activity searches target only the destination.
- **Stateful Human-in-the-Loop (HITL)**: Utilizes LangGraph's native `interrupt()` primitive to suspend graph execution and `Command(resume=...)` to rehydrate state without polling loops.
- **Multi-Server MCP Protocol Fabric**: Integrates Tavily (streamable HTTP), AviationStack (`uvx` stdio), and a custom FastMCP Weather Server (Python stdio).
- **Durable State Checkpointing**: Employs `PostgresSaver` backed by a `psycopg_pool.ConnectionPool` connected to Supabase PostgreSQL for thread isolation and zero state loss.
- **Authorized PDF Dossier Export**: Completed proposals feature a **Download PDF Dossier** button that leverages `@media print` stylesheets to strip UI controls and export an immaculate, print-ready document.
- **Full Observability & Cost Telemetry**: Native LangSmith instrumentation profiles execution latency, token consumption, and JSON-RPC tool calls.

---

## 🚀 Quickstart

### 1. Environment Configuration (`.env`)

```bash
cp .env.example .env
```

Configure your API keys and Supabase connection pooler:

```env
# LLM Inference & Search
GROQ_API_KEY="gsk_..."
TAVILY_API_KEY="tvly-..."

# Persistence (Supabase PostgreSQL Pooler)
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require"

# Client Routing
NEXT_PUBLIC_API_URL="http://localhost:8000"

# Specialist Telemetry (Optional)
AVIATIONSTACK_API_KEY="your_aviationstack_key"
OPENWEATHER_API_KEY="your_openweather_key"
DEFAULT_ORIGIN_IATA="DEL"

# Observability
LANGSMITH_TRACING="true"
LANGSMITH_API_KEY="lsv2_pt_..."
LANGSMITH_PROJECT="Etape"
```

### 2. 1-Click Deployment (Docker Compose)

```bash
# Build and run backend and frontend containers
docker compose up -d --build

# View real-time logs
docker compose logs -f
```
- **Web App**: [http://localhost:3000](http://localhost:3000)
- **API Health**: [http://localhost:8000/health](http://localhost:8000/health)

---

### 3. Local Development Setup

**Backend (Python 3.13 + uv):**
```bash
uv sync
uv run python app.py
```

**Frontend (Next.js 16 + npm):**
```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Testing & Evals

Run the **DeepEval** LLM-as-a-Judge test suite:

```bash
# Evaluates input guardrails, geographic scoping, and concierge editorial quality
uv run pytest evals/test_evals.py -v -s
```

---

## 📂 Repository Layout

```text
Etape/
├── app.py                         # FastAPI ASGI server, CORS & HITL resume endpoint
├── custom_weather_mcp_server.py   # Standalone FastMCP OpenWeather tool server
├── mcp_client.py                  # LangChain MultiServerMCPClient (Tavily, Aviation, Weather)
├── Dockerfile                     # Multi-stage Python 3.13 backend image (uv-based)
├── docker-compose.yml             # Orchestration for backend & frontend services
├── .env.example                   # Environment configuration template
├── pyproject.toml                 # uv dependency specifications
├── evals/                         # DeepEval LLM evaluation test suite
│   └── test_evals.py              # Guardrails, scoping & G-Eval editorial tests
├── src/
│   └── gptrip/
│       ├── backend.py             # LangGraph state machine, nodes, HITL & checkpointer
│       └── tools/flight_tool.py   # IATA route resolver & AviationStack engine
└── frontend/                      # Next.js 16 App Router (Turbopack)
    ├── app/
    │   ├── page.tsx               # Curated quiet-luxury landing page
    │   ├── chat/page.tsx          # Concierge chat console, widgets & PDF export
    │   └── navbar.tsx             # Luxury navigation bar
    └── package.json               # Next.js 16, React 19, Lucide, Tailwind CSS v4
```

---

## 📄 License

MIT License. Built for stateful agentic workflows and multi-agent system research.
