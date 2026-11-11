import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import { UsageError, messageOf } from './errors.js';

/** 모든 명령이 함께 쓰는 옵션 */
export const COMMON_OPTIONS = {
  config: { type: 'string', short: 'c' },
  json: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
} as const satisfies ParseArgsOptionsConfig;

/** node:util parseArgs가 던지는 오류를 사용법 오류로 바꾼다. */
export function parseOrThrow<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new UsageError(messageOf(error));
  }
}

export function parseArgv<const T extends ParseArgsOptionsConfig>(
  args: readonly string[],
  options: T,
) {
  return parseOrThrow(() =>
    parseArgs({ args: [...args], options, allowPositionals: true, strict: true }),
  );
}

/** `--max 5` 같은 0 이상 정수 옵션 */
export function parseCount(value: string, option: string): number {
  if (!/^\d+$/.test(value))
    throw new UsageError(`${option}에는 0 이상의 정수를 넣어 주세요: ${value}`);
  return Number.parseInt(value, 10);
}

export function rejectPositionals(positionals: readonly string[], command: string): void {
  if (positionals.length > 0) {
    throw new UsageError(`${command}에 쓸 수 없는 인자입니다: ${positionals.join(' ')}`);
  }
}
