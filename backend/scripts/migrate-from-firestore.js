/**
 * Script de migración de Firestore a PostgreSQL
 * 
 * Usa el SDK web de Firebase (no Admin) para evitar problemas con tokens heredados.
 * Se autentica con email/password del usuario master.
 * 
 * USO:
 * 1. Configura las variables de entorno en .env
 * 2. Ejecuta: node scripts/migrate-from-firestore.js
 * 
 * PRERREQUISITOS:
 * - pnpm add firebase
 * - Base de datos PostgreSQL creada y esquema migrado (npx prisma db push)
 */

import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { writeFileSync } from 'fs';

const prisma = new PrismaClient();

// =============================================
// CONFIGURACIÓN DE FIREBASE
// =============================================

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID || 'batey-creativo-store',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Credenciales del usuario master para autenticación
const MASTER_EMAIL = process.env.FIREBASE_MASTER_EMAIL || 'jdvictorino@hotmail.com';
const MASTER_PASSWORD = process.env.FIREBASE_MASTER_PASSWORD;

// ID del documento base en Firestore
const APP_ID = 'default-pos-app-custom';

// Credenciales para el nuevo admin en PostgreSQL
const NEW_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';

// =============================================
// INICIALIZACIÓN
// =============================================

let firestoreDb;
let firebaseAuth;
let currentUserId;

async function initFirebase() {
  if (!MASTER_PASSWORD) {
    console.error('❌ Falta FIREBASE_MASTER_PASSWORD en .env');
    console.log('   Agrega: FIREBASE_MASTER_PASSWORD="tu-contraseña"');
    process.exit(1);
  }

  console.log('🔥 Conectando a Firebase...');
  
  const app = initializeApp(firebaseConfig);
  firebaseAuth = getAuth(app);
  firestoreDb = getFirestore(app);

  try {
    const userCredential = await signInWithEmailAndPassword(
      firebaseAuth, 
      MASTER_EMAIL, 
      MASTER_PASSWORD
    );
    currentUserId = userCredential.user.uid;
    console.log(`✅ Autenticado como: ${MASTER_EMAIL}`);
    console.log(`   UID: ${currentUserId}`);
  } catch (error) {
    console.error('❌ Error de autenticación:', error.message);
    if (error.code === 'auth/wrong-password') {
      console.log('   Verifica FIREBASE_MASTER_PASSWORD en .env');
    }
    process.exit(1);
  }
}

// =============================================
// FUNCIONES DE LECTURA DE FIRESTORE
// =============================================

async function getFirestoreCollection(collectionName) {
  try {
    const colRef = collection(firestoreDb, `artifacts/${APP_ID}/users/${currentUserId}/${collectionName}`);
    const snapshot = await getDocs(colRef);
    
    const docs = [];
    snapshot.forEach(doc => {
      docs.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`  📦 ${collectionName}: ${docs.length} documentos`);
    return docs;
  } catch (error) {
    console.error(`  ⚠️ Error obteniendo ${collectionName}:`, error.message);
    return [];
  }
}

async function getCompanyProfile() {
  try {
    // Intentar obtener perfil de empresa
    const profileRef = doc(firestoreDb, `artifacts/${APP_ID}/users/${currentUserId}/settings/company`);
    const profileSnap = await getDoc(profileRef);
    
    if (profileSnap.exists()) {
      return profileSnap.data();
    }
    
    // Alternativa: buscar en otra ubicación
    const altRef = doc(firestoreDb, `artifacts/${APP_ID}/company/profile`);
    const altSnap = await getDoc(altRef);
    
    return altSnap.exists() ? altSnap.data() : {};
  } catch (error) {
    console.log('  ⚠️ No se encontró perfil de empresa, usando valores por defecto');
    return {};
  }
}

function convertTimestamp(firestoreTimestamp) {
  if (!firestoreTimestamp) return new Date();
  if (firestoreTimestamp.seconds) {
    return new Date(firestoreTimestamp.seconds * 1000);
  }
  if (firestoreTimestamp.toDate && typeof firestoreTimestamp.toDate === 'function') {
    return firestoreTimestamp.toDate();
  }
  if (firestoreTimestamp instanceof Date) {
    return firestoreTimestamp;
  }
  return new Date(firestoreTimestamp);
}

// =============================================
// FUNCIONES DE MIGRACIÓN
// =============================================

async function migrateCompanyAndAdmin(companyData) {
  console.log('\n🏢 Creando empresa y admin...');
  
  const company = await prisma.company.create({
    data: {
      name: companyData?.companyName || companyData?.name || 'Mi Empresa',
      rnc: companyData?.rnc || null,
      address: companyData?.address || null,
      phone: companyData?.phone || null,
      email: companyData?.email || MASTER_EMAIL,
      logoUrl: companyData?.logoUrl || companyData?.logo || null,
      currency: companyData?.currency || 'DOP',
      ncfB01Prefix: companyData?.ncf?.b01_prefix || null,
      ncfB01SequenceNext: companyData?.ncf?.b01_sequence_next || 1,
      ncfB02Prefix: companyData?.ncf?.b02_prefix || null,
      ncfB02SequenceNext: companyData?.ncf?.b02_sequence_next || 1,
      settings: companyData?.settings || {},
      notifications: companyData?.notifications || {}
    }
  });

  console.log(`  ✅ Empresa: ${company.name} (ID: ${company.id})`);

  const adminUser = await prisma.user.create({
    data: {
      companyId: company.id,
      email: MASTER_EMAIL,
      passwordHash: await bcrypt.hash(NEW_ADMIN_PASSWORD, 12),
      firstName: companyData?.adminProfile?.firstName || 'Admin',
      lastName: companyData?.adminProfile?.lastName || 'Principal',
      phone: companyData?.phone || null,
      role: 'admin',
      isAdmin: true,
      status: 'active',
      emailVerified: true
    }
  });

  console.log(`  ✅ Admin: ${adminUser.email}`);

  return { company, adminUser };
}

async function migrateCategories(companyId, categories) {
  console.log('\n📁 Migrando categorías...');
  const categoryMap = new Map();

  for (const cat of categories) {
    try {
      const created = await prisma.productCategory.create({
        data: {
          companyId,
          name: cat.name || 'Sin nombre',
          description: cat.description || null,
          status: cat.status || 'active'
        }
      });
      categoryMap.set(cat.id, created.id);
    } catch (error) {
      console.error(`  ⚠️ Error en categoría ${cat.name}:`, error.message);
    }
  }

  console.log(`  ✅ ${categoryMap.size} categorías migradas`);
  return categoryMap;
}

async function migrateSuppliers(companyId, suppliers) {
  console.log('\n🏭 Migrando proveedores...');
  const supplierMap = new Map();

  for (const sup of suppliers) {
    try {
      const created = await prisma.supplier.create({
        data: {
          companyId,
          name: sup.name || 'Sin nombre',
          rnc: sup.rnc || sup.rncCedula || null,
          contactName: sup.contactName || sup.contact || null,
          phone: sup.phone || null,
          email: sup.email || null,
          address: sup.address || null,
          status: sup.status || 'active'
        }
      });
      supplierMap.set(sup.id, created.id);
    } catch (error) {
      console.error(`  ⚠️ Error en proveedor ${sup.name}:`, error.message);
    }
  }

  console.log(`  ✅ ${supplierMap.size} proveedores migrados`);
  return supplierMap;
}

async function migrateCustomers(companyId, customers) {
  console.log('\n👥 Migrando clientes...');
  const customerMap = new Map();

  for (const cust of customers) {
    try {
      const created = await prisma.customer.create({
        data: {
          companyId,
          customerCode: cust.customerCode || `CLI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: cust.name || 'Sin nombre',
          rnc: cust.rnc || cust.rncCedula || null,
          email: cust.email || null,
          phone: cust.phone || null,
          address: cust.address || null,
          category: cust.category || null,
          creditLimit: cust.creditLimit || 0,
          balance: cust.balance || 0,
          status: cust.status || 'active'
        }
      });
      customerMap.set(cust.id, created.id);
    } catch (error) {
      console.error(`  ⚠️ Error en cliente ${cust.name}:`, error.message);
    }
  }

  console.log(`  ✅ ${customerMap.size} clientes migrados`);
  return customerMap;
}

async function migrateProducts(companyId, products, categoryMap, supplierMap) {
  console.log('\n📦 Migrando productos...');
  const productMap = new Map();

  for (const prod of products) {
    try {
      const created = await prisma.product.create({
        data: {
          companyId,
          categoryId: prod.categoryId ? categoryMap.get(prod.categoryId) : null,
          supplierId: prod.supplierId ? supplierMap.get(prod.supplierId) : null,
          name: prod.name || 'Sin nombre',
          description: prod.description || null,
          code: prod.code || prod.barcode || null,
          barcode: prod.barcode || prod.code || null,
          sku: prod.sku || null,
          costPrice: prod.costPrice || prod.PrecioCompra || 0,
          salePrice: prod.salePrice || prod.PrecioVenta || 0,
          wholesalePrice: prod.wholesalePrice || null,
          stock: prod.stock || 0,
          minStock: prod.minStock || 0,
          maxStock: prod.maxStock || null,
          unit: prod.unit || 'unidad',
          taxRate: prod.taxRate || 18,
          isTaxable: prod.isTaxable !== false,
          status: prod.status || 'active',
          imageUrl: prod.imageUrl || prod.image || null
        }
      });
      productMap.set(prod.id, created.id);
    } catch (error) {
      console.error(`  ⚠️ Error en producto ${prod.name}:`, error.message);
    }
  }

  console.log(`  ✅ ${productMap.size} productos migrados`);
  return productMap;
}

async function migrateInvoices(companyId, userId, invoices, customerMap, productMap) {
  console.log('\n🧾 Migrando facturas...');
  let migrated = 0;

  for (const inv of invoices) {
    try {
      const invoice = await prisma.invoice.create({
        data: {
          companyId,
          userId,
          customerId: inv.customerId ? customerMap.get(inv.customerId) : null,
          orderNumber: inv.orderNumber || `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          invoiceNumber: inv.invoiceNumber || null,
          ncfNumber: inv.ncf?.number || inv.ncfNumber || null,
          ncfType: inv.ncf?.type || inv.ncfType || null,
          subtotal: inv.subtotal || 0,
          taxAmount: inv.taxAmount || inv.itbis || 0,
          discountAmount: inv.discountAmount || inv.discount || 0,
          total: inv.total || 0,
          status: inv.status || 'Completado',
          isBilled: inv.isBilled || false,
          billedDate: inv.billedDate ? convertTimestamp(inv.billedDate) : null,
          paymentMethod: inv.paymentMethod || null,
          amountPaid: inv.amountPaid || inv.total || 0,
          changeAmount: inv.changeAmount || 0,
          deliveryType: inv.deliveryType || null,
          customerRnc: inv.ncf?.customerRnc || inv.customerRnc || null,
          customerName: inv.customerName || null,
          notes: inv.notes || null,
          emitterInfo: inv.emitterInfo || null,
          date: inv.date ? convertTimestamp(inv.date) : new Date()
        }
      });

      // Migrar items de la factura
      const items = inv.items || inv.cart || [];
      for (const item of items) {
        try {
          await prisma.invoiceItem.create({
            data: {
              invoiceId: invoice.id,
              productId: item.productId ? productMap.get(item.productId) : null,
              productName: item.name || item.productName || 'Producto',
              quantity: item.quantity || 1,
              unitPrice: item.price || item.unitPrice || 0,
              discountPercent: item.discountPercent || item.discount || 0,
              taxRate: item.taxRate || 18,
              subtotal: item.subtotal || ((item.quantity || 1) * (item.price || item.unitPrice || 0))
            }
          });
        } catch (itemError) {
          // Ignorar errores de items individuales
        }
      }

      migrated++;
    } catch (error) {
      console.error(`  ⚠️ Error en factura ${inv.orderNumber}:`, error.message);
    }
  }

  console.log(`  ✅ ${migrated} facturas migradas`);
}

async function migrateExpenses(companyId, userId, expenses, supplierMap) {
  console.log('\n💰 Migrando gastos...');
  let migrated = 0;

  for (const exp of expenses) {
    try {
      await prisma.expense.create({
        data: {
          companyId,
          userId,
          supplierId: exp.supplierId ? supplierMap.get(exp.supplierId) : null,
          rncCedula: exp.rncCedula || null,
          supplierName: exp.supplierName || null,
          ncf: exp.ncf || null,
          invoiceDate: convertTimestamp(exp.invoiceDate || exp.date),
          paymentDate: exp.paymentDate ? convertTimestamp(exp.paymentDate) : null,
          montoFacturado: exp.montoFacturado || exp.amount || 0,
          itbisFacturado: exp.itbisFacturado || exp.tax || 0,
          paymentType: exp.paymentType || null,
          expenseType: exp.expenseType || exp.type || null,
          description: exp.description || null
        }
      });
      migrated++;
    } catch (error) {
      console.error(`  ⚠️ Error en gasto:`, error.message);
    }
  }

  console.log(`  ✅ ${migrated} gastos migrados`);
}

async function migrateTeamUsers(companyId, teamUsers) {
  console.log('\n👤 Migrando usuarios del equipo...');
  let migrated = 0;
  const credentials = [];

  for (const user of teamUsers) {
    // Saltar el usuario master (ya creado como admin)
    if (user.email === MASTER_EMAIL) continue;
    
    try {
      const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
      
      await prisma.user.create({
        data: {
          companyId,
          email: user.email,
          passwordHash: await bcrypt.hash(tempPassword, 12),
          firstName: user.firstName || user.name?.split(' ')[0] || null,
          lastName: user.lastName || user.name?.split(' ').slice(1).join(' ') || null,
          employeeId: user.employeeId || null,
          cargo: user.cargo || user.position || null,
          role: user.role || 'viewer',
          phone: user.phone || null,
          photoUrl: user.photoUrl || null,
          isAdmin: false,
          status: user.status || 'active'
        }
      });
      
      credentials.push({ email: user.email, tempPassword });
      migrated++;
    } catch (error) {
      if (error.code === 'P2002') {
        console.log(`    ⏭️ ${user.email} ya existe`);
      } else {
        console.error(`  ⚠️ Error en usuario ${user.email}:`, error.message);
      }
    }
  }

  if (credentials.length > 0) {
    console.log('\n  📋 Credenciales temporales:');
    credentials.forEach(c => console.log(`     ${c.email}: ${c.tempPassword}`));
  }

  console.log(`  ✅ ${migrated} usuarios migrados`);
}

// =============================================
// EJECUCIÓN PRINCIPAL
// =============================================

async function main() {
  console.log('🚀 Migración de Firestore a PostgreSQL\n');
  console.log('='.repeat(50));

  await initFirebase();

  // Obtener datos de Firestore
  console.log('\n📥 Obteniendo datos de Firestore...');
  
  const companyProfile = await getCompanyProfile();
  
  const [categories, suppliers, customers, products, invoices, expenses, teamUsers] = await Promise.all([
    getFirestoreCollection('productCategories'),
    getFirestoreCollection('suppliers'),
    getFirestoreCollection('customers'),
    getFirestoreCollection('products'),
    getFirestoreCollection('invoices'),
    getFirestoreCollection('expenses'),
    getFirestoreCollection('app_users')
  ]);

  // Resumen de datos encontrados
  console.log('\n📊 Resumen de datos encontrados:');
  console.log(`   Categorías: ${categories.length}`);
  console.log(`   Proveedores: ${suppliers.length}`);
  console.log(`   Clientes: ${customers.length}`);
  console.log(`   Productos: ${products.length}`);
  console.log(`   Facturas: ${invoices.length}`);
  console.log(`   Gastos: ${expenses.length}`);
  console.log(`   Usuarios: ${teamUsers.length}`);

  // Verificar si hay datos
  const totalDocs = categories.length + suppliers.length + customers.length + 
                    products.length + invoices.length + expenses.length;
  
  if (totalDocs === 0) {
    console.log('\n⚠️ No se encontraron datos para migrar');
    console.log('   Verifica que el APP_ID sea correcto:', APP_ID);
    return;
  }

  // Migrar a PostgreSQL
  console.log('\n' + '='.repeat(50));
  console.log('💾 Migrando a PostgreSQL...');
  console.log('='.repeat(50));

  try {
    const { company, adminUser } = await migrateCompanyAndAdmin(companyProfile);
    
    const categoryMap = await migrateCategories(company.id, categories);
    const supplierMap = await migrateSuppliers(company.id, suppliers);
    const customerMap = await migrateCustomers(company.id, customers);
    const productMap = await migrateProducts(company.id, products, categoryMap, supplierMap);
    
    await migrateInvoices(company.id, adminUser.id, invoices, customerMap, productMap);
    await migrateExpenses(company.id, adminUser.id, expenses, supplierMap);
    await migrateTeamUsers(company.id, teamUsers);

    // Guardar log de migración
    const migrationLog = {
      completedAt: new Date().toISOString(),
      firebaseUserId: currentUserId,
      postgresCompanyId: company.id,
      counts: {
        categories: categoryMap.size,
        suppliers: supplierMap.size,
        customers: customerMap.size,
        products: productMap.size,
        invoices: invoices.length,
        expenses: expenses.length
      }
    };
    writeFileSync('./migration-log.json', JSON.stringify(migrationLog, null, 2));

    console.log('\n' + '='.repeat(50));
    console.log('🎉 ¡Migración completada exitosamente!');
    console.log('='.repeat(50));
    console.log(`\n📋 Credenciales del admin:`);
    console.log(`   Email: ${MASTER_EMAIL}`);
    console.log(`   Password: ${NEW_ADMIN_PASSWORD}`);
    console.log(`\n💡 Siguiente paso: pnpm run dev`);

  } catch (error) {
    console.error('\n❌ Error durante la migración:', error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
