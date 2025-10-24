"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: process.env.ENV_PATH || path_1.default.resolve(process.cwd(), '.env') });
exports.config = {
    port: parseInt(process.env.PORT || '4000', 10),
    mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/asana_mvp',
    analyzerUrl: process.env.ANALYZER_URL || 'http://127.0.0.1:8000',
    uploadDir: process.env.UPLOAD_DIR || path_1.default.resolve(process.cwd(), 'uploads'),
    openRouterKey: process.env.OPENROUTER_API_KEY || '',
    corsOrigin: process.env.CORS_ORIGIN || '*',
};
//# sourceMappingURL=env.js.map