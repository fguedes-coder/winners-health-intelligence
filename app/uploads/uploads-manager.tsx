'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Brain,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Hospital,
  Loader2,
  Trash2,
  UploadCloud,
  Users,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatBRL } from '@/lib/data'
import {
  cancelarImportacao,
  confirmarImportacao,
  processarUpload,
  type Importacao,
  type PreviewResult,
} from './actions'

type ClienteOption = { id: string; nome: string }

const inputClass =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring placeholder:text-muted-foreground'

function formatBytes(bytes: number) {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// "2026-02" -> "Fev/2026"; "2026-02-24" -> "24/02/2026"
function formatCompetencia(value: string | null) {
  if (!value) return '—'
  const m = value.match(/^(\d{4})-(\d{2})$/)
  if (m) {
    const meses = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ]
    return `${meses[Number(m[2]) - 1]}/${m[1]}`
  }
  return value
}

function formatDateBR(value: string | null) {
  if (!value) return '—'
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value
}

export function UploadsManager({
  importacoes,
  clientes,
}: {
  importacoes: Importacao[]
  clientes: ClienteOption[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [clienteId, setClienteId] = useState('')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [competencia, setCompetencia] = useState('')
  const [duplicado, setDuplicado] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function handleProcess(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const clienteNome = clientes.find((c) => c.id === clienteId)?.nome ?? ''
    formData.set('cliente_nome', clienteNome)

    startTransition(async () => {
      const result = await processarUpload(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setPreview({ ...result, clienteNome })
      setCompetencia(result.competenciaSugerida ?? '')
      setDuplicado(false)
      router.refresh()
    })
  }

  function handleConfirm(substituir = false) {
    if (!preview?.importacaoId) return
    if (!competencia) {
      setError('Selecione a competência (mês/ano) antes de confirmar.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await confirmarImportacao(preview.importacaoId!, competencia, {
        substituir,
      })
      if (result?.duplicado) {
        setDuplicado(true)
        return
      }
      if (result?.error) {
        setError(result.error)
        return
      }
      setDuplicado(false)
      resetForm()
      router.refresh()
    })
  }

  function handleCancelPreview() {
    if (!preview?.importacaoId) return
    startTransition(async () => {
      await cancelarImportacao(preview.importacaoId!, '')
      resetForm()
      router.refresh()
    })
  }

  function resetForm() {
    formRef.current?.reset()
    setClienteId('')
    setFileName('')
    setPreview(null)
    setCompetencia('')
    setDuplicado(false)
  }

  function handleDelete(imp: Importacao) {
    setDeletingId(imp.id)
    startTransition(async () => {
      await cancelarImportacao(imp.id, imp.arquivo_path)
      setDeletingId(null)
      router.refresh()
    })
  }

  const hasClientes = clientes.length > 0

  // Tela de conferência
  if (preview) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="size-5 text-primary" />
              <CardTitle>Conferência da importação</CardTitle>
            </div>
            <Badge variant="warning">Aguardando confirmação</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              Revise os dados identificados automaticamente no arquivo antes de
              confirmar a importação definitiva.
            </p>

            {/* Resumo principal */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ResumoBox label="Cliente" value={preview.clienteNome || '—'} />
              <ResumoBox
                label="Apólice identificada"
                value={preview.apolice || '—'}
              />
              <ResumoBox
                label="Período de atendimento"
                value={`${formatDateBR(preview.periodoInicio ?? null)} a ${formatDateBR(
                  preview.periodoFim ?? null,
                )}`}
              />
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <label
                  htmlFor="competencia"
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Competência *
                </label>
                <input
                  id="competencia"
                  type="month"
                  value={competencia}
                  onChange={(e) => setCompetencia(e.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm font-medium text-foreground outline-none focus:border-ring"
                />
                {preview.competenciaSugerida && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Sugerida pelo arquivo:{' '}
                    {formatCompetencia(preview.competenciaSugerida)}
                  </p>
                )}
              </div>
            </div>

            <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              Este arquivo contém apenas beneficiários com utilização no
              período. Ele não representa as vidas ativas da apólice nem o valor
              da fatura/prêmio.
            </p>

            {/* Validação das competências identificadas no arquivo */}
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ClipboardCheck className="size-4 text-primary" />
                Validação das competências (por data de pagamento)
              </h3>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <ResumoBox
                  label="Competências de faturamento"
                  value={String(preview.competenciasDisponiveis?.length ?? 0)}
                />
                <ResumoBox
                  label="Menor data de atendimento"
                  value={formatDateBR(preview.periodoInicio ?? null)}
                />
                <ResumoBox
                  label="Maior data de atendimento"
                  value={formatDateBR(preview.periodoFim ?? null)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Competências carregadas (base do dashboard)
                </span>
                {preview.competenciasDisponiveis &&
                preview.competenciasDisponiveis.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {preview.competenciasDisponiveis.map((c) => (
                      <Badge key={c} variant="neutral">
                        {formatCompetencia(c)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Nenhuma data de pagamento válida encontrada no arquivo.
                  </span>
                )}
              </div>
              {preview.competenciasAtendimento &&
                preview.competenciasAtendimento.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    O serviço foi prestado entre{' '}
                    {formatCompetencia(preview.competenciasAtendimento[0])} e{' '}
                    {formatCompetencia(
                      preview.competenciasAtendimento[
                        preview.competenciasAtendimento.length - 1
                      ],
                    )}{' '}
                    (data de atendimento), mas o consolidado usa o mês de
                    pagamento.
                  </p>
                )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <KpiBox
                icon={Users}
                label="Benef. com utilização"
                value={String(preview.beneficiariosComUtilizacao ?? 0)}
              />
              <KpiBox
                icon={Users}
                label="Titulares"
                value={String(preview.titularesUnicos ?? 0)}
              />
              <KpiBox
                icon={Users}
                label="Dependentes"
                value={String(preview.dependentesUnicos ?? 0)}
              />
              <KpiBox
                icon={Building2}
                label="Subestipulantes"
                value={String(preview.totalSubestipulantes ?? 0)}
              />
              <KpiBox
                icon={FileText}
                label="Eventos"
                value={String(preview.totalEventos ?? 0)}
              />
              <KpiBox
                icon={UploadCloud}
                label="Utilização"
                value={formatBRL(preview.valorTotalUtilizacao ?? 0)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiBox
                icon={Hospital}
                label="Internações"
                value={String(preview.totalInternacoes ?? 0)}
              />
              <KpiBox
                icon={Brain}
                label="Saúde mental"
                value={String(preview.totalSaudeMental ?? 0)}
              />
            </div>

            {/* Subestipulantes */}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Subestipulantes / filiais
              </h3>
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Código</TableHead>
                      <TableHead>Razão social</TableHead>
                      <TableHead className="text-right">Vidas</TableHead>
                      <TableHead className="text-right">Eventos</TableHead>
                      <TableHead className="pr-4 text-right">
                        Utilização
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(preview.subestipulantes ?? []).map((s) => (
                      <TableRow key={s.codigo}>
                        <TableCell className="pl-4 font-medium text-foreground">
                          {s.codigo}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.razaoSocial || '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.vidas}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.eventos}
                        </TableCell>
                        <TableCell className="pr-4 text-right tabular-nums">
                          {formatBRL(s.valorUtilizacao)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Tops */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <RankTable
                title="Top prestadores"
                rows={(preview.topPrestadores ?? []).map((p) => ({
                  nome: p.nome,
                  detalhe: `${p.eventos} evento(s)`,
                  valor: p.valor,
                }))}
              />
              <RankTable
                title="Top utilizadores"
                rows={(preview.topUtilizadores ?? []).map((u) => ({
                  nome: u.nome,
                  detalhe: u.detalhe ?? '',
                  valor: u.valor,
                }))}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertTriangle className="size-4" />
                {error}
              </p>
            )}

            {duplicado && (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-3 text-sm text-foreground"
              >
                <span className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="size-4 text-warning" />
                  Já existe uma importação confirmada para este cliente, apólice
                  e competência ({formatCompetencia(competencia)}).
                </span>
                <span className="text-xs text-muted-foreground">
                  Você pode substituir os dados existentes por este arquivo ou
                  descartar esta importação.
                </span>
                <div className="mt-1 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => handleConfirm(true)}
                  >
                    Substituir dados existentes
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => setDuplicado(false)}
                  >
                    Voltar
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={handleCancelPreview}
              >
                <X className="size-4" />
                Descartar
              </Button>
              <Button
                type="button"
                disabled={isPending || duplicado}
                onClick={() => handleConfirm(false)}
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {isPending ? 'Importando...' : 'Confirmar importação'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Importar utilização (TXT SulAmérica)</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasClientes ? (
            <div className="rounded-lg border border-border bg-background/40 px-4 py-6 text-center text-sm text-muted-foreground">
              Cadastre um cliente antes de importar arquivos.
            </div>
          ) : (
            <form
              ref={formRef}
              onSubmit={handleProcess}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5 sm:max-w-sm">
                <label
                  htmlFor="cliente_id"
                  className="text-sm font-medium text-foreground"
                >
                  Cliente
                </label>
                <select
                  id="cliente_id"
                  name="cliente_id"
                  required
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Selecione o cliente</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  Arquivo TXT
                </span>
                <label
                  htmlFor="arquivo"
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background/40 px-6 py-8 text-center transition-colors hover:border-ring"
                >
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <UploadCloud className="size-6" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {fileName || 'Clique para selecionar o arquivo TXT'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    A apólice e os beneficiários são identificados
                    automaticamente; a competência é confirmada por você.
                  </span>
                  <input
                    id="arquivo"
                    name="arquivo"
                    type="file"
                    accept=".txt,text/plain"
                    required
                    className="sr-only"
                    onChange={(e) =>
                      setFileName(e.target.files?.[0]?.name ?? '')
                    }
                  />
                </label>
              </div>

              {error && (
                <p
                  role="alert"
                  className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertTriangle className="size-4" />
                  {error}
                </p>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UploadCloud className="size-4" />
                  )}
                  {isPending ? 'Processando...' : 'Processar arquivo'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Importações</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Arquivo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Apólice</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead className="text-right">Beneficiários</TableHead>
                <TableHead className="text-right">Utilização</TableHead>
                <TableHead>Enviado em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {importacoes.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhuma importação realizada
                  </TableCell>
                </TableRow>
              ) : (
                importacoes.map((imp) => (
                  <TableRow key={imp.id}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <FileText className="size-5 shrink-0 text-muted-foreground" />
                        <div>
                          <span className="font-medium text-foreground">
                            {imp.arquivo_nome}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatBytes(imp.tamanho)} ·{' '}
                            {imp.total_eventos} eventos
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {imp.cliente_nome || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {imp.apolice_numero || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatCompetencia(imp.competencia)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {imp.total_beneficiarios ?? imp.total_vidas}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {imp.total_titulares ?? 0} tit · {imp.total_dependentes ?? 0} dep
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                      {formatBRL(Number(imp.valor_total_utilizacao ?? 0))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(imp.created_at)}
                    </TableCell>
                    <TableCell>
                      {imp.status === 'confirmado' ? (
                        <Badge variant="success">
                          <CheckCircle2 className="size-3" />
                          Importado
                        </Badge>
                      ) : (
                        <Badge variant="warning">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Excluir ${imp.arquivo_nome}`}
                          className="text-muted-foreground hover:text-destructive"
                          disabled={isPending && deletingId === imp.id}
                          onClick={() => handleDelete(imp)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function ResumoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">
        {value}
      </p>
    </div>
  )
}

function KpiBox({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-semibold text-foreground">
          {value}
        </p>
      </div>
    </div>
  )
}

function RankTable({
  title,
  rows,
}: {
  title: string
  rows: { nome: string; detalhe: string; valor: number }[]
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">#</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="pr-4 text-right">Utilização</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Sem dados
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={`${r.nome}-${i}`}>
                  <TableCell className="pl-4 text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell>
                    <span className="block font-medium text-foreground">
                      {r.nome}
                    </span>
                    {r.detalhe && (
                      <span className="block text-xs text-muted-foreground">
                        {r.detalhe}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right font-medium tabular-nums text-foreground">
                    {formatBRL(r.valor)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
