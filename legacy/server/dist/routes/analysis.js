"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analysisRouter = void 0;
const express_1 = require("express");
const Analysis_1 = require("../models/Analysis");
exports.analysisRouter = (0, express_1.Router)();
exports.analysisRouter.get('/', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const items = await Analysis_1.AnalysisModel.find().sort({ createdAt: -1 }).limit(limit);
    res.json(items);
});
exports.analysisRouter.get('/:id', async (req, res) => {
    const item = await Analysis_1.AnalysisModel.findById(req.params.id);
    if (!item)
        return res.status(404).json({ error: 'Not found' });
    res.json(item);
});
//# sourceMappingURL=analysis.js.map