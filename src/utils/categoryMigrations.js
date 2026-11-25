const norm = (s) => String(s ?? '').trim().toLowerCase();
const ERR = 'Cambia una categoría a la vez y guarda entre cada cambio';

// originalRows[i]: nombre original de la fila i (null si es nueva); currentRows[i]: nombre actual.
// reassignments: [{ from, to }] de categorías eliminadas cuyos clientes se mueven (fusiones).
// loadedNames: lista inmutable cargada/guardada por última vez (incluye las filas ya eliminadas).
export function buildCategoryMigrations(originalRows, currentRows, reassignments = [], loadedNames = originalRows.filter((n) => n != null)) {
    const fail = { entries: [], error: ERR };
    const cur = currentRows.map(norm);
    if (new Set(cur).size !== cur.length) return fail;
    const loaded = new Set(loadedNames.map(norm));
    const renames = [];
    for (let i = 0; i < currentRows.length; i++) {
        const from = originalRows[i];
        if (from == null) { if (loaded.has(cur[i])) return fail; continue; } // fila nueva con nombre de una categoría ya existente
        if (norm(from) === cur[i]) continue;
        if (loaded.has(cur[i])) return fail; // fusión, rotación o nombre de una fila eliminada
        renames.push({ from, to: currentRows[i] });
    }
    const touched = new Set(renames.flatMap((r) => [norm(r.from), norm(r.to)]));
    if (reassignments.some((m) => touched.has(norm(m.from)) || touched.has(norm(m.to)))) return fail;
    return { entries: [...renames, ...reassignments], error: null };
}
