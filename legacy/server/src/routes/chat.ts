import { Router } from 'express';
import { AnalysisModel } from '../models/Analysis';
import { formatAsanaContext, getAsanaContext } from '../services/catalog';
import { callGemini, GeminiMessage, GeminiUnavailableError, isGeminiConfigured } from '../services/gemini';

export const chatRouter = Router();

const SYSTEM_PROMPT = `You are an experienced yoga teacher answering follow-up questions about one student's pose.

Rules:
- Ground every answer in the curated reference and the measured joint data below. Do not invent benefits or contraindications that are not supported by that reference.
- If the reference does not cover the question, say what you know and flag that it is general guidance.
- This app analyses a single still photograph. It cannot count repetitions or measure hold time. Say so plainly if asked, then give sensible general guidance instead.
- Be concise and actionable. No medical diagnosis.
- Answer in plain text, not JSON.`;

function formatMeasured(analysis: any): string {
  if (!analysis) return 'Measured joint data: none available for this conversation.';

  const rows = Object.entries(analysis.validation || {})
    .filter(([, value]: [string, any]) => value && typeof value.angle === 'number' && Array.isArray(value.ideal_range))
    .map(([metric, value]: [string, any]) => {
      const range = `${Math.round(value.ideal_range[0])}-${Math.round(value.ideal_range[1])}`;
      const status = value.ok ? 'within range' : `off by ${Math.round(value.delta)} degrees`;
      return `${metric}: measured ${Math.round(value.angle)}, ideal ${range}, ${status}`;
    });

  return [
    `Detected pose: ${analysis.asana_name} (rule-based confidence ${Math.round((analysis.score ?? 0) * 100)}%).`,
    'Measured joint data:',
    rows.length ? rows.join('\n') : 'none',
    analysis.coaching?.status === 'ok' && analysis.coaching.summary
      ? `Earlier coaching summary: ${analysis.coaching.summary}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
}

chatRouter.post('/', async (req, res) => {
  try {
    const { analysis_id, asana_name, user_prompt } = req.body || {};

    const analysis = isObjectId(analysis_id)
      ? await AnalysisModel.findById(analysis_id).lean()
      : null;

    const poseName: string | undefined = asana_name || (analysis as any)?.asana_name;
    const catalog = await getAsanaContext(poseName).catch(() => null);

    if (!isGeminiConfigured()) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Add it to server/.env to enable chat.',
      });
    }

    const userPrompt = [
      `Pose: ${poseName || 'unknown'}`,
      '',
      formatAsanaContext(catalog),
      '',
      formatMeasured(analysis),
      '',
      `Student question: ${user_prompt || 'Give me feedback and a 2-step improvement plan.'}`,
    ].join('\n');

    const messages: GeminiMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    const result = await callGemini(messages, { temperature: 0.4, maxTokens: 700 });

    res.json({
      message: result.text,
      model: result.model,
      grounded: {
        asana_reference: Boolean(catalog),
        measurement: Boolean(analysis),
      },
    });
  } catch (err: any) {
    if (err instanceof GeminiUnavailableError) {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});
