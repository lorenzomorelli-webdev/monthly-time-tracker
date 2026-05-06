/**
 * Helpers per chiamare l'API HTTP di Telegram.
 */

const TG_BASE = 'https://api.telegram.org';

export async function sendMessage(botToken, chatId, text, options = {}) {
  const response = await fetch(`${TG_BASE}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage ${response.status}: ${body}`);
  }
  return await response.json();
}

export async function sendChatAction(botToken, chatId, action = 'typing') {
  await fetch(`${TG_BASE}/bot${botToken}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action })
  }).catch(() => { /* best effort, ignora errori */ });
}
