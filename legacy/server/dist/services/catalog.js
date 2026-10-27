"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAsanaContext = getAsanaContext;
exports.formatAsanaContext = formatAsanaContext;
const Asana_1 = require("../models/Asana");
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Looks up the curated reference entry for a pose (case-insensitive exact match). */
async function getAsanaContext(name) {
    const trimmed = name?.trim();
    if (!trimmed)
        return null;
    const doc = await Asana_1.AsanaModel.findOne({
        asana_name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i'),
    }).lean();
    if (!doc)
        return null;
    return {
        asana_name: doc.asana_name,
        alignment: doc.alignment ?? [],
        mistakes: doc.mistakes ?? [],
        benefits: doc.benefits ?? [],
        precautions: doc.precautions ?? [],
        quotes: (doc.quotes ?? []).map((q) => ({ source: q?.source, text: q?.text })),
    };
}
/** Renders the catalog entry as prompt-ready text. */
function formatAsanaContext(ctx) {
    if (!ctx)
        return 'Curated reference: none available for this pose.';
    const list = (items) => (items.length ? items.join('; ') : '-');
    const quote = ctx.quotes.find((q) => q.text);
    return [
        `Curated reference for ${ctx.asana_name}:`,
        `- Alignment cues: ${list(ctx.alignment)}`,
        `- Common mistakes: ${list(ctx.mistakes)}`,
        `- Benefits: ${list(ctx.benefits)}`,
        `- Precautions: ${list(ctx.precautions)}`,
        quote ? `- Quote (${quote.source || 'source'}): ${quote.text}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}
//# sourceMappingURL=catalog.js.map