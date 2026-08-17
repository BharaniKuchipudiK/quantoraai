/**
 * Central Registry for Quantora Agentic AI Tools
 * 
 * This module defines the schemas and execution handlers for outcome-based 
 * function calling capabilities passed to the Gemini orchestrator.
 */

// -----------------------------------------------------------------------------
// 1. Tool Schemas (Passed to Gemini)
// -----------------------------------------------------------------------------

export const travelFunctionDeclarations: any[] = [
  {
    name: "search_flights",
    description: "Search for real-time flight availability and pricing. Use this when the user asks to plan a trip, find flights, or check travel costs.",
    parameters: {
      type: "OBJECT",
      properties: {
        origin: { type: "STRING", description: "The origin city or 3-letter IATA airport code (e.g. SIN, JFK)" },
        destination: { type: "STRING", description: "The destination city or 3-letter IATA airport code (e.g. DPS, LHR)" },
        departureDate: { type: "STRING", description: "The departure date in YYYY-MM-DD format, or natural language if unsure (e.g. 'next Friday')" },
        returnDate: { type: "STRING", description: "Optional. The return date in YYYY-MM-DD format." },
        passengers: { type: "INTEGER", description: "Number of passengers. Default is 1." }
      },
      required: ["origin", "destination", "departureDate"]
    }
  },
  {
    name: "search_hotels",
    description: "Search for real-time hotel availability, ratings, and pricing for a specific location and date range.",
    parameters: {
      type: "OBJECT",
      properties: {
        location: { type: "STRING", description: "The city or specific neighborhood (e.g. 'Seminyak, Bali')" },
        checkInDate: { type: "STRING", description: "Check-in date (YYYY-MM-DD)" },
        checkOutDate: { type: "STRING", description: "Check-out date (YYYY-MM-DD)" },
        guests: { type: "INTEGER", description: "Number of guests. Default is 1." },
        minStarRating: { type: "INTEGER", description: "Minimum star rating (1-5)." }
      },
      required: ["location", "checkInDate", "checkOutDate"]
    }
  },
  {
    name: "get_places_routing",
    description: "Search Google Maps Places API to find restaurants, attractions, or calculate commute times between a hotel and a point of interest.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "What to search for (e.g. 'Beach clubs near Seminyak, Bali' or 'Distance from Airport to W Hotel Bali')" },
        placeType: { type: "STRING", description: "Optional type of place (e.g. 'restaurant', 'tourist_attraction', 'transit_station')" }
      },
      required: ["query"]
    }
  },
  {
    name: "create_price_alert",
    description: "Create a background price tracker for flights or hotels. Use this when the user says prices are too high, or they are planning far in advance and want to be notified of price drops.",
    parameters: {
      type: "OBJECT",
      properties: {
        entityType: { type: "STRING", description: "'flight' or 'hotel'" },
        origin: { type: "STRING", description: "Origin code (if flight)" },
        destination: { type: "STRING", description: "Destination code (if flight) or location (if hotel)" },
        dates: { type: "STRING", description: "The travel dates to track" },
        targetPrice: { type: "INTEGER", description: "The target price threshold to trigger an alert" }
      },
      required: ["entityType", "destination", "dates"]
    }
  },
  {
    name: "make_reservation",
    description: "Finalize a booking reservation for a flight or hotel. Only use this when the user explicitly agrees to book a specific option.",
    parameters: {
      type: "OBJECT",
      properties: {
        bookingType: { type: "STRING", description: "'flight' or 'hotel'" },
        itemId: { type: "STRING", description: "The flight number or hotel name to book" },
        dates: { type: "STRING", description: "The dates of the reservation" },
        price: { type: "INTEGER", description: "The agreed upon price" }
      },
      required: ["bookingType", "itemId", "dates", "price"]
    }
  },
  {
    name: "search_attractions",
    description: "Search for tourist attractions, experiences, and tours (like Klook/Viator) in a specific destination. Proactively use this to suggest activities to users after their flights/hotels are secured.",
    parameters: {
      type: "OBJECT",
      properties: {
        location: { type: "STRING", description: "The city or region to search for attractions" },
        category: { type: "STRING", description: "Optional. Type of experience (e.g., 'cultural', 'adventure', 'family', 'food')" }
      },
      required: ["location"]
    }
  },
  {
    name: "book_attraction",
    description: "Finalize a booking for a specific attraction or tour.",
    parameters: {
      type: "OBJECT",
      properties: {
        attractionName: { type: "STRING", description: "The name of the attraction or tour" },
        date: { type: "STRING", description: "The date of the experience" },
        tickets: { type: "INTEGER", description: "Number of tickets to book" }
      },
      required: ["attractionName", "date", "tickets"]
    }
  },
  {
    name: "ask_clarifying_question",
    description: "Pause the planning process and explicitly ask the user a question to gather missing preferences (e.g., travel dates, budget, preferred vibe). Use this instead of hallucinating details.",
    parameters: {
      type: "OBJECT",
      properties: {
        question: { type: "STRING", description: "The specific question to ask the user" }
      },
      required: ["question"]
    }
  }
];

// -----------------------------------------------------------------------------
// 2. Execution Handlers (Mocked for high-fidelity architecture proof)
// -----------------------------------------------------------------------------

export async function executeToolCall(name: string, args: any): Promise<any> {
  console.log(`[Agentic Orchestrator] Executing Tool: ${name}`, args);
  
  // Simulate network latency for API calls
  await new Promise(resolve => setTimeout(resolve, 800));

  switch (name) {
    case "search_flights":
      return {
        status: "success",
        currency: "USD",
        flights: [
          {
            airline: "Singapore Airlines",
            flightNumber: "SQ938",
            departure: `${args.departureDate}T09:00:00`,
            arrival: `${args.departureDate}T11:45:00`,
            duration: "2h 45m",
            price: 245.50,
            direct: true,
            baggageAllowance: "30kg"
          },
          {
            airline: "Scoot",
            flightNumber: "TR280",
            departure: `${args.departureDate}T15:20:00`,
            arrival: `${args.departureDate}T18:10:00`,
            duration: "2h 50m",
            price: 115.00,
            direct: true,
            baggageAllowance: "Cabin only (10kg)"
          }
        ]
      };

    case "search_hotels":
      return {
        status: "success",
        currency: "USD",
        hotels: [
          {
            name: "W Bali - Seminyak",
            rating: 4.8,
            stars: 5,
            pricePerNight: 350.00,
            amenities: ["Beachfront", "Spa", "3 Pools", "Breakfast Included"],
            distanceToCenter: "0.5 miles"
          },
          {
            name: "Potato Head Suites & Studios",
            rating: 4.6,
            stars: 5,
            pricePerNight: 210.00,
            amenities: ["Beach Club Access", "Sustainability Focus", "Pool"],
            distanceToCenter: "0.2 miles"
          },
          {
            name: "Dash Hotel Seminyak",
            rating: 4.3,
            stars: 4,
            pricePerNight: 85.00,
            amenities: ["Rooftop Bar", "Pool", "Free WiFi"],
            distanceToCenter: "0.8 miles"
          }
        ]
      };

    case "get_places_routing":
      return {
        status: "success",
        places: [
          {
            name: "Ku De Ta",
            type: "Beach Club / Restaurant",
            rating: 4.5,
            userReviews: 8400,
            address: "Jalan Kayu Aya No.9, Seminyak",
            openNow: true,
            estimatedCommuteFromSeminyakCenter: "5 mins walking"
          },
          {
            name: "Finns Beach Club",
            type: "Beach Club",
            rating: 4.4,
            userReviews: 12000,
            address: "Jalan Pantai Berawa, Canggu",
            openNow: true,
            estimatedCommuteFromSeminyakCenter: "15 mins via Taxi/Gojek"
          }
        ]
      };

    case "create_price_alert":
      return {
        status: "success",
        alertId: `alert_${Math.random().toString(36).substr(2, 9)}`,
        message: `Successfully created price tracker for ${args.entityType} to ${args.destination} for ${args.dates}. The system will monitor daily and notify the user if prices drop below ${args.targetPrice ? '$' + args.targetPrice : 'current rates'}.`
      };

    case "make_reservation":
      return {
        status: "success",
        confirmationCode: `CONF-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        message: `Successfully booked ${args.bookingType}: ${args.itemId} for ${args.dates} at $${args.price}.`,
        nextSteps: "Please inform the user that their reservation is confirmed and an itinerary document will be generated."
      };

    case "search_attractions":
      return {
        status: "success",
        attractions: [
          {
            name: "Mount Batur Sunrise Trek",
            provider: "Bali Adventure Tours",
            price: 45.00,
            duration: "8 hours",
            rating: 4.9,
            description: "Guided sunrise hike up an active volcano with breakfast cooked on volcanic steam.",
            availability: "High"
          },
          {
            name: "Ubud Sacred Monkey Forest Sanctuary",
            provider: "Direct Entry",
            price: 8.00,
            duration: "Flexible",
            rating: 4.7,
            description: "Explore lush ancient temples inhabited by hundreds of Balinese long-tailed macaques.",
            availability: "Always available"
          },
          {
            name: "Nusa Penida Day Trip (Manta Ray Snorkeling)",
            provider: "Island Hoppers",
            price: 75.00,
            duration: "Full Day",
            rating: 4.8,
            description: "Speedboat to Nusa Penida, visiting Kelingking Beach and snorkeling with giant Manta Rays.",
            availability: "Booking fast"
          }
        ]
      };

    case "book_attraction":
      return {
        status: "success",
        confirmationCode: `TKT-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        message: `Successfully booked ${args.tickets} tickets for ${args.attractionName} on ${args.date}. E-tickets have been secured.`
      };

    case "ask_clarifying_question":
      return {
        status: "success",
        action: "PAUSE_AND_ASK",
        message: `The agent is instructed to stop invoking tools and surface this question directly to the user: ${args.question}`
      };

    default:
      return { error: `Unknown tool requested: ${name}` };
  }
}
