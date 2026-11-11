import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ConfigError, isNodeError, messageOf } from './errors.js';
import { globToRegExp } from './glob.js';

export const CONFIG_FILE = 'agent-gates.config.json';

export interface MarkerPattern {
  /** 결과를 묶는 짧은 이름 (예: confirm) */
  readonly id: string;
  /** 코드에서 찾을 글자 그대로 (정규식 아님) */
  readonly text: string;
  /** 출력에 보일 이름 */
  readonly label: string;
}

export interface MarkersConfig {
  readonly patterns: readonly MarkerPattern[];
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  /** 이 개수를 넘으면 실패. null이면 개수만 알리고 실패시키지 않는다. */
  readonly max: number | null;
}

export interface GatesConfig {
  readonly file: string;
  readonly required: readonly string[];
  readonly optional: readonly string[];
  /** 다른 이름 → 표준 이름 (예: 증상 → 발생 상황) */
  readonly aliases: Readonly<Record<string, string>>;
  /** 상태 칸의 이름 */
  readonly statusField: string;
  /** 상태 칸에 올 수 있는 값. 비우면 검사하지 않는다. */
  readonly statuses: readonly string[];
}

export interface ScopeConfig {
  /** 담당자 이름 → 그 사람이 고쳐도 되는 경로 패턴 */
  readonly owners: Readonly<Record<string, readonly string[]>>;
  /** 누구나 고칠 수 있지만 화면 PR과 섞지 않는 공유 파일 */
  readonly shared: readonly string[];
}

export interface Config {
  readonly markers: MarkersConfig;
  readonly gates: GatesConfig;
  readonly scope: ScopeConfig;
}

export interface LoadedConfig {
  readonly config: Config;
  /** 읽은 설정 파일의 절대 경로. 파일이 없어 기본값을 썼으면 null */
  readonly path: string | null;
}

export const DEFAULT_CONFIG: Config = {
  markers: {
    patterns: [
      { id: 'confirm', text: 'TODO(확인필요)', label: '확인 필요' },
      { id: 'backend', text: '[백엔드 확정 필요]', label: '백엔드 확정 필요' },
      { id: 'temporary', text: '[임시]', label: '임시' },
    ],
    include: ['**/*'],
    exclude: [
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/coverage/**',
      '**/.next/**',
      '**/*.md',
      '**/*.lock',
      '**/package-lock.json',
    ],
    max: null,
  },
  gates: {
    file: 'docs/GATES.md',
    required: ['상태', '발생 상황', '금지 경로', '대신 할 것'],
    optional: ['등록', '원인', '사전 체크', '근거'],
    aliases: { 증상: '발생 상황' },
    statusField: '상태',
    statuses: ['활성', '해제'],
  },
  scope: {
    owners: {},
    shared: [],
  },
};

/**
 * 설정 파일을 읽는다.
 * - 경로를 주지 않았고 기본 파일도 없으면 기본값을 쓴다.
 * - 경로를 줬는데 없으면 ConfigError
 */
export async function loadConfig(cwd: string, explicitPath?: string): Promise<LoadedConfig> {
  const configPath =
    explicitPath === undefined ? path.join(cwd, CONFIG_FILE) : path.resolve(cwd, explicitPath);

  let text: string;
  try {
    text = await readFile(configPath, 'utf8');
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      if (explicitPath === undefined) return { config: DEFAULT_CONFIG, path: null };
      throw new ConfigError(`설정 파일을 찾을 수 없습니다: ${explicitPath}`);
    }
    throw error;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(
      `설정 파일이 올바른 JSON이 아닙니다: ${path.relative(cwd, configPath)} (${messageOf(error)})`,
    );
  }

  return { config: parseConfig(raw), path: configPath };
}

/**
 * JSON에서 읽은 값을 검사해 Config로 만든다.
 * 빠진 칸은 기본값으로 채우고, 잘못된 칸은 한 번에 모아 알린다.
 */
export function parseConfig(raw: unknown): Config {
  if (!isRecord(raw)) throw new ConfigError('설정 파일의 최상위는 객체여야 합니다.');

  const issues: string[] = [];
  rejectUnknownKeys(raw, ['$schema', 'markers', 'gates', 'scope'], '', issues);

  const config: Config = {
    markers: parseMarkers(raw.markers, issues),
    gates: parseGates(raw.gates, issues),
    scope: parseScope(raw.scope, issues),
  };

  if (issues.length > 0) throw new ConfigError('설정 파일에 고칠 곳이 있습니다.', issues);
  return config;
}

function parseMarkers(value: unknown, issues: string[]): MarkersConfig {
  const defaults = DEFAULT_CONFIG.markers;
  const section = readSection(value, 'markers', issues);
  if (!section) return defaults;
  rejectUnknownKeys(section, ['patterns', 'include', 'exclude', 'max'], 'markers.', issues);

  return {
    patterns: readPatterns(section.patterns, defaults.patterns, issues),
    include: readGlobs(section.include, 'markers.include', defaults.include, issues),
    exclude: readGlobs(section.exclude, 'markers.exclude', defaults.exclude, issues),
    max: readMax(section.max, issues),
  };
}

function parseGates(value: unknown, issues: string[]): GatesConfig {
  const defaults = DEFAULT_CONFIG.gates;
  const section = readSection(value, 'gates', issues);
  if (!section) return defaults;
  rejectUnknownKeys(
    section,
    ['file', 'required', 'optional', 'aliases', 'statusField', 'statuses'],
    'gates.',
    issues,
  );

  const gates: GatesConfig = {
    file: readString(section.file, 'gates.file', defaults.file, issues),
    required: readStrings(section.required, 'gates.required', defaults.required, issues),
    optional: readStrings(section.optional, 'gates.optional', defaults.optional, issues),
    aliases: readStringRecord(section.aliases, 'gates.aliases', defaults.aliases, issues),
    statusField: readString(section.statusField, 'gates.statusField', defaults.statusField, issues),
    statuses: readStrings(section.statuses, 'gates.statuses', defaults.statuses, issues, true),
  };

  const known = new Set([...gates.required, ...gates.optional]);
  for (const [alias, target] of Object.entries(gates.aliases)) {
    if (!known.has(target)) {
      issues.push(
        `gates.aliases.${alias}: 가리키는 칸 '${target}'이 required나 optional에 없습니다.`,
      );
    }
  }
  return gates;
}

function parseScope(value: unknown, issues: string[]): ScopeConfig {
  const defaults = DEFAULT_CONFIG.scope;
  const section = readSection(value, 'scope', issues);
  if (!section) return defaults;
  rejectUnknownKeys(section, ['owners', 'shared'], 'scope.', issues);

  let owners: Record<string, readonly string[]> = {};
  const rawOwners = section.owners;
  if (rawOwners !== undefined) {
    if (!isRecord(rawOwners)) {
      issues.push('scope.owners: "담당자 이름": ["경로 패턴"] 형태의 객체여야 합니다.');
    } else {
      owners = {};
      for (const [name, globs] of Object.entries(rawOwners)) {
        owners[name] = readGlobs(globs, `scope.owners.${name}`, [], issues);
      }
    }
  }

  return {
    owners,
    shared: readGlobs(section.shared, 'scope.shared', defaults.shared, issues),
  };
}

// ---------- 작은 읽기 도우미 ----------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSection(
  value: unknown,
  name: string,
  issues: string[],
): Record<string, unknown> | null {
  if (value === undefined) return null;
  if (!isRecord(value)) {
    issues.push(`${name}: 객체여야 합니다.`);
    return null;
  }
  return value;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  prefix: string,
  issues: string[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      issues.push(`${prefix}${key}: 알 수 없는 설정입니다. (쓸 수 있는 칸: ${allowed.join(', ')})`);
    }
  }
}

function readString(value: unknown, at: string, fallback: string, issues: string[]): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push(`${at}: 빈칸이 아닌 문자열이어야 합니다.`);
    return fallback;
  }
  return value;
}

function readStrings(
  value: unknown,
  at: string,
  fallback: readonly string[],
  issues: string[],
  allowEmpty = false,
): readonly string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) {
    issues.push(`${at}: 문자열 배열이어야 합니다.`);
    return fallback;
  }
  const items: unknown[] = value;
  const strings = items.filter((item): item is string => typeof item === 'string' && item !== '');
  if (strings.length !== items.length) {
    issues.push(`${at}: 빈칸이 아닌 문자열만 넣을 수 있습니다.`);
    return fallback;
  }
  if (!allowEmpty && strings.length === 0) {
    issues.push(`${at}: 하나 이상 있어야 합니다.`);
    return fallback;
  }
  return strings;
}

function readGlobs(
  value: unknown,
  at: string,
  fallback: readonly string[],
  issues: string[],
): readonly string[] {
  const globs = readStrings(value, at, fallback, issues, true);
  for (const glob of globs) {
    try {
      globToRegExp(glob);
    } catch (error) {
      issues.push(`${at}: ${messageOf(error)}`);
    }
  }
  return globs;
}

function readStringRecord(
  value: unknown,
  at: string,
  fallback: Readonly<Record<string, string>>,
  issues: string[],
): Readonly<Record<string, string>> {
  if (value === undefined) return fallback;
  if (!isRecord(value)) {
    issues.push(`${at}: "다른 이름": "표준 이름" 형태의 객체여야 합니다.`);
    return fallback;
  }
  const result: Record<string, string> = {};
  for (const [key, target] of Object.entries(value)) {
    if (typeof target !== 'string' || target === '') {
      issues.push(`${at}.${key}: 빈칸이 아닌 문자열이어야 합니다.`);
      continue;
    }
    result[key] = target;
  }
  return result;
}

function readPatterns(
  value: unknown,
  fallback: readonly MarkerPattern[],
  issues: string[],
): readonly MarkerPattern[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(
      'markers.patterns: { "id", "text" }를 담은 배열이어야 하고, 하나 이상 있어야 합니다.',
    );
    return fallback;
  }
  const items: unknown[] = value;
  const patterns: MarkerPattern[] = [];
  const seen = new Set<string>();

  items.forEach((item, index) => {
    const at = `markers.patterns[${String(index)}]`;
    if (!isRecord(item)) {
      issues.push(`${at}: 객체여야 합니다.`);
      return;
    }
    const { id, text, label } = item;
    if (typeof id !== 'string' || id === '' || typeof text !== 'string' || text === '') {
      issues.push(`${at}: id와 text는 빈칸이 아닌 문자열이어야 합니다.`);
      return;
    }
    if (label !== undefined && (typeof label !== 'string' || label === '')) {
      issues.push(`${at}.label: 빈칸이 아닌 문자열이어야 합니다.`);
      return;
    }
    if (seen.has(id)) {
      issues.push(`${at}.id: '${id}'가 두 번 나옵니다.`);
      return;
    }
    seen.add(id);
    patterns.push({ id, text, label: label ?? text });
  });

  return patterns;
}

function readMax(value: unknown, issues: string[]): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    issues.push('markers.max: 0 이상의 정수이거나 null이어야 합니다.');
    return null;
  }
  return value;
}
