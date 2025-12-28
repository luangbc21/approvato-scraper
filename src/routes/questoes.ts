import { Router, Request, Response } from 'express';
import { scrapeQuestoes, scrapeProvaById, listarProvas } from '../scraper';

const router = Router();

// POST /api/questoes - busca questões com filtros
router.post('/questoes', async (req: Request, res: Response) => {
  try {
    console.log('POST /questoes', req.body);
    const result = await scrapeQuestoes(req.body);
    res.json(result);
  } catch (error: any) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/questoes/prova/:id - busca questões de uma prova
router.post('/questoes/prova/:id', async (req: Request, res: Response) => {
  try {
    const result = await scrapeProvaById(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/provas - lista provas
router.post('/provas', async (req: Request, res: Response) => {
  try {
    console.log('POST /provas', req.body);
    const result = await listarProvas(req.body);
    res.json(result);
  } catch (error: any) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
