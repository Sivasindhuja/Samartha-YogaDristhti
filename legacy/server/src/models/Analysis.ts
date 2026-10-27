import mongoose, { Schema, Document, Model } from 'mongoose';
import { Coaching } from '../types/coaching';

export interface Analysis extends Document {
  fileName: string;
  filePath: string;
  asana_name: string;
  score: number;
  angles: Record<string, number>;
  validation: Record<string, any>;
  suggestions: string[];
  keypoints: Record<string, { x: number; y: number; visibility?: number }>;
  profile: { age: number; flexibility: 'low' | 'medium' | 'high'; goal?: string };
  coaching?: Coaching | null;
  createdAt: Date;
}

const CoachingCorrectionSchema = new Schema(
  {
    area: { type: String, default: '' },
    issue: { type: String, default: '' },
    metric: { type: String },
    measured: { type: Number, default: null },
    target: { type: String },
    fix: { type: String, default: '' },
  },
  { _id: false }
);

const CoachingSchema = new Schema(
  {
    status: { type: String, enum: ['ok', 'skipped', 'error'], required: true },
    model: { type: String, default: null },
    summary: { type: String, default: '' },
    corrections: { type: [CoachingCorrectionSchema], default: [] },
    working_well: { type: [String], default: [] },
    safety: { type: [String], default: [] },
    caveats: { type: [String], default: [] },
    confidence: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    error: { type: String },
    generated_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AnalysisSchema = new Schema<Analysis>({
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  asana_name: { type: String, required: true },
  score: { type: Number, required: true },
  angles: { type: Object, required: true },
  validation: { type: Object, required: true },
  suggestions: [{ type: String }],
  keypoints: { type: Object, required: true },
  profile: { type: Object, required: true },
  coaching: { type: CoachingSchema, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const AnalysisModel: Model<Analysis> = mongoose.model<Analysis>('Analysis', AnalysisSchema);
