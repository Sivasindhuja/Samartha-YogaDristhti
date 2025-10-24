"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const Asana_1 = require("../models/Asana");
const env_1 = require("../config/env");
async function run() {
    await mongoose_1.default.connect(env_1.config.mongoUri);
    const dataPath = path_1.default.resolve(__dirname, 'asanas.json');
    const json = JSON.parse(fs_1.default.readFileSync(dataPath, 'utf8'));
    for (const item of json) {
        await Asana_1.AsanaModel.updateOne({ asana_name: item.asana_name }, { $set: item }, { upsert: true });
    }
    console.log('Seeded asanas:', json.length);
    await mongoose_1.default.disconnect();
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map