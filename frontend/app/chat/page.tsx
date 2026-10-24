"use client";

import { useState, useEffect, Suspense, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import LuxuryHeader from "../navbar";
import {
  ArrowRight,
  ArrowUp,
  Sparkles,
  Search,
  Plane,
  Building,
  FileDown,
  CloudSun,
  Thermometer,
  Wind,
  Droplets,
  Sun,
  CloudRain,
  Coins,
  CheckCircle2,
  Check,
  Send,
  Utensils,
  AlertTriangle,
  TrendingUp,
  Wallet,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from "lucide-react";

interface TravelResponse {
  success: boolean;
  thread_id: string;
  status?: "awaiting_approval" | "completed";
  answer: string;
  final_response?: string;
  flight_results: string;
  hotel_results: string;
  weather_results?: string;
  budget_results?: string;
  itinerary: string;
  approval_request?: string;
  approved?: boolean;
  human_feedback?: string;
  llm_calls: number;
  error?: string;
}

interface ForecastItem {
  datetime: string;
  timeFormatted: string;
  dateFormatted: string;
  temperature: number;
  weather: string;
}

interface ParsedWeather {
  city: string;
  temperature: number;
  feelsLike: number;
  description: string;
  humidity: number;
  windSpeed: number;
  forecast: ForecastItem[];
}

interface ParsedFlight {
  airline: string;
  flightNumber: string;
  depIata: string;
  depAirport: string;
  depTime: string;
  arrIata: string;
  arrAirport: string;
  arrTime: string;
  status: string;
}

interface ParsedHotel {
  name: string;
  location: string;
  rate: string;
  vibe: string;
  image: string;
}

interface ParsedBudgetCategory {
  title: string;
  amount: string;
  notes: string;
}

interface ParsedBudget {
  feasibility: string;
  feasibilityProse?: string;
  totalRange: string;
  dailyVelocity: string;
  categories: ParsedBudgetCategory[];
  risks: { title: string; notes: string }[];
  optimizations: { title: string; notes: string }[];
  raw: string;
}

const INSPIRATION_PILLS = [
  "A secluded coastal escape for 2",
  "A cultural retreat in Kyoto for a week",
  "A family villa in the Swiss Alps",
  "A culinary tour of Tuscany and Florence",
  "An unhurried wellness journey to Bali",
];

const SUGGESTED_PROMPTS = [
  "Add private culinary or wine tasting reservations",
  "Adjust for slower, unhurried morning pacing",
  "Include scenic day trips or private boat charters",
  "Suggest more secluded, quiet boutique stays",
  "Outline luggage transit and VIP airport services",
];

const REFINEMENT_CHIPS = [
  "Add Michelin dining",
  "Make mornings slower",
  "Prioritize secluded boutique stays",
  "Include scenic coastal boat charter",
  "Focus on wellness & thermal spas",
];

const CURATED_IMAGE_PALETTE = [
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?q=80&w=1000&auto=format&fit=crop",
];

function cleanTimeString(isoStr?: string): string {
  if (!isoStr || isoStr === "Unknown" || isoStr === "N/A") return "Scheduled";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return isoStr;
  }
}

// Parses real AviationStack output dynamically
function parseDynamicFlights(raw: string): ParsedFlight[] {
  if (!raw) return [];

  const flights: ParsedFlight[] = [];
  const blocks = raw.split(/---+|\n\n(?=Airline:)/g);

  for (const block of blocks) {
    const airlineMatch = block.match(/Airline:\s*([^\n]+)/i);
    const flightMatch = block.match(/Flight:\s*([^\n]+)/i);
    const depIataMatch = block.match(/Departure:[\s\S]*?IATA:\s*([A-Z]{3})/i);
    const depAirportMatch = block.match(/Departure:[\s\S]*?Airport:\s*([^\n]+)/i);
    const depTimeMatch = block.match(/Departure:[\s\S]*?Scheduled:\s*([^\n]+)/i);
    const arrIataMatch = block.match(/Arrival:[\s\S]*?IATA:\s*([A-Z]{3})/i);
    const arrAirportMatch = block.match(/Arrival:[\s\S]*?Airport:\s*([^\n]+)/i);
    const arrTimeMatch = block.match(/Arrival:[\s\S]*?Scheduled:\s*([^\n]+)/i);
    const statusMatch = block.match(/Status:\s*([^\n]+)/i);

    if (airlineMatch || depIataMatch || arrIataMatch) {
      flights.push({
        airline: airlineMatch ? airlineMatch[1].trim() : "Scheduled Air Carrier",
        flightNumber: flightMatch ? flightMatch[1].trim() : "Direct Route",
        depIata: depIataMatch ? depIataMatch[1].trim() : "DEP",
        depAirport: depAirportMatch ? depAirportMatch[1].trim() : "Departure Port",
        depTime: cleanTimeString(depTimeMatch ? depTimeMatch[1].trim() : undefined),
        arrIata: arrIataMatch ? arrIataMatch[1].trim() : "ARR",
        arrAirport: arrAirportMatch ? arrAirportMatch[1].trim() : "Arrival Port",
        arrTime: cleanTimeString(arrTimeMatch ? arrTimeMatch[1].trim() : undefined),
        status: statusMatch ? statusMatch[1].trim().toUpperCase() : "SCHEDULED",
      });
    }
  }

  // If AviationStack returned route text e.g. "Live flights from DEL to DPS" or "No live flight data for route DEL to DPS"
  if (flights.length === 0 && raw) {
    const routeMatch = raw.match(/route\s+([A-Z]{3})\s+to\s+([A-Z]{3})/i) || raw.match(/from\s+([A-Z]{3})\s+to\s+([A-Z]{3})/i);
    if (routeMatch) {
      flights.push({
        airline: "AviationStack Air Route",
        flightNumber: "Verified Flight Corridor",
        depIata: routeMatch[1].toUpperCase(),
        depAirport: "Origin Gateway",
        depTime: "Optimal Departure",
        arrIata: routeMatch[2].toUpperCase(),
        arrAirport: "Destination Gateway",
        arrTime: "Scheduled Arrival",
        status: "ACTIVE ROUTE",
      });
    }
  }

  return flights.slice(0, 3);
}

// Parses real Tavily hotel synthesis dynamically
function parseDynamicHotels(raw: string): ParsedHotel[] {
  if (!raw) return [];

  const hotels: ParsedHotel[] = [];
  const lines = raw.split("\n");
  let currentHotel: Partial<ParsedHotel> | null = null;
  let imgIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match bold hotel name: e.g. **Hotel Name** (Area) or 1. **Hotel Name**
    const nameMatch = trimmed.match(/^\d*\.?\s*[-*•]?\s*\*\*([^*]+)\*\*(?:\s*\(([^)]+)\))?/);
    if (nameMatch) {
      if (currentHotel && currentHotel.name) {
        hotels.push({
          name: currentHotel.name,
          location: currentHotel.location || "Boutique Area",
          rate: currentHotel.rate || "Inquire for seasonal rates",
          vibe: currentHotel.vibe || "Selected for authentic hospitality and secluded ambiance.",
          image: CURATED_IMAGE_PALETTE[imgIndex % CURATED_IMAGE_PALETTE.length],
        });
        imgIndex++;
      }
      currentHotel = {
        name: nameMatch[1].replace(/^[0-9.]+\s*/, "").trim(),
        location: nameMatch[2] ? nameMatch[2].trim() : "Preferred Quarter",
        vibe: "",
      };
      continue;
    }

    if (currentHotel) {
      if (
        trimmed.toLowerCase().includes("rate") ||
        trimmed.toLowerCase().includes("price") ||
        trimmed.includes("€") ||
        trimmed.includes("$")
      ) {
        currentHotel.rate = trimmed
          .replace(/^[-*•]\s*(?:Estimated Nightly Rate|Estimated Rate|Rate|Price):\s*/i, "")
          .trim();
      } else if (
        trimmed.toLowerCase().includes("highlight") ||
        trimmed.toLowerCase().includes("vibe") ||
        trimmed.length > 25
      ) {
        if (!currentHotel.vibe) {
          currentHotel.vibe = trimmed
            .replace(/^[-*•]\s*(?:Vibe & Highlights|Highlights|Vibe):\s*/i, "")
            .trim();
        }
      }
    }
  }

  if (currentHotel && currentHotel.name) {
    hotels.push({
      name: currentHotel.name,
      location: currentHotel.location || "Boutique Area",
      rate: currentHotel.rate || "Inquire for seasonal rates",
      vibe: currentHotel.vibe || "Selected for authentic hospitality and secluded ambiance.",
      image: CURATED_IMAGE_PALETTE[imgIndex % CURATED_IMAGE_PALETTE.length],
    });
  }

  return hotels.slice(0, 3);
}

function getWeatherIcon(condition: string) {
  const c = condition.toLowerCase();
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower") || c.includes("storm")) {
    return <CloudRain className="w-4 h-4 text-[#8A6D38]" />;
  }
  if (c.includes("clear") || c.includes("sun")) {
    return <Sun className="w-4 h-4 text-[#8A6D38]" />;
  }
  return <CloudSun className="w-4 h-4 text-[#8A6D38]" />;
}

// Parses real OpenWeather FastMCP results dynamically
function parseDynamicWeather(raw?: string): ParsedWeather | null {
  if (!raw || typeof raw !== "string") return null;

  try {
    const cleaned = raw.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    const currentSection = cleaned.split(/Forecast:/i)[0] || cleaned;
    const forecastSection = cleaned.split(/Forecast:/i)[1] || "";

    const cityMatch =
      currentSection.match(/"city":\s*"([^"]+)"/i) ||
      cleaned.match(/"city":\s*"([^"]+)"/i);
    const tempMatch =
      currentSection.match(/"temperature_c":\s*([0-9.-]+)/i) ||
      currentSection.match(/"temp":\s*([0-9.-]+)/i);
    const feelsMatch =
      currentSection.match(/"feels_like_c":\s*([0-9.-]+)/i) ||
      currentSection.match(/"feels_like":\s*([0-9.-]+)/i);
    const descMatch =
      currentSection.match(/"description":\s*"([^"]+)"/i) ||
      currentSection.match(/"weather":\s*"([^"]+)"/i);
    const humidityMatch = currentSection.match(/"humidity":\s*([0-9.]+)/i);
    const windMatch = currentSection.match(/"wind_speed":\s*([0-9.]+)/i);

    if (!tempMatch && !cityMatch) return null;

    const forecast: ForecastItem[] = [];
    const itemRegex =
      /\{\s*"datetime":\s*"([^"]+)",\s*"temperature":\s*([0-9.-]+),\s*"weather":\s*"([^"]+)"\s*\}/g;
    let match;
    while ((match = itemRegex.exec(forecastSection)) !== null) {
      const dtStr = match[1];
      const tempVal = Math.round(parseFloat(match[2]));
      const cond = match[3];

      let timeFormatted = dtStr;
      let dateFormatted = "";
      try {
        const d = new Date(dtStr.replace(" ", "T"));
        if (!isNaN(d.getTime())) {
          timeFormatted = d.toLocaleTimeString([], { hour: "numeric", hour12: true });
          dateFormatted = d.toLocaleDateString([], { weekday: "short" });
        }
      } catch {
        // fallback
      }

      forecast.push({
        datetime: dtStr,
        timeFormatted,
        dateFormatted,
        temperature: tempVal,
        weather: cond,
      });
    }

    return {
      city: cityMatch ? cityMatch[1] : "Destination",
      temperature: tempMatch ? Math.round(parseFloat(tempMatch[1])) : 20,
      feelsLike: feelsMatch ? Math.round(parseFloat(feelsMatch[1])) : 20,
      description: descMatch ? descMatch[1] : "Fair conditions",
      humidity: humidityMatch ? Math.round(parseFloat(humidityMatch[1])) : 65,
      windSpeed: windMatch ? parseFloat(parseFloat(windMatch[1]).toFixed(1)) : 2.5,
      forecast: forecast.slice(0, 5),
    };
  } catch (err) {
    console.error("Error parsing weather results:", err);
    return null;
  }
}

// Strips out raw flight, hotel, and weather text blocks so markdown is purely a clean narrative itinerary
function stripFlightsAndHotels(content: string): string {
  if (!content) return "";

  const sections = content.split(/(?=(?:^|\n)#{1,4}\s+)/g);

  const filtered = sections.filter((sec) => {
    const firstLine = sec.trim().split("\n")[0].toLowerCase();
    const isFlight =
      firstLine.includes("flight") ||
      firstLine.includes("air travel") ||
      firstLine.includes("aviation") ||
      firstLine.includes("air corridor");
    const isHotel =
      firstLine.includes("hotel") ||
      firstLine.includes("lodging") ||
      firstLine.includes("curated stays") ||
      firstLine.includes("accommodation") ||
      firstLine.includes("sanctuaries");
    const isWeather =
      firstLine.includes("weather") ||
      firstLine.includes("climate") ||
      firstLine.includes("forecast") ||
      firstLine.includes("meteorological") ||
      firstLine.includes("atmospheric");
    return !isFlight && !isHotel && !isWeather;
  });

  return filtered.join("").trim();
}

function getCategoryIcon(title: string) {
  const t = title.toLowerCase();
  if (
    t.includes("flight") ||
    t.includes("air") ||
    t.includes("transit") ||
    t.includes("transport") ||
    t.includes("aviation")
  ) {
    return <Plane className="w-4 h-4 text-[#8A6D38]" />;
  }
  if (
    t.includes("hotel") ||
    t.includes("stay") ||
    t.includes("sanctuar") ||
    t.includes("lodg") ||
    t.includes("villa") ||
    t.includes("ryokan")
  ) {
    return <Building className="w-4 h-4 text-[#8A6D38]" />;
  }
  if (
    t.includes("gastro") ||
    t.includes("culinary") ||
    t.includes("food") ||
    t.includes("dine") ||
    t.includes("dining") ||
    t.includes("meal")
  ) {
    return <Utensils className="w-4 h-4 text-[#8A6D38]" />;
  }
  if (
    t.includes("excursion") ||
    t.includes("access") ||
    t.includes("activity") ||
    t.includes("tour") ||
    t.includes("guide") ||
    t.includes("charter")
  ) {
    return <Sparkles className="w-4 h-4 text-[#8A6D38]" />;
  }
  if (
    t.includes("buffer") ||
    t.includes("reserve") ||
    t.includes("discretionary") ||
    t.includes("incident") ||
    t.includes("tax")
  ) {
    return <ShieldCheck className="w-4 h-4 text-[#8A6D38]" />;
  }
  return <Wallet className="w-4 h-4 text-[#8A6D38]" />;
}

// Parses real Travel Budget results into structured capital allocation data
function parseDynamicBudget(raw?: string): ParsedBudget | null {
  if (!raw || typeof raw !== "string" || !raw.trim()) return null;

  const cleaned = raw.replace(/\\n/g, "\n").replace(/\\"/g, '"');

  // 1. Feasibility status & prose
  let feasibilityBadge = "Optimally Feasible";
  let feasibilityProse = "";
  const fMatch =
    cleaned.match(/(?:Overall Feasibility|Feasibility)[:\s]*\[?([^\]\n\r|]+)\]?/i) ||
    cleaned.match(/(?:Overall Feasibility|Feasibility)[:\s]*([^\n\r|]+)/i);
  if (fMatch) {
    const rawFeas = fMatch[1].replace(/[#*_[\]|]/g, "").trim();
    feasibilityProse = rawFeas;

    // Distill a concise, punchy status for the badge/KPI score
    if (/high|optimal|very feasible|seamless|excellent/i.test(rawFeas)) {
      feasibilityBadge = "Highly Feasible";
    } else if (/moderate|fair|conditional|viable/i.test(rawFeas)) {
      feasibilityBadge = "Moderately Feasible";
    } else if (/tight|challeng|stretch|risk|constraint/i.test(rawFeas)) {
      feasibilityBadge = "Feasible with Care";
    } else if (rawFeas.length <= 22) {
      feasibilityBadge = rawFeas;
    } else {
      feasibilityBadge = "Feasibility Verified";
    }
  }

  // 2. Helper to clean raw currency/number strings
  const cleanCurrencyText = (str: string): string => {
    return str
      .replace(/[#*_[\]|]/g, "")
      .replace(/^\s*[-–—:]+\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  // 3. Extract Total Outlay
  let totalRange = "";
  const totalRegexes = [
    /(?:Estimated Total Outlay|Total Outlay|Estimated Total Range|Total Estimated Cost|Estimated Total|Total Investment)[:\s]*([^\n\r|]+)/i,
    /Total[:\s]*([^\n\r|]+)/i,
  ];

  for (const re of totalRegexes) {
    const m = cleaned.match(re);
    if (m) {
      const candidate = cleanCurrencyText(m[1]);
      // Verify candidate actually contains numeric digits and is not just a column header like '(₹) |'
      if (/\d/.test(candidate) && candidate.length <= 45) {
        totalRange = candidate;
        break;
      }
    }
  }

  // Fallback search for total currency if regex grabbed header text
  if (!totalRange || !/\d/.test(totalRange)) {
    const currMatch = cleaned.match(
      /((?:[$€£¥₹]|US\$|INR)\s*[0-9,]+(?:\s*[-–—to]+\s*(?:[$€£¥]|US\$|INR)?\s*[0-9,]+)?(?:\s*(?:per\s+(?:person|traveler)|\/person|total))?)/i
    );
    if (currMatch) {
      totalRange = cleanCurrencyText(currMatch[1]);
    }
  }

  // 4. Extract Daily Velocity
  let dailyVelocity = "";
  const dailyRegexes = [
    /(?:Estimated Daily Velocity|Daily Velocity|Daily Average|Daily Spend)[:\s]*([^\n\r|]+)/i,
    /(?:Per Day|Per day|Daily)[:\s]*([^\n\r|]+)/i,
  ];

  for (const re of dailyRegexes) {
    const m = cleaned.match(re);
    if (m) {
      const candidate = cleanCurrencyText(m[1]);
      // Candidate must contain digits and be a concise amount, NOT a full sentence of advice
      if (/\d/.test(candidate) && candidate.length <= 32 && candidate.split(" ").length <= 5) {
        dailyVelocity = candidate;
        break;
      }
    }
  }

  // Fallback search for daily spend amount
  if (!dailyVelocity || !/\d/.test(dailyVelocity)) {
    const dailyCurrMatch = cleaned.match(
      /((?:[$€£¥₹]|US\$|INR)\s*[0-9,]+(?:\s*[-–—to]+\s*(?:[$€£¥₹]|US\$|INR)?\s*[0-9,]+)?\s*(?:\/\s*day|per\s+day))/i
    );
    if (dailyCurrMatch) {
      dailyVelocity = cleanCurrencyText(dailyCurrMatch[1]);
    } else if (totalRange && /\d/.test(totalRange)) {
      dailyVelocity = "~" + totalRange.split(/[-–—to]/)[0].trim() + " / day";
    }
  }

  // 5. Parse Categories (Handling Markdown Tables, Key-Value Pairs, and Bullets)
  const categories: ParsedBudgetCategory[] = [];
  const risks: { title: string; notes: string }[] = [];
  const optimizations: { title: string; notes: string }[] = [];

  const invalidHeaderTerms = [
    "estimated cost", "all figures", "approximate", "budget alignment",
    "seasonal considerations", "recommendation", "bottom line", "executive summary",
    "capital allocation", "volatility", "risk", "optimization", "saving",
    "feasibility", "total", "category", "description", "notes", "summary",
    "overview", "note:", "item", "cost", "breakdown", "portfolio"
  ];

  const lines = cleaned.split("\n");
  let currentSection: "summary" | "categories" | "risks" | "optimizations" | "other" = "other";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();

    // Section detection
    if (lowerLine.includes("executive summary") || lowerLine.includes("1. executive")) {
      currentSection = "summary";
      continue;
    } else if (
      lowerLine.includes("capital allocation") ||
      lowerLine.includes("cost categories") ||
      lowerLine.includes("cost breakdown") ||
      lowerLine.includes("2. capital")
    ) {
      currentSection = "categories";
      continue;
    } else if (
      lowerLine.includes("volatility") ||
      lowerLine.includes("risk zones") ||
      lowerLine.includes("risk areas") ||
      lowerLine.includes("3. financial")
    ) {
      currentSection = "risks";
      continue;
    } else if (
      lowerLine.includes("optimization") ||
      lowerLine.includes("saving") ||
      lowerLine.includes("directives") ||
      lowerLine.includes("4. capital")
    ) {
      currentSection = "optimizations";
      continue;
    }

    // Skip table header divider lines like |---|---|
    if (/^\|?\s*[-:]+\s*\|/.test(line)) continue;

    // A) Process Markdown Table Row: | Category | Amount | Notes |
    if (line.includes("|") && line.split("|").length >= 3) {
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const rawTitle = parts[0].replace(/[#*_[\]]/g, "").trim();
        const titleLower = rawTitle.toLowerCase();

        // Ensure this table row is not a header row
        const isHeader = invalidHeaderTerms.some((term) => titleLower === term || titleLower.startsWith(term));
        if (!isHeader && rawTitle.length > 2 && rawTitle.length < 45) {
          const rawAmount = parts[1].replace(/[#*_[\]]/g, "").trim();
          const rawNotes = parts.slice(2).join(" ").replace(/[#*_[\]]/g, "").trim();

          if (currentSection === "risks") {
            risks.push({ title: rawTitle, notes: rawNotes || rawAmount });
          } else if (currentSection === "optimizations") {
            optimizations.push({ title: rawTitle, notes: rawNotes || rawAmount });
          } else {
            categories.push({
              title: rawTitle,
              amount: rawAmount || "Market Calibrated",
              notes: rawNotes || "Bespoke selection tailored to voyage pacing.",
            });
          }
          continue;
        }
      }
    }

    // B) Process Bullet Items: - Title: Amount - Notes
    if (line.startsWith("-") || line.startsWith("*") || /^\d+\./.test(line)) {
      const cleanLine = line.replace(/^[-*•\d.]+\s*/, "").trim();
      const colonIdx = cleanLine.indexOf(":");
      if (colonIdx > 0) {
        const rawTitle = cleanLine.slice(0, colonIdx).replace(/[#*_[\]]/g, "").trim();
        const rawRest = cleanLine.slice(colonIdx + 1).replace(/[#*_[\]]/g, "").trim();
        const titleLower = rawTitle.toLowerCase();

        // Verify this is not a section heading or meta-comment
        const isHeader = invalidHeaderTerms.some((term) => titleLower === term || titleLower.startsWith(term));
        if (!isHeader && rawTitle.length > 2 && rawTitle.length < 45) {
          if (currentSection === "risks") {
            risks.push({ title: rawTitle, notes: rawRest });
          } else if (currentSection === "optimizations") {
            optimizations.push({ title: rawTitle, notes: rawRest });
          } else {
            let amount = "";
            let notes = rawRest;

            // Pattern: Amount - Notes or Amount (Notes)
            const priceMatch = rawRest.match(
              /^((?:[$€£¥₹]|US\$|INR)\s*[0-9,]+(?:\s*[-–—to]+\s*(?:[$€£¥₹]|US\$|INR)?\s*[0-9,]+)?)\s*(?:[-–—:]\s*(.*)|\((.*)\)|(.*))?$/i
            );
            if (priceMatch) {
              amount = priceMatch[1].trim();
              notes = (priceMatch[2] || priceMatch[3] || priceMatch[4] || "").trim();
            } else {
              const embeddedPrice = rawRest.match(
                /((?:[$€£¥₹]|US\$|INR)\s*[0-9,]+(?:\s*[-–—to]+\s*(?:[$€£¥₹]|US\$|INR)?\s*[0-9,]+)?)/i
              );
              if (embeddedPrice) {
                amount = embeddedPrice[1].trim();
              }
            }

            categories.push({
              title: rawTitle,
              amount: amount || "Market Calibrated",
              notes: notes || "Bespoke selection tailored to voyage pacing.",
            });
          }
        }
      }
    }
  }

  // Fallback defaults if no valid categories were parsed
  if (categories.length === 0) {
    categories.push(
      {
        title: "Aviation & Corridors",
        amount: "Dynamic Market Rates",
        notes: "Live carrier schedules and private transit connections.",
      },
      {
        title: "Curated Sanctuaries",
        amount: "Boutique Portfolio",
        notes: "Hand-selected luxury hotels, villas, and ryokans.",
      },
      {
        title: "Gastronomy & Dining",
        amount: "Bespoke Reservations",
        notes: "Signature culinary bookings, tastings, and sommelier cellars.",
      },
      {
        title: "Experiences & Access",
        amount: "Private Guides & Charters",
        notes: "Private excursions, charters, and exclusive cultural entries.",
      }
    );
  }

  return {
    feasibility: feasibilityBadge || "Feasibility Verified",
    feasibilityProse: feasibilityProse || "All flight, hotel, and private access parameters fit within standard seasonal pacing.",
    totalRange: totalRange || "Inquire for current season rates",
    dailyVelocity: dailyVelocity || "~$750 – $1,100 / day",
    categories: categories.slice(0, 6),
    risks: risks.slice(0, 4),
    optimizations: optimizations.slice(0, 4),
    raw: cleaned,
  };
}

function ConciergeChatContent() {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") || "";

  const [prompt, setPrompt] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TravelResponse | null>(null);
  const [userQuery, setUserQuery] = useState(initialPrompt || "");
  const [hasConversationStarted, setHasConversationStarted] = useState(
    Boolean(initialPrompt)
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const resultsTopRef = useRef<HTMLDivElement>(null);
  const finalDossierRef = useRef<HTMLDivElement>(null);

  const executeInquiry = useCallback(
    async (queryText?: string) => {
      const q = (queryText || prompt).trim();
      if (!q || loading) return;

      setLoading(true);
      setHasConversationStarted(true);
      setUserQuery(q);
      setPrompt("");

      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const response = await fetch(`${API_URL}/api/travel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: q,
            thread_id: threadId || undefined,
          }),
        });

        const result = await response.json();

        if (result.success) {
          setData(result);
          if (result.thread_id) {
            setThreadId(result.thread_id);
          }
        } else {
          alert(result.error || "Our concierge service is briefly unavailable.");
        }
      } catch (err) {
        console.error(err);
        alert(
          "Unable to reach the travel advisory service. Please verify that the backend is running on port 8000."
        );
      } finally {
        setLoading(false);
        setTimeout(() => {
          resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      }
    },
    [prompt, loading, threadId]
  );

  const [approvalLoading, setApprovalLoading] = useState(false);
  const [refinementInput, setRefinementInput] = useState("");

  const handleApproval = async (approved: boolean, feedbackText: string = "") => {
    if (approvalLoading || !threadId) return;

    setApprovalLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${API_URL}/api/travel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          approved: approved,
          feedback: feedbackText.trim(),
        }),
      });

      const result = await response.json();

      if (result.success) {
        setData(result);
        setRefinementInput("");
      } else {
        alert(result.error || "Our concierge service is briefly unavailable.");
      }
    } catch (err) {
      console.error(err);
      alert(
        "Unable to reach the travel advisory service. Please verify that the backend is running on port 8000."
      );
    } finally {
      setApprovalLoading(false);
      setTimeout(() => {
        finalDossierRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  };

  const initialPromptExecuted = useRef(false);
  // If user navigated with a prompt parameter from home page, execute it
  useEffect(() => {
    if (initialPrompt && !initialPromptExecuted.current) {
      initialPromptExecuted.current = true;
      executeInquiry(initialPrompt);
    }
  }, [initialPrompt, executeInquiry]);

  const parsedFlights = data ? parseDynamicFlights(data.flight_results) : [];
  const parsedHotels = data ? parseDynamicHotels(data.hotel_results) : [];
  const parsedWeather = data ? parseDynamicWeather(data.weather_results) : null;
  const parsedBudget = data ? parseDynamicBudget(data.budget_results) : null;
  const [showFullBudgetDetails, setShowFullBudgetDetails] = useState(false);

  const handleDownloadPDF = () => {
    if (!data) return;
    window.print();
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-8 lg:px-10 pt-24 sm:pt-32 pb-16 sm:pb-20 overflow-x-hidden print:p-0 print:m-0 print:w-full print:max-w-none print:overflow-visible">
      {/* Specialist Identity Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 sm:pb-8 mb-8 sm:mb-10 border-b border-[#D2CABC]/70 print:hidden">
        <div className="flex items-center gap-3.5 sm:gap-4">
          <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-full overflow-hidden border border-[#C6A878] shadow-sm shrink-0">
            <Image
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&auto=format&fit=crop"
              alt="Sofia Laurent"
              fill
              className="object-cover"
            />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-lg sm:text-xl font-medium text-[#11100F]">
                Sofia Laurent
              </h2>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] sm:tracking-[0.25em] text-[#8A6D38] font-bold font-sans">
                Travel Specialist
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[#555047] leading-relaxed pt-0.5">
              Dedicated Concierge &middot; Powered by live aviation &amp; boutique search
            </p>
          </div>
        </div>

        {data && (
          <button
            onClick={() => {
              setData(null);
              setThreadId(null);
              setUserQuery("");
              setHasConversationStarted(false);
            }}
            className="self-end sm:self-auto text-xs uppercase tracking-[0.2em] text-[#6E685E] hover:text-[#11100F] transition-colors cursor-pointer font-sans font-semibold py-1 print:hidden"
          >
            New Inquiry
          </button>
        )}
      </div>

      {/* ========================================================= */}
      {/* MAIN CONCIERGE CONVERSATION                               */}
      {/* ========================================================= */}
      <main className="space-y-12 sm:space-y-16 min-h-[65vh] print:space-y-3 print:min-h-0 print:p-0 print:m-0">
        {/* STATE A: EMPTY STATE (Before conversation begins) */}
        {!hasConversationStarted && !data && (
          <div className="py-8 sm:py-16 space-y-8 sm:space-y-12 max-w-2xl mx-auto text-center">
            <div className="space-y-3 sm:space-y-4">
              <span className="text-xs uppercase tracking-[0.35em] text-[#8A6D38] font-sans font-bold block">
                Your Private Concierge
              </span>

              <h1 className="font-serif text-3xl sm:text-5xl md:text-6xl text-[#11100F] font-normal tracking-tight leading-[1.08]">
                Where will we take you?
              </h1>

              <p className="text-sm sm:text-lg text-[#3D3A35] font-normal leading-relaxed max-w-lg mx-auto px-2">
                Whether you&apos;re imagining a secluded island sanctuary,
                a cultural capital journey, or something entirely your own,
                begin with a thought.
              </p>
            </div>

            {/* Large Paper-like Text Input */}
            <div className="space-y-5 sm:space-y-6 pt-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  executeInquiry();
                }}
                className="bg-[#FFFFFF] border border-[#C8C0B0] shadow-[0_12px_30px_-8px_rgba(20,20,19,0.08)] p-4 sm:p-5 text-left space-y-3 sm:space-y-4"
              >
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Tell us what your perfect journey looks like (destination, dates, pacing)..."
                  className="w-full bg-transparent text-sm sm:text-base md:text-lg text-[#11100F] placeholder:text-[#656056] focus:outline-none font-serif leading-relaxed resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      executeInquiry();
                    }
                  }}
                />

                <div className="flex items-center justify-between pt-2 border-t border-[#D2CABC]/60">
                  <div className="flex items-center gap-3 sm:gap-4 text-[11px] sm:text-xs text-[#6A655C] font-sans">
                    <button
                      type="button"
                      onClick={() =>
                        setPrompt("Plan an unhurried 5-day escape to Kyoto with ryokan stays and traditional gardens")
                      }
                      className="hover:text-[#11100F] transition-colors flex items-center gap-1.5 cursor-pointer text-left"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#B89658] shrink-0" />
                      <span>Inspiration example</span>
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={!prompt.trim()}
                    className="w-9 h-9 sm:w-10 sm:h-10 bg-[#1F1E1C] hover:bg-[#0A0A09] text-white disabled:opacity-30 transition-all flex items-center justify-center rounded-[3px] cursor-pointer shadow-sm shrink-0"
                    title="Send message"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </div>
              </form>

              {/* Dynamic Inspiration Chips */}
              <div className="pt-3 sm:pt-4 space-y-2.5 sm:space-y-3">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.25em] text-[#8A6D38] font-bold block">
                  Inspirations
                </span>
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                  {INSPIRATION_PILLS.map((pill) => (
                    <button
                      key={pill}
                      type="button"
                      onClick={() => {
                        setPrompt(pill);
                        executeInquiry(pill);
                      }}
                      className="px-3 py-1.5 border border-[#D2CABC]/70 hover:border-[#11100F] hover:bg-white text-xs sm:text-sm font-serif text-[#3D3A35] hover:text-[#11100F] cursor-pointer transition-all rounded-sm text-left sm:text-center"
                    >
                      {pill}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STATE B: ACTIVE CONVERSATION (PURELY DYNAMIC) */}
        {(hasConversationStarted || data) && (
          <div className="space-y-12 sm:space-y-16 print:space-y-3 print:p-0 print:m-0">
            {/* Print-Only Dossier Header */}
            <div className="hidden print:block mb-8 pb-6 border-b-2 border-[#11100F] print:mb-3 print:pb-2">
              <div className="flex items-center justify-between pb-3">
                <div>
                  <h1 className="font-serif text-3xl font-medium tracking-wide text-[#11100F]">
                    É T A P E
                  </h1>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[#8A6D38] font-sans font-bold pt-1">
                    Private Travel Atelier &middot; Bespoke Voyage Dossier
                  </p>
                </div>
                <div className="text-right text-xs text-[#555047] font-sans">
                  <p className="font-medium text-[#11100F]">Private Specialist: Sofia Laurent</p>
                  <p className="pt-0.5">{new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
                </div>
              </div>
            </div>

            {/* Conversation Header */}
            <div ref={resultsTopRef} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#D2CABC]/70">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-[0.3em] text-[#8A6D38] font-bold block font-sans">
                  Your Private Concierge
                </span>
                <h1 className="font-serif text-2xl sm:text-4xl text-[#11100F] font-normal">
                  Voyage Consultation
                </h1>
              </div>
              {data && !loading && data.status === "completed" && (
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  className="no-print print:hidden self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 bg-[#1F1E1C] hover:bg-[#0A0A09] text-[#FAF8F4] text-xs uppercase tracking-[0.18em] font-sans font-semibold rounded-sm transition-all shadow-sm cursor-pointer border border-[#8A6D38]/30 group"
                  title="Download authorized voyage dossier as a PDF"
                >
                  <FileDown className="w-4 h-4 text-[#C6A878] group-hover:scale-110 transition-transform" />
                  <span>Download PDF Dossier</span>
                </button>
              )}
            </div>

            {/* CLIENT INQUIRY BLOCK */}
            {userQuery && (
              <div className="space-y-2">
                <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.25em] text-[#8A6D38] font-sans font-bold">
                  YOUR INQUIRY
                </div>
                <div className="font-serif text-lg sm:text-2xl text-[#11100F] leading-relaxed italic bg-[#FAF8F4] border-l-2 border-[#11100F] pl-4 sm:pl-6 py-3 sm:py-4">
                  &ldquo;{userQuery}&rdquo;
                </div>
              </div>
            )}

            {/* LOADING STATE */}
            {loading && (
              <div className="py-16 sm:py-20 text-center space-y-4">
                <div className="w-8 h-8 rounded-full border-2 border-[#8A6D38] border-t-transparent animate-spin mx-auto" />
                <p className="font-serif text-xl sm:text-2xl text-[#11100F]">
                  Sofia Laurent is composing your voyage...
                </p>
                <p className="text-xs text-[#6A655C] max-w-md mx-auto px-4">
                  Cross-referencing live air corridors, vetting boutique hotel availability, and pacing your daily journey.
                </p>
              </div>
            )}

            {/* DYNAMIC RESULTS (When API response returns) */}
            {data && !loading && (
              <>
                {/* 1. DYNAMIC AIR CORRIDORS (FLIGHTS UI) */}
                {parsedFlights.length > 0 && (
                  <div className="space-y-5 sm:space-y-6 pt-2 border-t border-[#D2CABC]/70">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                      <div className="space-y-0.5 sm:space-y-1">
                        <span className="text-[10px] uppercase tracking-[0.28em] text-[#8A6D38] font-sans font-bold block">
                          Air Transit Radar
                        </span>
                        <h3 className="font-serif text-2xl sm:text-3xl text-[#11100F] font-normal">
                          Curated Flight Corridors
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs uppercase tracking-[0.16em] sm:tracking-[0.18em] text-[#6E685E]">
                        <Plane className="w-3.5 h-3.5 text-[#8A6D38]" />
                        <span>AviationStack Intelligence</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {parsedFlights.map((flight, idx) => (
                        <div
                          key={idx}
                          className="border border-[#C8C0B0] bg-[#FFFFFF] p-4 sm:p-6 shadow-sm space-y-3 sm:space-y-4 hover:border-[#11100F] transition-colors break-inside-avoid print:shadow-none print:border-neutral-300"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs border-b border-[#D2CABC]/60 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.25em] text-[#8A6D38] font-bold font-sans">
                                Corridor
                              </span>
                              <span className="text-[#D2CABC]">&bull;</span>
                              <span className="font-serif font-medium text-[#11100F] text-xs sm:text-sm">
                                {flight.airline} &middot; {flight.flightNumber}
                              </span>
                            </div>
                            <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.15em] sm:tracking-[0.18em] text-[#8A6D38] font-bold font-sans bg-[#FAF8F4] px-2 sm:px-2.5 py-0.5 sm:py-1 border border-[#D2CABC] shrink-0">
                              {flight.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 sm:grid-cols-12 gap-2 sm:gap-4 items-center pt-1">
                            {/* Departure */}
                            <div className="col-span-1 sm:col-span-4 space-y-0.5">
                              <span className="font-serif text-xl sm:text-3xl text-[#11100F] block font-normal">
                                {flight.depIata}
                              </span>
                              <p className="text-[11px] sm:text-xs text-[#555047] line-clamp-1 sm:truncate" title={flight.depAirport}>
                                {flight.depAirport}
                              </p>
                              <p className="text-[10px] sm:text-xs uppercase tracking-[0.12em] sm:tracking-[0.15em] text-[#8A6D38] font-semibold pt-0.5 sm:pt-1">
                                {flight.depTime}
                              </p>
                            </div>

                            {/* Middle Arrow */}
                            <div className="col-span-1 sm:col-span-4 flex flex-col items-center justify-center text-center py-1 sm:py-2">
                              <div className="w-full flex items-center justify-center gap-1.5 sm:gap-3">
                                <div className="h-px bg-[#D2CABC] flex-1" />
                                <Plane className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8A6D38] shrink-0" />
                                <div className="h-px bg-[#D2CABC] flex-1" />
                              </div>
                              <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.15em] sm:tracking-[0.2em] text-[#7A7468] pt-1 whitespace-nowrap">
                                Direct Transit
                              </span>
                            </div>

                            {/* Arrival */}
                            <div className="col-span-1 sm:col-span-4 text-right space-y-0.5">
                              <span className="font-serif text-xl sm:text-3xl text-[#11100F] block font-normal">
                                {flight.arrIata}
                              </span>
                              <p className="text-[11px] sm:text-xs text-[#555047] line-clamp-1 sm:truncate" title={flight.arrAirport}>
                                {flight.arrAirport}
                              </p>
                              <p className="text-[10px] sm:text-xs uppercase tracking-[0.12em] sm:tracking-[0.15em] text-[#8A6D38] font-semibold pt-0.5 sm:pt-1">
                                {flight.arrTime}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. DYNAMIC CURATED STAYS (HOTELS UI) */}
                {parsedHotels.length > 0 && (
                  <div className="space-y-5 sm:space-y-6 pt-6 border-t border-[#D2CABC]/70">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                      <div className="space-y-0.5 sm:space-y-1">
                        <span className="text-[10px] uppercase tracking-[0.28em] text-[#8A6D38] font-sans font-bold block">
                          Lodging Portfolio
                        </span>
                        <h3 className="font-serif text-2xl sm:text-3xl text-[#11100F] font-normal">
                          Curated Stays &amp; Sanctuaries
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs uppercase tracking-[0.16em] sm:tracking-[0.18em] text-[#6E685E]">
                        <Building className="w-3.5 h-3.5 text-[#8A6D38]" />
                        <span>Tavily Verified Stays</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {parsedHotels.map((hotel, idx) => (
                        <div
                          key={idx}
                          className="border border-[#C8C0B0] bg-[#FFFFFF] p-3.5 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 hover:border-[#11100F] transition-colors group cursor-pointer break-inside-avoid print:shadow-none print:border-neutral-300"
                          onClick={() =>
                            executeInquiry(`Tell me more about staying at ${hotel.name}`)
                          }
                        >
                          <div className="relative w-full sm:w-40 h-40 sm:h-28 shrink-0 overflow-hidden border border-[#D2CABC]">
                            <Image
                              src={hotel.image}
                              alt={hotel.name}
                              fill
                              sizes="(max-width: 640px) 100vw, 160px"
                              className="object-cover group-hover:scale-105 transition-transform duration-700"
                            />
                          </div>

                          <div className="flex-1 space-y-1 w-full">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                              <h4 className="font-serif text-lg sm:text-2xl text-[#11100F] group-hover:text-[#8A6D38] transition-colors">
                                {hotel.name}
                              </h4>
                              <span className="text-xs uppercase tracking-[0.15em] text-[#11100F] font-bold font-sans shrink-0">
                                {hotel.rate}
                              </span>
                            </div>

                            <p className="text-[11px] sm:text-xs uppercase tracking-[0.18em] text-[#8A6D38] font-medium font-sans">
                              {hotel.location}
                            </p>

                            <p className="text-xs text-[#3D3A35] font-normal leading-relaxed pt-0.5">
                              {hotel.vibe}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. DYNAMIC ATMOSPHERIC RADAR (WEATHER UI) */}
                {parsedWeather && (
                  <div className="space-y-5 sm:space-y-6 pt-6 border-t border-[#D2CABC]/70">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                      <div className="space-y-0.5 sm:space-y-1">
                        <span className="text-[10px] uppercase tracking-[0.28em] text-[#8A6D38] font-sans font-bold block">
                          Atmospheric Radar
                        </span>
                        <h3 className="font-serif text-2xl sm:text-3xl text-[#11100F] font-normal">
                          Destination Climate &amp; Outlook
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs uppercase tracking-[0.16em] sm:tracking-[0.18em] text-[#6E685E]">
                        <CloudSun className="w-3.5 h-3.5 text-[#8A6D38]" />
                        <span>OpenWeather Atmospheric Radar</span>
                      </div>
                    </div>

                    <div className="border border-[#C8C0B0] bg-[#FFFFFF] p-4 sm:p-6 shadow-sm space-y-5 hover:border-[#11100F] transition-colors break-inside-avoid print:shadow-none print:border-neutral-300">
                      {/* Top Bar: Destination, condition badge & temperature */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#D2CABC]/60 pb-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.25em] text-[#8A6D38] font-bold font-sans">
                              Live Climate
                            </span>
                            <span className="text-[#D2CABC]">&bull;</span>
                            <span className="font-serif font-medium text-[#11100F] text-base sm:text-lg">
                              {parsedWeather.city}
                            </span>
                          </div>
                          <div className="text-xs text-[#555047] capitalize flex items-center gap-1.5">
                            {getWeatherIcon(parsedWeather.description)}
                            <span>{parsedWeather.description}</span>
                          </div>
                        </div>

                        <div className="flex items-baseline gap-2 sm:text-right">
                          <span className="font-serif text-3xl sm:text-4xl text-[#11100F] font-light tracking-tight">
                            {parsedWeather.temperature}&deg;C
                          </span>
                          <span className="text-xs uppercase tracking-[0.15em] text-[#8A6D38] font-sans font-medium">
                            Feels {parsedWeather.feelsLike}&deg;C
                          </span>
                        </div>
                      </div>

                      {/* Climate Indices Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                        <div className="bg-[#FAF8F4] border border-[#D2CABC]/50 p-3 space-y-1">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-[#7A7468] font-sans flex items-center gap-1">
                            <Thermometer className="w-3 h-3 text-[#8A6D38]" />
                            Thermal Index
                          </span>
                          <p className="font-serif text-base text-[#11100F]">
                            {parsedWeather.temperature}&deg;C{" "}
                            <span className="text-xs text-[#7A7468]">
                              ({parsedWeather.feelsLike}&deg;C)
                            </span>
                          </p>
                        </div>

                        <div className="bg-[#FAF8F4] border border-[#D2CABC]/50 p-3 space-y-1">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-[#7A7468] font-sans flex items-center gap-1">
                            <Droplets className="w-3 h-3 text-[#8A6D38]" />
                            Humidity
                          </span>
                          <p className="font-serif text-base text-[#11100F]">
                            {parsedWeather.humidity}%{" "}
                            <span className="text-xs text-[#7A7468]">RH</span>
                          </p>
                        </div>

                        <div className="bg-[#FAF8F4] border border-[#D2CABC]/50 p-3 space-y-1">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-[#7A7468] font-sans flex items-center gap-1">
                            <Wind className="w-3 h-3 text-[#8A6D38]" />
                            Wind Speed
                          </span>
                          <p className="font-serif text-base text-[#11100F]">
                            {parsedWeather.windSpeed}{" "}
                            <span className="text-xs text-[#7A7468]">m/s</span>
                          </p>
                        </div>

                        <div className="bg-[#FAF8F4] border border-[#D2CABC]/50 p-3 space-y-1">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-[#8A6D38] font-sans flex items-center gap-1">
                            <CloudSun className="w-3 h-3 text-[#8A6D38]" />
                            Atmosphere
                          </span>
                          <p
                            className="font-serif text-base text-[#11100F] capitalize truncate"
                            title={parsedWeather.description}
                          >
                            {parsedWeather.description}
                          </p>
                        </div>
                      </div>

                      {/* 24-Hour Micro-Climate Outlook (Forecast) */}
                      {parsedWeather.forecast.length > 0 && (
                        <div className="border-t border-[#D2CABC]/60 pt-4 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.22em] text-[#8A6D38] font-bold font-sans">
                              Upcoming Micro-Climate Forecast
                            </span>
                            <span className="text-[9px] uppercase tracking-[0.18em] text-[#7A7468] font-sans">
                              5-Step Timeline
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {parsedWeather.forecast.map((step, sIdx) => (
                              <div
                                key={sIdx}
                                className="bg-[#FAF8F4] border border-[#D2CABC]/60 p-2.5 text-center space-y-1 hover:border-[#11100F] transition-colors"
                              >
                                <span className="text-[10px] uppercase tracking-wider text-[#7A7468] font-sans block">
                                  {step.timeFormatted}
                                </span>
                                <div className="flex justify-center py-0.5">
                                  {getWeatherIcon(step.weather)}
                                </div>
                                <span className="font-serif text-sm font-medium text-[#11100F] block">
                                  {step.temperature}&deg;C
                                </span>
                                <span
                                  className="text-[9px] text-[#6E685E] capitalize block truncate"
                                  title={step.weather}
                                >
                                  {step.weather}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. DYNAMIC INVESTMENT & FEASIBILITY (BUDGET UI) */}
                {parsedBudget && (
                  <div className="space-y-5 sm:space-y-6 pt-6 border-t border-[#D2CABC]/70">
                    {/* Section Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                      <div className="space-y-0.5 sm:space-y-1">
                        <span className="text-[10px] uppercase tracking-[0.28em] text-[#8A6D38] font-sans font-bold block">
                          Capital Allocation Radar
                        </span>
                        <h3 className="font-serif text-2xl sm:text-3xl text-[#11100F] font-normal">
                          Investment Architecture &amp; Feasibility
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs uppercase tracking-[0.16em] sm:tracking-[0.18em] text-[#6E685E]">
                        <Coins className="w-3.5 h-3.5 text-[#8A6D38]" />
                        <span>É T A P E Financial Intelligence</span>
                      </div>
                    </div>

                    {/* Master Investment Container */}
                    <div className="border border-[#C8C0B0] bg-[#FFFFFF] p-4 sm:p-7 shadow-sm space-y-6 hover:border-[#11100F] transition-colors break-inside-avoid print:shadow-none print:border-neutral-300">
                      {/* Top Bar: Assessment Category & Verified Badge */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#D2CABC]/60 pb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.25em] text-[#8A6D38] font-bold font-sans">
                            Discreet Capital Audit
                          </span>
                          <span className="text-[#D2CABC] hidden sm:inline">&bull;</span>
                          <span className="font-serif font-medium text-[#11100F] text-xs sm:text-sm">
                            Curated Expenditure &amp; Risk Modeling
                          </span>
                        </div>
                        <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.15em] sm:tracking-[0.18em] text-[#8A6D38] font-bold font-sans bg-[#FAF8F4] px-2.5 py-1 border border-[#D2CABC] shrink-0 self-start sm:self-auto rounded-sm">
                          {parsedBudget.feasibility}
                        </span>
                      </div>

                      {/* 1. TOP EXECUTIVE KPI METRICS BAR */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        {/* Metric A: Total Investment */}
                        <div className="bg-[#FAF8F4] border border-[#D2CABC]/60 p-3.5 sm:p-4 space-y-1 rounded-sm flex flex-col justify-between h-[110px] min-h-[110px] max-h-[115px] overflow-hidden">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-[#7A7468] font-sans font-semibold flex items-center gap-1">
                            <Wallet className="w-3 h-3 text-[#8A6D38]" />
                            Estimated Outlay
                          </span>
                          <p className="font-serif text-base sm:text-xl text-[#11100F] font-medium leading-snug truncate" title={parsedBudget.totalRange}>
                            {parsedBudget.totalRange}
                          </p>
                          <span className="text-[10px] text-[#8A6D38] font-sans block pt-0.5 truncate">
                            Per Traveler &middot; All Included
                          </span>
                        </div>

                        {/* Metric B: Feasibility Rating */}
                        <div className="bg-[#FAF8F4] border border-[#D2CABC]/60 p-3.5 sm:p-4 space-y-1 rounded-sm flex flex-col justify-between h-[110px] min-h-[110px] max-h-[115px] overflow-hidden">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-[#7A7468] font-sans font-semibold flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 text-[#8A6D38]" />
                            Feasibility Score
                          </span>
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <span className="w-2 h-2 rounded-full bg-[#8A6D38] animate-pulse shrink-0" />
                            <p
                              className="font-serif text-sm sm:text-lg text-[#11100F] font-medium truncate"
                              title={parsedBudget.feasibilityProse || parsedBudget.feasibility}
                            >
                              {parsedBudget.feasibility}
                            </p>
                          </div>
                          <span
                            className="text-[10px] text-[#7A7468] font-sans block truncate"
                            title={parsedBudget.feasibilityProse}
                          >
                            {parsedBudget.feasibilityProse
                              ? parsedBudget.feasibilityProse.length > 32
                                ? parsedBudget.feasibilityProse.slice(0, 32) + "..."
                                : parsedBudget.feasibilityProse
                              : "Market Calibrated Pacing"}
                          </span>
                        </div>

                        {/* Metric C: Daily Velocity */}
                        <div className="bg-[#FAF8F4] border border-[#D2CABC]/60 p-3.5 sm:p-4 space-y-1 rounded-sm flex flex-col justify-between h-[110px] min-h-[110px] max-h-[115px] overflow-hidden">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-[#7A7468] font-sans font-semibold flex items-center gap-1">
                            <Coins className="w-3 h-3 text-[#8A6D38]" />
                            Daily Velocity
                          </span>
                          <p className="font-serif text-base sm:text-xl text-[#11100F] font-medium leading-snug truncate" title={parsedBudget.dailyVelocity}>
                            {parsedBudget.dailyVelocity}
                          </p>
                          <span className="text-[10px] text-[#7A7468] font-sans block pt-0.5 truncate">
                            Curated Pacing Average
                          </span>
                        </div>

                        {/* Metric D: Pacing Standard */}
                        <div className="bg-[#FAF8F4] border border-[#D2CABC]/60 p-3.5 sm:p-4 space-y-1 rounded-sm flex flex-col justify-between h-[110px] min-h-[110px] max-h-[115px] overflow-hidden">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-[#7A7468] font-sans font-semibold flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-[#8A6D38]" />
                            Tier Standard
                          </span>
                          <p className="font-serif text-base sm:text-lg text-[#11100F] font-medium leading-snug truncate">
                            Quiet Luxury Tier
                          </p>
                          <span className="text-[10px] text-[#8A6D38] font-sans block pt-0.5 truncate">
                            5-Star Stays &amp; Private Access
                          </span>
                        </div>
                      </div>

                      {/* 2. CAPITAL ALLOCATION CATEGORIES */}
                      {parsedBudget.categories.length > 0 && (
                        <div className="space-y-3 pt-1">
                          <div className="flex items-center justify-between border-t border-[#D2CABC]/50 pt-4">
                            <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.22em] text-[#8A6D38] font-bold font-sans">
                              Capital Allocation Portfolio
                            </span>
                            <span className="text-[10px] text-[#7A7468] font-sans">
                              Category Pacing Breakdown
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {parsedBudget.categories.map((cat, cIdx) => (
                              <div
                                key={cIdx}
                                className="bg-[#FAF8F4] border border-[#D2CABC]/70 p-3.5 space-y-2 hover:border-[#11100F] transition-all rounded-sm flex flex-col justify-between min-h-[115px]"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] uppercase tracking-[0.16em] text-[#7A7468] font-sans flex items-center gap-1.5 font-medium min-w-0">
                                      {getCategoryIcon(cat.title)}
                                      <span className="truncate" title={cat.title}>{cat.title}</span>
                                    </span>
                                  </div>
                                  <p className="font-serif text-base sm:text-lg text-[#11100F] font-medium pt-0.5 truncate" title={cat.amount}>
                                    {cat.amount}
                                  </p>
                                </div>
                                <p
                                  className="text-[11px] text-[#555047] leading-relaxed line-clamp-2"
                                  title={cat.notes}
                                >
                                  {cat.notes}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 3. DUAL ADVISORY: RISKS & OPTIMIZATION DIRECTIVES */}
                      {(parsedBudget.risks.length > 0 || parsedBudget.optimizations.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                          {/* Volatility & Risk Radar */}
                          {parsedBudget.risks.length > 0 && (
                            <div className="bg-[#FAF8F4] border border-[#D2CABC]/70 p-4 space-y-3 rounded-sm">
                              <div className="flex items-center gap-2 pb-2 border-b border-[#D2CABC]/50">
                                <AlertTriangle className="w-3.5 h-3.5 text-[#9E6928]" />
                                <span className="text-[10px] uppercase tracking-[0.2em] text-[#11100F] font-bold font-sans">
                                  Financial Volatility &amp; Risk Zones
                                </span>
                              </div>
                              <div className="space-y-2.5">
                                {parsedBudget.risks.map((risk, rIdx) => (
                                  <div key={rIdx} className="space-y-0.5">
                                    <span className="font-serif text-xs sm:text-sm font-medium text-[#11100F] block">
                                      {risk.title}
                                    </span>
                                    <p className="text-[11px] text-[#6A655C] leading-relaxed">
                                      {risk.notes}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Specialist Capital Optimizations */}
                          {parsedBudget.optimizations.length > 0 && (
                            <div className="bg-[#FAF8F4] border border-[#D2CABC]/70 p-4 space-y-3 rounded-sm">
                              <div className="flex items-center gap-2 pb-2 border-b border-[#D2CABC]/50">
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#8A6D38]" />
                                <span className="text-[10px] uppercase tracking-[0.2em] text-[#11100F] font-bold font-sans">
                                  Specialist Value &amp; Capital Optimization
                                </span>
                              </div>
                              <div className="space-y-2.5">
                                {parsedBudget.optimizations.map((opt, oIdx) => (
                                  <div key={oIdx} className="space-y-0.5">
                                    <span className="font-serif text-xs sm:text-sm font-medium text-[#11100F] block">
                                      {opt.title}
                                    </span>
                                    <p className="text-[11px] text-[#6A655C] leading-relaxed">
                                      {opt.notes}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 4. EXPANDABLE COMPREHENSIVE ANALYST DOSSIER */}
                      <div className="pt-2 border-t border-[#D2CABC]/60">
                        <button
                          type="button"
                          onClick={() => setShowFullBudgetDetails(!showFullBudgetDetails)}
                          className="flex items-center justify-between w-full py-2 text-xs text-[#7A7468] hover:text-[#11100F] font-sans transition-colors cursor-pointer"
                        >
                          <span className="uppercase tracking-[0.16em] text-[10px] font-semibold">
                            {showFullBudgetDetails
                              ? "Hide Detailed Financial Blueprint"
                              : "View Comprehensive Financial Blueprint & Analyst Prose"}
                          </span>
                          {showFullBudgetDetails ? (
                            <ChevronUp className="w-3.5 h-3.5 text-[#8A6D38]" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-[#8A6D38]" />
                          )}
                        </button>

                        {showFullBudgetDetails && (
                          <div className="pt-3 pb-1 text-xs text-[#3D3A35] font-serif leading-relaxed border-t border-[#D2CABC]/40 space-y-2">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {parsedBudget.raw}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. HUMAN-IN-THE-LOOP (HITL) APPROVAL GATE */}
                {data.status === "awaiting_approval" && (
                  <div className="space-y-4 pt-6 border-t border-[#D2CABC]/70">
                    <div className="border-2 border-[#8A6D38] bg-[#FAF8F4] p-5 sm:p-7 shadow-md space-y-5 rounded-[2px] transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#D2CABC]/70 pb-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#8A6D38] animate-pulse" />
                            <span className="text-[10px] uppercase tracking-[0.28em] text-[#8A6D38] font-bold font-sans">
                              Specialist Review Gate &middot; Action Required
                            </span>
                          </div>
                          <h3 className="font-serif text-2xl sm:text-3xl text-[#11100F] font-normal">
                            Review &amp; Authorize Voyage Itinerary
                          </h3>
                          <p className="text-xs text-[#555047] font-sans pt-1">
                            {data.approval_request ||
                              "Please review the draft proposal below before Sofia Laurent finalizes your quiet-luxury dossier."}
                          </p>
                        </div>
                      </div>

                      {/* Primary Action Button */}
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                          <button
                            type="button"
                            disabled={approvalLoading}
                            onClick={() => handleApproval(true, "")}
                            className="flex-1 inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-[#1F1E1C] hover:bg-[#0A0A09] text-[#FAF8F4] text-xs sm:text-sm uppercase tracking-[0.2em] font-sans font-semibold rounded-sm transition-all shadow-md cursor-pointer border border-[#8A6D38]/50 disabled:opacity-50 group"
                          >
                            {approvalLoading ? (
                              <>
                                <div className="w-4 h-4 rounded-full border-2 border-[#C6A878] border-t-transparent animate-spin" />
                                <span>Sofia Laurent is synthesizing final dossier...</span>
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4 text-[#C6A878] group-hover:scale-110 transition-transform" />
                                <span>Approve Itinerary &amp; Generate Final Dossier</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Refinement Panel */}
                        <div className="pt-3 border-t border-[#D2CABC]/60 space-y-3">
                          <div className="flex items-center justify-between">
                            <label
                              htmlFor="refinement-input"
                              className="text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-[#7A7468] font-bold font-sans"
                            >
                              Request Refinements
                            </label>
                            <span className="text-[10px] text-[#8A6D38] font-sans">
                              Directives woven into final narrative
                            </span>
                          </div>

                          {/* Quick Chips */}
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            {REFINEMENT_CHIPS.map((chip) => (
                              <button
                                key={chip}
                                type="button"
                                disabled={approvalLoading}
                                onClick={() => {
                                  setRefinementInput((prev) =>
                                    prev ? `${prev}; ${chip}` : chip
                                  );
                                }}
                                className="px-2.5 py-1 text-[11px] font-sans border border-[#D2CABC] bg-white text-[#3D3A35] hover:border-[#11100F] hover:text-[#11100F] cursor-pointer transition-colors rounded-sm text-left"
                              >
                                ＋ {chip}
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <input
                              id="refinement-input"
                              type="text"
                              value={refinementInput}
                              onChange={(e) => setRefinementInput(e.target.value)}
                              placeholder="e.g. Add Michelin dining, make mornings slower..."
                              disabled={approvalLoading}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && refinementInput.trim() && !approvalLoading) {
                                  e.preventDefault();
                                  handleApproval(true, refinementInput);
                                }
                              }}
                              className="flex-1 bg-white border border-[#C8C0B0] px-3.5 py-2.5 text-xs sm:text-sm font-serif text-[#11100F] placeholder:text-[#888] focus:outline-none focus:border-[#11100F] rounded-sm"
                            />

                            <button
                              type="button"
                              disabled={!refinementInput.trim() || approvalLoading}
                              onClick={() => handleApproval(true, refinementInput)}
                              className="px-4 py-2.5 bg-[#8A6D38] hover:bg-[#72592B] text-white text-xs uppercase tracking-[0.15em] font-sans font-semibold rounded-sm transition-all shadow-sm disabled:opacity-40 cursor-pointer shrink-0 inline-flex items-center gap-1.5"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Apply &amp; Finalize</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* APPROVAL STATUS CONFIRMATION (WHEN COMPLETED) */}
                {data.status === "completed" && (
                  <div ref={finalDossierRef} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 bg-[#FAF8F4] border border-[#C8C0B0] rounded-sm text-xs font-sans text-[#555047] shadow-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#8A6D38] shrink-0" />
                      <span className="font-medium text-[#11100F]">
                        Specialist Review Approved &amp; Dossier Finalized
                      </span>
                      {data.human_feedback && (
                        <span className="text-[#7A7468] italic hidden sm:inline">
                          &middot; Incorporated Directives: &ldquo;{data.human_feedback}&rdquo;
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#8A6D38] font-bold shrink-0">
                      Sofia Laurent Dossier
                    </span>
                  </div>
                )}

                {/* 6. DYNAMIC DAY-BY-DAY ITINERARY JOURNAL (MARKDOWN) */}
                <div className="space-y-6 sm:space-y-8 pt-6 border-t border-[#D2CABC]/70">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.28em] text-[#8A6D38] font-sans font-bold block">
                      {data.status === "awaiting_approval"
                        ? "Draft Voyage Proposal"
                        : "Tailored Proposal"}
                    </span>
                    <h3 className="font-serif text-2xl sm:text-3xl text-[#11100F] font-normal">
                      {data.status === "awaiting_approval"
                        ? "Preliminary Day-by-Day Draft"
                        : "Your Bespoke Day-by-Day Itinerary"}
                    </h3>
                    {data.status === "awaiting_approval" && (
                      <p className="text-xs text-[#7A7468] font-sans pt-0.5">
                        Review the draft itinerary below and authorize generation of Sofia Laurent&apos;s quiet-luxury dossier.
                      </p>
                    )}
                  </div>

                  <article className="max-w-none text-[#11100F]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {stripFlightsAndHotels(
                        data.status === "awaiting_approval"
                          ? data.itinerary || data.answer
                          : data.final_response || data.answer
                      )}
                    </ReactMarkdown>
                  </article>

                  {/* PRINT-ONLY DOSSIER FOOTER */}
                  <div className="hidden print:block mt-16 pt-8 border-t border-[#11100F]/20 text-center space-y-1 print:mt-6 print:pt-3">
                    <p className="font-serif tracking-[0.28em] uppercase text-xs text-[#11100F] font-medium">
                      É T A P E &middot; ATELIER
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#8A6D38] font-sans">
                      Private Travel Concierge &middot; Confidential Client Consultation Dossier
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* SUGGESTED PROMPTS */}
            <div className="space-y-4 pt-6 border-t border-[#D2CABC]/70 print:hidden no-print">
              <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.25em] text-[#8A6D38] font-sans font-bold block">
                Perhaps you&apos;d like to ask...
              </span>

              <div className="space-y-2">
                {SUGGESTED_PROMPTS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => executeInquiry(suggestion)}
                    className="group flex items-center justify-between gap-3 w-full py-2.5 border-b border-[#D2CABC]/40 hover:border-[#11100F] text-left transition-colors cursor-pointer"
                  >
                    <span className="text-sm sm:text-base font-serif text-[#11100F] group-hover:text-[#8A6D38] transition-colors">
                      {suggestion}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#11100F] opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* COMPOSER: Premium Paper-like Input Area */}
            <div className="pt-4 sm:pt-6 sticky bottom-2 sm:bottom-6 bg-[#F7F4EE]/95 backdrop-blur-md pb-2 z-20 print:hidden no-print">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (data?.status === "awaiting_approval") {
                    if (prompt.trim()) {
                      handleApproval(true, prompt.trim());
                      setPrompt("");
                    }
                  } else {
                    executeInquiry();
                  }
                }}
                className="bg-[#FFFFFF] border border-[#C8C0B0] shadow-[0_12px_32px_-8px_rgba(20,20,19,0.1)] p-3 sm:p-5 space-y-2.5 sm:space-y-3"
              >
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    data?.status === "awaiting_approval"
                      ? "Submit review directives (e.g. Add Michelin dining, slower mornings) to finalize dossier..."
                      : "Ask Sofia to refine pace, add private guides, or reserve dining..."
                  }
                  className="w-full bg-transparent text-sm sm:text-base md:text-lg text-[#11100F] placeholder:text-[#656056] focus:outline-none font-serif font-medium px-1"
                />

                <div className="flex items-center justify-between pt-2 border-t border-[#D2CABC]/60 text-xs text-[#555047] font-sans gap-2">
                  <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar py-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        const directive = "Recommend private Michelin reservations and scenic terraces";
                        if (data?.status === "awaiting_approval") {
                          setRefinementInput((prev) => (prev ? `${prev}; ${directive}` : directive));
                          document.getElementById("refinement-input")?.focus();
                        } else {
                          setPrompt(directive);
                        }
                      }}
                      className="hover:text-[#11100F] transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap text-[11px] sm:text-xs px-2 py-1 rounded bg-[#FAF8F4] border border-[#D2CABC]/40 sm:border-transparent sm:bg-transparent sm:p-0"
                    >
                      <span>＋ Add dining</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const directive = "Make the itinerary more unhurried with slower mornings";
                        if (data?.status === "awaiting_approval") {
                          setRefinementInput((prev) => (prev ? `${prev}; ${directive}` : directive));
                          document.getElementById("refinement-input")?.focus();
                        } else {
                          setPrompt(directive);
                        }
                      }}
                      className="hover:text-[#11100F] transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap text-[11px] sm:text-xs px-2 py-1 rounded bg-[#FAF8F4] border border-[#D2CABC]/40 sm:border-transparent sm:bg-transparent sm:p-0"
                    >
                      <Search className="w-3 h-3 text-[#B89658]" />
                      <span>Adjust pace</span>
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={!prompt.trim() || loading || approvalLoading}
                    className="w-8 h-8 sm:w-9 sm:h-9 bg-[#1F1E1C] hover:bg-[#0A0A09] text-white disabled:opacity-30 transition-all flex items-center justify-center rounded-[3px] cursor-pointer shadow-sm shrink-0 ml-1"
                    title={data?.status === "awaiting_approval" ? "Apply directives and finalize" : "Send inquiry"}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>
    </div>
  );
}

export default function ChatConciergePage() {
  return (
    <div className="min-h-screen bg-[#F7F4EE] text-[#11100F] flex flex-col selection:bg-[#E9E1D4] selection:text-[#11100F] overflow-x-hidden print:min-h-0 print:bg-white print:p-0 print:m-0 print:block">
      <LuxuryHeader />

      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center p-24 text-xs uppercase tracking-[0.3em] text-[#8A6D38]">
            Opening Concierge Atelier...
          </div>
        }
      >
        <ConciergeChatContent />
      </Suspense>

      <footer className="border-t border-[#D2CABC]/80 py-8 sm:py-10 px-4 sm:px-8 lg:px-12 text-xs text-[#6A655C] bg-[#FAF8F4] print:hidden no-print">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 text-center sm:text-left">
          <span className="font-serif tracking-[0.3em] uppercase text-sm text-[#11100F] font-medium">
            É T A P E
          </span>
          <span className="text-xs">
            Your Private Concierge &middot; Dedicated Travel Advisory
          </span>
        </div>
      </footer>
    </div>
  );
}
