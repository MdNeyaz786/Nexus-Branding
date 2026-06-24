import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("Missing GEMINI_API_KEY in .env");
}

// Initialize Google Gemini Client
const genAI = new GoogleGenerativeAI(apiKey);

// Export a configured model instance (e.g., Gemini 1.5 Pro)
export const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
