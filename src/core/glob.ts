const cache = new Map<string, RegExp>();

/**
 * 글롭 패턴을 정규식으로 바꾼다.
 *
 * 패턴은 저장소 기준 상대 경로 **전체**(슬래시 구분)와 비교한다.
 * 어느 폴더에 있든 맞추려면 앞에 `**\/`를 붙인다. (예: `**\/*.md`)
 *
 * | 패턴 | 뜻 |
 * |---|---|
 * | `*` | 슬래시를 뺀 0자 이상 |
 * | `?` | 슬래시를 뺀 1자 |
 * | `**\/` | 폴더 0개 이상 |
 * | `**` (끝) | 그 아래 전부 |
 * | `{a,b}` | a 또는 b (겹쳐 쓸 수 없음) |
 */
export function globToRegExp(glob: string): RegExp {
  const cached = cache.get(glob);
  if (cached) return cached;

  let source = '';
  let inBrace = false;

  for (let i = 0; i < glob.length; i += 1) {
    const char = glob.charAt(i);

    if (char === '*') {
      if (glob.charAt(i + 1) === '*') {
        const atSegmentStart = i === 0 || glob.charAt(i - 1) === '/';
        if (atSegmentStart && glob.charAt(i + 2) === '/') {
          source += '(?:[^/]*/)*';
          i += 2;
          continue;
        }
        source += '.*';
        i += 1;
        continue;
      }
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else if (char === '{') {
      if (inBrace) throw new Error(`중괄호는 겹쳐 쓸 수 없습니다: ${glob}`);
      inBrace = true;
      source += '(?:';
    } else if (char === '}' && inBrace) {
      inBrace = false;
      source += ')';
    } else if (char === ',' && inBrace) {
      source += '|';
    } else {
      source += char.replace(/[.+^$(){}|[\]\\]/g, '\\$&');
    }
  }

  if (inBrace) throw new Error(`중괄호가 닫히지 않았습니다: ${glob}`);

  const regex = new RegExp(`^${source}$`);
  cache.set(glob, regex);
  return regex;
}

/** 경로가 패턴 중 하나라도 맞으면 true */
export function matchesAny(relativePath: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(relativePath));
}
