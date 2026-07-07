'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatBRL, formatNumber } from '@/lib/data'
import type { SubestipulanteDetalhe } from '@/lib/queries'
import {
  createApolice,
  deleteApolice,
  updateApolice,
  type Apolice,
} from './actions'

const inputClass =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring placeholder:text-muted-foreground'

const statusOptions = ['Vigente', 'Renovação', 'Vencida']

function statusBadge(status: string) {
  switch (status) {
    case 'Vigente':
      return <Badge variant="success">{status}</Badge>
    case 'Renovação':
      return <Badge variant="warning">{status}</Badge>
    case 'Vencida':
      return <Badge variant="destructive">{status}</Badge>
    default:
      return <Badge variant="neutral">{status}</Badge>
  }
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function ApolicesManager({
  apolices,
  clientes,
  subsPorApolice,
}: {
  apolices: Apolice[]
  clientes: { id: string; nome: string }[]
  subsPorApolice: Record<string, SubestipulanteDetalhe[]>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Apolice | null>(null)
  const [deleting, setDeleting] = useState<Apolice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = apolices.filter((a) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      (a.numero ?? '').toLowerCase().includes(q) ||
      a.cliente.toLowerCase().includes(q) ||
      (a.operadora ?? '').toLowerCase().includes(q) ||
      a.status.toLowerCase().includes(q)
    )
  })

  const vigentes = apolices.filter((a) => a.status === 'Vigente').length
  const totalVidas = apolices.reduce((acc, a) => acc + (a.vidas ?? 0), 0)
  const totalPremio = apolices.reduce(
    (acc, a) => acc + Number(a.premio ?? 0),
    0,
  )

  function openNew() {
    setEditing(null)
    setError(null)
    setFormOpen(true)
  }

  function openEdit(apolice: Apolice) {
    setEditing(apolice)
    setError(null)
    setFormOpen(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = editing
        ? await updateApolice(editing.id, formData)
        : await createApolice(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setFormOpen(false)
      setEditing(null)
      router.refresh()
    })
  }

  function handleDelete() {
    if (!deleting) return
    setError(null)
    startTransition(async () => {
      const result = await deleteApolice(deleting.id)
      if (result?.error) {
        setError(result.error)
        return
      }
      setDeleting(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="gap-0 p-5">
          <span className="text-sm text-muted-foreground">
            Apólices vigentes
          </span>
          <span className="mt-2 text-2xl font-semibold text-foreground">
            {vigentes} / {apolices.length}
          </span>
        </Card>
        <Card className="gap-0 p-5">
          <span className="text-sm text-muted-foreground">Vidas cobertas</span>
          <span className="mt-2 text-2xl font-semibold text-foreground">
            {formatNumber(totalVidas)}
          </span>
        </Card>
        <Card className="gap-0 p-5">
          <span className="text-sm text-muted-foreground">
            Prêmio total anual
          </span>
          <span className="mt-2 text-2xl font-semibold text-foreground">
            {formatBRL(totalPremio)}
          </span>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 sm:w-72">
            <Search className="size-4 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar apólice ou cliente..."
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Button onClick={openNew}>
            <Plus className="size-4" />
            Nova apólice
          </Button>
        </div>
        <CardContent className="px-0 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Apólice</TableHead>
                <TableHead>Operadora</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead className="text-right">Vidas</TableHead>
                <TableHead className="text-right">Prêmio</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {apolices.length === 0
                      ? 'Nenhuma apólice cadastrada'
                      : 'Nenhuma apólice encontrada para a busca.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => {
                  const subs = subsPorApolice[a.id] ?? []
                  const isOpen = expanded.has(a.id)
                  return (
                  <Fragment key={a.id}>
                  <TableRow>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleExpand(a.id)}
                          disabled={subs.length === 0}
                          aria-label={
                            isOpen
                              ? 'Recolher subestipulantes'
                              : 'Expandir subestipulantes'
                          }
                          aria-expanded={isOpen}
                          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                        >
                          {isOpen ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                          <ShieldCheck className="size-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {a.numero || 'Sem número'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {a.cliente}
                            {subs.length > 0 && ` · ${subs.length} subestipulante(s)`}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.operadora || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(a.inicio)} — {formatDate(a.fim)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(a.vidas ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatBRL(Number(a.premio ?? 0))}
                    </TableCell>
                    <TableCell>{statusBadge(a.status)}</TableCell>
                    <TableCell className="pr-6">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Editar apólice de ${a.cliente}`}
                          onClick={() => openEdit(a)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Excluir apólice de ${a.cliente}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setError(null)
                            setDeleting(a)
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen && subs.length > 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="bg-muted/20 p-0">
                        <div className="px-6 py-4">
                          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                            <Building2 className="size-4 text-primary" />
                            Subestipulantes (filiais) da apólice {a.numero}
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="pl-0">Código</TableHead>
                                <TableHead>Razão social</TableHead>
                                <TableHead className="text-right">
                                  Vidas c/ Util.
                                </TableHead>
                                <TableHead className="text-right">
                                  Eventos
                                </TableHead>
                                <TableHead className="pr-0 text-right">
                                  Valor Utilizado
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {subs.map((s) => (
                                <TableRow key={s.codigo}>
                                  <TableCell className="pl-0 font-medium text-foreground">
                                    {s.codigo}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {s.razao}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatNumber(s.vidasUtil)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatNumber(s.eventos)}
                                  </TableCell>
                                  <TableCell className="pr-0 text-right font-medium tabular-nums">
                                    {formatBRL(s.valor)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {formOpen && (
        <Modal
          title={editing ? 'Editar apólice' : 'Nova apólice'}
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Número da apólice" htmlFor="numero">
                <input
                  id="numero"
                  name="numero"
                  defaultValue={editing?.numero ?? ''}
                  placeholder="Ex.: 81938"
                  className={inputClass}
                />
              </Field>
              <Field label="Cliente" htmlFor="cliente_id">
                <select
                  id="cliente_id"
                  name="cliente_id"
                  required
                  defaultValue={editing?.cliente_id ?? ''}
                  className={inputClass}
                  onChange={(e) => {
                    const nome =
                      clientes.find((c) => c.id === e.target.value)?.nome ?? ''
                    const hidden = e.currentTarget.form?.elements.namedItem(
                      'cliente',
                    ) as HTMLInputElement | null
                    if (hidden) hidden.value = nome
                  }}
                >
                  <option value="" disabled>
                    Selecione o cliente
                  </option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <input
              type="hidden"
              name="cliente"
              defaultValue={editing?.cliente ?? ''}
            />
            <Field label="Operadora" htmlFor="operadora">
              <input
                id="operadora"
                name="operadora"
                defaultValue={editing?.operadora ?? ''}
                placeholder="Ex.: Bradesco Saúde"
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Início da vigência" htmlFor="inicio">
                <input
                  id="inicio"
                  name="inicio"
                  type="date"
                  defaultValue={editing?.inicio ?? ''}
                  className={inputClass}
                />
              </Field>
              <Field label="Fim da vigência" htmlFor="fim">
                <input
                  id="fim"
                  name="fim"
                  type="date"
                  defaultValue={editing?.fim ?? ''}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Vidas" htmlFor="vidas">
                <input
                  id="vidas"
                  name="vidas"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={editing?.vidas ?? 0}
                  className={inputClass}
                />
              </Field>
              <Field label="Prêmio anual (R$)" htmlFor="premio">
                <input
                  id="premio"
                  name="premio"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={editing?.premio ?? 0}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Status" htmlFor="status">
              <select
                id="status"
                name="status"
                defaultValue={editing?.status ?? 'Vigente'}
                className={inputClass}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <div className="mt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? 'Salvando...'
                  : editing
                    ? 'Salvar alterações'
                    : 'Cadastrar apólice'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title="Excluir apólice" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir a apólice de{' '}
            <span className="font-medium text-foreground">
              {deleting.cliente}
            </span>
            ? Esta ação não pode ser desfeita.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleting(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              {isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
