/**
 * Utility functions per il time tracker ClickUp
 */

import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';

export class DateUtils {
  /**
   * Converte una data in timestamp milliseconds
   * @param {string|Date} date - Data in formato ISO o oggetto Date
   * @returns {number} Timestamp in milliseconds
   */
  static toTimestamp(date) {
    if (typeof date === 'string') {
      return new Date(date).getTime();
    }
    if (date instanceof Date) {
      return date.getTime();
    }
    return date;
  }

  /**
   * Ottiene l'inizio del mese corrente
   * @returns {number} Timestamp inizio mese
   */
  static getCurrentMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }

  /**
   * Ottiene la fine del mese corrente
   * @returns {number} Timestamp fine mese
   */
  static getCurrentMonthEnd() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  }

  /**
   * Formatta un timestamp in data leggibile
   * @param {number} timestamp - Timestamp in milliseconds
   * @returns {string} Data formattata
   */
  static formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Formatta una durata in ore e minuti
   * @param {number} milliseconds - Durata in millisecondi
   * @returns {string} Durata formattata
   */
  static formatDuration(milliseconds) {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }

  /**
   * Converte millisecondi in ore decimali
   * @param {number} milliseconds - Millisecondi
   * @returns {number} Ore con 2 decimali
   */
  static millisecondsToHours(milliseconds) {
    return Math.round((milliseconds / (1000 * 60 * 60)) * 100) / 100;
  }
}

export class FileUtils {
  /**
   * Crea una directory se non esiste
   * @param {string} dirPath - Path della directory
   */
  static ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Salva dati in formato JSON
   * @param {string} filePath - Path del file
   * @param {Object} data - Dati da salvare
   */
  static saveJson(filePath, data) {
    const dir = path.dirname(filePath);
    this.ensureDirectoryExists(dir);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Salva dati in formato CSV
   * @param {string} filePath - Path del file
   * @param {Array} data - Array di time entries
   */
  static async saveCsv(filePath, data) {
    const dir = path.dirname(filePath);
    this.ensureDirectoryExists(dir);

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'description', title: 'Descrizione' },
        { id: 'duration_hours', title: 'Ore' },
        { id: 'start_date', title: 'Data Inizio' },
        { id: 'end_date', title: 'Data Fine' },
        { id: 'task_name', title: 'Task' },
        { id: 'task_id', title: 'Task ID' },
        { id: 'user_name', title: 'Utente' }
      ]
    });

    const csvData = data.map(entry => ({
      id: entry.id,
      description: entry.description || 'N/A',
      duration_hours: DateUtils.millisecondsToHours(entry.duration),
      start_date: DateUtils.formatDate(entry.start),
      end_date: DateUtils.formatDate(entry.end || entry.start),
      task_name: entry.task?.name || 'N/A',
      task_id: entry.task?.id || 'N/A',
      user_name: entry.user?.username || 'N/A'
    }));

    await csvWriter.writeRecords(csvData);
  }
}

export class ValidationUtils {
  /**
   * Valida il formato del token ClickUp
   * @param {string} token - Token da validare
   * @returns {boolean} True se valido
   */
  static isValidClickUpToken(token) {
    return token && typeof token === 'string' && token.startsWith('pk_');
  }

  /**
   * Valida un timestamp
   * @param {number|string} timestamp - Timestamp da validare
   * @returns {boolean} True se valido
   */
  static isValidTimestamp(timestamp) {
    const ts = parseInt(timestamp);
    const now = Date.now();
    const twoYearsFromNow = now + (2 * 365 * 24 * 60 * 60 * 1000); // 2 anni nel futuro
    const fiveYearsAgo = now - (5 * 365 * 24 * 60 * 60 * 1000); // 5 anni nel passato
    
    return !isNaN(ts) && ts > 0 && ts >= fiveYearsAgo && ts <= twoYearsFromNow;
  }

  /**
   * Valida un ID ClickUp
   * @param {string} id - ID da validare
   * @returns {boolean} True se valido
   */
  static isValidClickUpId(id) {
    return id && typeof id === 'string' && id.length > 0;
  }

  /**
   * Valida la configurazione completa
   * @param {Object} config - Configurazione da validare
   * @returns {Object} Risultato validazione
   */
  static validateConfig(config) {
    const errors = [];

    if (!this.isValidClickUpToken(config.CLICKUP_TOKEN)) {
      errors.push('Token ClickUp non valido (deve iniziare con pk_)');
    }

    if (!this.isValidClickUpId(config.TEAM_ID)) {
      errors.push('TEAM_ID non valido');
    }

    if (!this.isValidClickUpId(config.USER_ID)) {
      errors.push('USER_ID non valido');
    }

    if (!this.isValidTimestamp(config.START_DATE)) {
      errors.push('START_DATE non valido');
    }

    if (!this.isValidTimestamp(config.END_DATE)) {
      errors.push('END_DATE non valido');
    }

    if (config.START_DATE >= config.END_DATE) {
      errors.push('START_DATE deve essere precedente a END_DATE');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export class RateLimitUtils {
  /**
   * Gestisce il rate limiting con delay esponenziale
   * @param {number} attempt - Numero tentativo
   * @param {number} maxAttempts - Tentativi massimi
   * @returns {Promise<number>} Delay in millisecondi
   */
  static async exponentialBackoff(attempt, maxAttempts = 5) {
    if (attempt >= maxAttempts) {
      throw new Error(`Raggiunto il limite massimo di tentativi: ${maxAttempts}`);
    }

    const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30 secondi
    console.log(`⏳ Rate limit raggiunto. Attesa di ${delay}ms prima del tentativo ${attempt + 1}/${maxAttempts}`);
    
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Wrapper per gestire automaticamente il rate limiting
   * @param {Function} apiCall - Funzione da chiamare
   * @param {number} maxAttempts - Tentativi massimi
   * @returns {Promise<any>} Risultato della chiamata
   */
  static async withRetry(apiCall, maxAttempts = 5) {
    let lastError;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        if (error.message.includes('429') || error.message.includes('rate limit')) {
          await this.exponentialBackoff(attempt, maxAttempts);
          continue;
        }
        
        // Se non è un errore di rate limit, rilancia subito
        throw error;
      }
    }

    throw lastError;
  }
}

export class LoggerUtils {
  /**
   * Log colorato per diversi livelli
   */
  static info(message, ...args) {
    console.log(`ℹ️  ${message}`, ...args);
  }

  static success(message, ...args) {
    console.log(`✅ ${message}`, ...args);
  }

  static warning(message, ...args) {
    console.warn(`⚠️  ${message}`, ...args);
  }

  static error(message, ...args) {
    console.error(`❌ ${message}`, ...args);
  }

  static debug(message, ...args) {
    if (process.env.DEBUG) {
      console.log(`🐛 ${message}`, ...args);
    }
  }
} 