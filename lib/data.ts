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

// Moeda com centavos (ex.: "R$ 48.732,10"); usada na Jornada Assistencial.
export const formatBRLCents = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

export const formatNumber = (value: number) =>
  new Intl.NumberFormat('pt-BR').format(value)
