"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const questoes_1 = __importDefault(require("./routes/questoes"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: '*' }));
app.use(express_1.default.json());
app.use('/api', questoes_1.default);
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/', (req, res) => {
    res.json({
        name: 'Approvato Scraper API',
        endpoints: ['GET /health', 'POST /api/questoes', 'POST /api/questoes/prova/:id', 'POST /api/provas']
    });
});
const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Scraper rodando na porta ${PORT}`);
});
