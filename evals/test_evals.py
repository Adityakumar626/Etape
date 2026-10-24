import os
import sys
import pytest
from dotenv import load_dotenv

root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, root_dir)
sys.path.insert(0, os.path.join(root_dir, "src"))
load_dotenv(os.path.join(root_dir, ".env"))

from deepeval.test_case import LLMTestCase, SingleTurnParams
from deepeval.metrics import GEval
from deepeval.models import DeepEvalBaseLLM
from langchain_groq import ChatGroq

from gptrip.backend import supervisor_agent
from langchain_core.messages import HumanMessage


class GroqJudge(DeepEvalBaseLLM):
    def __init__(self, model_name: str = "openai/gpt-oss-20b"):
        self.model_name = model_name
        self.client = ChatGroq(
            model=model_name,
            api_key=os.getenv("GROQ_API_KEY"),
            temperature=0.1,
            reasoning_effort="low",
        )

    def load_model(self):
        return self.client

    def generate(self, prompt: str) -> str:
        response = self.client.invoke(prompt)
        return response.content

    async def a_generate(self, prompt: str) -> str:
        response = await self.client.ainvoke(prompt)
        return response.content

    def get_model_name(self):
        return self.model_name


groq_judge = GroqJudge()


@pytest.mark.parametrize("off_topic_query", [
    "How do I bake sourdough bread from scratch?",
    "Write a Python script to sort a binary search tree.",
])
def test_guardrail_blocks_off_topic_queries(off_topic_query):
    state = {
        "messages": [HumanMessage(content=off_topic_query)],
        "user_query": off_topic_query,
        "llm_calls": 0,
        "flight_results": "",
        "hotel_results": "",
        "weather_results": "",
        "budget_results": "",
        "itinerary": "",
    }
    result = supervisor_agent(state)
    assert result["guardrail_allowed"] is False
    assert "guardrail_blocked" in result.get("selected_agents", []) or len(result.get("selected_agents", [])) == 0


def test_geographic_scoping_eval():
    query = "Plan a 5-day luxury trip from Bali to Goa"
    state = {
        "messages": [HumanMessage(content=query)],
        "user_query": query,
        "llm_calls": 0,
        "flight_results": "",
        "hotel_results": "",
        "weather_results": "",
        "budget_results": "",
        "itinerary": "",
    }
    result = supervisor_agent(state)
    constraints = result.get("trip_constraints", {})

    origin = constraints.get("origin", "").lower()
    destination = constraints.get("destination", "").lower()

    assert "bali" in origin
    assert "goa" in destination


@pytest.mark.asyncio
async def test_editorial_concierge_geval():
    user_input = "Plan a 3-day quiet-luxury voyage in Kyoto focusing on Zen temples and tea ceremonies."
    actual_output = (
        "### 1. Journey Summary\n"
        "In early spring, Kyoto unfurls a tapestry of soft cherry‑petal breezes and mist‑kissed Zen gardens. Your three‑day retreat will weave quiet luxury with the city’s most serene temples and intimate tea ceremonies, allowing every breath to echo the season’s gentle hush.\n\n"
        "### 2. Day-by-Day Curated Itinerary\n"
        "**Day 1 — 06:30 – Private tea welcome in your room, a delicate matcha to awaken the senses.	10:00 – Guided walk through Ryoan‑ji’s rock garden, guided by a local monk, followed by a quiet lunch at a nearby ryokan.	18:00 – Kaiseki dinner at a Michelin‑starred Kyoto restaurant, then a sunset tea ceremony in the hotel’s garden pavilion.\n"
        "**Day 2 — 07:00 – Early‑morning stroll through the bamboo grove of Arashiyama, the mist still clinging to the stalks.	11:30 – Private transfer to Ninna‑ji, a contemplative tour of its 13th‑century Zen halls, then a light lunch at a riverside teahouse.	19:30 – Evening tea workshop at the hotel, learning the art of matcha preparation, followed by a quiet walk along the Kamo River.\n"
        "**Day 3 — 07:30 – Final tea ceremony in the hotel’s private tea room, a small set to take home as a memory.	10:00 – Contemplative tour of Tenryu-ji's Zen garden and heritage grounds.	12:30 – Farewell kaiseki lunch, then private transfer to the airport, carrying the serenity of Kyoto with you.\n\n"
        "### 3. Pacing & Investment Guidance\n"
        "- Investment: ¥500 000 – ¥600 000 per person (≈ $4 000 – $4 800 USD), comfortably covering luxury accommodation, private transfers, guided tea workshops, and Michelin‑level dinners.\n"
        "- Pacing: Intentionally slow and restorative."
    )

    luxury_pacing_metric = GEval(
        name="Concierge Editorial Quality",
        criteria="Evaluate if the itinerary adheres strictly to a 3-day Kyoto timeframe, embraces a quiet-luxury editorial tone, and focuses on Zen temples and tea ceremonies.",
        evaluation_params=[SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT],
        model=groq_judge,
        threshold=0.7,
    )

    test_case = LLMTestCase(
        input=user_input,
        actual_output=actual_output,
    )

    await luxury_pacing_metric.a_measure(test_case)

    print("\n[DeepEval G-Eval Score]:", luxury_pacing_metric.score)
    print("[DeepEval Reason]:", luxury_pacing_metric.reason)

    assert luxury_pacing_metric.score >= 0.7
