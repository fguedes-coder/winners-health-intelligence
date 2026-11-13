'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, CircleDashed, KeyRound, MessageSquareText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { StatusChaveAssistente } from '@/lib/assistente/chave'
import { salvarChaveAssistente } from './assistente-actions'

const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'

export function AssistentePanel({ status }: { status: StatusChaveAssistente }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [salvando, startSalvar] = useTransition()
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const configurada = status.origem !== null

  function salvar(formData: FormData) {
    setMsg(null)
    startSalvar(async () => {
      const r = await salvarChaveAssistente(formData)
      if (r.ok) {
        setMsg({ tipo: 'ok', texto: 'Chave salva. O "Converse com a Winners" já pode ser usado.' })
        formRef.current?.reset()
        router.refresh()
      } else {
        setMsg({ tipo: 'erro', texto: r.error ?? 'Falha ao salvar.' })
      }
    })
  }

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="size-4 text-primary" />
          Converse com a Winners — API do Claude
          {configurada ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="size-3.5" /> configurado
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
              <CircleDashed className="size-3.5" /> falta configurar
            </span>
          )}
        </CardTitle>
        <CardDescription>
          O chat{' '}
          <Link href="/converse" className="underline underline-offset-2">
            Converse com a Winners
          </Link>{' '}
          usa a API do Claude (Anthropic). Crie uma chave em console.anthropic.com → API Keys e cole abaixo. Ela fica
          guardada criptografada no banco; a tela mostra só os 4 últimos caracteres. Dica: defina um limite de gasto
          mensal no console da Anthropic.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!status.disponivel ? (
          <p className="text-sm text-muted-foreground">O cofre do banco ainda não foi preparado para esta chave.</p>
        ) : (
          <>
            {configurada && (
              <p className="text-sm text-muted-foreground">
                {status.origem === 'ambiente'
                  ? `Chave definida no servidor (variável de ambiente), terminando em …${status.final}.`
                  : `Chave cadastrada em ${data(status.atualizadoEm)}, terminando em …${status.final}.`}
              </p>
            )}
            <form ref={formRef} action={salvar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1.5 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <KeyRound className="size-4 text-primary" /> {configurada ? 'Trocar a chave' : 'Chave da API'}
                </span>
                <input
                  type="password"
                  name="chave"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-ant-…"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </label>
              <Button type="submit" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar chave'}
              </Button>
            </form>
            {msg && (
              <p className={msg.tipo === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-destructive'}>{msg.texto}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
