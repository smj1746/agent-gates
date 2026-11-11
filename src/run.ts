import { readFileSync } from 'node:fs';
import { checkCommand } from './commands/check.js';
import { gatesCommand } from './commands/gates.js';
import { initCommand } from './commands/init.js';
import { markersCommand } from './commands/markers.js';
import { scopeCommand } from './commands/scope.js';
import { ConfigError, UsageError } from './core/errors.js';
import { EXIT, type ExitCode, type Io } from './core/types.js';

export const HELP = `agent-gates — AI 코딩 에이전트와 함께 쓰는 저장소의 작업 규칙 검사

사용법: agent-gates <명령> [옵션]

명령
  init                     설정 파일, docs/GATES.md, AGENTS.md 만들기
  markers                  코드에 남은 미정 표식 모으기
  gates check [파일]       오류 게이트 문서 형식 검사
  scope --owner <담당자>   바뀐 파일이 담당 범위 안인지 검사
  check                    CI용 묶음 검사 (gates check + markers)

공통 옵션
  -c, --config <파일>      설정 파일 (기본: agent-gates.config.json)
  --json                   결과를 JSON으로 출력
  -h, --help               도움말
  -v, --version            버전

종료 코드: 0 통과 · 1 규칙 위반 · 2 사용법·설정 오류
명령마다 자세한 도움말: agent-gates <명령> --help
`;

export function readVersion(): string {
  const raw: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'version' in raw &&
    typeof raw.version === 'string'
  ) {
    return raw.version;
  }
  return '0.0.0';
}

/** CLI 진입점. process에 직접 닿지 않아서 테스트에서 그대로 부를 수 있다. */
export async function run(argv: readonly string[], io: Io): Promise<ExitCode> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case undefined:
      case 'help':
      case '-h':
      case '--help':
        io.stdout.write(HELP);
        return command === undefined ? EXIT.usage : EXIT.ok;
      case '-v':
      case '--version':
        io.stdout.write(`${readVersion()}\n`);
        return EXIT.ok;
      case 'init':
        return await initCommand(rest, io);
      case 'markers':
        return await markersCommand(rest, io);
      case 'gates':
        return await gatesCommand(rest, io);
      case 'scope':
        return await scopeCommand(rest, io);
      case 'check':
        return await checkCommand(rest, io);
      default:
        throw new UsageError(`알 수 없는 명령입니다: ${command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr.write(`agent-gates: ${error.message}\n도움말: agent-gates --help\n`);
      return EXIT.usage;
    }
    if (error instanceof ConfigError) {
      const details = error.details.map((detail) => `  - ${detail}\n`).join('');
      io.stderr.write(`agent-gates: ${error.message}\n${details}`);
      return EXIT.usage;
    }
    throw error;
  }
}
