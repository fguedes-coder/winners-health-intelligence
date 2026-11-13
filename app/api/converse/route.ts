import { NextResponse } from 'next/server'
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { requireAuthApi } from '@/lib/auth/require-user'
import { obterChaveAssistente } from '@/lib/assistente/chave'
import { ferramentas, promptSistema } from '@/lib/assistente/ferramentas'

// "Converse com a Winners": chat com o Claude, que consulta o banco do Health
// pelas ferramentas de lib/assistente/ferramentas.ts.

export const runtime = 'nodejs'
// A ferramenta de atualizar o Gestão Conectada pode esperar até ~9 min.
export const maxDuration = 800

export async function POST(req: Request) {
  const auth = await requireAuthApi()
  if (auth instanceof NextResponse) return auth

  const chave = await obterChaveAssistente()
  if (!chave) {
    return NextResponse.json(
      { error: 'A chave da API do Claude ainda não foi cadastrada (Configurações → Inteligência artificial).' },
      { status: 503 },
    )
  }

  let messages: UIMessage[]
  try {
    ;({ messages } = (await req.json()) as { messages: UIMessage[] })
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const anthropic = createAnthropic({ apiKey: chave })
  const result = streamText({
    model: anthropic(process.env.ASSISTENTE_MODELO?.trim() || 'claude-sonnet-5-5'),
    system: promptSistema(),
    messages: await convertToModelMessages(messages.slice(-30)),
    tools: ferramentas,
    stopWhen: stepCountIs(12),
  })

  return result.toUIMessageStreamResponse({
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e)
      return /api key|authentication|401/i.test(msg)
        ? 'A chave da API do Claude foi recusada. Confira em Configurações → Inteligência artificial.'
        : `Erro ao consultar a IA: ${msg.slice(0, 200)}`
    },
  })
}
