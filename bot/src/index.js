/**
 * Worker entry. Riceve i webhook di Telegram e risponde ai comandi.
 *
 * Sicurezza:
 *  1. Header X-Telegram-Bot-Api-Secret-Token verificato contro TELEGRAM_WEBHOOK_SECRET
 *  2. ALLOWED_CHAT_ID: solo questo chat_id può comandare il bot.
 *     Setup mode (se non configurato): risponde con il chat_id ricevuto.
 *
 * Quando un mittente non autorizzato scrive: silenzio totale (nessuna risposta).
 */

import { generateReport } from './clickup.js';
import { formatReport, splitMessage } from './format.js';
import { sendMessage, sendChatAction } from './telegram.js';

const HELP_TEXT =
  '🤖 <b>ClickUp Summary Bot</b>\n\n' +
  'Comandi disponibili:\n' +
  '• /report — riepilogo mese corrente vs precedente\n' +
  '• /start — questo messaggio';

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('OK', { status: 200 });
    }

    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const provided = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (provided !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    const message = update.message || update.edited_message;
    if (!message || !message.text) {
      return new Response('OK', { status: 200 });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Setup mode: ALLOWED_CHAT_ID non ancora configurato
    if (!env.ALLOWED_CHAT_ID) {
      ctx.waitUntil(
        sendMessage(
          env.TELEGRAM_BOT_TOKEN, chatId,
          `⚙️ <b>Setup mode</b>\n\n` +
          `Il tuo chat_id è: <code>${chatId}</code>\n\n` +
          `Configuralo come secret e ridemploya:\n` +
          `<code>wrangler secret put ALLOWED_CHAT_ID</code>`
        ).catch(() => {})
      );
      return new Response('OK', { status: 200 });
    }

    // Whitelist: chat_id non autorizzato → silenzio totale
    if (String(chatId) !== String(env.ALLOWED_CHAT_ID)) {
      return new Response('OK', { status: 200 });
    }

    const command = text.split(/[\s@]/)[0].toLowerCase();

    if (command === '/start' || command === '/help') {
      ctx.waitUntil(
        sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, HELP_TEXT).catch(() => {})
      );
      return new Response('OK', { status: 200 });
    }

    if (command === '/report') {
      ctx.waitUntil(handleReport(env, chatId));
      return new Response('OK', { status: 200 });
    }

    return new Response('OK', { status: 200 });
  }
};

async function handleReport(env, chatId) {
  try {
    await sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');

    const config = {
      CLICKUP_TOKEN: env.CLICKUP_TOKEN,
      USER_ID: env.USER_ID,
      TEAM_IDS: (env.TEAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
      HOURLY_RATE: env.HOURLY_RATE || '0',
      NET_PERCENTAGE: env.NET_PERCENTAGE || '0'
    };

    if (!config.CLICKUP_TOKEN || !config.USER_ID || config.TEAM_IDS.length === 0) {
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN, chatId,
        '⚠️ Configurazione incompleta. Verifica i secret CLICKUP_TOKEN, USER_ID, TEAM_IDS.'
      );
      return;
    }

    const data = await generateReport(config);
    const html = formatReport(data);
    const chunks = splitMessage(html);
    for (const chunk of chunks) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, chunk);
    }
  } catch (error) {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN, chatId,
      `❌ Errore durante la generazione del report:\n<code>${escapeHtml(error.message || String(error))}</code>`
    ).catch(() => {});
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
