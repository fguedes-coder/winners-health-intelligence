// Valor da fatura no Portal do Corretor SulAmérica (mapeado em 11/11/2026):
//
//   1. corretor.sulamericaseguros.com.br/?logout=true .. Login + Senha → OK
//      (o botão OK tem reCAPTCHA invisível; se o portal abrir um desafio de
//      imagens, o robô NÃO tenta resolvê-lo: avisa e o valor é lançado à mão)
//   2. area-logada/#/busca/<contrato> ............. mesma tela da "Busca rápida"
//   3. cartão "Pagamentos" ........................... seletor de ano + linhas
//      "Parc. · Vencimento · Valor · Data pagamento · Valor pago · Tipo · Status"
//
// "Valor" é a fatura CHEIA da apólice (todas as subestipulantes); "Valor pago"
// é só a parte da matriz. Conferido em jul–out/2026 contra o lançado no Health.
// A fatura da competência AAAA-MM é a parcela com vencimento em MM/AAAA.
//
// A tela também lista beneficiários (nome, CPF): o robô lê SÓ o cartão de
// Pagamentos e não guarda nada além de vencimento e valor.

import { chromium } from 'playwright'
import { config } from './config.mjs'

/** O portal pediu verificação humana (reCAPTCHA) — não há o que automatizar. */
export class VerificacaoHumana extends Error {}

/**
 * @param {{ competencia: string, log: (m: string) => void,
 *           credenciais: { login: string, senha: string } }} opts
 * @returns {Promise<{ valor: number, vencimento: string }>} vencimento 'AAAA-MM-DD'
 */
export async function buscarValorFatura({ competencia, log, credenciais }) {
  const [ano, mes] = competencia.split('-')
  const rotulo = `${mes}/${ano}`

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)

  try {
    log('abrindo o Portal do Corretor')
    await page.goto(config.portalCorretor.urlLogin, { waitUntil: 'domcontentloaded' })

    // Aviso de privacidade que às vezes cobre o formulário.
    const aviso = page.locator('.sas-box-lgpd-info-accept-btn').filter({ visible: true })
    if (await aviso.count()) await aviso.first().click().catch(() => {})

    const form = page.locator('form#formLogin')
    await form.locator('input[name="login"]').fill(credenciais.login)
    await form.locator('input[name="password"]').fill(credenciais.senha)
    await form.locator('.g-recaptcha').first().click()

    const entrou = await page
      .waitForURL(/\/area-logada\//i, { timeout: 60_000 })
      .then(() => true)
      .catch(() => false)
    if (!entrou) {
      const desafio = await page
        .locator('iframe[src*="recaptcha/api2/bframe"], iframe[title*="desafio" i], iframe[title*="challenge" i]')
        .filter({ visible: true })
        .count()
      if (desafio > 0) {
        throw new VerificacaoHumana(
          'O Portal do Corretor pediu verificação de reCAPTCHA; lance o valor da fatura à mão em Sinistralidade.',
        )
      }
      throw new Error('Login no Portal do Corretor não aceito (confira login e senha em Configurações → Robôs).')
    }
    log('login no Portal do Corretor concluído')

    await page.goto(
      `${new URL(config.portalCorretor.urlLogin).origin}/area-logada/#/busca/${encodeURIComponent(config.portalCorretor.contrato)}`,
      { waitUntil: 'domcontentloaded' },
    )

    // Cartão "Pagamentos": o <h4 class="pagamentos"> fica dentro do card que
    // contém o seletor de ano e as linhas.
    const cartao = page
      .locator('div.doc-product')
      .filter({ has: page.locator('h4.pagamentos') })
      .first()
    await cartao.waitFor({ state: 'attached', timeout: 90_000 })

    const seletorAno = cartao.locator('select.pagamentos-ano').first()
    if (await seletorAno.count()) {
      const anos = await seletorAno.locator('option').allTextContents()
      if (!anos.map((a) => a.trim()).includes(ano)) {
        throw new Error(`O Portal do Corretor não tem pagamentos de ${ano} para o contrato ${config.portalCorretor.contrato}.`)
      }
      if ((await seletorAno.inputValue()) !== ano) {
        await seletorAno.selectOption(ano)
        await page.waitForTimeout(2_000)
      }
    }

    const linhas = await cartao.locator('div.payments').first().locator(':scope > div.detail').allInnerTexts()
    const parcelas = linhas.map(lerLinha).filter(Boolean)
    if (parcelas.length === 0) {
      throw new Error('Não encontrei a tabela de Pagamentos no Portal do Corretor.')
    }

    const doMes = parcelas.filter((p) => p.vencimento.slice(0, 7) === competencia)
    if (doMes.length === 0) {
      throw new Error(`Nenhuma fatura com vencimento em ${rotulo} no Portal do Corretor.`)
    }
    if (doMes.length > 1) {
      throw new Error(`Mais de uma fatura com vencimento em ${rotulo} no Portal do Corretor; confira à mão.`)
    }
    log(`fatura de ${rotulo}: vencimento ${doMes[0].vencimento}`)
    return doMes[0]
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

/**
 * "2\n\n26/10/2026\n\nR$ 80991,88\n\n26/10/2026\n\nR$ 15686,18\n\nBoleto\n\nPago"
 * → { vencimento: '2026-10-26', valor: 80991.88 }. A primeira data é o
 * vencimento e o primeiro valor é a fatura cheia (o segundo é o pago pela matriz).
 * Exportada para teste.
 */
export function lerLinha(texto) {
  const data = /(\d{2})\/(\d{2})\/(\d{4})/.exec(texto)
  const dinheiro = /R\$\s*([\d.]+,\d{2})/.exec(texto)
  if (!data || !dinheiro) return null
  const valor = Number(dinheiro[1].replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(valor) || valor <= 0) return null
  return { vencimento: `${data[3]}-${data[2]}-${data[1]}`, valor }
}
