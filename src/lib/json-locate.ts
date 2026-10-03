/**
 * Поиск места и причины ошибки в JSON. Нужен, потому что текст ошибки JSON.parse зависит от браузера
 * и не всегда содержит позицию. Вызывается только когда JSON.parse уже упал.
 */
export interface JsonErrorInfo {
  pos: number;
  message: string;
}

export function locateJsonError(text: string): JsonErrorInfo | null {
  let i = 0;
  const fail = (message: string, pos = i): never => {
    throw { pos, message } as JsonErrorInfo;
  };
  const ws = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text.startsWith('//', i) || text.startsWith('/*', i)) fail('Комментарии в JSON не допускаются');
      return;
    }
  };
  const str = () => {
    if (text[i] === "'") fail('Строки в JSON — только в двойных кавычках');
    i++; // "
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\n') fail('Строка не закрыта до конца строки');
      if (text[i] === '\\') {
        i++;
        if (!/["\\/bfnrtu]/.test(text[i] ?? '')) fail(`Недопустимая escape-последовательность «\\${text[i] ?? ''}»`);
      }
      i++;
    }
    if (i >= text.length) fail('Строка не закрыта');
    i++;
  };
  const value = (): void => {
    ws();
    const c = text[i];
    if (c === undefined) fail('Неожиданный конец — ожидалось значение');
    if (c === '{') return obj();
    if (c === '[') return arr();
    if (c === '"' || c === "'") return str();
    const lit = text.slice(i).match(/^(true|false|null|-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?)/);
    if (lit) {
      i += lit[0].length;
      return;
    }
    if (/^(True|False|None|NULL|undefined|NaN|Infinity)\b/.test(text.slice(i))) fail('Допустимы только true, false, null — в нижнем регистре');
    if (c === ',' ) fail('Лишняя запятая — ожидалось значение');
    if (c === '}' || c === ']') fail('Лишняя запятая перед закрывающей скобкой');
    fail(`Неожиданный символ «${c}» — ожидалось значение`);
  };
  const obj = () => {
    i++;
    ws();
    if (text[i] === '}') {
      i++;
      return;
    }
    for (;;) {
      ws();
      if (text[i] === '}') fail('Лишняя запятая перед «}»');
      if (text[i] !== '"' && text[i] !== "'") fail(text[i] === undefined ? 'Объект не закрыт — нет «}»' : 'Ключ должен быть строкой в двойных кавычках');
      str();
      ws();
      if (text[i] !== ':') fail('Ожидалось «:» после ключа');
      i++;
      value();
      ws();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '}') {
        i++;
        return;
      }
      fail(text[i] === undefined ? 'Объект не закрыт — нет «}»' : 'Ожидалась запятая или «}» — возможно, пропущена запятая');
    }
  };
  const arr = () => {
    i++;
    ws();
    if (text[i] === ']') {
      i++;
      return;
    }
    for (;;) {
      ws();
      if (text[i] === ']') fail('Лишняя запятая перед «]»');
      value();
      ws();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        return;
      }
      fail(text[i] === undefined ? 'Массив не закрыт — нет «]»' : 'Ожидалась запятая или «]» — возможно, пропущена запятая');
    }
  };
  try {
    value();
    ws();
    if (i < text.length) fail('Лишние символы после конца документа');
    return null;
  } catch (e) {
    if (e && typeof e === 'object' && 'pos' in e) return e as JsonErrorInfo;
    throw e;
  }
}
