'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
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
import {
  createCliente,
  deleteCliente,
  updateCliente,
  type Cliente,
} from './actions'

const inputClass =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring placeholder:text-muted-foreground'

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function ClientesManager({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [deleting, setDeleting] = useState<Cliente | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = clientes.filter((c) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      c.nome.toLowerCase().includes(q) ||
      (c.cnpj ?? '').toLowerCase().includes(q) ||
      (c.operadora ?? '').toLowerCase().includes(q)
    )
  })

  const totalVidas = clientes.reduce((acc, c) => acc + (c.vidas ?? 0), 0)
  const totalFatura = clientes.reduce(
    (acc, c) => acc + Number(c.valor_fatura ?? 0),
    0,
  )

  function openNew() {
    setEditing(null)
    setError(null)
    setFormOpen(true)
  }

  function openEdit(cliente: Cliente) {
    setEditing(cliente)
    setError(null)
    setFormOpen(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = editing
        ? await updateCliente(editing.id, formData)
        : await createCliente(formData)
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
      const result = await deleteCliente(deleting.id)
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
            Empresas clientes
          </span>
          <span className="mt-2 text-2xl font-semibold text-foreground">
            {clientes.length}
          </span>
        </Card>
        <Card className="gap-0 p-5">
          <span className="text-sm text-muted-foreground">Total de vidas</span>
          <span className="mt-2 text-2xl font-semibold text-foreground">
            {formatNumber(totalVidas)}
          </span>
        </Card>
        <Card className="gap-0 p-5">
          <span className="text-sm text-muted-foreground">
            Faturamento total
          </span>
          <span className="mt-2 text-2xl font-semibold text-foreground">
            {formatBRL(totalFatura)}
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
              placeholder="Buscar empresa, CNPJ ou operadora..."
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Button onClick={openNew}>
            <Plus className="size-4" />
            Novo cliente
          </Button>
        </div>
        <CardContent className="px-0 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Empresa</TableHead>
                <TableHead>Operadora</TableHead>
                <TableHead className="text-right">Vidas</TableHead>
                <TableHead className="text-right">Valor da fatura</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead className="pr-6 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {clientes.length === 0
                      ? 'Nenhum cliente cadastrado'
                      : 'Nenhum cliente encontrado para a busca.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Building2 className="size-4" />
                        </div>
                        <div>
                          <span className="font-medium text-foreground">
                            {c.nome}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {c.cnpj || 'CNPJ não informado'}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.operadora ? (
                        <Badge variant="outline">{c.operadora}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5 text-muted-foreground" />
                        {formatNumber(c.vidas ?? 0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                      {formatBRL(Number(c.valor_fatura ?? 0))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatCreatedAt(c.created_at)}
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Editar ${c.nome}`}
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Excluir ${c.nome}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setError(null)
                            setDeleting(c)
                          }}
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

      {formOpen && (
        <Modal
          title={editing ? 'Editar cliente' : 'Novo cliente'}
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Nome" htmlFor="nome">
              <input
                id="nome"
                name="nome"
                required
                defaultValue={editing?.nome ?? ''}
                placeholder="Razão social da empresa"
                className={inputClass}
              />
            </Field>
            <Field label="CNPJ" htmlFor="cnpj">
              <input
                id="cnpj"
                name="cnpj"
                defaultValue={editing?.cnpj ?? ''}
                placeholder="00.000.000/0000-00"
                className={inputClass}
              />
            </Field>
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
              <Field label="Valor da fatura (R$)" htmlFor="valor_fatura">
                <input
                  id="valor_fatura"
                  name="valor_fatura"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={editing?.valor_fatura ?? 0}
                  className={inputClass}
                />
              </Field>
            </div>

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
                    : 'Cadastrar cliente'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title="Excluir cliente" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir{' '}
            <span className="font-medium text-foreground">
              {deleting.nome}
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
