#!/usr/bin/env node

/**
 * Test suite per ClickUp Time Tracker
 * Verifica il funzionamento delle funzioni principali
 */

import dotenv from 'dotenv';
import { DateUtils, ValidationUtils, FileUtils, LoggerUtils } from './utils.js';
import ClickUpTimeTracker from './index.js';
import ClickUpSetup from './setup.js';

dotenv.config();

class TestSuite {
  constructor() {
    this.testResults = [];
    this.passedTests = 0;
    this.failedTests = 0;
  }

  /**
   * Esegue un test singolo
   */
  async runTest(testName, testFunction) {
    try {
      LoggerUtils.info(`🧪 Test: ${testName}`);
      await testFunction();
      this.testResults.push({ name: testName, status: 'PASS' });
      this.passedTests++;
      LoggerUtils.success(`✅ ${testName} - PASSED`);
    } catch (error) {
      this.testResults.push({ name: testName, status: 'FAIL', error: error.message });
      this.failedTests++;
      LoggerUtils.error(`❌ ${testName} - FAILED: ${error.message}`);
    }
  }

  /**
   * Test delle utility per le date
   */
  async testDateUtils() {
    const now = Date.now();
    const monthStart = DateUtils.getCurrentMonthStart();
    const monthEnd = DateUtils.getCurrentMonthEnd();

    if (monthStart > now) {
      throw new Error('Month start dovrebbe essere nel passato');
    }

    if (monthEnd < now) {
      throw new Error('Month end dovrebbe essere nel futuro');
    }

    const formatted = DateUtils.formatDate(now);
    if (!formatted || typeof formatted !== 'string') {
      throw new Error('Formato data non valido');
    }

    const hours = DateUtils.millisecondsToHours(3600000); // 1 ora
    if (hours !== 1) {
      throw new Error(`Conversione ore non corretta: attesa 1, ottenuta ${hours}`);
    }

    const duration = DateUtils.formatDuration(3900000); // 1h 5m
    if (!duration.includes('1h') || !duration.includes('5m')) {
      throw new Error(`Formato durata non corretto: ${duration}`);
    }
  }

  /**
   * Test delle utility di validazione
   */
  async testValidationUtils() {
    // Test token valido
    if (!ValidationUtils.isValidClickUpToken('pk_123456')) {
      throw new Error('Token valido non riconosciuto');
    }

    // Test token non valido
    if (ValidationUtils.isValidClickUpToken('invalid_token')) {
      throw new Error('Token non valido accettato');
    }

    // Test timestamp valido
    if (!ValidationUtils.isValidTimestamp(Date.now())) {
      throw new Error('Timestamp valido non riconosciuto');
    }

    // Test timestamp non valido
    if (ValidationUtils.isValidTimestamp(-1)) {
      throw new Error('Timestamp non valido accettato');
    }

    // Test ID valido
    if (!ValidationUtils.isValidClickUpId('123456')) {
      throw new Error('ID valido non riconosciuto');
    }

    // Test ID non valido
    if (ValidationUtils.isValidClickUpId('')) {
      throw new Error('ID vuoto accettato');
    }
  }

  /**
   * Test della configurazione
   */
  async testConfigValidation() {
    const validConfig = {
      CLICKUP_TOKEN: 'pk_123456',
      TEAM_IDS: ['123456', '654321'],
      USER_ID: '789012',
      HOURLY_RATE: '30'
    };

    const validation = ValidationUtils.validateConfig(validConfig);
    if (!validation.isValid) {
      throw new Error(`Configurazione valida rigettata: ${validation.errors.join(', ')}`);
    }

    const invalidConfig = {
      CLICKUP_TOKEN: 'invalid',
      TEAM_IDS: [],
      USER_ID: '123',
      HOURLY_RATE: '-1'
    };

    const invalidValidation = ValidationUtils.validateConfig(invalidConfig);
    if (invalidValidation.isValid) {
      throw new Error('Configurazione non valida accettata');
    }
  }

  /**
   * Test della configurazione generata dallo script di setup
   */
  async testSetupEnvGeneration() {
    const setup = new ClickUpSetup('pk_test_token');
    const envContent = setup.generateEnvFile(['111', '222'], '333');

    const expectedLines = [
      'CLICKUP_TOKEN="pk_test_token"',
      'USER_ID="333"',
      'TEAM_IDS="111,222"',
      'HOURLY_RATE="30"',
      'NET_PERCENTAGE="0"',
      'OUTPUT_DIR="./reports"',
      'SAVE_REPORT="true"'
    ];

    expectedLines.forEach(line => {
      if (!envContent.includes(line)) {
        throw new Error(`Configurazione setup incompleta: manca ${line}`);
      }
    });

    const deprecatedKeys = ['TEAM_ID=', 'START_DATE=', 'END_DATE=', 'EXPORT_CSV='];
    deprecatedKeys.forEach(key => {
      if (envContent.includes(key)) {
        throw new Error(`Configurazione setup obsoleta: contiene ${key}`);
      }
    });
  }

  /**
   * Test del contratto ClickUp: il range completo viene richiesto una sola volta
   */
  async testTimeEntriesSingleRequest() {
    const tracker = new ClickUpTimeTracker({
      CLICKUP_TOKEN: 'pk_test_token',
      TEAM_IDS: ['111'],
      USER_ID: '333',
      HOURLY_RATE: '0'
    });
    const sampleEntries = Array.from({ length: 100 }, (_, index) => ({
      id: String(index + 1),
      duration: '3600000',
      start: '1767225600000',
      end: '1767229200000',
      description: `Entry ${index + 1}`,
      task: null,
      user: { id: 333, username: 'test-user', email: 'test@example.com' }
    }));
    const requestedUrls = [];

    tracker.apiCall = async url => {
      requestedUrls.push(url);
      return requestedUrls.length === 1 ? { data: sampleEntries } : { data: [] };
    };

    const entries = await tracker.getTeamTimeEntries('111', '333', 1767225600000, 1769903999999);

    if (requestedUrls.length !== 1) {
      throw new Error(`ClickUp è stato interrogato ${requestedUrls.length} volte invece di una`);
    }
    if (requestedUrls[0].includes('page=') || requestedUrls[0].includes('page_size=')) {
      throw new Error('La richiesta ClickUp contiene parametri di paginazione non supportati');
    }
    if (entries.length !== 100) {
      throw new Error(`Numero di entry inatteso: ${entries.length}`);
    }
  }

  /**
   * Test delle utility per i file
   */
  async testFileUtils() {
    const testDir = './test_output';
    const testData = {
      test: 'data',
      timestamp: Date.now(),
      array: [1, 2, 3]
    };

    // Test creazione directory
    FileUtils.ensureDirectoryExists(testDir);
    
    // Test salvataggio JSON
    const jsonPath = `${testDir}/test.json`;
    FileUtils.saveJson(jsonPath, testData);
    
    // Verifica che il file esista
    const fs = await import('fs');
    if (!fs.existsSync(jsonPath)) {
      throw new Error('File JSON non creato');
    }

    // Verifica contenuto
    const savedData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (savedData.test !== testData.test) {
      throw new Error('Dati JSON non corretti');
    }

    // Test CSV con dati mock
    const csvTestData = [
      {
        id: '1',
        description: 'Test task',
        duration: 3600000,
        start: Date.now() - 3600000,
        end: Date.now(),
        task: { id: 'task1', name: 'Test Task' },
        user: { id: 'user1', username: 'testuser' }
      }
    ];

    const csvPath = `${testDir}/test.csv`;
    await FileUtils.saveCsv(csvPath, csvTestData);
    
    if (!fs.existsSync(csvPath)) {
      throw new Error('File CSV non creato');
    }

    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  /**
   * Test di connessione API (se disponibile)
   */
  async testApiConnection() {
    const token = process.env.CLICKUP_TOKEN;
    
    if (!token) {
      LoggerUtils.warning('⚠️ Test API saltato: CLICKUP_TOKEN non configurato');
      return;
    }

    const setup = new ClickUpSetup(token);
    
    try {
      await setup.getUserInfo();
      LoggerUtils.success('✅ Connessione API funzionante');
    } catch (error) {
      if (error.message.includes('401')) {
        throw new Error('Token non valido');
      }
      throw error;
    }
  }

  /**
   * Test integrazione completa (se configurato)
   */
  async testFullIntegration() {
    const requiredEnvVars = ['CLICKUP_TOKEN', 'TEAM_IDS', 'USER_ID'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      LoggerUtils.warning(`⚠️ Test integrazione saltato: variabili mancanti: ${missingVars.join(', ')}`);
      return;
    }

    const config = {
      CLICKUP_TOKEN: process.env.CLICKUP_TOKEN,
      TEAM_IDS: process.env.TEAM_IDS.split(',').map(id => id.trim()).filter(Boolean),
      USER_ID: process.env.USER_ID,
      HOURLY_RATE: process.env.HOURLY_RATE || '0',
      OUTPUT_DIR: './test_reports'
    };

    const tracker = new ClickUpTimeTracker(config);
    
    // Test solo la validazione e preparazione, non la chiamata API completa
    const validation = ValidationUtils.validateConfig(config);
    if (!validation.isValid) {
      throw new Error(`Configurazione non valida: ${validation.errors.join(', ')}`);
    }

    LoggerUtils.success('✅ Configurazione integrazione valida');
  }

  /**
   * Test di performance
   */
  async testPerformance() {
    const iterations = 1000;
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      DateUtils.millisecondsToHours(3600000 * i);
      ValidationUtils.isValidClickUpToken('pk_test');
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (duration > 1000) { // Più di 1 secondo per 1000 iterazioni
      throw new Error(`Performance test fallito: ${duration}ms per ${iterations} iterazioni`);
    }

    LoggerUtils.success(`✅ Performance test OK: ${duration}ms per ${iterations} iterazioni`);
  }

  /**
   * Esegue tutti i test
   */
  async runAllTests() {
    LoggerUtils.info('🚀 Avvio test suite ClickUp Time Tracker');
    console.log('='.repeat(60));

    await this.runTest('Date Utils', () => this.testDateUtils());
    await this.runTest('Validation Utils', () => this.testValidationUtils());
    await this.runTest('Config Validation', () => this.testConfigValidation());
    await this.runTest('Setup Env Generation', () => this.testSetupEnvGeneration());
    await this.runTest('Time Entries Single Request', () => this.testTimeEntriesSingleRequest());
    await this.runTest('File Utils', () => this.testFileUtils());
    await this.runTest('API Connection', () => this.testApiConnection());
    await this.runTest('Full Integration', () => this.testFullIntegration());
    await this.runTest('Performance', () => this.testPerformance());

    this.printResults();
  }

  /**
   * Stampa i risultati dei test
   */
  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 RISULTATI TEST');
    console.log('='.repeat(60));

    this.testResults.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${result.name}: ${result.status}`);
      if (result.error) {
        console.log(`    Errore: ${result.error}`);
      }
    });

    console.log('\n📈 STATISTICHE:');
    console.log(`  Test eseguiti: ${this.testResults.length}`);
    console.log(`  Successi: ${this.passedTests}`);
    console.log(`  Fallimenti: ${this.failedTests}`);
    console.log(`  Percentuale successo: ${Math.round((this.passedTests / this.testResults.length) * 100)}%`);

    if (this.failedTests > 0) {
      console.log('\n❌ Alcuni test sono falliti. Verifica la configurazione.');
      process.exit(1);
    } else {
      console.log('\n✅ Tutti i test sono passati!');
    }
  }
}

// Esecuzione se chiamato direttamente
if (import.meta.url.startsWith('file://') && process.argv[1].endsWith('test.js')) {
  const testSuite = new TestSuite();
  testSuite.runAllTests().catch(error => {
    LoggerUtils.error('Errore nei test:', error.message);
    process.exit(1);
  });
}

export default TestSuite;
