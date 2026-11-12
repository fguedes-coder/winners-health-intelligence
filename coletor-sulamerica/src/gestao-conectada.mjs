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
//   4. (Fase 3) /s/detail/<conta 001…> ..... pessoa → "Códigos de Identificação"
//      (carteirinhas, /s/beneficiario/a22…) → ficha da carteirinha (plano,
//      código da empresa, vigente) + "Manifestações" (todas, de qualquer data;
//      "Exibir tudo" em /s/beneficiario/related/<a22…>/Manifestacoes__r)
//
// O portal não exporta nem envia relatórios por e-mail e os relatórios só
// mostram janelas de 7/30/60 dias. Por isso: (a) a cada 6 h o robô lê os
// relatórios e revisita as internações sem alta; (b) uma vez por semana,
// de madrugada, varre a ficha de cada carteirinha — é de lá que vem o
// histórico antigo.
//
// O robô NÃO clica em nada que altere o portal: só navega e lê. Dado de saúde
// sensível (LGPD art. 11): vai direto para o banco do Health, nunca para log.

import { chromium } from 'playwright'
import { config } from './config.mjs'

/** O portal pediu verificação de identidade (código) — precisa do usuário. */
export class VerificacaoIdentidade extends Error {}

const HOST = new URL(config.gestaoConectada.url).origin
const ID_CASO = /\/(500[A-Za-z0-9]{12,15})(?:[/?#]|$)/
const ID_CONTA = /\/(001[A-Za-z0-9]{12,15})(?:[/?#]|$)/
const ID_BENEF = /\/s\/beneficiario\/(a22[A-Za-z0-9]{12,15})/

const curto = (e) => String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 160)

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

async function abrirSessao(credenciais, log) {
  const base = config.gestaoConectada.url
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1400, height: 1000 },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)
  const fechar = async () => {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
  try {
    await entrar(page, base, credenciais, log)
  } catch (e) {
    await fechar()
    throw e
  }
  /** Navega; se a sessão caiu (voltou ao login), entra de novo e repete. */
  const ir = async (url) => {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    if (/\/login/i.test(page.url())) {
      log('sessão expirou — entrando de novo')
      await entrar(page, base, credenciais, log)
      await page.goto(url, { waitUntil: 'domcontentloaded' })
    }
  }
  return { page, base, ir, fechar }
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

// ---------------------------------------------------------------------------
// Atualização a cada 6 h: relatórios + internações sem alta
// ---------------------------------------------------------------------------

/**
 * @param {{ credenciais: { login: string, senha: string },
 *           log: (m: string) => void,
 *           revisitar?: string[],
 *           pular?: Set<string> }} opts
 *   revisitar — IDs de manifestações já conhecidas a reler mesmo fora dos
 *   relatórios (internações sem alta).
 *   pular — IDs já gravados e encerrados, lidos há pouco: não relê a ficha,
 *   só devolve em `origens` os relatórios em que apareceram.
 * @returns {Promise<{ manifestacoes: Manifestacao[], origens: {caseId: string, relatorios: string[]}[], relatorios: number }>}
 */
export async function coletarGestaoConectada({ credenciais, log, revisitar = [], pular = new Set() }) {
  const s = await abrirSessao(credenciais, log)
  try {
    // ID da manifestação → relatórios em que apareceu (ex.: os de saúde mental).
    /** @type {Map<string, Set<string>>} */
    const ids = new Map(revisitar.map((id) => [id, new Set()]))
    let relatorios = 0
    for (const r of config.gestaoConectada.relatorios) {
      try {
        const achados = await idsDoRelatorio(s, r.id)
        for (const id of achados) {
          if (!ids.has(id)) ids.set(id, new Set())
          ids.get(id).add(r.nome)
        }
        relatorios++
        log(`relatório "${r.nome}": ${achados.length} manifestação(ões)`)
      } catch (e) {
        // Um relatório fora do ar não derruba os outros.
        log(`relatório "${r.nome}" não lido: ${curto(e)}`)
      }
    }
    if (relatorios === 0) throw new Error('Nenhum relatório do Gestão Conectada pôde ser lido.')

    const manifestacoes = []
    const origens = []
    const relidas = new Set(revisitar)
    for (const [id, de] of ids) {
      if (pular.has(id) && !relidas.has(id)) {
        origens.push({ caseId: id, relatorios: [...de] })
        continue
      }
      try {
        manifestacoes.push({ ...(await lerManifestacao(s, id)), relatorios: [...de] })
      } catch (e) {
        log(`manifestação ${id.slice(0, 6)}… não lida: ${curto(e)}`)
      }
    }
    log(`fichas lidas: ${manifestacoes.length}; já atualizadas (puladas): ${origens.length}`)
    return { manifestacoes, origens, relatorios }
  } finally {
    await s.fechar()
  }
}

/** Frame do relatório (iframe da mesma origem) já com a tabela carregada. */
async function frameDoRelatorio(s, reportId) {
  await s.ir(`${s.base}/s/report/${reportId}`)
  const fim = Date.now() + 90_000
  while (Date.now() < fim) {
    await s.page.waitForTimeout(2_000)
    for (const frame of s.page.frames()) {
      const ok = await frame
        .evaluate(() => /Total de registros/.test(document.body?.innerText ?? ''))
        .catch(() => false)
      if (ok) return frame
    }
  }
  throw new Error('a tabela do relatório não carregou')
}

/** IDs das manifestações listadas num relatório (tabela dentro de iframe). */
async function idsDoRelatorio(s, reportId) {
  const fim = Date.now() + 90_000
  const frame = await frameDoRelatorio(s, reportId)
  while (Date.now() < fim) {
    const r = await frame
      .evaluate(() => {
        const corpo = document.body?.innerText ?? ''
        const total = /Total de registros\s*\n?\s*(\d[\d.]*)/.exec(corpo)?.[1]
        const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
        return { total: total ? Number(total.replace(/\./g, '')) : null, hrefs }
      })
      .catch(() => null)
    if (r && r.total != null) {
      const ids = [...new Set(r.hrefs.map((h) => ID_CASO.exec(h ?? '')?.[1]).filter(Boolean))]
      if (r.total === 0 || ids.length > 0) return ids
    }
    await s.page.waitForTimeout(2_000)
  }
  throw new Error('a tabela do relatório não carregou')
}

// ---------------------------------------------------------------------------
// Varredura semanal: contas → carteirinhas → todas as manifestações
// ---------------------------------------------------------------------------

/**
 * @param {{ credenciais: { login: string, senha: string },
 *           log: (m: string) => void,
 *           conferidas: Set<string>,      // carteirinhas (a22…) vistas há pouco: pula
 *           contasConferidas: Set<string>, // contas cujas carteirinhas todas foram vistas há pouco
 *           casosConhecidos: Set<string>, // manifestações já gravadas: não relê
 *           aoLerCarteirinha: (b: Carteirinha) => Promise<void>,
 *           aoLerManifestacoes: (m: Manifestacao[]) => Promise<void>,
 *           prazo: number }} opts        // Date.now() limite
 * @returns {Promise<{ contas: number, contasLidas: number, carteirinhas: number,
 *                     manifestacoesNovas: number, completa: boolean }>}
 */
export async function varrerBeneficiarios(opts) {
  const { credenciais, log, conferidas, contasConferidas, casosConhecidos, aoLerCarteirinha, aoLerManifestacoes, prazo } = opts
  const s = await abrirSessao(credenciais, log)
  const res = { contas: 0, contasLidas: 0, carteirinhas: 0, manifestacoesNovas: 0, completa: false }
  try {
    const contas = await contasDoRelatorio(s, config.gestaoConectada.varredura.relatorioContas)
    res.contas = contas.length
    log(`varredura: ${contas.length} conta(s) no relatório de beneficiários`)
    if (contas.length === 0) throw new Error('O relatório de beneficiários veio vazio.')

    let pendentes = []
    const despejar = async () => {
      if (!pendentes.length) return
      const lote = pendentes
      pendentes = []
      await aoLerManifestacoes(lote)
    }

    for (const conta of contas) {
      if (Date.now() > prazo) {
        log('varredura: prazo da noite atingido — continua na próxima')
        await despejar()
        return res
      }
      if (contasConferidas.has(conta)) continue
      try {
        const carteirinhas = await carteirinhasDaConta(s, conta)
        for (const b of carteirinhas) {
          if (conferidas.has(b.id)) continue
          const c = await lerCarteirinha(s, b.href, conta)
          const novos = c.manifestacoes.filter((id) => !casosConhecidos.has(id))
          for (const id of novos) {
            try {
              pendentes.push({ ...(await lerManifestacao(s, id)), relatorios: [] })
              casosConhecidos.add(id)
              res.manifestacoesNovas++
            } catch (e) {
              log(`manifestação ${id.slice(0, 6)}… não lida: ${curto(e)}`)
            }
          }
          // Grava as manifestações antes da carteirinha: se cair no meio, a
          // carteirinha não fica marcada como conferida sem o histórico.
          await despejar()
          await aoLerCarteirinha(c)
          conferidas.add(b.id)
          res.carteirinhas++
        }
        res.contasLidas++
      } catch (e) {
        log(`conta ${conta.slice(0, 6)}… não lida: ${curto(e)}`)
      }
      if (res.contasLidas % 20 === 0 && res.contasLidas > 0) {
        log(`varredura: ${res.contasLidas}/${contas.length} contas, ${res.carteirinhas} carteirinha(s), ${res.manifestacoesNovas} manifestação(ões) nova(s)`)
      }
    }
    await despejar()
    res.completa = true
    return res
  } finally {
    await s.fechar()
  }
}

/** Contas (pessoas) do relatório, com "Linhas de detalhes" ligado e rolagem em passos. */
async function contasDoRelatorio(s, reportId) {
  const frame = await frameDoRelatorio(s, reportId)
  const total = await frame.evaluate(() => {
    const t = /Total de registros\s*\n?\s*(\d[\d.]*)/.exec(document.body.innerText)?.[1]
    return t ? Number(t.replace(/\./g, '')) : null
  })
  // Liga "Linhas de detalhes" (só exibe; não altera o relatório salvo).
  await frame.evaluate(() => {
    for (const c of document.querySelectorAll('input[type=checkbox]')) {
      const l = c.closest('label')?.innerText || c.parentElement?.innerText || c.getAttribute('aria-label') || ''
      if (/linhas de detalhes|detail rows/i.test(l) && !c.checked) (c.closest('label') || c).click()
    }
  })
  await s.page.waitForTimeout(6_000)

  // A tabela é virtualizada (recicla as linhas): coleta enquanto rola em passos.
  const contas = new Set()
  let parado = 0
  for (let i = 0; i < 600 && parado < 12; i++) {
    const r = await frame.evaluate((passo) => {
      const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
      let rolou = false
      for (const el of document.querySelectorAll('*')) {
        if (el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
          const antes = el.scrollTop
          el.scrollTop = antes + passo
          if (el.scrollTop !== antes) rolou = true
        }
      }
      return { hrefs, rolou }
    }, 250)
    const antes = contas.size
    for (const h of r.hrefs) {
      const id = ID_CONTA.exec(h ?? '')?.[1]
      if (id) contas.add(id)
    }
    parado = contas.size > antes ? 0 : r.rolou ? parado + 0.5 : parado + 1
    if (total && contas.size >= total) break
    await s.page.waitForTimeout(400)
  }
  // Se não chegou ao total, segue com o que leu: a próxima varredura completa.
  return [...contas]
}

/** Todas as funções de leitura atravessam shadow DOM (componentes Lightning). */
const COLETAR_PAGINA = () => {
  const deep = (root, acc) => {
    root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deep(e.shadowRoot, acc) })
    acc.push(root)
    return acc
  }
  const roots = deep(document, [])
  const titulos = []
  const hrefs = []
  const campos = {}
  for (const r of roots) {
    r.querySelectorAll('h2, .slds-card__header-title').forEach((h) => titulos.push(h.innerText.trim().replace(/\s+/g, ' ')))
    r.querySelectorAll('a[href]').forEach((a) => hrefs.push(a.getAttribute('href')))
    for (const l of r.querySelectorAll('.test-id__field-label')) {
      let c = l
      for (let i = 0; i < 6 && c; i++) {
        c = c.parentElement
        if (c && c.querySelector('.test-id__field-value')) break
      }
      const rotulo = l.textContent.trim()
      const el = c?.querySelector('.test-id__field-value')
      let valor = (el?.innerText ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s && s !== 'Visualização')
        .join('\n')
      if (!valor && el) {
        // Caixa de seleção (ex.: "Vigente") não tem texto.
        const cb = el.querySelector('input[type=checkbox]')
        const img = el.querySelector('img[alt]')
        if (cb) valor = cb.checked ? 'Sim' : 'Não'
        else if (img) valor = /true|verdadeir|checked|marcad/i.test(img.alt) ? 'Sim' : /false|fals|unchecked|desmarc/i.test(img.alt) ? 'Não' : img.alt
      }
      if (rotulo && !(rotulo in campos)) campos[rotulo] = valor
    }
  }
  return { titulos: [...new Set(titulos)], hrefs, campos }
}

/** Carteirinhas (/s/beneficiario/a22…) de uma conta, inclusive as de "Exibir tudo". */
async function carteirinhasDaConta(s, conta) {
  await s.ir(`${s.base}/s/detail/${conta}`)
  await s.page.locator('.test-id__field-label').first().waitFor({ state: 'attached', timeout: 60_000 }).catch(() => {})
  await s.page.waitForTimeout(2_500)
  let p = await s.page.evaluate(COLETAR_PAGINA)
  const truncada = p.titulos.some((t) => /C[oó]digos de Identifica/i.test(t) && /\(\d+\+\)/.test(t))
  if (truncada) {
    const todos = p.hrefs.find((h) => /\/related\//.test(h ?? '') && /C[oó]dig|Identific|Benefici/i.test(h))
    if (todos) {
      await s.ir(todos.startsWith('http') ? todos : `${HOST}${todos}`)
      await rolarLista(s)
      const q = await s.page.evaluate(COLETAR_PAGINA)
      p = { ...p, hrefs: [...p.hrefs, ...q.hrefs] }
    }
  }
  const vistos = new Map()
  for (const h of p.hrefs) {
    const id = ID_BENEF.exec(h ?? '')?.[1]
    if (id && !vistos.has(id)) vistos.set(id, h.startsWith('http') ? h : `${HOST}${h}`)
  }
  return [...vistos].map(([id, href]) => ({ id, href }))
}

/** Rola listas "Exibir tudo" (carregam sob demanda) até parar de crescer. */
async function rolarLista(s) {
  await s.page.waitForTimeout(5_000)
  let antes = -1
  for (let i = 0; i < 40; i++) {
    const n = await s.page.evaluate(() => {
      const deep = (root, acc) => {
        root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deep(e.shadowRoot, acc) })
        acc.push(root)
        return acc
      }
      let links = 0
      for (const r of deep(document, [])) {
        links += r.querySelectorAll('a[href]').length
        r.querySelectorAll('*').forEach((el) => {
          if (el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop += 600
        })
      }
      window.scrollBy(0, 600)
      return links
    })
    if (n === antes && i > 3) return
    antes = n
    await s.page.waitForTimeout(1_200)
  }
}

/**
 * @typedef {{ id: string, conta: string, campos: Record<string, string>,
 *             manifestacoes: string[], totalManifestacoes: string | null }} Carteirinha
 */

/** Ficha da carteirinha: campos + IDs de todas as manifestações. */
async function lerCarteirinha(s, href, conta) {
  const id = ID_BENEF.exec(href)?.[1]
  await s.ir(href)
  await s.page.locator('.test-id__field-label').first().waitFor({ state: 'attached', timeout: 60_000 })
  await s.page.waitForTimeout(2_500)
  const p = await s.page.evaluate(COLETAR_PAGINA)
  const titulo = p.titulos.find((t) => /^Manifesta/i.test(t)) ?? ''
  const total = /\((\d+\+?)\)/.exec(titulo)?.[1] ?? null
  const ids = new Set(p.hrefs.map((h) => ID_CASO.exec(h ?? '')?.[1]).filter(Boolean))
  if (total?.endsWith('+')) {
    // Mais de 6: a lista completa fica em "Exibir tudo".
    await s.ir(`${s.base}/s/beneficiario/related/${id}/Manifestacoes__r`)
    await rolarLista(s)
    const q = await s.page.evaluate(COLETAR_PAGINA)
    for (const h of q.hrefs) {
      const c = ID_CASO.exec(h ?? '')?.[1]
      if (c) ids.add(c)
    }
  }
  return { id, conta, campos: p.campos, manifestacoes: [...ids], totalManifestacoes: total }
}

// ---------------------------------------------------------------------------
// Ficha da manifestação
// ---------------------------------------------------------------------------

/**
 * @typedef {{ caseId: string, campos: Record<string, string>,
 *             procedimentos: Record<string, string>[],
 *             medicamentos: Record<string, string>[],
 *             relacionadas: Record<string, string>[],
 *             listasIncompletas: string[] }} Manifestacao
 */

/** Ficha da manifestação: rótulo → valor da aba Detalhes + listas da aba Relacionado. */
async function lerManifestacao(s, caseId) {
  const { page } = s
  await s.ir(`${s.base}/s/case/${caseId}`)
  await page.locator('.test-id__field-label').first().waitFor({ state: 'attached', timeout: 60_000 })
  await page.waitForTimeout(1_500)

  const { campos } = await page.evaluate(COLETAR_PAGINA)

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
