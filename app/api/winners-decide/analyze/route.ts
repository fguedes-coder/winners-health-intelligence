import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { requireAuthApi } from '@/lib/auth/require-user'
import { getWinnersDataset } from '@/lib/winners-data-server'
import {
  montarPayloadIA,
  gerarResumoMock,
  gerarRespostaChatMock,
  PROMPT_SISTEMA,
  FILTROS_VAZIOS,
  type WinnersFiltros,
} from '@/lib/winners-decide'

export const runtime = 'nodejs'
export const maxDuration = 60

type Body = {
  modo?: 'resumo' | 'chat'
  filtros?: Partial<WinnersFiltros>
  pergunta?: string
}

export async function POST(req: Request) {
  const auth = await requireAuthApi()
  if (auth instanceof NextResponse) return auth

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const modo = body.modo === 'chat' ? 'chat' : 'resumo'
  const filtros: WinnersFiltros = { ...FILTROS_VAZIOS, ...(body.filtros ?? {}) }
  const pergunta = (body.pergunta ?? '').trim()

  if (modo === 'chat' && !pergunta) {
    return NextResponse.json({ error: 'Pergunta vazia.' }, { status: 400 })
  }

  // 1-4. Busca os dados, aplica filtros, anonimiza e monta o payload.
  const { eventos, faturaPorCompetencia } = await getWinnersDataset()
  const payload = montarPayloadIA(eventos, filtros, faturaPorCompetencia)

  // Análise determinística usada tanto como fallback quanto quando a chave da
  // OpenAI não está configurada.
  const respostaDeterministica = (aviso?: string) => {
    const texto =
      modo === 'chat'
        ? gerarRespostaChatMock(pergunta, payload)
        : gerarResumoMock(payload)
    return NextResponse.json({ texto, fonte: 'deterministica', aviso, payload })
  }

  // 5. Sem OPENAI_API_KEY configurada, responde de forma determinística.
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return respostaDeterministica(
      'OPENAI_API_KEY não configurada. Exibindo análise determinística baseada nos mesmos dados.',
    )
  }

  // 6. Chama a OpenAI diretamente com a chave do projeto e retorna a análise.
  try {
    const openai = createOpenAI({ apiKey })
    const promptUsuario =
      modo === 'chat'
        ? `Pergunta do usuário: "${pergunta}"\n\nResponda exclusivamente com base nos dados anonimizados a seguir (JSON):\n\n${JSON.stringify(payload, null, 2)}\n\nSeja objetivo e consultivo. Não identifique beneficiários. Não faça diagnóstico médico.`
        : `Gere a análise executiva consultiva completa da carteira com base nos dados anonimizados a seguir (JSON). Interprete os dados (não apenas os descreva) e estruture a resposta em markdown seguindo a estrutura obrigatória de 6 seções: Leitura Executiva, Principais Causas, Riscos e Tendências, Oportunidades de Economia, Recomendações Prioritárias e Mensagem para Diretoria.\n\n${JSON.stringify(payload, null, 2)}`

    const { text } = await generateText({
      model: openai('gpt-4o'),
      system: PROMPT_SISTEMA,
      prompt: promptUsuario,
      temperature: 0.3,
    })

    return NextResponse.json({ texto: text, fonte: 'ia', payload })
  } catch (err) {
    console.log('[v0] Winners Decide IA erro:', (err as Error).message)
    return respostaDeterministica(
      'Não foi possível conectar à OpenAI. Exibindo análise determinística baseada nos mesmos dados.',
    )
  }
}
