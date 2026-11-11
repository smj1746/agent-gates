import { describe, expect, it } from 'vitest';
import { CONFIG_FILE, DEFAULT_CONFIG, loadConfig, parseConfig } from '../src/core/config.js';
import { ConfigError } from '../src/core/errors.js';
import { makeTempDir, writeFiles } from './helpers.js';

function configErrorOf(raw: unknown): ConfigError {
  try {
    parseConfig(raw);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('ConfigError가 나와야 합니다');
}

describe('loadConfig', () => {
  it('설정 파일이 없으면 기본값을 쓴다', async () => {
    const cwd = await makeTempDir();
    const loaded = await loadConfig(cwd);
    expect(loaded.path).toBeNull();
    expect(loaded.config).toEqual(DEFAULT_CONFIG);
  });

  it('직접 준 경로가 없으면 오류', async () => {
    const cwd = await makeTempDir();
    await expect(loadConfig(cwd, 'nope.json')).rejects.toThrow('찾을 수 없습니다');
  });

  it('JSON이 깨졌으면 오류', async () => {
    const cwd = await makeTempDir();
    await writeFiles(cwd, { [CONFIG_FILE]: '{ "markers": ' });
    await expect(loadConfig(cwd)).rejects.toThrow('올바른 JSON이 아닙니다');
  });
});

describe('parseConfig', () => {
  it('빠진 칸은 기본값으로 채운다', () => {
    const config = parseConfig({ markers: { max: 3 } });
    expect(config.markers.max).toBe(3);
    expect(config.markers.patterns).toEqual(DEFAULT_CONFIG.markers.patterns);
    expect(config.gates).toEqual(DEFAULT_CONFIG.gates);
  });

  it('label이 없으면 text를 쓴다', () => {
    const config = parseConfig({ markers: { patterns: [{ id: 'x', text: 'FIXME' }] } });
    expect(config.markers.patterns).toEqual([{ id: 'x', text: 'FIXME', label: 'FIXME' }]);
  });

  it('잘못된 곳을 한 번에 모아 알린다', () => {
    const error = configErrorOf({
      markers: { max: -1, include: 'src' },
      gates: { required: [] },
      scope: { owners: { 'FE-A': ['{a,b'] } },
      extra: true,
    });
    expect(error.details).toEqual(
      expect.arrayContaining([
        expect.stringContaining('extra'),
        expect.stringContaining('markers.max'),
        expect.stringContaining('markers.include'),
        expect.stringContaining('gates.required'),
        expect.stringContaining('scope.owners.FE-A'),
      ]),
    );
  });

  it('별칭이 없는 칸을 가리키면 오류', () => {
    const error = configErrorOf({ gates: { aliases: { 메모: '비고' } } });
    expect(error.details[0]).toContain('gates.aliases.메모');
  });

  it('id가 겹치는 표식은 오류', () => {
    const error = configErrorOf({
      markers: {
        patterns: [
          { id: 'a', text: 'X' },
          { id: 'a', text: 'Y' },
        ],
      },
    });
    expect(error.details[0]).toContain('두 번');
  });
});
