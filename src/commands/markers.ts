import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { COMMON_OPTIONS, parseArgv, parseCount, rejectPositionals } from '../core/args.js';
import { loadConfig, type LoadedConfig, type MarkersConfig } from '../core/config.js';
import { writeJson } from '../core/report.js';
import { EXIT, type ExitCode, type Io } from '../core/types.js';
import { listFiles, toPosix } from '../core/walk.js';

/** 이보다 큰 파일은 읽지 않는다. 생성 파일이나 데이터일 가능성이 크다. */
const MAX_FILE_BYTES = 1_000_000;
const MAX_TEXT_LENGTH = 120;

export interface MarkerHit {
  readonly file: string;
  readonly line: number;
  readonly marker: string;
  readonly label: string;
  /** 표식이 있는 줄 (앞뒤 공백 제거, 길면 자름) */
  readonly text: string;
}

export interface MarkerReport {
  readonly scannedFiles: number;
  readonly hits: readonly MarkerHit[];
  readonly max: number | null;
  readonly passed: boolean;
}

/** 설정 파일과 게이트 파일은 표식 글자를 '정의'로 담고 있으므로 늘 뺀다. */
export function filesToSkip(cwd: string, loaded: LoadedConfig): Set<string> {
  const skip = new Set<string>([toPosix(path.normalize(loaded.config.gates.file))]);
  if (loaded.path !== null) skip.add(toPosix(path.relative(cwd, loaded.path)));
  return skip;
}

export async function scanMarkers(
  root: string,
  config: MarkersConfig,
  skip: ReadonlySet<string> = new Set(),
): Promise<{ scannedFiles: number; hits: MarkerHit[] }> {
  const files = await listFiles(root, { include: config.include, exclude: config.exclude, skip });
  const hits: MarkerHit[] = [];
  let scannedFiles = 0;

  for (const file of files) {
    const absolute = path.join(root, file);
    const info = await stat(absolute);
    if (info.size > MAX_FILE_BYTES) continue;

    const buffer = await readFile(absolute);
    if (looksBinary(buffer)) continue;
    scannedFiles += 1;

    const lines = buffer.toString('utf8').split(/\r?\n/);
    lines.forEach((lineText, index) => {
      for (const pattern of config.patterns) {
        if (lineText.includes(pattern.text)) {
          hits.push({
            file,
            line: index + 1,
            marker: pattern.id,
            label: pattern.label,
            text: shorten(lineText.trim()),
          });
        }
      }
    });
  }

  return { scannedFiles, hits };
}

export function buildMarkerReport(
  scan: { scannedFiles: number; hits: readonly MarkerHit[] },
  max: number | null,
): MarkerReport {
  return {
    scannedFiles: scan.scannedFiles,
    hits: scan.hits,
    max,
    passed: max === null || scan.hits.length <= max,
  };
}

export function formatMarkerReport(report: MarkerReport, config: MarkersConfig): string {
  const lines: string[] = [];
  const fileCount = new Set(report.hits.map((hit) => hit.file)).size;
  lines.push(
    `미정 표식 ${String(report.hits.length)}개 (파일 ${String(fileCount)}개 / 검사한 파일 ${String(report.scannedFiles)}개)`,
  );

  for (const pattern of config.patterns) {
    const group = report.hits.filter((hit) => hit.marker === pattern.id);
    if (group.length === 0) continue;
    lines.push('', `  ${pattern.label} (${String(group.length)})`);
    for (const hit of group) lines.push(`    ${hit.file}:${String(hit.line)}  ${hit.text}`);
  }

  lines.push('');
  if (report.max === null) {
    lines.push('기준 없음: 개수만 알립니다. (--max 또는 markers.max로 기준을 정할 수 있어요)');
  } else if (report.passed) {
    lines.push(`기준 최대 ${String(report.max)}개 → 통과`);
  } else {
    lines.push(
      `기준 최대 ${String(report.max)}개 → 실패: ${String(report.hits.length - report.max)}개를 확정하거나 지워 주세요.`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export async function markersCommand(args: readonly string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parseArgv(args, {
    ...COMMON_OPTIONS,
    max: { type: 'string' },
  });
  if (values.help) {
    io.stdout.write(MARKERS_HELP);
    return EXIT.ok;
  }
  rejectPositionals(positionals, 'markers');

  const loaded = await loadConfig(io.cwd, values.config);
  const max =
    values.max === undefined ? loaded.config.markers.max : parseCount(values.max, '--max');
  const scan = await scanMarkers(io.cwd, loaded.config.markers, filesToSkip(io.cwd, loaded));
  const report = buildMarkerReport(scan, max);

  if (values.json) writeJson((s) => io.stdout.write(s), report);
  else io.stdout.write(formatMarkerReport(report, loaded.config.markers));

  return report.passed ? EXIT.ok : EXIT.failed;
}

export const MARKERS_HELP = `사용법: agent-gates markers [--max <개수>] [--json] [--config <파일>]

코드에 남은 미정 표식(예: TODO(확인필요), [백엔드 확정 필요])을 모아 보여줍니다.

옵션
  --max <개수>   이 개수를 넘으면 종료 코드 1 (설정의 markers.max보다 우선)
  --json         결과를 JSON으로 출력
  -c, --config   설정 파일 경로 (기본: agent-gates.config.json)
`;

function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0);
}

function shorten(text: string): string {
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text;
}
