// Las columnas de cantidad son Decimal(14,3); la API las sigue entregando como números JSON.
export const QUANTITY_FIELDS = {
  product: ['stock', 'minStock', 'maxStock'],
  productVariant: ['stock'],
  inventoryLog: ['quantity', 'previousStock', 'newStock'],
  invoiceItem: ['quantity', 'packagingFactor'],
  productPackaging: ['factor'],
};

export function resultExtension(fields) {
  const result = {};
  for (const [model, names] of Object.entries(fields)) {
    result[model] = {};
    for (const name of names) {
      result[model][name] = {
        needs: { [name]: true },
        compute: (row) => (row[name] == null ? null : Number(row[name])),
      };
    }
  }
  return { result };
}
