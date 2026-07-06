'use server'

import * as XLSX from 'xlsx'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { mapearLinhaMaster, normalizarLinhaMaster } from '@/lib/cadastro-master/parse'
import type { MasterLinha } from '@/lib/cadastro-master/parse'
import {
  gerarPreview,
  montarPatches,
  medirQualidadeAlvo,
  type MasterRowDB,
  type CampoAtualizavel,
  type PreverAtualizacaoResult,
  type ConfirmarAtualizacaoResult,
} from '@/lib/cadastro-master/preview'

const COLS =
  'id, carteirinha, matricula, cpf, nome, nome_norm, tipo, sexo, data_nascimento, plano, empresa, data_adesao, data_admissao, email, telefone, status, competencia'

// Escolhe a planilha com dados de beneficiários (mesmo critério do Cadastro Mestre).
function escolherLinhas(wb: XLSX.WorkBook): Record<string, unknown>[] {
  const temChaves = (rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return false
    const headers = Object.keys(rows[0]).map((h) =>
      h.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase(),
    )
    return headers.some(
      (h) => h.includes('nome') || h.includes('cpf') || h.includes('carteir') || h.includes('matricula'),
    )
  }
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nome], { defval: null, raw: false })
    if (temChaves(rows)) return rows
  }
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nome], { defval: null, raw: false })
    if (rows.length > 0) return rows
  }
  return []
}

function parseArquivo(buf: Buffer): MasterLinha[] {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const rows = escolherLinhas(wb)
  return rows
    .map((r) => normalizarLinhaMaster(mapearLinhaMaster(r)))
    .filter((l): l is MasterLinha => l !== null)
}

// Só leitura: parseia o arquivo, carrega o master atual (SELECT) e monta o
// relatório de conferência. Nenhum INSERT/UPDATE acontece aqui.
export async function preverAtualizacaoCampos(
  formData: FormData,
): Promise<PreverAtualizacaoResult> {
  const file = formData.get('arquivo')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione um arquivo XLSX ou CSV.' }
  }

  let linhas: MasterLinha[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    linhas = parseArquivo(buf)
  } catch (e) {
    return { error: `Falha ao ler o arquivo: ${(e as Error).message}` }
  }
  if (linhas.length === 0) {
    return {
      error: 'Nenhum beneficiário reconhecido. Confira se há colunas como Nome, CPF, Carteirinha ou Matrícula.',
    }
  }

  const supabase = await createClient()
  const { data } = await supabase.from('beneficiarios_master').select(COLS)
  const master = (data ?? []) as MasterRowDB[]

  const preview = gerarPreview(linhas, master)

  return { arquivoNome: file.name, linhas, preview }
}

// Recebe as linhas já normalizadas (do passo de prévia, sem reenviar o
// arquivo) + quais divergências o usuário aceitou aplicar. Recarrega o
// master do zero (evita condição de corrida com o que foi previsto) e só
// então grava: UPDATE dos campos preenchidos/aceitos e INSERT dos "não
// encontrados". Nunca toca em eventos_utilizacao/faturas — só
// beneficiarios_master.
export async function confirmarAtualizacaoCampos(
  arquivoNome: string,
  linhas: MasterLinha[],
  divergenciasAceitas: Record<number, CampoAtualizavel[]>,
): Promise<ConfirmarAtualizacaoResult> {
  if (!linhas || linhas.length === 0) {
    return { error: 'Nada para confirmar — refaça a análise da planilha.' }
  }

  const supabase = await createClient()

  const { data: antesData } = await supabase.from('beneficiarios_master').select(COLS)
  const masterAntes = (antesData ?? []) as MasterRowDB[]
  const qualidadeAntes = medirQualidadeAlvo(masterAntes)

  const preview = gerarPreview(linhas, masterAntes)
  const { atualizacoes, novos } = montarPatches(preview, divergenciasAceitas)

  const { data: imp, error: impErr } = await supabase
    .from('cadastro_master_importacoes')
    .insert({
      arquivo_nome: arquivoNome,
      total_linhas: linhas.length,
      atualizados: atualizacoes.length,
      novos: novos.length,
      nao_encontrados: 0,
      duplicidades: preview.conflitos.length,
      qualidade_antes: qualidadeAntes,
    })
    .select('id')
    .single()

  if (impErr || !imp) {
    return { error: `Erro ao registrar importação: ${impErr?.message ?? 'desconhecido'}` }
  }

  const CHUNK = 500
  for (let i = 0; i < novos.length; i += CHUNK) {
    const lote = novos.slice(i, i + CHUNK).map((r) => ({ ...r, origem_importacao_id: imp.id }))
    const { error } = await supabase.from('beneficiarios_master').insert(lote)
    if (error) return { error: `Erro ao inserir novos: ${error.message}` }
  }

  for (const u of atualizacoes) {
    const { error } = await supabase
      .from('beneficiarios_master')
      .update({ ...u.patch, origem_importacao_id: imp.id, updated_at: new Date().toISOString() })
      .eq('id', u.id)
    if (error) return { error: `Erro ao atualizar: ${error.message}` }
  }

  const { data: depoisData } = await supabase.from('beneficiarios_master').select(COLS)
  const qualidadeDepois = medirQualidadeAlvo((depoisData ?? []) as MasterRowDB[])
  await supabase
    .from('cadastro_master_importacoes')
    .update({ qualidade_depois: qualidadeDepois })
    .eq('id', imp.id)

  revalidatePath('/cadastro-master/importar')
  revalidatePath('/colaboradores')
  revalidatePath('/colaboradores/diagnostico')

  return { atualizados: atualizacoes.length, novos: novos.length, ignorados: preview.conflitos.length }
}
