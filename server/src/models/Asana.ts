import mongoose, { Schema, Document, Model } from 'mongoose';

export interface Asana extends Document {
  asana_name: string;
  alignment: string[];
  mistakes: string[];
  benefits: string[];
  precautions: string[];
  quotes: { source: string; text: string }[];
  references?: string[];
}

const AsanaSchema = new Schema<Asana>({
  asana_name: { type: String, required: true, unique: true },
  alignment: [{ type: String }],
  mistakes: [{ type: String }],
  benefits: [{ type: String }],
  precautions: [{ type: String }],
  quotes: [{ source: String, text: String }],
  references: [{ type: String }],
});

export const AsanaModel: Model<Asana> = mongoose.model<Asana>('Asana', AsanaSchema);
