// The admin command, run in the server's container (docs/deploy.md):
//   node admin.mjs list
//   node admin.mjs create public|private "Name" [--level roof] [--detail ultra] [--tools can,marker,ladder,roller,sponge]
//   node admin.mjs wipe CODE
//   node admin.mjs close CODE
// It asks the admin API (server/admin-api.ts) on ADMIN_PORT (SERVER.adminPort) with ADMIN_KEY, both from the container's env.

const [what, ...args] = process.argv.slice(2);
const api = `http://localhost:${process.env.ADMIN_PORT || 3001}`;
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};

async function call(method, path, body) {
  const res = await fetch(api + path, { method, headers: { authorization: `Bearer ${process.env.ADMIN_KEY ?? ''}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const out = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${out.error}`);
  return out;
}

const line = (s) => `${s.code}  ${s.kind.padEnd(7)}  ${s.players.length}/${s.limit}  ${s.level} ${s.detail}  ${JSON.stringify(s.name)}  tools: ${s.tools.join(' ')}  paint ${s.paintMB} MB  since ${s.started}`;

try {
  if (what === 'list') {
    const list = await call('GET', '/sessions');
    console.log(list.length ? list.map(line).join('\n') : 'no sessions');
  } else if (what === 'create') {
    const level = flag('level');
    const detail = flag('detail');
    const tools = flag('tools')?.split(',');
    const [kind, name] = args;
    console.log(line(await call('POST', '/sessions', { kind, name, level, detail, tools })));
  } else if ((what === 'wipe' || what === 'close') && args[0]) {
    await call('POST', `/sessions/${args[0].toUpperCase()}/${what}`);
    console.log(`${args[0].toUpperCase()}: ${what === 'wipe' ? 'wiped' : 'closed'}`);
  } else {
    console.log('node admin.mjs list | create public|private "Name" [--level roof] [--detail ultra] [--tools can,marker,...] | wipe CODE | close CODE');
    process.exitCode = 2;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
