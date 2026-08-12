import 'server-only'

import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

import type { EventoDetalhado } from '@/lib/queries'
import {
  filtrarEventos,
  montarPayloadIA,
  gerarResumoMock,
  gerarRespostaChatMock,
  PROMPT_SISTEMA,
  FILTROS_VAZIOS,
  type PayloadIA,
  type WinnersFiltros,
} from '@/lib/winners-decide'
import {
  MIN_COMPETENCIAS_PROJECAO,
  instrucaoCorrecao,
  regraSerieInsuficiente,
  validarAnaliseIA,
  type FatosCarteira,
} from '@/lib/winners-decide-guardrails'

/**
 * 'resumo' — análise executiva consultiva completa da carteira.
 * 'chat'   — resposta a uma pergunta pontual sobre o mesmo recorte.
 */
export type ModoAnalise = 'resumo' | 'chat'

/** Por que o texto não veio do modelo. Permite ao chamador montar o aviso. */
export type MotivoFallback = 'sem-chave' | 'erro-provedor' | 'validacao'

export type AnaliseIA = {
  texto: string
  /**
   * 'ia' — texto do modelo, aprovado na validação.
   * 'deterministica' — texto derivado do payload (sem chave ou após rejeição).
   * 'suprimida' — nada aprovado; a seção não deve ser publicada.
   */
  fonte: 'ia' | 'deterministica' | 'suprimida'
  /** Motivos das rejeições, para log e para a nota da seção. */
  violacoes: string[]
  /** Ausente quando `fonte === 'ia'`. */
  motivo?: MotivoFallback
  /** Payload anonimizado que originou o texto — mesma base para quem exibe. */
  payload: PayloadIA
}

export type OpcoesAnalise = {
  modo?: ModoAnalise
  /** Pergunta do usuário; usada apenas no modo 'chat'. */
  pergunta?: string
}

/** Fatos do período contra os quais o texto gerado é conferido. */
function extrairFatos(payload: PayloadIA, faturaTotal: number | null): FatosCarteira {
  return {
    custoTotal: payload.custo_total,
    tetoMonetario: Math.max(payload.custo_total, faturaTotal ?? 0),
    internacoes: payload.internacoes,
    prontoSocorro: payload.pronto_socorro,
    saudeMentalUtilizacoes: payload.saude_mental.utilizacoes,
    vidasRiscoCritico: payload.vidas_risco_critico,
    competencias: payload.competencias_analisadas,
  }
}

function promptResumo(payload: PayloadIA): string {
  return `Gere a análise executiva consultiva completa da carteira com base nos dados anonimizados a seguir (JSON). Interprete os dados (não apenas os descreva) e estruture a resposta em markdown seguindo a estrutura obrigatória de 6 seções: Leitura Executiva, Principais Causas, Riscos e Tendências, Oportunidades de Economia, Recomendações Prioritárias e Mensagem para Diretoria.\n\n${JSON.stringify(payload, null, 2)}`
}

function promptChat(pergunta: string, payload: PayloadIA): string {
  return `Pergunta do usuário: "${pergunta}"\n\nResponda exclusivamente com base nos dados anonimizados a seguir (JSON):\n\n${JSON.stringify(payload, null, 2)}\n\nSeja objetivo e consultivo. Não identifique beneficiários. Não faça diagnóstico médico.`
}

// Fonte única da análise consultiva do Winners Decide IA: usada tanto pela tela
// (endpoint /api/winners-decide/analyze) quanto pelo relatório executivo em PDF.
// Monta o payload anonimizado, tenta a OpenAI quando OPENAI_API_KEY está
// configurada e cai para a versão determinística em caso de ausência de chave
// ou erro.
//
// Toda saída — do modelo ou determinística, em qualquer modo — passa pela
// validação de `winners-decide-guardrails` antes de ser devolvida. Texto que
// cita valores ou contagens acima do apurado, ou que projeta sem série
// histórica, é rejeitado: primeiro tenta-se uma regeração corretiva, depois o
// determinístico e, em último caso, a análise é suprimida. Uma tela (ou um
// relatório) sem a seção é publicável; uma que se contradiz não é.
export async function gerarAnaliseWinnersDecide(
  eventos: EventoDetalhado[],
  faturaPorCompetencia: Record<string, number>,
  filtros: Partial<WinnersFiltros> = {},
  opcoes: OpcoesAnalise = {},
): Promise<AnaliseIA> {
  const modo: ModoAnalise = opcoes.modo === 'chat' ? 'chat' : 'resumo'
  const pergunta = (opcoes.pergunta ?? '').trim()
  const filtrosCompletos: WinnersFiltros = { ...FILTROS_VAZIOS, ...filtros }
  const payload = montarPayloadIA(eventos, filtrosCompletos, faturaPorCompetencia)

  // Teto monetário do período: a fatura pode superar o valor utilizado e é
  // citação legítima; qualquer valor acima dela é dado de outro recorte.
  //
  // O recorte tem de ser o mesmo que `montarPayloadIA` usa (filtrarEventos), e
  // não a lista bruta recebida: o endpoint da tela envia a carteira inteira e
  // restringe pelos `filtros`, então somar a fatura de todas as competências
  // daria um teto alto demais justamente no caminho que a validação protege.
  const eventosDoRecorte = filtrarEventos(eventos, filtrosCompletos)
  const competenciasDoRecorte = new Set(
    eventosDoRecorte.map((e) => e.competencia).filter(Boolean) as string[],
  )
  const faturaTotal = [...competenciasDoRecorte].reduce(
    (soma, comp) => soma + (faturaPorCompetencia[comp] ?? 0),
    0,
  )
  const fatos = extrairFatos(payload, faturaTotal || null)

  const determinista = (
    violacoes: string[],
    motivo: MotivoFallback,
  ): AnaliseIA => {
    const texto =
      modo === 'chat'
        ? gerarRespostaChatMock(pergunta, payload)
        : gerarResumoMock(payload)
    const check = validarAnaliseIA(texto, fatos)
    if (check.ok) return { texto, fonte: 'deterministica', violacoes, motivo, payload }
    console.error(
      `[winners-decide] análise determinística (${modo}) também reprovou na validação:`,
      check.violacoes,
    )
    return {
      texto: '',
      fonte: 'suprimida',
      violacoes: [...violacoes, ...check.violacoes],
      motivo,
      payload,
    }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return determinista([], 'sem-chave')

  const openai = createOpenAI({ apiKey })
  const sistema =
    fatos.competencias < MIN_COMPETENCIAS_PROJECAO
      ? `${PROMPT_SISTEMA}\n\n${regraSerieInsuficiente(fatos.competencias)}`
      : PROMPT_SISTEMA
  const prompt =
    modo === 'chat' ? promptChat(pergunta, payload) : promptResumo(payload)

  let violacoesAcumuladas: string[] = []
  let erroProvedor = false
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const { text } = await generateText({
        model: openai('gpt-4o'),
        system: sistema,
        prompt:
          tentativa === 1
            ? prompt
            : `${instrucaoCorrecao(violacoesAcumuladas)}\n\n${prompt}`,
        temperature: tentativa === 1 ? 0.3 : 0.1,
      })
      const check = validarAnaliseIA(text, fatos)
      if (check.ok) {
        return { texto: text, fonte: 'ia', violacoes: violacoesAcumuladas, payload }
      }
      violacoesAcumuladas = [...violacoesAcumuladas, ...check.violacoes]
      console.log(
        `[winners-decide] análise reprovada na validação (${modo}, tentativa ${tentativa}):`,
        check.violacoes,
      )
    } catch (err) {
      console.log(
        '[winners-decide] erro no provedor de IA:',
        (err as Error).message,
      )
      erroProvedor = true
      break
    }
  }

  return determinista(
    violacoesAcumuladas,
    erroProvedor ? 'erro-provedor' : 'validacao',
  )
}
