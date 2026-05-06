#!/usr/bin/env bash
#
# Setup end-to-end del bot:
#   1. Legge ../.env per i valori ClickUp
#   2. Chiede bot token + chat_id
#   3. Genera un webhook secret random
#   4. Deploya il Worker
#   5. Pusha tutti i secret in un colpo solo
#   6. Aggancia il webhook a Telegram
#
# Prerequisiti: aver fatto `pnpm exec wrangler login` almeno una volta.

set -euo pipefail

cd "$(dirname "$0")"

# --- 1. Carica .env del progetto principale (se esiste)
ENV_FILE="../.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  echo "✓ Caricato $ENV_FILE"
else
  echo "⚠️  $ENV_FILE non trovato. Dovrai inserire CLICKUP_TOKEN, USER_ID, TEAM_IDS a mano."
fi

# --- 2. Valori obbligatori
prompt_if_empty() {
  local var_name="$1" prompt_label="$2" silent="${3:-0}" current
  current="${!var_name:-}"
  if [[ -z "$current" ]]; then
    if [[ "$silent" == "1" ]]; then
      read -rsp "$prompt_label: " current; echo
    else
      read -rp "$prompt_label: " current
    fi
    printf -v "$var_name" '%s' "$current"
  fi
}

prompt_if_empty TELEGRAM_BOT_TOKEN "TELEGRAM_BOT_TOKEN (da BotFather)" 1
prompt_if_empty ALLOWED_CHAT_ID "ALLOWED_CHAT_ID (numerico)"
prompt_if_empty CLICKUP_TOKEN "CLICKUP_TOKEN (pk_...)" 1
prompt_if_empty USER_ID "USER_ID ClickUp"
prompt_if_empty TEAM_IDS "TEAM_IDS (CSV)"
HOURLY_RATE="${HOURLY_RATE:-0}"
NET_PERCENTAGE="${NET_PERCENTAGE:-0}"

# --- 3. Webhook secret
TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 32)"
echo "✓ Generato TELEGRAM_WEBHOOK_SECRET (random)"

# --- 4. Deploy
echo "▶ Deploying worker..."
DEPLOY_OUT="$(pnpm exec wrangler deploy 2>&1)"
echo "$DEPLOY_OUT"
WORKER_URL="$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)"
if [[ -z "$WORKER_URL" ]]; then
  echo "❌ Impossibile estrarre URL del worker dall'output di wrangler deploy."
  exit 1
fi
echo "✓ Worker deployed at: $WORKER_URL"

# --- 5. Push secrets in bulk
echo "▶ Pushing secrets to Cloudflare..."
TMPFILE="$(mktemp)"
trap 'rm -f "$TMPFILE"' EXIT
cat > "$TMPFILE" <<JSON
{
  "TELEGRAM_BOT_TOKEN": "$TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET": "$TELEGRAM_WEBHOOK_SECRET",
  "ALLOWED_CHAT_ID": "$ALLOWED_CHAT_ID",
  "CLICKUP_TOKEN": "$CLICKUP_TOKEN",
  "USER_ID": "$USER_ID",
  "TEAM_IDS": "$TEAM_IDS",
  "HOURLY_RATE": "$HOURLY_RATE",
  "NET_PERCENTAGE": "$NET_PERCENTAGE"
}
JSON
pnpm exec wrangler secret bulk "$TMPFILE"
echo "✓ Secrets caricati"

# --- 6. Aggancia il webhook
echo "▶ Setting Telegram webhook..."
RESPONSE="$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${WORKER_URL}\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\"}")"

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✓ Webhook agganciato"
else
  echo "❌ Errore setWebhook: $RESPONSE"
  exit 1
fi

cat <<DONE

╭─────────────────────────────────────────────────────╮
│  ✅ Setup completato                                 │
│                                                     │
│  Worker:  $WORKER_URL
│                                                     │
│  Apri Telegram e manda /report al tuo bot.          │
╰─────────────────────────────────────────────────────╯
DONE
