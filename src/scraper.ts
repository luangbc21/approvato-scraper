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

/**
 * Mapeamento de áreas para filtros do QConcursos
 */
const AREA_FILTERS: Record<string, string[]> = {
  'fiscal': [
    'SEFAZ',
    'Secretaria da Fazenda',
    'Receita Federal',
    'ISS',
    'ICMS',
    'Tributos',
    'Auditoria Fiscal'
  ],
  'tribunais': [
    'Tribunal de Justiça',
    'Tribunal Regional Federal',
    'Tribunal Regional do Trabalho',
    'Tribunal de Contas',
    'Ministério Público',
    'TJ',
    'TRF',
    'TRT'
  ],
  'policial': [
    'Polícia Federal',
    'Polícia Rodoviária Federal',
    'Polícia Civil',
    'Polícia Militar',
    'Perito Criminal',
    'PRF',
    'PF'
  ],
  'bancaria': [
    'Banco do Brasil',
    'Caixa Econômica Federal',
    'Bancos Estaduais',
    'BNB',
    'BASA',
    'Caixa'
  ],
  'controle': [
    'Tribunal de Contas da União',
    'Tribunal de Contas',
    'Controladoria',
    'Auditoria',
    'TCU',
    'TCE'
  ]
};

/**
 * Aplica filtros clicando nos elementos da página
 */
async function applyFilters(page: Page, filters: FilterParams): Promise<void> {
  console.log('📋 Aplicando filtros usando busca rápida...');

  // 1. Abrir formulário de filtros (se estiver fechado)
  console.log('🔓 Abrindo formulário de filtros...');
  try {
    const filterToggleBtn = page.locator('#filter-form-toggle-btn, .js-filter-form-toggle-btn');
    if (await filterToggleBtn.isVisible({ timeout: 2000 })) {
      await filterToggleBtn.click();
      await page.waitForTimeout(1000);
      console.log('  ✓ Formulário aberto');
    }
  } catch (e) {
    console.log('  ⚠ Toggle não encontrado, formulário já deve estar aberto');
  }

  await page.waitForSelector('#js-questions-filter-form', { timeout: 10000 });
  await page.waitForTimeout(2000);

  // Função auxiliar para selecionar filtro usando busca rápida
  async function selectFilter(filterLabel: string, value: string): Promise<boolean> {
    try {
      console.log(`  🔍 Selecionando ${filterLabel}: ${value}`);

      // 1. Clicar no dropdown que contém o label
      const dropdownToggle = page.locator(`button.dropdown-toggle:has-text("${filterLabel}")`).first();
      if (await dropdownToggle.isVisible({ timeout: 2000 })) {
        await dropdownToggle.click();
        await page.waitForTimeout(500);
      } else {
        console.log(`    ⚠ Dropdown "${filterLabel}" não encontrado`);
        return false;
      }

      // 2. Digitar no campo de busca rápida
      const searchInput = page.locator('.dropdown-menu.open input[type="text"], .dropdown-menu.show input[type="text"]').first();
      if (await searchInput.isVisible({ timeout: 1000 })) {
        await searchInput.fill(value);
        await page.waitForTimeout(800);
        console.log(`    ✓ Digitado "${value}" na busca`);
      }

      // 3. Clicar no primeiro checkbox/opção que aparece
      const firstOption = page.locator('.dropdown-menu.open li, .dropdown-menu.show li').first();
      if (await firstOption.isVisible({ timeout: 1000 })) {
        await firstOption.click();
        await page.waitForTimeout(500);
        console.log(`    ✓ ${filterLabel} "${value}" selecionado`);
        return true;
      }

      console.log(`    ⚠ Nenhuma opção encontrada para "${value}"`);
      return false;
    } catch (e) {
      console.log(`    ⚠ Erro ao selecionar ${filterLabel}: ${e}`);
      return false;
    }
  }

  // Aplicar filtros se fornecidos
  if (filters.ano) {
    console.log(`📅 Filtrando por ano: ${filters.ano}`);
    await selectFilter('Ano', filters.ano.toString());
  }

  if (filters.banca) {
    console.log(`🏢 Filtrando por banca: ${filters.banca}`);
    await selectFilter('Banca', filters.banca);
  }

  if (filters.uf) {
    console.log(`🗺️ Filtrando por UF: ${filters.uf}`);
    await selectFilter('UF', filters.uf);
  }

  // Clicar no botão Filtrar
  console.log('🔍 Clicando no botão Filtrar...');
  try {
    const filterButton = page.locator('button[type="submit"]:has-text("Filtrar")').first();

    if (await filterButton.isVisible({ timeout: 3000 })) {
      await filterButton.click();
      console.log('  ✓ Botão Filtrar clicado');

      // Aguardar navegação/reload
      await page.waitForLoadState('load', { timeout: 20000 });
      await page.waitForTimeout(2000);
      console.log('  ✓ Página recarregada');
    } else {
      console.log('  ⚠ Botão não visível, tentando submit direto');
      await page.locator('#js-questions-filter-form').evaluate((form: any) => form.submit());
      await page.waitForLoadState('load', { timeout: 20000 });
    }
  } catch (e) {
    console.log(`  ⚠ Erro ao submeter: ${e}`);
  }

  console.log('✅ Filtros aplicados!');
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
    console.log('🌐 Acessando página de questões...');
    let baseUrl = 'https://www.qconcursos.com/questoes-de-concursos/questoes';
    // Adicionar paginacao se fornecida

    if (filters.page && filters.page > 1) {
      baseUrl += "?page=" + filters.page;
      console.log("📄 Acessando pagina " + filters.page);
    }

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ Página carregada');

    // Aplicar filtros interativamente
    await applyFilters(page, filters);

    // Aguardar questões carregarem
    await page.waitForSelector('.q-question-belt[data-question-id]', { timeout: 15000 });
    console.log('✅ Questões carregadas');

    const questions = await extractQuestions(page);
    const meta = await extractMeta(page);

    console.log(`📊 Extraídas ${questions.length} questões`);
    return { questions, meta };

  } catch (error: any) {
    console.error('❌ Erro no scraping:', error.message);
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

/**
 * FUNÇÃO CORRIGIDA: Lista provas com extração de links de download
 */
export async function listarProvas(filters: FilterParams = {}): Promise<any> {
  const context = await getLoggedContext();
  const page = await context.newPage();

  try {
    const baseUrl = 'https://www.qconcursos.com/questoes-de-concursos/provas';
    console.log('Acessando lista de provas:', baseUrl);

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Aplicar filtros interativamente
    await applyFilters(page, filters);

    // Aguardar elementos de prova carregarem
    console.log('Aguardando elementos de prova (.q-exam-item)...');
    await page.waitForSelector('.q-exam-item', { timeout: 15000 });
    console.log('✅ Elementos de prova carregados!');

    const provas = await page.evaluate(() => {
      const provaElements = document.querySelectorAll('.q-exam-item');
      const results: any[] = [];

      provaElements.forEach((el) => {
        // ✅ CORREÇÃO 1: Extrair do container correto
        const containerEl = el.querySelector('.q-exam-item-container');
        if (!containerEl) return;

        // ✅ CORREÇÃO 2: Extrair título e link corretamente
        const titleElement = containerEl.querySelector('.q-title');
        const linkElement = containerEl.querySelector('a[href*="/provas/"]');
        const dateElement = containerEl.querySelector('.q-date');
        const levelElement = containerEl.querySelector('.q-level');

        const title = titleElement?.textContent?.trim() || '';
        const href = linkElement?.getAttribute('href') || '';
        const date = dateElement?.textContent?.replace('Aplicada em ', '').trim() || '';
        const level = levelElement?.textContent?.trim() || '';

        // ✅ CORREÇÃO 3: Extrair ID correto do dropdown de download
        let examId = '';
        const downloadButton = el.querySelector('button[id^="download-"]');
        if (downloadButton) {
          const buttonId = downloadButton.getAttribute('id') || '';
          examId = buttonId.replace('download-', '');
        }

        // Fallback: extrair do href
        if (!examId) {
          examId = href.split('/').pop() || '';
        }

        // ✅ CORREÇÃO 4: Extrair banca, ano, órgão e cargo do título
        // Formato: "CESPE / CEBRASPE - 2024 - SEFAZ-AC - Auditor da Receita Estadual"
        const parts = title.split(' - ').map(p => p.trim());
        const banca = parts[0] || '';
        const ano = parts[1] ? parseInt(parts[1]) : new Date().getFullYear();
        const orgao = parts[2] || '';
        const cargo = parts.slice(3).join(' - ') || ''; // Resto é o cargo

        // ✅ CORREÇÃO 5: Extrair links de download do dropdown
        const downloads: any = {
          prova: '',
          gabarito: '',
          edital: ''
        };

        const dropdownMenu = el.querySelector('.dropdown-menu');
        if (dropdownMenu) {
          const links = dropdownMenu.querySelectorAll('a[href*="arquivos.qconcursos.com"]');

          links.forEach((link) => {
            const href = link.getAttribute('href') || '';
            const text = link.textContent?.trim().toLowerCase() || '';

            if (text.includes('baixar prova')) {
              downloads.prova = href;
            } else if (text.includes('baixar gabarito')) {
              downloads.gabarito = href;
            } else if (text.includes('baixar edital')) {
              downloads.edital = href;
            }
          });
        }

        results.push({
          id: examId,
          titulo: title,
          banca: banca,
          ano: ano,
          orgao: orgao,
          cargo: cargo,
          link: `https://www.qconcursos.com${href}`,
          dataAplicacao: date,
          nivel: level,
          downloads: downloads // ✅ NOVO: Links de download
        });
      });

      return results;
    });

    console.log(`✅ Encontradas ${provas.length} provas`);
    return { provas };

  } catch (error: any) {
    console.error('❌ Erro ao listar provas:', error.message);

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
