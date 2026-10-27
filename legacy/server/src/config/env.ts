import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: process.env.ENV_PATH || path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/asana_mvp',
  analyzerUrl: process.env.ANALYZER_URL || 'http://127.0.0.1:8000',
  uploadDir: process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // Gemini is used through its OpenAI-compatible endpoint, so the request
  // shape matches the OpenAI chat-completions API (incl. image_url parts).
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  // Used automatically when the primary model is rate limited or unavailable.
  geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite',
};
