// Teste manual do Gestão Conectada — SÓ LÊ o portal e NÃO grava nada no
// banco. Uso, dentro do container do coletor:
//
//   node src/testar-gestao-conectada.mjs
//
// Imprime só contagens e nomes de campos — nunca nome, carteirinha ou
// diagnóstico (dado de saúde não vai para log).

import { createClient } from '@supabase/supabase-js'
import { config } from './config.mjs'
import { carregarCredenciaisGC } from './credenciais.mjs'
import { coletarGestaoConectada } from './gestao-conectada.mjs'
import { linhaDaManifestacao } from './manifestacoes-gc.mjs'

const db = createClient(config.supabase.url, config.supabase.chave, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const credenciais = await carregarCredenciaisGC(db)
if (!credenciais) {
  console.error('Acesso ao Gestão Conectada não cadastrado em Configurações → Robôs.')
  process.exit(1)
}

const { manifestacoes, relatorios } = await coletarGestaoConectada({
  credenciais,
  log: (m) => console.log(`[teste] ${m}`),
})
const linhas = manifestacoes.map(linhaDaManifestacao).filter(Boolean)

const conta = (f) => linhas.filter(f).length
const internacoes = linhas.filter((l) => /interna/i.test(l.tipo_registro ?? ''))
console.log(`[teste] relatórios lidos: ${relatorios}/${config.gestaoConectada.relatorios.length}`)
console.log(`[teste] manifestações: ${linhas.length} (internações: ${internacoes.length})`)
console.log(`[teste] internações com data de internação: ${conta((l) => l.data_internacao)}; com alta: ${conta((l) => l.data_alta)}; sem alta: ${internacoes.filter((l) => l.data_internacao && !l.data_alta).length}`)
console.log(`[teste] carteirinhas com 17 dígitos: ${conta((l) => l.carteirinha_sulamerica?.length === 17)}/${linhas.length}`)
console.log(`[teste] com procedimentos: ${conta((l) => l.procedimentos.length)}; com hipótese diagnóstica: ${conta((l) => l.hipotese_diagnostica)}; com indicação clínica: ${conta((l) => l.indicacao_clinica)}`)
const rotulos = new Set(linhas.flatMap((l) => Object.keys(l.campos)))
console.log(`[teste] campos encontrados: ${[...rotulos].sort().join(' · ')}`)
process.exit(0)
