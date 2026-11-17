#!/usr/bin/env node
/**
 * engineSnapshot.mjs — freeze the game engine of one commit as a self-contained copy under
 * server/src/engineSnapshots/<name>/, so rooms pinned to that engine profile keep running exactly
 * that code while the live engine (server/src/shared/engine) keeps changing.
 *
 *   node scripts/engineSnapshot.mjs create <git-ref> <name>   # e.g. create fd3e3952 v253
 *   node scripts/engineSnapshot.mjs verify <name>             # every file still byte-identical to the commit?
 *
 * What gets copied: every file the engine entry points reach (runtime + type-only imports), at the
 * same path relative to server/src, so relative imports inside the copy keep resolving.
 * What is NOT copied (replaced by a one-line re-export of the live module): modules that hold
 * process-wide state or connections — see SHIMS. They must be unchanged since <git-ref> for the
 * snapshot to behave like that commit; `verify` checks this too.
 */
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const SRC = 'server/src';
const SNAP_ROOT = path.join(REPO, SRC, 'engineSnapshots');

/** Engine API a profile exposes. Paths are relative to server/src. */
const ENTRY = [
    "export { runFullGameSimulation } from './shared/engine/pbp/main.ts';",
    "export { resolveNormalizationContext } from './shared/engine/pbp/leagueNormalization.ts';",
    "export { calculateHitRate } from './shared/engine/pbp/flowEngine.ts';",
    "export { calculatePlayerOvr } from './shared/utils/ovrUtils.ts';",
    '',
].join('\n');

/** Live modules the snapshot shares instead of copying (path relative to server/src). */
const SHIMS = ['supabaseAdmin.ts', 'shared/services/admin/gameConfigService.ts'];

function shimSource(rel) {
    // from <SNAP_ROOT>/<name>/<rel> back up to server/src, then down to the live module
    const ups = '../'.repeat(rel.split('/').length + 1);
    return `// Shared with the live server (process-wide state) — not part of the frozen copy. See README.md.\nexport * from '${ups}${rel}';\n`;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const gitShow = (ref, rel) => execFileSync('git', ['show', `${ref}:${SRC}/${rel}`], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });

function fail(msg) { console.error(msg); process.exit(1); }

async function create(refArg, name) {
    const ts = (await import('typescript')).default;   // only `create` needs it — `verify` must run in a bare checkout (deploy script)
    if (!/^[A-Za-z0-9_.-]+$/.test(name ?? '')) fail('name must be [A-Za-z0-9_.-]+');
    const ref = execFileSync('git', ['rev-parse', '--verify', `${refArg}^{commit}`], { cwd: REPO, encoding: 'utf8' }).trim();
    if (!/^[0-9a-f]{40}$/.test(ref)) fail(`cannot resolve ${refArg}`);
    const dest = path.join(SNAP_ROOT, name);
    if (fs.existsSync(dest)) fail(`${dest} already exists`);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-snapshot-'));
    execSync(`git archive ${ref} ${SRC} | tar -x -C "${tmp}"`, { cwd: REPO });
    const tmpSrc = path.join(tmp, SRC);

    // Shims first, so files reachable only through a shimmed module drop out of the closure.
    for (const rel of SHIMS) {
        if (!fs.existsSync(path.join(tmpSrc, rel))) fail(`shim target missing at ${ref}: ${rel}`);
        fs.writeFileSync(path.join(tmpSrc, rel), 'export {};\n');
    }
    const entry = path.join(tmpSrc, '__snapshot_entry.ts');
    fs.writeFileSync(entry, ENTRY);

    const program = ts.createProgram([entry], {
        noEmit: true, allowImportingTsExtensions: true, skipLibCheck: true, resolveJsonModule: true,
        target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    });
    const realTmpSrc = fs.realpathSync(tmpSrc);
    const files = program.getSourceFiles()
        .map(f => fs.realpathSync(f.fileName))
        .filter(f => f.startsWith(realTmpSrc + path.sep) && f !== fs.realpathSync(entry))
        .map(f => path.relative(realTmpSrc, f).split(path.sep).join('/'))
        .sort();
    const missingShims = SHIMS.filter(s => !files.includes(s));

    const manifest = { name, ref, entry: 'index.ts', shims: SHIMS.filter(s => files.includes(s)), files: [] };
    for (const rel of files) {
        const out = path.join(dest, rel);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        if (SHIMS.includes(rel)) { fs.writeFileSync(out, shimSource(rel)); continue; }
        const buf = gitShow(ref, rel);
        fs.writeFileSync(out, buf);
        manifest.files.push({ path: rel, sha256: sha256(buf) });
    }
    fs.writeFileSync(path.join(dest, 'index.ts'), `// Engine profile entry — frozen copy of commit ${ref.slice(0, 8)}. Do not edit; see README.md.\n${ENTRY}`);
    fs.writeFileSync(path.join(dest, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(dest, 'README.md'), readme(name, ref));
    fs.rmSync(tmp, { recursive: true, force: true });

    const bytes = manifest.files.reduce((n, f) => n + fs.statSync(path.join(dest, f.path)).size, 0);
    console.log(`created ${path.relative(REPO, dest)} from ${ref.slice(0, 8)}: ${manifest.files.length} files, ${(bytes / 1024).toFixed(0)} KB, shims: ${manifest.shims.join(', ') || 'none'}`);
    if (missingShims.length) console.log(`(not reached, no shim written: ${missingShims.join(', ')})`);
}

function verify(name) {
    const dest = path.join(SNAP_ROOT, name ?? '');
    const manifestPath = path.join(dest, 'MANIFEST.json');
    if (!name || !fs.existsSync(manifestPath)) fail(`no snapshot named ${name}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const problems = [];

    for (const f of manifest.files) {
        const p = path.join(dest, f.path);
        if (!fs.existsSync(p)) { problems.push(`missing: ${f.path}`); continue; }
        const buf = fs.readFileSync(p);
        if (sha256(buf) !== f.sha256 || !buf.equals(gitShow(manifest.ref, f.path))) problems.push(`differs from ${manifest.ref.slice(0, 8)}: ${f.path}`);
    }
    for (const rel of manifest.shims) {
        const p = path.join(dest, rel);
        if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== shimSource(rel)) problems.push(`shim changed: ${rel}`);
        // the shared live module must still be what the commit had, or the snapshot no longer behaves like it
        const live = fs.readFileSync(path.join(REPO, SRC, rel));
        if (!live.equals(gitShow(manifest.ref, rel))) problems.push(`shared live module changed since ${manifest.ref.slice(0, 8)}: ${SRC}/${rel}`);
    }
    const known = new Set([...manifest.files.map(f => f.path), ...manifest.shims, 'index.ts', 'MANIFEST.json', 'README.md']);
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
    for (const p of walk(dest)) {
        const rel = path.relative(dest, p).split(path.sep).join('/');
        if (!known.has(rel)) problems.push(`unexpected file: ${rel}`);
    }

    if (problems.length) fail(`snapshot ${name}: ${problems.length} problem(s)\n  ` + problems.join('\n  '));
    console.log(`snapshot ${name}: ${manifest.files.length} files identical to ${manifest.ref.slice(0, 8)}, ${manifest.shims.length} shim(s) intact`);
}

function readme(name, ref) {
    return `# 엔진 보관본 ${name}

커밋 \`${ref}\` 의 경기 엔진을 그대로 복사해 둔 것입니다. 엔진 프로필이 이 보관본인 방은 이 폴더의 코드로 경기를 돌립니다
(\`server/src/engineProfile.ts\`). 운영 중인 세션의 경기 결과가 엔진 개발의 영향을 받지 않게 하려는 장치입니다.

- **이 폴더의 파일은 수정하지 않습니다.** 엔진 작업은 \`server/src/shared/\` 에서만 합니다.
- 확인: \`node scripts/engineSnapshot.mjs verify ${name}\` — 모든 파일이 위 커밋과 바이트 단위로 같은지 검사합니다.
- 다시 만들기: 폴더를 지우고 \`node scripts/engineSnapshot.mjs create ${ref.slice(0, 8)} ${name}\`.
- 복사하지 않고 운영 서버 모듈을 그대로 쓰는 파일(프로세스 전체가 공유하는 상태·연결): \`MANIFEST.json\` 의 \`shims\`.
  이 모듈들이 위 커밋 이후 바뀌면 \`verify\` 가 알려 줍니다.
- 이 보관본을 쓰는 방이 없어지면 폴더와 \`engineProfile.ts\` 의 해당 줄을 지웁니다.
`;
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'create' && a && b) await create(a, b);
else if (cmd === 'verify' && a) verify(a);
else fail('usage: engineSnapshot.mjs create <git-ref> <name> | verify <name>');
