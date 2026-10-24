from langchain_core import messages
import os 
import certifi
from dotenv import load_dotenv

load_dotenv()

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

from typing import TypedDict, Annotated, Any
import operator
import uuid 
import asyncio

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
import json

from langgraph.graph import StateGraph , START, END
from langgraph.types import interrupt, Command 
from langgraph.checkpoint.postgres import PostgresSaver
from langchain_core.messages import (
    AnyMessage ,
    SystemMessage ,
    HumanMessage ,
    AIMessage ,
)
from langchain_groq import ChatGroq
from gptrip.tools.flight_tool import parse_route

from mcp_client import (
tavily_mcp_search,
aviation_mcp_call , 
weather_mcp_search , 
forecast_mcp_search , 
extract_destination
)

def get_database_url():
    database_url = os.getenv("DATABASE_URL")

    if not database_url :
        raise ValueError("DATABASE_URL not found in env ")

    if "sslmode=" not in database_url :
        separator = "&" if "?" in database_url else "?" 
        database_url = f"{database_url}{separator}sslmode=require"

    return database_url

GROQ_API_KEY = os.getenv("GROQ_API_KEY")


if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY not found in env ")


# LLM
llm = ChatGroq(
    model="openai/gpt-oss-20b", 
    temperature=0.3,
    max_tokens=4096,
    reasoning_effort="low",
    api_key=GROQ_API_KEY
)

# State
class TravelState(TypedDict, total = False):
    messages : Annotated[list[AnyMessage], operator.add]
    user_query : str

    # Supervisor + guardrail state
    guardrail_allowed: bool
    guardrail_reason: str
    selected_agents: list[str]
    trip_constraints: dict[str, Any]
    supervisor_reasoning: str

    # Original specialist results
    flight_results: str
    hotel_results: str
    weather_results: str
    itinerary: str

    # New budget + HITL state
    budget_results: str
    approval_request: str
    approved: bool
    human_feedback: str
    final_response: str

    llm_calls : int   



# ----------- Shared Helper --------- #
KNOWN_AGENTS = {
    "flight_agent",
    "hotel_agent",
    "weather_agent",
    "budget_agent",
    "itinerary_agent",
}

AGENT_ORDER = [
    "flight_agent",
    "hotel_agent",
    "weather_agent",
    "budget_agent",
    "itinerary_agent",
]

# Shorthand for calling or invoking the llm
def _llm_text (system_prompt : str, user_prompt:str):
    response = llm.invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
    )
    return str(response.content)

# converting llm response into json
def _json_from_llm(text:str) -> dict[str, Any]:
    """Extract the first complete json object returned by the model."""
    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1 or end < start:
        raise ValueError("The model did not return a JSON object")

    return json.loads(text[start : end+1])


def _empty_constraints() -> dict[str,Any]:
    return {
        "destination" : "",
        "origin": "",
        "duration":"",
        "budget" :"",
        "travel_style" :"",
        "special_preferences" :[], 
    }



# =========================
# Supervisor Agent + Input Guardrail
# =========================
def supervisor_agent(state: TravelState):
    query = state["user_query"]
    llm_calls = state.get("llm_calls", 0)

    guardrail_prompt = f"""
Determine whether the following request belongs to travel planning or travel
information. Valid requests can include destinations, flights, hotels, weather,
budgets, visas, transportation, sightseeing, food, packing, or itineraries.

Block clearly unrelated requests and requests asking for harmful or illegal
instructions. Do not block a valid travel request merely because some details
are missing.

Return strict JSON only:
{{
  "allowed": true,
  "reason": ""
}}

User request:
{query}
"""

    # Fail open on parser/model errors so a temporary JSON-format issue does not
    # break the original travel-planning behavior.
    try:
        guardrail_raw = _llm_text(
            "You are the input guardrail for a travel-planning application. "
            "Return strict JSON only.",
            guardrail_prompt,
        )
        guardrail_result = _json_from_llm(guardrail_raw)
        allowed = bool(guardrail_result.get("allowed", True))
        guardrail_reason = str(guardrail_result.get("reason", "")).strip()
        llm_calls += 1
    except Exception as exc:
        print(f"Guardrail fallback used: {exc}")
        allowed = True
        guardrail_reason = "Guardrail validation fallback allowed the request."

    if not allowed:
        reason = guardrail_reason or (
            "TripMate AI can only help with travel-planning requests. "
            "Please ask about a destination, flight, hotel, weather, budget, "
            "or itinerary."
        )
        return {
            "guardrail_allowed": False,
            "guardrail_reason": reason,
            "selected_agents": [],
            "trip_constraints": _empty_constraints(),
            "supervisor_reasoning": reason,
            "final_response": reason,
            "messages": [AIMessage(content=f"Guardrail blocked request: {reason}")],
            "llm_calls": llm_calls,
        }

    supervisor_prompt = f"""
You are the supervisor of a multi-agent travel-planning system.
Choose only the specialist agents needed for the request.

Available agents:
- flight_agent: flights, airports, airlines, routes, airfare, or booking advice
- hotel_agent: hotels, accommodation, neighborhoods, or places to stay
- weather_agent: weather, climate, season, forecast, or packing advice
- budget_agent: cost, affordability, price limits, or budget feasibility
- itinerary_agent: creates the integrated travel plan and must always be included

Return strict JSON only using this schema:
{{
  "selected_agents": ["flight_agent", "hotel_agent", "weather_agent", "budget_agent", "itinerary_agent"],
  "trip_constraints": {{
    "destination": "",
    "origin": "",
    "duration": "",
    "budget": "",
    "travel_style": "",
    "special_preferences": []
  }},
  "reasoning": ""
}}

User request:
{query}
"""

    try:
        supervisor_raw = _llm_text(
            "You route work to travel specialist agents. Return strict JSON only.",
            supervisor_prompt,
        )
        parsed = _json_from_llm(supervisor_raw)
        requested_agents = parsed.get("selected_agents", [])
        selected_agents = [
            name for name in AGENT_ORDER
            if name in requested_agents and name in KNOWN_AGENTS
        ]

        # The itinerary agent integrates whichever specialist results were selected.
        if "itinerary_agent" not in selected_agents:
            selected_agents.append("itinerary_agent")

        constraints = _empty_constraints()
        parsed_constraints = parsed.get("trip_constraints", {})
        if isinstance(parsed_constraints, dict):
            constraints.update(parsed_constraints)

        reasoning = str(parsed.get("reasoning", "")).strip()
        llm_calls += 1
    except Exception as exc:
        print(f"Supervisor fallback used: {exc}")
        # Original workflow behavior is preserved as the fallback.
        selected_agents = AGENT_ORDER.copy()
        constraints = _empty_constraints()
        reasoning = (
            "Supervisor parsing failed, so the original full travel workflow "
            "was selected as a safe fallback."
        )

    return {
        "guardrail_allowed": True,
        "guardrail_reason": guardrail_reason,
        "selected_agents": selected_agents,
        "trip_constraints": constraints,
        "supervisor_reasoning": reasoning,
        "messages": [AIMessage(content="Supervisor created the agent plan.")],
        "llm_calls": llm_calls,
    }


# =========================
# Guardrail blocked response
# =========================
def guardrail_blocked_agent(state: TravelState):
    reason = state.get("final_response") or state.get("guardrail_reason") or (
        "This request was blocked by the travel input guardrail."
    )
    return {
        "final_response": reason,
        "messages": [AIMessage(content=reason)],
    }


# Flight Tool Router Prompt
FLIGHT_AGENT_PROMPT = """You are an expert commercial aviation router.
User Query:
{query}
Real Live AviationStack MCP Departure Data:
{flight_data}
Generate 2 real flight corridor options for this journey in this EXACT format so the frontend transit cards can render:
Airline: <Airline Name>
Flight: <Flight Code e.g. SQ 943 or AI 2115>
Status: Scheduled
Departure:
- Airport: <Departure Airport Name>
- IATA: <3-letter Departure IATA code>
- Scheduled: <Departure Time, e.g. 09:15>
Arrival:
- Airport: <Arrival Airport Name>
- IATA: <3-letter Arrival IATA code>
- Scheduled: <Arrival Time, e.g. 17:45>
---
Also include:
- Typical flight duration
- Estimated airfare range
- Booking advice
"""


# Flight Agent using MCP
def flight_agent(state: TravelState):
    print("\nINSIDE FLIGHT AGENT (MCP)\n")
    query = state["user_query"]
    dep_iata, arr_iata = parse_route(query)
    origin_iata = dep_iata or os.getenv("DEFAULT_ORIGIN_IATA", "DEL")
    raw_flight_info = ""
    try:
        # Call working AviationStack MCP schedule board
        schedule = asyncio.run(
            aviation_mcp_call(
                "flight_arrival_departure_schedule",
                {
                    "airport_iata_code": origin_iata,
                    "schedule_type": "departure",
                    "airline_name": "Air India",
                    "number_of_flights": 2
                }
            )
        )

        if schedule and "api_error" not in str(schedule):
            raw_flight_info = str(schedule)[:3000]
    except Exception as e:
        print("Aviation MCP error:", e)


    prompt = FLIGHT_AGENT_PROMPT.format(
        query=query,
        flight_data=raw_flight_info or "Standard international commercial flights."
    )
    
    response = llm.invoke([
        SystemMessage(content="You are an expert travel flight planner."),
        HumanMessage(content=prompt)
    ])


    return {
        "flight_results": response.content,
        "messages": [AIMessage(content="Flight recommendations generated")],
        "llm_calls": state.get("llm_calls", 0) + 1
    }


# Hotel Agent
def hotel_agent(state: TravelState):
    constraints = state.get("trip_constraints", {})
    destination = (
        constraints.get("destination")
        or extract_destination(state["user_query"])
    ).strip()

    if not destination or destination.lower() in ["trip", "vacation", "holiday"]:
        destination = state["user_query"]

    query = f"top boutique luxury hotels resorts in {destination}"
    raw_hotel_search = asyncio.run(tavily_mcp_search(query))

    synthesis_prompt = f"""
Based on the real web search results below, extract 3 specific real luxury/boutique hotels located strictly in {destination}:

Destination: {destination}
Trip Context: {state['user_query']}

Search Results:
{raw_hotel_search}

Format each hotel as:
- **Hotel Name** (Neighborhood / Area in {destination})
- Rate: Realistic price range per night
- Highlights: 1-2 evocative sentences on why this property is special.

CRITICAL INSTRUCTIONS:
- Every hotel MUST be located in {destination} (the trip destination), NEVER in the departure or origin city.
- Do NOT output raw URLs, broken image tags, or Facebook forums. Extract real properties from the web search above.
"""
    try:
        response = llm.invoke([
            SystemMessage(content="You are an expert luxury hotel advisor."),
            HumanMessage(content=synthesis_prompt)
        ])
        curated_hotels = response.content
    except Exception:
        curated_hotels = raw_hotel_search

    return {
        "hotel_results": curated_hotels,
        "messages": [
            AIMessage(content="Hotel information fetched.")
        ],
        "llm_calls": state.get("llm_calls", 0) + 1
    }

# Weather Agent
def weather_agent(state: TravelState):
    constraints = state.get("trip_constraints", {})
    destination = (
        constraints.get("destination")
        or extract_destination(state["user_query"])
    ).strip()
    city = destination or state["user_query"]

    weather_data = asyncio.run(weather_mcp_search(city))
    forecast_data = asyncio.run(forecast_mcp_search(city))

    return {
        "weather_results": f"""
        Current Weather in {city}:
        {weather_data}

        Forecast for {city}:
        {forecast_data}
        """,
        "messages": [
            AIMessage(
                content=f"Weather information fetched for {city}"
            )
        ]
    }


# Budget Agent 

def budget_agent(state: TravelState):
    prompt = f"""
Analyze whether this trip is realistic for the user's budget.

User Query:
{state['user_query']}

Trip Constraints:
{state.get('trip_constraints', {})}

Flight Results:
{state.get('flight_results', '')}

Hotel Results:
{state.get('hotel_results', '')}

Weather Results:
{state.get('weather_results', '')}

Return:
1. Estimated cost categories
2. Budget risk areas
3. Money-saving suggestions
4. Overall feasibility

If exact live prices are unavailable, clearly label estimates as approximate.
"""

    response = llm.invoke(
        [
            SystemMessage(content="You are a practical travel budget analyst."),
            HumanMessage(content=prompt),
        ]
    )

    return {
        "budget_results": response.content,
        "messages": [AIMessage(content="Budget assessment generated.")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# Itinerary Agent
def itinerary_agent(state: TravelState):
    constraints = state.get("trip_constraints", {})
    destination = (
        constraints.get("destination")
        or extract_destination(state["user_query"])
    ).strip()
    origin = constraints.get("origin", "").strip()

    context_routing = ""
    if origin and destination:
        context_routing = f"Origin / Departure: {origin}\nDestination: {destination}\n"

    prompt = f"""
Create a complete travel itinerary for the destination.

User Query:
{state['user_query']}

{context_routing}
Flight Results:
{state.get('flight_results', '')}

Hotel Results (Accommodations at Destination):
{state.get('hotel_results', '')}

Weather Results (Destination Climate):
{state.get('weather_results', '')}

Budget Results:
{state.get('budget_results', '')}

CRITICAL: The daily itinerary must be set in the destination ({destination or 'the destination'}), detailing stays and activities there.
Make the itinerary practical, budget-aware, and easy to follow.
"""
    response = llm.invoke([
        SystemMessage(content="You are an expert travel planner."),
        HumanMessage(content=prompt)
    ])

    approval_request = (
        "Please review the generated draft itinerary. Approve it to create the "
        "final polished plan, or provide feedback for revision."
    )

    return {
        "itinerary": response.content,
        "approval_request": approval_request,
        "messages": [response],
        "llm_calls": state.get("llm_calls", 0) + 1
    }

# ===================
# Human In The Loop (HITL)
# ===================
def human_approval_agent(state: TravelState):
    # Do not wrap interrupt() in try/except. LangGraph uses it to pause execution.
    review = interrupt(
        {
            "question": "Do you approve this itinerary?",
            "draft_itinerary": state.get("itinerary", ""),
            "approval_request": state.get("approval_request", ""),
            "selected_agents": state.get("selected_agents", []),
            "supervisor_reasoning": state.get("supervisor_reasoning", ""),
            "expected_response": {
                "approved": True,
                "feedback": "Optional revision feedback",
            },
        }
    )

    approved = bool(review.get("approved", False))
    human_feedback = str(review.get("feedback", "")).strip()

    return {
        "approved": approved,
        "human_feedback": human_feedback,
        "messages": [AIMessage(content="Human approval step completed.")],
    }



# Final Response Agent
def final_agent(state: TravelState):
    # 1. Short-circuit if request was blocked by input guardrail
    if not state.get("guardrail_allowed", True):
        blocked_msg = (
            state.get("final_response")
            or state.get("guardrail_reason")
            or "TripMate AI can only assist with travel-related inquiries."
        )
        return {
            "final_response": blocked_msg,
            "messages": [AIMessage(content=blocked_msg)],
        }

    user_query = state.get("user_query", "")
    itinerary = state.get("itinerary", "")
    trip_constraints = state.get("trip_constraints", {})
    budget_results = state.get("budget_results", "")
    weather_results = state.get("weather_results", "")
    human_feedback = state.get("human_feedback", "")
    approved = state.get("approved", True)

    # 2. Contextual enrichment sections
    constraints_section = ""
    if trip_constraints and any(v for v in trip_constraints.values() if v):
        constraints_section = f"""
Trip Constraints & Traveler Preferences:
{json.dumps(trip_constraints, indent=2)}
"""

    budget_section = ""
    if budget_results:
        budget_section = f"""
Budget & Cost Feasibility Analysis:
{budget_results}
"""

    weather_section = ""
    if weather_results:
        weather_section = f"""
Destination Meteorology & Climate Radar:
{weather_results}
"""

    human_feedback_section = ""
    if human_feedback:
        human_feedback_section = f"""
Human-in-the-Loop Specialist Review Directives (MANDATORY):
\"{human_feedback}\"
(Approval Status: {"Approved with modifications" if approved else "Revisions requested"})
"""

    final_prompt = f"""
You are Sofia Laurent, Private Travel Specialist at É T A P E. Compose a refined, bespoke journey proposal for your private client.

Client Request:
{user_query}

{constraints_section}
Draft Itinerary Proposal:
{itinerary}

{budget_section}
{weather_section}
{human_feedback_section}

Format your response in a quiet luxury editorial tone using these sections:
### 1. Journey Summary
A warm, sophisticated 2-sentence overview capturing the spirit and seasonal beauty of the destination (weaving in seasonal weather context).

### 2. Day-by-Day Curated Itinerary
An unhurried daily schedule (Morning, Afternoon, Evening). Keep each time block to 1-2 evocative sentences.
CRITICAL: Seamlessly incorporate any Human-in-the-Loop specialist review directives and traveler preferences.

### 3. Pacing & Investment Guidance
A concise investment range, feasibility assessment, and seasonal wardrobe advice (2-3 bullet points) drawing from the budget analysis and climate radar.

### 4. Specialist Insider Notes
2-3 signature dining and hidden bespoke experiences.

CRITICAL INSTRUCTIONS:
- Keep the proposal concise, curated, and unhurried.
- DO NOT repeat raw flight schedules, hotel price lists, or raw forecast tables; those are displayed in dedicated interactive UI widgets in the frontend.
- When human review notes are present, ensure those specific changes are clearly reflected in the itinerary narrative.
"""

    response = llm.invoke([
        SystemMessage(content="You are Sofia Laurent, a discreet, world-class luxury travel concierge."),
        HumanMessage(content=final_prompt)
    ])

    final_content = response.content.strip() if response.content else ""
    if not final_content:
        final_content = state.get("itinerary", "")

    return {
        "final_response": final_content,
        "messages": [response],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }

# =========================
# Dynamic Supervisor Routing
# =========================
ROUTE_MAP = {
    "guardrail_blocked": "guardrail_blocked",
    "flight_agent": "flight_agent",
    "hotel_agent": "hotel_agent",
    "weather_agent": "weather_agent",
    "budget_agent": "budget_agent",
    "itinerary_agent": "itinerary_agent",
}


def _selected_agents(state: TravelState) -> list[str]:
    selected = state.get("selected_agents", [])
    return [agent for agent in AGENT_ORDER if agent in selected]


def route_from_supervisor(state: TravelState) -> str:
    if not state.get("guardrail_allowed", True):
        return "guardrail_blocked"

    selected = _selected_agents(state)
    return selected[0] if selected else "itinerary_agent"


def route_after_agent(current_agent: str):
    def route(state: TravelState) -> str:
        selected = _selected_agents(state)
        current_index = AGENT_ORDER.index(current_agent)

        for next_agent in AGENT_ORDER[current_index + 1 :]:
            if next_agent in selected:
                return next_agent

        return "itinerary_agent"

    return route


# Building Graphs 
graph = StateGraph(TravelState)

graph.add_node("supervisor", supervisor_agent)
graph.add_node("guardrail_blocked", guardrail_blocked_agent)
graph.add_node("flight_agent", flight_agent)
graph.add_node("hotel_agent", hotel_agent)
graph.add_node("weather_agent", weather_agent)
graph.add_node("budget_agent", budget_agent)
graph.add_node("itinerary_agent", itinerary_agent)
graph.add_node("human_approval", human_approval_agent)
graph.add_node("final_agent", final_agent)

graph.add_edge(START, "supervisor")

graph.add_conditional_edges(
    "supervisor" , 
    route_from_supervisor ,
    ROUTE_MAP
)

graph.add_conditional_edges(
    "flight_agent", route_after_agent("flight_agent"), ROUTE_MAP
)
graph.add_conditional_edges(
    "hotel_agent", route_after_agent("hotel_agent"), ROUTE_MAP
)
graph.add_conditional_edges(
    "weather_agent", route_after_agent("weather_agent"), ROUTE_MAP
)
graph.add_conditional_edges(
    "budget_agent", route_after_agent("budget_agent"), ROUTE_MAP
)

graph.add_edge("itinerary_agent", "human_approval")
graph.add_edge("human_approval", "final_agent")
graph.add_edge("final_agent", END)
graph.add_edge("guardrail_blocked", END)


# PostgreSQL Checkpointer (Backed by ConnectionPool for multi-threaded concurrency & auto-reconnect)
try:
    DATABASE_URL = get_database_url()
    pool = ConnectionPool(
        conninfo=DATABASE_URL,
        max_size=10,
        open=False,
        kwargs={"autocommit": True, "row_factory": dict_row},
    )
    pool.open(wait=True, timeout=5)
    checkpointer = PostgresSaver(pool)
    checkpointer.setup()
except Exception as e:
    print(f"Warning: PostgreSQL checkpointer initialization failed ({e}). Falling back to in-memory checkpointer.")
    if "pool" in locals():
        try:
            pool.close()
        except Exception:
            pass
    from langgraph.checkpoint.memory import MemorySaver
    checkpointer = MemorySaver()

travel_graph = graph.compile(checkpointer=checkpointer)

# function for FastAPI
def run_travel_agent(
    user_input: str | None = None,
    thread_id: str | None = None,
    approved: bool | None = None,
    feedback: str = "",
    resume: dict | None = None,
):
    if not thread_id:
        thread_id = f"user_{uuid.uuid4().hex}"

    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

    is_resuming = (resume is not None) or (approved is not None)

    if is_resuming:
        resume_payload = resume if resume is not None else {
            "approved": bool(approved) if approved is not None else True,
            "feedback": str(feedback or "").strip()
        }
        result = travel_graph.invoke(Command(resume=resume_payload), config)
    else:
        result = travel_graph.invoke(
            {
                "messages": [HumanMessage(content=user_input or "")],
                "user_query": user_input or "",
                "flight_results": "",
                "hotel_results": "",
                "weather_results": "",
                "budget_results": "",
                "itinerary": "",
                "llm_calls": 0,
            },
            config,
        )

    full_state = travel_graph.get_state(config).values or {}

    def get_field(k: str, default: Any = ""):
        val = result.get(k)
        if val is not None and val != "":
            return val
        return full_state.get(k, default)

    is_interrupted = bool(result.get("__interrupt__"))

    if is_interrupted:
        status = "awaiting_approval"
        approval_request = (
            get_field("approval_request")
            or "Please review the generated draft itinerary. Approve it to create the final polished plan, or provide feedback for revision."
        )
        answer = get_field("itinerary", "")
        final_response = ""
    else:
        status = "completed"
        approval_request = get_field("approval_request", "")
        final_response = get_field("final_response", "")
        if not final_response and result.get("messages"):
            final_response = result["messages"][-1].content
        answer = final_response or get_field("itinerary", "")

    return {
        "thread_id": thread_id,
        "status": status,
        "answer": answer,
        "final_response": final_response,
        "flight_results": get_field("flight_results", ""),
        "hotel_results": get_field("hotel_results", ""),
        "weather_results": get_field("weather_results", ""),
        "budget_results": get_field("budget_results", ""),
        "itinerary": get_field("itinerary", ""),
        "approval_request": approval_request,
        "approved": get_field("approved", None),
        "human_feedback": get_field("human_feedback", ""),
        "llm_calls": get_field("llm_calls", 0),
    }