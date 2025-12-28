"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const scraper_1 = require("../scraper");
const router = (0, express_1.Router)();
// POST /api/questoes - busca questões com filtros
router.post('/questoes', async (req, res) => {
    try {
        console.log('POST /questoes', req.body);
        const result = await (0, scraper_1.scrapeQuestoes)(req.body);
        res.json(result);
    }
    catch (error) {
        console.error('Erro:', error.message);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/questoes/prova/:id - busca questões de uma prova
router.post('/questoes/prova/:id', async (req, res) => {
    try {
        const result = await (0, scraper_1.scrapeProvaById)(req.params.id);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/provas - lista provas
router.post('/provas', async (req, res) => {
    try {
        console.log('POST /provas', req.body);
        const result = await (0, scraper_1.listarProvas)(req.body);
        res.json(result);
    }
    catch (error) {
        console.error('Erro:', error.message);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
