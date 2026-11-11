import { COMMON_OPTIONS, parseArgv, parseCount, rejectPositionals } from '../core/args.js';
import { loadConfig } from '../core/config.js';
import { writeJson } from '../core/report.js';
import { EXIT, type ExitCode, type Io } from '../core/types.js';
import { formatGatesReport, runGatesCheck } from './gates.js';
import { buildMarkerReport, filesToSkip, formatMarkerReport, scanMarkers } from './markers.js';

/** CI에서 한 번에 돌리는 묶음: 게이트 형식 + 미정 표식 개수 */
export async function checkCommand(args: readonly string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parseArgv(args, {
    ...COMMON_OPTIONS,
    max: { type: 'string' },
  });
  if (values.help) {
    io.stdout.write(CHECK_HELP);
    return EXIT.ok;
  }
  rejectPositionals(positionals, 'check');

  const loaded = await loadConfig(io.cwd, values.config);
  const { config } = loaded;
  const max = values.max === undefined ? config.markers.max : parseCount(values.max, '--max');

  const gates = await runGatesCheck(io.cwd, config.gates);
  const markers = buildMarkerReport(
    await scanMarkers(io.cwd, config.markers, filesToSkip(io.cwd, loaded)),
    max,
  );
  const passed = gates.passed && markers.passed;

  if (values.json) {
    writeJson((s) => io.stdout.write(s), { passed, gates, markers });
  } else {
    io.stdout.write(
      [
        '[1/2] 오류 게이트',
        formatGatesReport(gates),
        '[2/2] 미정 표식',
        formatMarkerReport(markers, config.markers),
        passed ? '결과: 통과' : '결과: 실패',
        '',
      ].join('\n'),
    );
  }
  return passed ? EXIT.ok : EXIT.failed;
}

export const CHECK_HELP = `사용법: agent-gates check [--max <개수>] [--json] [--config <파일>]

CI에서 한 번에 돌리는 검사입니다.
  1. 오류 게이트 문서 형식 (gates check)
  2. 미정 표식 개수 (markers) — 기준(--max 또는 markers.max)이 있을 때만 실패시킵니다

담당 범위 검사(scope)는 담당자마다 다르므로 따로 실행하세요.

옵션
  --max <개수>   미정 표식 최대 개수
  --json         결과를 JSON으로 출력
  -c, --config   설정 파일 경로 (기본: agent-gates.config.json)
`;
