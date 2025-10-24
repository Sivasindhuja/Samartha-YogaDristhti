import axios from 'axios';
import { config } from '../config/env';

export async function chatWithOpenRouter(prompt: string): Promise<string> {
  if (!config.openRouterKey) {
    return 'OpenRouter API key not configured. Please set OPENROUTER_API_KEY.';
  }
  const baseURL = 'https://openrouter.ai/api/v1';
  try {
    const resp = await axios.post(
      `${baseURL}/chat/completions`,
      {
    model: 'mistralai/mistral-7b-instruct-v0.2',
        messages: [
          { role: 'system', content: 'You are a yoga assistant. Be concise and actionable.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.openRouterKey}`,
          'HTTP-Referer': 'https://example.com',
          'X-Title': 'Asana Coach MVP',
        },
      }
    );
    return resp.data.choices?.[0]?.message?.content ?? 'No response';
  } catch (err: any) {
    return `Chat service error: ${err?.response?.data?.error?.message || err.message}`;
  }
}
