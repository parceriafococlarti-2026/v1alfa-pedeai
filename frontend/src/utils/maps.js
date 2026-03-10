export function gerarLinkRota(enderecoColeta, enderecoEntrega) {
  const origem = encodeURIComponent((enderecoColeta || '').trim())
  const destino = encodeURIComponent((enderecoEntrega || '').trim())
  return `https://www.google.com/maps/dir/?api=1&origin=${origem}&destination=${destino}&travelmode=driving`
}

export function temEnderecoCompleto(enderecoColeta, enderecoEntrega) {
  return Boolean((enderecoColeta || '').trim() && (enderecoEntrega || '').trim())
}
