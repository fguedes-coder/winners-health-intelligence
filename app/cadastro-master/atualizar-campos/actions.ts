'use server'

import * as XLSX from 'xlsx'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { lerPlanilhaMaster } from '@/lib/cadastro-master/parse'
import type { MasterLinha, DiagnosticoPlanilha } from '@/lib/cadastro-master/parse'
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

function parseArquivo(buf: Buffer): { linhas: MasterLinha[]; diagnostico: DiagnosticoPlanilha } {
  const wb = XLSX.read(buf, { type: 'buffer' })
  return lerPlanilhaMaster(wb)
}

// Carrega beneficiarios_master inteiro, paginado (o Supabase limita 1000
// linhas por chamada — sem paginar, tabelas maiores que isso ficariam
// truncadas silenciosamente). Loga erro em vez de engolir silenciosamente.
async function carregarMasterCompleto(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<MasterRowDB[]> {
  const out: MasterRowDB[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('beneficiarios_master')
      .select(COLS)
      .range(from, from + PAGE - 1)
    if (error) {
      console.log('[atualizar-campos] erro ao carregar beneficiarios_master:', error.message)
      break
    }
    if (!data || data.length === 0) break
    out.push(...(data as MasterRowDB[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
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
  let diagnostico: DiagnosticoPlanilha
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const lido = parseArquivo(buf)
    linhas = lido.linhas
    diagnostico = lido.diagnostico
  } catch (e) {
    return { error: `Falha ao ler o arquivo: ${(e as Error).message}` }
  }
  if (linhas.length === 0) {
    return {
      error:
        'Nenhum beneficiário reconhecido. Confira o diagnóstico abaixo — aba, linha de cabeçalho e colunas detectadas.',
      diagnostico,
    }
  }

  const supabase = await createClient()
  const master = await carregarMasterCompleto(supabase)

  const preview = gerarPreview(linhas, master)

  return {
    arquivoNome: file.name,
    linhas,
    preview,
    diagnostico,
    totalBeneficiariosMaster: master.length,
  }
}

// Recebe as linhas já normalizadas (do passo de prévia, sem reenviar o
// arquivo) + quais divergências o usuário aceitou aplicar. Recarrega o
// master do zero (evita condição de corrida com o que foi previsto) e só
// então grava: UPDATE de CPF/Data de nascimento nos beneficiários já
// encontrados. NUNCA insere — "não encontrados" ficam só no relatório,
// nunca viram beneficiário novo. Nunca toca em eventos_utilizacao/faturas,
// nem em carteirinha/matrícula/plano/empresa/tipo/status — só
// beneficiarios_master.cpf e beneficiarios_master.data_nascimento.
export async function confirmarAtualizacaoCampos(
  arquivoNome: string,
  linhas: MasterLinha[],
  divergenciasAceitas: Record<number, CampoAtualizavel[]>,
): Promise<ConfirmarAtualizacaoResult> {
  if (!linhas || linhas.length === 0) {
    return { error: 'Nada para confirmar — refaça a análise da planilha.' }
  }

  const supabase = await createClient()

  const masterAntes = await carregarMasterCompleto(supabase)
  const qualidadeAntes = medirQualidadeAlvo(masterAntes)

  const preview = gerarPreview(linhas, masterAntes)
  const { atualizacoes } = montarPatches(preview, divergenciasAceitas)

  const { data: imp, error: impErr } = await supabase
    .from('cadastro_master_importacoes')
    .insert({
      arquivo_nome: arquivoNome,
      total_linhas: linhas.length,
      atualizados: atualizacoes.length,
      novos: 0,
      nao_encontrados: preview.naoEncontrados.length,
      duplicidades: preview.conflitos.length,
      qualidade_antes: qualidadeAntes,
    })
    .select('id')
    .single()

  if (impErr || !imp) {
    return { error: `Erro ao registrar importação: ${impErr?.message ?? 'desconhecido'}` }
  }

  for (const u of atualizacoes) {
    const { error } = await supabase
      .from('beneficiarios_master')
      .update({ ...u.patch, origem_importacao_id: imp.id, updated_at: new Date().toISOString() })
      .eq('id', u.id)
    if (error) return { error: `Erro ao atualizar: ${error.message}` }
  }

  const depoisData = await carregarMasterCompleto(supabase)
  const qualidadeDepois = medirQualidadeAlvo(depoisData)
  await supabase
    .from('cadastro_master_importacoes')
    .update({ qualidade_depois: qualidadeDepois })
    .eq('id', imp.id)

  revalidatePath('/cadastro-master/importar')
  revalidatePath('/colaboradores')
  revalidatePath('/colaboradores/diagnostico')

  return {
    atualizados: atualizacoes.length,
    naoEncontrados: preview.naoEncontrados.length,
    ignorados: preview.conflitos.length,
  }
}
