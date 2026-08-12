import 'server-only'

import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

import type { EventoDetalhado } from '@/lib/queries'
import {
  montarPayloadIA,
  gerarResumoMock,
  PROMPT_SISTEMA,
  FILTROS_VAZIOS,
  type WinnersFiltros,
} from '@/lib/winners-decide'
import {
  MIN_COMPETENCIAS_PROJECAO,
  instrucaoCorrecao,
  regraSerieInsuficiente,
  validarAnaliseIA,
  type FatosCarteira,
} from '@/lib/winners-decide-guardrails'

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
}

type PayloadIA = ReturnType<typeof montarPayloadIA>

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

function promptUsuario(payload: PayloadIA): string {
  return `Gere a análise executiva consultiva completa da carteira com base nos dados anonimizados a seguir (JSON). Interprete os dados (não apenas os descreva) e estruture a resposta em markdown seguindo a estrutura obrigatória de 6 seções: Leitura Executiva, Principais Causas, Riscos e Tendências, Oportunidades de Economia, Recomendações Prioritárias e Mensagem para Diretoria.\n\n${JSON.stringify(payload, null, 2)}`
}

// Reutiliza exatamente a mesma análise consultiva do módulo Winners Decide IA
// (endpoint /api/winners-decide/analyze): monta o payload anonimizado, tenta a
// OpenAI quando OPENAI_API_KEY está configurada e cai para a versão
// determinística em caso de ausência de chave ou erro. Pensado para ser
// chamado no servidor (ex.: geração do relatório executivo em PDF).
//
// Toda saída — do modelo ou determinística — passa pela validação de
// `winners-decide-guardrails` antes de ser devolvida. Texto que cita valores
// ou contagens acima do apurado, ou que projeta sem série histórica, é
// rejeitado: primeiro tenta-se uma regeração corretiva, depois o determinístico
// e, em último caso, a seção é suprimida. Um relatório sem a seção 13 é
// publicável; um relatório que se contradiz não é.
export async function gerarAnaliseWinnersDecide(
  eventos: EventoDetalhado[],
  faturaPorCompetencia: Record<string, number>,
  filtros: Partial<WinnersFiltros> = {},
): Promise<AnaliseIA> {
  const filtrosCompletos: WinnersFiltros = { ...FILTROS_VAZIOS, ...filtros }
  const payload = montarPayloadIA(eventos, filtrosCompletos, faturaPorCompetencia)

  // Teto monetário do período: a fatura pode superar o valor utilizado e é
  // citação legítima; qualquer valor acima dela é dado de outro recorte.
  const competenciasDoRecorte = new Set(
    eventos.map((e) => e.competencia).filter(Boolean) as string[],
  )
  const faturaTotal = [...competenciasDoRecorte].reduce(
    (soma, comp) => soma + (faturaPorCompetencia[comp] ?? 0),
    0,
  )
  const fatos = extrairFatos(payload, faturaTotal || null)

  const determinista = (violacoes: string[]): AnaliseIA => {
    const texto = gerarResumoMock(payload)
    const check = validarAnaliseIA(texto, fatos)
    if (check.ok) return { texto, fonte: 'deterministica', violacoes }
    console.error(
      '[relatorio] análise determinística também reprovou na validação:',
      check.violacoes,
    )
    return {
      texto: '',
      fonte: 'suprimida',
      violacoes: [...violacoes, ...check.violacoes],
    }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return determinista([])

  const openai = createOpenAI({ apiKey })
  const sistema =
    fatos.competencias < MIN_COMPETENCIAS_PROJECAO
      ? `${PROMPT_SISTEMA}\n\n${regraSerieInsuficiente(fatos.competencias)}`
      : PROMPT_SISTEMA

  let violacoesAcumuladas: string[] = []
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const { text } = await generateText({
        model: openai('gpt-4o'),
        system: sistema,
        prompt:
          tentativa === 1
            ? promptUsuario(payload)
            : `${instrucaoCorrecao(violacoesAcumuladas)}\n\n${promptUsuario(payload)}`,
        temperature: tentativa === 1 ? 0.3 : 0.1,
      })
      const check = validarAnaliseIA(text, fatos)
      if (check.ok) return { texto: text, fonte: 'ia', violacoes: violacoesAcumuladas }
      violacoesAcumuladas = [...violacoesAcumuladas, ...check.violacoes]
      console.log(
        `[relatorio] Winners Decide IA reprovada na validação (tentativa ${tentativa}):`,
        check.violacoes,
      )
    } catch (err) {
      console.log('[relatorio] Winners Decide IA erro:', (err as Error).message)
      break
    }
  }

  return determinista(violacoesAcumuladas)
}
