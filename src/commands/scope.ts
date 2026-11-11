import { COMMON_OPTIONS, parseArgv, rejectPositionals } from '../core/args.js';
import { loadConfig, type ScopeConfig } from '../core/config.js';
import { UsageError } from '../core/errors.js';
import { changedFiles, describeSource, type ChangeSource } from '../core/git.js';
import { matchesAny } from '../core/glob.js';
import { formatFinding, sortFindings, writeJson } from '../core/report.js';
import { EXIT, countLevels, type ExitCode, type Finding, type Io } from '../core/types.js';

/**
 * - owned: 내 담당
 * - shared: 공유 파일 (경고: 화면 PR에 섞지 말 것)
 * - other: 다른 사람 담당 (오류: 멈추고 알릴 것)
 * - unowned: 담당표에 없음 (경고)
 */
export type ScopeVerdict = 'owned' | 'shared' | 'other' | 'unowned';

export interface ScopeEntry {
  readonly file: string;
  readonly verdict: ScopeVerdict;
  /** verdict가 other일 때 그 파일의 담당자들 */
  readonly owners: readonly string[];
}

export function classifyFiles(
  files: readonly string[],
  owner: string,
  config: ScopeConfig,
): ScopeEntry[] {
  const mine = config.owners[owner];
  if (mine === undefined) {
    const names = Object.keys(config.owners);
    throw new UsageError(
      names.length === 0
        ? '설정의 scope.owners가 비어 있습니다. 담당자와 경로를 먼저 적어 주세요.'
        : `설정에 없는 담당자입니다: ${owner} (있는 담당자: ${names.join(', ')})`,
    );
  }

  return files.map((file): ScopeEntry => {
    if (matchesAny(file, mine)) return { file, verdict: 'owned', owners: [] };
    if (matchesAny(file, config.shared)) return { file, verdict: 'shared', owners: [] };
    const others = Object.entries(config.owners)
      .filter(([name, globs]) => name !== owner && matchesAny(file, globs))
      .map(([name]) => name);
    if (others.length > 0) return { file, verdict: 'other', owners: others };
    return { file, verdict: 'unowned', owners: [] };
  });
}

export function scopeFindings(entries: readonly ScopeEntry[]): Finding[] {
  const findings: Finding[] = [];
  for (const entry of entries) {
    if (entry.verdict === 'other') {
      findings.push({
        level: 'error',
        rule: 'scope/other-owner',
        message: `${entry.owners.join(', ')} 담당 파일입니다. 멈추고 담당자에게 알리세요.`,
        file: entry.file,
      });
    } else if (entry.verdict === 'shared') {
      findings.push({
        level: 'warning',
        rule: 'scope/shared',
        message: '공유 파일입니다. 화면 PR에 섞지 말고 따로 올리세요.',
        file: entry.file,
      });
    } else if (entry.verdict === 'unowned') {
      findings.push({
        level: 'warning',
        rule: 'scope/unowned',
        message: '담당표에 없는 파일입니다. 담당을 정하거나 scope 설정에 추가하세요.',
        file: entry.file,
      });
    }
  }
  return findings;
}

export async function scopeCommand(args: readonly string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parseArgv(args, {
    ...COMMON_OPTIONS,
    owner: { type: 'string', short: 'o' },
    base: { type: 'string' },
    staged: { type: 'boolean', default: false },
    files: { type: 'string' },
  });
  if (values.help) {
    io.stdout.write(SCOPE_HELP);
    return EXIT.ok;
  }
  rejectPositionals(positionals, 'scope');
  if (values.owner === undefined) throw new UsageError('--owner <담당자>를 알려 주세요.');

  const sources = [values.base !== undefined, values.staged, values.files !== undefined];
  if (sources.filter(Boolean).length > 1) {
    throw new UsageError('--base, --staged, --files 중 하나만 쓸 수 있습니다.');
  }

  const loaded = await loadConfig(io.cwd, values.config);

  let files: string[];
  let from: string;
  if (values.files !== undefined) {
    files = values.files
      .split(',')
      .map((file) => file.trim())
      .filter((file) => file !== '');
    from = '--files';
  } else {
    const source: ChangeSource = values.staged
      ? { kind: 'staged' }
      : { kind: 'base', base: values.base ?? 'main' };
    files = await changedFiles(io.cwd, source);
    from = describeSource(source);
  }

  const entries = classifyFiles(files, values.owner, loaded.config.scope);
  const findings = sortFindings(scopeFindings(entries));
  const { errors } = countLevels(findings);
  const passed = errors === 0;

  if (values.json) {
    writeJson((s) => io.stdout.write(s), { owner: values.owner, from, entries, findings, passed });
  } else {
    const owned = entries.filter((entry) => entry.verdict === 'owned').length;
    const lines = [
      `담당 ${values.owner} · 바뀐 파일 ${String(entries.length)}개 (${from})`,
      ...findings.map(formatFinding),
      `  담당 범위 안: ${String(owned)}개`,
    ];
    io.stdout.write(`${lines.join('\n')}\n`);
  }
  return passed ? EXIT.ok : EXIT.failed;
}

export const SCOPE_HELP = `사용법: agent-gates scope --owner <담당자> [--base <브랜치> | --staged | --files a,b]

바뀐 파일이 담당 범위 안에 있는지 검사합니다. 담당표는 설정의 scope.owners와 scope.shared입니다.

결과
  오류  다른 담당자의 파일을 고쳤다 → 종료 코드 1
  경고  공유 파일이거나 담당표에 없는 파일

옵션
  -o, --owner <이름>   검사할 담당자 (필수)
  --base <브랜치>      <브랜치>...HEAD 차이를 검사 (기본: main)
  --staged             스테이징된 변경을 검사 (커밋 전 점검)
  --files a,b          git 대신 파일 목록을 직접 줌
  --json               결과를 JSON으로 출력
  -c, --config         설정 파일 경로 (기본: agent-gates.config.json)
`;
