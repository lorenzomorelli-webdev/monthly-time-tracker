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
  ValidationUtils, 
  RateLimitUtils, 
  LoggerUtils 
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
    return DateUtils.millisecondsToHours(totalDuration);
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

        const teamResult = {
          team_id: teamId,
          team_name: teamName,
          previous_month: {
            hours: this.calculateTotalHours(previousEntries),
            entries_count: previousEntries.length,
            period: `${DateUtils.formatDate(dateRanges.previousMonth.start)} - ${DateUtils.formatDate(dateRanges.previousMonth.end)}`
          },
          current_month: {
            hours: this.calculateTotalHours(currentEntries),
            entries_count: currentEntries.length,
            period: `${DateUtils.formatDate(dateRanges.currentMonth.start)} - ${DateUtils.formatDate(dateRanges.currentMonth.end)}`
          }
        };

        results.teams.push(teamResult);
        
        LoggerUtils.success(`✅ ${teamName}: ${teamResult.previous_month.hours}h (precedente) + ${teamResult.current_month.hours}h (corrente)`);

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
      previous_month: { hours: 0, entries: 0 },
      current_month: { hours: 0, entries: 0 }
    };

    teams.forEach(team => {
      if (!team.error) {
        totals.previous_month.hours += team.previous_month.hours;
        totals.previous_month.entries += team.previous_month.entries_count;
        totals.current_month.hours += team.current_month.hours;
        totals.current_month.entries += team.current_month.entries_count;
      }
    });

    return totals;
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
   * Stampa il summary pulito in console
   */
  printCleanSummary(data) {
    console.log('\n' + '═'.repeat(80));
    console.log('📊 CLICKUP TIME TRACKER - MULTI-TEAM REPORT');
    console.log('═'.repeat(80));
    
    console.log(`👤 Utente: ${data.username} (ID: ${data.user_id})`);
    console.log(`📅 Mese precedente: ${data.period.previous_month}`);
    console.log(`📅 Mese corrente: ${data.period.current_month}`);
    console.log('');

    // Report per team
    console.log('📋 ORE PER PROGETTO:');
    console.log('─'.repeat(80));
    
    data.teams.forEach((team, index) => {
      if (team.error) {
        console.log(`❌ ${team.team_name}: ERRORE - ${team.error}`);
      } else {
        console.log(`${index + 1}. 🏢 ${team.team_name.toUpperCase()}`);
        console.log(`   📊 Mese precedente: ${team.previous_month.hours}h (${team.previous_month.entries_count} entries)`);
        console.log(`   📈 Mese corrente:   ${team.current_month.hours}h (${team.current_month.entries_count} entries)`);
        
        const diff = team.current_month.hours - team.previous_month.hours;
        const diffText = diff > 0 ? `+${diff.toFixed(1)}h` : `${diff.toFixed(1)}h`;
        const diffIcon = diff > 0 ? '📈' : diff < 0 ? '📉' : '➖';
        console.log(`   ${diffIcon} Differenza: ${diffText}`);
        console.log('');
      }
    });

    // Totali generali
    console.log('🏆 TOTALI GENERALI:');
    console.log('─'.repeat(80));
    console.log(`📊 Mese precedente: ${data.totals.previous_month.hours}h (${data.totals.previous_month.entries} entries totali)`);
    console.log(`📈 Mese corrente:   ${data.totals.current_month.hours}h (${data.totals.current_month.entries} entries totali)`);
    
    const totalDiff = data.totals.current_month.hours - data.totals.previous_month.hours;
    const totalDiffText = totalDiff > 0 ? `+${totalDiff.toFixed(1)}h` : `${totalDiff.toFixed(1)}h`;
    const totalDiffIcon = totalDiff > 0 ? '📈' : totalDiff < 0 ? '📉' : '➖';
    console.log(`${totalDiffIcon} Differenza totale: ${totalDiffText}`);
    
    console.log('\n' + '═'.repeat(80));
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
  // Array di team IDs (Flip Alert + AMIX)
  TEAM_IDS: process.env.TEAM_IDS ? 
    process.env.TEAM_IDS.split(',').map(id => id.trim()) : 
    ['90151008101', '90151008149'], // Default: Flip Alert + AMIX
  USER_ID: process.env.USER_ID,
  OUTPUT_DIR: process.env.OUTPUT_DIR || './reports',
  SAVE_REPORT: process.env.SAVE_REPORT || 'true'
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