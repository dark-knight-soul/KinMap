import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, initHistory, pushHistory, redoHistory, undoHistory } from './history';

describe('отмена и повтор', () => {
  it('отмена возвращает прошлое, повтор — вперёд', () => {
    let h = initHistory('a');
    h = pushHistory(h, 'b');
    h = pushHistory(h, 'c');
    h = undoHistory(h);
    expect(h.present).toBe('b');
    h = undoHistory(h);
    expect(h.present).toBe('a');
    h = undoHistory(h); // дальше некуда
    expect(h.present).toBe('a');
    h = redoHistory(redoHistory(h));
    expect(h.present).toBe('c');
  });

  it('новое изменение после отмены стирает «будущее»', () => {
    let h = pushHistory(pushHistory(initHistory('a'), 'b'), 'c');
    h = pushHistory(undoHistory(h), 'x');
    expect(h.future).toEqual([]);
    expect(redoHistory(h).present).toBe('x');
  });

  it('быстрые изменения одного поля — один шаг отмены', () => {
    let h = initHistory('');
    h = pushHistory(h, 'И', 'name', 1000);
    h = pushHistory(h, 'Ив', 'name', 1200);
    h = pushHistory(h, 'Иван', 'name', 1400);
    expect(undoHistory(h).present).toBe('');
  });

  it('пауза или другое поле — новый шаг', () => {
    let h = initHistory('');
    h = pushHistory(h, 'a', 'name', 1000);
    h = pushHistory(h, 'ab', 'name', 5000);
    h = pushHistory(h, 'abc', 'surname', 5100);
    expect(undoHistory(h).present).toBe('ab');
    expect(undoHistory(undoHistory(h)).present).toBe('a');
  });

  it('история ограничена', () => {
    let h = initHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = pushHistory(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
