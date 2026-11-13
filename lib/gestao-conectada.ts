import 'server-only'

import { createClient } from '@/lib/supabase/server'
import {
  custoPorInternacao,
  ehSaudeMentalGC,
  reinternacoes,
  type LancamentoTXT,
} from '@/lib/internacoes-cruzamento'

// Internações lidas no SulAmérica Gestão Conectada pelo coletor (tabela
// gc_manifestacoes). Diferente do TXT de contas pagas — que chega semanas
// depois e não traz data de internação nem de alta —, aqui está o que acontece
// AGORA: quem está internado, quem já teve alta, o que está em análise.

export type SituacaoInternacao =
  | 'internado'
  | 'alta'
  | 'aguardando'
  | 'em_analise'
  | 'negada'
  | 'cancelada'
  /** Internação antiga sem alta lançada no portal (comum em day hospital). */
  | 'sem_alta'
  /** Pedido antigo sem data de internação: a data prevista passou e o portal não o mostra mais. */
  | 'sem_registro'

export type ItemLista = Record<string, string>

/**
 * Anexo da manifestação (pedido médico, aviso de internação, laudo, receita,
 * orçamento de OPME…) lido pelo Claude no robô (tabela gc_documentos).
 * Dado clínico mais sensível do sistema: só telas internas e o chat — nunca
 * relatório para a empresa.
 */
export type DocumentoGC = {
  arquivo: string
  descricao: string | null
  recebidoEm: string | null
  tipoDocumento: string | null
  dataDocumento: string | null
  medico: string | null
  estabelecimento: string | null
  cids: { codigo: string; descricao: string | null }[]
  diagnostico: string | null
  quadroClinico: string | null
  conduta: string | null
  leito: string | null
  carater: string | null
  diariasPrevistas: number | null
  procedimentos: { codigo: string | null; descricao: string; quantidade: number | null }[]
  materiais: { descricao: string; quantidade: number | null }[]
  medicamentos: { nome: string; dose: string | null; posologia: string | null }[]
  exames: { exame: string; resultado: string }[]
  resumo: string | null
  transcricao: string | null
  legibilidade: string | null
  observacoes: string | null
  erro: string | null
}

export type InternacaoGC = {
  numero: string
  situacao: SituacaoInternacao
  statusPortal: string | null
  aberturaEm: string | null
  carteirinha: string | null
  beneficiarioNome: string | null
  tipoBeneficiario: string | null
  empresa: string | null
  /** Plano da carteirinha no portal (varredura semanal); null se ainda não lida. */
  plano: string | null
  idade: number | null
  prestador: string | null
  medico: string | null
  carater: string | null
  tipoInternacao: string | null
  regime: string | null
  acomodacao: string | null
  dataPrevista: string | null
  dataInternacao: string | null
  dataAlta: string | null
  /** Dias internado: até hoje (sem alta) ou até a alta. */
  dias: number | null
  diariasSolicitadas: number | null
  diariasAutorizadas: number | null
  hipoteseDiagnostica: string | null
  indicacaoClinica: string | null
  motivoNegativa: string | null
  procedimentos: ItemLista[]
  medicamentos: ItemLista[]
  relacionadas: ItemLista[]
  relatorios: string[]
  saudeMental: boolean
  /** Contas pagas no TXT ligadas a esta internação (null = ainda nenhuma). */
  custoPago: number | null
  lancamentosPagos: number
  competenciasPagamento: string[]
  /** Valor pago por competência (mês de pagamento do TXT). */
  custoPorCompetencia: Record<string, number>
  /** Nova internação até 30 dias após a alta anterior da mesma pessoa. */
  reinternacao: { anterior: string; diasDesdeAlta: number } | null
  /** Anexos lidos pelo Claude (relatório médico, laudo…). */
  documentos: DocumentoGC[]
  /** Motivo segundo os anexos: CID + diagnóstico (null se não houver anexo lido). */
  motivoMedico: string | null
}

/** Solicitação de saúde mental que não é internação (ex.: tratamento de TEA). */
export type SolicitacaoSaudeMentalGC = {
  numero: string
  tipoRegistro: string | null
  statusPortal: string | null
  aberturaEm: string | null
  carteirinha: string | null
  beneficiarioNome: string | null
  prestador: string | null
  indicacaoClinica: string | null
  procedimentos: ItemLista[]
}

export type StatusColetaGC = {
  status: string
  mensagem: string | null
  quando: string
} | null

const DIA_MS = 86_400_000

/** Hoje em São Paulo, 'AAAA-MM-DD'. */
export function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

const diasEntre = (de: string, ate: string) =>
  Math.max(0, Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS))

function idadeEm(nascimento: string | null, ref: string): number | null {
  if (!nascimento) return null
  const [a, m, d] = nascimento.slice(0, 10).split('-').map(Number)
  const [ra, rm, rd] = ref.split('-').map(Number)
  let idade = ra - a
  if (rm < m || (rm === m && rd < d)) idade--
  return idade >= 0 && idade < 130 ? idade : null
}

/** Leitura do relatório "fresca": o robô roda a cada 6 h, das 6h às 22h. */
const VISTO_RECENTE_MS = 30 * 3_600_000
/** Sem alta e sem aparecer nos relatórios: ainda internado só dentro das diárias + folga. */
const FOLGA_DIARIAS = 2
/** Pedido sem internação: "em andamento" até N dias depois da data prevista. */
const PEDIDO_EM_ABERTO_DIAS = 7

function situacaoDe(
  l: {
    status_portal: string | null
    data_internacao: string | null
    data_alta: string | null
    data_prevista?: string | null
    abertura_em?: string | null
    diarias_autorizadas?: number | null
    visto_em_relatorio_em?: string | null
  },
  hoje: string,
): SituacaoInternacao {
  const st = l.status_portal ?? ''
  if (/negad/i.test(st)) return 'negada'
  if (/cancel/i.test(st)) return 'cancelada'
  if (l.data_alta) return 'alta'
  // Evidência atual: apareceu nos relatórios do portal na leitura recente.
  const visto = l.visto_em_relatorio_em ? Date.now() - Date.parse(l.visto_em_relatorio_em) <= VISTO_RECENTE_MS : false
  if (l.data_internacao) {
    // "Internado agora" só se foi visto há pouco ou ainda está dentro das
    // diárias autorizadas. Sem isso é internação antiga cuja alta o hospital
    // nunca lançou.
    const dentroDasDiarias = diasEntre(l.data_internacao, hoje) <= Math.max(l.diarias_autorizadas ?? 1, 1) + FOLGA_DIARIAS
    return visto || dentroDasDiarias ? 'internado' : 'sem_alta'
  }
  // Pedido sem internação: "em andamento" só se o portal ainda o mostra ou se
  // a data prevista é recente. Pedido antigo autorizado e nunca internado
  // (ou que veio do histórico da varredura) não está em andamento.
  const ref = l.data_prevista ?? l.abertura_em?.slice(0, 10) ?? null
  if (!visto && ref && diasEntre(ref, hoje) > PEDIDO_EM_ABERTO_DIAS) return 'sem_registro'
  if (/autoriz/i.test(st)) return 'aguardando'
  return 'em_analise'
}

type Linha = {
  numero: string
  tipo_registro: string | null
  status_portal: string | null
  abertura_em: string | null
  carteirinha: string | null
  beneficiario_nome: string | null
  prestador_nome: string | null
  medico_nome: string | null
  carater: string | null
  tipo_internacao: string | null
  regime: string | null
  acomodacao: string | null
  data_prevista: string | null
  data_internacao: string | null
  data_alta: string | null
  tempo_internacao: number | null
  diarias_solicitadas: number | null
  diarias_autorizadas: number | null
  hipotese_diagnostica: string | null
  indicacao_clinica: string | null
  motivo_negativa: string | null
  procedimentos: ItemLista[] | null
  medicamentos: ItemLista[] | null
  relacionadas: ItemLista[] | null
  relatorios: string[] | null
  visto_em_relatorio_em: string | null
}

type Supabase = Awaited<ReturnType<typeof createClient>>

const COLUNAS_DOCUMENTO =
  'numero, arquivo, ordem, descricao, recebido_em, tipo_documento, data_documento, medico, estabelecimento, cids, diagnostico, quadro_clinico, conduta, leito, carater, diarias_previstas, procedimentos, materiais, medicamentos, exames, resumo, transcricao, legibilidade, observacoes, erro'

type LinhaDocumento = {
  numero: string
  arquivo: string
  ordem: number | null
  descricao: string | null
  recebido_em: string | null
  tipo_documento: string | null
  data_documento: string | null
  medico: string | null
  estabelecimento: string | null
  cids: DocumentoGC['cids'] | null
  diagnostico: string | null
  quadro_clinico: string | null
  conduta: string | null
  leito: string | null
  carater: string | null
  diarias_previstas: number | null
  procedimentos: DocumentoGC['procedimentos'] | null
  materiais: DocumentoGC['materiais'] | null
  medicamentos: DocumentoGC['medicamentos'] | null
  exames: DocumentoGC['exames'] | null
  resumo: string | null
  transcricao: string | null
  legibilidade: string | null
  observacoes: string | null
  erro: string | null
}

/**
 * Anexos lidos pelo Claude, por número de manifestação (na ordem do portal).
 * Arquivos repetidos (mesma leitura) aparecem uma vez só. Sem a tabela
 * (antes da Fase 4) devolve vazio.
 */
export async function documentosPorNumero(supabase: Supabase, numeros: string[]): Promise<Map<string, DocumentoGC[]>> {
  const res = new Map<string, DocumentoGC[]>()
  for (let i = 0; i < numeros.length; i += 300) {
    const { data, error } = await supabase
      .from('gc_documentos')
      .select(COLUNAS_DOCUMENTO)
      .in('numero', numeros.slice(i, i + 300))
      .order('ordem', { ascending: true })
    if (error) return res
    for (const d of (data ?? []) as LinhaDocumento[]) {
      const lista = res.get(d.numero) ?? []
      // O portal às vezes anexa o mesmo arquivo duas vezes.
      if (d.transcricao && lista.some((x) => x.transcricao === d.transcricao)) continue
      lista.push({
        arquivo: d.arquivo,
        descricao: d.descricao,
        recebidoEm: d.recebido_em,
        tipoDocumento: d.tipo_documento,
        dataDocumento: d.data_documento,
        medico: d.medico,
        estabelecimento: d.estabelecimento,
        cids: d.cids ?? [],
        diagnostico: d.diagnostico,
        quadroClinico: d.quadro_clinico,
        conduta: d.conduta,
        leito: d.leito,
        carater: d.carater,
        diariasPrevistas: d.diarias_previstas,
        procedimentos: d.procedimentos ?? [],
        materiais: d.materiais ?? [],
        medicamentos: d.medicamentos ?? [],
        exames: d.exames ?? [],
        resumo: d.resumo,
        transcricao: d.transcricao,
        legibilidade: d.legibilidade,
        observacoes: d.observacoes,
        erro: d.erro,
      })
      res.set(d.numero, lista)
    }
  }
  return res
}

/** "R50.9 — Febre refratária…" a partir do primeiro anexo com diagnóstico. */
export function motivoDosDocumentos(docs: DocumentoGC[]): string | null {
  const d = docs.find((x) => x.diagnostico || x.cids.length)
  if (!d) return null
  const cids = d.cids.map((c) => c.codigo).filter(Boolean).join(', ')
  return [cids, d.diagnostico].filter(Boolean).join(' — ') || null
}

/**
 * Internações do Gestão Conectada (só registros do tipo "Internação"), com o
 * cadastro da base de vidas (titular/dependente, empresa, idade) quando a
 * carteirinha bate. `disponivel` = false se a tabela ainda não existe.
 */
export async function getInternacoesGC(): Promise<{
  disponivel: boolean
  internacoes: InternacaoGC[]
  saudeMentalOutras: SolicitacaoSaudeMentalGC[]
  ultimaColeta: StatusColetaGC
  hoje: string
}> {
  const supabase = await createClient()
  const hoje = hojeSP()

  const [{ data, error }, { data: coletas }] = await Promise.all([
    supabase
      .from('gc_manifestacoes')
      .select(
        'numero, tipo_registro, status_portal, abertura_em, carteirinha, beneficiario_nome, prestador_nome, medico_nome, carater, tipo_internacao, regime, acomodacao, data_prevista, data_internacao, data_alta, tempo_internacao, diarias_solicitadas, diarias_autorizadas, hipotese_diagnostica, indicacao_clinica, motivo_negativa, procedimentos, medicamentos, relacionadas, relatorios, visto_em_relatorio_em',
      )
      .ilike('tipo_registro', 'interna%')
      .order('abertura_em', { ascending: false })
      .limit(2000),
    supabase
      .from('coletas_gestao_conectada')
      .select('status, mensagem, solicitado_em, concluido_em')
      .order('solicitado_em', { ascending: false })
      .limit(1),
  ])

  const c = coletas?.[0]
  const ultimaColeta: StatusColetaGC = c
    ? { status: c.status, mensagem: c.mensagem, quando: c.concluido_em ?? c.solicitado_em }
    : null

  if (error) return { disponivel: false, internacoes: [], saudeMentalOutras: [], ultimaColeta, hoje }
  const linhas = (data ?? []) as Linha[]

  // Saúde mental fora de internação (ex.: tratamento de TEA): só o que veio
  // dos relatórios psiquiátricos/TEA do portal.
  const { data: outras } = await supabase
    .from('gc_manifestacoes')
    .select('numero, tipo_registro, status_portal, abertura_em, carteirinha, beneficiario_nome, prestador_nome, indicacao_clinica, procedimentos, relatorios')
    .not('tipo_registro', 'ilike', 'interna%')
    .order('abertura_em', { ascending: false })
    .limit(500)
  const saudeMentalOutras: SolicitacaoSaudeMentalGC[] = ((outras ?? []) as (Pick<
    Linha,
    'numero' | 'tipo_registro' | 'status_portal' | 'abertura_em' | 'carteirinha' | 'beneficiario_nome' | 'prestador_nome' | 'indicacao_clinica' | 'procedimentos' | 'relatorios'
  >)[])
    .filter((o) => ehSaudeMentalGC({ relatorios: o.relatorios ?? [] }))
    .map((o) => ({
      numero: o.numero,
      tipoRegistro: o.tipo_registro,
      statusPortal: o.status_portal,
      aberturaEm: o.abertura_em,
      carteirinha: o.carteirinha,
      beneficiarioNome: o.beneficiario_nome,
      prestador: o.prestador_nome,
      indicacaoClinica: o.indicacao_clinica,
      procedimentos: o.procedimentos ?? [],
    }))

  // Cadastro na base de vidas — a competência mais recente de cada carteirinha.
  const carteirinhas = [...new Set(linhas.map((l) => l.carteirinha).filter((x): x is string => Boolean(x)))]
  const cadastro = new Map<string, { tipo: string | null; empresa: string | null; nascimento: string | null; competencia: string }>()
  let lancamentos: LancamentoTXT[] = []
  if (carteirinhas.length) {
    // Contas de internação pagas (TXT) dessas pessoas — para o custo de cada internação.
    const { data: ev } = await supabase
      .from('eventos_utilizacao')
      .select('cod_usuario, data_atendimento, valor_pago, competencia')
      .eq('internacao', true)
      .in('cod_usuario', carteirinhas)
      .limit(20000)
    lancamentos = ((ev ?? []) as { cod_usuario: string; data_atendimento: string | null; valor_pago: number | string | null; competencia: string | null }[])
      .map((e) => ({
        carteirinha: e.cod_usuario,
        dataAtendimento: e.data_atendimento,
        valorPago: Number(e.valor_pago ?? 0),
        competencia: e.competencia,
      }))

    const { data: vidas } = await supabase
      .from('beneficiario_vidas')
      .select('carteirinha, tipo, empresa, data_nascimento, competencia')
      .in('carteirinha', carteirinhas)
    for (const v of (vidas ?? []) as {
      carteirinha: string
      tipo: string | null
      empresa: string | null
      data_nascimento: string | null
      competencia: string
    }[]) {
      const atual = cadastro.get(v.carteirinha)
      if (!atual || v.competencia > atual.competencia) {
        cadastro.set(v.carteirinha, {
          tipo: v.tipo,
          empresa: v.empresa,
          nascimento: v.data_nascimento,
          competencia: v.competencia,
        })
      }
    }
  }

  // Negadas/canceladas não aconteceram: não recebem custo nem contam para reinternação.
  const [fichas, documentos] = await Promise.all([
    carteirinhasGC(supabase, carteirinhas),
    documentosPorNumero(supabase, linhas.map((l) => l.numero)),
  ])

  const base = linhas
    .filter((l) => !['negada', 'cancelada'].includes(situacaoDe(l, hoje)))
    .map((l) => ({
    numero: l.numero,
    carteirinha: l.carteirinha,
    dataInternacao: l.data_internacao,
    dataAlta: l.data_alta,
  }))
  const custos = custoPorInternacao(base, lancamentos)
  const reint = reinternacoes(base)

  const internacoes = linhas.map((l): InternacaoGC => {
    const situacao = situacaoDe(l, hoje)
    const cad = l.carteirinha ? cadastro.get(l.carteirinha) : undefined
    // Sem alta registrada: o "tempo de internação" do portal conta até hoje
    // e não significa nada — fica sem dias.
    const dias = l.data_internacao
      ? l.data_alta
        ? diasEntre(l.data_internacao, l.data_alta)
        : situacao === 'internado'
          ? diasEntre(l.data_internacao, hoje)
          : null
      : null
    return {
      numero: l.numero,
      situacao,
      statusPortal: l.status_portal,
      aberturaEm: l.abertura_em,
      carteirinha: l.carteirinha,
      beneficiarioNome: l.beneficiario_nome,
      tipoBeneficiario: cad?.tipo ?? null,
      empresa: cad?.empresa ?? (l.carteirinha ? fichas.get(l.carteirinha)?.codigoEmpresa : null) ?? null,
      plano: l.carteirinha ? (fichas.get(l.carteirinha)?.plano ?? null) : null,
      idade: idadeEm(cad?.nascimento ?? null, l.data_internacao ?? hoje),
      prestador: l.prestador_nome,
      medico: l.medico_nome,
      carater: l.carater,
      tipoInternacao: l.tipo_internacao,
      regime: l.regime,
      acomodacao: l.acomodacao,
      dataPrevista: l.data_prevista,
      dataInternacao: l.data_internacao,
      dataAlta: l.data_alta,
      dias,
      diariasSolicitadas: l.diarias_solicitadas,
      diariasAutorizadas: l.diarias_autorizadas,
      hipoteseDiagnostica: l.hipotese_diagnostica,
      indicacaoClinica: l.indicacao_clinica,
      motivoNegativa: l.motivo_negativa,
      procedimentos: l.procedimentos ?? [],
      medicamentos: l.medicamentos ?? [],
      relacionadas: l.relacionadas ?? [],
      relatorios: l.relatorios ?? [],
      saudeMental: ehSaudeMentalGC({
        relatorios: l.relatorios ?? [],
        indicacaoClinica: l.indicacao_clinica,
        hipoteseDiagnostica: l.hipotese_diagnostica,
        procedimentos: l.procedimentos ?? [],
      }),
      custoPago: custos.get(l.numero)?.valorPago ?? null,
      lancamentosPagos: custos.get(l.numero)?.lancamentos ?? 0,
      competenciasPagamento: custos.get(l.numero)?.competencias ?? [],
      custoPorCompetencia: custos.get(l.numero)?.porCompetencia ?? {},
      reinternacao: reint.get(l.numero)
        ? { anterior: reint.get(l.numero)!.anterior, diasDesdeAlta: reint.get(l.numero)!.diasDesdeAlta }
        : null,
      documentos: documentos.get(l.numero) ?? [],
      motivoMedico: motivoDosDocumentos(documentos.get(l.numero) ?? []),
    }
  })

  return { disponivel: true, internacoes, saudeMentalOutras, ultimaColeta, hoje }
}

// ---------------------------------------------------------------------------
// Fase 3 — autorizações (fora internação), fichas de carteirinha, histórico
// ---------------------------------------------------------------------------

export type CarteirinhaGC = {
  carteirinha: string | null
  plano: string | null
  codigoEmpresa: string | null
  nomeEmpresa: string | null
  vigente: boolean | null
  totalManifestacoes: string | null
  verificadoEm: string
}

type LinhaCarteirinha = {
  carteirinha: string | null
  plano: string | null
  codigo_empresa: string | null
  nome_empresa: string | null
  vigente: string | null
  total_manifestacoes: string | null
  verificado_em: string
}

// O portal mostra "Vigente" / "Fora vigência".
const vigenteDe = (v: string | null) =>
  v == null ? null : /fora|n[aã]o|false|cancel|inativ/i.test(v) ? false : /vigente|sim|true|ativ/i.test(v) ? true : null

function paraCarteirinha(l: LinhaCarteirinha): CarteirinhaGC {
  return {
    carteirinha: l.carteirinha,
    plano: l.plano,
    codigoEmpresa: l.codigo_empresa,
    nomeEmpresa: l.nome_empresa,
    vigente: vigenteDe(l.vigente),
    totalManifestacoes: l.total_manifestacoes,
    verificadoEm: l.verificado_em,
  }
}

/** Ficha do portal por carteirinha (16 dígitos); a vigente e mais recente vence. */
async function carteirinhasGC(
  supabase: Awaited<ReturnType<typeof createClient>>,
  carteirinhas: string[],
): Promise<Map<string, CarteirinhaGC>> {
  const res = new Map<string, CarteirinhaGC>()
  if (!carteirinhas.length) return res
  const { data, error } = await supabase
    .from('gc_beneficiarios')
    .select('carteirinha, plano, codigo_empresa, nome_empresa, vigente, total_manifestacoes, verificado_em')
    .in('carteirinha', carteirinhas)
  if (error) return res // tabela ainda não criada: segue sem plano
  for (const l of (data ?? []) as LinhaCarteirinha[]) {
    if (!l.carteirinha) continue
    const c = paraCarteirinha(l)
    const atual = res.get(l.carteirinha)
    if (!atual || (c.vigente && !atual.vigente) || (c.vigente === atual.vigente && c.verificadoEm > atual.verificadoEm)) {
      res.set(l.carteirinha, c)
    }
  }
  return res
}

export type AutorizacaoGC = {
  numero: string
  tipoRegistro: string | null
  statusPortal: string | null
  aberturaEm: string | null
  fechamentoEm: string | null
  carteirinha: string | null
  beneficiarioNome: string | null
  tipoBeneficiario: string | null
  empresa: string | null
  plano: string | null
  prestador: string | null
  medico: string | null
  carater: string | null
  indicacaoClinica: string | null
  motivoNegativa: string | null
  procedimentos: ItemLista[]
  medicamentos: ItemLista[]
  /** OPME: o material vem num campo próprio, não na lista de procedimentos. */
  material: string | null
  saudeMental: boolean
  documentos: DocumentoGC[]
  motivoMedico: string | null
}

/** Situação resumida de uma autorização (texto do portal varia). */
export function situacaoAutorizacao(status: string | null): 'autorizada' | 'negada' | 'cancelada' | 'em_analise' {
  const s = status ?? ''
  if (/negad/i.test(s)) return 'negada'
  if (/cancel/i.test(s)) return 'cancelada'
  if (/autoriz|liberad|aprovad/i.test(s)) return 'autorizada'
  return 'em_analise'
}

const COLUNAS_AUTORIZACAO =
  'numero, tipo_registro, status_portal, abertura_em, fechamento_em, carteirinha, beneficiario_nome, prestador_nome, medico_nome, carater, indicacao_clinica, hipotese_diagnostica, motivo_negativa, procedimentos, medicamentos, relatorios, campos'

type LinhaAutorizacao = {
  numero: string
  tipo_registro: string | null
  status_portal: string | null
  abertura_em: string | null
  fechamento_em: string | null
  carteirinha: string | null
  beneficiario_nome: string | null
  prestador_nome: string | null
  medico_nome: string | null
  carater: string | null
  indicacao_clinica: string | null
  hipotese_diagnostica: string | null
  motivo_negativa: string | null
  procedimentos: ItemLista[] | null
  medicamentos: ItemLista[] | null
  relatorios: string[] | null
  campos: Record<string, string> | null
}

/**
 * Autorizações que NÃO são internação (exames SP/SADT, prorrogação, OPME,
 * quimio/radio, terapias…), abertas a partir de `desde` ('AAAA-MM-DD').
 */
export async function getAutorizacoesGC(desde: string): Promise<AutorizacaoGC[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gc_manifestacoes')
    .select(COLUNAS_AUTORIZACAO)
    .not('tipo_registro', 'ilike', 'interna%')
    .gte('abertura_em', `${desde}T00:00:00-03:00`)
    .order('abertura_em', { ascending: false })
    .limit(3000)
  if (error) return []
  const linhas = (data ?? []) as LinhaAutorizacao[]
  const carteirinhas = [...new Set(linhas.map((l) => l.carteirinha).filter((x): x is string => Boolean(x)))]

  const [fichas, { data: vidas }, documentos] = await Promise.all([
    carteirinhasGC(supabase, carteirinhas),
    carteirinhas.length
      ? supabase.from('beneficiario_vidas').select('carteirinha, tipo, empresa, competencia').in('carteirinha', carteirinhas)
      : Promise.resolve({ data: [] as { carteirinha: string; tipo: string | null; empresa: string | null; competencia: string }[] }),
    documentosPorNumero(supabase, linhas.map((l) => l.numero)),
  ])
  const cad = new Map<string, { tipo: string | null; empresa: string | null; competencia: string }>()
  for (const v of (vidas ?? []) as { carteirinha: string; tipo: string | null; empresa: string | null; competencia: string }[]) {
    const a = cad.get(v.carteirinha)
    if (!a || v.competencia > a.competencia) cad.set(v.carteirinha, v)
  }

  return linhas.map((l) => {
    const f = l.carteirinha ? fichas.get(l.carteirinha) : undefined
    const c = l.carteirinha ? cad.get(l.carteirinha) : undefined
    return {
      numero: l.numero,
      tipoRegistro: l.tipo_registro,
      statusPortal: l.status_portal,
      aberturaEm: l.abertura_em,
      fechamentoEm: l.fechamento_em,
      carteirinha: l.carteirinha,
      beneficiarioNome: l.beneficiario_nome,
      tipoBeneficiario: c?.tipo ?? null,
      empresa: c?.empresa ?? f?.codigoEmpresa ?? null,
      plano: f?.plano ?? null,
      prestador: l.prestador_nome,
      medico: l.medico_nome,
      carater: l.carater,
      indicacaoClinica: l.indicacao_clinica,
      motivoNegativa: l.motivo_negativa,
      procedimentos: l.procedimentos ?? [],
      medicamentos: l.medicamentos ?? [],
      material: l.campos?.['Especificação do Material Solicitado'] ?? null,
      saudeMental: ehSaudeMentalGC({
        relatorios: l.relatorios ?? [],
        indicacaoClinica: l.indicacao_clinica,
        hipoteseDiagnostica: l.hipotese_diagnostica,
        procedimentos: l.procedimentos ?? [],
      }),
      documentos: documentos.get(l.numero) ?? [],
      motivoMedico: motivoDosDocumentos(documentos.get(l.numero) ?? []),
    }
  })
}

export type EventoHistoricoGC = {
  numero: string
  tipoRegistro: string | null
  statusPortal: string | null
  aberturaEm: string | null
  prestador: string | null
  dataInternacao: string | null
  dataAlta: string | null
  carater: string | null
  resumo: string
  /** Motivo segundo os anexos lidos (CID + diagnóstico). */
  motivoMedico: string | null
  documentos: DocumentoGC[]
}

/** Linha do tempo de uma pessoa no portal: tudo o que passou por autorização. */
export async function getHistoricoGC(carteirinha: string): Promise<{
  disponivel: boolean
  ficha: CarteirinhaGC | null
  eventos: EventoHistoricoGC[]
}> {
  const supabase = await createClient()
  const cart = carteirinha.replace(/\D/g, '').slice(0, 16)
  const [{ data, error }, fichas] = await Promise.all([
    supabase
      .from('gc_manifestacoes')
      .select('numero, tipo_registro, status_portal, abertura_em, prestador_nome, data_internacao, data_alta, carater, indicacao_clinica, procedimentos, campos')
      .eq('carteirinha', cart)
      .order('abertura_em', { ascending: false })
      .limit(500),
    carteirinhasGC(supabase, [cart]),
  ])
  if (error) return { disponivel: false, ficha: null, eventos: [] }
  const documentos = await documentosPorNumero(supabase, (data ?? []).map((l) => (l as { numero: string }).numero))
  const eventos = ((data ?? []) as {
    numero: string
    tipo_registro: string | null
    status_portal: string | null
    abertura_em: string | null
    prestador_nome: string | null
    data_internacao: string | null
    data_alta: string | null
    carater: string | null
    indicacao_clinica: string | null
    procedimentos: ItemLista[] | null
    campos: Record<string, string> | null
  }[]).map((l) => {
    const procs = (l.procedimentos ?? []).map((p) => p['Descrição'] ?? p['Descricao'] ?? '').filter(Boolean)
    const material = l.campos?.['Especificação do Material Solicitado']
    if (!procs.length && material) procs.push(material)
    return {
      numero: l.numero,
      tipoRegistro: l.tipo_registro,
      statusPortal: l.status_portal,
      aberturaEm: l.abertura_em,
      prestador: l.prestador_nome,
      dataInternacao: l.data_internacao,
      dataAlta: l.data_alta,
      carater: l.carater,
      resumo:
        [procs.slice(0, 3).join('; ') + (procs.length > 3 ? '…' : ''), l.indicacao_clinica]
          .filter(Boolean)
          .join(' · ') || '—',
      motivoMedico: motivoDosDocumentos(documentos.get(l.numero) ?? []),
      documentos: documentos.get(l.numero) ?? [],
    }
  })
  return { disponivel: true, ficha: fichas.get(cart) ?? null, eventos }
}
