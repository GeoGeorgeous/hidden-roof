// Posts a release's notes to Discord through the webhook in DISCORD_WEBHOOK
// (from the environment or the gitignored .env.local): the picture first, as its
// own message (a patch may have none), then the notes. --dry prints what would be posted instead.
// Process: docs/releases/AGENTS.md.
// Usage: node scripts/release-discord.mjs v1.2.0 [--dry]
import fs from 'node:fs';
import { discordNotes } from '../src/release-notes.ts';

const [tag, flag] = process.argv.slice(2);
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '') || (flag && flag !== '--dry')) throw new Error('usage: node scripts/release-discord.mjs vX.Y.Z [--dry]');
const messages = discordNotes(tag, fs.readFileSync(`docs/releases/${tag}.md`, 'utf8'));
const picture = `public/updates/${tag}.webp`;
// Read before anything is posted: an unreadable picture fails here, not halfway through. Only a patch may have none (the test).
const image = fs.existsSync(picture) ? fs.readFileSync(picture) : null;
if (flag) {
  console.log(`[${image ? `${picture}, ${Math.round(image.length / 1024)} KB` : 'no picture'}]\n---\n${messages.join('\n---\n')}`);
  process.exit(0);
}

if (!process.env.DISCORD_WEBHOOK && fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const webhook = process.env.DISCORD_WEBHOOK;
if (!webhook?.startsWith('https://discord.com/api/webhooks/')) throw new Error('DISCORD_WEBHOOK is missing: put it in .env.local');

// One message after another, so they show in order. Discord shows attachments below a message's text, so the
// picture is a message of its own, first: it tops the note, and if Discord rejects it nothing has been posted.
const posts = [...(image ? [{ picture: true }] : []), ...messages.map((content) => ({ content }))];
for (const [i, { content, picture: withPicture }] of posts.entries()) {
  const form = new FormData();
  const payload = { content, allowed_mentions: { parse: [] }, attachments: withPicture ? [{ id: 0, filename: `${tag}.webp` }] : [] };
  form.append('payload_json', JSON.stringify(payload));
  if (withPicture) form.append('files[0]', new Blob([image], { type: 'image/webp' }), `${tag}.webp`);
  const res = await fetch(`${webhook}?wait=true`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Discord: ${res.status} ${await res.text()}`);
  console.log(`${tag}: posted ${i + 1}/${posts.length}, message ${(await res.json()).id}`);
}
