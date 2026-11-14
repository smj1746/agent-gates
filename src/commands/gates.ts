import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { COMMON_OPTIONS, parseArgv } from '../core/args.js';
import { loadConfig, type GatesConfig } from '../core/config.js';
import { UsageError, isNodeError } from '../core/errors.js';
import { formatFinding, sortFindings, writeJson } from '../core/report.js';
import { EXIT, countLevels, type ExitCode, type Finding, type Io } from '../core/types.js';
import { toPosix } from '../core/walk.js';

export interface GateField {
  /** 별칭을 표준 이름으로 바꾼 칸 이름 */
  readonly key: string;
  /** 문서에 적힌 그대로의 칸 이름 */
  readonly rawKey: string;
  readonly value: string;
  readonly line: number;
}

export interface Gate {
  /** 제목에 적힌 ID 그대로 (형식 검사는 checkGates에서) */
  readonly id: string;
  readonly title: string;
  readonly line: number;
  readonly fields: readonly GateField[];
}

/** `## G-1 | [스타일] 제목` 또는 `### G-1 | 제목` */
const GATE_HEADING = /^#{2,3}\s+(G-\S*)\s*(.*)$/;
/** 들여쓰지 않은 목록 줄 `- 칸 이름: 값` (전각 콜론도 허용) */
const FIELD_LINE = /^[-*]\s+([^:：]+?)\s*[:：]\s*(.*)$/;
const ANY_HEADING = /^#{1,6}\s/;
const FENCE = /^ {0,3}(```|~~~)/;
const VALID_ID = /^G-\d+$/;

/**
 * GATES.md를 게이트 목록으로 읽는다.
 *
 * - `G-`로 시작하는 2·3단계 제목이 게이트 하나를 연다. 다른 제목이 나오면 닫힌다.
 * - 들여쓰지 않은 `- 칸: 값` 줄이 칸이 되고, 들여쓴 다음 줄들은 앞 칸의 값에 이어 붙는다.
 * - HTML 주석과 코드 블록 안은 읽지 않는다. 형식 예시를 적어 둘 수 있게 하기 위해서다.
 */
export function parseGates(text: string, aliases: Readonly<Record<string, string>> = {}): Gate[] {
  // 주석은 줄 수를 유지한 채 지워서, 뒤에서 보고하는 줄 번호가 원문과 맞게 한다.
  const withoutComments = text.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\n]/g, ''),
  );
  const lines = withoutComments.split(/\r?\n/);

  const gates: Gate[] = [];
  let current: { id: string; title: string; line: number; fields: GateField[] } | null = null;
  let inFence = false;

  const close = (): void => {
    if (current) gates.push(current);
    current = null;
  };

  lines.forEach((lineText, index) => {
    const lineNumber = index + 1;

    if (FENCE.test(lineText)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const heading = GATE_HEADING.exec(lineText);
    if (heading) {
      close();
      current = {
        id: heading[1] ?? '',
        title: (heading[2] ?? '').replace(/^\|\s*/, '').trim(),
        line: lineNumber,
        fields: [],
      };
      return;
    }
    if (ANY_HEADING.test(lineText)) {
      close();
      return;
    }
    if (!current) return;

    const field = FIELD_LINE.exec(lineText);
    if (field) {
      const rawKey = (field[1] ?? '').replace(/[*_`]/g, '').trim();
      current.fields.push({
        key: aliases[rawKey] ?? rawKey,
        rawKey,
        value: (field[2] ?? '').trim(),
        line: lineNumber,
      });
      return;
    }

    // 들여쓴 줄은 바로 앞 칸의 값에 이어 붙인다 (예: '대신 할 것:' 아래 하위 목록)
    const last = current.fields.at(-1);
    if (last && /^\s+\S/.test(lineText)) {
      current.fields[current.fields.length - 1] = {
        ...last,
        value: `${last.value} ${lineText.trim()}`.trim(),
      };
    }
  });

  close();
  return gates;
}

export function checkGates(text: string, config: GatesConfig, file: string): Finding[] {
  const gates = parseGates(text, config.aliases);
  const findings: Finding[] = [];
  const at = (line: number) => ({ file, line });

  if (gates.length === 0) {
    findings.push({
      level: 'warning',
      rule: 'gates/empty',
      message: '등록된 게이트가 없습니다. (## G-1 | 제목 형식의 제목으로 시작해요)',
      file,
    });
    return findings;
  }

  const known = new Set([...config.required, ...config.optional]);
  const seenIds = new Map<string, number>();

  for (const gate of gates) {
        if (!VALID_ID.test(gate.id)) {
      // G- 뒤가 숫자가 아니면 형식 예시일 가능성이 높아요 (#3)
      const hint = /^G-\d/.test(gate.id)
        ? ''
        : ' — 형식 예시라면 HTML 주석이나 코드 블록 안에 두세요';
      findings.push({
        level: 'error',
        rule: 'gates/bad-id',
        message: `ID 형식이 아닙니다: ${gate.id} (G-숫자, 예: G-1)${hint}`,
        ...at(gate.line),
      });
    } else {
      const firstLine = seenIds.get(gate.id);
      if (firstLine === undefined) seenIds.set(gate.id, gate.line);
      else {
        findings.push({
          level: 'error',
          rule: 'gates/duplicate-id',
          message: `같은 ID가 ${String(firstLine)}행에도 있습니다: ${gate.id}`,
          ...at(gate.line),
        });
      }
    }

    if (gate.title === '') {
      findings.push({
        level: 'warning',
        rule: 'gates/missing-title',
        message: `${gate.id}: 제목이 없습니다. (## ${gate.id} | [분류] 제목)`,
        ...at(gate.line),
      });
    }

    const byKey = new Map<string, GateField>();
    for (const field of gate.fields) {
      if (byKey.has(field.key)) {
        findings.push({
          level: 'warning',
          rule: 'gates/duplicate-field',
          message: `${gate.id}: '${field.rawKey}' 칸이 두 번 있습니다.`,
          ...at(field.line),
        });
        continue;
      }
      byKey.set(field.key, field);
      if (!known.has(field.key)) {
        findings.push({
          level: 'warning',
          rule: 'gates/unknown-field',
          message: `${gate.id}: 알 수 없는 칸 '${field.rawKey}' (이름을 고치거나 gates.optional에 추가하세요)`,
          ...at(field.line),
        });
      }
    }

    for (const name of config.required) {
      const field = byKey.get(name);
      if (!field) {
        findings.push({
          level: 'error',
          rule: 'gates/missing-field',
          message: `${gate.id}: 필수 칸이 없습니다 — ${name}`,
          ...at(gate.line),
        });
      } else if (field.value === '') {
        findings.push({
          level: 'error',
          rule: 'gates/empty-field',
          message: `${gate.id}: '${field.rawKey}' 칸이 비어 있습니다.`,
          ...at(field.line),
        });
      }
    }

    const status = byKey.get(config.statusField);
    if (status && status.value !== '' && config.statuses.length > 0) {
      const value = status.value.split(/\s+/)[0] ?? '';
      if (!config.statuses.includes(value)) {
        findings.push({
          level: 'error',
          rule: 'gates/bad-status',
          message: `${gate.id}: 쓸 수 없는 상태입니다 — ${value} (${config.statuses.join(' / ')} 중 하나)`,
          ...at(status.line),
        });
      }
    }
  }

  return findings;
}

export interface GatesReport {
  readonly file: string;
  readonly gates: number;
  readonly findings: readonly Finding[];
  readonly passed: boolean;
}

/** 게이트 파일을 읽어 검사한다. 파일이 없으면 오류 하나를 담아 돌려준다. */
export async function runGatesCheck(cwd: string, config: GatesConfig, fileOverride?: string) {
  const relative = toPosix(path.normalize(fileOverride ?? config.file));
  let text: string;
  try {
    text = await readFile(path.resolve(cwd, relative), 'utf8');
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) throw error;
    const finding: Finding = {
      level: 'error',
      rule: 'gates/file-not-found',
      message: '게이트 파일이 없습니다. (agent-gates init으로 만들 수 있어요)',
      file: relative,
    };
    return { file: relative, gates: 0, findings: [finding], passed: false } satisfies GatesReport;
  }

  const findings = sortFindings(checkGates(text, config, relative));
  const report: GatesReport = {
    file: relative,
    gates: parseGates(text, config.aliases).length,
    findings,
    passed: countLevels(findings).errors === 0,
  };
  return report;
}

export function formatGatesReport(report: GatesReport): string {
  const { errors, warnings } = countLevels(report.findings);
  const lines = [
    `${report.file} — 게이트 ${String(report.gates)}개 · 오류 ${String(errors)} · 경고 ${String(warnings)}`,
  ];
  for (const finding of report.findings) lines.push(formatFinding(finding));
  if (report.findings.length === 0) lines.push('  모든 게이트가 형식을 지켰습니다.');
  return `${lines.join('\n')}\n`;
}

export async function gatesCommand(args: readonly string[], io: Io): Promise<ExitCode> {
  const [sub, ...rest] = args;
  if (sub === undefined || sub === '--help' || sub === '-h') {
    io.stdout.write(GATES_HELP);
    return sub === undefined ? EXIT.usage : EXIT.ok;
  }
  if (sub !== 'check') throw new UsageError(`알 수 없는 gates 명령입니다: ${sub}\n\n${GATES_HELP}`);

  const { values, positionals } = parseArgv(rest, COMMON_OPTIONS);
  if (values.help) {
    io.stdout.write(GATES_HELP);
    return EXIT.ok;
  }
  if (positionals.length > 1) throw new UsageError('게이트 파일은 하나만 줄 수 있습니다.');

  const loaded = await loadConfig(io.cwd, values.config);
  const report = await runGatesCheck(io.cwd, loaded.config.gates, positionals[0]);

  if (values.json) writeJson((s) => io.stdout.write(s), report);
  else io.stdout.write(formatGatesReport(report));
  return report.passed ? EXIT.ok : EXIT.failed;
}

export const GATES_HELP = `사용법: agent-gates gates check [파일] [--json] [--config <파일>]

오류 게이트 문서(기본: docs/GATES.md)가 정한 형식을 지켰는지 검사합니다.

게이트 형식
  ## G-1 | [분류] 제목
  - 상태: 활성
  - 발생 상황: 무엇이 어떻게 잘못됐는지
  - 금지 경로: 다시 하면 안 되는 방법
  - 대신 할 것: 이렇게 한다

검사하는 것
  ID 형식(G-숫자)과 중복, 필수 칸 누락·빈칸, 상태 값, 알 수 없는 칸(경고)

옵션
  --json         결과를 JSON으로 출력
  -c, --config   설정 파일 경로 (기본: agent-gates.config.json)
`;
