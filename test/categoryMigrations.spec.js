import { describe, it, expect } from 'vitest';
import { buildCategoryMigrations } from '../src/utils/categoryMigrations.js';

describe('buildCategoryMigrations', () => {
    it('una entrada por fila renombrada, no por tecla', () => {
        const r = buildCategoryMigrations(['General', 'VIP'], ['General', 'Oro']);
        expect(r).toEqual({ entries: [{ from: 'VIP', to: 'Oro' }], error: null });
    });
    it('ignora filas nuevas, sin cambios y cambios de mayúsculas/espacios', () => {
        const r = buildCategoryMigrations(['General', 'VIP', null], ['General', ' vip ', 'Nueva']);
        expect(r.entries).toEqual([]);
    });
    it('agrega las reasignaciones de categorías eliminadas', () => {
        const r = buildCategoryMigrations(['A', 'B'], ['A'], [{ from: 'B', to: 'A' }]);
        expect(r.entries).toEqual([{ from: 'B', to: 'A' }]);
    });
    it('bloquea rotaciones A->B mientras B->C', () => {
        const r = buildCategoryMigrations(['A', 'B'], ['B', 'C']);
        expect(r.entries).toEqual([]);
        expect(r.error).toMatch(/una categoría a la vez/);
    });
});
