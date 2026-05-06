/**
 * Client ClickUp portato per Cloudflare Workers (solo fetch nativo, no Node API).
 */

const API_BASE = 'https://api.clickup.com/api/v2';

function msToHours(ms) {
  if (isNaN(ms)) return 0;
  return parseFloat((ms / 3600000).toFixed(2));
}

function formatMs(ms) {
  if (isNaN(ms) || ms < 0) return '0h 0m';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

async function withRetry(fn, maxAttempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error.message.includes('429') || error.message.toLowerCase().includes('rate limit')) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function apiCall(token, url) {
  return await withRetry(async () => {
    const response = await fetch(url, {
      headers: { Authorization: token, 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${error.err || error.error || response.statusText}`);
    }
    return await response.json();
  });
}

function getDateRanges() {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return {
    currentMonth: {
      start: currentMonthStart.getTime(),
      end: currentMonthEnd.getTime(),
      name: currentMonthStart.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
    },
    previousMonth: {
      start: previousMonthStart.getTime(),
      end: previousMonthEnd.getTime(),
      name: previousMonthStart.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
    }
  };
}

async function getTeamTimeEntries(token, teamId, userId, startDate, endDate) {
  // ClickUp's time_entries endpoint ignora il param `page` e ritorna tutte le entries
  // del range in una sola chiamata. Paginare causerebbe duplicati infiniti.
  const params = new URLSearchParams({
    start_date: startDate.toString(),
    end_date: endDate.toString(),
    assignee: userId.toString()
  });
  const response = await apiCall(token, `${API_BASE}/team/${teamId}/time_entries?${params}`);
  const entries = response.data || [];
  console.log(`[clickup] team=${teamId} entries=${entries.length}`);
  return entries;
}

async function getTeamName(token, teamId, teamsCache) {
  if (teamsCache.has(teamId)) return teamsCache.get(teamId);
  try {
    const response = await apiCall(token, `${API_BASE}/team`);
    (response.teams || []).forEach(t => teamsCache.set(t.id, t.name));
    return teamsCache.get(teamId) || `Team ${teamId}`;
  } catch {
    return `Team ${teamId}`;
  }
}

async function getUsername(token) {
  try {
    const response = await apiCall(token, `${API_BASE}/user`);
    return response.user?.username || 'N/A';
  } catch {
    return 'N/A';
  }
}

function calculateTotalHours(entries) {
  const totalMs = entries.reduce((sum, e) => sum + (parseInt(e.duration) || 0), 0);
  return { decimal: msToHours(totalMs), formatted: formatMs(totalMs), milliseconds: totalMs };
}

function calculateHoursByDay(teams, monthKey) {
  const buckets = {};
  teams.forEach(team => {
    if (team.error || !team[monthKey]?.entries) return;
    team[monthKey].entries.forEach(entry => {
      const date = new Date(parseInt(entry.start));
      const sortKey = date.toISOString().split('T')[0];
      const dateKey = date.toLocaleDateString('it-IT', {
        weekday: 'short', day: '2-digit', month: '2-digit'
      });
      if (!buckets[sortKey]) buckets[sortKey] = { dateKey, ms: 0 };
      buckets[sortKey].ms += parseInt(entry.duration) || 0;
    });
  });
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ date: v.dateKey, hours: msToHours(v.ms), formatted: formatMs(v.ms) }));
}

/**
 * Genera il report multi-team. Ritorna l'oggetto dati strutturato
 * (pronto per essere passato al formatter).
 */
export async function generateReport(config) {
  const { CLICKUP_TOKEN, USER_ID, TEAM_IDS, HOURLY_RATE } = config;
  const hourlyRate = parseFloat(HOURLY_RATE) || 0;
  const dateRanges = getDateRanges();
  const teamsCache = new Map();

  const username = await getUsername(CLICKUP_TOKEN);

  const teams = [];
  for (const teamId of TEAM_IDS) {
    try {
      const teamName = await getTeamName(CLICKUP_TOKEN, teamId, teamsCache);
      const previousEntries = await getTeamTimeEntries(
        CLICKUP_TOKEN, teamId, USER_ID,
        dateRanges.previousMonth.start, dateRanges.previousMonth.end
      );
      const currentEntries = await getTeamTimeEntries(
        CLICKUP_TOKEN, teamId, USER_ID,
        dateRanges.currentMonth.start, dateRanges.currentMonth.end
      );
      const prev = calculateTotalHours(previousEntries);
      const curr = calculateTotalHours(currentEntries);
      teams.push({
        team_id: teamId,
        team_name: teamName,
        previous_month: {
          hours: prev.decimal,
          hours_formatted: prev.formatted,
          entries_count: previousEntries.length,
          earnings: prev.decimal * hourlyRate,
          entries: previousEntries
        },
        current_month: {
          hours: curr.decimal,
          hours_formatted: curr.formatted,
          entries_count: currentEntries.length,
          earnings: curr.decimal * hourlyRate,
          entries: currentEntries
        }
      });
    } catch (error) {
      teams.push({
        team_id: teamId,
        team_name: `Team ${teamId} (errore)`,
        error: error.message,
        previous_month: { hours: 0, entries_count: 0, earnings: 0 },
        current_month: { hours: 0, entries_count: 0, earnings: 0 }
      });
    }
  }

  const totals = {
    previous_month: { hours: 0, entries: 0, earnings: 0 },
    current_month: { hours: 0, entries: 0, earnings: 0 }
  };
  teams.forEach(t => {
    if (t.error) return;
    totals.previous_month.hours += t.previous_month.hours;
    totals.previous_month.entries += t.previous_month.entries_count;
    totals.previous_month.earnings += t.previous_month.earnings;
    totals.current_month.hours += t.current_month.hours;
    totals.current_month.entries += t.current_month.entries_count;
    totals.current_month.earnings += t.current_month.earnings;
  });
  totals.previous_month.hours = parseFloat(totals.previous_month.hours.toFixed(2));
  totals.current_month.hours = parseFloat(totals.current_month.hours.toFixed(2));
  totals.previous_month.earnings = parseFloat(totals.previous_month.earnings.toFixed(2));
  totals.current_month.earnings = parseFloat(totals.current_month.earnings.toFixed(2));

  return {
    username,
    user_id: USER_ID,
    period: {
      current_month: dateRanges.currentMonth.name,
      previous_month: dateRanges.previousMonth.name
    },
    teams,
    totals,
    hours_by_day_current: calculateHoursByDay(teams, 'current_month'),
    hourly_rate: hourlyRate,
    net_percentage: parseFloat(config.NET_PERCENTAGE) || 0
  };
}

export { formatMs, msToHours };
