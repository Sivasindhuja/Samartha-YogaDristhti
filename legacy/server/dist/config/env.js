"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: process.env.ENV_PATH || path_1.default.resolve(process.cwd(), '.env') });
exports.config = {
    port: parseInt(process.env.PORT || '4000', 10),
    mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/asana_mvp',
    analyzerUrl: process.env.ANALYZER_URL || 'http://127.0.0.1:8000',
    uploadDir: process.env.UPLOAD_DIR || path_1.default.resolve(process.cwd(), 'uploads'),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    // Gemini is used through its OpenAI-compatible endpoint, so the request
    // shape matches the OpenAI chat-completions API (incl. image_url parts).
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    // Used automatically when the primary model is rate limited or unavailable.
    geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite',
};
//# sourceMappingURL=env.js.map