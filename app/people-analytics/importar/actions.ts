'use server'

import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import {
  mapearLinha,
  normalizarColaborador,
  isApto,
  type RhColaborador,
} from '@/lib/people-analytics/rh'
import { getVidasSaude } from '@/lib/people-analytics/data'
import { analisarPeople } from '@/lib/people-analytics/analise'

export type ImportarRhResult = {
  error?: string
  importacaoId?: string
  arquivoNome?: string
  totalColaboradores?: number
  totalAptos?: number
  okrMedio?: number
  // Resumo do cruzamento.
  totalVidasSaude?: number
  vinculados?: number
  naoEncontrados?: number
  pctMatching?: number
}

// Escolhe a planilha com dados de colaboradores (cabeçalho com Colaborador/Nome).
function escolherLinhas(wb: XLSX.WorkBook): Record<string, unknown>[] {
  for (const nome of wb.SheetNames) {
    const ws = wb.Sheets[nome]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: null,
      raw: false,
    })
    if (rows.length === 0) continue
    const headers = Object.keys(rows[0]).map((h) =>
      h
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase(),
    )
    const temNome = headers.some((h) => h.includes('colaborador') || h === 'nome')
    if (temNome) return rows
  }
  // fallback: primeira planilha com linhas.
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nome], {
      defval: null,
      raw: false,
    })
    if (rows.length > 0) return rows
  }
  return []
}

export async function importarRh(formData: FormData): Promise<ImportarRhResult> {
  const file = formData.get('arquivo') as File | null
  const similaridadeMin = Number(formData.get('similaridade') ?? 0.85)
  if (!file || file.size === 0) return { error: 'Selecione um arquivo XLSX ou CSV.' }

  let colaboradores: RhColaborador[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    const rows = escolherLinhas(wb)
    colaboradores = rows
      .map((r) => normalizarColaborador(mapearLinha(r)))
      .filter((c): c is RhColaborador => c !== null)
  } catch (e) {
    return { error: `Falha ao ler o arquivo: ${(e as Error).message}` }
  }

  if (colaboradores.length === 0) {
    return {
      error:
        'Nenhum colaborador encontrado. Confira se há uma coluna "Colaborador" (ou "Nome").',
    }
  }

  const okrValidos = colaboradores
    .map((c) => c.okr)
    .filter((v): v is number => v != null)
  const okrMedio =
    okrValidos.length > 0 ? okrValidos.reduce((s, v) => s + v, 0) / okrValidos.length : 0
  const totalAptos = colaboradores.filter((c) => isApto(c.status)).length

  const supabase = await createClient()

  // Desativa lotes anteriores e cria o novo lote ativo.
  await supabase.from('rh_importacoes').update({ ativo: false }).eq('ativo', true)

  const { data: imp, error: impErr } = await supabase
    .from('rh_importacoes')
    .insert({
      arquivo_nome: file.name,
      total_colaboradores: colaboradores.length,
      total_aptos: totalAptos,
      okr_medio: okrMedio,
      similaridade_min: similaridadeMin,
      ativo: true,
    })
    .select('id')
    .single()

  if (impErr || !imp) {
    return { error: `Erro ao salvar importação: ${impErr?.message ?? 'desconhecido'}` }
  }

  const linhas = colaboradores.map((c) => ({
    importacao_id: imp.id,
    nome: c.nome,
    nome_normalizado: c.nomeNormalizado,
    status: c.status,
    okr: c.okr,
    satisfacao: c.satisfacao,
    satisfacao_pct: c.satisfacaoPct,
    profit: c.profit,
    profit_pct: c.profitPct,
    processo: c.processo,
    processo_pct: c.processoPct,
    cotacao: c.cotacao,
    cotacao_pct: c.cotacaoPct,
    cpf: c.cpf,
    matricula: c.matricula,
    cargo: c.cargo,
    area: c.area,
    gestor: c.gestor,
  }))

  // Inserção em lotes para evitar payloads grandes.
  const CHUNK = 500
  for (let i = 0; i < linhas.length; i += CHUNK) {
    const { error } = await supabase
      .from('rh_colaboradores')
      .insert(linhas.slice(i, i + CHUNK))
    if (error) {
      return { error: `Erro ao salvar colaboradores: ${error.message}` }
    }
  }

  // Cruzamento com a base assistencial para o resumo da importação.
  const vidas = await getVidasSaude()
  const analise = analisarPeople(colaboradores, vidas, { similaridadeMin })

  revalidatePath('/people-analytics')
  revalidatePath('/people-analytics/importar')
  revalidatePath('/people-analytics/ranking')
  revalidatePath('/people-analytics/matriz')
  revalidatePath('/people-analytics/narrativa')
  revalidatePath('/people-analytics/relatorios')
  revalidatePath('/people-analytics/area')

  return {
    importacaoId: imp.id,
    arquivoNome: file.name,
    totalColaboradores: colaboradores.length,
    totalAptos,
    okrMedio,
    totalVidasSaude: vidas.length,
    vinculados: analise.cards.vinculados,
    naoEncontrados: analise.cards.naoEncontrados,
    pctMatching: analise.cards.pctMatching,
  }
}
