'use server'

import { revalidatePath } from 'next/cache'
import { requireAuthAction } from '@/lib/auth/require-user'
import { createClient } from '@/lib/supabase/server'
import {
  parseSulAmerica,
  type CategoriaResumo,
  type FaixaEtariaResumo,
  type ParseResult,
  type RankItem,
  type SubestipulanteResumo,
} from '@/lib/sulamerica-parser'

const BUCKET = 'uploads'

export type Importacao = {
  id: string
  cliente_id: string | null
  cliente_nome: string | null
  apolice_id: string | null
  apolice_numero: string | null
  arquivo_nome: string
  arquivo_path: string
  tamanho: number
  competencia: string | null
  periodo_inicio: string | null
  periodo_fim: string | null
  total_eventos: number
  total_vidas: number
  total_beneficiarios: number
  total_titulares: number
  total_dependentes: number
  total_subestipulantes: number
  valor_total_utilizacao: number
  valor_total_empresa: number
  total_internacoes: number
  total_saude_mental: number
  resumo: ResumoImportacao | null
  status: string
  created_at: string
  confirmed_at: string | null
}

export type ResumoImportacao = {
  subestipulantes: SubestipulanteResumo[]
  topPrestadores: RankItem[]
  topUtilizadores: RankItem[]
  categorias: CategoriaResumo[]
  faixaEtaria: FaixaEtariaResumo[]
}

export type PreviewResult = {
  error?: string
  importacaoId?: string
  clienteNome?: string
  apolice?: string
  competenciaSugerida?: string | null
  competenciasDisponiveis?: string[]
  competenciasAtendimento?: string[]
  periodoInicio?: string | null
  periodoFim?: string | null
  totalEventos?: number
  beneficiariosComUtilizacao?: number
  titularesUnicos?: number
  dependentesUnicos?: number
  totalSubestipulantes?: number
  valorTotalUtilizacao?: number
  valorTotalEmpresa?: number
  totalInternacoes?: number
  totalSaudeMental?: number
  subestipulantes?: SubestipulanteResumo[]
  topPrestadores?: RankItem[]
  topUtilizadores?: RankItem[]
}

export type ConfirmResult = {
  error?: string
  duplicado?: boolean
  duplicadoId?: string
  competencia?: string
}

type ActionResult = { error?: string }

// Passo 1 — Lê o TXT, calcula a prévia e grava a importação como "pendente".
export async function processarUpload(
  formData: FormData,
): Promise<PreviewResult> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { error: auth.error }

  const clienteId = String(formData.get('cliente_id') ?? '').trim()
  const clienteNome = String(formData.get('cliente_nome') ?? '').trim()
  const file = formData.get('arquivo')

  if (!clienteId) return { error: 'Selecione um cliente.' }
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione um arquivo TXT para enviar.' }
  }

  const content = await file.text()
  let parsed: ParseResult
  try {
    parsed = parseSulAmerica(content)
  } catch {
    return { error: 'Não foi possível ler o arquivo. Verifique o layout.' }
  }

  if (parsed.totalEventos === 0) {
    return { error: 'Nenhum evento de utilização foi encontrado no arquivo.' }
  }
  if (!parsed.apolice) {
    return { error: 'Não foi possível identificar a apólice no arquivo.' }
  }

  const supabase = await createClient()

  // Caminho único no Storage
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${clienteId}/${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || 'text/plain',
      upsert: false,
    })

  if (uploadError) return { error: `Falha no upload: ${uploadError.message}` }

  const resumo: ResumoImportacao = {
    subestipulantes: parsed.subestipulantes,
    topPrestadores: parsed.topPrestadores,
    topUtilizadores: parsed.topUtilizadores,
    categorias: parsed.categorias,
    faixaEtaria: parsed.faixaEtaria,
  }

  const { data: inserted, error: insertError } = await supabase
    .from('importacoes')
    .insert({
      cliente_id: clienteId,
      cliente_nome: clienteNome || null,
      apolice_numero: parsed.apolice,
      arquivo_nome: file.name,
      arquivo_path: path,
      tamanho: file.size,
      // Competência só é definida quando o usuário confirma.
      competencia: null,
      periodo_inicio: parsed.periodoInicio,
      periodo_fim: parsed.periodoFim,
      total_eventos: parsed.totalEventos,
      total_vidas: parsed.beneficiariosComUtilizacao,
      total_beneficiarios: parsed.beneficiariosComUtilizacao,
      total_titulares: parsed.titularesUnicos,
      total_dependentes: parsed.dependentesUnicos,
      total_subestipulantes: parsed.subestipulantes.length,
      valor_total_utilizacao: parsed.valorTotalUtilizacao,
      valor_total_empresa: parsed.valorTotalEmpresa,
      total_internacoes: parsed.totalInternacoes,
      total_saude_mental: parsed.totalSaudeMental,
      resumo,
      status: 'pendente',
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    await supabase.storage.from(BUCKET).remove([path])
    return { error: insertError?.message ?? 'Falha ao registrar importação.' }
  }

  revalidatePath('/uploads')

  return {
    importacaoId: inserted.id,
    clienteNome,
    apolice: parsed.apolice,
    competenciaSugerida: parsed.competenciaSugerida,
    competenciasDisponiveis: parsed.competenciasDisponiveis,
    competenciasAtendimento: parsed.competenciasAtendimento,
    periodoInicio: parsed.periodoInicio,
    periodoFim: parsed.periodoFim,
    totalEventos: parsed.totalEventos,
    beneficiariosComUtilizacao: parsed.beneficiariosComUtilizacao,
    titularesUnicos: parsed.titularesUnicos,
    dependentesUnicos: parsed.dependentesUnicos,
    totalSubestipulantes: parsed.subestipulantes.length,
    valorTotalUtilizacao: parsed.valorTotalUtilizacao,
    valorTotalEmpresa: parsed.valorTotalEmpresa,
    totalInternacoes: parsed.totalInternacoes,
    totalSaudeMental: parsed.totalSaudeMental,
    subestipulantes: parsed.subestipulantes,
    topPrestadores: parsed.topPrestadores,
    topUtilizadores: parsed.topUtilizadores,
  }
}

// Passo 2 — Confirma a importação com a competência escolhida pelo usuário.
// Cria apólice/subestipulantes e grava beneficiários e eventos detalhados.
export async function confirmarImportacao(
  importacaoId: string,
  competencia: string,
  opts?: { substituir?: boolean },
): Promise<ConfirmResult> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { error: auth.error }

  const competenciaNorm = (competencia ?? '').trim()
  if (!/^\d{4}-\d{2}$/.test(competenciaNorm)) {
    return { error: 'Selecione a competência (mês/ano) antes de confirmar.' }
  }

  const supabase = await createClient()

  const { data: imp, error: impErr } = await supabase
    .from('importacoes')
    .select('*')
    .eq('id', importacaoId)
    .single()

  if (impErr || !imp) return { error: 'Importação não encontrada.' }
  if (imp.status === 'confirmado') {
    return { error: 'Esta importação já foi confirmada.' }
  }
  if (!imp.cliente_id) return { error: 'Importação sem cliente vinculado.' }

  // Detecção de duplicidade: já existe importação confirmada para
  // cliente + apólice + competência?
  const { data: existentes } = await supabase
    .from('importacoes')
    .select('id, arquivo_path')
    .eq('status', 'confirmado')
    .eq('cliente_id', imp.cliente_id)
    .eq('apolice_numero', imp.apolice_numero)
    .eq('competencia', competenciaNorm)
    .neq('id', imp.id)

  if (existentes && existentes.length > 0) {
    if (!opts?.substituir) {
      return { duplicado: true, duplicadoId: existentes[0].id, competencia: competenciaNorm }
    }
    // Substituir: remove importações confirmadas anteriores (cascade) + arquivos
    for (const ex of existentes) {
      if (ex.arquivo_path) {
        await supabase.storage.from(BUCKET).remove([ex.arquivo_path])
      }
      await supabase.from('importacoes').delete().eq('id', ex.id)
    }
  }

  // Baixa o arquivo do Storage e reprocessa
  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(imp.arquivo_path)
  if (dlErr || !blob) {
    return { error: 'Não foi possível recuperar o arquivo do armazenamento.' }
  }
  const parsed = parseSulAmerica(await blob.text())

  // 1) Apólice principal (cria se não existir para o cliente).
  //    IMPORTANTE: não definimos vidas ativas nem prêmio a partir do TXT de
  //    utilização — esses dados vêm de cadastro/fatura/manual.
  const { data: apoliceExistente } = await supabase
    .from('apolices')
    .select('id')
    .eq('cliente_id', imp.cliente_id)
    .eq('numero', parsed.apolice)
    .maybeSingle()

  let apoliceId = apoliceExistente?.id as string | undefined

  if (!apoliceId) {
    const { data: novaApolice, error: apErr } = await supabase
      .from('apolices')
      .insert({
        numero: parsed.apolice,
        cliente_id: imp.cliente_id,
        cliente: imp.cliente_nome ?? parsed.razaoSocial,
        operadora: 'SulAmérica',
        vidas: 0, // 0 = não informado (TXT não traz vidas ativas)
        premio: 0, // 0 = fatura/prêmio não informado
        status: 'Vigente',
      })
      .select('id')
      .single()
    if (apErr || !novaApolice) {
      return { error: apErr?.message ?? 'Falha ao criar apólice.' }
    }
    apoliceId = novaApolice.id
  }

  // 2) Subestipulantes (cria/atualiza) e mapeia codigo -> id
  const subIdPorCodigo = new Map<string, string>()
  for (const sub of parsed.subestipulantes) {
    const { data: subRow, error: subErr } = await supabase
      .from('subestipulantes')
      .upsert(
        {
          apolice_id: apoliceId,
          codigo: sub.codigo,
          razao_social: sub.razaoSocial,
          vidas: sub.vidas,
        },
        { onConflict: 'apolice_id,codigo' },
      )
      .select('id')
      .single()
    if (subErr || !subRow) {
      return { error: subErr?.message ?? 'Falha ao gravar subestipulante.' }
    }
    subIdPorCodigo.set(sub.codigo, subRow.id)
  }

  // 3) Limpa eventuais dados anteriores desta importação (idempotência)
  await supabase.from('eventos_utilizacao').delete().eq('importacao_id', imp.id)
  await supabase.from('beneficiarios').delete().eq('importacao_id', imp.id)

  // 4) Beneficiários únicos (por pessoa = cod_usuario + dv)
  const benefMap = new Map<
    string,
    {
      cod_usuario: string
      cod_titular: string
      subestipulante_id: string | null
      tipo: string
      sexo: string
      idade: number | null
      plano: string
      grupo_familiar: string
    }
  >()
  for (const e of parsed.eventos) {
    if (!e.pessoaId || benefMap.has(e.pessoaId)) continue
    benefMap.set(e.pessoaId, {
      cod_usuario: e.codUsuario,
      cod_titular: e.codTitular,
      subestipulante_id: subIdPorCodigo.get(e.subestipulanteCodigo) ?? null,
      tipo: e.tipoBeneficiario,
      sexo: e.sexo,
      idade: e.idade,
      plano: e.plano,
      grupo_familiar: e.grupoFamiliar,
    })
  }
  const beneficiariosRows = [...benefMap.values()].map((b) => ({
    importacao_id: imp.id,
    apolice_id: apoliceId,
    subestipulante_id: b.subestipulante_id,
    cod_usuario: b.cod_usuario,
    cod_titular: b.cod_titular,
    tipo: b.tipo,
    sexo: b.sexo,
    idade: b.idade,
    plano: b.plano,
    grupo_familiar: b.grupo_familiar,
  }))

  const insertErr1 = await insertEmLotes(
    supabase,
    'beneficiarios',
    beneficiariosRows,
  )
  if (insertErr1) return { error: insertErr1 }

  // 5) Eventos de utilização detalhados
  const eventosRows = parsed.eventos.map((e) => ({
    importacao_id: imp.id,
    apolice_id: apoliceId,
    subestipulante_id: subIdPorCodigo.get(e.subestipulanteCodigo) ?? null,
    cod_usuario: e.codUsuario,
    tipo_beneficiario: e.tipoBeneficiario,
    sexo: e.sexo,
    idade: e.idade,
    plano: e.plano,
    prestador_codigo: e.prestadorCodigo,
    prestador_nome: e.prestadorNome,
    prestador_cnpj: e.prestadorCnpj,
    grupo_estatistico: e.grupoEstatistico,
    servico_principal: e.servicoPrincipal,
    servico: e.servico,
    categoria_atendimento: e.categoriaAtendimento,
    posicao_prestador: e.posicaoPrestador,
    valor_apresentado: e.valorApresentado,
    valor_pago: e.valorPago,
    valor_copart: e.valorCopart,
    valor_empresa: e.valorEmpresa,
    data_atendimento: e.dataAtendimento,
    data_pagamento: e.dataPagamento,
    data_internacao: e.dataInternacao,
    internacao: e.internacao,
    saude_mental: e.saudeMental,
    competencia: e.competencia,
  }))

  const insertErr2 = await insertEmLotes(
    supabase,
    'eventos_utilizacao',
    eventosRows,
  )
  if (insertErr2) return { error: insertErr2 }

  // 6) Marca importação como confirmada com a competência escolhida
  const { error: updErr } = await supabase
    .from('importacoes')
    .update({
      status: 'confirmado',
      apolice_id: apoliceId,
      competencia: competenciaNorm,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', imp.id)
  if (updErr) return { error: updErr.message }

  revalidatePath('/uploads')
  revalidatePath('/apolices')
  revalidatePath('/dashboard')
  revalidatePath('/sinistralidade')
  revalidatePath('/relatorios')
  return { competencia: competenciaNorm }
}

// Cancela/descarta uma importação pendente ou confirmada.
export async function cancelarImportacao(
  id: string,
  path: string,
): Promise<ActionResult> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { error: auth.error }

  const supabase = await createClient()
  if (path) await supabase.storage.from(BUCKET).remove([path])
  const { error } = await supabase.from('importacoes').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/uploads')
  revalidatePath('/dashboard')
  revalidatePath('/sinistralidade')
  return {}
}

// Insere registros em lotes para evitar payloads grandes.
async function insertEmLotes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tabela: string,
  rows: Record<string, unknown>[],
  tamanhoLote = 500,
): Promise<string | undefined> {
  for (let i = 0; i < rows.length; i += tamanhoLote) {
    const lote = rows.slice(i, i + tamanhoLote)
    const { error } = await supabase.from(tabela).insert(lote)
    if (error) return `Falha ao gravar ${tabela}: ${error.message}`
  }
  return undefined
}
