import { Router } from 'express';
import { AnalysisModel } from '../models/Analysis';

export const analysisRouter = Router();

analysisRouter.get('/', async (req, res) => {
  const limit = Math.min(parseInt((req.query.limit as string) || '10', 10), 50);
  const items = await AnalysisModel.find().sort({ createdAt: -1 }).limit(limit);
  res.json(items);
});

analysisRouter.get('/:id', async (req, res) => {
  const item = await AnalysisModel.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});
