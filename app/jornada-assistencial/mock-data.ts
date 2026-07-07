// Tipos e utilitários da Jornada Assistencial — Winners Health Intelligence.
// Os dados são derivados dos eventos de utilização reais (ver adapter.ts);
// este módulo mantém apenas os contratos de view-model e o formatador de moeda.

// Moeda com centavos (a referência exibe valores como "R$ 48.732,10").
export const formatBRL2 = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

export type Risco = 'Crítico' | 'Alto' | 'Moderado' | 'Baixo'

export type TipoEvento =
  | 'Consulta'
  | 'Exame'
  | 'Pronto Socorro'
  | 'Internação'
  | 'Alta'
  | 'Reinternação'
  | 'Retorno'

export type EventoJornada = {
  data: string
  tipo: TipoEvento
  titulo: string
  descricao: string
  prestador: string
  valor: number
  detalhe?: string
  destaque?: 'internacao' | 'reinternacao' | 'alto-custo'
}

export type PontoCusto = { mes: string; valor: number }

export type CategoriaCusto = {
  nome: string
  pct: number
  valor: number
  cor: string
}

// Item leve da lista de beneficiários (deriva do score canônico do Radar).
export type BeneficiarioResumo = {
  id: string
  nome: string
  iniciais: string
  carteirinha: string
  risco: Risco
  custo: number
  eventos: number
  score: number
}

// KPIs superiores da carteira.
export type JornadaKpis = {
  total: number
  criticas: number
  reinternacoes: number
  altoCusto: number
  crescimento: number
}

export type Beneficiario = {
  id: string
  nome: string
  iniciais: string
  carteirinha: string
  risco: Risco
  custo: number
  eventos: number
  sexo: string
  idade: number
  plano: string
  tipo: string
  score: number
  impactoFinanceiro: number
  pctCarteira: number
  primeiroEvento: string
  primeiroEventoHa: string
  ultimoEvento: string
  ultimoEventoHa: string
  totalEventos: number
  prestadoresUtilizados: number
  timeline: EventoJornada[]
  evolucaoCustos: PontoCusto[]
  categorias: CategoriaCusto[]
  sinais: string[]
  narrativa: string
  fatoresRisco: string[]
  prestadores: { nome: string; atendimentos: number; valor: number }[]
}
