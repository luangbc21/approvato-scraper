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

    // Aguardar formulário aparecer (não usar networkidle - causa timeout por requests infinitos)
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    console.log('Formulário de login carregado');

    // Debug: salvar HTML e screenshot da página de login
    const loginHtml = await page.content();
    const fs = await import('fs');
    fs.writeFileSync('debug-login-page.html', loginHtml);
    await page.screenshot({ path: 'debug-login-screenshot.png', fullPage: true });
    console.log('HTML e screenshot da página de login salvos');

    // Seletores corretos encontrados no HTML do QConcursos
    // Email: #login_email ou input[name="user[email]"]
    // Senha: #login_password ou input[name="user[password]"]
    // Botão: #btnLogin ou input[type="submit"][value="Entrar"]

    // Aguardar formulário estar pronto
    await page.waitForSelector('#login_form', { timeout: 10000 });
    console.log('Formulário #login_form encontrado');

    // Preencher email usando seletor correto
    await page.fill('#login_email', 'alma.proxycontrol@gmail.com');
    console.log('Email preenchido (#login_email)');

    // Preencher senha usando seletor correto
    await page.fill('#login_password', 'Lulu374@');
    console.log('Senha preenchida (#login_password)');

    // Clicar no botão de login usando seletor correto
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {
        console.log('Navegação não detectada, verificando login...');
      }),
      page.click('#btnLogin')
    ]);
    console.log('Botão de login clicado (#btnLogin)');

    // Aguardar um pouco para garantir que cookies foram salvos
    await page.waitForTimeout(3000);

    // Verificar se login foi bem-sucedido
    const loginSuccess = await page.evaluate(() => {
      // Verificar se não há mais botão "Entrar" ou se existe elemento de usuário logado
      const loginButton = document.querySelector('a[href*="/conta/entrar"]');
      return !loginButton;
    });

    if (loginSuccess) {
      console.log('✅ Login realizado com sucesso!');

      // Debug: salvar screenshot após login
      await page.screenshot({ path: 'debug-login-success.png', fullPage: true });
      console.log('Screenshot pós-login salvo em debug-login-success.png');
    } else {
      console.warn('⚠️ Login pode não ter sido bem-sucedido');
      await page.screenshot({ path: 'debug-login-failed.png', fullPage: true });
    }

    loggedContext = context;
    await page.close();
    return context;

  } catch (error: any) {
    console.error('Erro ao fazer login:', error.message);
    await page.screenshot({ path: 'debug-login-error.png', fullPage: true });
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

    // Cada questão está dentro de um container .q-question-item
    // O elemento .q-question-belt[data-question-id] contém metadados
    const questionContainers = document.querySelectorAll('.q-question-item');

    questionContainers.forEach((container) => {
      // Pegar o ID do elemento .q-question-belt dentro do container
      const beltEl = container.querySelector('.q-question-belt[data-question-id]');
      const id = beltEl?.getAttribute('data-question-id') || '';

      if (!id) return; // Skip se não tem ID

      // Enunciado está em .q-question-enunciation
      const statementEl = container.querySelector('.q-question-enunciation');
      const statement = statementEl?.textContent?.trim() || '';

      // Alternativas estão em .q-question-options input[type="radio"]
      const alternatives: any = { A: '', B: '', C: '', D: '', E: '' };
      container.querySelectorAll('.q-question-options .q-radio-button').forEach((alt) => {
        const input = alt.querySelector('input[type="radio"]');
        const letter = input?.getAttribute('value') || '';
        // O texto da alternativa está após o input, dentro do label
        const textNode = alt.textContent?.trim() || '';
        // Remover a letra inicial se existir (ex: "A Crime...")
        const cleanText = textNode.replace(/^[A-E]\s*/, '').trim();
        if (letter && ['A', 'B', 'C', 'D', 'E'].includes(letter)) {
          alternatives[letter] = cleanText;
        }
      });

      // Disciplina está em .q-question-breadcrumb primeiro link
      const breadcrumbLinks = container.querySelectorAll('.q-question-breadcrumb a.q-link');
      const disciplineName = breadcrumbLinks[0]?.textContent?.trim() || '';
      const discipline = {
        id: 0,
        name: disciplineName
      };

      // Assuntos são os links subsequentes no breadcrumb
      const subjects: Array<{ id: number; name: string }> = [];
      breadcrumbLinks.forEach((link, index) => {
        if (index > 0) { // Pular a disciplina (primeiro item)
          subjects.push({
            id: 0,
            name: link.textContent?.trim().replace(/,\s*$/, '') || ''
          });
        }
      });

      // Banca está em .q-question-info
      const bancaLink = container.querySelector('.q-question-info a[href*="/bancas/"]');
      const examining_board = {
        id: 0,
        name: bancaLink?.textContent?.trim() || '',
        acronym: ''
      };

      // Órgão está em .q-question-info
      const orgaoLink = container.querySelector('.q-question-info a[href*="/institutos/"]');
      const institute = {
        id: 0,
        name: orgaoLink?.textContent?.trim() || '',
        acronym: ''
      };

      // Prova
      const provaLink = container.querySelector('.q-exams a');
      const exams: Array<{ id: number; name: string }> = [];
      if (provaLink) {
        exams.push({
          id: 0,
          name: provaLink.textContent?.trim() || ''
        });
      }

      // Ano está no texto "Ano: 2025"
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
    // Buscar informações da paginação a partir dos links de página
    const paginationLinks = document.querySelectorAll('.q-pagination a.btn');
    let currentPage = 1;
    let totalPages = 1;

    paginationLinks.forEach((link) => {
      // Página atual tem a classe q-current
      if (link.classList.contains('q-current')) {
        currentPage = parseInt(link.textContent?.trim() || '1');
      }

      // Encontrar a última página numérica (ignorando "..." e setas)
      const pageNum = parseInt(link.textContent?.trim() || '0');
      if (pageNum > totalPages && !isNaN(pageNum)) {
        totalPages = pageNum;
      }
    });

    // Contar questões na página
    const questionsOnPage = document.querySelectorAll('.q-question-item').length;

    return {
      total_count: 0, // Não temos essa info facilmente disponível
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

    // Aguardar questões carregarem (HTML tradicional, não SPA)
    await page.waitForSelector('.q-question-belt[data-question-id]', { timeout: 15000 });
    console.log('Questões carregadas');

    // Extrair questões do HTML usando os seletores corretos
    const questions = await extractQuestions(page);
    const meta = await extractMeta(page);

    console.log(`Extraídas ${questions.length} questões`);
    return { questions, meta };
  } catch (error: any) {
    console.error('Erro no scraping:', error.message);

    // Debug em caso de erro
    await page.screenshot({ path: 'debug-error-screenshot.png', fullPage: true });
    const html = await page.content();
    const fs = await import('fs');
    fs.writeFileSync('debug-error-page.html', html);
    console.log('Debug files salvos: debug-error-screenshot.png e debug-error-page.html');

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

    // Aguardar questões carregarem (HTML tradicional)
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

    // Aguardar provas carregarem
    await page.waitForSelector('[data-prova-id]', { timeout: 15000 });

    const provas = await page.evaluate(() => {
      const provaElements = document.querySelectorAll('[data-prova-id]');
      const results: any[] = [];

      provaElements.forEach((el) => {
        results.push({
          id: el.getAttribute('data-prova-id'),
          name: el.querySelector('.prova-name')?.textContent?.trim() || '',
          year: el.getAttribute('data-year'),
          board: el.querySelector('.prova-board')?.textContent?.trim() || '',
          institute: el.querySelector('.prova-institute')?.textContent?.trim() || ''
        });
      });

      return results;
    });

    console.log(`Encontradas ${provas.length} provas`);
    return { provas };
  } catch (error: any) {
    console.error('Erro ao listar provas:', error.message);
    throw new Error(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await page.close();
  }
}
