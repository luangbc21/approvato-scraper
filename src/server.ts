import express from 'express';
import cors from 'cors';
import questoesRouter from './routes/questoes';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api', questoesRouter);

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
