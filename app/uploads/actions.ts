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

/**
 * Arquivo TXT baixado do portal SulAmérica Integra pelo coletor automático
 * (serviço winners-health-intelligence-coletor-sulamerica). O coletor só
 * BAIXA: processar e confirmar a importação continua sendo ação do usuário.
 */
export type ColetaSulAmerica = {
  id: string
  competencia: string
  /**
   * aguardando — o mês não estava na lista do portal; o coletor fez a Nova
   * Solicitação e volta a conferir em `proxima_tentativa_em` (~70 min).
   */
  status: 'pendente' | 'executando' | 'aguardando' | 'pronto' | 'importado' | 'erro'
  origem: 'manual' | 'agendado'
  arquivo_nome: string | null
  arquivo_path: string | null
  tamanho: number | null
  mensagem: string | null
  importacao_id: string | null
  proxima_tentativa_em: string | null
  solicitado_em: string
  concluido_em: string | null
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

  return registrarPrevia(supabase, {
    clienteId,
    clienteNome,
    parsed,
    arquivoNome: file.name,
    arquivoPath: path,
    tamanho: file.size,
  })
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

/**
 * Grava a importação como "pendente" e devolve a prévia. Comum ao upload
 * manual e ao arquivo baixado pelo coletor — os dois seguem exatamente o
 * mesmo fluxo de prévia e confirmação de competência.
 */
async function registrarPrevia(
  supabase: SupabaseServer,
  args: {
    clienteId: string
    clienteNome: string
    parsed: ParseResult
    arquivoNome: string
    arquivoPath: string
    tamanho: number
  },
): Promise<PreviewResult> {
  const { clienteId, clienteNome, parsed, arquivoNome, tamanho } = args
  const path = args.arquivoPath

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
      arquivo_nome: arquivoNome,
      arquivo_path: path,
      tamanho,
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

  // Se a importação veio de um arquivo do coletor, a coleta sai da fila de
  // "pronto para importação". Erro aqui não desfaz a importação confirmada.
  await supabase
    .from('coletas_sulamerica')
    .update({ status: 'importado' })
    .eq('importacao_id', imp.id)

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

/** Competência do mês anterior ao de hoje (fuso de São Paulo): out/26 → 2026-09. */
function competenciaMesAnterior(agora = new Date()): string {
  const [ano, mes] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(agora)
    .split('-')
    .map(Number)
  const a = mes === 1 ? ano - 1 : ano
  const m = mes === 1 ? 12 : mes - 1
  return `${a}-${String(m).padStart(2, '0')}`
}

/**
 * Pede ao coletor que busque agora o TXT do mês anterior no portal da
 * SulAmérica. Só registra o pedido: o coletor confere a fila a cada 30 s,
 * faz o login, lê o token no e-mail e deixa o arquivo pronto.
 */
export async function solicitarBuscaSulAmerica(): Promise<{
  ok: boolean
  competencia?: string
  error?: string
}> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { ok: false, error: auth.error }

  const supabase = await createClient()
  const competencia = competenciaMesAnterior()

  const { data: emAndamento } = await supabase
    .from('coletas_sulamerica')
    .select('id')
    .in('status', ['pendente', 'executando', 'aguardando'])
    .limit(1)
  if (emAndamento && emAndamento.length > 0) {
    return { ok: false, error: 'Já existe uma busca em andamento. Aguarde a conclusão.' }
  }

  const { error } = await supabase
    .from('coletas_sulamerica')
    .insert({ competencia, origem: 'manual', status: 'pendente' })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/uploads')
  return { ok: true, competencia }
}

/**
 * Processa o arquivo baixado pelo coletor exatamente como um upload manual:
 * gera a prévia e espera o usuário confirmar a competência. Trabalha sobre
 * uma CÓPIA do arquivo — cancelar a importação apaga o arquivo dela, e o
 * original baixado pelo coletor precisa continuar disponível.
 */
export async function processarArquivoColetado(
  coletaId: string,
  clienteId: string,
  clienteNome: string,
): Promise<PreviewResult> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { error: auth.error }
  if (!clienteId) return { error: 'Selecione um cliente.' }

  const supabase = await createClient()
  const { data: coleta } = await supabase
    .from('coletas_sulamerica')
    .select('id, status, arquivo_path, arquivo_nome')
    .eq('id', coletaId)
    .maybeSingle()
  if (!coleta || coleta.status !== 'pronto' || !coleta.arquivo_path) {
    return { error: 'Arquivo não está disponível para importação.' }
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(coleta.arquivo_path)
  if (dlErr || !blob) {
    return { error: `Não foi possível abrir o arquivo: ${dlErr?.message ?? 'vazio'}` }
  }

  const content = await blob.text()
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

  const nome = coleta.arquivo_nome ?? 'sulamerica.txt'
  const path = `${clienteId}/${Date.now()}-${nome.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error: cpErr } = await supabase.storage
    .from(BUCKET)
    .copy(coleta.arquivo_path, path)
  if (cpErr) return { error: `Falha ao preparar o arquivo: ${cpErr.message}` }

  const previa = await registrarPrevia(supabase, {
    clienteId,
    clienteNome,
    parsed,
    arquivoNome: nome,
    arquivoPath: path,
    tamanho: blob.size,
  })
  if (previa.importacaoId) {
    await supabase
      .from('coletas_sulamerica')
      .update({ importacao_id: previa.importacaoId })
      .eq('id', coleta.id)
  }
  return previa
}
