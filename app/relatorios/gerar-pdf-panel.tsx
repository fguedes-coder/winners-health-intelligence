'use client'

import { useRef, useState, useTransition } from 'react'
import {
  FileText,
  ImageUp,
  Loader2,
  Trash2,
  ExternalLink,
  Check,
  ShieldCheck,
  User,
  Lock,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  PERFIS,
  PERFIS_ORDEM,
  type ModoPrivacidade,
} from '@/lib/anonimizar'
import {
  salvarNomeCliente,
  uploadLogoCliente,
  removerLogoCliente,
  type RelatorioConfig,
} from './actions'

export function GerarPdfPanel({
  config,
  mes = [],
}: {
  config: RelatorioConfig
  mes?: string[]
}) {
  const [nome, setNome] = useState(config.clienteNome ?? '')
  const [modo, setModo] = useState<ModoPrivacidade>('nominal')
  const [logoUrl, setLogoUrl] = useState(config.logoClienteUrl)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, startSalvar] = useTransition()
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function salvarNome() {
    setMsg(null)
    setErro(null)
    startSalvar(async () => {
      const r = await salvarNomeCliente(nome)
      if (r.ok) setMsg('Nome do cliente salvo.')
      else setErro(r.error ?? 'Falha ao salvar.')
    })
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg(null)
    setErro(null)
    setEnviando(true)
    const fd = new FormData()
    fd.append('logo', file)
    const r = await uploadLogoCliente(fd)
    setEnviando(false)
    if (r.ok && r.url) {
      setLogoUrl(r.url)
      setMsg('Logo enviado com sucesso.')
    } else {
      setErro(r.error ?? 'Falha no upload.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function removerLogo() {
    setMsg(null)
    setErro(null)
    startSalvar(async () => {
      const r = await removerLogoCliente()
      if (r.ok) {
        setLogoUrl(null)
        setMsg('Logo removido.')
      } else setErro(r.error ?? 'Falha ao remover.')
    })
  }

  function abrirRelatorio(modoForcado?: ModoPrivacidade) {
    const modoFinal = modoForcado ?? modo
    const params = new URLSearchParams()
    if (mes.length) params.set('mes', mes.join(','))
    if (modoFinal === 'anonimizado') params.set('privacidade', 'anonimizado')
    const qs = params.toString()
    window.open(`/relatorios/pdf${qs ? `?${qs}` : ''}`, '_blank', 'noopener')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-5 text-primary" />
          Relatório Executivo em PDF
        </CardTitle>
        <CardDescription>
          Gera um documento corporativo com capa, sumário, gráficos, tabelas e
          análise executiva — pronto para apresentação ao RH, financeiro e diretoria.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Nome do cliente */}
          <div className="flex flex-col gap-2">
            <label htmlFor="cliente-nome" className="text-sm font-medium text-foreground">
              Nome do cliente (capa)
            </label>
            <div className="flex gap-2">
              <input
                id="cliente-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Indústria Acme S.A."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button variant="secondary" onClick={salvarNome} disabled={salvando}>
                {salvando ? <Loader2 className="size-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </div>

          {/* Logo do cliente */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Logo do cliente (capa)</span>
            <div className="flex items-center gap-3">
              <div className="flex h-10 flex-1 items-center gap-3 rounded-md border border-border bg-muted/40 px-3">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl || '/placeholder.svg'}
                    alt="Logo do cliente"
                    className="h-7 w-auto max-w-32 object-contain"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">Nenhum logo enviado</span>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={onFile}
                className="hidden"
              />
              <Button
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={enviando}
              >
                {enviando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImageUp className="size-4" />
                )}
                Enviar
              </Button>
              {logoUrl && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={removerLogo}
                  disabled={salvando}
                  aria-label="Remover logo"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {(msg || erro) && (
          <p
            className={`flex items-center gap-2 text-sm ${
              erro ? 'text-destructive' : 'text-success'
            }`}
          >
            {!erro && <Check className="size-4" />}
            {erro ?? msg}
          </p>
        )}

        {/* Privacidade / LGPD */}
        <div className="flex flex-col gap-3 border-t border-border pt-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Privacidade do relatório (LGPD)
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PrivacidadeOption
              ativo={modo === 'nominal'}
              onClick={() => setModo('nominal')}
              icone={<User className="size-4" />}
              titulo="Relatório Nominal"
              descricao="Exibe os nomes dos beneficiários. Uso interno restrito."
            />
            <PrivacidadeOption
              ativo={modo === 'anonimizado'}
              onClick={() => setModo('anonimizado')}
              icone={<Lock className="size-4" />}
              titulo="Relatório Anonimizado (LGPD)"
              descricao="Substitui nomes por identificadores (RISCO-001, ...), preservando todos os indicadores."
            />
          </div>
        </div>

        {/* Estrutura de perfis (permissões futuras) */}
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              Perfis de acesso
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Em breve
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Em breve, o modo de privacidade será aplicado automaticamente conforme
            o perfil do usuário.
          </p>
          <ul className="flex flex-wrap gap-2">
            {PERFIS_ORDEM.map((p) => {
              const perfil = PERFIS[p]
              return (
                <li
                  key={p}
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5"
                  title={perfil.descricao}
                >
                  <span className="text-sm font-medium text-foreground">
                    {perfil.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {perfil.modoSugerido === 'anonimizado'
                      ? 'Anonimizado'
                      : 'Nominal'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            O PDF é gerado nativamente e abre em uma nova aba, pronto para{' '}
            <span className="font-medium text-foreground">salvar ou compartilhar</span>{' '}
            — com capa institucional, cabeçalho e rodapé próprios.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="secondary"
              onClick={() => abrirRelatorio('anonimizado')}
              className="shrink-0"
            >
              <Lock className="size-4" />
              Gerar Anonimizado (LGPD)
            </Button>
            <Button onClick={() => abrirRelatorio()} className="shrink-0">
              <ExternalLink className="size-4" />
              Gerar relatório executivo
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PrivacidadeOption({
  ativo,
  onClick,
  icone,
  titulo,
  descricao,
}: {
  ativo: boolean
  onClick: () => void
  icone: React.ReactNode
  titulo: string
  descricao: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`flex flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors ${
        ativo
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border bg-background hover:border-primary/50'
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className={ativo ? 'text-primary' : 'text-muted-foreground'}>
          {icone}
        </span>
        {titulo}
        {ativo && <Check className="ml-auto size-4 text-primary" />}
      </span>
      <span className="text-xs leading-relaxed text-muted-foreground">
        {descricao}
      </span>
    </button>
  )
}
