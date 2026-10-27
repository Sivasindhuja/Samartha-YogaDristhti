import { Router } from 'express';
import { AsanaModel } from '../models/Asana';

export const asanasRouter = Router();

asanasRouter.get('/', async (req, res) => {
  const q = (req.query.q as string)?.trim();
  if (q) {
    const doc = await AsanaModel.findOne({ asana_name: new RegExp(`^${q}$`, 'i') });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.json(doc);
  }
  const docs = await AsanaModel.find({}).limit(200);
  res.json(docs);
});
