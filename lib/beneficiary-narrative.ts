// ===========================================================================
// Narrativa Assistencial do Beneficiário — Winners Decide IA (contextual)
//
// Evolui o Winners Decide IA da análise agregada da carteira para uma leitura
// CONTEXTUAL de um único beneficiário. A partir do Panorama já calculado
// (server-safe), monta um payload anonimizado que descreve a JORNADA de
// utilização — sequência temporal, procedimentos recorrentes, concentração por
// prestador, evolução de custo, padrões de utilização, continuidade de
// tratamento, internações repetidas e itens de alto custo — e define o prompt
// clínico-assistencial + financeiro que a IA usa para narrar o caso.
//
// Módulo puro (sem Supabase, sem client-only): o payload é montado no cliente a
// partir do Panorama e enviado à rota de IA. Nunca envia nome nem carteirinha.
// A IA NÃO faz diagnóstico médico — interpreta frequência/custo de utilização.
// ===========================================================================

import { LIMIARES } from '@/lib/risco'
import type { PanoramaBeneficiario } from '@/lib/beneficiary-panorama'
import { formatBRL } from '@/lib/data'

// ---------------------------------------------------------------------------
// Tipos do payload contextual
// ---------------------------------------------------------------------------

export type ProcedimentoRecorrente = {
  procedimento: string
  ocorrencias: number
  competencias_distintas: number
  valor_total: number
}

export type ItemAltoCusto = {
  procedimento: string
  categoria: string
  prestador: string | null
  competencia: string | null
  valor: number
}

export type EventoJornada = {
  competencia: string | null
  data: string | null
  grupo: string
  procedimento: string
  prestador: string | null
  valor: number
  internacao: boolean
}

export type PayloadBeneficiario = {
  // Identificação estritamente anonimizada (nunca nome/carteirinha).
  identificador: string
  tipo: string
  faixa_etaria: string | null
  sexo: string | null
  plano: string | null

  // Indicadores-síntese (contexto, não repetir na narrativa como lista).
  score_risco: number
  faixa_risco: string
  valor_total: number
  eventos_total: number
  participacao_custo_carteira_pct: number
  competencias_ativas: number
  periodo: string | null

  // 1. Sequência temporal — evolução mês a mês e eventos-chave ordenados.
  evolucao_mensal: {
    competencia: string
    eventos: number
    valor: number
    variacao_pct: number | null
  }[]
  eventos_relevantes: EventoJornada[]

  // 2. Procedimentos recorrentes.
  procedimentos_recorrentes: ProcedimentoRecorrente[]

  // 3. Concentração por prestador.
  prestadores: {
    prestador: string
    eventos: number
    valor: number
    participacao_pct: number
  }[]
  concentracao_prestador_top1_pct: number

  // 4. Evolução dos custos.
  crescimento_custo: {
    primeira_competencia_valor: number
    ultima_competencia_valor: number
    variacao_pct: number | null
    tendencia: 'crescente' | 'estavel' | 'decrescente'
  }

  // 5. Padrões de utilização (composição por tipo).
  perfil_utilizacao: {
    grupo: string
    eventos: number
    pct_eventos: number
    valor: number
    pct_valor: number
  }[]

  // 6. Continuidade de tratamento.
  continuidade: {
    procedimentos_multi_competencia: number
    prestadores_recorrentes: number
    tratamento_continuo: boolean
    descricao: string
  }

  // 7. Internações repetidas.
  internacoes: {
    total: number
    competencias_com_internacao: number
    reinternacao: boolean
    competencias: string[]
  }

  // 8. Materiais e medicamentos de alto custo.
  alto_custo: {
    itens: ItemAltoCusto[]
    total_valor: number
    pct_do_custo: number
  }

  // Saúde mental (frente preventiva — nunca diagnóstico).
  saude_mental: {
    utilizacoes: number
    valor: number
    nivel: string
    psiquiatria_eventos: number
    psicoterapia_eventos: number
  }

  // Fatores de risco determinísticos (ancoragem de evidência).
  fatores_risco: { fator: string; pontos: number }[]

  // Classificação OFICIAL de Risco Assistencial Futuro (fonte única da verdade).
  // Calculada deterministicamente e consumida SEM recálculo pelo card visual,
  // pela narrativa da IA e pelo fallback determinístico.
  risco_assistencial_futuro: {
    nivel: NivelRiscoFuturo
    motivos: string[]
  }
}

// ---------------------------------------------------------------------------
// Montagem do payload a partir do Panorama (executa no cliente)
// ---------------------------------------------------------------------------

function variacaoPct(anterior: number, atual: number): number | null {
  if (anterior <= 0) return null
  return ((atual / anterior - 1) * 100)
}

export function montarPayloadBeneficiario(
  p: PanoramaBeneficiario,
): PayloadBeneficiario {
  const k = p.kpis

  // Achata todos os atendimentos dos grupos e ordena cronologicamente.
  const todos = p.grupos
    .flatMap((g) => g.atendimentos)
    .slice()
    .sort((a, b) =>
      (a.data ?? a.competencia ?? '').localeCompare(
        b.data ?? b.competencia ?? '',
      ),
    )

  // 1. Sequência temporal — evolução mensal com variação vs. mês anterior.
  const evolucao_mensal = p.timeline.map((t, i) => ({
    competencia: t.competencia,
    eventos: t.eventos,
    valor: t.valor,
    variacao_pct:
      i > 0 ? variacaoPct(p.timeline[i - 1].valor, t.valor) : null,
  }))

  // Eventos relevantes: internações + os de maior valor (até 12), ordenados.
  const relevantesSet = new Map<string, EventoJornada>()
  for (const a of todos) {
    if (a.internacao) {
      relevantesSet.set(a.id, {
        competencia: a.competencia,
        data: a.data,
        grupo: a.grupo,
        procedimento: a.procedimento,
        prestador: a.prestador,
        valor: a.valor,
        internacao: true,
      })
    }
  }
  const porValor = todos
    .slice()
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 12)
  for (const a of porValor) {
    if (!relevantesSet.has(a.id)) {
      relevantesSet.set(a.id, {
        competencia: a.competencia,
        data: a.data,
        grupo: a.grupo,
        procedimento: a.procedimento,
        prestador: a.prestador,
        valor: a.valor,
        internacao: a.internacao,
      })
    }
  }
  const eventos_relevantes = [...relevantesSet.values()].sort((a, b) =>
    (a.data ?? a.competencia ?? '').localeCompare(
      b.data ?? b.competencia ?? '',
    ),
  )

  // 2. Procedimentos recorrentes (>= 2 ocorrências).
  const procMap = new Map<
    string,
    { ocorrencias: number; comps: Set<string>; valor: number }
  >()
  for (const a of todos) {
    const chave = a.procedimento
    const cur = procMap.get(chave) ?? {
      ocorrencias: 0,
      comps: new Set<string>(),
      valor: 0,
    }
    cur.ocorrencias++
    if (a.competencia) cur.comps.add(a.competencia)
    cur.valor += a.valor
    procMap.set(chave, cur)
  }
  const procedimentos_recorrentes: ProcedimentoRecorrente[] = [
    ...procMap.entries(),
  ]
    .filter(([, v]) => v.ocorrencias >= 2)
    .map(([procedimento, v]) => ({
      procedimento,
      ocorrencias: v.ocorrencias,
      competencias_distintas: v.comps.size,
      valor_total: v.valor,
    }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
    .slice(0, 10)

  // 3. Concentração por prestador (reusa o ranking do panorama).
  const prestadores = p.prestadores.map((pr) => ({
    prestador: pr.nome,
    eventos: pr.eventos,
    valor: pr.valor,
    participacao_pct: pr.participacaoPct,
  }))
  const concentracao_prestador_top1_pct = prestadores[0]?.participacao_pct ?? 0

  // 4. Evolução dos custos.
  const primeiro = p.timeline[0]?.valor ?? 0
  const ultimo = p.timeline[p.timeline.length - 1]?.valor ?? 0
  const varCusto = variacaoPct(primeiro, ultimo)
  const crescimento_custo = {
    primeira_competencia_valor: primeiro,
    ultima_competencia_valor: ultimo,
    variacao_pct: varCusto,
    tendencia:
      varCusto === null
        ? ('estavel' as const)
        : varCusto > 15
          ? ('crescente' as const)
          : varCusto < -15
            ? ('decrescente' as const)
            : ('estavel' as const),
  }

  // 5. Padrões de utilização.
  const perfil_utilizacao = p.perfilUtilizacao.map((u) => ({
    grupo: u.grupo,
    eventos: u.eventos,
    pct_eventos: u.pctEventos,
    valor: u.valor,
    pct_valor: u.pctValor,
  }))

  // 6. Continuidade de tratamento.
  const procMultiComp = procedimentos_recorrentes.filter(
    (r) => r.competencias_distintas >= 2,
  ).length
  const prestadoresRecorrentes = p.prestadores.filter(
    (pr) => pr.eventos >= 2,
  ).length
  const tratamento_continuo = procMultiComp > 0 || prestadoresRecorrentes > 0
  const continuidade = {
    procedimentos_multi_competencia: procMultiComp,
    prestadores_recorrentes: prestadoresRecorrentes,
    tratamento_continuo,
    descricao: tratamento_continuo
      ? `${procMultiComp} procedimento(s) recorrente(s) ao longo de múltiplas competências e ${prestadoresRecorrentes} prestador(es) utilizado(s) de forma repetida — indícios de tratamento em andamento.`
      : 'Não há sinais claros de tratamento continuado; utilização predominantemente pontual.',
  }

  // 7. Internações repetidas.
  const compsInternacao = new Set<string>()
  for (const a of todos) {
    if (a.internacao && a.competencia) compsInternacao.add(a.competencia)
  }
  const internacoes = {
    total: k.internacoes,
    competencias_com_internacao: compsInternacao.size,
    reinternacao: k.internacoes >= 2,
    competencias: [...compsInternacao].sort(),
  }

  // 8. Materiais e medicamentos de alto custo.
  const itensAlto: ItemAltoCusto[] = todos
    .filter((a) => {
      if (a.categoria === 'Medicamentos')
        return a.valor >= LIMIARES.medicamentoAltoCusto
      if (a.categoria === 'Procedimentos')
        return a.valor >= LIMIARES.procedimentoAltoCusto
      return false
    })
    .map((a) => ({
      procedimento: a.procedimento,
      categoria: a.categoria,
      prestador: a.prestador,
      competencia: a.competencia,
      valor: a.valor,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)
  const totalAlto = itensAlto.reduce((s, i) => s + i.valor, 0)
  const alto_custo = {
    itens: itensAlto,
    total_valor: totalAlto,
    pct_do_custo: k.valorTotal > 0 ? (totalAlto / k.valorTotal) * 100 : 0,
  }

  // Saúde mental.
  const smd = p.saudeMentalDetalhe
  const saude_mental = {
    utilizacoes: smd.total,
    valor: smd.valor,
    nivel: smd.nivel,
    psiquiatria_eventos: smd.psiquiatria.eventos,
    psicoterapia_eventos: smd.psicoterapia.eventos,
  }

  // Faixa etária em vez da idade exata (reduz risco de reidentificação).
  const faixa_etaria =
    p.idade === null
      ? null
      : p.idade < 18
        ? '0-17'
        : p.idade < 30
          ? '18-29'
          : p.idade < 45
            ? '30-44'
            : p.idade < 60
              ? '45-59'
              : '60+'

  const periodo =
    p.timeline.length > 0
      ? `${p.timeline[0].competencia} a ${p.timeline[p.timeline.length - 1].competencia}`
      : null

  const base: Omit<PayloadBeneficiario, 'risco_assistencial_futuro'> = {
    identificador: 'beneficiário analisado',
    tipo: p.tipoLabel,
    faixa_etaria,
    sexo: p.sexo,
    plano: p.plano,
    score_risco: k.score,
    faixa_risco: k.faixa,
    valor_total: k.valorTotal,
    eventos_total: k.eventos,
    participacao_custo_carteira_pct: k.participacaoPct,
    competencias_ativas: p.timeline.length,
    periodo,
    evolucao_mensal,
    eventos_relevantes,
    procedimentos_recorrentes,
    prestadores,
    concentracao_prestador_top1_pct,
    crescimento_custo,
    perfil_utilizacao,
    continuidade,
    internacoes,
    alto_custo,
    saude_mental,
    fatores_risco: p.analise.fatores.map((f) => ({
      fator: f.label,
      pontos: f.pontos,
    })),
  }

  // Fonte única da verdade: classifica o risco uma vez e anexa ao payload.
  return {
    ...base,
    risco_assistencial_futuro: classificarRiscoFuturo(base),
  }
}

// ---------------------------------------------------------------------------
// Prompt de sistema — narrativa clínico-assistencial + financeira
// ---------------------------------------------------------------------------

export const PROMPT_SISTEMA_BENEFICIARIO = `Você é o Winners Decide IA, consultor sênior da Winners Health Intelligence, especialista em saúde corporativa, gestão de risco assistencial e utilização de planos de saúde empresariais. Você escreve para um público executivo — RH, diretoria e gestão de benefícios — que precisa entender o SIGNIFICADO dos padrões e tomar decisões, não apenas ver números.

Sua tarefa é produzir uma NARRATIVA CONSULTIVA E INTERPRETATIVA de um único beneficiário (anonimizado), unindo a leitura clínico-assistencial (jornada de utilização) e a leitura financeira (o que gerou custo). Você recebe um payload JSON com a jornada do beneficiário.

POSTURA CONSULTIVA (o mais importante)
- Não basta relatar os fatos: EXPLIQUE O QUE ELES SIGNIFICAM para a gestão do benefício e para o risco da carteira.
- Para CADA conclusão relevante (especialmente continuidade de tratamento, risco de recorrência e concentração de custo), apresente explicitamente os PRINCIPAIS FATORES que levaram àquela conclusão — o raciocínio, não só o resultado.
- Traduza padrões em implicações de negócio: o que este comportamento tende a provocar no custo futuro, na sinistralidade e na necessidade de gestão assistencial.
- SEMPRE traduza a participação no custo da carteira em significado de gestão. Ex.: se o beneficiário representa 63% do custo da carteira, explique que praticamente dois terços de toda a despesa assistencial foram consumidos por uma única vida, elevando a exposição financeira do contrato e a dependência do resultado a esse caso.
- Ao comentar variação/redução de custo, NÃO apenas informe que caiu ou subiu: qualifique se é positivo ou preocupante e o que ainda NÃO se pode concluir. Ex.: uma redução recente não permite concluir encerramento da jornada assistencial se ainda há utilização e histórico recente de internações.
- Priorize interpretação e recomendação sobre a mera enumeração de indicadores.

REGRAS OBRIGATÓRIAS
1. NUNCA faça diagnóstico médico, hipótese diagnóstica ou inferência sobre a doença do beneficiário. Descreva PADRÕES DE UTILIZAÇÃO (frequência, tipos de atendimento, prestadores, custo), não condições clínicas.
1.1. NUNCA infira a NATUREZA ou a CAUSA CLÍNICA dos eventos. Uma mesma concentração de custo e utilização pode decorrer de um caso oncológico, de uma infecção grave, de uma cirurgia complexa, de um tratamento prolongado ou de outros cenários — os dados de utilização não permitem distinguir entre eles. É PROIBIDO usar expressões como "evento agudo significativo", "evento agudo", "quadro agudo", "possível condição", "possível quadro clínico", "internação complexa por [causa]", "possivelmente relacionado a [condição]", "sugere [doença/procedimento clínico]".
1.2. Ao descrever picos ou concentração de eventos/custos, use linguagem NEUTRA e CONSULTIVA centrada na INTENSIDADE ASSISTENCIAL e no CONSUMO DE RECURSOS, não na causa clínica. Prefira termos como "fase de maior intensidade assistencial", "período de elevada utilização hospitalar", "concentração relevante de utilização assistencial" ou "período de maior consumo de recursos assistenciais". Exemplo do tom correto: em vez de "a concentração no início do período sugere um evento agudo significativo, possivelmente relacionado a internações complexas", escreva "a concentração de eventos e custos no início do período indica uma fase de maior intensidade assistencial, caracterizada por utilização hospitalar relevante e elevado consumo de recursos assistenciais". Descreva O QUE foi utilizado (internação, itens de alto custo, exames), NUNCA POR QUÊ clinicamente.
2. Não identifique o beneficiário. Refira-se a ele como "o beneficiário".
3. Interprete os dados — não os liste. Construa uma leitura coerente e conclusiva da jornada observada.
4. Diferencie SEMPRE frequência de utilização (quantas vezes) de impacto financeiro (quanto custou). Um evento frequente nem sempre é o de maior custo; um evento raro pode concentrar a maior despesa. Ao apontar o que gerou custo, baseie-se em valor (R$), não em contagem.
5. Ancore cada conclusão em evidência do payload: cite o número, percentual, valor em R$, competência, procedimento ou prestador que a sustenta. Toda conclusão deve vir acompanhada dos fatores que a fundamentam.
6. Saúde mental é frente PREVENTIVA e indicador de utilização — nunca infira gravidade individual.
7. Não invente informações fora do payload. Se um dado não existir, não afirme.
8. Seja consultivo, objetivo e executivo. Use markdown com títulos (##) em cada seção.

ESTRUTURA OBRIGATÓRIA DA RESPOSTA (responda cada pergunta na seção correspondente)

## Resumo Executivo
Abra com 3 a 4 frases de altíssimo nível, escritas para um diretor. Sintetize: o perfil do caso (complexidade e magnitude), a participação no custo da carteira já traduzida em significado, onde o custo se concentrou, se há continuidade assistencial e a classificação do risco de recorrência. Ao mencionar o risco, use EXATAMENTE o nível oficial de "risco_assistencial_futuro.nivel" do payload — nunca um nível diferente. Este bloco deve fazer sentido sozinho, sem depender do resto do texto.

## O que aconteceu?
Síntese interpretativa da utilização no período: volume, competências ativas, tipos de atendimento predominantes e magnitude financeira — e o que esse conjunto sinaliza sobre o perfil de utilização do beneficiário. Traduza a participação no custo da carteira em linguagem de gestão (o que aquele percentual significa para a exposição do contrato).

## Jornada assistencial
Descreva a sequência temporal como uma história: como a utilização evoluiu mês a mês, procedimentos recorrentes, concentração em prestadores e eventos-chave (internações, itens de alto custo) na ordem em que ocorreram. Explique o que essa trajetória sugere sobre a evolução do caso. Se houver redução ou aumento de custo recente, qualifique o significado (positivo/preocupante) e o que ainda não se pode concluir a partir dele.

## O que gerou o custo?
Aponte os principais ofensores financeiros (por valor), diferenciando de frequência. Destaque itens/medicamentos de alto custo, internações e concentração por prestador.
**Principais fatores da concentração de custo:** liste explicitamente os fatores (com valores/percentuais) que explicam onde e por que o custo se concentra.

## Continuidade de tratamento
Conclua se há tratamento continuado ou utilização pontual e o que isso implica para a gestão.
**Principais fatores desta conclusão:** liste os elementos que sustentam o veredito (procedimentos recorrentes em múltiplas competências, prestadores recorrentes, regularidade mensal etc.), com os números correspondentes.

## Risco de recorrência
NÃO recalcule nem reinterprete o risco. Use EXATAMENTE a classificação oficial fornecida no payload em "risco_assistencial_futuro.nivel" (um de: Baixo, Moderado, Alto, Crítico). Comece a seção com a linha "**Classificação: <nível oficial do payload>**" e explique a implicação financeira dessa classificação para a sinistralidade do contrato. É PROIBIDO citar um nível diferente do que consta no payload.
**Principais fatores desta conclusão:** liste os fatores fornecidos em "risco_assistencial_futuro.motivos" do payload, podendo detalhá-los com os números correspondentes, mas sem alterar a conclusão.

## Ações preventivas recomendadas
Liste de 3 a 5 ações preventivas e de gestão assistencial concretas, priorizadas, adequadas ao padrão observado (ex.: gestão de caso, acompanhamento pós-alta, programa de crônicos, atenção preventiva em saúde mental). Para cada ação, indique brevemente o motivo (o fator que a justifica) e o resultado esperado.

ESTILO
- Linguagem de consultoria de saúde corporativa, adequada para RH, diretoria e gestão de benefícios; clínica-assistencial e financeira, sem jargão médico diagnóstico.
- Explique o significado dos padrões, não apenas os fatos.
- Descreva intensidade assistencial e consumo de recursos; nunca especule a causa clínica por trás dos números.
- Toda conclusão relevante vem acompanhada dos fatores que a sustentam.
- Ancore conclusões em evidências do payload.`

// ---------------------------------------------------------------------------
// Fallback determinístico (sem OPENAI_API_KEY ou em caso de erro)
// ---------------------------------------------------------------------------

function pct(n: number | null): string {
  if (n === null) return '—'
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

// Traduz a participação no custo da carteira em linguagem de gestão.
function significadoCarteira(p: number): string {
  if (p >= 60)
    return 'praticamente dois terços de toda a despesa assistencial da carteira foram consumidos por uma única vida'
  if (p >= 40)
    return 'perto da metade de toda a despesa assistencial da carteira concentra-se nesta única vida'
  if (p >= 20)
    return 'uma parcela expressiva da despesa assistencial da carteira concentra-se nesta única vida'
  if (p >= 5)
    return 'a vida tem participação relevante no custo da carteira'
  return 'a vida tem participação diluída no custo da carteira'
}

// Descreve, em uma expressão curta, onde o custo se concentrou.
function resumoConcentracao(d: PayloadBeneficiario): string {
  const partes: string[] = []
  if (d.internacoes.total > 0) partes.push('internações hospitalares')
  if (d.alto_custo.itens.length > 0) partes.push('itens de alto custo')
  if (d.prestadores[0] && d.concentracao_prestador_top1_pct >= 40)
    partes.push('um único prestador')
  if (partes.length === 0) {
    const g = d.perfil_utilizacao[0]
    return g ? `${g.grupo.toLowerCase()}` : 'utilização distribuída'
  }
  return partes.join(' e ')
}

// ---------------------------------------------------------------------------
// Classificação de Risco Assistencial Futuro (determinística)
//
// Traduz a probabilidade de manutenção/escalada da utilização em 4 níveis
// visuais para leitura executiva, sempre acompanhada dos fatores (motivos) que
// sustentam a classificação. Independe do texto da IA — é calculada a partir do
// payload, garantindo consistência na UI e em relatórios.
// ---------------------------------------------------------------------------

export type NivelRiscoFuturo = 'Baixo' | 'Moderado' | 'Alto' | 'Crítico'

export type ClassificacaoRiscoFuturo = {
  nivel: NivelRiscoFuturo
  motivos: string[]
}

const NIVEIS_RISCO_FUTURO: NivelRiscoFuturo[] = [
  'Baixo',
  'Moderado',
  'Alto',
  'Crítico',
]

// ---------------------------------------------------------------------------
// Sinais normalizados de classificação (fonte única)
//
// Conjunto mínimo de sinais que as três classificações (Risco Futuro,
// Prioridade P1–P4 e Potencial de Economia) consomem. Extrair para este tipo
// permite classificar tanto a partir do panorama completo (página do
// beneficiário) quanto da agregação leve da carteira (PDF/Radar), com total
// consistência de regras.
// ---------------------------------------------------------------------------

export type SinaisClassificacao = {
  score_risco: number
  faixa_risco: string
  participacao_custo_carteira_pct: number
  internacoes: {
    total: number
    reinternacao: boolean
    competencias_com_internacao: number
  }
  alto_custo: { tem_itens: boolean; pct_do_custo: number }
  crescimento_custo: {
    tendencia: 'crescente' | 'estavel' | 'decrescente'
    variacao_pct: number | null
  }
  continuidade: {
    tratamento_continuo: boolean
    procedimentos_multi_competencia: number
    prestadores_recorrentes: number
  }
  concentracao_prestador_top1_pct: number
}

// Deriva os sinais normalizados a partir do payload completo do beneficiário.
export function sinaisDePayload(
  d: Omit<PayloadBeneficiario, 'risco_assistencial_futuro'>,
): SinaisClassificacao {
  return {
    score_risco: d.score_risco,
    faixa_risco: d.faixa_risco,
    participacao_custo_carteira_pct: d.participacao_custo_carteira_pct,
    internacoes: {
      total: d.internacoes.total,
      reinternacao: d.internacoes.reinternacao,
      competencias_com_internacao: d.internacoes.competencias_com_internacao,
    },
    alto_custo: {
      tem_itens: d.alto_custo.itens.length > 0,
      pct_do_custo: d.alto_custo.pct_do_custo,
    },
    crescimento_custo: {
      tendencia: d.crescimento_custo.tendencia,
      variacao_pct: d.crescimento_custo.variacao_pct,
    },
    continuidade: {
      tratamento_continuo: d.continuidade.tratamento_continuo,
      procedimentos_multi_competencia:
        d.continuidade.procedimentos_multi_competencia,
      prestadores_recorrentes: d.continuidade.prestadores_recorrentes,
    },
    concentracao_prestador_top1_pct: d.concentracao_prestador_top1_pct,
  }
}

export function classificarRiscoFuturo(
  d: Omit<PayloadBeneficiario, 'risco_assistencial_futuro'>,
): ClassificacaoRiscoFuturo {
  return classificarRiscoFuturoSinais(sinaisDePayload(d))
}

export function classificarRiscoFuturoSinais(
  d: SinaisClassificacao,
): ClassificacaoRiscoFuturo {
  // Modelo em duas camadas:
  //  · Camada 1 — GRAVIDADE (determina o nível base): internações,
  //    reinternações, alto custo, score assistencial e impacto na carteira.
  //  · Camada 2 — TENDÊNCIA (apenas AJUSTA): crescimento de custo,
  //    continuidade e concentração. Nunca determina o risco sozinha.
  //
  // A tendência pode elevar no máximo +1 banda e SÓ quando já existe alguma
  // gravidade material. Assim, um caso de baixa complexidade (ex.: score baixo,
  // sem internação, custo irrelevante) não é classificado como Alto apenas por
  // uma variação percentual expressiva sobre uma base pequena.
  const motivos: string[] = []

  // ---- Camada 1 · Gravidade ----
  let gravidade = 0 // 0 Baixo · 1 Moderado · 2 Alto · 3 Crítico

  // Score de risco assistencial.
  if (d.score_risco >= 80) gravidade = Math.max(gravidade, 3)
  else if (d.score_risco >= 65) gravidade = Math.max(gravidade, 2)
  else if (d.score_risco >= 50) gravidade = Math.max(gravidade, 1)
  motivos.push(`Score de risco assistencial ${d.score_risco}/100 (${d.faixa_risco})`)

  // Internações / reinternações — principal driver de gravidade.
  if (d.internacoes.competencias_com_internacao >= 2) {
    gravidade = Math.max(gravidade, 3)
    motivos.push(
      `Internações em múltiplas competências (${d.internacoes.competencias_com_internacao})`,
    )
  } else if (d.internacoes.reinternacao) {
    gravidade = Math.max(gravidade, 2)
    motivos.push(`Reinternação (${d.internacoes.total} internações no período)`)
  } else if (d.internacoes.total > 0) {
    gravidade = Math.max(gravidade, 1)
    motivos.push(`Internação registrada (${d.internacoes.total})`)
  }

  // Itens de alto custo concentrados.
  if (d.alto_custo.tem_itens) {
    if (d.alto_custo.pct_do_custo >= 60) gravidade = Math.max(gravidade, 2)
    else if (d.alto_custo.pct_do_custo >= 40) gravidade = Math.max(gravidade, 1)
    motivos.push(
      `Itens de alto custo (${pct(d.alto_custo.pct_do_custo)} do gasto do beneficiário)`,
    )
  }

  // Impacto no custo da carteira.
  if (d.participacao_custo_carteira_pct >= 20) {
    gravidade = Math.max(gravidade, 3)
    motivos.push(
      `Alta concentração no custo da carteira (${pct(d.participacao_custo_carteira_pct)})`,
    )
  } else if (d.participacao_custo_carteira_pct >= 5) {
    gravidade = Math.max(gravidade, 1)
    motivos.push(
      `Participação relevante no custo da carteira (${pct(d.participacao_custo_carteira_pct)})`,
    )
  }

  // ---- Camada 2 · Tendência (apenas ajuste) ----
  let ajuste = 0
  if (d.crescimento_custo.tendencia === 'crescente') {
    ajuste += 1
    motivos.push(
      `Tendência de custo crescente${d.crescimento_custo.variacao_pct !== null ? ` (${pct(d.crescimento_custo.variacao_pct)} no período)` : ''}`,
    )
  }
  if (d.continuidade.tratamento_continuo) {
    ajuste += 1
    motivos.push(
      `Continuidade assistencial (${d.continuidade.procedimentos_multi_competencia} procedimento(s) recorrente(s), ${d.continuidade.prestadores_recorrentes} prestador(es) recorrente(s))`,
    )
  }
  if (d.concentracao_prestador_top1_pct >= 60) {
    ajuste += 1
    motivos.push(
      `Alta concentração em um único prestador (${pct(d.concentracao_prestador_top1_pct)})`,
    )
  }
  // A tendência eleva no máximo +1 banda.
  ajuste = Math.min(ajuste, 1)

  // ---- Combinação ----
  // A tendência só ajusta quando há gravidade material (Camada 1 > 0). Sem
  // gravidade, a tendência sobe no máximo até Moderado — nunca determina Alto.
  let escala: number
  if (gravidade === 0) {
    escala = ajuste // 0 Baixo ou, no máximo, 1 Moderado
    if (ajuste > 0)
      motivos.push(
        'Sinais de tendência sobre base de baixa materialidade — risco limitado a Moderado',
      )
  } else {
    escala = Math.min(3, gravidade + ajuste)
  }

  return { nivel: NIVEIS_RISCO_FUTURO[escala], motivos }
}

// ---------------------------------------------------------------------------
// P2 · Prioridade de Intervenção (classificação P1–P4)
//
// Traduz o índice de urgência de intervenção já calculado pelo motor de risco
// (analise.prioridadeIntervencao) em 4 níveis operacionais para gestão de caso,
// sempre acompanhado dos fatores que justificam a prioridade e do benefício
// esperado da ação. Determinístico — consistente com a UI e com relatórios.
// ---------------------------------------------------------------------------

export type NivelPrioridade = 'P1' | 'P2' | 'P3' | 'P4'

export type ClassificacaoPrioridade = {
  nivel: NivelPrioridade
  rotulo: string
  indice: number
  motivos: string[]
  beneficioEsperado: string
}

const PRIORIDADE_INFO: Record<
  NivelPrioridade,
  { rotulo: string; beneficio: string }
> = {
  P1: {
    rotulo: 'Ação Imediata',
    beneficio:
      'Reduzir a exposição financeira imediata do contrato e prevenir novas internações de alto custo por meio de gestão de caso ativa.',
  },
  P2: {
    rotulo: 'Alta Atenção',
    beneficio:
      'Conter a escalada de utilização e de custo antes da renovação, com acompanhamento assistencial dirigido ao caso.',
  },
  P3: {
    rotulo: 'Monitoramento',
    beneficio:
      'Estabilizar o padrão de utilização e evitar a progressão do risco com monitoramento e ações preventivas pontuais.',
  },
  P4: {
    rotulo: 'Baixo Risco',
    beneficio:
      'Manter o custo sob controle com acompanhamento de rotina, sem necessidade de intervenção dedicada no momento.',
  },
}

export function classificarPrioridadeIntervencao(
  d: PayloadBeneficiario,
  prio: { valor: number; faixa: 'baixa' | 'moderada' | 'alta' | 'critica' },
): ClassificacaoPrioridade {
  return classificarPrioridadeSinais(sinaisDePayload(d), prio)
}

export function classificarPrioridadeSinais(
  d: SinaisClassificacao,
  prio: { valor: number; faixa: 'baixa' | 'moderada' | 'alta' | 'critica' },
): ClassificacaoPrioridade {
  const nivel: NivelPrioridade =
    prio.faixa === 'critica'
      ? 'P1'
      : prio.faixa === 'alta'
        ? 'P2'
        : prio.faixa === 'moderada'
          ? 'P3'
          : 'P4'

  const motivos: string[] = []
  motivos.push(
    `Índice de urgência de intervenção ${prio.valor}/100 (combina risco assistencial, impacto financeiro e alertas)`,
  )
  if (d.internacoes.competencias_com_internacao >= 2)
    motivos.push(
      `Internações em múltiplas competências (${d.internacoes.competencias_com_internacao})`,
    )
  else if (d.internacoes.reinternacao)
    motivos.push(`Reinternação (${d.internacoes.total} internações no período)`)
  if (d.participacao_custo_carteira_pct >= 5)
    motivos.push(
      `Impacto financeiro na carteira (${pct(d.participacao_custo_carteira_pct)} do custo)`,
    )
  if (d.crescimento_custo.tendencia === 'crescente')
    motivos.push('Tendência de custo crescente')
  if (d.alto_custo.tem_itens)
    motivos.push(
      `Itens de alto custo (${pct(d.alto_custo.pct_do_custo)} do gasto do beneficiário)`,
    )
  if (d.continuidade.tratamento_continuo)
    motivos.push('Tratamento em andamento (continuidade assistencial)')

  return {
    nivel,
    rotulo: PRIORIDADE_INFO[nivel].rotulo,
    indice: prio.valor,
    motivos,
    beneficioEsperado: PRIORIDADE_INFO[nivel].beneficio,
  }
}

// ---------------------------------------------------------------------------
// P3 · Potencial de Economia (Alto / Médio / Baixo)
//
// Estima quanto do custo do beneficiário é potencialmente endereçável por
// gestão assistencial (reinternações evitáveis, coordenação do cuidado,
// negociação de alto custo, prevenção de escalada), com as alavancas que
// sustentam a classificação. Não é promessa de economia — é potencial.
// ---------------------------------------------------------------------------

export type NivelEconomia = 'Alto' | 'Médio' | 'Baixo'

export type ClassificacaoEconomia = {
  nivel: NivelEconomia
  motivos: string[]
  interpretacao: string
}

export function classificarPotencialEconomia(
  d: PayloadBeneficiario,
): ClassificacaoEconomia {
  return classificarEconomiaSinais(sinaisDePayload(d))
}

export function classificarEconomiaSinais(
  d: SinaisClassificacao,
): ClassificacaoEconomia {
  const motivos: string[] = []
  let pts = 0

  // Reinternações / internações recorrentes: maior potencial evitável.
  if (d.internacoes.competencias_com_internacao >= 2) {
    pts += 3
    motivos.push(
      `Internações em múltiplas competências (${d.internacoes.competencias_com_internacao}) — potencial de evitar reinternações com gestão de caso e acompanhamento pós-alta`,
    )
  } else if (d.internacoes.reinternacao) {
    pts += 3
    motivos.push(
      `Reinternação (${d.internacoes.total} internações) — reinternações são um dos custos mais evitáveis com coordenação do cuidado`,
    )
  } else if (d.internacoes.total > 0) {
    pts += 1
    motivos.push(`Internação registrada (${d.internacoes.total})`)
  }

  // Tendência de custo crescente: janela para conter escalada.
  if (d.crescimento_custo.tendencia === 'crescente') {
    pts += 2
    motivos.push(
      'Tendência de custo crescente — atuação preventiva pode conter a escalada antes da renovação',
    )
  }

  // Alto custo concentrado: alavanca de negociação / protocolo.
  if (d.alto_custo.tem_itens && d.alto_custo.pct_do_custo >= 40) {
    pts += 2
    motivos.push(
      `Itens de alto custo concentram ${pct(d.alto_custo.pct_do_custo)} do gasto — alavanca de gestão de alto custo (protocolo, negociação, auditoria)`,
    )
  } else if (d.alto_custo.tem_itens) {
    pts += 1
    motivos.push(
      `Presença de itens de alto custo (${pct(d.alto_custo.pct_do_custo)} do gasto)`,
    )
  }

  // Continuidade + concentração em prestador: coordenação evita duplicidade.
  if (d.continuidade.tratamento_continuo && d.concentracao_prestador_top1_pct >= 40) {
    pts += 1
    motivos.push(
      `Tratamento contínuo concentrado em um prestador (${pct(d.concentracao_prestador_top1_pct)}) — coordenação do cuidado reduz duplicidade e fragmentação`,
    )
  }

  // Concentração relevante na carteira: amplifica o retorno da intervenção.
  if (d.participacao_custo_carteira_pct >= 20) {
    pts += 1
    motivos.push(
      `Alta participação no custo da carteira (${pct(d.participacao_custo_carteira_pct)}) — ganhos neste caso têm reflexo material na sinistralidade`,
    )
  }

  // Score de risco elevado reforça o potencial de gestão.
  if (d.score_risco >= 60) {
    pts += 1
    motivos.push(`Score de risco assistencial elevado (${d.score_risco}/100)`)
  }

  const nivel: NivelEconomia = pts >= 5 ? 'Alto' : pts >= 2 ? 'Médio' : 'Baixo'

  if (motivos.length === 0)
    motivos.push(
      'Utilização pontual e de baixo custo, sem alavancas relevantes de economia no momento',
    )

  const interpretacao =
    nivel === 'Alto'
      ? 'Parte relevante do custo é potencialmente endereçável por gestão assistencial ativa; caso prioritário para atuação dirigida.'
      : nivel === 'Médio'
        ? 'Há oportunidades de otimização com acompanhamento e ações preventivas, embora parte do custo tenda a ser inevitável.'
        : 'Baixo potencial de economia adicional; o custo observado é majoritariamente compatível com utilização de rotina.'

  return { nivel, motivos, interpretacao }
}

export function gerarNarrativaBeneficiarioMock(
  d: PayloadBeneficiario,
): string {
  const L: string[] = []

  if (d.eventos_total === 0) {
    return '## O que aconteceu?\nNão há utilização registrada para o beneficiário no recorte selecionado.'
  }

  // Consome a classificação oficial anexada ao payload (não recalcula).
  const cls = d.risco_assistencial_futuro
  const cresc = d.crescimento_custo
  const grupoTop = d.perfil_utilizacao[0]

  // Resumo Executivo (bloco de topo, legível de forma isolada)
  L.push('## Resumo Executivo')
  L.push(
    `Beneficiário com jornada assistencial ${d.score_risco >= 60 ? 'de alta complexidade' : d.score_risco >= 35 ? 'de complexidade moderada' : 'de baixa complexidade'}, responsável por ${pct(d.participacao_custo_carteira_pct)} do custo da carteira no período${d.periodo ? ` (${d.periodo})` : ''} — ${significadoCarteira(d.participacao_custo_carteira_pct)}. O custo esteve concentrado em ${resumoConcentracao(d)}${d.continuidade.tratamento_continuo ? ', com evidências de continuidade assistencial ao longo de múltiplas competências' : ', em utilização predominantemente pontual'}. ${cresc.tendencia === 'decrescente' ? 'Embora haja tendência recente de redução dos custos, permanecem fatores que sustentam' : cresc.tendencia === 'crescente' ? 'A tendência de custo é crescente, sustentando' : 'Os dados sustentam'} um **Risco Assistencial Futuro ${cls.nivel}**, com potencial de impacto financeiro nas próximas competências.`,
  )

  // O que aconteceu?
  L.push('## O que aconteceu?')
  L.push(
    `O beneficiário registrou **${d.eventos_total} evento(s)** em ${d.competencias_ativas} competência(s)${d.periodo ? ` (${d.periodo})` : ''}, totalizando **${formatBRL(d.valor_total)}** e representando ${pct(d.participacao_custo_carteira_pct)} do custo da carteira. Na prática, ${significadoCarteira(d.participacao_custo_carteira_pct)}, o que ${d.participacao_custo_carteira_pct >= 20 ? 'eleva significativamente a exposição financeira do contrato a este único caso' : 'deve ser acompanhado dentro do conjunto da carteira'}. O score de risco assistencial é **${d.score_risco}/100 (${d.faixa_risco})**.${grupoTop ? ` A utilização concentra-se em ${grupoTop.grupo} (${pct(grupoTop.pct_valor)} do custo do beneficiário).` : ''}`,
  )

  // Jornada assistencial
  L.push('## Jornada assistencial')
  L.push(
    `Ao longo do período, o custo mensal evoluiu de ${formatBRL(cresc.primeira_competencia_valor)} para ${formatBRL(cresc.ultima_competencia_valor)} (tendência ${cresc.tendencia}${cresc.variacao_pct !== null ? `, ${pct(cresc.variacao_pct)}` : ''}).`,
  )
  if (cresc.tendencia === 'decrescente') {
    L.push(
      `Apesar da redução observada, os dados **não permitem concluir o encerramento da jornada assistencial**, uma vez que ${d.continuidade.tratamento_continuo ? 'ainda há tratamento em andamento' : 'ainda há utilização no período'}${d.internacoes.total > 0 ? ' e histórico recente de internações' : ''} — a queda deve ser lida como alívio momentâneo, não como resolução do caso.`,
    )
  } else if (cresc.tendencia === 'crescente') {
    L.push(
      'A trajetória de custo crescente é um sinal de atenção: indica caso em intensificação, que tende a pressionar a sinistralidade nas próximas competências caso não haja intervenção.',
    )
  }
  if (d.procedimentos_recorrentes.length > 0) {
    const r = d.procedimentos_recorrentes[0]
    L.push(
      `- Procedimento mais recorrente: **${r.procedimento}** (${r.ocorrencias}x em ${r.competencias_distintas} competência(s), ${formatBRL(r.valor_total)}).`,
    )
  }
  if (d.prestadores.length > 0) {
    const pr = d.prestadores[0]
    L.push(
      `- Principal prestador: **${pr.prestador}** — ${pr.eventos} evento(s), ${formatBRL(pr.valor)} (${pct(pr.participacao_pct)} do custo do beneficiário).`,
    )
  }
  if (d.internacoes.total > 0) {
    L.push(
      `- Internações: ${d.internacoes.total} em ${d.internacoes.competencias_com_internacao} competência(s)${d.internacoes.reinternacao ? ' — há reinternação' : ''}.`,
    )
  }

  // O que gerou o custo?
  L.push('## O que gerou o custo?')
  if (d.alto_custo.itens.length > 0) {
    L.push(
      `A despesa é puxada por itens de alto custo, que respondem por ${formatBRL(d.alto_custo.total_valor)} (${pct(d.alto_custo.pct_do_custo)} do custo do beneficiário) — ou seja, poucos eventos concentram grande parte do gasto. Destaque para **${d.alto_custo.itens[0].procedimento}** (${formatBRL(d.alto_custo.itens[0].valor)}).`,
    )
  } else {
    L.push(
      'O custo distribui-se sem itens isolados de alto valor: a despesa decorre do volume de utilização, e não de eventos pontuais caros. Na prática, o direcionador é a frequência, não a complexidade dos procedimentos.',
    )
  }
  L.push('**Principais fatores da concentração de custo:**')
  if (d.prestadores[0])
    L.push(
      `- Concentração no principal prestador: ${pct(d.concentracao_prestador_top1_pct)} do custo em **${d.prestadores[0].prestador}** (${d.prestadores[0].eventos} evento(s)).`,
    )
  if (d.alto_custo.itens.length > 0)
    L.push(
      `- Itens de alto custo: ${d.alto_custo.itens.length} item(ns) somando ${pct(d.alto_custo.pct_do_custo)} do gasto.`,
    )
  if (d.internacoes.total > 0)
    L.push(
      `- Internações: ${d.internacoes.total} evento(s) de internação, tipicamente os de maior custo unitário.`,
    )
  if (grupoTop)
    L.push(
      `- Composição por tipo: ${grupoTop.grupo} concentra ${pct(grupoTop.pct_valor)} do custo (frequência ≠ impacto financeiro).`,
    )

  // Continuidade de tratamento
  L.push('## Continuidade de tratamento')
  L.push(
    d.continuidade.tratamento_continuo
      ? 'A leitura dos dados indica **tratamento em andamento**, e não utilização esporádica — padrão que costuma se manter nas competências seguintes e exige coordenação do cuidado.'
      : 'A leitura dos dados aponta **utilização predominantemente pontual**, sem sinais consistentes de tratamento continuado — padrão de menor previsibilidade de recorrência.',
  )
  L.push('**Principais fatores desta conclusão:**')
  L.push(
    `- Procedimentos recorrentes em múltiplas competências: ${d.continuidade.procedimentos_multi_competencia}.`,
  )
  L.push(
    `- Prestadores utilizados de forma repetida: ${d.continuidade.prestadores_recorrentes}.`,
  )
  L.push(
    `- Regularidade da utilização: atividade em ${d.competencias_ativas} competência(s) no período.`,
  )

  // Risco de recorrência
  L.push('## Risco de recorrência')
  L.push(`**Classificação: ${cls.nivel}**`)
  L.push(
    `Risco Assistencial Futuro **${cls.nivel}** — probabilidade de manutenção ou escalada da utiliza��ão (e do custo associado) nas próximas competências. ${
      cls.nivel === 'Baixo'
        ? 'A implicação financeira é contida; cabe monitoramento de rotina.'
        : cls.nivel === 'Moderado'
          ? 'A implicação financeira é moderada; recomenda-se acompanhamento próximo do caso.'
          : 'A implicação financeira é relevante para a sinistralidade do contrato e justifica intervenção preventiva prioritária.'
    }`,
  )
  L.push('**Principais fatores desta conclusão:**')
  for (const m of cls.motivos) L.push(`- ${m}.`)

  // Ações preventivas
  L.push('## Ações preventivas recomendadas')
  if (d.internacoes.reinternacao)
    L.push(
      '- **Gestão de caso com acompanhamento pós-alta** — motivo: reinternação observada; resultado esperado: reduzir novas internações e o custo hospitalar associado.',
    )
  if (cresc.tendencia === 'crescente')
    L.push(
      '- **Investigar os direcionadores da escalada de custo** na última competência — motivo: tendência de custo crescente; resultado esperado: conter a curva de gasto antes da renovação.',
    )
  if (d.saude_mental.utilizacoes > 0)
    L.push(
      `- **Acompanhamento preventivo em saúde mental** — motivo: ${d.saude_mental.utilizacoes} utilização(ões), nível ${d.saude_mental.nivel}; resultado esperado: suporte precoce e prevenção de agravamento da utilização.`,
    )
  if (d.continuidade.tratamento_continuo)
    L.push(
      '- **Coordenação do cuidado com o prestador recorrente** — motivo: tratamento em andamento; resultado esperado: evitar duplicidade e fragmentação do cuidado.',
    )
  L.push(
    '- **Monitoramento mensal da utilização e reavaliação do score** — motivo: acompanhar a evolução do caso; resultado esperado: antecipar mudanças de risco e agir preventivamente.',
  )

  return L.join('\n')
}
