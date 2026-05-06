/**
 * Formatta i dati del report in HTML compatibile con Telegram.
 * Telegram supporta: <b>, <i>, <u>, <s>, <code>, <pre>, <a>.
 * Limite messaggio: 4096 caratteri.
 */

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function eur(n) {
  return `€${n.toFixed(2)}`;
}

function formatDaFatturareSection(data, monthKey, monthName, suffix = '') {
  const lines = [];
  lines.push(`💰 <b>DA FATTURARE — ${escape(monthName.toUpperCase())}${escape(suffix)}</b>`);
  let total = 0;
  data.teams.forEach(team => {
    if (team.error) return;
    const earnings = team[monthKey].earnings;
    total += earnings;
    lines.push(`• ${escape(team.team_name)}: ${eur(earnings)} <i>(${team[monthKey].hours_formatted})</i>`);
  });
  lines.push(`💶 <b>Totale:</b> ${eur(total)}`);
  const net = data.net_percentage;
  if (net > 0 && net < 100) {
    lines.push(`💵 <b>Netto (${net}%):</b> ${eur(total * (net / 100))}`);
  }
  return lines.join('\n');
}

export function formatReport(data) {
  const hasRate = data.hourly_rate > 0;
  const blocks = [];

  blocks.push(
    `📊 <b>ClickUp — Report mensile</b>\n` +
    `👤 ${escape(data.username)}\n` +
    `📅 ${escape(data.period.previous_month)} → ${escape(data.period.current_month)}`
  );

  data.teams.forEach(team => {
    if (team.error) {
      blocks.push(`❌ <b>${escape(team.team_name)}</b>\n<i>${escape(team.error)}</i>`);
      return;
    }
    const lines = [];
    lines.push(`🏢 <b>${escape(team.team_name)}</b>`);
    const prev = `📅 ${escape(data.period.previous_month)}: <b>${team.previous_month.hours_formatted}</b> (${team.previous_month.entries_count} entries)` +
      (hasRate ? ` → ${eur(team.previous_month.earnings)}` : '');
    const curr = `📅 ${escape(data.period.current_month)}: <b>${team.current_month.hours_formatted}</b> (${team.current_month.entries_count} entries)` +
      (hasRate ? ` → ${eur(team.current_month.earnings)}` : '');
    lines.push(prev);
    lines.push(curr);
    const diff = team.current_month.hours - team.previous_month.hours;
    const diffIcon = diff > 0 ? '📈' : diff < 0 ? '📉' : '➖';
    const diffText = diff >= 0 ? `+${diff.toFixed(1)}h` : `${diff.toFixed(1)}h`;
    lines.push(`${diffIcon} Differenza: <b>${diffText}</b>`);
    blocks.push(lines.join('\n'));
  });

  const totals = data.totals;
  const totalsLines = [`🏆 <b>TOTALI GENERALI</b>`];
  totalsLines.push(
    `📅 ${escape(data.period.previous_month)}: <b>${formatHm(totals.previous_month.hours)}</b> (${totals.previous_month.entries} entries)` +
    (hasRate ? ` → ${eur(totals.previous_month.earnings)}` : '')
  );
  totalsLines.push(
    `📅 ${escape(data.period.current_month)}: <b>${formatHm(totals.current_month.hours)}</b> (${totals.current_month.entries} entries)` +
    (hasRate ? ` → ${eur(totals.current_month.earnings)}` : '')
  );
  const totalDiff = totals.current_month.hours - totals.previous_month.hours;
  const totalDiffIcon = totalDiff > 0 ? '📈' : totalDiff < 0 ? '📉' : '➖';
  const totalDiffText = totalDiff >= 0 ? `+${totalDiff.toFixed(1)}h` : `${totalDiff.toFixed(1)}h`;
  totalsLines.push(`${totalDiffIcon} Differenza: <b>${totalDiffText}</b>`);
  blocks.push(totalsLines.join('\n'));

  if (hasRate) {
    blocks.push(formatDaFatturareSection(data, 'previous_month', data.period.previous_month));
    blocks.push(formatDaFatturareSection(data, 'current_month', data.period.current_month, ' (in corso)'));
  }

  if (data.hours_by_day_current.length > 0) {
    const dayLines = data.hours_by_day_current.map(d => `${d.date}: <b>${d.formatted}</b>`);
    blocks.push(`📆 <b>Ore per giorno — ${escape(data.period.current_month)}</b>\n${dayLines.join('\n')}`);
  }

  return blocks.join('\n\n');
}

function formatHm(decimalHours) {
  const totalMinutes = Math.round(decimalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

/**
 * Splitta un messaggio HTML in chunk <= 4096 caratteri rispettando i confini di blocco
 * (separatore "\n\n"). Telegram limita ogni messaggio a 4096 caratteri.
 */
export function splitMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];
  const parts = [];
  const blocks = text.split('\n\n');
  let current = '';
  for (const block of blocks) {
    if ((current + '\n\n' + block).length > maxLen && current.length > 0) {
      parts.push(current);
      current = block;
    } else {
      current = current ? current + '\n\n' + block : block;
    }
  }
  if (current) parts.push(current);
  return parts;
}
