import { openContextMenu } from '../../state/ui';

// Общие обработчики для людей на любой схеме (карточки, веер, «Дерево»).

/** Правая кнопка мыши и долгое нажатие пальцем — меню действий с человеком */
export function contextMenuHandlers(personId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | null = null;
  const cancel = () => {
    clearTimeout(timer);
    start = null;
  };
  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      openContextMenu({ personId, x: e.clientX, y: e.clientY });
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      start = { x: e.clientX, y: e.clientY };
      const { clientX, clientY } = e;
      timer = setTimeout(() => openContextMenu({ personId, x: clientX, y: clientY }), 550);
    },
    onPointerMove: (e: React.PointerEvent) => {
      // Палец сдвинулся — это перетаскивание схемы, а не долгое нажатие
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  };
}
