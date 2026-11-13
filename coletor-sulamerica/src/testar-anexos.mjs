// Teste manual da Fase 4 (não grava nada):
//   node src/testar-anexos.mjs <número da manifestação> [--mostrar]
// Abre o visualizador de anexos da manifestação, baixa os arquivos em memória
// e manda o primeiro para o Claude. Sem --mostrar imprime só o formato da
// leitura (tipo, tamanhos, tokens) — nada clínico vai para o terminal.

import { createClient } from '@supabase/supabase-js'
import { config } from './config.mjs'
import { carregarChaveClaude, carregarCredenciaisGC } from './credenciais.mjs'
import { coletarAnexos } from './gestao-conectada.mjs'
import { criarAnalisador } from './analisar-anexo.mjs'

const numero = process.argv[2]
const mostrar = process.argv.includes('--mostrar')
if (!numero) throw new Error('uso: node src/testar-anexos.mjs <número da manifestação> [--mostrar]')

const db = createClient(config.supabase.url, config.supabase.chave, { auth: { persistSession: false } })
const { data: caso } = await db.from('gc_manifestacoes').select('case_id, tipo_registro, prestador_nome').eq('numero', numero).maybeSingle()
if (!caso) throw new Error('manifestação não encontrada no banco')
const credenciais = await carregarCredenciaisGC(db)
const chave = await carregarChaveClaude(db)
if (!chave) throw new Error('chave do Claude não cadastrada')
const analisar = criarAnalisador(chave, config.gestaoConectada.anexos.modelo)

await coletarAnexos({
  credenciais,
  log: (m) => console.log('[teste]', m),
  casos: [caso.case_id],
  conhecidos: new Map(),
  prazo: Date.now() + 10 * 60_000,
  aoLer: async (_id, arquivos) => {
    console.log('[teste] arquivos:', JSON.stringify(arquivos.map((f) => ({ chave: f.chave, formato: f.formato, kb: Math.round((f.bytes?.length ?? 0) / 1024), recebido: f.recebido }))))
    const f = arquivos[0]
    if (!f?.bytes) return
    const t0 = Date.now()
    const r = await analisar({ bytes: f.bytes, formato: f.formato, contexto: `${caso.tipo_registro} — ${caso.prestador_nome}` })
    const d = r.dados ?? {}
    console.log('[teste] leitura:', JSON.stringify({
      erro: r.erro, modelo: r.modelo, tokens: r.tokens, segundos: Math.round((Date.now() - t0) / 1000),
      tipo: d.tipo_documento, legibilidade: d.legibilidade, cids: (d.cids ?? []).length,
      tamanhos: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' ? v.length : Array.isArray(v) ? `[${v.length}]` : v === null ? null : typeof v])),
    }))
    if (mostrar) console.log(JSON.stringify(d, null, 2))
  },
})
process.exit(0)
