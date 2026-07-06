export const empresa = {
  corretora: 'Winners Corretora',
  produto: 'Winners Health Intelligence',
}

export const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)

export const formatNumber = (value: number) =>
  new Intl.NumberFormat('pt-BR').format(value)
