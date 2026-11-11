import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_FILE } from '../src/core/config.js';
import { EXIT } from '../src/core/types.js';
import { readVersion, run } from '../src/run.js';
import { REAL_GATE, captureIo, git, makeTempDir, writeFiles } from './helpers.js';

async function runIn(cwd: string, ...argv: string[]) {
  const capture = captureIo(cwd);
  const code = await run(argv, capture.io);
  return { code, out: capture.out(), err: capture.err() };
}

describe('기본 동작', () => {
  it('도움말과 버전', async () => {
    const cwd = await makeTempDir();
    expect((await runIn(cwd, '--help')).code).toBe(EXIT.ok);
    expect((await runIn(cwd)).code).toBe(EXIT.usage);
    const version = await runIn(cwd, '--version');
    expect(version.out.trim()).toBe(readVersion());
  });

  it('모르는 명령과 옵션은 종료 코드 2', async () => {
    const cwd = await makeTempDir();
    const unknown = await runIn(cwd, 'deploy');
    expect(unknown.code).toBe(EXIT.usage);
    expect(unknown.err).toContain('알 수 없는 명령');
    expect((await runIn(cwd, 'markers', '--nope')).code).toBe(EXIT.usage);
    expect((await runIn(cwd, 'markers', '--max', 'abc')).code).toBe(EXIT.usage);
  });

  it('설정 파일이 잘못되면 고칠 곳을 알려 주고 종료 코드 2', async () => {
    const cwd = await makeTempDir();
    await writeFiles(cwd, { [CONFIG_FILE]: JSON.stringify({ markers: { max: 'many' } }) });
    const result = await runIn(cwd, 'check');
    expect(result.code).toBe(EXIT.usage);
    expect(result.err).toContain('markers.max');
  });
});

describe('init', () => {
  it('파일을 만들고, 두 번째에는 덮어쓰지 않는다', async () => {
    const cwd = await makeTempDir();
    const first = await runIn(cwd, 'init');
    expect(first.code).toBe(EXIT.ok);
    expect(first.out).toContain('만듦   docs/GATES.md');

    await writeFiles(cwd, { 'AGENTS.md': '# 우리 팀 규칙\n' });
    const second = await runIn(cwd, 'init');
    expect(second.out).toContain('건너뜀 AGENTS.md');
    expect(await readFile(path.join(cwd, 'AGENTS.md'), 'utf8')).toBe('# 우리 팀 규칙\n');
  });

  it('init 직후의 저장소는 check를 통과한다 (게이트가 없다는 경고만)', async () => {
    const cwd = await makeTempDir();
    await runIn(cwd, 'init');
    const result = await runIn(cwd, 'check');
    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain('gates/empty');
  });
});

describe('gates check', () => {
  it('형식을 지킨 문서는 통과, 아니면 종료 코드 1', async () => {
    const cwd = await makeTempDir();
    await writeFiles(cwd, { 'docs/GATES.md': REAL_GATE });
    expect((await runIn(cwd, 'gates', 'check')).code).toBe(EXIT.ok);

    await writeFiles(cwd, { 'docs/GATES.md': '## G-1 | 제목\n- 상태: 활성\n' });
    const failed = await runIn(cwd, 'gates', 'check');
    expect(failed.code).toBe(EXIT.failed);
    expect(failed.out).toContain('docs/GATES.md:1');
  });

  it('파일이 없으면 종료 코드 1, --json은 기계가 읽을 수 있다', async () => {
    const cwd = await makeTempDir();
    const result = await runIn(cwd, 'gates', 'check', '--json');
    expect(result.code).toBe(EXIT.failed);
    const report = JSON.parse(result.out) as { findings: { rule: string }[] };
    expect(report.findings[0]?.rule).toBe('gates/file-not-found');
  });
});

describe('markers', () => {
  it('--max를 넘으면 종료 코드 1', async () => {
    const cwd = await makeTempDir();
    await writeFiles(cwd, { 'src/a.ts': '// TODO(확인필요)\n// [임시]\n' });
    expect((await runIn(cwd, 'markers')).code).toBe(EXIT.ok);
    expect((await runIn(cwd, 'markers', '--max', '2')).code).toBe(EXIT.ok);
    const over = await runIn(cwd, 'markers', '--max', '1');
    expect(over.code).toBe(EXIT.failed);
    expect(over.out).toContain('1개를 확정하거나 지워 주세요');
  });
});

describe('scope (실제 git 저장소)', () => {
  it('main 이후 바뀐 파일 중 다른 담당 파일이 있으면 종료 코드 1', async () => {
    const cwd = await makeTempDir();
    await writeFiles(cwd, {
      [CONFIG_FILE]: JSON.stringify({
        scope: { owners: { 'FE-A': ['src/apply/**'], 'FE-B': ['src/home/**'] }, shared: [] },
      }),
      'src/apply/a.ts': 'a',
      'src/home/b.ts': 'b',
    });
    git(cwd, 'init', '-q', '-b', 'main');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-q', '-m', 'init');
    git(cwd, 'switch', '-q', '-c', 'feature');

    await writeFiles(cwd, { 'src/apply/a.ts': 'a2', 'src/apply/새 파일.ts': 'n' });
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-q', '-m', 'mine');
    const ok = await runIn(cwd, 'scope', '--owner', 'FE-A');
    expect(ok.code).toBe(EXIT.ok);
    expect(ok.out).toContain('바뀐 파일 2개');

    await writeFiles(cwd, { 'src/home/b.ts': 'b2' });
    git(cwd, 'add', '.');
    const staged = await runIn(cwd, 'scope', '--owner', 'FE-A', '--staged', '--json');
    expect(staged.code).toBe(EXIT.failed);
    expect(JSON.parse(staged.out)).toMatchObject({
      entries: [{ file: 'src/home/b.ts', verdict: 'other', owners: ['FE-B'] }],
    });
  });

  it('git 저장소가 아니면 종료 코드 2', async () => {
    const cwd = await makeTempDir();
    await writeFiles(cwd, {
      [CONFIG_FILE]: JSON.stringify({ scope: { owners: { 'FE-A': ['**'] } } }),
    });
    const result = await runIn(cwd, 'scope', '--owner', 'FE-A');
    expect(result.code).toBe(EXIT.usage);
    expect(result.err).toContain('git');
  });

  it('--files로 직접 준 목록도 검사한다', async () => {
    const cwd = await makeTempDir();
    await writeFiles(cwd, {
      [CONFIG_FILE]: JSON.stringify({ scope: { owners: { 'FE-A': ['src/apply/**'] } } }),
    });
    const result = await runIn(cwd, 'scope', '-o', 'FE-A', '--files', 'src/apply/x.ts, README.md');
    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain('scope/unowned');
  });
});
