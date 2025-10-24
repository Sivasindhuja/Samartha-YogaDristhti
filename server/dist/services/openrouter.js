"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatWithOpenRouter = chatWithOpenRouter;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
async function chatWithOpenRouter(prompt) {
    if (!env_1.config.openRouterKey) {
        return 'OpenRouter API key not configured. Please set OPENROUTER_API_KEY.';
    }
    const baseURL = 'https://openrouter.ai/api/v1';
    try {
        const resp = await axios_1.default.post(`${baseURL}/chat/completions`, {
            model: 'meta-llama/llama-3.1-8b-instruct:free',
            messages: [
                { role: 'system', content: 'You are a yoga assistant. Be concise and actionable.' },
                { role: 'user', content: prompt },
            ],
            temperature: 0.3,
        }, {
            headers: {
                'Authorization': `Bearer ${env_1.config.openRouterKey}`,
                'HTTP-Referer': 'https://example.com',
                'X-Title': 'Asana Coach MVP',
            },
        });
        return resp.data.choices?.[0]?.message?.content ?? 'No response';
    }
    catch (err) {
        return `Chat service error: ${err?.response?.data?.error?.message || err.message}`;
    }
}
//# sourceMappingURL=openrouter.js.map