#!/usr/bin/env node

/**
 * Setup script per ottenere team_id e user_id da ClickUp API
 * Esegui: node setup.js
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const API_BASE = 'https://api.clickup.com/api/v2';

class ClickUpSetup {
  constructor(token) {
    this.token = token;
    this.headers = {
      'Authorization': token,
      'Content-Type': 'application/json'
    };
  }

  async fetchWithErrorHandling(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...this.headers, ...options.headers }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${error.err || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`❌ Errore nella chiamata a ${url}:`, error.message);
      throw error;
    }
  }

  async getTeams() {
    console.log('🔍 Recupero dei team...');
    const data = await this.fetchWithErrorHandling(`${API_BASE}/team`);
    return data.teams;
  }

  async getWorkspaces() {
    console.log('🔍 Recupero dei workspace...');
    const data = await this.fetchWithErrorHandling(`${API_BASE}/team`);
    return data.teams;
  }

  async getTeamMembers(teamId) {
    console.log(`🔍 Recupero membri del team ${teamId}...`);
    const data = await this.fetchWithErrorHandling(`${API_BASE}/team/${teamId}`);
    return data.team.members;
  }

  async getUserInfo() {
    console.log('🔍 Recupero informazioni utente...');
    const data = await this.fetchWithErrorHandling(`${API_BASE}/user`);
    return data.user;
  }

  displayTeams(teams) {
    console.log('\n📋 I tuoi team/workspace:');
    teams.forEach((team, index) => {
      console.log(`${index + 1}. ${team.name} (ID: ${team.id})`);
    });
  }

  displayMembers(members) {
    console.log('\n👥 Membri del team:');
    members.forEach((member, index) => {
      console.log(`${index + 1}. ${member.user.username} (ID: ${member.user.id}) - ${member.user.email}`);
    });
  }

  displayUserInfo(user) {
    console.log('\n👤 Le tue informazioni:');
    console.log(`Nome: ${user.username}`);
    console.log(`Email: ${user.email}`);
    console.log(`ID: ${user.id}`);
  }

  generateEnvFile(teamId, userId) {
    // Calcola automaticamente il range dal mese scorso al mese corrente
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const envContent = `# ClickUp API Configuration
CLICKUP_TOKEN=${this.token}

# Team and User IDs
TEAM_ID=${teamId}
USER_ID=${userId}

# Date range (timestamp in milliseconds)
# Range automatico: dal mese scorso al mese corrente
# ${lastMonthStart.toLocaleDateString('it-IT')} - ${currentMonthEnd.toLocaleDateString('it-IT')}
START_DATE=${lastMonthStart.getTime()}
END_DATE=${currentMonthEnd.getTime()}

# Output options
EXPORT_CSV=true
OUTPUT_DIR=./reports`;

    return envContent;
  }
}

async function main() {
  const token = process.env.CLICKUP_TOKEN || process.argv[2];

  if (!token) {
    console.error('❌ Token ClickUp mancante!');
    console.log('\nUso:');
    console.log('1. Imposta CLICKUP_TOKEN nel file .env');
    console.log('2. Oppure: node setup.js your_token_here');
    console.log('\n📖 Come ottenere il token:');
    console.log('   Settings > Apps > API Token > Generate Token');
    console.log('   https://app.clickup.com/settings/apps');
    process.exit(1);
  }

  const setup = new ClickUpSetup(token);

  try {
    console.log('🚀 Inizializzazione setup ClickUp...\n');

    // Ottieni informazioni utente
    const userInfo = await setup.getUserInfo();
    setup.displayUserInfo(userInfo);

    // Ottieni team
    const teams = await setup.getTeams();
    setup.displayTeams(teams);

    // Se c'è un solo team, usalo automaticamente
    let selectedTeam;
    if (teams.length === 1) {
      selectedTeam = teams[0];
      console.log(`\n✅ Team selezionato automaticamente: ${selectedTeam.name}`);
    } else {
      console.log('\n❓ Seleziona un team inserendo il numero corrispondente:');
      // In un ambiente reale, dovresti usare readline per l'input
      selectedTeam = teams[0]; // Per ora selezioniamo il primo
      console.log(`📝 Per ora uso il primo team: ${selectedTeam.name}`);
    }

    // Ottieni membri del team
    const members = await setup.getTeamMembers(selectedTeam.id);
    setup.displayMembers(members);

    // Genera file .env
    const envContent = setup.generateEnvFile(selectedTeam.id, userInfo.id);
    
    console.log('\n📄 Contenuto del file .env:');
    console.log('─'.repeat(50));
    console.log(envContent);
    console.log('─'.repeat(50));

    console.log('\n✅ Setup completato!');
    console.log('📋 Prossimi passi:');
    console.log('1. Copia il contenuto sopra in un file .env');
    console.log('2. Modifica START_DATE e END_DATE se necessario');
    console.log('3. Esegui: npm start');

  } catch (error) {
    console.error('❌ Errore durante il setup:', error.message);
    
    if (error.message.includes('401')) {
      console.log('\n🔑 Il token sembra non valido. Verifica:');
      console.log('   Settings > Apps > API Token > Generate Token');
      console.log('   https://app.clickup.com/settings/apps');
    }
    
    process.exit(1);
  }
}

// Esegui solo se chiamato direttamente
if (import.meta.url.startsWith('file://') && process.argv[1].endsWith('setup.js')) {
  main();
}

export default ClickUpSetup; 