import mongoose, { Schema, Document, Model } from 'mongoose';

export interface Profile extends Document {
  name: string;
  age: number;
  flexibility: 'low' | 'medium' | 'high';
  goal?: string;
}

const ProfileSchema = new Schema<Profile>({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  flexibility: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  goal: { type: String },
});

export const ProfileModel: Model<Profile> = mongoose.model<Profile>('Profile', ProfileSchema);
