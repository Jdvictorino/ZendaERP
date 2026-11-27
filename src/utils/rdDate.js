// Instante (ISO) -> dd/mm/aaaa en hora de RD.
export const rdDate = (v) =>
  new Date(v).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric' });
