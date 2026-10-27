"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPoseCoaching = buildPoseCoaching;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const gemini_1 = require("./gemini");
const catalog_1 = require("./catalog");
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const SYSTEM_PROMPT = `You are an experienced yoga teacher reviewing one photograph of a student.

Rules you must follow:
- The MEASURED JOINT DATA in the user message comes from an independent pose-estimation model. Treat those numbers as facts. Never estimate angles yourself.
- Use the photo only for what the numbers cannot express: spinal shape, shoulder and neck tension, gaze direction, props, weight distribution, mat orientation.
- Never contradict a measurement. If the photo suggests a problem the numbers do not show, put it in "caveats" or "safety", never in "corrections".
- If a body part is hidden or the camera angle makes it unreadable, say so in "caveats" instead of guessing.
- Be concise, specific and actionable. No medical diagnosis. Never promise that a correction prevents injury.
- Reply with a single JSON object and nothing else. No prose, no markdown fences.`;
const RESPONSE_SHAPE = `{
  "summary": "2-3 sentences on the overall alignment",
  "corrections": [
    {
      "area": "left knee",
      "issue": "what is wrong, in plain language",
      "metric": "left_knee",
      "measured": 152.3,
      "target": "163-177 degrees",
      "fix": "one concrete cue the student can act on"
    }
  ],
  "working_well": ["things that are correct"],
  "safety": ["contraindications or strain risks, if any"],
  "caveats": ["what the photo or data cannot tell you"],
  "confidence": "low | medium | high"
}`;
function round(value) {
    return Math.round(value * 10) / 10;
}
function describeMeasurements(analyzer) {
    const rows = Object.entries(analyzer.validation || {})
        .filter(([, value]) => value && typeof value.angle === 'number' && Array.isArray(value.ideal_range))
        .map(([metric, value]) => {
        const range = `${round(value.ideal_range[0])}-${round(value.ideal_range[1])} degrees`;
        const status = value.ok
            ? 'within range'
            : `off by ${round(value.delta)} degrees`;
        return `${metric}: measured ${round(value.angle)}, ideal ${range}, ${status}`;
    });
    return rows.length ? rows.join('\n') : 'No usable joint measurements.';
}
function buildUserPrompt(analyzer, catalog) {
    const profile = analyzer.profile || {};
    return [
        `Detected pose: ${analyzer.asana_name} (rule-based confidence ${round(analyzer.score * 100)}%).`,
        `Student profile: age ${profile.age ?? 'unknown'}, self-reported flexibility ${profile.flexibility ?? 'unknown'}, goal ${profile.goal ?? 'alignment'}.`,
        '',
        'MEASURED JOINT DATA:',
        describeMeasurements(analyzer),
        '',
        (0, catalog_1.formatAsanaContext)(catalog),
        '',
        'Rule-based suggestions already shown to the student (do not repeat verbatim):',
        analyzer.suggestions.length ? analyzer.suggestions.map((s) => `- ${s}`).join('\n') : '- none',
        '',
        'Reply with JSON in exactly this shape:',
        RESPONSE_SHAPE,
    ].join('\n');
}
function toStringArray(value, limit = 5) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((item) => typeof item === 'string' && item.trim().length > 0)
        .slice(0, limit)
        .map((item) => item.trim());
}
function normalizeCorrections(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((item) => item && typeof item === 'object')
        .slice(0, 6)
        .map((raw) => ({
        area: typeof raw.area === 'string' ? raw.area.trim() : 'general',
        issue: typeof raw.issue === 'string' ? raw.issue.trim() : '',
        metric: typeof raw.metric === 'string' ? raw.metric.trim() : undefined,
        measured: typeof raw.measured === 'number' && Number.isFinite(raw.measured) ? raw.measured : null,
        target: typeof raw.target === 'string' ? raw.target.trim() : undefined,
        fix: typeof raw.fix === 'string' ? raw.fix.trim() : '',
    }))
        .filter((correction) => correction.issue.length > 0 || correction.fix.length > 0);
}
/**
 * Flags places where the model disagrees with a measurement that is actually
 * inside the ideal range. Usually a sign of a bad camera angle, so it is
 * surfaced as a caveat rather than silently trusted.
 */
function disagreementCaveats(corrections, validation) {
    const caveats = [];
    for (const correction of corrections) {
        if (!correction.metric)
            continue;
        const measured = validation?.[correction.metric];
        if (!measured || typeof measured.angle !== 'number' || !measured.ok)
            continue;
        caveats.push(`${correction.area} was flagged by the coaching model, but the measured angle ` +
            `(${round(measured.angle)} degrees) is inside the ideal range — re-shoot from the side to confirm.`);
    }
    return caveats;
}
/**
 * Adds grounded, LLM-written coaching on top of the analyzer result.
 * Never throws: a missing key or an API outage degrades to rule-based feedback.
 */
async function buildPoseCoaching(input) {
    const { imagePath, analyzer, catalog } = input;
    const empty = {
        status: 'error',
        model: null,
        summary: '',
        corrections: [],
        working_well: [],
        safety: [],
        caveats: [],
        confidence: 'low',
        generated_at: new Date(),
    };
    if (!(0, gemini_1.isGeminiConfigured)()) {
        return {
            ...empty,
            status: 'skipped',
            error: 'GEMINI_API_KEY is not configured; showing rule-based feedback only.',
        };
    }
    try {
        const stat = fs_1.default.statSync(imagePath);
        if (stat.size > MAX_IMAGE_BYTES) {
            return {
                ...empty,
                status: 'skipped',
                error: `Image is too large for the vision model (${Math.round(stat.size / 1024 / 1024)} MB).`,
            };
        }
        const mime = path_1.default.extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
        const dataUrl = `data:${mime};base64,${fs_1.default.readFileSync(imagePath).toString('base64')}`;
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    { type: 'text', text: buildUserPrompt(analyzer, catalog) },
                    { type: 'image_url', image_url: { url: dataUrl } },
                ],
            },
        ];
        const result = await (0, gemini_1.callGemini)(messages, {
            temperature: 0.1,
            maxTokens: 900,
            timeoutMs: 60000,
        });
        const parsed = (0, gemini_1.parseJsonObject)(result.text);
        if (!parsed) {
            return {
                ...empty,
                status: 'error',
                model: result.model,
                summary: result.text.slice(0, 400),
                error: 'Coaching model returned non-JSON output.',
            };
        }
        const corrections = normalizeCorrections(parsed.corrections);
        const confidence = parsed.confidence === 'high' || parsed.confidence === 'low' ? parsed.confidence : 'medium';
        return {
            status: 'ok',
            model: result.model,
            summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 800) : '',
            corrections,
            working_well: toStringArray(parsed.working_well),
            safety: toStringArray(parsed.safety),
            caveats: [
                ...new Set([...toStringArray(parsed.caveats), ...disagreementCaveats(corrections, analyzer.validation)]),
            ],
            confidence,
            generated_at: new Date(),
        };
    }
    catch (err) {
        const message = err instanceof gemini_1.GeminiUnavailableError || err instanceof Error ? err.message : String(err);
        return { ...empty, status: 'error', error: message };
    }
}
//# sourceMappingURL=coach.js.map