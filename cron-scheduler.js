#!/usr/bin/env node

/**
 * Cron Scheduler per ClickUp Time Tracker
 * Permette di schedulare l'esecuzione automatica del time tracker
 */

import fs from 'fs';
import { spawn } from 'child_process';
import { DateUtils, LoggerUtils } from './utils.js';

class CronScheduler {
  constructor() {
    this.scriptPath = './index.js';
    this.logDir = './logs';
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Genera configurazione cron per diversi scenari
   */
  generateCronExamples() {
    const examples = [
      {
        name: 'Giornaliero alle 18:00',
        cron: '0 18 * * *',
        description: 'Esegue il report giornaliero alle 18:00'
      },
      {
        name: 'Settimanale (Venerdì alle 17:00)',
        cron: '0 17 * * 5',
        description: 'Esegue il report settimanale ogni venerdì alle 17:00'
      },
      {
        name: 'Mensile (primo del mese alle 9:00)',
        cron: '0 9 1 * *',
        description: 'Esegue il report mensile il primo di ogni mese alle 9:00'
      },
      {
        name: 'Ogni 4 ore (orario lavorativo)',
        cron: '0 9,13,17 * * 1-5',
        description: 'Esegue il report ogni 4 ore durante i giorni lavorativi'
      }
    ];

    return examples;
  }

  /**
   * Genera script bash per l'esecuzione via cron
   */
  generateCronScript() {
    const scriptContent = `#!/bin/bash

# ClickUp Time Tracker - Cron Script
# Generato automaticamente il ${new Date().toISOString()}

# Configurazione
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="\${SCRIPT_DIR}/logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="\${LOG_DIR}/cron_\${TIMESTAMP}.log"

# Crea directory log se non esiste
mkdir -p "\${LOG_DIR}"

# Vai nella directory dello script
cd "\${SCRIPT_DIR}"

# Esegui lo script con logging
echo "$(date): Avvio ClickUp Time Tracker" >> "\${LOG_FILE}"
node index.js >> "\${LOG_FILE}" 2>&1
EXIT_CODE=$?

# Log risultato
if [ \${EXIT_CODE} -eq 0 ]; then
    echo "$(date): Esecuzione completata con successo" >> "\${LOG_FILE}"
else
    echo "$(date): Errore nell'esecuzione (codice: \${EXIT_CODE})" >> "\${LOG_FILE}"
fi

# Cleanup log vecchi (mantieni solo gli ultimi 30 giorni)
find "\${LOG_DIR}" -name "cron_*.log" -type f -mtime +30 -delete

exit \${EXIT_CODE}
`;

    fs.writeFileSync('./run_tracker.sh', scriptContent);
    fs.chmodSync('./run_tracker.sh', 0o755);
    
    return scriptContent;
  }

  /**
   * Genera file crontab
   */
  generateCrontab(cronExpression = '0 18 * * *') {
    const scriptDir = process.cwd();
    const crontabEntry = `# ClickUp Time Tracker - Generato il ${new Date().toISOString()}
# Esegue il report giornaliero alle 18:00
${cronExpression} cd ${scriptDir} && ./run_tracker.sh

`;

    fs.writeFileSync('./crontab.txt', crontabEntry);
    return crontabEntry;
  }

  /**
   * Installa il cron job
   */
  async installCronJob(cronExpression = '0 18 * * *') {
    try {
      LoggerUtils.info('📅 Installazione cron job...');

      // Genera script bash
      this.generateCronScript();
      LoggerUtils.success('✅ Script bash generato: run_tracker.sh');

      // Genera crontab
      this.generateCrontab(cronExpression);
      LoggerUtils.success('✅ File crontab generato: crontab.txt');

      // Installa nel crontab dell'utente
      const crontabProcess = spawn('crontab', ['crontab.txt'], { 
        stdio: 'inherit' 
      });

      crontabProcess.on('close', (code) => {
        if (code === 0) {
          LoggerUtils.success('✅ Cron job installato con successo!');
          LoggerUtils.info(`📅 Programma: ${cronExpression}`);
          LoggerUtils.info('📋 Per verificare: crontab -l');
          LoggerUtils.info('📂 Log in: ./logs/');
        } else {
          LoggerUtils.error('❌ Errore nell\'installazione del cron job');
        }
      });

    } catch (error) {
      LoggerUtils.error('Errore nell\'installazione:', error.message);
      throw error;
    }
  }

  /**
   * Mostra esempi di utilizzo
   */
  showExamples() {
    const examples = this.generateCronExamples();
    
    console.log('\n' + '='.repeat(60));
    console.log('📅 ESEMPI DI SCHEDULAZIONE CRON');
    console.log('='.repeat(60));

    examples.forEach((example, index) => {
      console.log(`\n${index + 1}. ${example.name}`);
      console.log(`   Cron: ${example.cron}`);
      console.log(`   Descrizione: ${example.description}`);
    });

    console.log('\n📖 COMANDI UTILI:');
    console.log('   crontab -l          # Mostra cron jobs attivi');
    console.log('   crontab -r          # Rimuove tutti i cron jobs');
    console.log('   crontab -e          # Modifica cron jobs');
    console.log('   tail -f logs/*.log  # Monitora i log');

    console.log('\n🔧 SETUP RAPIDO:');
    console.log('   node cron-scheduler.js install');
    console.log('   node cron-scheduler.js install "0 9 * * 1-5"');
    console.log('   node cron-scheduler.js examples');
  }

  /**
   * Testa l'esecuzione manuale
   */
  async testRun() {
    LoggerUtils.info('🧪 Test esecuzione manuale...');
    
    return new Promise((resolve, reject) => {
      const testProcess = spawn('node', ['index.js'], {
        stdio: 'inherit',
        env: { ...process.env, DEBUG: 'true' }
      });

      testProcess.on('close', (code) => {
        if (code === 0) {
          LoggerUtils.success('✅ Test completato con successo!');
          resolve();
        } else {
          LoggerUtils.error(`❌ Test fallito con codice: ${code}`);
          reject(new Error(`Test fallito: ${code}`));
        }
      });

      testProcess.on('error', (error) => {
        LoggerUtils.error('Errore nel test:', error.message);
        reject(error);
      });
    });
  }
}

// Gestione argomenti da linea di comando
async function main() {
  const scheduler = new CronScheduler();
  const command = process.argv[2];
  const cronExpression = process.argv[3];

  switch (command) {
    case 'install':
      await scheduler.installCronJob(cronExpression);
      break;
    
    case 'examples':
      scheduler.showExamples();
      break;
    
    case 'test':
      await scheduler.testRun();
      break;
    
    case 'generate':
      scheduler.generateCronScript();
      scheduler.generateCrontab(cronExpression);
      LoggerUtils.success('✅ File generati: run_tracker.sh e crontab.txt');
      break;
    
    default:
      console.log('📅 ClickUp Time Tracker - Cron Scheduler');
      console.log('\nUso:');
      console.log('  node cron-scheduler.js install [cron_expression]');
      console.log('  node cron-scheduler.js examples');
      console.log('  node cron-scheduler.js test');
      console.log('  node cron-scheduler.js generate [cron_expression]');
      console.log('\nEsempi:');
      console.log('  node cron-scheduler.js install "0 18 * * *"');
      console.log('  node cron-scheduler.js install "0 9 1 * *"');
      console.log('  node cron-scheduler.js examples');
      break;
  }
}

// Esecuzione se chiamato direttamente
if (import.meta.url.startsWith('file://') && process.argv[1].endsWith('cron-scheduler.js')) {
  main().catch(error => {
    LoggerUtils.error('Errore:', error.message);
    process.exit(1);
  });
}

export default CronScheduler; 