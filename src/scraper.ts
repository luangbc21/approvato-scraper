import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { Question, ScrapeResult, FilterParams } from './types';

let browserInstance: Browser | null = null;
let loggedContext: BrowserContext | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log('Iniciando browser...');
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (loggedContext) {
    await loggedContext.close();
    loggedContext = null;
  }
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

async function getLoggedContext(): Promise<BrowserContext> {
  if (loggedContext) {
    return loggedContext;
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    console.log('Fazendo login no QConcursos...');
    await page.goto('https://www.qconcursos.com/conta/entrar', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    console.log('Formulário de login carregado');

    await page.waitForSelector('#login_form', { timeout: 10000 });
    console.log('Formulário #login_form encontrado');

    await page.fill('#login_email', 'alma.proxycontrol@gmail.com');
    console.log('Email preenchido');

    await page.fill('#login_password', 'Lulu374@');
    console.log('Senha preenchida');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {
        console.log('Navegação não detectada, verificando login...');
      }),
      page.click('#btnLogin')
    ]);
    console.log('Botão de login clicado');

    await page.waitForTimeout(3000);

    const loginSuccess = await page.evaluate(() => {
      const loginButton = document.querySelector('a[href*="/conta/entrar"]');
      return !loginButton;
    });

    if (loginSuccess) {
      console.log('✅ Login realizado com sucesso!');
    } else {
      console.warn('⚠️ Login pode não ter sido bem-sucedido');
    }

    loggedContext = context;
    await page.close();
    return context;

  } catch (error: any) {
    console.error('Erro ao fazer login:', error.message);
    await page.close();
    await context.close();
    throw new Error(`Login failed: ${error.message}`);
  }
}

function buildUrl(filters: FilterParams): string {
  const baseUrl = 'https://www.qconcursos.com/questoes-de-concursos/questoes';
  const params = new URLSearchParams();

  if (filters.banca) params.append('banca', filters.banca);
  if (filters.orgao) params.append('orgao', filters.orgao);
  if (filters.ano) params.append('ano', filters.ano.toString());
  if (filters.disciplina) params.append('disciplina', filters.disciplina);
  if (filters.page) params.append('page', filters.page.toString());

  const queryString = params.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

async function extractQuestions(page: Page): Promise<Question[]> {
  return await page.evaluate(() => {
    const questions: Question[] = [];
    const questionContainers = document.querySelectorAll('.q-question-item');

    questionContainers.forEach((container) => {
      const beltEl = container.querySelector('.q-question-belt[data-question-id]');
      const id = beltEl?.getAttribute('data-question-id') || '';

      if (!id) return;

      const statementEl = container.querySelector('.q-question-enunciation');
      const statement = statementEl?.textContent?.trim() || '';

      const alternatives: any = { A: '', B: '', C: '', D: '', E: '' };
      container.querySelectorAll('.q-question-options .q-radio-button').forEach((alt) => {
        const input = alt.querySelector('input[type="radio"]');
        const letter = input?.getAttribute('value') || '';
        const textNode = alt.textContent?.trim() || '';
        const cleanText = textNode.replace(/^[A-E]\s*/, '').trim();
        if (letter && ['A', 'B', 'C', 'D', 'E'].includes(letter)) {
          alternatives[letter] = cleanText;
        }
      });

      const breadcrumbLinks = container.querySelectorAll('.q-question-breadcrumb a.q-link');
      const disciplineName = breadcrumbLinks[0]?.textContent?.trim() || '';
      const discipline = {
        id: 0,
        name: disciplineName
      };

      const subjects: Array<{ id: number; name: string }> = [];
      breadcrumbLinks.forEach((link, index) => {
        if (index > 0) {
          subjects.push({
            id: 0,
            name: link.textContent?.trim().replace(/,\s*$/, '') || ''
          });
        }
      });

      const bancaLink = container.querySelector('.q-question-info a[href*="/bancas/"]');
      const examining_board = {
        id: 0,
        name: bancaLink?.textContent?.trim() || '',
        acronym: ''
      };

      const orgaoLink = container.querySelector('.q-question-info a[href*="/institutos/"]');
      const institute = {
        id: 0,
        name: orgaoLink?.textContent?.trim() || '',
        acronym: ''
      };

      const provaLink = container.querySelector('.q-exams a');
      const exams: Array<{ id: number; name: string }> = [];
      if (provaLink) {
        exams.push({
          id: 0,
          name: provaLink.textContent?.trim() || ''
        });
      }

      const infoSpans = container.querySelectorAll('.q-question-info span');
      let year = '';
      infoSpans.forEach((span) => {
        const text = span.textContent || '';
        if (text.includes('Ano:')) {
          year = text.replace('Ano:', '').trim();
        }
      });

      const administrative_level = {
        id: 0,
        name: ''
      };

      const nullified = false;
      const outdated = false;
      const associated_text = null;

      questions.push({
        id,
        statement,
        alternatives,
        discipline,
        subjects,
        examining_board,
        institute,
        exams,
        administrative_level,
        nullified,
        outdated,
        associated_text,
        year
      });
    });

    return questions;
  });
}

async function extractMeta(page: Page): Promise<ScrapeResult['meta']> {
  return await page.evaluate(() => {
    const paginationLinks = document.querySelectorAll('.q-pagination a.btn');
    let currentPage = 1;
    let totalPages = 1;

    paginationLinks.forEach((link) => {
      if (link.classList.contains('q-current')) {
        currentPage = parseInt(link.textContent?.trim() || '1');
      }

      const pageNum = parseInt(link.textContent?.trim() || '0');
      if (pageNum > totalPages && !isNaN(pageNum)) {
        totalPages = pageNum;
      }
    });

    const questionsOnPage = document.querySelectorAll('.q-question-item').length;

    return {
      total_count: 0,
      total_pages: totalPages,
      current_page: currentPage,
      per_page: questionsOnPage || 20
    };
  });
}

export async function scrapeQuestoes(filters: FilterParams = {}): Promise<ScrapeResult> {
  const context = await getLoggedContext();
  const page = await context.newPage();

  try {
    const url = buildUrl(filters);
    console.log('Acessando:', url);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.q-question-belt[data-question-id]', { timeout: 15000 });
    console.log('Questões carregadas');

    const questions = await extractQuestions(page);
    const meta = await extractMeta(page);

    console.log(`Extraídas ${questions.length} questões`);
    return { questions, meta };
  } catch (error: any) {
    console.error('Erro no scraping:', error.message);
    await page.screenshot({ path: 'debug-error-screenshot.png', fullPage: true });
    const html = await page.content();
    const fs = await import('fs');
    fs.writeFileSync('debug-error-page.html', html);
    console.log('Debug files salvos');

    throw new Error(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await page.close();
  }
}

export async function scrapeProvaById(id: string): Promise<ScrapeResult> {
  const context = await getLoggedContext();
  const page = await context.newPage();

  try {
    const url = `https://www.qconcursos.com/questoes-de-concursos/provas/${id}`;
    console.log('Acessando prova:', url);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.q-question-belt[data-question-id]', { timeout: 15000 });

    const questions = await extractQuestions(page);
    const meta = await extractMeta(page);

    console.log(`Extraídas ${questions.length} questões da prova ${id}`);
    return { questions, meta };
  } catch (error: any) {
    console.error('Erro no scraping da prova:', error.message);
    throw new Error(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await page.close();
  }
}

export async function listarProvas(filters: FilterParams = {}): Promise<any> {
  const context = await getLoggedContext();
  const page = await context.newPage();

  try {
    const baseUrl = 'https://www.qconcursos.com/questoes-de-concursos/provas';
    const params = new URLSearchParams();

    if (filters.banca) params.append('banca', filters.banca);
    if (filters.orgao) params.append('orgao', filters.orgao);
    if (filters.ano) params.append('ano', filters.ano.toString());
    if (filters.page) params.append('page', filters.page.toString());

    const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
    console.log('Acessando lista de provas:', url);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // CORREÇÃO: Usar seletor correto .q-exam-item ao invés de [data-prova-id]
    console.log('Aguardando elementos de prova (.q-exam-item)...');
    await page.waitForSelector('.q-exam-item', { timeout: 15000 });
    console.log('✅ Elementos de prova carregados!');

    // Debug: salvar HTML e screenshot
    await page.screenshot({ path: 'debug_provas.png', fullPage: true });
    const html = await page.content();
    const fs = await import('fs');
    fs.writeFileSync('debug_provas.html', html);
    console.log('Debug files salvos: debug_provas.png e debug_provas.html');

    const provas = await page.evaluate(() => {
      const provaElements = document.querySelectorAll('.q-exam-item');
      const results: any[] = [];

      provaElements.forEach((el) => {
        const titleElement = el.querySelector('.q-title');
        const linkElement = el.querySelector('a[href*="/provas/"]');
        const dateElement = el.querySelector('.q-date');
        const levelElement = el.querySelector('.q-level');

        const title = titleElement?.textContent?.trim() || '';
        const href = linkElement?.getAttribute('href') || '';
        const date = dateElement?.textContent?.replace('Aplicada em ', '').trim() || '';
        const level = levelElement?.textContent?.trim() || '';

        // Extrair banca, ano, órgão do título
        // Formato: "BANCA - ANO - ÓRGÃO - CARGO"
        const parts = title.split(' - ');
        const ano = parseInt(parts[1]) || new Date().getFullYear();

        results.push({
          id: href.split('/').pop() || '',
          titulo: title,
          banca: parts[0] || '',
          ano: ano,
          orgao: parts[2] || '',
          cargo: parts[3] || '',
          link: `https://www.qconcursos.com${href}`,
          dataAplicacao: date,
          nivel: level
        });
      });

      return results;
    });

    console.log(`✅ Encontradas ${provas.length} provas`);
    return { provas };
  } catch (error: any) {
    console.error('❌ Erro ao listar provas:', error.message);

    // Debug em caso de erro
    try {
      await page.screenshot({ path: 'debug-provas-error.png', fullPage: true });
      const html = await page.content();
      const fs = await import('fs');
      fs.writeFileSync('debug-provas-error.html', html);
      console.log('Debug error files salvos');
    } catch (debugError) {
      console.error('Erro ao salvar debug files:', debugError);
    }

    throw new Error(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await page.close();
  }
}
