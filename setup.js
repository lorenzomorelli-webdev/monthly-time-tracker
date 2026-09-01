#!/usr/bin/env node

/**
 * Setup script per ottenere TEAM_IDS e USER_ID dalla ClickUp API
 * Esegui: pnpm run setup
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

  generateEnvFile(teamIds, userId) {
    const normalizedTeamIds = (Array.isArray(teamIds) ? teamIds : [teamIds])
      .map(id => String(id).trim())
      .filter(Boolean);

    return `# ClickUp Multi-Team Time Tracker Configuration
CLICKUP_TOKEN="${this.token}"
USER_ID="${userId}"
TEAM_IDS="${normalizedTeamIds.join(',')}"

# Calcoli economici (HOURLY_RATE=0 disabilita gli importi)
HOURLY_RATE="30"
NET_PERCENTAGE="0"

# Output locale
OUTPUT_DIR="./reports"
SAVE_REPORT="true"`;
  }
}

async function main() {
  const token = process.env.CLICKUP_TOKEN || process.argv[2];

  if (!token) {
    console.error('❌ Token ClickUp mancante!');
    console.log('\nUso:');
    console.log('1. Copia config.example.env in .env');
    console.log('2. Imposta CLICKUP_TOKEN nel file .env');
    console.log('3. Esegui: pnpm run setup');
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

    if (teams.length === 0) {
      throw new Error('Nessun team/workspace disponibile per questo token');
    }

    const teamIds = teams.map(team => team.id);
    console.log(`\n✅ Configurati ${teamIds.length} team/workspace. Puoi rimuovere da TEAM_IDS quelli che non vuoi analizzare.`);

    // Genera file .env
    const envContent = setup.generateEnvFile(teamIds, userInfo.id);
    
    console.log('\n📄 Contenuto del file .env:');
    console.log('─'.repeat(50));
    console.log(envContent);
    console.log('─'.repeat(50));

    console.log('\n✅ Setup completato!');
    console.log('📋 Prossimi passi:');
    console.log('1. Copia il contenuto sopra in un file .env');
    console.log('2. Verifica HOURLY_RATE (preimpostata a 30) e NET_PERCENTAGE');
    console.log('3. Esegui: pnpm start');

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
