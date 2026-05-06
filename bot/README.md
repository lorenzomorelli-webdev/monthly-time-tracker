# ClickUp Summary Bot — Cloudflare Workers + Telegram

Bot Telegram on-demand che esegue il report mensile di ClickUp e risponde nel cellulare.
Gira su Cloudflare Workers (free tier), zero server da mantenere.

## Setup rapido (~5 minuti)

### 1. Bot Telegram
Apri chat con `@BotFather`, manda `/newbot`, segui la procedura → ricevi il `BOT_TOKEN`.

### 2. Cloudflare login (una sola volta)
```bash
cd bot
pnpm install                     # già fatto se hai usato lo script
pnpm exec wrangler login         # apre il browser per autenticarsi
```

### 3. Lancia setup.sh
```bash
./setup.sh
```
Lo script:
- Legge `../.env` per CLICKUP_TOKEN, USER_ID, TEAM_IDS, HOURLY_RATE, NET_PERCENTAGE
- Ti chiede `TELEGRAM_BOT_TOKEN` e `ALLOWED_CHAT_ID`
- Genera un `TELEGRAM_WEBHOOK_SECRET` random
- Fa deploy del Worker
- Pusha tutti i secret a Cloudflare
- Aggancia il webhook a Telegram

Trovi il chat_id mandando `/start` a `@userinfobot` su Telegram (è il tuo `Id` numerico).

### 4. Test
Apri Telegram, manda `/report` al bot. In 1–3 secondi ricevi il riepilogo.

## Comandi del bot
- `/report` — report multi-team mese corrente vs precedente, con DA FATTURARE e ore/giorno
- `/start` o `/help` — elenco comandi

## Sicurezza
- **Secret webhook**: solo Telegram può invocare il Worker (header verificato).
- **Whitelist chat_id**: chiunque non sia `ALLOWED_CHAT_ID` viene ignorato silenziosamente (nessuna risposta, il bot risulta "morto" agli estranei).
- **Token**: vivono solo come Cloudflare Secrets, mai nel codice né nel repo.

## File
```
bot/
├── setup.sh              # setup end-to-end (deploy + secrets + webhook)
├── wrangler.toml         # config Worker
├── package.json
└── src/
    ├── index.js          # entry: routing comandi + whitelist
    ├── clickup.js        # client API ClickUp portato per Workers
    ├── format.js         # formatter HTML per Telegram
    └── telegram.js       # helper sendMessage
```

## Update / re-deploy
Dopo modifiche al codice:
```bash
pnpm exec wrangler deploy
```
I secret restano in piedi tra un deploy e l'altro.

Per cambiare un singolo secret:
```bash
pnpm exec wrangler secret put NOME_SECRET
```

## Costi
Free tier Cloudflare Workers: 100.000 richieste/giorno. Con uso personale ne consumi ~10/giorno.
