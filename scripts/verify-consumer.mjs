// Independent consumer check (T-024): build and pack the SDK packages, install the tarballs into a
// copy of examples/consumer-vite outside the workspace with plain npm, then typecheck, build and
// run the plain-Node check there. Prints the app directory for `pnpm test:consumer`.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const work = process.env.CONSUMER_WORKDIR ? resolve(process.env.CONSUMER_WORKDIR) : mkdtempSync(join(tmpdir(), 'scada3d-consumer-'));
const pack = join(work, 'pack');
const app = join(work, 'app');
const packages = ['core', 'components', 'asset-import', 'react', 'simulation', 'views-2d'];

const run = (cmd, args, cwd) => {
  console.log(`\n$ (${cwd === root ? '.' : cwd}) ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' } });
};

run('pnpm', ['-r', '--filter', './packages/*', 'build'], root);
mkdirSync(pack, { recursive: true });
for (const p of packages) run('pnpm', ['pack', '--pack-destination', pack], join(root, 'packages', p));

const tarballs = Object.fromEntries(readdirSync(pack).filter((f) => f.endsWith('.tgz')).map((f) => [`@sakibcoolz/${f.replace(/^sakibcoolz-/, '').replace(/-\d+\.\d+\.\d+.*\.tgz$/, '')}`, `file:${join(pack, f)}`]));
if (Object.keys(tarballs).length !== packages.length) throw new Error(`expected ${packages.length} tarballs, found ${JSON.stringify(tarballs)}`);

cpSync(join(root, 'examples', 'consumer-vite'), app, { recursive: true, filter: (src) => !/node_modules|[\\/]dist([\\/]|$)/.test(src) });
const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
Object.assign(manifest.dependencies, tarballs);
// The packed components and react depend on @sakibcoolz/core by exact version; point those at the tarballs too.
manifest.overrides = { ...tarballs };
writeFileSync(join(app, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

run('npm', ['install', '--no-audit', '--no-fund'], app);
run('npm', ['ls', '@sakibcoolz/core', '@sakibcoolz/components', '@sakibcoolz/asset-import', '@sakibcoolz/react', '@sakibcoolz/simulation', '@sakibcoolz/views-2d'], app);
run('npm', ['run', 'typecheck'], app);
run('npm', ['run', 'build'], app);
run('npm', ['run', 'node-check'], app);

console.log(`\nconsumer verification passed\nCONSUMER_APP=${app}`);
