'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2, Users, X } from 'lucide-react'
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
import { deleteFatura, upsertFatura, type FaturaRegistro } from './actions'

const inputClass =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring placeholder:text-muted-foreground'

type ApoliceOpt = {
  id: string
  numero: string | null
  cliente: string | null
  cliente_id: string | null
}

function formatComp(c: string) {
  const [ano, mes] = c.split('-')
  return `${mes}/${ano}`
}

export function FaturasManager({
  faturas,
  apolices,
  utilizacaoPorComp,
}: {
  faturas: FaturaRegistro[]
  apolices: ApoliceOpt[]
  utilizacaoPorComp: Record<string, number>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FaturaRegistro | null>(null)
  const [deleting, setDeleting] = useState<FaturaRegistro | null>(null)
  const [error, setError] = useState<string | null>(null)

  function openNew() {
    setEditing(null)
    setError(null)
    setFormOpen(true)
  }

  function openEdit(f: FaturaRegistro) {
    setEditing(f)
    setError(null)
    setFormOpen(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await upsertFatura(formData)
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
      const result = await deleteFatura(deleting.id)
      if (result?.error) {
        setError(result.error)
        return
      }
      setDeleting(null)
      router.refresh()
    })
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Users className="size-4 text-primary" />
            Fatura e vidas por competência
          </h2>
          <p className="text-sm text-muted-foreground">
            Cadastre o valor da fatura e o total de vidas ativas de cada mês
            para calcular sinistralidade e taxa de utilização.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" />
          Lançar competência
        </Button>
      </div>
      <CardContent className="px-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Competência</TableHead>
              <TableHead className="text-right">Valor da Fatura</TableHead>
              <TableHead className="text-right">Total de Vidas</TableHead>
              <TableHead className="text-right">Utilizado</TableHead>
              <TableHead className="text-right">Sinistralidade</TableHead>
              <TableHead className="pr-6 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {faturas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Nenhuma competência cadastrada. Lance a fatura mensal e o total
                  de vidas para habilitar os indicadores.
                </TableCell>
              </TableRow>
            ) : (
              faturas.map((f) => {
                const util = utilizacaoPorComp[f.competencia] ?? null
                const sin =
                  f.valor && f.valor > 0 && util !== null
                    ? (util / f.valor) * 100
                    : null
                return (
                  <TableRow key={f.id}>
                    <TableCell className="pl-6">
                      <span className="font-medium text-foreground">
                        {formatComp(f.competencia)}
                      </span>
                      {f.apolice_nome && (
                        <span className="block text-xs text-muted-foreground">
                          {f.apolice_nome}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.valor === null ? '—' : formatBRL(f.valor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.vidas_ativas === null
                        ? '—'
                        : formatNumber(f.vidas_ativas)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {util === null ? '—' : formatBRL(util)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sin === null
                        ? '—'
                        : `${sin.toLocaleString('pt-BR', {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}%`}
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Editar competência ${formatComp(f.competencia)}`}
                          onClick={() => openEdit(f)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Excluir competência ${formatComp(f.competencia)}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setError(null)
                            setDeleting(f)
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>

      {formOpen && (
        <Modal
          title={editing ? 'Editar competência' : 'Lançar competência'}
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="competencia"
                className="text-sm font-medium text-foreground"
              >
                Competência (mês/ano)
              </label>
              <input
                id="competencia"
                name="competencia"
                type="month"
                required
                defaultValue={editing?.competencia ?? ''}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="apolice_id"
                className="text-sm font-medium text-foreground"
              >
                Apólice
              </label>
              <select
                id="apolice_id"
                name="apolice_id"
                defaultValue={editing?.apolice_id ?? apolices[0]?.id ?? ''}
                className={inputClass}
                onChange={(e) => {
                  const opt = apolices.find((a) => a.id === e.target.value)
                  const form = e.currentTarget.form
                  if (!form) return
                  const setHidden = (name: string, value: string) => {
                    const el = form.elements.namedItem(
                      name,
                    ) as HTMLInputElement | null
                    if (el) el.value = value
                  }
                  setHidden(
                    'apolice_nome',
                    opt?.numero
                      ? `${opt.numero}${opt.cliente ? ` - ${opt.cliente}` : ''}`
                      : '',
                  )
                  setHidden('cliente_id', opt?.cliente_id ?? '')
                  setHidden('cliente_nome', opt?.cliente ?? '')
                }}
              >
                {apolices.length === 0 && <option value="">Sem apólice</option>}
                {apolices.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.numero ?? 'Sem número'}
                    {a.cliente ? ` - ${a.cliente}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const first = editing
                ? apolices.find((a) => a.id === editing.apolice_id)
                : apolices[0]
              return (
                <>
                  <input
                    type="hidden"
                    name="apolice_nome"
                    defaultValue={
                      editing?.apolice_nome ??
                      (first?.numero
                        ? `${first.numero}${first.cliente ? ` - ${first.cliente}` : ''}`
                        : '')
                    }
                  />
                  <input
                    type="hidden"
                    name="cliente_id"
                    defaultValue={editing?.cliente_id ?? first?.cliente_id ?? ''}
                  />
                  <input
                    type="hidden"
                    name="cliente_nome"
                    defaultValue={editing?.cliente_nome ?? first?.cliente ?? ''}
                  />
                </>
              )
            })()}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="valor"
                  className="text-sm font-medium text-foreground"
                >
                  Valor da fatura (R$)
                </label>
                <input
                  id="valor"
                  name="valor"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={editing?.valor ?? ''}
                  placeholder="Ex.: 125000.00"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="vidas"
                  className="text-sm font-medium text-foreground"
                >
                  Total de vidas da apólice
                </label>
                <input
                  id="vidas"
                  name="vidas"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={editing?.vidas_ativas ?? ''}
                  placeholder="Ex.: 120"
                  className={inputClass}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Informe ao menos um dos campos. O valor da fatura calcula a
              sinistralidade; o total de vidas calcula a taxa de utilização e o
              custo médio por vida.
            </p>

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
                {isPending ? 'Salvando...' : 'Salvar lançamento'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title="Excluir competência" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir o lançamento de{' '}
            <span className="font-medium text-foreground">
              {formatComp(deleting.competencia)}
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
    </Card>
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
