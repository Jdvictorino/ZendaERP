import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'El correo es requerido').email('Correo electrónico inválido'),
  password: z.string().min(1, 'La contraseña es requerida').min(6, 'Mínimo 6 caracteres'),
});

export const registerSchema = z.object({
  email: z.string().min(1, 'El correo es requerido').email('Correo electrónico inválido'),
  password: z.string().min(1, 'La contraseña es requerida').min(6, 'Mínimo 6 caracteres'),
  confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  firstName: z.string().min(1, 'El nombre es requerido').min(2, 'Mínimo 2 caracteres'),
  lastName: z.string().min(1, 'El apellido es requerido').min(2, 'Mínimo 2 caracteres'),
  phone: z.string().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

export const companySchema = z.object({
  name: z.string().min(1, 'El nombre de la empresa es requerido').min(2, 'Mínimo 2 caracteres'),
  rnc: z.string().min(1, 'El RNC es requerido').regex(/^\d{9,11}$/, 'RNC debe tener 9-11 dígitos'),
  phone: z.string().min(1, 'El teléfono es requerido').regex(/^\d{10}$/, 'Teléfono debe tener 10 dígitos'),
  address: z.string().min(1, 'La dirección es requerida'),
  currency: z.enum(['DOP', 'USD'], { errorMap: () => ({ message: 'Moneda inválida' }) }),
});

export const productSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').min(2, 'Mínimo 2 caracteres'),
  sku: z.string().min(1, 'El SKU es requerido'),
  price: z.coerce.number().min(0, 'El precio debe ser mayor o igual a 0'),
  cost: z.coerce.number().min(0, 'El costo debe ser mayor o igual a 0').optional(),
  stock: z.coerce.number().int('Debe ser un número entero').min(0, 'El stock no puede ser negativo'),
  categoryId: z.string().min(1, 'La categoría es requerida'),
  description: z.string().optional(),
  barcode: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const customerSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Correo electrónico inválido').or(z.literal('')),
  phone: z.string().regex(/^\d{10}$/, 'Teléfono debe tener 10 dígitos').or(z.literal('')),
  rnc: z.string().regex(/^\d{9,11}$/, 'RNC debe tener 9-11 dígitos').or(z.literal('')),
  address: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const supplierSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Correo electrónico inválido').or(z.literal('')),
  phone: z.string().regex(/^\d{10}$/, 'Teléfono debe tener 10 dígitos').or(z.literal('')),
  rnc: z.string().regex(/^\d{9,11}$/, 'RNC debe tener 9-11 dígitos').or(z.literal('')),
  address: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const expenseSchema = z.object({
  description: z.string().min(1, 'La descripción es requerida'),
  amount: z.coerce.number().min(0.01, 'El monto debe ser mayor a 0'),
  category: z.string().min(1, 'La categoría es requerida'),
  date: z.string().min(1, 'La fecha es requerida'),
  supplierId: z.string().optional(),
  notes: z.string().optional(),
  receipt: z.string().optional(),
});

export const userSchema = z.object({
  email: z.string().min(1, 'El correo es requerido').email('Correo electrónico inválido'),
  firstName: z.string().min(1, 'El nombre es requerido').min(2, 'Mínimo 2 caracteres'),
  lastName: z.string().min(1, 'El apellido es requerido').min(2, 'Mínimo 2 caracteres'),
  role: z.enum(['admin', 'manager', 'supervisor', 'cashier', 'driver', 'accountant', 'viewer'], {
    errorMap: () => ({ message: 'Rol inválido' })
  }),
  isActive: z.boolean().optional(),
  password: z.string().min(6, 'Mínimo 6 caracteres').optional(),
}).refine(data => !data.password || data.password.length >= 6, {
  message: 'La contraseña debe tener al menos 6 caracteres',
  path: ['password'],
});

export const invoiceSchema = z.object({
  customerId: z.string().min(1, 'El cliente es requerido'),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1, 'Cantidad mínima 1'),
    unitPrice: z.number().min(0),
    discount: z.number().min(0).max(100).optional(),
  })).min(1, 'Debe agregar al menos un producto'),
  ncfType: z.enum(['01', '02', '03', '04', '11', '12', '13', '14', '15'], {
    errorMap: () => ({ message: 'Tipo de NCF inválido' })
  }),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'credit'], {
    errorMap: () => ({ message: 'Método de pago inválido' })
  }),
  notes: z.string().optional(),
});

export function validateForm(schema, data) {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { isValid: true, errors: {}, data: result.data };
  }
  
  const errors = {};
  result.error.issues.forEach(issue => {
    const path = issue.path.join('.');
    if (!errors[path]) {
      errors[path] = issue.message;
    }
  });
  
  return { isValid: false, errors, data: null };
}
