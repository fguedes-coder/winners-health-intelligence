// Teste manual da varredura (Fase 3) — SÓ LÊ o portal e NÃO grava nada.
// Uso, dentro do container do coletor:
//
//   node src/testar-varredura.mjs [minutos=8]
//
// Imprime só contagens e valores de cadastro não pessoais (plano, código da
// empresa, vigente) — nunca nome, carteirinha ou diagnóstico.

import { createClient } from '@supabase/supabase-js'
import { config } from './config.mjs'
import { carregarCredenciaisGC } from './credenciais.mjs'
import { varrerBeneficiarios } from './gestao-conectada.mjs'
import { linhaDaCarteirinha, linhaDaManifestacao } from './manifestacoes-gc.mjs'

const db = createClient(config.supabase.url, config.supabase.chave, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const credenciais = await carregarCredenciaisGC(db)
if (!credenciais) {
  console.error('Acesso ao Gestão Conectada não cadastrado em Configurações → Robôs.')
  process.exit(1)
}
const { data: ms } = await db.from('gc_manifestacoes').select('case_id')
const minutos = Number(process.argv[2] ?? 8)
const conta = (m, k) => m.set(k, (m.get(k) ?? 0) + 1)
const planos = new Map(), empresas = new Map(), vigentes = new Map(), tipos = new Map(), rotulos = new Set()
let comManif = 0, carteirinhas17 = 0
const t0 = Date.now()
const r = await varrerBeneficiarios({
  credenciais,
  log: (m) => console.log(`[teste] ${m}`),
  conferidas: new Set(),
  contasConferidas: new Set(),
  casosConhecidos: new Set((ms ?? []).map((m) => m.case_id)),
  prazo: Date.now() + minutos * 60_000,
  aoLerCarteirinha: async (c) => {
    const l = linhaDaCarteirinha(c)
    conta(planos, l.plano ?? '—'); conta(empresas, l.codigo_empresa ?? '—'); conta(vigentes, l.vigente ?? '—')
    Object.keys(l.campos).forEach((k) => rotulos.add(k))
    if (l.casos.length) comManif++
    if (l.carteirinha_sulamerica?.length === 17) carteirinhas17++
  },
  aoLerManifestacoes: async (lote) => {
    for (const m of lote) conta(tipos, linhaDaManifestacao(m)?.tipo_registro ?? '—')
  },
})
const fmt = (m) => JSON.stringify(Object.fromEntries([...m].sort((a, b) => b[1] - a[1])))
console.log(`[teste] ${((Date.now() - t0) / 60000).toFixed(1)} min · contas ${r.contasLidas}/${r.contas} · carteirinhas ${r.carteirinhas} (17 dígitos: ${carteirinhas17}, com manifestação: ${comManif}) · manifestações novas ${r.manifestacoesNovas} · completa ${r.completa}`)
console.log(`[teste] rótulos da ficha: ${[...rotulos].sort().join(' · ')}`)
console.log(`[teste] vigente: ${fmt(vigentes)}`)
console.log(`[teste] código da empresa: ${fmt(empresas)}`)
console.log(`[teste] planos: ${fmt(planos)}`)
console.log(`[teste] tipos das manifestações novas: ${fmt(tipos)}`)
process.exit(0)
