// Classificação gerencial dos eventos de utilização da SulAmérica.
//
// O TXT só traz "categoria_atendimento" como AMBULATORIAL / INTERNADO-* e os
// detalhes em servico_principal / servico. Aqui derivamos categorias
// gerenciais (Internações, Consultas, Exames, Pronto-Socorro, Procedimentos,
// Terapias, Saúde Mental, Maternidade/Pré-Natal, Medicamentos, Materiais,
// Taxas Hospitalares, Demais) preservando a nomenclatura original do TXT.

export const CATEGORIAS_GERENCIAIS = [
  'Internações',
  'Consultas',
  'Exames',
  'Pronto-Socorro',
  'Procedimentos',
  'Terapias',
  'Saúde Mental',
  'Maternidade / Pré-Natal',
  'Medicamentos',
  'Materiais',
  'Taxas Hospitalares',
  'Demais Utilizações',
] as const

export type CategoriaGerencial = (typeof CATEGORIAS_GERENCIAIS)[number]

const MESES_FMT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

// "2025-05" -> "Mai/2025" (helper puro, seguro para client components)
export function formatCompetencia(value: string | null): string {
  if (!value) return '—'
  const m = value.match(/^(\d{4})-(\d{2})$/)
  if (!m) return value
  return `${MESES_FMT[Number(m[2]) - 1]}/${m[1]}`
}

// "2025-05" -> "Mai/25" (helper puro, seguro para client components)
export function mesCurto(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})$/)
  if (!m) return value
  return `${MESES_FMT[Number(m[2]) - 1]}/${m[1].slice(2)}`
}

// slug estável para usar em URLs de drill-down
export function categoriaSlug(c: string): string {
  return c
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function categoriaFromSlug(slug: string): CategoriaGerencial | null {
  return (
    CATEGORIAS_GERENCIAIS.find((c) => categoriaSlug(c) === slug) ?? null
  )
}

type ClassificavelInput = {
  servicoPrincipal?: string | null
  servico?: string | null
  grupoEstatistico?: string | null
  categoriaAtendimento?: string | null
  internacao?: boolean | null
  saudeMental?: boolean | null
}

const RE_SAUDE_MENTAL =
  /PSIC[OÓ]|PSIQUIATR|PSICOTERAPIA|SA[UÚ]DE MENTAL|TERAPEUTA OCUPACION|NEUROPSIC/i
const RE_MATERNIDADE =
  /PART[O]|PRE.?NATAL|PR[EÉ].?NATAL|OBSTETR|CESAR|GESTA|GESTAC|PUERP|\bDIU\b|MATERNIDADE/i
const RE_PRONTO_SOCORRO = /P\.?\s?A\b|PRONTO.?SOCORRO|PRONTO.?ATEND|\bPS\b|URGENC|EMERGENC/i
const RE_CONSULTA = /CONSULTA|TELECONSULTA|ATEND.*AMBULAT/i
const RE_EXAME =
  /\bRX\b|RAIO.?X|\bUS\b|ULTRASSON|TOMOGRAF|RESSON|\bECG\b|ELETROCARDIO|ENDOSCOP|COLONOSCOP|DOPPLER|ANALISES?\s+CLINIC|LABORAT|BIOPSIA|MAMOGRAF|DENSITOMETR|EXAME|HOLTER|MAPA|ECOCARDIO|ESPIROMETR|CITOLOG|HEMOGRAMA|SOROLOG|CULTURA/i
const RE_TERAPIA =
  /FISIOTERAP|\bTERAPIA\b|SESS[AÃ]O|FONOAUDIOL|\bRPG\b|REABILITAC|ACUPUNTUR|NUTRIC|HIDROTERAP/i
const RE_MEDICAMENTO =
  /MEDICAMENT|QUIMIOTERAP|IMUNOBIOLOG|IMUNOTERAP|VACINA|FARMAC|INFUS[AÃ]O.*MEDICAMENT/i
const RE_MATERIAL = /\bMATERIAL|\bOPME\b|PR[OÓ]TESE|[OÓ]RTESE|\bSTENT\b|IMPLANTE/i
const RE_TAXA =
  /\bTAXA|DI[AÁ]RIA|ENFERMARIA\/DAY|DAY.?HOSPITAL|GASES\s+MEDIC|HONOR[AÁ]RIO|SADT|PACOTE.*INTERNAC/i
const RE_PROCEDIMENTO =
  /CIRURG|PROCEDIMENT|ANGIOPL|TROMBECTOMIA|FASCIOTOMIA|COLECISTECT|RESSEC|EXERESE|BIOPSIA.*CIR|TRANSPLANT|CATETERISMO|HEMODIALISE|DIALISE|ARTROSCOP|VIDEOLAPAROSCOP/i

// Subcategoria de Saúde Mental
export function subcategoriaSaudeMental(texto: string): string {
  const t = (texto || '').toUpperCase()
  if (/PSICOTERAPIA/.test(t)) return 'Psicoterapia'
  if (/NEUROPSIC/.test(t)) return 'Neuropsicologia'
  if (/PSIQUIATR/.test(t)) return 'Psiquiatria'
  if (/PSIC[OÓ]L/.test(t)) return 'Psicologia'
  return 'Terapias correlatas'
}

// Distingue atendimento com psiquiatra (médico) de psicólogo/terapia para o
// ranking de utilização em saúde mental.
export function ehPsiquiatria(texto: string): boolean {
  return /PSIQUIATR/i.test(texto || '')
}

// ---------------------------------------------------------------------------
// Índice de Atenção em Saúde Mental.
//
// IMPORTANTE: NÃO é diagnóstico clínico. É apenas um indicador de FREQUÊNCIA de
// utilização (nº de atendimentos de saúde mental por beneficiário no período),
// usado para priorizar acompanhamento — nunca para inferir gravidade clínica.
// ---------------------------------------------------------------------------
export type NivelAtencaoSM = 'Baixo' | 'Moderado' | 'Alto' | 'Crítico'

export const FAIXAS_ATENCAO_SM: {
  nivel: NivelAtencaoSM
  min: number
  max: number | null
  descricao: string
}[] = [
  { nivel: 'Baixo', min: 0, max: 4, descricao: 'até 4 utilizações' },
  { nivel: 'Moderado', min: 5, max: 12, descricao: '5 a 12 utilizações' },
  { nivel: 'Alto', min: 13, max: 24, descricao: '13 a 24 utilizações' },
  { nivel: 'Crítico', min: 25, max: null, descricao: 'acima de 24 utilizações' },
]

export function indiceAtencaoSaudeMental(totalUtilizacoes: number): NivelAtencaoSM {
  if (totalUtilizacoes > 24) return 'Crítico'
  if (totalUtilizacoes >= 13) return 'Alto'
  if (totalUtilizacoes >= 5) return 'Moderado'
  return 'Baixo'
}

// ---------------------------------------------------------------------------
// Categorização DINÂMICA (sem lista fixa e sem agrupar em "Outros").
//
// Lê diretamente os campos do TXT da SulAmérica e usa o rótulo REAL presente no
// arquivo. A categoria principal é o "serviço principal" (DSC_SERVICO_PRINCIPAL);
// a subcategoria é o "serviço" detalhado (DSC_SERVICO). Quando um campo está
// vazio, cai para o próximo campo legível para que NENHUM evento fique sem
// classificação — nunca há balde genérico "Outros".
// ---------------------------------------------------------------------------

const SEM_CLASSIFICACAO = 'Não informado'

// Categoria principal do evento (rótulo real do arquivo, sem transformação).
export function categoriaDinamica(e: ClassificavelInput): string {
  const v = (
    e.servicoPrincipal ||
    e.servico ||
    e.categoriaAtendimento ||
    ''
  ).trim()
  return v || SEM_CLASSIFICACAO
}

// Subcategoria (serviço detalhado) do evento.
export function subcategoriaDinamica(e: ClassificavelInput): string {
  const v = (
    e.servico ||
    e.servicoPrincipal ||
    e.categoriaAtendimento ||
    ''
  ).trim()
  return v || SEM_CLASSIFICACAO
}

export function classificarEvento(e: ClassificavelInput): CategoriaGerencial {
  const texto = [e.servicoPrincipal, e.servico, e.grupoEstatistico]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()

  if (e.saudeMental || RE_SAUDE_MENTAL.test(texto)) return 'Saúde Mental'
  if (RE_MATERNIDADE.test(texto)) return 'Maternidade / Pré-Natal'
  if (RE_PRONTO_SOCORRO.test(texto)) return 'Pronto-Socorro'
  if (e.internacao) return 'Internações'
  if (RE_CONSULTA.test(texto)) return 'Consultas'
  if (RE_EXAME.test(texto)) return 'Exames'
  if (RE_TERAPIA.test(texto)) return 'Terapias'
  if (RE_MEDICAMENTO.test(texto)) return 'Medicamentos'
  if (RE_MATERIAL.test(texto)) return 'Materiais'
  if (RE_TAXA.test(texto)) return 'Taxas Hospitalares'
  if (RE_PROCEDIMENTO.test(texto)) return 'Procedimentos'
  return 'Demais Utilizações'
}
