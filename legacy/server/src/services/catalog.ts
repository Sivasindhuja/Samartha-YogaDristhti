import { AsanaModel } from '../models/Asana';

export interface AsanaContext {
  asana_name: string;
  alignment: string[];
  mistakes: string[];
  benefits: string[];
  precautions: string[];
  quotes: { source?: string; text?: string }[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Looks up the curated reference entry for a pose (case-insensitive exact match). */
export async function getAsanaContext(name?: string | null): Promise<AsanaContext | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const doc = await AsanaModel.findOne({
    asana_name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i'),
  }).lean();

  if (!doc) return null;

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
export function formatAsanaContext(ctx: AsanaContext | null): string {
  if (!ctx) return 'Curated reference: none available for this pose.';

  const list = (items: string[]) => (items.length ? items.join('; ') : '-');
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
