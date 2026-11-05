import { useCallback, useRef, useState } from 'react';

// Окно-вопрос, которое можно «дождаться» в асинхронном коде:
//   const password = await passwordPrompt.ask({ hint });   // null — пользователь отменил
// Сам диалог рисуется по prompt.args, ответ передаётся через prompt.finish(result).
export function usePrompt<A, R>() {
  const [args, setArgs] = useState<A | null>(null);
  const resolver = useRef<((r: R | null) => void) | null>(null);

  const ask = useCallback(
    (a: A) =>
      new Promise<R | null>((resolve) => {
        resolver.current?.(null);
        resolver.current = resolve;
        setArgs(a);
      }),
    [],
  );

  const finish = useCallback((result: R | null) => {
    setArgs(null);
    const r = resolver.current;
    resolver.current = null;
    r?.(result);
  }, []);

  return { args, ask, finish };
}
