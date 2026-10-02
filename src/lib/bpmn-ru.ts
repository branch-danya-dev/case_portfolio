/**
 * Русские подписи для палитры и контекстного меню bpmn-js (модуль translate).
 * Ключи — английские строки bpmn-js; если в новой версии строка изменится, останется английский вариант.
 */
const RU: Record<string, string> = {
  'Activate hand tool': 'Инструмент «рука» (перемещение холста)',
  'Activate the hand tool': 'Инструмент «рука» (перемещение холста)',
  'Activate lasso tool': 'Лассо: выделить несколько элементов',
  'Activate the lasso tool': 'Лассо: выделить несколько элементов',
  'Activate create/remove space tool': 'Добавить или убрать место на схеме',
  'Activate the create/remove space tool': 'Добавить или убрать место на схеме',
  'Activate global connect tool': 'Соединить элементы',
  'Activate the global connect tool': 'Соединить элементы',
  'Create start event': 'Стартовое событие',
  'Create StartEvent': 'Стартовое событие',
  'Create intermediate/boundary event': 'Промежуточное или граничное событие',
  'Create Intermediate/Boundary Event': 'Промежуточное или граничное событие',
  'Create end event': 'Конечное событие',
  'Create EndEvent': 'Конечное событие',
  'Create gateway': 'Шлюз',
  'Create Gateway': 'Шлюз',
  'Create task': 'Задача',
  'Create Task': 'Задача',
  'Create expanded sub-process': 'Развёрнутый подпроцесс',
  'Create expanded SubProcess': 'Развёрнутый подпроцесс',
  'Create pool/participant': 'Пул (участник)',
  'Create Pool/Participant': 'Пул (участник)',
  'Create data object reference': 'Объект данных',
  'Create DataObjectReference': 'Объект данных',
  'Create data store reference': 'Хранилище данных',
  'Create DataStoreReference': 'Хранилище данных',
  'Create group': 'Группа',
  'Create Group': 'Группа',
  'Append task': 'Добавить задачу',
  'Append Task': 'Добавить задачу',
  'Append end event': 'Добавить конечное событие',
  'Append EndEvent': 'Добавить конечное событие',
  'Append gateway': 'Добавить шлюз',
  'Append Gateway': 'Добавить шлюз',
  'Append intermediate/boundary event': 'Добавить промежуточное событие',
  'Append Intermediate/Boundary Event': 'Добавить промежуточное событие',
  'Append text annotation': 'Добавить аннотацию',
  'Add text annotation': 'Добавить аннотацию',
  'Change element': 'Изменить тип',
  'Change type': 'Изменить тип',
  'Delete': 'Удалить',
  'Connect using sequence/message flow or association': 'Соединить потоком или ассоциацией',
  'Connect using Sequence/MessageFlow or Association': 'Соединить потоком или ассоциацией',
  'Connect using association': 'Соединить ассоциацией',
  'Connect using DataInputAssociation': 'Соединить ассоциацией данных',
  'Add lane above': 'Добавить дорожку сверху',
  'Add Lane above': 'Добавить дорожку сверху',
  'Add lane below': 'Добавить дорожку снизу',
  'Add Lane below': 'Добавить дорожку снизу',
  'Divide into two lanes': 'Разделить на две дорожки',
  'Divide into three lanes': 'Разделить на три дорожки',
  'Search in diagram': 'Поиск по схеме',
};

export function ruTranslate(template: string, replacements?: Record<string, string>) {
  const text = RU[template] ?? template;
  return text.replace(/{([^}]+)}/g, (_, key) => replacements?.[key] ?? `{${key}}`);
}

/** Модуль для bpmn-js: additionalModules: [translateModule]. */
export const translateModule = { translate: ['value', ruTranslate] };
