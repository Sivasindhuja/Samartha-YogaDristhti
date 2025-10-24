"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileRouter = void 0;
const express_1 = require("express");
const Profile_1 = require("../models/Profile");
exports.profileRouter = (0, express_1.Router)();
exports.profileRouter.get('/default', async (req, res) => {
    const doc = await Profile_1.ProfileModel.findOne();
    if (!doc)
        return res.json({ name: 'Guest', age: 30, flexibility: 'medium', goal: 'alignment' });
    res.json(doc);
});
exports.profileRouter.put('/default', async (req, res) => {
    const { name = 'User', age = 30, flexibility = 'medium', goal = 'alignment' } = req.body || {};
    const doc = await Profile_1.ProfileModel.findOneAndUpdate({}, { name, age, flexibility, goal }, { new: true, upsert: true });
    res.json(doc);
});
//# sourceMappingURL=profile.js.map