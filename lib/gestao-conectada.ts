import 'server-only'

import { createClient } from '@/lib/supabase/server'

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
}

/**
 * Internações do Gestão Conectada (só registros do tipo "Internação"), com o
 * cadastro da base de vidas (titular/dependente, empresa, idade) quando a
 * carteirinha bate. `disponivel` = false se a tabela ainda não existe.
 */
export async function getInternacoesGC(): Promise<{
  disponivel: boolean
  internacoes: InternacaoGC[]
  ultimaColeta: StatusColetaGC
  hoje: string
}> {
  const supabase = await createClient()
  const hoje = hojeSP()

  const [{ data, error }, { data: coletas }] = await Promise.all([
    supabase
      .from('gc_manifestacoes')
      .select(
        'numero, tipo_registro, status_portal, abertura_em, carteirinha, beneficiario_nome, prestador_nome, medico_nome, carater, tipo_internacao, regime, acomodacao, data_prevista, data_internacao, data_alta, tempo_internacao, diarias_solicitadas, diarias_autorizadas, hipotese_diagnostica, indicacao_clinica, motivo_negativa, procedimentos, medicamentos, relacionadas',
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

  if (error) return { disponivel: false, internacoes: [], ultimaColeta, hoje }
  const linhas = (data ?? []) as Linha[]

  // Cadastro na base de vidas — a competência mais recente de cada carteirinha.
  const carteirinhas = [...new Set(linhas.map((l) => l.carteirinha).filter((x): x is string => Boolean(x)))]
  const cadastro = new Map<string, { tipo: string | null; empresa: string | null; nascimento: string | null; competencia: string }>()
  if (carteirinhas.length) {
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
    }
  })

  return { disponivel: true, internacoes, ultimaColeta, hoje }
}
