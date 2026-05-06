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
  let step = 'init';
  console.log('[handleReport] start, chatId=', chatId);
  await sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
  console.log('[handleReport] env keys:', {
    hasBotToken: !!env.TELEGRAM_BOT_TOKEN,
    hasClickupToken: !!env.CLICKUP_TOKEN,
    hasUserId: !!env.USER_ID,
    hasTeamIds: !!env.TEAM_IDS,
    teamIds: env.TEAM_IDS,
    hourlyRate: env.HOURLY_RATE,
    netPercentage: env.NET_PERCENTAGE
  });
  try {
    step = 'load-config';
    console.log('[handleReport] step:', step);
    const config = {
      CLICKUP_TOKEN: env.CLICKUP_TOKEN,
      USER_ID: env.USER_ID,
      TEAM_IDS: (env.TEAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
      HOURLY_RATE: env.HOURLY_RATE || '0',
      NET_PERCENTAGE: env.NET_PERCENTAGE || '0'
    };
    console.log('[handleReport] config team count:', config.TEAM_IDS.length);

    step = 'validate-config';
    console.log('[handleReport] step:', step);
    if (!config.CLICKUP_TOKEN || !config.USER_ID || config.TEAM_IDS.length === 0) {
      console.error('[handleReport] config incompleta');
      await sendPlain(env.TELEGRAM_BOT_TOKEN, chatId,
        '⚠️ Configurazione incompleta.');
      return;
    }

    step = 'generateReport';
    console.log('[handleReport] step:', step);
    const data = await generateReport(config);
    console.log('[handleReport] report generato:', {
      teams: data.teams.length,
      prevHours: data.totals.previous_month.hours,
      currHours: data.totals.current_month.hours
    });

    step = 'formatReport';
    console.log('[handleReport] step:', step);
    const html = formatReport(data);
    console.log('[handleReport] html length:', html.length);

    step = 'splitMessage';
    console.log('[handleReport] step:', step);
    const chunks = splitMessage(html);
    console.log('[handleReport] chunks:', chunks.length);

    for (let i = 0; i < chunks.length; i++) {
      step = `sendMessage[${i + 1}/${chunks.length}]`;
      console.log('[handleReport] step:', step, 'len=', chunks[i].length);
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, chunks[i]);
      console.log('[handleReport] sent chunk', i + 1);
    }
    console.log('[handleReport] DONE');
  } catch (error) {
    console.error('[handleReport] ERRORE in step:', step, error?.stack || error?.message || error);
    const msg = `❌ Errore in "${step}": ${error?.stack || error?.message || String(error)}`;
    try {
      await sendPlain(env.TELEGRAM_BOT_TOKEN, chatId, msg);
      console.log('[handleReport] error message sent');
    } catch (e2) {
      console.error('[handleReport] FAIL to send error message:', e2?.message || e2);
    }
  }
}

async function sendPlain(botToken, chatId, text) {
  const truncated = text.length > 3900 ? text.slice(0, 3900) + '\n…[troncato]' : text;
  const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: truncated })
  });
  if (!r.ok) throw new Error(`Telegram sendPlain ${r.status}: ${await r.text()}`);
}
