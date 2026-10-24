import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from pydantic import BaseModel
from typing import Optional
import traceback
import uvicorn

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from gptrip.backend import run_travel_agent

# This is to allow nested event loops for async calls in FastAPI
import nest_asyncio
nest_asyncio.apply()

app = FastAPI(
    title="Étape",
    description="Étape Multi-Agent Travel Orchestration Engine API",
    version="1.0.0"
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",  # Adjust in production if needed
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TravelRequest(BaseModel):
    message: Optional[str] = None
    thread_id: Optional[str] = None
    approved: Optional[bool] = None
    feedback: Optional[str] = None

@app.post("/api/travel")
def travel_planner(request_data: TravelRequest):
    try:
        # 1. Handle Human-in-the-Loop (HITL) approval / resume request
        if request_data.approved is not None:
            if not request_data.thread_id:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": "thread_id is required to resume an approval request."
                    }
                )

            result = run_travel_agent(
                thread_id=request_data.thread_id,
                approved=request_data.approved,
                feedback=request_data.feedback or "",
            )
        else:
            # 2. Standard travel inquiry or follow-up
            user_message = (request_data.message or "").strip()

            if not user_message:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": "Message cannot be empty."
                    }
                )

            result = run_travel_agent(
                user_input=user_message,
                thread_id=request_data.thread_id
            )

        return JSONResponse(
            content={
                "success": True,
                "thread_id": result["thread_id"],
                "status": result["status"],
                "answer": result["answer"],
                "final_response": result.get("final_response", ""),
                "flight_results": result["flight_results"],
                "hotel_results": result["hotel_results"],
                "weather_results": result["weather_results"],
                "budget_results": result["budget_results"],
                "itinerary": result["itinerary"],
                "approval_request": result.get("approval_request", ""),
                "approved": result.get("approved"),
                "human_feedback": result.get("human_feedback", ""),
                "llm_calls": result["llm_calls"],
            }
        )

    except Exception as e:
        print("ERROR:", e)
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e)
            }
        )

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "message": "Étape Multi-Agent Travel Engine is operational"
    }

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )