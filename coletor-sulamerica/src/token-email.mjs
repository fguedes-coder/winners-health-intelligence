// Lê o token de acesso que o SulAmérica Integra envia por e-mail a cada login.
//
// A caixa é aberta SOMENTE LEITURA: o coletor não marca como lido, não move e
// não apaga nada. Só considera mensagens que chegaram depois do clique em
// ENTRAR e que sejam do SulAmérica Integra.

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { config } from './config.mjs'

const RE_TOKEN = /TOKEN\s+DE\s+ACESSO[^0-9]{0,40}(\d{6})/i
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Espera o e-mail do token chegar (costuma levar ~2 min) e devolve o código.
 * @param {{ desde: number, email: { usuario: string, senha: string },
 *           timeoutMs?: number, intervaloMs?: number }} opts
 *   desde — instante (ms) do clique em ENTRAR; mensagens anteriores são ignoradas.
 */
export async function aguardarToken({ desde, email, timeoutMs = 6 * 60_000, intervaloMs = 15_000 }) {
  const limite = Date.now() + timeoutMs
  while (Date.now() < limite) {
    const token = await procurarToken(desde, email)
    if (token) return token
    await dormir(intervaloMs)
  }
  throw new Error('O token de acesso não chegou ao e-mail em 6 minutos.')
}

async function procurarToken(desde, email) {
  const cliente = new ImapFlow({
    host: config.imap.host,
    port: config.imap.porta,
    secure: true,
    auth: { user: email.usuario, pass: email.senha },
    logger: false,
  })
  await cliente.connect()
  try {
    const trava = await cliente.getMailboxLock('INBOX', { readOnly: true })
    try {
      // SINCE do IMAP é só data (sem hora): busca desde ontem e filtra a hora
      // exata pelo internalDate abaixo.
      const uids = await cliente.search(
        { since: new Date(desde - 24 * 3600_000), body: 'TOKEN DE ACESSO' },
        { uid: true },
      )
      // Mais recentes primeiro.
      for (const uid of [...(uids || [])].reverse().slice(0, 10)) {
        const msg = await cliente.fetchOne(
          uid,
          { source: true, internalDate: true },
          { uid: true },
        )
        // 1 min de folga para diferença de relógio entre servidores.
        if (!msg || msg.internalDate.getTime() < desde - 60_000) continue
        const email = await simpleParser(msg.source)
        const texto = email.text || String(email.html || '').replace(/<[^>]+>/g, ' ')
        if (!/SulAm[ée]rica/i.test(texto)) continue
        const m = RE_TOKEN.exec(texto)
        if (m) return m[1]
      }
    } finally {
      trava.release()
    }
  } finally {
    await cliente.logout().catch(() => {})
  }
  return null
}
