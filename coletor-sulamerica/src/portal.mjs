// Navegação no portal SulAmérica Integra (mapeada em 08/10/2026):
//
//   1. IntegraSASLogin.aspx ........ LOGIN + SENHA → ENTRAR
//   2. popup do token .............. "Código de acesso" (chega por e-mail) → Entrar
//   3. IntegraSASPainel.aspx ....... cartão "Central de Contas Pagas"
//   4. SASCentralMedica/Home.aspx .. link "ACESSO CONTAS PAGAS"
//   5. SASContasMedicas.aspx ....... linha "81938 … MM/AAAA Disponivel" → "Download Disponível"
//      ou, se o mês não estiver na lista: Nova Solicitação (apólice, início =
//      fim = mês, motivo) → SOLICITAR. A SulAmérica libera em até ~1 h.

import { chromium } from 'playwright'
import { config } from './config.mjs'
import { aguardarToken } from './token-email.mjs'

/** O mês ainda não está na lista e acabamos de pedi-lo ao portal. */
export class ArquivoSolicitado extends Error {}
/** O mês não está na lista e não há o que fazer além de esperar. */
export class ArquivoIndisponivel extends Error {}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/**
 * Entra no portal e baixa o TXT da competência.
 * @param {{ competencia: string, podeSolicitar: boolean, log: (m: string) => void,
 *           credenciais: import('./credenciais.mjs').Credenciais }} opts
 *   competencia — 'AAAA-MM'; podeSolicitar — se o mês não estiver na lista,
 *   faz a Nova Solicitação (false quando já pedimos e só estamos conferindo).
 * @returns {Promise<{ nome: string, conteudo: Buffer }>}
 */
export async function baixarContasPagas({ competencia, podeSolicitar, log, credenciais }) {
  const [ano, mes] = competencia.split('-')
  const rotulo = `${mes}/${ano}` // como aparece na lista: "09/2026"

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)

  try {
    // 1. Login
    log('abrindo o portal')
    await page.goto(config.portal.urlLogin, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('LOGIN').fill(credenciais.portal.login)
    await page.getByPlaceholder('SENHA').fill(credenciais.portal.senha)
    const cliqueEntrar = Date.now()
    await page.getByRole('button', { name: 'ENTRAR' }).click()

    // 2. Token — o popup pode estar na própria página ou num iframe.
    const campoToken = await localizarEmQualquerFrame(
      page,
      (f) => f.getByPlaceholder('Código de acesso'),
      90_000,
    )
    if (!campoToken) {
      const alerta = await textoDosAlertas(page)
      throw new Error(`Login não aceito pelo portal${alerta ? `: ${alerta}` : ''}.`)
    }
    log('aguardando o token no e-mail')
    const token = await aguardarToken({ desde: cliqueEntrar, email: credenciais.email })
    await campoToken.fill(token)
    await campoToken.press('Enter')

    // 3. Painel → Central de Contas Pagas
    await page.waitForURL(/IntegraSASPainel\.aspx/i, { timeout: 90_000 })
    log('login concluído')
    await page
      .getByText('Central de Contas Pagas', { exact: false })
      .filter({ visible: true })
      .first()
      .click()

    // 4. Central → Acesso Contas Pagas
    await page.waitForURL(/SASCentralMedica\/Home\.aspx/i)
    await page.locator('a[href*="SASContasMedicas.aspx"]').filter({ visible: true }).first().click()

    // 5. Lista de contas pagas
    await page.waitForURL(/SASContasMedicas\.aspx/i)
    await page.waitForLoadState('networkidle')

    let linha = await linhaDisponivel(page, rotulo)
    if (!linha) {
      // A lista pode estar desatualizada: o botão Atualizar recarrega.
      await page.getByRole('button', { name: 'Atualizar' }).click()
      await page.waitForLoadState('networkidle')
      linha = await linhaDisponivel(page, rotulo)
    }

    if (!linha) {
      if (!podeSolicitar) {
        throw new ArquivoIndisponivel(`Arquivo de ${rotulo} ainda não liberado pela SulAmérica.`)
      }
      await novaSolicitacao(page, Number(mes), ano, log)
      throw new ArquivoSolicitado(`Arquivo de ${rotulo} solicitado à SulAmérica.`)
    }

    log(`baixando ${rotulo}`)
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      linha.locator('a[title^="Download Dispon"]').click(),
    ])
    const caminho = await download.path()
    if (!caminho) throw new Error('O download não foi concluído.')
    const { readFile } = await import('node:fs/promises')
    const conteudo = await readFile(caminho)
    validarTxt(conteudo, rotulo)
    return { nome: download.suggestedFilename() || `${config.portal.apolice}.txt`, conteudo }
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

/** Linha da competência com status "Disponivel" e link de download. */
async function linhaDisponivel(page, rotulo) {
  const linha = page
    .locator('tr')
    .filter({ hasText: config.portal.apolice })
    .filter({ hasText: rotulo })
    .filter({ hasText: /Dispon[ií]vel/i })
    .filter({ has: page.locator('a[title^="Download Dispon"]') })
    .first()
  return (await linha.count()) > 0 ? linha : null
}

async function novaSolicitacao(page, mes, ano, log) {
  log(`fazendo Nova Solicitação de ${String(mes).padStart(2, '0')}/${ano}`)
  await page.getByRole('button', { name: 'Nova Solicitação' }).click()

  // Ordem dos combos no formulário: apólice, início (mês, ano), fim (mês,
  // ano), motivo. Os rótulos acessíveis se repetem ("Selecione o mês"),
  // então a posição é o que os distingue.
  const combos = page.locator('select').filter({ visible: true })
  await combos.filter({ has: page.locator(`option:text-is("${config.portal.apolice}")`) }).first()
    .selectOption({ label: config.portal.apolice })
  // A razão social é preenchida pelo portal depois de escolher a apólice.
  await page.waitForTimeout(2_000)

  const meses = combos.filter({ has: page.locator('option:text-is("Setembro")') })
  const anos = combos.filter({ has: page.locator(`option:text-is("${ano}")`) })
  await meses.nth(0).selectOption({ label: MESES[mes - 1] })
  await anos.nth(0).selectOption({ label: String(ano) })
  await meses.nth(1).selectOption({ label: MESES[mes - 1] })
  await anos.nth(1).selectOption({ label: String(ano) })
  await combos.filter({ has: page.locator('option:text-is("Consulta fora do prazo de vigência")') })
    .first()
    .selectOption({ index: 1 })

  await page.getByRole('button', { name: 'SOLICITAR' }).click()
  await page.getByText('Solicitação enviada com sucesso', { exact: false }).waitFor({ timeout: 30_000 })
}

/** Garante que o arquivo é o TXT de contas pagas, não uma página de erro. */
function validarTxt(conteudo, rotulo) {
  if (conteudo.length < 1024) {
    throw new Error(`Arquivo de ${rotulo} veio vazio ou incompleto (${conteudo.length} bytes).`)
  }
  const inicio = conteudo.subarray(0, 512).toString('latin1').toLowerCase()
  if (inicio.includes('<html') || inicio.includes('<!doctype')) {
    throw new Error(`O portal devolveu uma página em vez do arquivo de ${rotulo}.`)
  }
}

async function localizarEmQualquerFrame(page, achar, timeoutMs) {
  const limite = Date.now() + timeoutMs
  while (Date.now() < limite) {
    for (const frame of page.frames()) {
      const alvo = achar(frame).first()
      if (await alvo.isVisible().catch(() => false)) return alvo
    }
    await page.waitForTimeout(1_000)
  }
  return null
}

async function textoDosAlertas(page) {
  const textos = await page.locator('[role="alert"]').allInnerTexts().catch(() => [])
  return textos.map((t) => t.trim()).filter(Boolean).join(' ').slice(0, 200)
}
