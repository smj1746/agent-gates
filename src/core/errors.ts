/** 명령이나 옵션을 잘못 썼을 때. 종료 코드 2로 끝난다. */
export class UsageError extends Error {
  override readonly name = 'UsageError';
}

/** 설정 파일을 읽거나 해석할 수 없을 때. 종료 코드 2로 끝난다. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
  /** 고쳐야 할 곳을 한 줄씩 담는다. */
  readonly details: readonly string[];

  constructor(message: string, details: readonly string[] = []) {
    super(message);
    this.details = details;
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isNodeError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
