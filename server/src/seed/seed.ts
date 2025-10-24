import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { AsanaModel } from '../models/Asana';
import { config } from '../config/env';

async function run() {
  await mongoose.connect(config.mongoUri);
  const dataPath = path.resolve(__dirname, 'asanas.json');
  const json = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  for (const item of json) {
    await AsanaModel.updateOne({ asana_name: item.asana_name }, { $set: item }, { upsert: true });
  }
  console.log('Seeded asanas:', json.length);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
