"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asanasRouter = void 0;
const express_1 = require("express");
const Asana_1 = require("../models/Asana");
exports.asanasRouter = (0, express_1.Router)();
exports.asanasRouter.get('/', async (req, res) => {
    const q = req.query.q?.trim();
    if (q) {
        const doc = await Asana_1.AsanaModel.findOne({ asana_name: new RegExp(`^${q}$`, 'i') });
        if (!doc)
            return res.status(404).json({ error: 'Not found' });
        return res.json(doc);
    }
    const docs = await Asana_1.AsanaModel.find({}).limit(200);
    res.json(docs);
});
//# sourceMappingURL=asanas.js.map