import { Router } from 'express';
import { chatWithOpenRouter } from '../services/openrouter';

export const chatRouter = Router();

chatRouter.post('/', async (req, res) => {
  const { asana_name, benefits, precautions, alignment, mistakes, quotes, user_prompt } = req.body || {};
  const preface = `You are an expert yoga teacher. The user uploaded a pose.\n` +
    (asana_name ? `Pose: ${asana_name}.\n` : '') +
    (benefits ? `Benefits: ${Array.isArray(benefits) ? benefits.join('; ') : benefits}.\n` : '') +
    (precautions ? `Precautions: ${Array.isArray(precautions) ? precautions.join('; ') : precautions}.\n` : '') +
    (alignment ? `Alignment: ${Array.isArray(alignment) ? alignment.join('; ') : alignment}.\n` : '') +
    (mistakes ? `Common mistakes: ${Array.isArray(mistakes) ? mistakes.join('; ') : mistakes}.\n` : '') +
    (quotes ? `Quotes: ${JSON.stringify(quotes)}.\n` : '') +
    `Provide concise guidance and micro-adjustments.`;

  const answer = await chatWithOpenRouter(`${preface}\n\nUser: ${user_prompt || 'Give me feedback and a 2-step improvement plan.'}`);
  res.json({ message: answer });
});
