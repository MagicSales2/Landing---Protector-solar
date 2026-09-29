// ============================================================================
//  Código compartido: notificaciones de Telegram.
//  Manda un mensaje al chat del dueño (por defecto se usa TELEGRAM_BOT_TOKEN
//  y TELEGRAM_CHAT_ID de la configuración de la función).
//  Nunca rompe el flujo: si Telegram falla, se registra y el pedido sigue.
// ============================================================================

export async function enviarTelegram(texto: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
  if (!token || !chatId) {
    console.log('Telegram sin configurar (faltan TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID)')
    return
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto.slice(0, 3500),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) {
      console.error('Telegram respondió:', res.status, (await res.text()).slice(0, 300))
    }
  } catch (err) {
    console.error('No se pudo enviar el mensaje de Telegram:', err instanceof Error ? err.message : err)
  }
}