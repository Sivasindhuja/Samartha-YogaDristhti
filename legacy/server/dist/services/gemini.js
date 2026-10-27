"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiUnavailableError = void 0;
exports.isGeminiConfigured = isGeminiConfigured;
exports.callGemini = callGemini;
exports.parseJsonObject = parseJsonObject;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
class GeminiUnavailableError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'GeminiUnavailableError';
        this.status = status;
    }
}
exports.GeminiUnavailableError = GeminiUnavailableError;
function isGeminiConfigured() {
    return Boolean(env_1.config.geminiApiKey);
}
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
function describeError(err) {
    if (axios_1.default.isAxiosError(err)) {
        const data = err.response?.data;
        return data?.error?.message || data?.message || err.message;
    }
    return err instanceof Error ? err.message : String(err);
}
async function callModel(model, messages, opts) {
    const body = {
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
    };
    if (opts.maxTokens)
        body.max_tokens = opts.maxTokens;
    const resp = await axios_1.default.post(`${env_1.config.geminiBaseUrl}/chat/completions`, body, {
        headers: {
            Authorization: `Bearer ${env_1.config.geminiApiKey}`,
            'Content-Type': 'application/json',
        },
        timeout: opts.timeoutMs ?? 45000,
    });
    const content = resp.data?.choices?.[0]?.message?.content;
    const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
            ? content.map((part) => part?.text ?? '').join('')
            : '';
    if (!text.trim())
        throw new Error('Gemini returned an empty completion');
    return { text, model, usage: resp.data?.usage };
}
/**
 * Calls Gemini with the primary model, then falls back to the configured
 * fallback model when the primary is rate limited / overloaded.
 */
async function callGemini(messages, opts = {}) {
    if (!isGeminiConfigured()) {
        throw new GeminiUnavailableError('GEMINI_API_KEY is not configured');
    }
    const candidates = [opts.model || env_1.config.geminiModel, env_1.config.geminiFallbackModel].filter((model, index, all) => Boolean(model) && all.indexOf(model) === index);
    let lastError = null;
    for (const model of candidates) {
        try {
            return await callModel(model, messages, opts);
        }
        catch (err) {
            lastError = err;
            const status = axios_1.default.isAxiosError(err) ? err.response?.status : undefined;
            const retryDifferentModel = status === undefined || RETRYABLE_STATUS.has(status);
            if (!retryDifferentModel)
                break;
        }
    }
    const status = axios_1.default.isAxiosError(lastError) ? lastError.response?.status : undefined;
    throw new GeminiUnavailableError(describeError(lastError), status);
}
/**
 * Extracts the first JSON object from a model response. Models occasionally
 * wrap JSON in prose or markdown fences, so we fail soft rather than throw.
 */
function parseJsonObject(raw) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : raw;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start)
        return null;
    try {
        return JSON.parse(candidate.slice(start, end + 1));
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=gemini.js.map