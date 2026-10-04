/** Сообщения ajv по-русски — для самых частых ключевых слов JSON Schema. */
import type { ErrorObject } from 'ajv';

export function ruError(e: ErrorObject): string {
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case 'required':
      return `нет обязательного поля «${p.missingProperty}»`;
    case 'additionalProperties':
      return `лишнее поле «${p.additionalProperty}» — схема запрещает поля, которых нет в описании`;
    case 'type':
      return `неверный тип: ожидается ${p.type}`;
    case 'enum':
      return `значение не из списка: ${(p.allowedValues as unknown[]).join(', ')}`;
    case 'const':
      return `должно быть ровно ${JSON.stringify(p.allowedValue)}`;
    case 'pattern':
      return `не соответствует шаблону ${p.pattern}`;
    case 'format':
      return `не соответствует формату ${p.format}`;
    case 'minLength':
      return `короче ${p.limit} символов`;
    case 'maxLength':
      return `длиннее ${p.limit} символов`;
    case 'minimum':
      return `меньше ${p.limit}`;
    case 'maximum':
      return `больше ${p.limit}`;
    case 'minItems':
      return `элементов меньше ${p.limit}`;
    case 'maxItems':
      return `элементов больше ${p.limit}`;
    case 'if':
      return `не выполнено условие ветки «${p.failingKeyword}»`;
    default:
      return e.message ?? e.keyword;
  }
}
