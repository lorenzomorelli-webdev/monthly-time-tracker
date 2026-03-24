#!/bin/zsh

# Questo script serve per eseguire il time tracker di ClickUp
# con un semplice doppio click su macOS.

# 1. Naviga nella directory dove si trova lo script.
# Questo assicura che node possa trovare 'index.js' e '.env'.
SCRIPT_DIR="${0:a:h}"
cd "$SCRIPT_DIR"

# 2. Esegui lo script Node.js
echo "🚀 Esecuzione di ClickUp Time Tracker..."
echo "----------------------------------------"
node index.js
echo "----------------------------------------"

# 3. Mantieni la finestra del terminale aperta
#    per poter leggere l'output.
echo "✅ Esecuzione completata."
echo -n "Premi Invio per chiudere questa finestra."
read

# 4. Chiudi la finestra del terminale
osascript -e 'tell application "Terminal" to close front window' &
exit 0 