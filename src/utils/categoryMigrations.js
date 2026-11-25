const norm = (s) => String(s ?? '').trim().toLowerCase();

// originalRows[i]: nombre al cargar/guardar por última vez (null si la fila es nueva); currentRows[i]: nombre actual.
// reassignments: [{ from, to }] de categorías eliminadas cuyos clientes se mueven (fusiones).
export function buildCategoryMigrations(originalRows, currentRows, reassignments = []) {
    const renames = [];
    currentRows.forEach((cur, i) => {
        const from = originalRows[i];
        if (from == null || norm(from) === norm(cur)) return;
        renames.push({ from, to: cur });
    });
    const origNames = new Set(renames.map((r) => norm(r.from)));
    if (renames.some((r) => origNames.has(norm(r.to)))) {
        return { entries: [], error: 'Cambia una categoría a la vez y guarda entre cada cambio' };
    }
    return { entries: [...renames, ...reassignments], error: null };
}
