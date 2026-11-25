import { describe, it, expect } from 'vitest';
import { buildCategoryMigrations } from '../src/utils/categoryMigrations.js';

describe('buildCategoryMigrations', () => {
    it('una entrada por fila renombrada, no por tecla', () => {
        const r = buildCategoryMigrations(['General', 'VIP'], ['General', 'Oro']);
        expect(r).toEqual({ entries: [{ from: 'VIP', to: 'Oro' }], error: null });
    });
    it('rechaza nombres en blanco', () => {
        expect(buildCategoryMigrations(['A', 'B'], ['A', '  ']).error).toMatch(/necesita un nombre/);
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
    const fails = (r) => { expect(r.entries).toEqual([]); expect(r.error).toMatch(/una categoría a la vez/); };
    const loaded = ['A', 'B'];
    it('bloquea renombrar y luego fusionar sobre el nuevo nombre', () => {
        fails(buildCategoryMigrations(['B'], ['B2'], [{ from: 'A', to: 'B2' }], loaded));
    });
    it('bloquea borrar A y renombrar B a A', () => {
        fails(buildCategoryMigrations(['B'], ['A'], [], loaded));
    });
    it('bloquea renombrar B al nombre de otra categoría existente (duplicado)', () => {
        fails(buildCategoryMigrations(['A', 'B'], ['A', 'a'], [], loaded));
    });
    it('bloquea borrar una fila y agregar otra con ese nombre', () => {
        fails(buildCategoryMigrations(['B', null], ['B', 'A'], [], loaded));
    });
});
