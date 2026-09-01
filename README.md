# ClickUp Monthly Time & Billing Tracker

Genera report mensili di ore e fatturato a partire dalle time entry di ClickUp, confrontando il mese corrente con quello precedente su uno o più workspace.

Il progetto può essere usato dal terminale oppure tramite un bot Telegram eseguito su Cloudflare Workers. È pensato per freelance e consulenti che vogliono trasformare il tempo tracciato in un riepilogo immediatamente utilizzabile per la fatturazione.

## Modalità disponibili

| Modalità | Dove gira | Configurazione | Output |
| --- | --- | --- | --- |
| CLI locale | Node.js sul computer | `.env` nella root | Console e report JSON |
| Bot Telegram | Cloudflare Workers | Secret del Worker | Messaggi Telegram con `/report` |

Le due configurazioni sono separate a runtime. Durante il provisioning, `bot/setup.sh` può copiare esplicitamente i valori di `.env` nei secret del Worker; le modifiche successive al file locale non si sincronizzano automaticamente con Cloudflare.

```text
                         ┌─> CLI Node.js ───────> Console + JSON
ClickUp API ─────────────┤
                         └─> Cloudflare Worker ─> Telegram
```

## Funzionalità

- Confronto tra mese precedente e mese corrente.
- Aggregazione di più workspace ClickUp per un singolo utente.
- Totali per workspace e totali generali.
- Calcolo del lordo tramite tariffa oraria configurabile.
- Calcolo facoltativo del netto tramite `NET_PERCENTAGE`.
- Sezioni “DA FATTURARE” per il mese concluso e per quello in corso.
- Riepilogo delle ore per giorno nel mese corrente.
- Retry automatico in caso di risposta ClickUp `429`.
- Esportazione locale del report completo in JSON.
- Consultazione mobile tramite bot Telegram con accesso limitato a un solo `chat_id`.

## Requisiti

### CLI locale

- Node.js 18 o successivo.
- pnpm.
- Un [Personal API Token di ClickUp](https://developer.clickup.com/docs/authentication).
- L’ID dell’utente da analizzare.
- Gli ID dei workspace ClickUp da includere.

### Bot Telegram

Oltre ai requisiti ClickUp:

- Un account Cloudflare.
- Un bot creato con [@BotFather](https://t.me/BotFather).
- Wrangler autenticato sull’account Cloudflare corretto.

## Installazione locale

```bash
git clone https://github.com/lorenzomorelli-webdev/monthly-time-tracker.git
cd monthly-time-tracker
pnpm install
cp config.example.env .env
```

Apri `.env` e inserisci almeno il token ClickUp. Per recuperare automaticamente utente e workspace disponibili:

```bash
pnpm run setup
```

Lo script non sovrascrive `.env`: mostra una configurazione completa da verificare e copiare. Include tutti i workspace accessibili al token; rimuovi da `TEAM_IDS` quelli che non vuoi analizzare.

Infine esegui il report:

```bash
pnpm start
```

## Configurazione locale

| Variabile | Obbligatoria | Default | Descrizione |
| --- | --- | --- | --- |
| `CLICKUP_TOKEN` | Sì | — | Personal API Token ClickUp, con prefisso `pk_`. |
| `USER_ID` | Sì | — | Utente ClickUp di cui sommare le time entry. |
| `TEAM_IDS` | Sì | — | ID dei workspace separati da virgola. |
| `HOURLY_RATE` | No | `0` | Tariffa oraria in euro; `0` disabilita gli importi. |
| `NET_PERCENTAGE` | No | `0` | Percentuale del lordo da mostrare come netto; `0` la disabilita. |
| `OUTPUT_DIR` | No | `./reports` | Directory dei report JSON locali. |
| `SAVE_REPORT` | No | `true` | Imposta `false` per non salvare il JSON. |

Esempio:

```env
CLICKUP_TOKEN="pk_your_token_here"
USER_ID="12345678"
TEAM_IDS="90111111111,90122222222"
HOURLY_RATE="30"
NET_PERCENTAGE="0"
OUTPUT_DIR="./reports"
SAVE_REPORT="true"
```

## Impostare la tariffa a 30 €/ora

### CLI locale

Nel file `.env` della root:

```env
HOURLY_RATE="30"
```

La formula applicata è:

```text
importo lordo = ore decimali × HOURLY_RATE
netto mostrato = importo lordo × NET_PERCENTAGE / 100
```

### Bot su Cloudflare

Il Worker usa una variabile separata. Dalla directory `bot/`:

```bash
pnpm exec wrangler secret put HOURLY_RATE --name clickup-summary-bot
```

Inserisci `30` quando Wrangler lo richiede. Il valore rimane nascosto nel dashboard e il comando pubblica immediatamente una nuova versione del Worker. Per tornare indietro, ripeti il comando inserendo il valore precedente.

Verifica il risultato inviando `/report` al bot. Consulta anche la [guida dedicata al bot](./bot/README.md).

## Utilizzo

### Terminale

```bash
pnpm start
```

Per abilitare i log diagnostici:

```bash
pnpm debug
```

### Avvio con doppio clic su macOS

Il file `clickupSummary.command`:

1. apre Terminale nella directory corretta;
2. esegue `node index.js`;
3. mantiene visibile il report fino alla pressione di Invio.

Se macOS ne blocca l’esecuzione, rendilo eseguibile:

```bash
chmod +x clickupSummary.command
```

## Contenuto del report

La console mostra:

- utente e periodo analizzato;
- ore, numero di entry e importo per ogni workspace;
- differenza tra i due mesi;
- totali generali;
- ore aggregate per giorno nel mese corrente;
- importi “DA FATTURARE” del mese precedente e di quello in corso;
- netto stimato, se configurato.

Quando `SAVE_REPORT` non è `false`, viene creato:

```text
reports/multi_team_report_YYYY-MM-DD.json
```

Struttura abbreviata:

```json
{
  "user_id": "12345678",
  "username": "Mario Rossi",
  "period": {
    "previous_month": "agosto 2026",
    "current_month": "settembre 2026"
  },
  "teams": [
    {
      "team_id": "90111111111",
      "team_name": "Cliente A",
      "previous_month": {
        "hours": 120.5,
        "hours_formatted": "120h 30m",
        "entries_count": 85,
        "earnings": 3615,
        "entries": [
          { "id": "entry_1", "duration": "3600000" }
        ]
      },
      "current_month": {
        "hours": 8,
        "hours_formatted": "8h 0m",
        "entries_count": 5,
        "earnings": 240,
        "entries": [
          { "id": "entry_86", "duration": "3600000" }
        ]
      }
    }
  ],
  "totals": {
    "previous_month": {
      "hours": 120.5,
      "entries": 85,
      "earnings": 3615
    },
    "current_month": {
      "hours": 8,
      "entries": 5,
      "earnings": 240
    }
  }
}
```

Il JSON reale contiene anche le time entry originali restituite da ClickUp. Può quindi includere descrizioni, task e dati utente: non pubblicarlo senza averlo controllato. La directory `reports/` è esclusa da Git.

## Bot Telegram su Cloudflare Workers

Il bot espone tre comandi:

- `/report`: genera il riepilogo mensile.
- `/start`: mostra l’aiuto.
- `/help`: mostra l’aiuto.

L’accesso è protetto da:

- verifica del secret del webhook Telegram;
- whitelist `ALLOWED_CHAT_ID`;
- token conservati come Cloudflare Worker secrets.

Per installazione, aggiornamenti, verifica dell’account e troubleshooting consulta [bot/README.md](./bot/README.md).

## Schedulazione locale

Mostra gli esempi disponibili:

```bash
pnpm run cron -- examples
```

Genera uno script e una voce crontab senza installarli:

```bash
pnpm run cron -- generate "0 9 1 * *"
```

Vengono creati `run_tracker.sh` e `crontab.txt`, entrambi ignorati da Git.

> Attenzione: il comando `cron install` usa `crontab crontab.txt` e sostituisce il crontab corrente. Prima di usarlo, salva `crontab -l` e integra manualmente la nuova voce se hai già altre attività pianificate.

## Test

```bash
pnpm test
```

La suite verifica:

- conversione e formattazione delle durate;
- validazione della configurazione multi-workspace;
- generazione coerente del file `.env`;
- singola richiesta per intervallo all’API delle time entry;
- scrittura JSON e CSV delle utility;
- prestazioni delle funzioni di base.

Se `.env` contiene `CLICKUP_TOKEN`, la suite esegue anche una chiamata autenticata in sola lettura per verificare il token.

## Sicurezza e privacy

- Non inserire token o chat ID nel codice o nei file tracciati.
- Mantieni `.env` fuori da Git; è già incluso in `.gitignore`.
- Su Cloudflare conserva token e identificativi come secret del Worker.
- Non condividere i report JSON senza controllarne il contenuto.
- Rigenera immediatamente un token ClickUp o Telegram se viene esposto.
- Il repository non contiene i valori dei secret Cloudflare e non può recuperarli dopo il deploy.

## Troubleshooting

### Configurazione non valida

Controlla che:

- `CLICKUP_TOKEN` inizi con `pk_`;
- `USER_ID` non sia vuoto;
- `TEAM_IDS` contenga almeno un ID;
- `HOURLY_RATE` sia un numero maggiore o uguale a zero.

### Nessuna time entry

Il report usa automaticamente l’intero mese precedente e l’intero mese corrente. Verifica che:

- le time entry appartengano all’utente configurato;
- il workspace corretto sia presente in `TEAM_IDS`;
- il token abbia accesso al workspace;
- non ci sia un timer ancora attivo.

ClickUp rappresenta un timer attivo con una durata negativa; fermalo prima di generare il riepilogo.

### Errori API

- `401`: token assente o non valido.
- `403`: token senza accesso al workspace.
- `404`: workspace o risorsa non trovata.
- `429`: limite di richieste raggiunto; il tracker applica un backoff automatico.

I limiti ClickUp dipendono dal piano del workspace. Consulta la [documentazione ufficiale sui rate limit](https://developer.clickup.com/docs/rate-limits).

### La tariffa locale è aggiornata ma Telegram mostra ancora il vecchio valore

È normale se è stato modificato soltanto `.env`. Aggiorna separatamente `HOURLY_RATE` sul Worker Cloudflare e verifica di essere autenticato nell’account che contiene `clickup-summary-bot`.

### Il Worker non compare su Cloudflare

Verifica l’identità Wrangler:

```bash
cd bot
pnpm exec wrangler whoami
```

Il nome atteso dal repository è `clickup-summary-bot`. Se non compare nell’account autenticato, il Worker potrebbe essere stato distribuito con un altro account, eliminato oppure mai pubblicato.

## Struttura del progetto

```text
monthly-time-tracker/
├── index.js                  # CLI e generazione del report
├── setup.js                  # Recupero utente e workspace ClickUp
├── utils.js                  # Date, file, validazione, retry e logging
├── cron-scheduler.js         # Generazione e installazione cron
├── test.js                   # Suite di test
├── clickupSummary.command    # Launcher macOS
├── config.example.env        # Configurazione locale di esempio
├── bot/
│   ├── src/
│   │   ├── index.js          # Webhook e routing comandi Telegram
│   │   ├── clickup.js        # Client ClickUp per Workers
│   │   ├── format.js         # Formattazione HTML Telegram
│   │   └── telegram.js       # Invio messaggi
│   ├── setup.sh              # Deploy, secret e webhook iniziale
│   ├── wrangler.toml         # Configurazione Cloudflare
│   └── README.md             # Guida del bot
├── package.json
└── README.md
```

## API e piattaforme

- [Autenticazione ClickUp](https://developer.clickup.com/docs/authentication)
- [Get time entries within a date range](https://developer.clickup.com/reference/gettimeentrieswithinadaterange)
- [Rate limits ClickUp](https://developer.clickup.com/docs/rate-limits)
- [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Telegram Bot API](https://core.telegram.org/bots/api)

## Licenza

Distribuito con licenza MIT. Vedi [LICENSE](./LICENSE).
