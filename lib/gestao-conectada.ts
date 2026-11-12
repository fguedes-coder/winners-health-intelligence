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

export type ItemLista = Record<string, string>

export type InternacaoGC = {
  numero: string
  situacao: SituacaoInternacao
  statusPortal: string | null
  aberturaEm: string | null
  carteirinha: string | null
  beneficiarioNome: string | null
  tipoBeneficiario: string | null
  empresa: string | null
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

function situacaoDe(l: {
  status_portal: string | null
  data_internacao: string | null
  data_alta: string | null
}): SituacaoInternacao {
  const st = l.status_portal ?? ''
  if (/negad/i.test(st)) return 'negada'
  if (/cancel/i.test(st)) return 'cancelada'
  if (l.data_alta) return 'alta'
  if (l.data_internacao) return 'internado'
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
        'numero, tipo_registro, status_portal, abertura_em, carteirinha, beneficiario_nome, prestador_nome, medico_nome, carater, tipo_internacao, regime, acomodacao, data_prevista, data_internacao, data_alta, tempo_internacao, diarias_solicitadas, diarias_autorizadas, hipotese_diagnostica, indicacao_clinica, motivo_negativa, procedimentos, medicamentos, relacionadas, relatorios',
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
  const base = linhas
    .filter((l) => !['negada', 'cancelada'].includes(situacaoDe(l)))
    .map((l) => ({
    numero: l.numero,
    carteirinha: l.carteirinha,
    dataInternacao: l.data_internacao,
    dataAlta: l.data_alta,
  }))
  const custos = custoPorInternacao(base, lancamentos)
  const reint = reinternacoes(base)

  const internacoes = linhas.map((l): InternacaoGC => {
    const situacao = situacaoDe(l)
    const cad = l.carteirinha ? cadastro.get(l.carteirinha) : undefined
    const dias = l.data_internacao
      ? l.data_alta
        ? diasEntre(l.data_internacao, l.data_alta)
        : situacao === 'internado'
          ? diasEntre(l.data_internacao, hoje)
          : l.tempo_internacao
      : null
    return {
      numero: l.numero,
      situacao,
      statusPortal: l.status_portal,
      aberturaEm: l.abertura_em,
      carteirinha: l.carteirinha,
      beneficiarioNome: l.beneficiario_nome,
      tipoBeneficiario: cad?.tipo ?? null,
      empresa: cad?.empresa ?? null,
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
    }
  })

  return { disponivel: true, internacoes, saudeMentalOutras, ultimaColeta, hoje }
}
