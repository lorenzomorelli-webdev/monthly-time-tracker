#!/usr/bin/env node

/**
 * ClickUp Multi-Team Time Tracker
 * Calcola le ore tracciate su più progetti per mese corrente e precedente
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import {
  DateUtils,
  FileUtils,
  LoggerUtils,
  RateLimitUtils,
  ValidationUtils
} from './utils.js';

dotenv.config();

const API_BASE = 'https://api.clickup.com/api/v2';
const DEFAULT_PAGE_SIZE = 100;

class ClickUpMultiTeamTracker {
  constructor(config) {
    this.config = config;
    this.headers = {
      'Authorization': config.CLICKUP_TOKEN,
      'Content-Type': 'application/json'
    };
    this.outputDir = config.OUTPUT_DIR || './reports';
  }

  /**
   * Effettua una chiamata API con gestione errori e rate limiting
   */
  async apiCall(url, options = {}) {
    return await RateLimitUtils.withRetry(async () => {
      const response = await fetch(url, {
        ...options,
        headers: { ...this.headers, ...options.headers }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${error.err || error.error || response.statusText}`);
      }

      return await response.json();
    });
  }

  /**
   * Ottiene le time entries per un singolo team
   */
  async getTeamTimeEntries(teamId, userId, startDate, endDate) {
    let allEntries = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const url = `${API_BASE}/team/${teamId}/time_entries`;
        const params = new URLSearchParams({
          start_date: startDate.toString(),
          end_date: endDate.toString(),
          assignee: userId.toString(),
          page: page.toString(),
          page_size: DEFAULT_PAGE_SIZE.toString()
        });

        const response = await this.apiCall(`${url}?${params}`);
        const entries = response.data || [];

        if (entries.length === 0) {
          hasMore = false;
        } else {
          allEntries = allEntries.concat(entries);
          page++;
          hasMore = entries.length === DEFAULT_PAGE_SIZE;
        }

        // Piccola pausa per evitare rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        LoggerUtils.error(`Errore nel recupero entries per team ${teamId}:`, error.message);
        throw error;
      }
    }

    return allEntries;
  }

  /**
   * Calcola le ore totali da un array di time entries
   */
  calculateTotalHours(entries) {
    const totalDuration = entries.reduce((sum, entry) => {
      return sum + (parseInt(entry.duration) || 0);
    }, 0);

    return {
      decimal: DateUtils.millisecondsToHours(totalDuration),
      formatted: DateUtils.formatMilliseconds(totalDuration),
      milliseconds: totalDuration
    };
  }

  /**
   * Ottiene il nome di un team dall'API
   */
  async getTeamName(teamId) {
    try {
      const response = await this.apiCall(`${API_BASE}/team`);
      const team = response.teams?.find(t => t.id === teamId.toString());
      return team ? team.name : `Team ${teamId}`;
    } catch (error) {
      LoggerUtils.debug(`Errore nel recupero nome team ${teamId}:`, error.message);
      return `Team ${teamId}`;
    }
  }

  /**
   * Genera report per tutti i team specificati
   */
  async generateMultiTeamReport() {
    const teams = this.config.TEAM_IDS;
    const userId = this.config.USER_ID;
    const hourlyRate = parseFloat(this.config.HOURLY_RATE);

    // Calcola i range di date
    const dateRanges = this.getDateRanges();

    const results = {
      user_id: userId,
      period: {
        current_month: dateRanges.currentMonth.name,
        previous_month: dateRanges.previousMonth.name
      },
      teams: []
    };

    // Ottieni il nome utente
    try {
      const userResponse = await this.apiCall(`${API_BASE}/user`);
      results.username = userResponse.user?.username || 'N/A';
    } catch (error) {
      results.username = 'N/A';
    }

    LoggerUtils.info(`📊 Analizzando ${teams.length} team per ${results.username}`);
    LoggerUtils.info(`📅 Mese precedente: ${dateRanges.previousMonth.name}`);
    LoggerUtils.info(`📅 Mese corrente: ${dateRanges.currentMonth.name}`);

    // Per ogni team
    for (const teamId of teams) {
      try {
        LoggerUtils.info(`\n🔍 Analizzando team ${teamId}...`);

        // Ottieni nome team
        const teamName = await this.getTeamName(teamId);

        // Time entries mese precedente
        const previousEntries = await this.getTeamTimeEntries(
          teamId, userId,
          dateRanges.previousMonth.start,
          dateRanges.previousMonth.end
        );

        // Time entries mese corrente
        const currentEntries = await this.getTeamTimeEntries(
          teamId, userId,
          dateRanges.currentMonth.start,
          dateRanges.currentMonth.end
        );

        const previousMonthMetrics = this.calculateTotalHours(previousEntries);
        const currentMonthMetrics = this.calculateTotalHours(currentEntries);

        const teamResult = {
          team_id: teamId,
          team_name: teamName,
          previous_month: {
            hours: previousMonthMetrics.decimal,
            hours_formatted: previousMonthMetrics.formatted,
            entries_count: previousEntries.length,
            period: `${DateUtils.formatDate(dateRanges.previousMonth.start)} - ${DateUtils.formatDate(dateRanges.previousMonth.end)}`,
            earnings: previousMonthMetrics.decimal * hourlyRate,
            entries: previousEntries
          },
          current_month: {
            hours: currentMonthMetrics.decimal,
            hours_formatted: currentMonthMetrics.formatted,
            entries_count: currentEntries.length,
            period: `${DateUtils.formatDate(dateRanges.currentMonth.start)} - ${DateUtils.formatDate(dateRanges.currentMonth.end)}`,
            earnings: currentMonthMetrics.decimal * hourlyRate,
            entries: currentEntries
          }
        };

        results.teams.push(teamResult);

        LoggerUtils.success(`✅ ${teamName}: ${teamResult.previous_month.hours_formatted} (precedente) + ${teamResult.current_month.hours_formatted} (corrente)`);

      } catch (error) {
        LoggerUtils.error(`❌ Errore per team ${teamId}:`, error.message);

        // Aggiungi comunque il team con errore
        results.teams.push({
          team_id: teamId,
          team_name: `Team ${teamId} (errore)`,
          error: error.message,
          previous_month: { hours: 0, entries_count: 0 },
          current_month: { hours: 0, entries_count: 0 }
        });
      }
    }

    // Calcola totali
    results.totals = this.calculateTotals(results.teams);

    return results;
  }

  /**
   * Calcola i totali generali
   */
  calculateTotals(teams) {
    const totals = {
      previous_month: { hours: 0, entries: 0, milliseconds: 0, earnings: 0 },
      current_month: { hours: 0, entries: 0, milliseconds: 0, earnings: 0 }
    };

    teams.forEach(team => {
      if (!team.error) {
        totals.previous_month.hours += team.previous_month.hours;
        totals.previous_month.entries += team.previous_month.entries_count;
        totals.previous_month.earnings += team.previous_month.earnings;
        totals.current_month.hours += team.current_month.hours;
        totals.current_month.entries += team.current_month.entries_count;
        totals.current_month.earnings += team.current_month.earnings;
      }
    });

    // Arrotonda i totali per evitare problemi di floating point
    totals.previous_month.hours = parseFloat(totals.previous_month.hours.toFixed(2));
    totals.current_month.hours = parseFloat(totals.current_month.hours.toFixed(2));
    totals.previous_month.earnings = parseFloat(totals.previous_month.earnings.toFixed(2));
    totals.current_month.earnings = parseFloat(totals.current_month.earnings.toFixed(2));

    return totals;
  }

  /**
   * Aggrega le ore per giorno da tutte le entries di tutti i team
   */
  calculateHoursByDay(teams, monthKey) {
    const hoursByDay = {};

    teams.forEach(team => {
      if (!team.error && team[monthKey]?.entries) {
        team[monthKey].entries.forEach(entry => {
          const startTimestamp = parseInt(entry.start);
          const date = new Date(startTimestamp);
          const dateKey = date.toLocaleDateString('it-IT', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit'
          });
          const sortKey = date.toISOString().split('T')[0]; // Per ordinamento

          if (!hoursByDay[sortKey]) {
            hoursByDay[sortKey] = {
              dateKey,
              milliseconds: 0
            };
          }
          hoursByDay[sortKey].milliseconds += parseInt(entry.duration) || 0;
        });
      }
    });

    // Ordina per data e restituisci array
    return Object.entries(hoursByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sortKey, data]) => ({
        date: data.dateKey,
        hours: DateUtils.millisecondsToHours(data.milliseconds),
        formatted: DateUtils.formatMilliseconds(data.milliseconds)
      }));
  }

  /**
   * Calcola i range di date per mese corrente e precedente (CORRETTO)
   */
  getDateRanges() {
    const now = new Date();

    // Mese corrente
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Mese precedente (CORREZIONE: now.getMonth() - 1)
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

  /**
   * Stampa una sezione "DA FATTURARE" per un mese specifico
   */
  printDaFatturareSection(data, monthKey, monthName, suffix = '') {
    const netPercentage = parseFloat(this.config.NET_PERCENTAGE);
    const hasNetPercentage = !isNaN(netPercentage) && netPercentage > 0 && netPercentage < 100;
    const title = `💰 DA FATTURARE - ${monthName.toUpperCase()}${suffix}`;
    const titlePadding = Math.max(0, 88 - 1 - title.length);

    console.log('\n' + '┏' + '━'.repeat(88) + '┓');
    console.log(`┃ ${title}${' '.repeat(titlePadding)} ┃`);
    console.log('┗' + '━'.repeat(88) + '┛');

    let totalEarnings = 0;
    data.teams.forEach((team) => {
      if (!team.error) {
        const teamLine = `  • ${team.team_name}:`;
        const amount = `€${team[monthKey].earnings.toFixed(2).padStart(10)}`;
        const hours = `(${team[monthKey].hours_formatted})`;
        console.log(`${teamLine.padEnd(30)} ${amount}  ${hours}`);
        totalEarnings += team[monthKey].earnings;
      }
    });

    console.log('  ' + '─'.repeat(50));
    console.log(`  💶 TOTALE DA FATTURARE:        €${totalEarnings.toFixed(2).padStart(10)}`);

    if (hasNetPercentage) {
      const net = totalEarnings * (netPercentage / 100);
      const netLabel = `  💵 NETTO (${netPercentage}%):`;
      console.log(`${netLabel.padEnd(33)}€${net.toFixed(2).padStart(10)}`);
    }
  }

  /**
   * Stampa il summary pulito in console
   */
  printCleanSummary(data) {
    const hasHourlyRate = parseFloat(this.config.HOURLY_RATE) > 0;

    console.log('\n' + '═'.repeat(90));
    console.log('                    📊 CLICKUP TIME TRACKER - REPORT MENSILE');
    console.log('═'.repeat(90));
    console.log(`👤 ${data.username} (ID: ${data.user_id})`);
    console.log(`📅 ${data.period.previous_month} vs ${data.period.current_month}`);
    console.log('');

    // Sezione progetti con ore e fatturati
    data.teams.forEach((team, index) => {
      if (team.error) {
        console.log('┌' + '─'.repeat(88) + '┐');
        console.log(`│ ❌ ${team.team_name.padEnd(84)} │`);
        console.log(`│    ERRORE: ${team.error.padEnd(77)} │`);
        console.log('└' + '─'.repeat(88) + '┘');
      } else {
        console.log('┌' + '─'.repeat(88) + '┐');
        console.log(`│ 🏢 ${team.team_name.toUpperCase().padEnd(84)} │`);
        console.log('├' + '─'.repeat(88) + '┤');

        // Mese precedente
        const prevLine = `  📅 ${data.period.previous_month}: ${team.previous_month.hours_formatted.padEnd(9)} (${String(team.previous_month.entries_count).padStart(3)} entries)`;
        if (hasHourlyRate) {
          const prevEarnings = `→  €${team.previous_month.earnings.toFixed(2).padStart(10)}`;
          console.log(`│ ${prevLine.padEnd(56)}${prevEarnings.padEnd(32)} │`);
        } else {
          console.log(`│ ${prevLine.padEnd(86)} │`);
        }

        // Mese corrente
        const currLine = `  📅 ${data.period.current_month}: ${team.current_month.hours_formatted.padEnd(9)} (${String(team.current_month.entries_count).padStart(3)} entries)`;
        if (hasHourlyRate) {
          const currEarnings = `→  €${team.current_month.earnings.toFixed(2).padStart(10)}`;
          console.log(`│ ${currLine.padEnd(56)}${currEarnings.padEnd(32)} │`);
        } else {
          console.log(`│ ${currLine.padEnd(86)} │`);
        }

        // Differenza
        const diff = team.current_month.hours - team.previous_month.hours;
        const diffText = diff >= 0 ? `+${diff.toFixed(1)}h` : `${diff.toFixed(1)}h`;
        const diffIcon = diff > 0 ? '📈' : diff < 0 ? '📉' : '➖';
        const diffLine = `  ${diffIcon} Differenza: ${diffText.padEnd(12)}`;

        if (hasHourlyRate) {
          const diffEarnings = team.current_month.earnings - team.previous_month.earnings;
          const diffEarningsText = diffEarnings >= 0 ? `+€${diffEarnings.toFixed(2)}` : `-€${Math.abs(diffEarnings).toFixed(2)}`;
          console.log(`│ ${diffLine.padEnd(56)}→  ${diffEarningsText.padStart(12).padEnd(32)} │`);
        } else {
          console.log(`│ ${diffLine.padEnd(86)} │`);
        }

        console.log('└' + '─'.repeat(88) + '┘');
      }
      console.log('');
    });

    // Totali generali
    const previousTotalMs = data.teams.reduce((sum, team) => sum + (team.previous_month.hours * 3600000 || 0), 0);
    const currentTotalMs = data.teams.reduce((sum, team) => sum + (team.current_month.hours * 3600000 || 0), 0);

    console.log('┌' + '─'.repeat(88) + '┐');
    console.log(`│ 🏆 TOTALI GENERALI${' '.repeat(68)} │`);
    console.log('├' + '─'.repeat(88) + '┤');

    const prevTotalLine = `  📅 ${data.period.previous_month}: ${DateUtils.formatMilliseconds(previousTotalMs).padEnd(9)} (${String(data.totals.previous_month.entries).padStart(3)} entries)`;
    if (hasHourlyRate) {
      const prevTotalEarnings = `→  €${data.totals.previous_month.earnings.toFixed(2).padStart(10)}`;
      console.log(`│ ${prevTotalLine.padEnd(56)}${prevTotalEarnings.padEnd(32)} │`);
    } else {
      console.log(`│ ${prevTotalLine.padEnd(86)} │`);
    }

    const currTotalLine = `  📅 ${data.period.current_month}: ${DateUtils.formatMilliseconds(currentTotalMs).padEnd(9)} (${String(data.totals.current_month.entries).padStart(3)} entries)`;
    if (hasHourlyRate) {
      const currTotalEarnings = `→  €${data.totals.current_month.earnings.toFixed(2).padStart(10)}`;
      console.log(`│ ${currTotalLine.padEnd(56)}${currTotalEarnings.padEnd(32)} │`);
    } else {
      console.log(`│ ${currTotalLine.padEnd(86)} │`);
    }

    const totalDiff = data.totals.current_month.hours - data.totals.previous_month.hours;
    const totalDiffText = totalDiff >= 0 ? `+${totalDiff.toFixed(1)}h` : `${totalDiff.toFixed(1)}h`;
    const totalDiffIcon = totalDiff > 0 ? '📈' : totalDiff < 0 ? '📉' : '➖';
    const totalDiffLine = `  ${totalDiffIcon} Differenza: ${totalDiffText.padEnd(12)}`;

    if (hasHourlyRate) {
      const totalDiffEarnings = data.totals.current_month.earnings - data.totals.previous_month.earnings;
      const totalDiffEarningsText = totalDiffEarnings >= 0 ? `+€${totalDiffEarnings.toFixed(2)}` : `-€${Math.abs(totalDiffEarnings).toFixed(2)}`;
      console.log(`│ ${totalDiffLine.padEnd(56)}→  ${totalDiffEarningsText.padStart(12).padEnd(32)} │`);
    } else {
      console.log(`│ ${totalDiffLine.padEnd(86)} │`);
    }

    console.log('└' + '─'.repeat(88) + '┘');

    // Sezione ORE PER GIORNO - mese corrente
    const hoursByDayCurrent = this.calculateHoursByDay(data.teams, 'current_month');
    if (hoursByDayCurrent.length > 0) {
      console.log('\n┌' + '─'.repeat(88) + '┐');
      console.log(`│ 📆 ORE PER GIORNO - ${data.period.current_month.toUpperCase()}${' '.repeat(88 - 21 - data.period.current_month.length)} │`);
      console.log('├' + '─'.repeat(88) + '┤');

      // Mostra le ore per ogni giorno su più colonne per compattezza
      const itemsPerRow = 4;
      const colWidth = 20;
      for (let i = 0; i < hoursByDayCurrent.length; i += itemsPerRow) {
        let line = '│ ';
        for (let j = 0; j < itemsPerRow; j++) {
          if (i + j < hoursByDayCurrent.length) {
            const day = hoursByDayCurrent[i + j];
            const dayStr = `${day.date}: ${day.formatted}`;
            line += dayStr.padEnd(colWidth);
          } else {
            line += ' '.repeat(colWidth);
          }
        }
        line = line.padEnd(89) + '│';
        console.log(line);
      }

      console.log('└' + '─'.repeat(88) + '┘');
    }

    // Sezione DA FATTURARE - mese precedente (LA PIÙ IMPORTANTE) + mese corrente (in corso)
    if (hasHourlyRate) {
      this.printDaFatturareSection(data, 'previous_month', data.period.previous_month);
      this.printDaFatturareSection(data, 'current_month', data.period.current_month, ' (in corso)');
      console.log('');
    }

    console.log('═'.repeat(90));
  }

  /**
   * Salva il report in JSON
   */
  async saveReport(data) {
    const timestamp = new Date().toISOString().split('T')[0];
    const jsonPath = path.join(this.outputDir, `multi_team_report_${timestamp}.json`);

    try {
      FileUtils.saveJson(jsonPath, data);
      LoggerUtils.success(`📁 Report JSON salvato: ${jsonPath}`);
      return jsonPath;
    } catch (error) {
      LoggerUtils.error('Errore nel salvataggio del report:', error.message);
      throw error;
    }
  }

  /**
   * Esecuzione principale
   */
  async run() {
    try {
      LoggerUtils.info('🚀 Avvio ClickUp Multi-Team Tracker...');

      // Validazione configurazione
      const validation = ValidationUtils.validateConfig(this.config);
      if (!validation.isValid) {
        LoggerUtils.error('Configurazione non valida:');
        validation.errors.forEach(error => LoggerUtils.error(`  - ${error}`));
        process.exit(1);
      }

      // Genera report multi-team
      const reportData = await this.generateMultiTeamReport();

      // Stampa summary pulito
      this.printCleanSummary(reportData);

      // Salva report
      if (this.config.SAVE_REPORT !== 'false') {
        await this.saveReport(reportData);
      }

      LoggerUtils.success('✅ Multi-team report completato!');
      return reportData;

    } catch (error) {
      LoggerUtils.error('Errore durante l\'elaborazione:', error.message);

      // Suggerimenti per errori comuni
      if (error.message.includes('401')) {
        LoggerUtils.error('🔑 Token non valido. Verifica il tuo Personal API Token.');
      } else if (error.message.includes('403')) {
        LoggerUtils.error('🚫 Accesso negato. Verifica i permessi per team_id e user_id.');
      } else if (error.message.includes('404')) {
        LoggerUtils.error('📭 Risorsa non trovata. Verifica team_id e user_id.');
      }

      process.exit(1);
    }
  }
}

/**
 * Configurazione da variabili d'ambiente
 */
const config = {
  CLICKUP_TOKEN: process.env.CLICKUP_TOKEN,
  // Array di team IDs
  TEAM_IDS: process.env.TEAM_IDS ?
    process.env.TEAM_IDS.split(',').map(id => id.trim()) :
    [],
  USER_ID: process.env.USER_ID,
  OUTPUT_DIR: process.env.OUTPUT_DIR || './reports',
  SAVE_REPORT: process.env.SAVE_REPORT || 'true',
  HOURLY_RATE: process.env.HOURLY_RATE || '0',
  NET_PERCENTAGE: process.env.NET_PERCENTAGE || '0'
};

/**
 * Funzione principale
 */
async function runMultiTeamReport() {
  try {
    LoggerUtils.info('🚀 ClickUp Multi-Team Time Tracker');
    LoggerUtils.info(`📋 Team configurati: ${config.TEAM_IDS.join(', ')}`);

    const tracker = new ClickUpMultiTeamTracker(config);
    const result = await tracker.run();

    return result;

  } catch (error) {
    LoggerUtils.error('Errore fatale:', error.message);
    process.exit(1);
  }
}

// Esecuzione se chiamato direttamente
if (import.meta.url.startsWith('file://') && process.argv[1].endsWith('index.js')) {
  runMultiTeamReport();
}

export default ClickUpMultiTeamTracker; 