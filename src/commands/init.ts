import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { COMMON_OPTIONS, parseArgv, rejectPositionals } from '../core/args.js';
import { CONFIG_FILE, DEFAULT_CONFIG } from '../core/config.js';
import { isNodeError } from '../core/errors.js';
import { writeJson } from '../core/report.js';
import { EXIT, type ExitCode, type Io } from '../core/types.js';
import { AGENTS_TEMPLATE, GATES_TEMPLATE, configTemplate } from '../templates.js';

export interface InitResult {
  readonly file: string;
  readonly status: 'created' | 'skipped';
}

/** 파일이 이미 있으면 건드리지 않는다. 사람이 쓴 규칙을 덮어쓰지 않기 위해서다. */
async function createIfMissing(cwd: string, file: string, content: string): Promise<InitResult> {
  const absolute = path.join(cwd, file);
  await mkdir(path.dirname(absolute), { recursive: true });
  try {
    await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' });
    return { file, status: 'created' };
  } catch (error) {
    if (isNodeError(error, 'EEXIST')) return { file, status: 'skipped' };
    throw error;
  }
}

export async function initCommand(args: readonly string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parseArgv(args, COMMON_OPTIONS);
  if (values.help) {
    io.stdout.write(INIT_HELP);
    return EXIT.ok;
  }
  rejectPositionals(positionals, 'init');

  const results = [
    await createIfMissing(io.cwd, CONFIG_FILE, configTemplate()),
    await createIfMissing(io.cwd, DEFAULT_CONFIG.gates.file, GATES_TEMPLATE),
    await createIfMissing(io.cwd, 'AGENTS.md', AGENTS_TEMPLATE),
  ];

  if (values.json) {
    writeJson((s) => io.stdout.write(s), results);
    return EXIT.ok;
  }

  const lines = results.map((result) =>
    result.status === 'created'
      ? `  만듦   ${result.file}`
      : `  건너뜀 ${result.file} (이미 있어서 그대로 둠)`,
  );
  lines.push(
    '',
    '다음 할 일',
    `  1. ${CONFIG_FILE}의 scope.owners 예시 경로를 저장소에 맞게 고치세요.`,
    '  2. CLAUDE.md를 쓴다면 첫 줄에 @AGENTS.md 를 적어 같은 규칙을 읽게 하세요.',
    '  3. npx agent-gates check 로 확인하세요.',
  );
  if (results.some((result) => result.file === 'AGENTS.md' && result.status === 'skipped')) {
    lines.push(
      '',
      'AGENTS.md가 이미 있어 그대로 뒀습니다. 필요한 규칙만 아래에서 골라 붙이세요.',
      '',
      AGENTS_TEMPLATE,
    );
  }
  io.stdout.write(`${lines.join('\n')}\n`);
  return EXIT.ok;
}

export const INIT_HELP = `사용법: agent-gates init [--json]

현재 폴더에 아래 파일을 만듭니다. 이미 있는 파일은 덮어쓰지 않습니다.
  agent-gates.config.json   검사 설정 (미정 표식, 게이트 형식, 담당표)
  docs/GATES.md             오류 게이트 문서
  AGENTS.md                 에이전트 작업 규칙 (Codex는 자동으로 읽어요)
`;
