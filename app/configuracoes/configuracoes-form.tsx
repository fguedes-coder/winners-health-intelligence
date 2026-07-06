'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Building2,
  CheckCircle2,
  ShieldCheck,
  TriangleAlert,
  User,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  alterarSenha,
  salvarPerfil,
  type PerfilData,
} from './actions'

const inputClass =
  'h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring placeholder:text-muted-foreground'

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  placeholder,
}: {
  label: string
  name: string
  defaultValue?: string
  type?: string
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  )
}

function Toggle({
  label,
  description,
  name,
  defaultChecked,
}: {
  label: string
  description: string
  name: string
  defaultChecked?: boolean
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/40 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-5 shrink-0 rounded accent-primary"
      />
    </label>
  )
}

type Feedback = { kind: 'success' | 'error'; message: string } | null

function FeedbackBanner({
  feedback,
  onClose,
}: {
  feedback: Feedback
  onClose: () => void
}) {
  if (!feedback) return null
  const isError = feedback.kind === 'error'
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${
        isError
          ? 'border-destructive/30 bg-destructive/10'
          : 'border-emerald-500/30 bg-emerald-500/10'
      }`}
    >
      {isError ? (
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
      )}
      <p className="flex-1 text-pretty text-foreground">{feedback.message}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar aviso"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

export function ConfiguracoesForm({ perfil }: { perfil: PerfilData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Feedback>(null)

  const [senhaOpen, setSenhaOpen] = useState(false)
  const [senhaPending, startSenhaTransition] = useTransition()
  const [senhaFeedback, setSenhaFeedback] = useState<Feedback>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')

  function handleSalvar(formData: FormData) {
    setFeedback(null)
    startTransition(async () => {
      const res = await salvarPerfil(formData)
      if (res.error) {
        setFeedback({ kind: 'error', message: res.error })
        return
      }
      const msg = res.emailConfirmacao
        ? 'Dados salvos. Enviamos um e-mail de confirmação para o novo endereço — confirme para concluir a troca.'
        : (res.success ?? 'Dados atualizados com sucesso.')
      setFeedback({ kind: 'success', message: msg })
      router.refresh()
    })
  }

  function handleAlterarSenha() {
    setSenhaFeedback(null)
    const formData = new FormData()
    formData.set('novaSenha', novaSenha)
    formData.set('confirmarSenha', confirmarSenha)
    startSenhaTransition(async () => {
      const res = await alterarSenha(formData)
      if (res.error) {
        setSenhaFeedback({ kind: 'error', message: res.error })
        return
      }
      setSenhaFeedback({
        kind: 'success',
        message: res.success ?? 'Senha alterada com sucesso.',
      })
      setNovaSenha('')
      setConfirmarSenha('')
      setTimeout(() => {
        setSenhaOpen(false)
        setSenhaFeedback(null)
      }, 2000)
    })
  }

  function closeSenha() {
    setSenhaOpen(false)
    setSenhaFeedback(null)
    setNovaSenha('')
    setConfirmarSenha('')
  }

  return (
    <form
      action={handleSalvar}
      className="grid max-w-4xl grid-cols-1 gap-6"
    >
      <FeedbackBanner feedback={feedback} onClose={() => setFeedback(null)} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="size-4 text-primary" />
            Perfil do usuário
          </CardTitle>
          <CardDescription>Atualize suas informações pessoais</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Nome completo"
            name="nome"
            defaultValue={perfil.nome}
            placeholder="Seu nome"
          />
          <Field
            label="Cargo"
            name="cargo"
            defaultValue={perfil.cargo}
            placeholder="Seu cargo"
          />
          <Field
            label="E-mail"
            name="email"
            type="email"
            defaultValue={perfil.email}
            placeholder="voce@empresa.com.br"
          />
          <Field
            label="Telefone"
            name="telefone"
            defaultValue={perfil.telefone}
            placeholder="(00) 00000-0000"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            Organização
          </CardTitle>
          <CardDescription>Dados da corretora</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Razão social"
            name="razaoSocial"
            defaultValue={perfil.razaoSocial}
            placeholder="Nome da corretora"
          />
          <Field
            label="CNPJ"
            name="cnpj"
            defaultValue={perfil.cnpj}
            placeholder="00.000.000/0000-00"
          />
          <Field
            label="Plano"
            name="plano"
            defaultValue={perfil.plano}
            placeholder="Plano contratado"
          />
          <Field
            label="Responsável"
            name="responsavel"
            defaultValue={perfil.responsavel}
            placeholder="Área responsável"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4 text-primary" />
            Notificações
          </CardTitle>
          <CardDescription>Defina quando deseja ser alertado</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Toggle
            label="Alerta de sinistralidade"
            description="Receber e-mail quando a sinistralidade ultrapassar 80%"
            name="alertaSinistralidade"
            defaultChecked={perfil.alertaSinistralidade}
          />
          <Toggle
            label="Renovação de apólices"
            description="Avisar 60 dias antes do vencimento"
            name="renovacaoApolices"
            defaultChecked={perfil.renovacaoApolices}
          />
          <Toggle
            label="Processamento de uploads"
            description="Notificar ao concluir o processamento de arquivos"
            name="processamentoUploads"
            defaultChecked={perfil.processamentoUploads}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            Segurança
          </CardTitle>
          <CardDescription>Gerencie o acesso à sua conta</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!senhaOpen ? (
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSenhaOpen(true)}
              >
                Alterar senha
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-background/40 p-4">
              <FeedbackBanner
                feedback={senhaFeedback}
                onClose={() => setSenhaFeedback(null)}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="novaSenha"
                    className="text-sm font-medium text-foreground"
                  >
                    Nova senha
                  </label>
                  <input
                    id="novaSenha"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    className={inputClass}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="confirmarSenha"
                    className="text-sm font-medium text-foreground"
                  >
                    Confirmar nova senha
                  </label>
                  <input
                    id="confirmarSenha"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repita a nova senha"
                    className={inputClass}
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={handleAlterarSenha}
                  disabled={senhaPending}
                >
                  {senhaPending ? 'Salvando...' : 'Confirmar nova senha'}
                </Button>
                <Button type="button" variant="ghost" onClick={closeSenha}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.refresh()}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar alterações'}
        </Button>
      </div>
    </form>
  )
}
