export const getInventoryAlerts = (products = [], companyProfile = {}) => {
  const defaultThreshold = companyProfile?.inventory?.defaultThreshold ?? 3;
  const lowStock = [];
  const outOfStock = [];
  const overstocks = [];
  const locationImbalances = [];

  products.forEach((product) => {
    const stock = Number(product.stock || 0);
    const threshold = Number(product.stockThreshold ?? defaultThreshold);
    if (stock <= 0) {
      outOfStock.push(product);
    } else if (stock <= threshold) {
      lowStock.push(product);
    } else if (product.optimalStock && stock > Number(product.optimalStock)) {
      overstocks.push(product);
    }

    if (Array.isArray(product.locations) && product.locations.length > 1) {
      const max = Math.max(...product.locations.map((loc) => Number(loc.stock || 0)));
      const min = Math.min(...product.locations.map((loc) => Number(loc.stock || 0)));
      if (max - min >= threshold) {
        locationImbalances.push(product);
      }
    }
  });

  return { lowStock, outOfStock, overstocks, locationImbalances };
};

export const summarizeByLocation = (products = []) => {
  const summary = new Map();
  products.forEach((product) => {
    (product.locations || []).forEach((location) => {
      if (!location || !location.id) return;
      const entry = summary.get(location.id) || { id: location.id, name: location.name || location.id, stock: 0, items: 0 };
      entry.stock += Number(location.stock || 0);
      entry.items += 1;
      summary.set(location.id, entry);
    });
  });
  return Array.from(summary.values()).sort((a, b) => b.stock - a.stock);
};
