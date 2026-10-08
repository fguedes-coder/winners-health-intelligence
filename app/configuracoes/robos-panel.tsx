'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bot, CheckCircle2, CircleDashed, KeyRound, Loader2, Lock, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { salvarAcessoSulAmerica, type StatusRoboSulAmerica } from './robos-actions'

const inputClass =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring placeholder:text-muted-foreground'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const mesRef = (c: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(c)
  return m ? `${MESES[Number(m[2]) - 1]}/${m[1]}` : c
}
const data = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })
    : ''

const ROTULO_STATUS: Record<string, string> = {
  pendente: 'na fila',
  executando: 'buscando agora',
  aguardando: 'aguardando liberação da SulAmérica',
  pronto: 'arquivo pronto para importação',
  importado: 'importado',
  erro: 'falhou',
}

export function RobosPanel({ status }: { status: StatusRoboSulAmerica }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [salvando, startSalvar] = useTransition()
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const c = status.credenciais
  const completo = Object.values(c).every((x) => x.cadastrada)

  function salvar(formData: FormData) {
    setMsg(null)
    startSalvar(async () => {
      const r = await salvarAcessoSulAmerica(formData)
      if (r.ok) {
        setMsg({ tipo: 'ok', texto: 'Acesso salvo. O robô usa os novos dados já na próxima busca.' })
        formRef.current?.reset()
        router.refresh()
      } else {
        setMsg({ tipo: 'erro', texto: r.error ?? 'Falha ao salvar.' })
      }
    })
  }

  const senhaPlaceholder = (s: { cadastrada: boolean; atualizadoEm: string | null }) =>
    s.cadastrada ? `cadastrada em ${data(s.atualizadoEm)} — deixe em branco para manter` : 'digite a senha'

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            Robô do TXT SulAmérica
            {completo ? (
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
            Entra no portal SulAmérica Integra, lê o token de acesso no e-mail, baixa o
            arquivo TXT de contas pagas do mês anterior e o deixa pronto no{' '}
            <Link href="/uploads" className="underline underline-offset-2">Upload</Link>.
            Roda sozinho todo dia 3 (repete nos dias 4 e 5 se o arquivo ainda não tiver
            saído) ou quando você clica em <strong>Buscar agora</strong>. A importação
            continua sendo sua.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {status.ultimaBusca && (
            <p className="text-sm text-muted-foreground">
              Última busca: <strong className="text-foreground">{mesRef(status.ultimaBusca.competencia)}</strong>{' '}
              — {ROTULO_STATUS[status.ultimaBusca.status] ?? status.ultimaBusca.status} ({data(status.ultimaBusca.quando)})
              {status.ultimaBusca.status === 'erro' && status.ultimaBusca.mensagem
                ? `: ${status.ultimaBusca.mensagem}`
                : ''}
            </p>
          )}

          {!status.disponivel ? (
            <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
              <TriangleAlert className="size-4" />
              O cofre de credenciais ainda não foi ativado no banco.
            </p>
          ) : (
            <form ref={formRef} action={salvar} className="flex flex-col gap-5">
              <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <legend className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <KeyRound className="size-4 text-primary" /> Portal SulAmérica Integra
                </legend>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">Login</span>
                  <input
                    name="login"
                    type="email"
                    autoComplete="off"
                    defaultValue={c.sulamerica_login.valor ?? ''}
                    placeholder="login@empresa.com.br"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">Senha</span>
                  <input
                    name="senha"
                    type="password"
                    autoComplete="new-password"
                    placeholder={senhaPlaceholder(c.sulamerica_senha)}
                    className={inputClass}
                  />
                </label>
              </fieldset>

              <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <legend className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <KeyRound className="size-4 text-primary" /> E-mail que recebe o token
                </legend>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">E-mail</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="off"
                    defaultValue={c.sulamerica_imap_usuario.valor ?? ''}
                    placeholder="o mesmo do login, em geral"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">Senha do e-mail</span>
                  <input
                    name="senha_email"
                    type="password"
                    autoComplete="new-password"
                    placeholder={senhaPlaceholder(c.sulamerica_imap_senha)}
                    className={inputClass}
                  />
                </label>
              </fieldset>

              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-3.5 shrink-0" />
                As senhas são guardadas criptografadas e nunca são exibidas de novo — nem
                aqui. O robô abre o e-mail só para ler o token da SulAmérica, sem marcar,
                mover ou apagar mensagens.
              </p>

              {msg && (
                <p
                  role="status"
                  className={`rounded-lg px-3 py-2 text-sm ${
                    msg.tipo === 'ok' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {msg.texto}
                </p>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={salvando}>
                  {salvando ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                  Salvar acesso
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Novos robôs — como o de faturas e vidas ativas — aparecerão aqui, cada um com seu acesso.
      </p>
    </div>
  )
}
