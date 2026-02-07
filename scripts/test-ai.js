import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testConnection() {
  console.log("📡 Testing AI Connection...");
  
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ No API Key found in .env.local");
    return;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // Try the most basic, oldest model first (Gemini 1.0 Pro)
  const modelName = "gemini-1.0-pro"; 
  const model = genAI.getGenerativeModel({ model: modelName });

  try {
    const result = await model.generateContent("Say hello.");
    const response = await result.response;
    console.log(`✅ SUCCESS! Model '${modelName}' is working.`);
    console.log(`   Response: ${response.text()}`);
  } catch (error) {
    console.error(`❌ FAILED on '${modelName}':`);
    console.error(`   Error: ${error.message}`);
    
    // If that fails, the user might need to enable the API
    console.log("\n👇 TROUBLESHOOTING TIP:");
    console.log("If you see a 404, visit this link to ensure the API is enabled for your project:");
    console.log("https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com");
  }
}

testConnection();