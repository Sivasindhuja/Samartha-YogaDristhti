import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: process.env.ENV_PATH || path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/asana_mvp',
  analyzerUrl: process.env.ANALYZER_URL || 'http://127.0.0.1:8000',
  uploadDir: process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'),
  openRouterKey: process.env.OPENROUTER_API_KEY || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
