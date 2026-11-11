#!/usr/bin/env node
/**
 * Post a markdown document to a Discord channel through an incoming webhook.
 *
 * Default is a DRY RUN (prints exactly what would be posted). Nothing is sent
 * unless --send is passed, so every post can be reviewed first.
 *
 * Usage:
 *   node scripts/discord/postWebhook.mjs patch                 # latest section of PATCH_NOTES.md, dry run
 *   node scripts/discord/postWebhook.mjs patch --date "11월 8일"  # pick a section by heading text
 *   node scripts/discord/postWebhook.mjs patch --send           # actually post to #updates
 *   node scripts/discord/postWebhook.mjs file docs/x.md --channel announcements [--send]
 *
 * Webhook URLs live in .env (gitignored), never in the repo:
 *   DISCORD_WEBHOOK_UPDATES=https://discord.com/api/webhooks/...
 *   DISCORD_WEBHOOK_ANNOUNCEMENTS=https://discord.com/api/webhooks/...
 *   DISCORD_WEBHOOK_RULES=...
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LIMIT = 1900; // Discord hard limit is 2000 chars per message; keep headroom.
const BOT_NAME = 'Basketball Manager 2027';

// ---------- .env (tiny loader, no dependency) ----------
function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ---------- markdown -> Discord-friendly markdown ----------
function convertTable(rows) {
  // rows: array of "| a | b |" lines. Drop header + separator, render each row as a bullet.
  const cells = rows
    .map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
    .filter((c) => !c.every((x) => /^:?-{2,}:?$/.test(x)));
  const body = cells.slice(1); // first non-separator row is the header
  return body
    .map((c) => (c.length === 1 ? `- ${c[0]}` : `- **${c[0]}**: ${c.slice(1).join(' · ')}`))
    .join('\n');
}

function toDiscord(md) {
  const out = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      i--;
      out.push(convertTable(rows));
      continue;
    }
    if (/^####+\s+/.test(line)) { out.push(`**${line.replace(/^#+\s+/, '')}**`); continue; }
    if (/^---+\s*$/.test(line)) continue; // horizontal rules are noise in Discord
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- split into <=LIMIT chunks at paragraph boundaries ----------
function splitMessages(text) {
  const blocks = text.split(/\n\n/);
  // Keep a heading-only block glued to the block that follows it.
  const glued = [];
  for (let i = 0; i < blocks.length; i++) {
    let b = blocks[i];
    while (/^#{1,3} [^\n]*$/.test(b) && i + 1 < blocks.length) b += '\n\n' + blocks[++i];
    glued.push(b);
  }
  const msgs = [];
  let cur = '';
  const push = () => { if (cur.trim()) msgs.push(cur.trim()); cur = ''; };
  for (const b of glued) {
    if (b.length > LIMIT) { // oversize block: fall back to line-level packing
      push();
      for (const l of b.split('\n')) {
        if ((cur + '\n' + l).length > LIMIT) push();
        cur += (cur ? '\n' : '') + l.slice(0, LIMIT);
      }
      push();
      continue;
    }
    if ((cur + '\n\n' + b).length > LIMIT) push();
    cur += (cur ? '\n\n' : '') + b;
  }
  push();
  return msgs;
}

// ---------- PATCH_NOTES.md section picker ----------
function pickPatchSection(date) {
  const src = fs.readFileSync(path.join(ROOT, 'PATCH_NOTES.md'), 'utf8');
  const parts = src.split(/^(?=## )/m).filter((s) => s.startsWith('## '));
  if (!parts.length) throw new Error('PATCH_NOTES.md에 "## " 섹션이 없습니다.');
  const sec = date ? parts.find((s) => s.split('\n')[0].includes(date)) : parts[0];
  if (!sec) throw new Error(`"${date}"를 포함한 섹션을 찾지 못했습니다.`);
  return sec;
}

// ---------- send ----------
async function sendAll(url, msgs) {
  for (let i = 0; i < msgs.length; i++) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: BOT_NAME,
          content: msgs[i],
          allowed_mentions: { parse: [] }, // never ping anyone from a script
          flags: 4, // suppress link embeds
        }),
      });
      if (res.status === 429 && attempt < 5) {
        const j = await res.json().catch(() => ({}));
        await new Promise((r) => setTimeout(r, ((j.retry_after ?? 1) + 0.2) * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`메시지 ${i + 1}/${msgs.length} 전송 실패: HTTP ${res.status} ${await res.text()}`);
      break;
    }
    console.log(`전송 ${i + 1}/${msgs.length}`);
    await new Promise((r) => setTimeout(r, 700));
  }
}

// ---------- main ----------
const args = process.argv.slice(2);
const mode = args[0];
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const send = args.includes('--send');

let raw;
let channel = flag('--channel');
if (mode === 'patch') {
  try {
    raw = pickPatchSection(flag('--date'));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  channel ??= 'updates';
} else if (mode === 'file' && args[1] && !args[1].startsWith('--')) {
  raw = fs.readFileSync(path.resolve(args[1]), 'utf8');
  if (!channel) { console.error('file 모드는 --channel <updates|announcements|rules> 가 필요합니다.'); process.exit(1); }
} else {
  console.error('사용법: postWebhook.mjs patch [--date "11월 8일"] [--send]\n        postWebhook.mjs file <path.md> --channel <name> [--send]');
  process.exit(1);
}

const msgs = splitMessages(toDiscord(raw));
console.log(`채널: #${channel} / 메시지 ${msgs.length}개\n`);
msgs.forEach((m, i) => console.log(`────── [${i + 1}/${msgs.length}] (${m.length}자) ──────\n${m}\n`));

if (!send) {
  console.log('▶ 드라이런입니다. 전송하려면 --send 를 붙이세요.');
} else {
  loadEnv();
  const envKey = `DISCORD_WEBHOOK_${channel.toUpperCase()}`;
  const url = process.env[envKey];
  if (!url || !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url)) {
    console.error(`.env 에 ${envKey} 가 없거나 형식이 올바르지 않습니다.`);
    process.exit(1);
  }
  await sendAll(url, msgs);
  console.log('완료.');
}
