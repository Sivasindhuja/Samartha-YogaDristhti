import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { config } from './config/env';
import { asanasRouter } from './routes/asanas';
import { uploadRouter } from './routes/upload';
import { chatRouter } from './routes/chat';
import { analysisRouter } from './routes/analysis';
import { profileRouter } from './routes/profile';

async function bootstrap() {
  await mongoose.connect(config.mongoUri);
  const app = express();

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'backend', version: '0.1.0' }));

  app.use('/api/asanas', asanasRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/analysis', analysisRouter);
  app.use('/api/profile', profileRouter);

  app.use('/uploads', express.static(path.resolve(config.uploadDir)));

  app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
