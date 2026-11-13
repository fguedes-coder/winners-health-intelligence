'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from 'ai'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Loader2, MessageSquareText, RotateCcw, Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const CHAVE_LOCAL = 'converse-winners:v1'

const FERRAMENTA: Record<string, string> = {
  status_dados: 'Conferindo quando os dados foram atualizados',
  atualizar_gestao_conectada: 'Atualizando o Gestão Conectada (leva alguns minutos)',
  internados_agora: 'Consultando quem está internado',
  internacoes_periodo: 'Consultando internações do período',
  autorizacoes: 'Consultando autorizações',
  buscar_procedimento: 'Procurando procedimentos no portal e nas contas pagas',
  historico_pessoa: 'Montando o histórico da pessoa',
  indicadores: 'Calculando indicadores do contrato',
}

const SUGESTOES = [
  'Quantas pessoas estão internadas hoje e por qual motivo?',
  'Quantas internações tivemos em outubro? Quem, onde e quanto tempo?',
  'Alguém fez cirurgia do coração este ano?',
  'Quais exames e procedimentos foram autorizados nos últimos 30 dias?',
  'Qual foi a sinistralidade de outubro e quem mais utilizou?',
]

function carregar(): UIMessage[] {
  try {
    const s = localStorage.getItem(CHAVE_LOCAL)
    return s ? (JSON.parse(s) as UIMessage[]) : []
  } catch {
    return []
  }
}

export function ConverseClient({ configurada }: { configurada: boolean }) {
  const [texto, setTexto] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)
  const { messages, sendMessage, status, stop, error, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: '/api/converse' }),
  })

  // Conversa guardada só neste navegador (volta ao reabrir a aba).
  useEffect(() => {
    const salvas = carregar()
    if (salvas.length) setMessages(salvas)
  }, [setMessages])
  useEffect(() => {
    try {
      if (status === 'ready') localStorage.setItem(CHAVE_LOCAL, JSON.stringify(messages.slice(-40)))
    } catch {
      /* armazenamento indisponível: segue sem guardar */
    }
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, status])

  const ocupado = status === 'submitted' || status === 'streaming'

  function enviar(t: string) {
    const q = t.trim()
    if (!q || ocupado) return
    sendMessage({ text: q })
    setTexto('')
  }

  function novaConversa() {
    setMessages([])
    try {
      localStorage.removeItem(CHAVE_LOCAL)
    } catch {
      /* ignora */
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-9rem)] w-full max-w-4xl flex-col gap-4">
      {!configurada && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Falta cadastrar a chave da API do Claude. Cole a chave em{' '}
          <a href="/configuracoes?aba=ia" className="font-medium underline underline-offset-2">
            Configurações → Inteligência artificial
          </a>{' '}
          e volte aqui.
        </div>
      )}

      <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-card p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <MessageSquareText className="size-10 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Converse com a Winners</h2>
              <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                Pergunte em português sobre internações, autorizações, custos, sinistralidade ou sobre qualquer vida
                da carteira. A resposta sai do banco do Health — portal Gestão Conectada e contas pagas da SulAmérica.
              </p>
            </div>
            <div className="flex max-w-2xl flex-wrap justify-center gap-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  disabled={!configurada}
                  className="rounded-full border border-border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((m) => (
              <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[92%] rounded-xl px-4 py-3 text-sm',
                    m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/40',
                  )}
                >
                  {m.parts.map((p, i) => {
                    if (p.type === 'text') {
                      return m.role === 'user' ? (
                        <p key={i} className="whitespace-pre-wrap">
                          {p.text}
                        </p>
                      ) : (
                        <div
                          key={i}
                          className="max-w-none leading-relaxed [&_h1]:mb-1 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_strong]:font-semibold [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_table]:block [&_table]:overflow-x-auto [&_table]:my-2 [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left"
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown>
                        </div>
                      )
                    }
                    if (isToolUIPart(p)) {
                      const nome = getToolName(p)
                      const feito = p.state === 'output-available'
                      const erro = p.state === 'output-error'
                      return (
                        <div key={i} className="my-1 flex items-center gap-2 text-xs text-muted-foreground">
                          {feito || erro ? <span className={cn('size-1.5 rounded-full', erro ? 'bg-destructive' : 'bg-emerald-500')} /> : <Loader2 className="size-3 animate-spin" />}
                          {FERRAMENTA[nome] ?? nome}
                          {erro ? ' — falhou' : ''}
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
              </div>
            ))}
            {status === 'submitted' && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Pensando…
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                {error.message || 'Falha ao responder.'}
              </div>
            )}
            <div ref={fimRef} />
          </div>
        )}
      </div>

      <Card className="py-0">
        <CardContent className="flex items-end gap-2 p-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviar(texto)
              }
            }}
            rows={2}
            placeholder="Pergunte sobre internações, exames, custos ou uma pessoa…"
            disabled={!configurada}
            className="min-h-12 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {messages.length > 0 && !ocupado && (
            <Button variant="ghost" size="icon" onClick={novaConversa} title="Nova conversa">
              <RotateCcw />
            </Button>
          )}
          {ocupado ? (
            <Button variant="outline" size="icon" onClick={() => stop()} title="Parar">
              <Square />
            </Button>
          ) : (
            <Button size="icon" onClick={() => enviar(texto)} disabled={!texto.trim() || !configurada} title="Enviar">
              <Send />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
