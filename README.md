# ClickUp Multi-Team Time Tracker

Script Node.js per calcolare e confrontare le ore tracciate da un utente su più team/progetti di ClickUp, analizzando il **mese corrente rispetto al mese precedente**.

Perfetto per freelancer e consulenti che gestiscono più progetti e hanno bisogno di sapere esattamente quanto fatturare per ogni cliente.

## 🚀 Funzionalità

- ✅ **Confronto Mensile**: Calcola le ore totali per il mese corrente e quello precedente.
- ✅ **Fatturazione Intelligente**: Mostra i fatturati per entrambi i mesi con una sezione dedicata "DA FATTURARE" per il mese precedente.
- ✅ **Supporto Multi-Team**: Analizza più team/workspace in una singola esecuzione.
- ✅ **Report Visivo Migliorato**: Layout con box Unicode per una lettura immediata delle informazioni.
- ✅ **Report Aggregato**: Fornisce totali per singolo team e un totale generale con differenze in ore ed euro.
- ✅ **Gestione Paginazione**: Recupera automaticamente tutte le time entries, anche se sono migliaia.
- ✅ **Rate Limiting Intelligente**: Gestisce il limite di richieste API di ClickUp con retry automatico.
- ✅ **Validazione Configurazione**: Controlla che le variabili d'ambiente siano corrette prima di iniziare.
- ✅ **Export JSON**: Salva il report dettagliato in un file JSON.
- ✅ **Report Pulito in Console**: Mostra un riepilogo chiaro e leggibile direttamente nel terminale.

## 📋 Requisiti

- Node.js 18+
- Un Personal API Token di ClickUp
- Gli ID dei Team/Workspace da analizzare
- L'ID dell'utente di cui tracciare le ore

## 🔧 Installazione

1.  **Clona il repository**
    ```bash
    git clone <repository-url>
    cd clickup-multi-team-tracker
    ```

2.  **Installa le dipendenze**
    ```bash
    npm install
    ```

3.  **Configura le variabili d'ambiente**
    Copia il file di esempio e modificalo con i tuoi dati.
    ```bash
    cp config.example.env .env
    ```

## 🔑 Configurazione

Modifica il file `.env` con i tuoi dati. Puoi ottenere `TEAM_ID` e `USER_ID` usando lo script `setup.js`.

```bash
# Esegui lo script di setup per trovare i tuoi ID
node setup.js pk_your_token_here
```

### File `.env` Esempio

```env
# ClickUp API Configuration
CLICKUP_TOKEN=pk_your_very_long_token_here

# User ID da analizzare
USER_ID=12345678

# Lista di Team ID da analizzare, separati da virgola
TEAM_IDS=your_team_id_1,your_team_id_2

# Tariffa oraria per calcolare i fatturati (opzionale, default: 0)
HOURLY_RATE=25

# Opzioni di output
OUTPUT_DIR=./reports
SAVE_REPORT=true
```

## 📊 Utilizzo

### Esecuzione Base

Per eseguire lo script e generare il report per i team configurati nel file `.env`:

```bash
npm start
```

Oppure direttamente con Node:

```bash
node index.js
```

### Esecuzione Semplificata (macOS/Linux)

Dopo aver reso eseguibile lo script `run.sh` (`chmod +x run.sh`), puoi semplicemente fare doppio click su di esso.

### Output di Esempio in Console

```
══════════════════════════════════════════════════════════════════════════════════════════
                    📊 CLICKUP TIME TRACKER - REPORT MENSILE
══════════════════════════════════════════════════════════════════════════════════════════
👤 mario rossi (ID: 12345678)
📅 novembre 2024 vs dicembre 2024

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🏢 CLIENTE A                                                                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│   📅 novembre 2024: 105h 30m  (157 entries)             →  €   2637.50                   │
│   📅 dicembre 2024: 15h 45m   ( 24 entries)             →  €    393.75                   │
│   📉 Differenza: -89.8h                                 →    -€2243.75                     │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🏢 CLIENTE B                                                                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│   📅 novembre 2024: 42h 15m   ( 68 entries)             →  €   1056.25                   │
│   📅 dicembre 2024: 38h 30m   ( 61 entries)             →  €    962.50                   │
│   📉 Differenza: -3.8h                                  →      -€93.75                     │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🏆 TOTALI GENERALI                                                                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│   📅 novembre 2024: 147h 45m  (225 entries)             →  €   3693.75                   │
│   📅 dicembre 2024: 54h 15m   ( 85 entries)             →  €   1356.25                   │
│   📉 Differenza: -93.5h                                 →    -€2337.50                     │
└────────────────────────────────────────────────────────────────────────────────────────┘

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 💰 DA FATTURARE - NOVEMBRE 2024                                                          ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
  • Cliente A:                 €   2637.50  (105h 30m)
  • Cliente B:                 €   1056.25  (42h 15m)
  ──────────────────────────────────────────────────
  💶 TOTALE DA FATTURARE:        €   3693.75

══════════════════════════════════════════════════════════════════════════════════════════
✅ Report JSON salvato: reports/multi_team_report_2024-12-01.json
✅ Multi-team report completato!
```

## 💰 Funzionalità Fatturazione

Lo strumento calcola automaticamente i fatturati in base alla tariffa oraria configurata in `HOURLY_RATE`.

### Come Funziona

1. **Configura la tariffa**: Imposta `HOURLY_RATE` nel file `.env` (es. `HOURLY_RATE="25"` per €25/ora)
2. **Esegui il tracker**: I fatturati vengono calcolati automaticamente per ogni progetto
3. **Visualizza i risultati**: La sezione **"DA FATTURARE"** mostra chiaramente quanto fatturare per il mese precedente

### Informazioni Mostrate

- **Fatturati per progetto**: Ore e importo per ogni team/cliente
- **Fatturato totale**: Somma di tutti i progetti
- **Confronto mensile**: Fatturati del mese corrente vs precedente con differenze
- **Sezione DA FATTURARE**: Evidenzia gli importi da fatturare per il mese precedente (quello completato)

### Disabilitare i Calcoli di Fatturato

Se vuoi vedere solo le ore senza i calcoli economici, imposta `HOURLY_RATE="0"` o rimuovi la variabile dal file `.env`.

## 📁 Struttura Output

### JSON Output (`time_report_YYYY-MM-DD.json`)

```json
{
  "totalHours": 168.5,
  "totalDuration": 606600000,
  "entriesCount": 87,
  "summary": {
    "formatted_duration": "168h 30m",
    "period": {
      "start": "1 gennaio 2024, 01:00:00",
      "end": "31 gennaio 2024, 23:59:59"
    },
    "user_id": "456",
    "team_id": "123"
  },
  "daily_breakdown": [
    {
      "date": "Mon Jan 01 2024",
      "hours": 8.5,
      "formatted_duration": "8h 30m",
      "entries_count": 4
    }
  ],
  "task_breakdown": [
    {
      "task_name": "Sviluppo Frontend",
      "task_id": "task123",
      "hours": 45.2,
      "formatted_duration": "45h 12m",
      "entries_count": 23
    }
  ],
  "entriesList": [
    {
      "id": "entry123",
      "description": "Implementazione feature X",
      "duration": 7200000,
      "start": 1704067200000,
      "end": 1704074400000,
      "task": {
        "id": "task123",
        "name": "Sviluppo Frontend",
        "url": "https://app.clickup.com/t/task123"
      },
      "user": {
        "id": "456",
        "username": "john.doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

### CSV Output (`time_report_YYYY-MM-DD.csv`)

```csv
ID,Descrizione,Ore,Data Inizio,Data Fine,Task,Task ID,Utente
entry123,Implementazione feature X,2.00,1 gennaio 2024 10:00:00,1 gennaio 2024 12:00:00,Sviluppo Frontend,task123,john.doe
```

## 🕐 Schedulazione Automatica

### Setup Cron Job

```bash
# Mostra esempi di schedulazione
node cron-scheduler.js examples

# Installa cron job giornaliero alle 18:00
node cron-scheduler.js install

# Installa cron job personalizzato
node cron-scheduler.js install "0 9 1 * *"  # Primo del mese alle 9:00

# Test esecuzione
node cron-scheduler.js test
```

### Esempi di Schedulazione

| Scenario | Cron Expression | Descrizione |
|----------|----------------|-------------|
| Giornaliero | `0 18 * * *` | Ogni giorno alle 18:00 |
| Settimanale | `0 17 * * 5` | Ogni venerdì alle 17:00 |
| Mensile | `0 9 1 * *` | Primo del mese alle 9:00 |
| Orario lavorativo | `0 9,13,17 * * 1-5` | Ogni 4 ore, lun-ven |

### Monitoraggio

```bash
# Verifica cron jobs attivi
crontab -l

# Monitora log di esecuzione
tail -f logs/cron_*.log

# Rimuovi tutti i cron jobs
crontab -r
```

## 🧪 Test

```bash
# Esegui tutti i test
npm test

# Test con debug
DEBUG=true npm test

# Test singolo
node test.js
```

I test verificano:
- Utility di date e validazione
- Gestione file JSON/CSV
- Connessione API (se configurata)
- Performance delle funzioni
- Integrazione completa (se configurata)

## 🔍 Troubleshooting

### Errori Comuni

#### 🔑 Token non valido (401)
```
❌ HTTP 401: Invalid token
```
**Soluzione**: Verifica che il token inizi con `pk_` e sia valido in [ClickUp Settings](https://app.clickup.com/settings/apps)

#### 🚫 Accesso negato (403)
```
❌ HTTP 403: Forbidden
```
**Soluzione**: Verifica che `TEAM_ID` e `USER_ID` siano corretti e che l'utente abbia accesso al team

#### 📭 Risorsa non trovata (404)
```
❌ HTTP 404: Not Found
```
**Soluzione**: Controlla che `TEAM_ID` esista e che l'utente faccia parte del team

#### ⏳ Rate limit superato (429)
```
❌ HTTP 429: Too Many Requests
```
**Soluzione**: Lo script gestisce automaticamente i rate limit. Attendi qualche minuto e riprova.

#### 📅 Nessuna time entry trovata
```
⚠️  Nessuna time entry trovata per il periodo specificato
```
**Soluzione**: Verifica che `START_DATE` e `END_DATE` siano corretti e che esistano time entries nel periodo

### Debug Mode

```bash
# Abilita log di debug
DEBUG=true node index.js

# Mostra chiamate API dettagliate
DEBUG=true CLICKUP_TOKEN=pk_xxx node index.js
```

### Validazione Configurazione

```bash
# Verifica configurazione
node -e "
import { ValidationUtils } from './utils.js';
import dotenv from 'dotenv';
dotenv.config();

const config = {
  CLICKUP_TOKEN: process.env.CLICKUP_TOKEN,
  TEAM_ID: process.env.TEAM_ID,
  USER_ID: process.env.USER_ID,
  START_DATE: process.env.START_DATE || Date.now() - 86400000,
  END_DATE: process.env.END_DATE || Date.now()
};

const validation = ValidationUtils.validateConfig(config);
console.log('Validazione:', validation);
"
```

## 📚 Documentazione API ClickUp

### Endpoints Utilizzati

- **[Get Time Entries](https://clickup.com/api/clickupreference/operation/GetTimeEntries/)**: `GET /api/v2/team/{team_id}/time_entries`
- **[Get User Info](https://clickup.com/api/clickupreference/operation/GetAuthorizedUser/)**: `GET /api/v2/user`
- **[Get Team Info](https://clickup.com/api/clickupreference/operation/GetTeams/)**: `GET /api/v2/team`

### Autenticazione

```http
Authorization: pk_your_token_here
Content-Type: application/json
```

### Parametri Time Entries

| Parametro | Tipo | Descrizione |
|-----------|------|-------------|
| `team_id` | string | ID del team/workspace |
| `start_date` | number | Timestamp inizio (millisecondi) |
| `end_date` | number | Timestamp fine (millisecondi) |
| `assignee` | string | ID dell'utente |
| `page` | number | Numero pagina (default: 0) |
| `page_size` | number | Elementi per pagina (max: 100) |

### Rate Limits

- **Rate Limit**: 100 richieste per minuto
- **Burst Limit**: 1000 richieste per ora
- **Gestione**: Retry automatico con backoff esponenziale

### Limiti API

1. **Paginazione**: Massimo 100 time entries per chiamata
2. **Periodo**: Nessun limite ufficiale, ma performance migliori per periodi < 1 anno
3. **Dati**: Time entries filtrabili solo per team, non per singolo progetto/task tramite API
4. **Timestamp**: Deve essere in millisecondi UTC

## 🛠️ Sviluppo

### Struttura Progetto

```
clickup-time-tracker/
├── index.js              # Script principale
├── setup.js              # Setup automatico team/user ID
├── utils.js               # Funzioni utility
├── cron-scheduler.js      # Gestione schedulazione
├── test.js                # Test suite
├── package.json           # Configurazione Node.js
├── config.example.env     # Esempio configurazione
└── README.md             # Documentazione
```
