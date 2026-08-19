import prisma from '../db.js';

/**
 * Servicio de backup y exportación de datos
 * Permite a los clientes exportar todos sus datos
 */
export const backupService = {
  /**
   * Exportar todos los datos de una empresa en formato JSON
   */
  async exportCompanyData(companyId) {
    const [
      company,
      users,
      products,
      categories,
      customers,
      suppliers,
      invoices,
      expenses,
      creditNotes,
      debitNotes,
      cashShifts,
      shipments,
      offers
    ] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.user.findMany({
        where: { companyId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          cargo: true,
          role: true,
          phone: true,
          status: true,
          createdAt: true
        }
      }),
      prisma.product.findMany({
        where: { companyId },
        include: { variants: true }
      }),
      prisma.productCategory.findMany({ where: { companyId } }),
      prisma.customer.findMany({ where: { companyId } }),
      prisma.supplier.findMany({ where: { companyId } }),
      prisma.invoice.findMany({
        where: { companyId },
        include: { items: true }
      }),
      prisma.expense.findMany({ where: { companyId } }),
      prisma.creditNote.findMany({ where: { companyId } }),
      prisma.debitNote.findMany({ where: { companyId } }),
      prisma.cashShift.findMany({
        where: { companyId },
        include: { movements: true }
      }),
      prisma.shipment.findMany({ where: { companyId } }),
      prisma.offer.findMany({ where: { companyId } })
    ]);

    return {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      format: 'zenda-erp-backup',
      company: {
        ...company,
        // Remover campos sensibles
        settings: undefined,
        notifications: undefined
      },
      data: {
        users,
        products,
        categories,
        customers,
        suppliers,
        invoices,
        expenses,
        creditNotes,
        debitNotes,
        cashShifts,
        shipments,
        offers
      },
      summary: {
        totalProducts: products.length,
        totalCustomers: customers.length,
        totalSuppliers: suppliers.length,
        totalInvoices: invoices.length,
        totalExpenses: expenses.length,
        totalUsers: users.length
      }
    };
  },

  /**
   * Exportar datos específicos (una o más tablas)
   */
  async exportPartial(companyId, tables) {
    const data = {};
    const validTables = [
      'products', 'categories', 'customers', 'suppliers',
      'invoices', 'expenses', 'creditNotes', 'debitNotes',
      'cashShifts', 'shipments', 'offers'
    ];

    for (const table of tables) {
      if (!validTables.includes(table)) continue;

      switch (table) {
        case 'products':
          data.products = await prisma.product.findMany({
            where: { companyId },
            include: { variants: true }
          });
          break;
        case 'categories':
          data.categories = await prisma.productCategory.findMany({ where: { companyId } });
          break;
        case 'customers':
          data.customers = await prisma.customer.findMany({ where: { companyId } });
          break;
        case 'suppliers':
          data.suppliers = await prisma.supplier.findMany({ where: { companyId } });
          break;
        case 'invoices':
          data.invoices = await prisma.invoice.findMany({
            where: { companyId },
            include: { items: true }
          });
          break;
        case 'expenses':
          data.expenses = await prisma.expense.findMany({ where: { companyId } });
          break;
        case 'creditNotes':
          data.creditNotes = await prisma.creditNote.findMany({ where: { companyId } });
          break;
        case 'debitNotes':
          data.debitNotes = await prisma.debitNote.findMany({ where: { companyId } });
          break;
        case 'cashShifts':
          data.cashShifts = await prisma.cashShift.findMany({
            where: { companyId },
            include: { movements: true }
          });
          break;
        case 'shipments':
          data.shipments = await prisma.shipment.findMany({ where: { companyId } });
          break;
        case 'offers':
          data.offers = await prisma.offer.findMany({ where: { companyId } });
          break;
      }
    }

    return {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      format: 'zenda-erp-partial-backup',
      tables: Object.keys(data),
      data
    };
  },

  /**
   * Generar SQL de respaldo (para uso técnico)
   */
  async exportToSQL(companyId) {
    const data = await this.exportCompanyData(companyId);
    let sql = `-- Zenda ERP SQL Backup\n`;
    sql += `-- Company: ${data.company.name}\n`;
    sql += `-- Exported: ${data.exportedAt}\n`;
    sql += `-- Version: ${data.version}\n\n`;

    sql += `BEGIN TRANSACTION;\n\n`;

    // Generar INSERTs para cada tabla
    const generateInserts = (tableName, records, columns) => {
      if (records.length === 0) return '';
      
      let result = `-- ${tableName}\n`;
      for (const record of records) {
        const values = columns.map(col => {
          const val = record[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          if (val instanceof Date) return `'${val.toISOString()}'`;
          if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
          return val;
        });
        result += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
      }
      return result + '\n';
    };

    // Productos
    sql += generateInserts('products', data.data.products, [
      'id', 'name', 'description', 'code', 'barcode', 'sku',
      'cost_price', 'sale_price', 'stock', 'min_stock', 'status'
    ]);

    // Clientes
    sql += generateInserts('customers', data.data.customers, [
      'id', 'customer_code', 'name', 'rnc', 'email', 'phone', 'address', 'category', 'status'
    ]);

    // Proveedores
    sql += generateInserts('suppliers', data.data.suppliers, [
      'id', 'name', 'rnc', 'contact_name', 'phone', 'email', 'address', 'status'
    ]);

    sql += `COMMIT;\n`;

    return sql;
  },

  /**
   * Generar reporte de resumen
   */
  async generateSummaryReport(companyId, dateFrom, dateTo) {
    const whereDate = {
      companyId,
      ...(dateFrom && dateTo ? {
        createdAt: {
          gte: new Date(dateFrom),
          lte: new Date(dateTo)
        }
      } : {})
    };

    const [
      totalProducts,
      activeProducts,
      totalCustomers,
      totalSuppliers,
      totalInvoices,
      invoiceStats,
      totalExpenses,
      expenseStats
    ] = await Promise.all([
      prisma.product.count({ where: { companyId } }),
      prisma.product.count({ where: { companyId, status: 'active' } }),
      prisma.customer.count({ where: { companyId } }),
      prisma.supplier.count({ where: { companyId } }),
      prisma.invoice.count({ where: whereDate }),
      prisma.invoice.aggregate({
        where: whereDate,
        _sum: { total: true, taxAmount: true },
        _avg: { total: true }
      }),
      prisma.expense.count({ where: whereDate }),
      prisma.expense.aggregate({
        where: whereDate,
        _sum: { montoFacturado: true, itbisFacturado: true }
      })
    ]);

    return {
      generatedAt: new Date().toISOString(),
      period: { from: dateFrom, to: dateTo },
      inventory: {
        totalProducts,
        activeProducts,
        inactiveProducts: totalProducts - activeProducts
      },
      customers: { total: totalCustomers },
      suppliers: { total: totalSuppliers },
      sales: {
        totalInvoices,
        totalRevenue: invoiceStats._sum.total || 0,
        totalTax: invoiceStats._sum.taxAmount || 0,
        averageTicket: invoiceStats._avg.total || 0
      },
      expenses: {
        totalExpenses,
        totalAmount: expenseStats._sum.montoFacturado || 0,
        totalItbis: expenseStats._sum.itbisFacturado || 0
      }
    };
  }
};

export default backupService;
