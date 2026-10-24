from mcp.server.fastmcp import FastMCP
import requests
import os 
from dotenv import load_dotenv

load_dotenv()

mcp = FastMCP("Weather MCP Server")

OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")


@mcp.tool()
def get_current_weather(city: str):
    if not OPENWEATHER_API_KEY:
        return {"error": "OPENWEATHER_API_KEY is not configured in environment"}

    try:
        response = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={
                "q": city,
                "appid": OPENWEATHER_API_KEY,
                "units": "metric"
            },
            timeout=10
        )
        data = response.json()
        if response.status_code != 200:
            return data

        return {
            "city": data.get("name", city),
            "temperature_c": data["main"]["temp"],
            "feels_like_c": data["main"]["feels_like"],
            "description": data["weather"][0]["description"],
            "humidity": data["main"]["humidity"],
            "wind_speed": data["wind"]["speed"],
        }
    except Exception as e:
        return {"error": f"Failed to retrieve weather for {city}: {str(e)}"}


@mcp.tool()
def get_forecast(city: str):
    if not OPENWEATHER_API_KEY:
        return {"error": "OPENWEATHER_API_KEY is not configured in environment"}

    try:
        url = "https://api.openweathermap.org/data/2.5/forecast"
        params = {
            "q": city,
            "appid": OPENWEATHER_API_KEY,
            "units": "metric"
        }
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        if response.status_code != 200:
            return data

        forecast = []
        for item in data.get("list", [])[:5]:
            forecast.append({
                "datetime": item.get("dt_txt", ""),
                "temperature": item.get("main", {}).get("temp"),
                "weather": item.get("weather", [{}])[0].get("description", "")
            })

        return {
            "city": city,
            "forecast": forecast
        }
    except Exception as e:
        return {"error": f"Failed to retrieve forecast for {city}: {str(e)}"}


if __name__ == "__main__" :
    mcp.run()

  