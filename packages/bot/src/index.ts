/**
 * WAAAH Unified Bot
 * 
 * Supports both Discord and Slack via platform adapters.
 * Configure via environment variables:
 * 
 * PLATFORM=discord|slack|both
 * 
 * Discord: DISCORD_TOKEN
 * Slack: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_APP_TOKEN
 */
import dotenv from 'dotenv';
import path from 'path';

import { DiscordAdapter } from './adapters/discord.js';
import { SlackAdapter } from './adapters/slack.js';
import { BotCore } from './core/bot.js';

dotenv.config();

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';
const WAAAH_API_KEY = process.env.WAAAH_API_KEY;
const PLATFORM = process.env.PLATFORM || 'discord';
const DELEGATION_CHANNEL_ID = process.env.DELEGATION_CHANNEL_ID;

// Approved users (comma-separated IDs)
const APPROVED_USERS = new Set(
  (process.env.APPROVED_USERS || '')
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0)
);

async function startDiscordBot(): Promise<boolean> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.log('[Discord] Skipping - DISCORD_TOKEN not set');
    return false;
  }

  const adapter = new DiscordAdapter(token, APPROVED_USERS);
  const bot = new BotCore(adapter, {
    mcpServerUrl: MCP_SERVER_URL,
    apiKey: WAAAH_API_KEY,
    delegationChannelId: DELEGATION_CHANNEL_ID
  });

  await bot.start();
  return true;
}

async function startSlackBot(): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const appToken = process.env.SLACK_APP_TOKEN;

  if (!token || !signingSecret || !appToken) {
    console.log('[Slack] Skipping - missing SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, or SLACK_APP_TOKEN');
    return false;
  }

  const adapter = new SlackAdapter(token, signingSecret, appToken, APPROVED_USERS);
  const bot = new BotCore(adapter, {
    mcpServerUrl: MCP_SERVER_URL,
    apiKey: WAAAH_API_KEY,
    configPath: CONFIG_PATH,
    delegationChannelId: process.env.SLACK_DELEGATION_CHANNEL_ID
  });

  await bot.start();
  return true;
}

async function main(): Promise<void> {
  console.log(`[Bot] Starting in ${PLATFORM} mode...`);

  let started = 0;

  if (PLATFORM === 'discord' || PLATFORM === 'both') {
    if (await startDiscordBot()) started++;
  }

  if (PLATFORM === 'slack' || PLATFORM === 'both') {
    if (await startSlackBot()) started++;
  }

  if (started === 0) {
    console.error('[Bot] No platforms started! Check your tokens.');
    process.exit(1);
  }

  console.log(`[Bot] ${started} platform(s) running`);
}

main().catch(console.error);
