import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { config } from '../config/env';
import { AnalysisModel } from '../models/Analysis';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(config.uploadDir, { recursive: true });
    cb(null, config.uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg/.test(path.extname(file.originalname).toLowerCase());
    if (ok) cb(null, true); else cb(new Error('Only .jpg/.jpeg allowed'));
  },
  limits: { fileSize: 8 * 1024 * 1024 }
});

export const uploadRouter = Router();

uploadRouter.post('/', upload.single('file'), async (req, res) => {
  try {
    const flexibility = (req.body.flexibility as string) || 'medium';
    const age = parseInt((req.body.age as string) || '30', 10);
    const goal = (req.body.goal as string) || 'alignment';

    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No file uploaded' });

    // Stream the file properly using form-data
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('age', age.toString());
    form.append('flexibility', flexibility);
    form.append('goal', goal);

    const analyzeResp = await axios.post(`${config.analyzerUrl}/analyze`, form, { headers: form.getHeaders() });

    const result = analyzeResp.data;

    // Persist analysis metadata
    const saved = await AnalysisModel.create({
      fileName: path.basename(filePath),
      filePath,
      asana_name: result.asana_name,
      score: result.score,
      angles: result.angles,
      validation: result.validation,
      suggestions: result.suggestions,
      keypoints: result.keypoints,
      profile: result.profile,
      createdAt: new Date(),
    });

    res.json({ ...result, file: path.basename(filePath), analysis_id: saved._id });
  } catch (err: any) {
    res.status(500).json({ error: err?.response?.data || err.message });
  }
});
