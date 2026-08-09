import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const client = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
async function run() {
  try {
    const response = await client.models.list();
    for await (const m of response) {
      console.log(m.name);
    }
  } catch(e) {
    console.error("List failed:", e);
  }
}
run().catch(console.error);
