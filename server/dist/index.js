"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const asanas_1 = require("./routes/asanas");
const upload_1 = require("./routes/upload");
const chat_1 = require("./routes/chat");
const analysis_1 = require("./routes/analysis");
const profile_1 = require("./routes/profile");
async function bootstrap() {
    await mongoose_1.default.connect(env_1.config.mongoUri);
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({ origin: env_1.config.corsOrigin, credentials: true }));
    app.use(express_1.default.json({ limit: '2mb' }));
    app.get('/health', (req, res) => res.json({ status: 'ok', service: 'backend', version: '0.1.0' }));
    app.use('/api/asanas', asanas_1.asanasRouter);
    app.use('/api/upload', upload_1.uploadRouter);
    app.use('/api/chat', chat_1.chatRouter);
    app.use('/api/analysis', analysis_1.analysisRouter);
    app.use('/api/profile', profile_1.profileRouter);
    app.use('/uploads', express_1.default.static(path_1.default.resolve(env_1.config.uploadDir)));
    app.listen(env_1.config.port, () => {
        console.log(`Server listening on http://localhost:${env_1.config.port}`);
    });
}
bootstrap().catch((err) => {
    console.error('Fatal error starting server:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map