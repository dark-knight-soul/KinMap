// Списки режимов и видов схемы — отдельно от хранилища настроек,
// чтобы их можно было использовать без браузера (разбор адреса, тесты).

export type ViewMode = 'tree' | 'list' | 'calendar' | 'timeline';
export type ChartKind = 'family' | 'ancestors' | 'descendants' | 'butterfly' | 'fan' | 'circle' | 'tree';
export const CHART_KINDS: ChartKind[] = ['family', 'ancestors', 'descendants', 'butterfly', 'fan', 'circle', 'tree'];
export const VIEW_MODES: ViewMode[] = ['tree', 'list', 'calendar', 'timeline'];
/** Виды, которые можно повернуть горизонтально */
export const ROTATABLE: ChartKind[] = ['family', 'ancestors', 'descendants'];
