# ClickUp Summary Bot

Interfaccia Telegram per il report mensile di [ClickUp Monthly Time & Billing Tracker](../README.md), eseguita su Cloudflare Workers.

Il bot legge le time entry di ClickUp quando riceve `/report`, calcola ore e importi e invia il riepilogo alla sola chat autorizzata.

## Flusso

```text
Telegram ──webhook──> Cloudflare Worker ──HTTPS──> ClickUp API
    ^                        |
    └──────── report HTML ───┘
```

Il nome del Worker configurato nel repository è:

```text
clickup-summary-bot
```

## Prerequisiti

- Node.js 18 o successivo.
- pnpm.
- Un account Cloudflare con Workers abilitato.
- Wrangler autenticato sull’account che ospiterà il Worker.
- Un bot Telegram creato tramite [@BotFather](https://t.me/BotFather).
- Una configurazione valida nel file `../.env`.

## Verificare l’account Cloudflare

Prima di qualsiasi deploy:

```bash
cd bot
pnpm install
pnpm exec wrangler login
pnpm exec wrangler whoami
```

Controlla attentamente account ed email mostrati da Wrangler. Il deploy, i secret e i log sono sempre legati all’account attivo.

Per verificare se il Worker esiste già nell’account corrente:

```bash
pnpm exec wrangler deployments list
```

Se Wrangler restituisce “Worker not found” o non mostra deployment, non creare un sostituto alla cieca: verifica prima gli altri account Cloudflare a cui hai accesso e il dashboard **Workers & Pages**.

## Configurazione richiesta

Lo script `setup.sh` legge questi valori da `../.env`:

È una copia esplicita eseguita durante il setup, non una sincronizzazione continua: le modifiche successive a `../.env` non cambiano i secret già presenti su Cloudflare.

| Variabile | Obbligatoria | Default | Uso |
| --- | --- | --- | --- |
| `CLICKUP_TOKEN` | Sì | — | Autenticazione ClickUp. |
| `USER_ID` | Sì | — | Utente di cui aggregare le ore. |
| `TEAM_IDS` | Sì | — | Workspace ClickUp separati da virgola. |
| `HOURLY_RATE` | No | `0` | Tariffa oraria in euro. |
| `NET_PERCENTAGE` | No | `0` | Percentuale da mostrare come netto. |

Durante il setup vengono richiesti anche:

| Secret | Descrizione |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token ricevuto da BotFather. |
| `ALLOWED_CHAT_ID` | Unico chat ID autorizzato a usare il bot. |
| `TELEGRAM_WEBHOOK_SECRET` | Valore casuale generato dallo script per autenticare il webhook. |

I valori vengono salvati come secret del Worker e non restano nel repository.

## Prima installazione

### 1. Crea il bot Telegram

1. Apri [@BotFather](https://t.me/BotFather).
2. Invia `/newbot`.
3. Scegli nome e username.
4. Conserva il token ricevuto senza inserirlo in file tracciati.

Per trovare il tuo chat ID puoi usare un bot informativo affidabile oppure leggere l’ID da un update Telegram durante il setup. `ALLOWED_CHAT_ID` deve contenere soltanto il tuo ID numerico.

### 2. Prepara la configurazione ClickUp

Dalla root del repository verifica che `.env` contenga:

```env
CLICKUP_TOKEN="pk_your_token_here"
USER_ID="12345678"
TEAM_IDS="90111111111,90122222222"
HOURLY_RATE="30"
NET_PERCENTAGE="0"
```

### 3. Esegui il setup

```bash
cd bot
./setup.sh
```

Lo script:

1. carica `../.env`;
2. richiede token Telegram e chat ID mancanti;
3. genera un nuovo `TELEGRAM_WEBHOOK_SECRET`;
4. distribuisce il Worker;
5. carica tutti i secret su Cloudflare;
6. collega il webhook Telegram all’URL `workers.dev` ottenuto dal deploy.

> Usa `setup.sh` per la prima installazione o per una riconfigurazione completa. Ogni esecuzione genera un nuovo webhook secret e riscrive in blocco la configurazione remota.

### 4. Verifica

Invia al bot:

```text
/report
```

Dovresti ricevere il confronto tra mese precedente e mese corrente, gli importi da fatturare e le ore del mese corrente aggregate per giorno.

## Comandi Telegram

- `/report`: genera il report.
- `/start`: mostra l’elenco dei comandi.
- `/help`: mostra l’elenco dei comandi.

Messaggi provenienti da chat diverse da `ALLOWED_CHAT_ID` vengono ignorati.

## Impostare la tariffa a 30 €/ora

La modifica di `../.env` aggiorna solo la CLI locale. Per il Worker:

```bash
cd bot
pnpm exec wrangler secret put HOURLY_RATE --name clickup-summary-bot
```

Inserisci:

```text
30
```

Cloudflare nasconde il valore dopo il salvataggio. `wrangler secret put` crea e distribuisce immediatamente una nuova versione del Worker.

Verifica con `/report`. Per ripristinare il valore precedente, ripeti lo stesso comando e reinseriscilo.

Per cambiare un altro singolo secret:

```bash
pnpm exec wrangler secret put NOME_SECRET --name clickup-summary-bot
```

Per mostrare soltanto i nomi dei secret configurati:

```bash
pnpm exec wrangler secret list --name clickup-summary-bot
```

## Aggiornare il codice

Dopo modifiche al codice del bot:

```bash
cd bot
pnpm deploy
```

Un normale deploy del codice mantiene i secret già associati al Worker.

Controlla i deployment:

```bash
pnpm exec wrangler deployments list
```

Segui i log in tempo reale:

```bash
pnpm tail
```

## Sicurezza

Il Worker applica due controlli:

1. confronta l’header `X-Telegram-Bot-Api-Secret-Token` con `TELEGRAM_WEBHOOK_SECRET`;
2. accetta comandi soltanto da `ALLOWED_CHAT_ID`.

Inoltre:

- i token non devono essere inseriti in `wrangler.toml`;
- `.wrangler/`, `.dev.vars` e i file locali di ambiente devono restare fuori da Git;
- i valori dei secret non sono recuperabili dal dashboard o da Wrangler dopo il salvataggio;
- un token esposto deve essere rigenerato, non semplicemente nascosto dal repository;
- non stampare token o contenuto completo dei secret nei log.

## Troubleshooting

### Il Worker non compare nell’account

Esegui:

```bash
pnpm exec wrangler whoami
pnpm exec wrangler deployments list
```

Se `clickup-summary-bot` non esiste:

- verifica di essere nell’account Cloudflare usato durante il setup;
- controlla se il Worker è stato eliminato;
- verifica se il setup iniziale si è fermato prima del deploy;
- non usare il nome di un altro Worker come sostituto.

Il repository non contiene un account ID né un URL di produzione, quindi questi dati devono essere confermati dal dashboard o dall’account Wrangler corretto.

### Il bot non risponde

Controlla:

- che il Worker sia distribuito;
- che il webhook punti al suo URL;
- che `ALLOWED_CHAT_ID` corrisponda alla chat;
- che tutti i secret richiesti esistano;
- che il token Telegram non sia stato rigenerato dopo il setup.

Apri i log con:

```bash
pnpm tail
```

### Telegram mostra ancora la vecchia tariffa

Hai probabilmente aggiornato soltanto `../.env`. Aggiorna il secret remoto `HOURLY_RATE` e assicurati che il comando Wrangler punti a `clickup-summary-bot` nell’account corretto.

### Errore ClickUp

- `401`: `CLICKUP_TOKEN` non valido.
- `403`: token senza accesso al workspace.
- `404`: workspace non trovato.
- `429`: rate limit; il client applica retry con backoff.

### Il messaggio supera il limite Telegram

Il formatter divide il report in più messaggi rispettando il limite di 4096 caratteri. Se il problema persiste, controlla i log per identificare il passaggio e il payload coinvolto.

## Costi e limiti

Il bot non usa database o storage Cloudflare. Ogni comando produce una richiesta al Worker e alcune richieste in uscita verso ClickUp e Telegram.

Per un utilizzo personale il traffico è normalmente molto inferiore ai limiti del piano Workers Free. Verifica comunque i valori correnti nella [documentazione ufficiale dei limiti Workers](https://developers.cloudflare.com/workers/platform/limits/).

## File

```text
bot/
├── src/
│   ├── index.js      # Webhook, autorizzazione e comandi
│   ├── clickup.js    # Recupero e aggregazione ClickUp
│   ├── format.js     # Report HTML e suddivisione messaggi
│   └── telegram.js   # Invio messaggi Telegram
├── setup.sh          # Deploy iniziale, secret e webhook
├── wrangler.toml     # Nome e configurazione del Worker
├── package.json
└── README.md
```

## Riferimenti

- [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Workers versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
