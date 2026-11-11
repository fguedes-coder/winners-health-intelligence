// Teste manual da leitura da fatura no Portal do Corretor — SÓ LÊ, não grava
// nada no banco. Uso, dentro do container do coletor:
//
//   node src/testar-fatura.mjs 2026-10
//
// Imprime vencimento e valor encontrados e o que o robô faria (gravar,
// conferir ou apontar divergência) com a fatura lançada no Health.

import { createClient } from '@supabase/supabase-js'
import { config } from './config.mjs'
import { carregarCredenciais } from './credenciais.mjs'
import { buscarValorFatura } from './portal-corretor.mjs'

const competencia = process.argv[2]
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia ?? '')) {
  console.error('uso: node src/testar-fatura.mjs AAAA-MM')
  process.exit(1)
}

const db = createClient(config.supabase.url, config.supabase.chave, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const credenciais = await carregarCredenciais(db)
if (!credenciais.corretor) {
  console.error('Acesso ao Portal do Corretor não cadastrado em Configurações → Robôs.')
  process.exit(1)
}

const { valor, vencimento } = await buscarValorFatura({
  competencia,
  log: (m) => console.log(`[teste] ${m}`),
  credenciais: credenciais.corretor,
})

const { data: apolice } = await db.from('apolices').select('id').eq('numero', config.portal.apolice).maybeSingle()
const { data: atual } = apolice
  ? await db.from('faturas').select('valor').eq('competencia', competencia).eq('apolice_id', apolice.id).maybeSingle()
  : { data: null }

const sistema = atual?.valor == null ? null : Number(atual.valor)
const acao =
  sistema == null || Math.round(sistema * 100) === 0
    ? 'GRAVARIA o valor (mês vazio)'
    : Math.round(sistema * 100) === Math.round(valor * 100)
      ? 'só CONFERIRIA (mesmo valor)'
      : `apontaria DIVERGÊNCIA (sistema: R$ ${sistema.toFixed(2)})`

console.log(`[teste] ${competencia}: vencimento ${vencimento}, valor R$ ${valor.toFixed(2)} → ${acao}`)
process.exit(0)
