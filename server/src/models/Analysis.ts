import mongoose, { Schema, Document, Model } from 'mongoose';

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
  createdAt: Date;
}

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
  createdAt: { type: Date, default: Date.now },
});

export const AnalysisModel: Model<Analysis> = mongoose.model<Analysis>('Analysis', AnalysisSchema);
