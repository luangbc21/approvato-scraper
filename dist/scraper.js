"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeBrowser = closeBrowser;
exports.scrapeQuestoes = scrapeQuestoes;
exports.scrapeProvaById = scrapeProvaById;
exports.listarProvas = listarProvas;
const playwright_1 = require("playwright");
let browserInstance = null;
async function getBrowser() {
    if (!browserInstance) {
        browserInstance = await playwright_1.chromium.launch({
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
async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}
function buildUrl(filters) {
    const baseUrl = 'https://approvato.com.br/questoes';
    const params = new URLSearchParams();
    if (filters.banca)
        params.append('banca', filters.banca);
    if (filters.orgao)
        params.append('orgao', filters.orgao);
    if (filters.ano)
        params.append('ano', filters.ano.toString());
    if (filters.disciplina)
        params.append('disciplina', filters.disciplina);
    if (filters.page)
        params.append('page', filters.page.toString());
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}
async function extractQuestions(page) {
    return await page.evaluate(() => {
        const questions = [];
        const questionElements = document.querySelectorAll('[data-question-id]');
        questionElements.forEach((el) => {
            const id = el.getAttribute('data-question-id') || '';
            const statementEl = el.querySelector('.question-statement');
            const statement = statementEl?.textContent?.trim() || '';
            const alternatives = { A: '', B: '', C: '', D: '', E: '' };
            el.querySelectorAll('.alternative').forEach((alt) => {
                const letter = alt.getAttribute('data-letter');
                const text = alt.textContent?.trim() || '';
                if (letter)
                    alternatives[letter] = text;
            });
            const disciplineEl = el.querySelector('[data-discipline-id]');
            const discipline = {
                id: parseInt(disciplineEl?.getAttribute('data-discipline-id') || '0'),
                name: disciplineEl?.textContent?.trim() || ''
            };
            const subjects = [];
            el.querySelectorAll('[data-subject-id]').forEach((subj) => {
                subjects.push({
                    id: parseInt(subj.getAttribute('data-subject-id') || '0'),
                    name: subj.textContent?.trim() || ''
                });
            });
            const boardEl = el.querySelector('[data-board-id]');
            const examining_board = {
                id: parseInt(boardEl?.getAttribute('data-board-id') || '0'),
                name: boardEl?.textContent?.trim() || '',
                acronym: boardEl?.getAttribute('data-board-acronym') || ''
            };
            const instituteEl = el.querySelector('[data-institute-id]');
            const institute = {
                id: parseInt(instituteEl?.getAttribute('data-institute-id') || '0'),
                name: instituteEl?.textContent?.trim() || '',
                acronym: instituteEl?.getAttribute('data-institute-acronym') || ''
            };
            const exams = [];
            el.querySelectorAll('[data-exam-id]').forEach((exam) => {
                exams.push({
                    id: parseInt(exam.getAttribute('data-exam-id') || '0'),
                    name: exam.textContent?.trim() || ''
                });
            });
            const adminLevelEl = el.querySelector('[data-admin-level-id]');
            const administrative_level = {
                id: parseInt(adminLevelEl?.getAttribute('data-admin-level-id') || '0'),
                name: adminLevelEl?.textContent?.trim() || ''
            };
            const nullified = el.hasAttribute('data-nullified');
            const outdated = el.hasAttribute('data-outdated');
            const textEl = el.querySelector('.associated-text');
            const associated_text = textEl?.textContent?.trim() || null;
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
                associated_text
            });
        });
        return questions;
    });
}
async function extractMeta(page) {
    return await page.evaluate(() => {
        const metaEl = document.querySelector('[data-pagination-meta]');
        if (!metaEl) {
            return { total_count: 0, total_pages: 1, current_page: 1, per_page: 20 };
        }
        return {
            total_count: parseInt(metaEl.getAttribute('data-total-count') || '0'),
            total_pages: parseInt(metaEl.getAttribute('data-total-pages') || '1'),
            current_page: parseInt(metaEl.getAttribute('data-current-page') || '1'),
            per_page: parseInt(metaEl.getAttribute('data-per-page') || '20')
        };
    });
}
async function scrapeQuestoes(filters = {}) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        const url = buildUrl(filters);
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-question-id]', { timeout: 10000 });
        const questions = await extractQuestions(page);
        const meta = await extractMeta(page);
        return { questions, meta };
    }
    catch (error) {
        throw new Error(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    finally {
        await page.close();
    }
}
async function scrapeProvaById(id) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        const url = `https://approvato.com.br/prova/${id}`;
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-question-id]', { timeout: 10000 });
        const questions = await extractQuestions(page);
        const meta = await extractMeta(page);
        return { questions, meta };
    }
    catch (error) {
        throw new Error(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    finally {
        await page.close();
    }
}
async function listarProvas(filters = {}) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        const baseUrl = 'https://approvato.com.br/provas';
        const params = new URLSearchParams();
        if (filters.banca)
            params.append('banca', filters.banca);
        if (filters.orgao)
            params.append('orgao', filters.orgao);
        if (filters.ano)
            params.append('ano', filters.ano.toString());
        if (filters.page)
            params.append('page', filters.page.toString());
        const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-prova-id]', { timeout: 10000 });
        const provas = await page.evaluate(() => {
            const provaElements = document.querySelectorAll('[data-prova-id]');
            const results = [];
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
        return { provas };
    }
    catch (error) {
        throw new Error(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    finally {
        await page.close();
    }
}
