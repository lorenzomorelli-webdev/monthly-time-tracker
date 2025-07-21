#!/bin/bash

# 🚀 TEST CLICKUP API - Script di diagnostica
# ==========================================

# ⚠️ IMPORTANTE: Modifica questi valori con i tuoi dati reali
CLICKUP_TOKEN="***REDACTED-CLICKUP-TOKEN***"  # Il tuo Personal API Token da ClickUp
TEAM_ID="90151008101"             # ID del tuo team ClickUp
USER_ID="188420364"             # Il tuo user ID ClickUp

# 🎨 Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 TEST CLICKUP API${NC}"
echo "===================="

# 🗓️ Calcolo automatico date mese precedente
START_DATE=$(node -e "
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  console.log(start.getTime());
")

END_DATE=$(node -e "
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  console.log(end.getTime());
")

# 📅 Mostra informazioni periodo
echo -e "${PURPLE}📅 Periodo analizzato:${NC}"
echo "   Dal: $(node -e "console.log(new Date($START_DATE).toLocaleDateString('it-IT'))")"
echo "   Al:  $(node -e "console.log(new Date($END_DATE).toLocaleDateString('it-IT'))")"
echo -e "${PURPLE}👤 User ID:${NC} $USER_ID"
echo -e "${PURPLE}👥 Team ID:${NC} $TEAM_ID"
echo -e "${PURPLE}🔑 Token:${NC} ${CLICKUP_TOKEN:0:10}..." # Mostra solo primi 10 caratteri
echo ""

# 🔍 Verifica se i valori sono stati modificati
if [[ "$CLICKUP_TOKEN" == "pk_YOUR_TOKEN_HERE" ]] || [[ "$TEAM_ID" == "YOUR_TEAM_ID" ]] || [[ "$USER_ID" == "YOUR_USER_ID" ]]; then
    echo -e "${RED}❌ ATTENZIONE: Devi modificare i valori nel file!${NC}"
    echo -e "${YELLOW}   Modifica CLICKUP_TOKEN, TEAM_ID e USER_ID con i tuoi dati reali${NC}"
    echo ""
    exit 1
fi

# 🧪 Test 1: Verifica Token e User Info
echo -e "${BLUE}🧪 TEST 1: Verifica Token e User Info${NC}"
USER_RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" -X GET \
  "https://api.clickup.com/api/v2/user" \
  -H "Authorization: $CLICKUP_TOKEN" \
  -H "Content-Type: application/json")

USER_HTTP_CODE=$(echo $USER_RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
USER_BODY=$(echo $USER_RESPONSE | sed -e 's/HTTPSTATUS:.*//g')

if [ $USER_HTTP_CODE -eq 200 ]; then
    echo -e "${GREEN}✅ Token valido!${NC}"
    echo "📄 User Info:"
    echo "$USER_BODY" | python3 -m json.tool 2>/dev/null | head -15 || echo "$USER_BODY"
else
    echo -e "${RED}❌ Errore Token (Status: $USER_HTTP_CODE)${NC}"
    echo "$USER_BODY"
fi
echo ""

# 🧪 Test 2: Lista Teams
echo -e "${BLUE}🧪 TEST 2: Lista Teams${NC}"
TEAMS_RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" -X GET \
  "https://api.clickup.com/api/v2/team" \
  -H "Authorization: $CLICKUP_TOKEN" \
  -H "Content-Type: application/json")

TEAMS_HTTP_CODE=$(echo $TEAMS_RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
TEAMS_BODY=$(echo $TEAMS_RESPONSE | sed -e 's/HTTPSTATUS:.*//g')

if [ $TEAMS_HTTP_CODE -eq 200 ]; then
    echo -e "${GREEN}✅ Teams trovati!${NC}"
    echo "📄 Teams disponibili:"
    echo "$TEAMS_BODY" | python3 -m json.tool 2>/dev/null || echo "$TEAMS_BODY"
else
    echo -e "${RED}❌ Errore Teams (Status: $TEAMS_HTTP_CODE)${NC}"
    echo "$TEAMS_BODY"
fi
echo ""

# 🧪 Test 3: Membri del Team
echo -e "${BLUE}🧪 TEST 3: Membri del Team${NC}"
MEMBERS_RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" -X GET \
  "https://api.clickup.com/api/v2/team/$TEAM_ID/member" \
  -H "Authorization: $CLICKUP_TOKEN" \
  -H "Content-Type: application/json")

MEMBERS_HTTP_CODE=$(echo $MEMBERS_RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
MEMBERS_BODY=$(echo $MEMBERS_RESPONSE | sed -e 's/HTTPSTATUS:.*//g')

if [ $MEMBERS_HTTP_CODE -eq 200 ]; then
    echo -e "${GREEN}✅ Membri del team trovati!${NC}"
    echo "📄 Membri:"
    echo "$MEMBERS_BODY" | python3 -m json.tool 2>/dev/null || echo "$MEMBERS_BODY"
else
    echo -e "${RED}❌ Errore Membri (Status: $MEMBERS_HTTP_CODE)${NC}"
    echo "$MEMBERS_BODY"
fi
echo ""

# 🧪 Test 4: Time Entries - Mese Precedente
echo -e "${BLUE}🧪 TEST 4: Time Entries - Mese Precedente${NC}"
TIME_RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" -X GET \
  "https://api.clickup.com/api/v2/team/$TEAM_ID/time_entries?start_date=$START_DATE&end_date=$END_DATE&assignee=$USER_ID&page=0&page_size=100" \
  -H "Authorization: $CLICKUP_TOKEN" \
  -H "Content-Type: application/json")

TIME_HTTP_CODE=$(echo $TIME_RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
TIME_BODY=$(echo $TIME_RESPONSE | sed -e 's/HTTPSTATUS:.*//g')

echo -e "${PURPLE}📊 Status Code:${NC} $TIME_HTTP_CODE"

if [ $TIME_HTTP_CODE -eq 200 ]; then
    echo -e "${GREEN}✅ Richiesta time entries riuscita!${NC}"
    
    # Conta le entries
    ENTRY_COUNT=$(echo "$TIME_BODY" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    entries = data.get('data', [])
    print(len(entries))
except:
    print('0')
" 2>/dev/null)
    
    echo -e "${PURPLE}📝 Entries trovate:${NC} $ENTRY_COUNT"
    
    if [ "$ENTRY_COUNT" -gt "0" ]; then
        echo -e "${GREEN}🎉 SUCCESSO! Trovate $ENTRY_COUNT time entries${NC}"
        echo "📄 Prime entries:"
        echo "$TIME_BODY" | python3 -m json.tool 2>/dev/null | head -30 || echo "$TIME_BODY"
    else
        echo -e "${YELLOW}⚠️  Nessuna time entry trovata per il periodo specificato${NC}"
        echo -e "${YELLOW}💡 Possibili cause:${NC}"
        echo "   - Non hai tracciato tempo nel mese precedente"
        echo "   - USER_ID non corretto"
        echo "   - Le time entries sono in un altro team"
    fi
else
    echo -e "${RED}❌ Errore Time Entries!${NC}"
    echo "📄 Response:"
    echo "$TIME_BODY"
    
    # Suggerimenti per errori comuni
    case $TIME_HTTP_CODE in
        401) echo -e "${RED}🔑 Errore 401: Token non valido${NC}" ;;
        403) echo -e "${RED}🚫 Errore 403: Accesso negato - verifica TEAM_ID e USER_ID${NC}" ;;
        404) echo -e "${RED}📭 Errore 404: Team o User non trovato${NC}" ;;
        429) echo -e "${RED}⏳ Errore 429: Rate limit superato${NC}" ;;
    esac
fi
echo ""

# 🧪 Test 5: Time Entries - Range più ampio (ultimi 6 mesi)
echo -e "${BLUE}🧪 TEST 5: Time Entries - Ultimi 6 mesi (test di fallback)${NC}"
WIDE_START=$(node -e "
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  console.log(start.getTime());
")

WIDE_RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" -X GET \
  "https://api.clickup.com/api/v2/team/$TEAM_ID/time_entries?start_date=$WIDE_START&end_date=$END_DATE&assignee=$USER_ID&page=0&page_size=100" \
  -H "Authorization: $CLICKUP_TOKEN" \
  -H "Content-Type: application/json")

WIDE_HTTP_CODE=$(echo $WIDE_RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
WIDE_BODY=$(echo $WIDE_RESPONSE | sed -e 's/HTTPSTATUS:.*//g')

if [ $WIDE_HTTP_CODE -eq 200 ]; then
    WIDE_COUNT=$(echo "$WIDE_BODY" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    entries = data.get('data', [])
    print(len(entries))
except:
    print('0')
" 2>/dev/null)
    
    echo -e "${PURPLE}📝 Entries ultimi 6 mesi:${NC} $WIDE_COUNT"
    
    if [ "$WIDE_COUNT" -gt "0" ]; then
        echo -e "${GREEN}✅ Trovate time entries negli ultimi 6 mesi!${NC}"
    else
        echo -e "${YELLOW}⚠️  Nessuna time entry negli ultimi 6 mesi${NC}"
    fi
else
    echo -e "${RED}❌ Errore anche con range più ampio${NC}"
fi

echo ""
echo -e "${BLUE}🏁 TEST COMPLETATI${NC}"
echo "===================="

# 💡 Consigli finali
echo -e "${YELLOW}💡 CONSIGLI:${NC}"
echo "   1. Se il token è valido ma non trovi time entries, verifica di aver tracciato tempo su ClickUp"
echo "   2. Controlla che USER_ID sia quello corretto (vedi Test 1)"
echo "   3. Verifica che TEAM_ID sia quello giusto (vedi Test 2)"
echo "   4. Le time entries potrebbero essere in un altro team o workspace"
echo ""
echo -e "${PURPLE}🔗 URL API testata:${NC}"
echo "https://api.clickup.com/api/v2/team/$TEAM_ID/time_entries?start_date=$START_DATE&end_date=$END_DATE&assignee=$USER_ID" 