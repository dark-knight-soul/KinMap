// Безопасная работа с localStorage для мелких настроек (язык, тема).
// При открытии файла с диска или в приватном режиме доступ может быть запрещён —
// тогда просто работаем без сохранения, приложение не должно падать.
// Важно: само древо здесь НЕ хранится — только настройки интерфейса.

const PREFIX = 'kinmap.';

export function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Хранилище недоступно — настройка проживёт до закрытия вкладки
  }
}
