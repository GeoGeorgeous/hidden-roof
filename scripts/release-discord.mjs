// Posts a release's notes to Discord through the webhook in DISCORD_WEBHOOK
// (from the environment or the gitignored .env.local), its picture attached.
// --dry prints the messages instead. Process: docs/releases/AGENTS.md.
// Usage: node scripts/release-discord.mjs v1.2.0 [--dry]
import fs from 'node:fs';
import { discordNotes } from '../src/release-notes.ts';

const [tag, flag] = process.argv.slice(2);
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '') || (flag && flag !== '--dry')) throw new Error('usage: node scripts/release-discord.mjs vX.Y.Z [--dry]');
const messages = discordNotes(tag, fs.readFileSync(`docs/releases/${tag}.md`, 'utf8'));
const picture = `public/updates/${tag}.webp`;
if (flag) {
  console.log(`${messages.join('\n---\n')}\n[${picture}, ${Math.round(fs.statSync(picture).size / 1024)} KB]`);
  process.exit(0);
}

if (!process.env.DISCORD_WEBHOOK && fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const webhook = process.env.DISCORD_WEBHOOK;
if (!webhook?.startsWith('https://discord.com/api/webhooks/')) throw new Error('DISCORD_WEBHOOK is missing: put it in .env.local');

// One message after another, so they show in order; the picture goes with the first.
for (const [i, content] of messages.entries()) {
  const form = new FormData();
  const payload = { content, allowed_mentions: { parse: [] }, attachments: i ? [] : [{ id: 0, filename: `${tag}.webp` }] };
  form.append('payload_json', JSON.stringify(payload));
  if (!i) form.append('files[0]', new Blob([fs.readFileSync(picture)], { type: 'image/webp' }), `${tag}.webp`);
  const res = await fetch(`${webhook}?wait=true`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Discord: ${res.status} ${await res.text()}`);
  console.log(`${tag}: posted ${i + 1}/${messages.length}, message ${(await res.json()).id}`);
}
