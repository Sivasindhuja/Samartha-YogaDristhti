import { Router } from 'express';
import { ProfileModel } from '../models/Profile';

export const profileRouter = Router();

profileRouter.get('/default', async (req, res) => {
  const doc = await ProfileModel.findOne();
  if (!doc) return res.json({ name: 'Guest', age: 30, flexibility: 'medium', goal: 'alignment' });
  res.json(doc);
});

profileRouter.put('/default', async (req, res) => {
  const { name = 'User', age = 30, flexibility = 'medium', goal = 'alignment' } = req.body || {};
  const doc = await ProfileModel.findOneAndUpdate({}, { name, age, flexibility, goal }, { new: true, upsert: true });
  res.json(doc);
});
