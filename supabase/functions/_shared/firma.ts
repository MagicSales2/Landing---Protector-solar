// Firma breve por pedido.
//
// La página de gracias (/#/gracias?pedido=PED-...) consulta el estado del
// pedido en la función `confirmar-pago-wompi`. Con solo el ID se veía el
// NOMBRE del cliente y el total: si ese ID se filtraba (una captura, una
// celda de la hoja, un mensaje) bastaba para consultar datos de una persona.
//
// Solución: al crear el link de pago, Wompi guarda como `redirect-url` la
// página de gracias CON la firma de ese pedido. Quien realmente pagó la
// recibe en su navegador; quien solo sabe el ID no la tiene. La firma es un
// HMAC-SHA256 del id, recortado a 8 bytes (16 hex), y depende de un secreto
// del servidor: no se puede adivinar.

// Recorta la firma a 16 caracteres hex (64 bits): suficiente para que no se
// adivine, y corto para no ensuciar la URL.
export async function firmaPedido(orderId: string): Promise<string> {
  const secreto = Deno.env.get('PEDIDO_QUERY_SECRET') || ''
  if (!secreto || !orderId) return ''
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(orderId)))
  return Array.from(bytes.slice(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Compara sin salir por la rama rápida al primer dígito distinto.
export async function firmaValida(orderId: string, firma: string): Promise<boolean> {
  const esperada = await firmaPedido(orderId)
  if (!esperada || !firma || firma.length !== esperada.length) return false
  let iguales = true
  for (let i = 0; i < esperada.length; i++) {
    if (firma[i] !== esperada[i]) iguales = false
  }
  return iguales
}