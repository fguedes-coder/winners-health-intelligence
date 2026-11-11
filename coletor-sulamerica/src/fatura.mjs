// Associa o valor da fatura lido no Portal do Corretor à competência no
// Health (tabela faturas, a mesma da tela Sinistralidade).
//
// Regra combinada com o Fernando (11/11/2026):
//   - mês sem fatura (ou com valor zerado) → o robô GRAVA o valor;
//   - mês com o mesmo valor               → só confere;
//   - mês com valor diferente             → NÃO sobrescreve: registra a
//     divergência e quem decide é o usuário.
// Total de vidas não é tocado (vem de outra fonte).

import { config } from './config.mjs'

/** @typedef {'gravada'|'conferida'|'divergente'} ResultadoFatura */

const centavos = (v) => Math.round(Number(v) * 100)

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ competencia: string, valor: number }} fatura
 * @returns {Promise<{ status: ResultadoFatura, valorSistema: number | null }>}
 */
export async function associarFatura(db, { competencia, valor }) {
  const { data: apolice, error: apErr } = await db
    .from('apolices')
    .select('id, numero, cliente, cliente_id')
    .eq('numero', config.portal.apolice)
    .maybeSingle()
  if (apErr) throw new Error(`Falha ao ler a apólice: ${apErr.message}`)
  if (!apolice) throw new Error(`Apólice ${config.portal.apolice} não cadastrada no Health.`)

  const { data: existente, error: fErr } = await db
    .from('faturas')
    .select('id, valor')
    .eq('competencia', competencia)
    .eq('apolice_id', apolice.id)
    .maybeSingle()
  if (fErr) throw new Error(`Falha ao ler a fatura do mês: ${fErr.message}`)

  const agora = new Date().toISOString()

  if (!existente) {
    let clienteNome = apolice.cliente
    if (apolice.cliente_id) {
      const { data: cli } = await db.from('clientes').select('nome').eq('id', apolice.cliente_id).maybeSingle()
      clienteNome = cli?.nome ?? clienteNome
    }
    const { error } = await db.from('faturas').insert({
      competencia,
      valor,
      apolice_id: apolice.id,
      apolice_nome: `${apolice.numero} - ${apolice.cliente}`,
      cliente_id: apolice.cliente_id,
      cliente_nome: clienteNome,
      updated_at: agora,
    })
    if (error) throw new Error(`Falha ao gravar a fatura: ${error.message}`)
    return { status: 'gravada', valorSistema: null }
  }

  const atual = existente.valor == null ? 0 : Number(existente.valor)
  if (centavos(atual) === 0) {
    const { error } = await db.from('faturas').update({ valor, updated_at: agora }).eq('id', existente.id)
    if (error) throw new Error(`Falha ao gravar a fatura: ${error.message}`)
    return { status: 'gravada', valorSistema: null }
  }
  if (centavos(atual) === centavos(valor)) return { status: 'conferida', valorSistema: atual }
  return { status: 'divergente', valorSistema: atual }
}
