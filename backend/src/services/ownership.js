// Evita que un ID de otra empresa se cuele en un registro propio.
const MODELS = { customerId: 'customer', categoryId: 'productCategory', supplierId: 'supplier', driverId: 'user' };

export async function assertSameCompany(tx, companyId, ids) {
  for (const [key, model] of Object.entries(MODELS)) {
    const id = ids[key];
    if (!id) continue;
    if (!(await tx[model].count({ where: { id, companyId } }))) {
      throw Object.assign(new Error('Registro no encontrado'), { status: 400 });
    }
  }
}
