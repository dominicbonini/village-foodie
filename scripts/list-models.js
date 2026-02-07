import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function listModels() {
  console.log("📡 Fetching available AI models...");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Dummy init
    // We access the API directly to list models
    const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await result.json();

    if (data.error) {
        console.error("❌ API Error:", data.error.message);
        return;
    }

    console.log("\n✅ SUCCESS! Here are the models you can use:");
    const names = data.models?.map(m => m.name.replace("models/", "")) || [];
    console.log(names.join("\n"));
    
  } catch (error) {
    console.error("❌ Failed:", error.message);
  }
}

listModels();