#!/usr/bin/env node

/**
 * ClickUp Time Tracker - Script principale
 * Calcola le ore tracciate da un utente in un intervallo temporale
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

class ClickUpTimeTracker {
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
   * Ottiene le time entries con paginazione automatica
   */
  async getAllTimeEntries(teamId, userId, startDate, endDate) {
    let allEntries = [];
    let page = 0;
    let hasMore = true;

    LoggerUtils.info(`Recupero time entries per l'utente ${userId} dal ${DateUtils.formatDate(startDate)} al ${DateUtils.formatDate(endDate)}`);

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

        LoggerUtils.debug(`Chiamata API: ${url}?${params}`);
        LoggerUtils.debug(`Parametri: teamId=${teamId}, userId=${userId}, startDate=${startDate}, endDate=${endDate}`);
        
        const response = await this.apiCall(`${url}?${params}`);
        
        // Debug response completa
        LoggerUtils.debug('Response ricevuta:', JSON.stringify(response, null, 2));
        
        const entries = response.data || [];

        if (entries.length === 0) {
          hasMore = false;
          LoggerUtils.debug(`Nessuna entry trovata alla pagina ${page + 1}`);
        } else {
          allEntries = allEntries.concat(entries);
          LoggerUtils.info(`Recuperate ${entries.length} time entries (pagina ${page + 1}). Totale: ${allEntries.length}`);
          LoggerUtils.debug(`Prime 3 entries:`, JSON.stringify(entries.slice(0, 3), null, 2));
          page++;
          
          // Verifica se ci sono altre pagine
          hasMore = entries.length === DEFAULT_PAGE_SIZE;
        }

        // Piccola pausa per evitare rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        LoggerUtils.error(`Errore nel recupero della pagina ${page + 1}:`, error.message);
        LoggerUtils.error('Dettagli errore:', error);
        throw error;
      }
    }

    LoggerUtils.success(`Recuperate ${allEntries.length} time entries totali`);
    return allEntries;
  }

  /**
   * Elabora e calcola le statistiche delle time entries
   */
  processTimeEntries(entries) {
    let totalDuration = 0;
    const processedEntries = [];

    entries.forEach(entry => {
      const duration = parseInt(entry.duration) || 0;
      totalDuration += duration;

      processedEntries.push({
        id: entry.id,
        description: entry.description || 'N/A',
        duration: duration,
        start: parseInt(entry.start),
        end: parseInt(entry.end || entry.start),
        task: entry.task ? {
          id: entry.task.id,
          name: entry.task.name,
          url: entry.task.url
        } : null,
        user: entry.user ? {
          id: entry.user.id,
          username: entry.user.username,
          email: entry.user.email
        } : null,
        created_at: entry.created_at,
        updated_at: entry.updated_at
      });
    });

    const totalHours = DateUtils.millisecondsToHours(totalDuration);

    return {
      totalHours,
      totalDuration,
      entriesCount: entries.length,
      entriesList: processedEntries,
      summary: {
        formatted_duration: DateUtils.formatDuration(totalDuration),
        period: {
          start: DateUtils.formatDate(parseInt(this.config.START_DATE)),
          end: DateUtils.formatDate(parseInt(this.config.END_DATE))
        },
        user_id: this.config.USER_ID,
        team_id: this.config.TEAM_ID
      }
    };
  }

  /**
   * Genera statistiche aggiuntive
   */
  generateAdditionalStats(processedData) {
    const { entriesList } = processedData;

    // Raggruppa per giorno
    const dailyStats = {};
    entriesList.forEach(entry => {
      const date = new Date(entry.start).toDateString();
      if (!dailyStats[date]) {
        dailyStats[date] = { duration: 0, count: 0 };
      }
      dailyStats[date].duration += entry.duration;
      dailyStats[date].count++;
    });

    // Raggruppa per task
    const taskStats = {};
    entriesList.forEach(entry => {
      const taskName = entry.task?.name || 'Senza task';
      if (!taskStats[taskName]) {
        taskStats[taskName] = { duration: 0, count: 0, task_id: entry.task?.id };
      }
      taskStats[taskName].duration += entry.duration;
      taskStats[taskName].count++;
    });

    // Converti in array ordinati
    const dailyReport = Object.entries(dailyStats)
      .map(([date, stats]) => ({
        date,
        hours: DateUtils.millisecondsToHours(stats.duration),
        formatted_duration: DateUtils.formatDuration(stats.duration),
        entries_count: stats.count
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const taskReport = Object.entries(taskStats)
      .map(([task, stats]) => ({
        task_name: task,
        task_id: stats.task_id,
        hours: DateUtils.millisecondsToHours(stats.duration),
        formatted_duration: DateUtils.formatDuration(stats.duration),
        entries_count: stats.count
      }))
      .sort((a, b) => b.hours - a.hours);

    return {
      ...processedData,
      daily_breakdown: dailyReport,
      task_breakdown: taskReport
    };
  }

  /**
   * Salva i report nei formati richiesti
   */
  async saveReports(data) {
    const timestamp = new Date().toISOString().split('T')[0];
    const startDate = new Date(parseInt(this.config.START_DATE));
    const monthName = startDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }).replace(' ', '_');
    
    const jsonPath = path.join(this.outputDir, `time_report_${monthName}_${timestamp}.json`);
    const csvPath = path.join(this.outputDir, `time_report_${monthName}_${timestamp}.csv`);

    try {
      // Salva JSON
      FileUtils.saveJson(jsonPath, data);
      LoggerUtils.success(`Report JSON salvato: ${jsonPath}`);

      // Salva CSV se richiesto
      if (this.config.EXPORT_CSV === 'true') {
        await FileUtils.saveCsv(csvPath, data.entriesList);
        LoggerUtils.success(`Report CSV salvato: ${csvPath}`);
      }

      return { jsonPath, csvPath };
    } catch (error) {
      LoggerUtils.error('Errore nel salvataggio dei report:', error.message);
      throw error;
    }
  }

  /**
   * Stampa il summary in console
   */
  printSummary(data) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 REPORT TEMPO TRACCIATO - CLICKUP');
    console.log('='.repeat(60));
    
    console.log(`📅 Periodo: ${data.summary.period.start} - ${data.summary.period.end}`);
    console.log(`👤 Utente: ${data.summary.user_id}`);
    console.log(`👥 Team: ${data.summary.team_id}`);
    console.log(`⏱️  Ore totali: ${data.totalHours}h`);
    console.log(`📝 Numero entries: ${data.entriesCount}`);
    console.log(`🕐 Durata formattata: ${data.summary.formatted_duration}`);

    if (data.daily_breakdown && data.daily_breakdown.length > 0) {
      console.log('\n📈 BREAKDOWN GIORNALIERO:');
      data.daily_breakdown.forEach(day => {
        console.log(`  ${day.date}: ${day.hours}h (${day.entries_count} entries)`);
      });
    }

    if (data.task_breakdown && data.task_breakdown.length > 0) {
      console.log('\n📋 TOP TASK PER ORE:');
      data.task_breakdown.slice(0, 10).forEach((task, index) => {
        console.log(`  ${index + 1}. ${task.task_name}: ${task.hours}h (${task.entries_count} entries)`);
      });
    }

    console.log('\n' + '='.repeat(60));
  }

  /**
   * Esecuzione principale
   */
  async run() {
    try {
      LoggerUtils.info('🚀 Avvio ClickUp Time Tracker...');

      // Validazione configurazione
      const validation = ValidationUtils.validateConfig(this.config);
      if (!validation.isValid) {
        LoggerUtils.error('Configurazione non valida:');
        validation.errors.forEach(error => LoggerUtils.error(`  - ${error}`));
        process.exit(1);
      }

      // Recupera le time entries
      const timeEntries = await this.getAllTimeEntries(
        this.config.TEAM_ID,
        this.config.USER_ID,
        parseInt(this.config.START_DATE),
        parseInt(this.config.END_DATE)
      );

      if (timeEntries.length === 0) {
        LoggerUtils.warning('Nessuna time entry trovata per il periodo specificato');
        return;
      }

      // Elabora i dati
      const processedData = this.processTimeEntries(timeEntries);
      const finalData = this.generateAdditionalStats(processedData);

      // Stampa summary
      this.printSummary(finalData);

      // Salva report
      const savedFiles = await this.saveReports(finalData);
      
      LoggerUtils.success('✅ Elaborazione completata con successo!');
      LoggerUtils.info(`📁 File salvati in: ${this.outputDir}`);

      return finalData;

    } catch (error) {
      LoggerUtils.error('Errore durante l\'elaborazione:', error.message);
      
      // Suggerimenti per errori comuni
      if (error.message.includes('401')) {
        LoggerUtils.error('🔑 Token non valido. Verifica il tuo Personal API Token.');
      } else if (error.message.includes('403')) {
        LoggerUtils.error('🚫 Accesso negato. Verifica i permessi per team_id e user_id.');
      } else if (error.message.includes('404')) {
        LoggerUtils.error('📭 Risorsa non trovata. Verifica team_id e user_id.');
      } else if (error.message.includes('429')) {
        LoggerUtils.error('⏳ Rate limit superato. Riprova tra qualche minuto.');
      }

      process.exit(1);
    }
  }
}

// Calcola i range per mese corrente e mese precedente
function getMonthlyRanges() {
  const now = new Date();
  
  // Mese corrente
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  
  // Mese precedente
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  
  return {
    currentMonth: {
      start: currentMonthStart.getTime(),
      end: currentMonthEnd.getTime(),
      name: currentMonthStart.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
    },
    lastMonth: {
      start: lastMonthStart.getTime(),
      end: lastMonthEnd.getTime(),
      name: lastMonthStart.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
    }
  };
}

// Configurazione base da variabili d'ambiente
const baseConfig = {
  CLICKUP_TOKEN: process.env.CLICKUP_TOKEN,
  TEAM_ID: process.env.TEAM_ID,
  USER_ID: process.env.USER_ID,
  EXPORT_CSV: process.env.EXPORT_CSV || 'true',
  OUTPUT_DIR: process.env.OUTPUT_DIR || './reports'
};

// Funzione per eseguire report per entrambi i mesi
async function runMonthlyReports() {
  try {
    LoggerUtils.info('🚀 Avvio ClickUp Time Tracker per mesi multipli...');
    
    // Se sono specificate date custom, usa quelle
    if (process.env.START_DATE && process.env.END_DATE) {
      const customConfig = {
        ...baseConfig,
        START_DATE: process.env.START_DATE,
        END_DATE: process.env.END_DATE
      };
      
      LoggerUtils.info('📅 Usando range di date personalizzato');
      const tracker = new ClickUpTimeTracker(customConfig);
      await tracker.run();
      return;
    }
    
    // Altrimenti genera report per mese corrente e precedente
    const ranges = getMonthlyRanges();
    
    LoggerUtils.info('📅 Generando report per mese corrente e precedente...');
    LoggerUtils.info(`📊 Mese corrente: ${ranges.currentMonth.name}`);
    LoggerUtils.info(`📊 Mese precedente: ${ranges.lastMonth.name}`);
    
    // Report mese precedente
    console.log('\n' + '═'.repeat(80));
    console.log('📊 REPORT MESE PRECEDENTE: ' + ranges.lastMonth.name.toUpperCase());
    console.log('═'.repeat(80));
    
    const lastMonthConfig = {
      ...baseConfig,
      START_DATE: ranges.lastMonth.start,
      END_DATE: ranges.lastMonth.end
    };
    
    const lastMonthTracker = new ClickUpTimeTracker(lastMonthConfig);
    const lastMonthData = await lastMonthTracker.run();
    
    // Report mese corrente
    console.log('\n' + '═'.repeat(80));
    console.log('📊 REPORT MESE CORRENTE: ' + ranges.currentMonth.name.toUpperCase());
    console.log('═'.repeat(80));
    
    const currentMonthConfig = {
      ...baseConfig,
      START_DATE: ranges.currentMonth.start,
      END_DATE: ranges.currentMonth.end
    };
    
    const currentMonthTracker = new ClickUpTimeTracker(currentMonthConfig);
    const currentMonthData = await currentMonthTracker.run();
    
    // Summary finale
    console.log('\n' + '═'.repeat(80));
    console.log('📈 SUMMARY COMPARATIVO');
    console.log('═'.repeat(80));
    
    const lastMonthHours = lastMonthData ? lastMonthData.totalHours : 0;
    const currentMonthHours = currentMonthData ? currentMonthData.totalHours : 0;
    
    console.log(`📊 ${ranges.lastMonth.name}: ${lastMonthHours}h`);
    console.log(`📊 ${ranges.currentMonth.name}: ${currentMonthHours}h`);
    console.log(`📈 Differenza: ${(currentMonthHours - lastMonthHours).toFixed(2)}h`);
    
    if (currentMonthHours > lastMonthHours) {
      console.log('✅ Più ore questo mese');
    } else if (currentMonthHours < lastMonthHours) {
      console.log('⚠️  Meno ore questo mese');
    } else {
      console.log('➖ Stesso numero di ore');
    }
    
    console.log('═'.repeat(80));
    
  } catch (error) {
    LoggerUtils.error('Errore fatale:', error.message);
    process.exit(1);
  }
}

// Esecuzione se chiamato direttamente
if (import.meta.url.startsWith('file://') && process.argv[1].endsWith('index.js')) {
  runMonthlyReports();
}

export default ClickUpTimeTracker; 