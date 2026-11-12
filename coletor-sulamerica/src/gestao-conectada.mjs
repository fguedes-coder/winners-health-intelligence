// SulAmérica Gestão Conectada (Salesforce Experience Cloud) — mapeado em
// 12/11/2026 com o Fernando logado, só leitura:
//
//   1. /gestaoconectada/s/login/ ......... E-mail + Senha → "Log in" (sem reCAPTCHA)
//   2. /gestaoconectada/s/report/<id> ...... relatórios prontos da "Pasta Médico";
//      a tabela fica num iframe da mesma origem e cada linha tem link para a
//      manifestação (/s/case/500…)
//   3. /gestaoconectada/s/case/<id> ........ ficha: aba "Detalhes" (rótulo →
//      valor) e aba "Relacionado" (procedimentos, medicamentos, manifestações
//      relacionadas)
//
// O portal não exporta nem envia relatórios por e-mail e só mostra janelas de
// 7/30/60 dias: o histórico existe porque o robô guarda o que vê. Por isso,
// além dos relatórios, o robô revisita as internações ainda sem alta que já
// conhece — é assim que a alta aparece depois que a internação sai da janela.
//
// O robô NÃO clica em nada que altere o portal: só navega e lê. Dado de saúde
// sensível (LGPD art. 11): vai direto para o banco do Health, nunca para log.

import { chromium } from 'playwright'
import { config } from './config.mjs'

/** O portal pediu verificação de identidade (código) — precisa do usuário. */
export class VerificacaoIdentidade extends Error {}

const ID_CASO = /\/(500[A-Za-z0-9]{12,15})(?:[/?#]|$)/

/**
 * @param {{ credenciais: { login: string, senha: string },
 *           log: (m: string) => void,
 *           revisitar?: string[] }} opts
 *   revisitar — IDs de manifestações já conhecidas a reler mesmo fora dos
 *   relatórios (internações sem alta).
 * @returns {Promise<{ manifestacoes: Manifestacao[], relatorios: number }>}
 */
export async function coletarGestaoConectada({ credenciais, log, revisitar = [] }) {
  const base = config.gestaoConectada.url
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)

  try {
    await entrar(page, base, credenciais, log)

    const ids = new Set(revisitar)
    let relatorios = 0
    for (const r of config.gestaoConectada.relatorios) {
      try {
        const achados = await idsDoRelatorio(page, base, r.id)
        achados.forEach((id) => ids.add(id))
        relatorios++
        log(`relatório "${r.nome}": ${achados.length} manifestação(ões)`)
      } catch (e) {
        // Um relatório fora do ar não derruba os outros.
        log(`relatório "${r.nome}" não lido: ${String(e?.message ?? e).slice(0, 160)}`)
      }
    }
    if (relatorios === 0) throw new Error('Nenhum relatório do Gestão Conectada pôde ser lido.')

    const manifestacoes = []
    for (const id of ids) {
      try {
        manifestacoes.push(await lerManifestacao(page, base, id))
      } catch (e) {
        log(`manifestação ${id} não lida: ${String(e?.message ?? e).slice(0, 160)}`)
      }
    }
    return { manifestacoes, relatorios }
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

async function entrar(page, base, { login, senha }, log) {
  log('abrindo o Gestão Conectada')
  await page.goto(`${base}/s/login/`, { waitUntil: 'domcontentloaded' })
  const senhaInput = page.locator('input[type="password"]').first()
  await senhaInput.waitFor({ state: 'visible', timeout: 60_000 })
  await page.locator('input.inputBox[type="text"], input[type="email"]').first().fill(login)
  await senhaInput.fill(senha)
  await page.locator('button.loginButton, button:has-text("Log in"), button:has-text("Entrar")').first().click()

  // Sai da tela de login: área logada, verificação de identidade ou erro.
  const fim = Date.now() + 60_000
  while (Date.now() < fim) {
    await page.waitForTimeout(1_500)
    const url = page.url()
    const texto = await page.locator('body').innerText().catch(() => '')
    if (/verif(y|ica)|identity/i.test(url) || /verifi\w+ (sua )?identidade|c[oó]digo de verifica|verify your identity/i.test(texto)) {
      throw new VerificacaoIdentidade(
        'O Gestão Conectada pediu verificação de identidade (código). Entre uma vez pelo navegador e tente de novo.',
      )
    }
    if (!/\/login/i.test(url) && /RELAT[ÓO]RIOS/i.test(texto)) {
      log('login no Gestão Conectada concluído')
      return
    }
    if (/\/login/i.test(url) && /(senha|password).{0,40}(incorret|inv[aá]lid)|incorrect|n[aã]o (foi poss[ií]vel|conseguimos) (fazer|efetuar) (o )?login|check your username/i.test(texto)) {
      throw new Error('Login no Gestão Conectada não aceito (confira login e senha em Configurações → Robôs).')
    }
  }
  throw new Error('O Gestão Conectada não abriu a área logada em 60 s.')
}

/** IDs das manifestações listadas num relatório (tabela dentro de iframe). */
async function idsDoRelatorio(page, base, reportId) {
  await page.goto(`${base}/s/report/${reportId}`, { waitUntil: 'domcontentloaded' })
  const fim = Date.now() + 90_000
  while (Date.now() < fim) {
    await page.waitForTimeout(2_000)
    for (const frame of page.frames()) {
      const r = await frame
        .evaluate(() => {
          const corpo = document.body?.innerText ?? ''
          const total = /Total de registros\s*\n?\s*(\d[\d.]*)/.exec(corpo)?.[1]
          const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
          return { total: total ? Number(total.replace(/\./g, '')) : null, hrefs }
        })
        .catch(() => null)
      if (!r || r.total == null) continue
      const ids = [...new Set(r.hrefs.map((h) => ID_CASO.exec(h ?? '')?.[1]).filter(Boolean))]
      if (r.total === 0 || ids.length > 0) return ids
    }
  }
  throw new Error('a tabela do relatório não carregou')
}

/**
 * @typedef {{ caseId: string, campos: Record<string, string>,
 *             procedimentos: Record<string, string>[],
 *             medicamentos: Record<string, string>[],
 *             relacionadas: Record<string, string>[],
 *             listasIncompletas: string[] }} Manifestacao
 */

/** Ficha da manifestação: rótulo → valor da aba Detalhes + listas da aba Relacionado. */
async function lerManifestacao(page, base, caseId) {
  await page.goto(`${base}/s/case/${caseId}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.test-id__field-label').first().waitFor({ state: 'attached', timeout: 60_000 })
  await page.waitForTimeout(1_500)

  const campos = await page.evaluate(() => {
    const deep = (root, acc) => {
      root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deep(e.shadowRoot, acc) })
      acc.push(root)
      return acc
    }
    const out = {}
    for (const r of deep(document, [])) {
      for (const l of r.querySelectorAll('.test-id__field-label')) {
        let c = l
        for (let i = 0; i < 6 && c; i++) {
          c = c.parentElement
          if (c && c.querySelector('.test-id__field-value')) break
        }
        const rotulo = l.textContent.trim()
        const valor = (c?.querySelector('.test-id__field-value')?.innerText ?? '')
          .split('\n')
          .map((s) => s.trim())
          // "Visualização" é o texto do pop-over de links, não valor.
          .filter((s) => s && s !== 'Visualização')
          .join('\n')
        if (rotulo && !(rotulo in out)) out[rotulo] = valor
      }
    }
    return out
  })

  // Aba "Relacionado": procedimentos, medicamentos e manifestações ligadas.
  let listas = { procedimentos: [], medicamentos: [], relacionadas: [], listasIncompletas: [] }
  const aba = page.getByRole('tab', { name: 'Relacionado' }).first()
  if (await aba.count()) {
    await aba.click()
    await page.waitForTimeout(3_000)
    listas = await page.evaluate(() => {
      const deep = (root, acc) => {
        root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deep(e.shadowRoot, acc) })
        acc.push(root)
        return acc
      }
      const res = { procedimentos: [], medicamentos: [], relacionadas: [], listasIncompletas: [] }
      for (const r of deep(document, [])) {
        for (const t of r.querySelectorAll('table')) {
          // Título do cartão: sobe até achar um cabeçalho (atravessando shadow DOM).
          let n = t
          let titulo = ''
          for (let i = 0; i < 15 && n && !titulo; i++) {
            n = n.parentElement || n.getRootNode()?.host
            const h = n?.querySelector?.('h2, .slds-card__header-title')
            if (h) titulo = h.innerText.trim()
          }
          const chave = /Procedimento/i.test(titulo)
            ? 'procedimentos'
            : /Medicamento/i.test(titulo)
              ? 'medicamentos'
              : /Manifesta/i.test(titulo)
                ? 'relacionadas'
                : null
          if (!chave) continue
          if (/\(\d+\+\)/.test(titulo)) res.listasIncompletas.push(chave)
          const cab = [...t.querySelectorAll('thead th')].map((x) => x.innerText.trim())
          for (const tr of t.querySelectorAll('tbody tr')) {
            const cel = [...tr.querySelectorAll('th, td')].map((x) => x.innerText.trim())
            const linha = {}
            cab.forEach((h, i) => { if (h && h !== 'Ação' && cel[i]) linha[h] = cel[i] })
            if (Object.keys(linha).length) res[chave].push(linha)
          }
        }
      }
      return res
    })
  }

  return { caseId, campos, ...listas }
}
