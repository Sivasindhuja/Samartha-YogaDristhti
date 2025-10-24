"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const Analysis_1 = require("../models/Analysis");
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        fs_1.default.mkdirSync(env_1.config.uploadDir, { recursive: true });
        cb(null, env_1.config.uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    fileFilter: (req, file, cb) => {
        const ok = /jpeg|jpg/.test(path_1.default.extname(file.originalname).toLowerCase());
        if (ok)
            cb(null, true);
        else
            cb(new Error('Only .jpg/.jpeg allowed'));
    },
    limits: { fileSize: 8 * 1024 * 1024 }
});
exports.uploadRouter = (0, express_1.Router)();
exports.uploadRouter.post('/', upload.single('file'), async (req, res) => {
    try {
        const flexibility = req.body.flexibility || 'medium';
        const age = parseInt(req.body.age || '30', 10);
        const goal = req.body.goal || 'alignment';
        const filePath = req.file?.path;
        if (!filePath)
            return res.status(400).json({ error: 'No file uploaded' });
        // Stream the file properly using form-data
        const FormData = (await Promise.resolve().then(() => __importStar(require('form-data')))).default;
        const form = new FormData();
        form.append('file', fs_1.default.createReadStream(filePath));
        form.append('age', age.toString());
        form.append('flexibility', flexibility);
        form.append('goal', goal);
        const analyzeResp = await axios_1.default.post(`${env_1.config.analyzerUrl}/analyze`, form, { headers: form.getHeaders() });
        const result = analyzeResp.data;
        // Persist analysis metadata
        const saved = await Analysis_1.AnalysisModel.create({
            fileName: path_1.default.basename(filePath),
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
        res.json({ ...result, file: path_1.default.basename(filePath), analysis_id: saved._id });
    }
    catch (err) {
        res.status(500).json({ error: err?.response?.data || err.message });
    }
});
//# sourceMappingURL=upload.js.map