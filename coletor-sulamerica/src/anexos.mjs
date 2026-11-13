// Fase 4 — depois de cada atualização do Gestão Conectada, lê os anexos das
// manifestações novas (e das internações abertas) e grava a leitura do Claude
// em gc_documentos. Falha aqui nunca derruba a atualização: o que não for
// lido fica para o próximo ciclo.

import { createHash } from 'node:crypto'
import { config } from './config.mjs'
import { carregarChaveClaude } from './credenciais.mjs'
import { coletarAnexos } from './gestao-conectada.mjs'
import { criarAnalisador } from './analisar-anexo.mjs'
import {
  casosParaAnexos,
  colunasDaLeitura,
  dataHoraBR,
  documentosConhecidos,
  gravarDocumento,
  leituraPorHash,
  marcarAnexosLidos,
} from './manifestacoes-gc.mjs'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ login: string, senha: string }} credenciais
 * @param {(m: string) => void} log
 * @param {{ maxMinutos?: number, porCiclo?: number }} [ajuste]
 */
export async function lerAnexos(db, credenciais, log, ajuste = {}) {
  const a = { ...config.gestaoConectada.anexos, ...ajuste }
  const chave = await carregarChaveClaude(db)
  if (!chave) {
    log('anexos: chave do Claude não cadastrada (Configurações → Inteligência artificial) — pulado')
    return
  }
  const casos = await casosParaAnexos(db, a)
  if (!casos.length) return
  const conhecidos = await documentosConhecidos(db, casos.map((c) => c.case_id))
  const analisar = criarAnalisador(chave, a.modelo)
  const porId = new Map(casos.map((c) => [c.case_id, c]))
  let documentos = 0
  let reaproveitados = 0
  let conferidas = 0
  const tokens = { entrada: 0, saida: 0 }

  const r = await coletarAnexos({
    credenciais,
    log,
    casos: casos.map((c) => c.case_id),
    conhecidos,
    prazo: Date.now() + a.maxMinutos * 60_000,
    aoLer: async (caseId, arquivos) => {
      const c = porId.get(caseId)
      for (const f of arquivos) {
        if (!f.bytes) continue
        const hash = createHash('sha256').update(f.bytes).digest('hex')
        let leitura = await leituraPorHash(db, hash)
        if (leitura) {
          reaproveitados++
        } else {
          // Erro da API (rede, limite, chave) sobe: a manifestação não é
          // marcada e volta no próximo ciclo. Recusa/formato ficam gravados.
          const res = await analisar({ bytes: f.bytes, formato: f.formato, contexto: c.contexto }).catch((e) => {
            // Crédito esgotado ou chave recusada: para o ciclo inteiro.
            if ([401, 403].includes(e?.status) || /credit balance/i.test(String(e?.message))) e.parar = true
            throw e
          })
          tokens.entrada += res.tokens.entrada
          tokens.saida += res.tokens.saida
          leitura = colunasDaLeitura(res)
        }
        await gravarDocumento(db, {
          case_id: caseId,
          numero: c.numero,
          arquivo: f.chave,
          ordem: f.ordem,
          descricao: f.descricao,
          recebido_em: dataHoraBR(f.recebido, 'Z'),
          formato: f.formato,
          tamanho: f.bytes.length,
          hash,
          ...leitura,
        })
        documentos++
      }
      await marcarAnexosLidos(db, caseId, arquivos.length)
      conferidas++
      if (conferidas % 10 === 0) log(`anexos: ${conferidas} manifestação(ões) conferida(s) até agora`)
    },
  })
  log(
    `anexos: ${r.lidos} manifestação(ões) conferida(s), ${documentos} documento(s) novo(s)` +
      (reaproveitados ? ` (${reaproveitados} repetido(s))` : '') +
      `, ${tokens.entrada + tokens.saida} tokens` +
      (r.pendentes ? `; ${r.pendentes} ficam para o próximo ciclo` : ''),
  )
}
