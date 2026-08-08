import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function run() {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent("Can you give me a structured table comparing React and Vue?");
  const response = await result.response;
  const text = response.text();
  console.log("RAW TEXT:\n" + text);
  console.log("JSON STRINGIFIED:\n" + JSON.stringify(text));
}
run();
