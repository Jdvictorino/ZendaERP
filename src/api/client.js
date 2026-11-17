/**
 * Cliente API para comunicación con el backend PostgreSQL
 * Reemplaza las llamadas directas a Firebase/Firestore
 */

// Al usar proxy en Vite (vite.config.js) o mismos dominios en prod, la ruta relativa es más segura contra CORS y Mixed Content.
// Si fallback absoluto es de alguna manera necesitado en un entorno sin proxy, se define acá.
export const API_URL = import.meta.env.VITE_API_URL || '/api';

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

// =============================================
// GESTIÓN DE TOKENS
// =============================================

let accessToken = localStorage.getItem('accessToken');
let refreshToken = localStorage.getItem('refreshToken');

export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) {
    localStorage.setItem('accessToken', access);
  } else {
    localStorage.removeItem('accessToken');
  }
  if (refresh) {
    localStorage.setItem('refreshToken', refresh);
  } else {
    localStorage.removeItem('refreshToken');
  }
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

export function getAccessToken() {
  return accessToken;
}

// =============================================
// FETCH WRAPPER CON AUTH
// =============================================

async function refreshAccessToken() {
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });

  if (!response.ok) {
    clearTokens();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  const data = await response.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

async function fetchWithAuth(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let response = await fetch(url, { ...options, headers });

  // Si el token expiró, intentar refrescar
  if (response.status === 401 && refreshToken) {
    try {
      const newToken = await refreshAccessToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, { ...options, headers });
    } catch (error) {
      clearTokens();
      throw error;
    }
  }

  return response;
}

async function handleResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Error en la solicitud');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// =============================================
// MÉTODOS HTTP
// =============================================

export async function get(endpoint, params = {}) {
  const url = new URL(`${API_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  const response = await fetchWithAuth(url.toString());
  return handleResponse(response);
}

export async function post(endpoint, body, options = {}) {
  const response = await fetchWithAuth(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: options.headers,
    body: JSON.stringify(body)
  });
  return handleResponse(response);
}

export async function put(endpoint, body, options = {}) {
  const response = await fetchWithAuth(`${API_URL}${endpoint}`, {
    method: 'PUT',
    headers: options.headers,
    body: JSON.stringify(body)
  });
  return handleResponse(response);
}

export async function patch(endpoint, body) {
  const response = await fetchWithAuth(`${API_URL}${endpoint}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
  return handleResponse(response);
}

export async function del(endpoint) {
  const response = await fetchWithAuth(`${API_URL}${endpoint}`, {
    method: 'DELETE'
  });
  return handleResponse(response);
}

// =============================================
// API DE AUTENTICACIÓN
// =============================================

export const auth = {
  async login(email, password) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizeEmail(email), password })
    });
    
    const data = await handleResponse(response);
    setTokens(data.accessToken, data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  },

  async register(userData) {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...userData,
        email: normalizeEmail(userData.email)
      })
    });
    
    const data = await handleResponse(response);
    setTokens(data.accessToken, data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  },

  async logout() {
    try {
      await post('/auth/logout', { refreshToken });
    } catch (e) {
      // Ignorar errores de logout
    }
    clearTokens();
  },

  approve: (pin, action) => post('/auth/approve', { pin, action }),

  async getProfile() {
    return get('/auth/me');
  },

  async updateProfile(data) {
    const result = await patch('/auth/me', data);
    if (result.user) {
      localStorage.setItem('user', JSON.stringify(result.user));
    }
    return result;
  },

  async changePassword(currentPassword, newPassword) {
    return post('/auth/change-password', { currentPassword, newPassword });
  },

  getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  isAuthenticated() {
    return !!accessToken;
  }
};

// =============================================
// APIS DE RECURSOS
// =============================================

function createResourceApi(resource) {
  return {
    list: (params) => get(`/${resource}`, params),
    get: (id) => get(`/${resource}/${id}`),
    create: (data) => post(`/${resource}`, data),
    update: (id, data) => put(`/${resource}/${id}`, data),
    delete: (id) => del(`/${resource}/${id}`)
  };
}

export const products = {
  ...createResourceApi('products'),
  adjustStock: (id, quantity, reason) => {
    const qty = Math.abs(Number(quantity));
    if (qty === 0) return Promise.reject(new Error('La cantidad debe ser mayor a 0'));
    const type = Number(quantity) >= 0 ? 'entrada' : 'salida';
    return patch(`/products/${id}/stock`, { quantity: qty, type, reason });
  },
  getInventoryLogs: (id) => get(`/products/${id}/inventory-logs`),
  bulkImport: (productsData) => post('/products/bulk-import', { products: productsData }),
  // Variantes
  getVariants: (productId) => get(`/products/${productId}/variants`),
  createVariant: (productId, data) => post(`/products/${productId}/variants`, data),
  updateVariant: (productId, variantId, data) => put(`/products/${productId}/variants/${variantId}`, data),
  deleteVariant: (productId, variantId) => del(`/products/${productId}/variants/${variantId}`)
};

export const customers = createResourceApi('customers');
export const suppliers = createResourceApi('suppliers');
export const categories = createResourceApi('categories');

export const invoices = {
  ...createResourceApi('invoices'),
  create: (data, approvalToken) => post('/invoices', data, approvalToken ? { headers: { 'X-Approval-Token': approvalToken } } : {}),
  bill: (id, ncfType, customerRnc) => post(`/invoices/${id}/bill`, { ncfType, customerRnc }),
  cancel: (id, reason) => post(`/invoices/${id}/cancel`, { reason }),
  createCreditNote: (id, data) => post(`/invoices/${id}/credit-note`, data),
  createDebitNote: (id, data) => post(`/invoices/${id}/debit-note`, data)
};

export const expenses = {
  ...createResourceApi('expenses'),
  get606Report: (year, month) => get('/expenses/report/606', { year, month })
};

export const users = {
  ...createResourceApi('users'),
  resetPassword: (id) => post(`/users/${id}/reset-password`)
};

export const shifts = {
  list: (params) => get('/shifts', params),
  getCurrent: (registerId) => get('/shifts/current', { registerId }),
  open: (openingAmount, registerId, notes, approvalToken) =>
    post('/shifts/open', { openingAmount, registerId, notes }, approvalToken ? { headers: { 'X-Approval-Token': approvalToken } } : {}),
  close: (id, closingAmount, notes, approvalToken) =>
    post(`/shifts/${id}/close`, { closingAmount, notes }, approvalToken ? { headers: { 'X-Approval-Token': approvalToken } } : {}),
  addMovement: (shiftId, type, amount, reason) => 
    post(`/shifts/${shiftId}/movement`, { type, amount, reason }),
  delete: (id) => del(`/shifts/${id}`),
  // Cierres de caja
  getClosings: (params) => get('/shifts/closings', params),
  signClosing: (id, managerName) => post(`/shifts/${id}/sign`, { managerName }),
  createDailyClose: (data) => post('/shifts/daily-close', data)
};

export const shipments = {
  ...createResourceApi('shipments'),
  updateStatus: (id, status, extras = {}) => patch(`/shipments/${id}/status`, { status, ...extras }),
  confirmDelivery: (id, code, notes, signatureUrl) => 
    post(`/shipments/${id}/confirm`, { confirmationCode: code, notes, signatureUrl }),
  assignDriver: (id, driverId) => patch(`/shipments/${id}/assign`, { driverId }),
  getPublic: (token) => get(`/shipments/public/${encodeURIComponent(token)}`),
  // Con `token` (QR) no hace falta sesión; con `invoiceId` solo vale para un usuario de la misma empresa
  confirmDeliveryPublic: ({ token, invoiceId, signature, recipientName }) =>
    post('/shipments/confirm-delivery', { token, invoiceId, signature, recipientName })
};

export const backup = {
  exportAll: () => get('/backup/export'),
  exportPartial: (entities) => post('/backup/export/partial', { entities }),
  exportSQL: () => get('/backup/export/sql'),
  getSummary: () => get('/backup/summary')
};

export const offers = {
  ...createResourceApi('offers'),
  toggle: (id) => patch(`/offers/${id}/toggle`)
};

export const settings = {
  get: () => get('/settings'),
  update: (data) => put('/settings', data),
  getNcf: () => get('/settings/ncf'),
  updateNcf: (sequences) => put('/settings/ncf', sequences)
};

export const alerts = {
  list: (params) => get('/alerts', params),
  create: (data) => post('/alerts', data),
  markAsRead: (id) => patch(`/alerts/${id}/read`),
  markAllAsRead: () => patch('/alerts/read-all'),
  delete: (id) => del(`/alerts/${id}`)
};

export const billing = {
  getStatus: () => get('/billing/status'),
};

export const email = {
  send: (data) => post('/email/send', data),
};

// Panel administrativo multiempresa (requiere API key de plataforma)
async function adminFetch(endpoint, sessionToken, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  return handleResponse(response);
}

// Consola del servidor: el token de consola vive solo en memoria y se renueva con cada respuesta.
let consoleToken = '';
async function consoleFetch(endpoint, sessionToken, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(consoleToken ? { 'X-Console-Token': consoleToken } : {}),
    },
  });
  const renewed = response.headers?.get?.('X-Console-Token');
  if (renewed) consoleToken = renewed;
  try {
    const data = await handleResponse(response);
    if (data?.consoleToken) consoleToken = data.consoleToken;
    return data;
  } catch (error) {
    if (error.status === 401 && error.data?.code === 'CONSOLE_LOCKED') consoleToken = '';
    throw error;
  }
}
const consoleJson = (body) => ({ method: 'POST', body: JSON.stringify(body) });
const qs = (params) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return q ? `?${q}` : '';
};

export const consoleApi = {
  isUnlocked: () => !!consoleToken,
  lock: () => { consoleToken = ''; },
  totpStatus: (t) => consoleFetch('/admin/console/totp/status', t),
  totpSetup: (t) => consoleFetch('/admin/console/totp/setup', t, { method: 'POST' }),
  totpConfirm: (t, code) => consoleFetch('/admin/console/totp/confirm', t, consoleJson({ code })),
  unlock: (t, code) => consoleFetch('/admin/console/unlock', t, consoleJson({ code })),
  ticket: (t) => consoleFetch('/admin/console/ticket', t, { method: 'POST' }),
  audit: (t, { kind, page } = {}) => consoleFetch(`/admin/console/audit${qs({ kind, page })}`, t),
  tables: (t) => consoleFetch('/admin/console/db/tables', t),
  table: (t, name, { search, page } = {}) =>
    consoleFetch(`/admin/console/db/tables/${encodeURIComponent(name)}${qs({ search, page })}`, t),
  query: (t, sql, confirm = false) => consoleFetch('/admin/console/db/query', t, consoleJson({ sql, confirm })),
  // API_URL puede ser relativo ('/api') o absoluto
  terminalUrl: (ticket) => {
    const base = new URL(API_URL, window.location.origin);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${base.toString().replace(/\/$/, '')}/admin/console/terminal?ticket=${encodeURIComponent(ticket)}`;
  },
};

export const platformBilling = {
  login: (email, password) =>
    adminFetch('/admin/billing/login', null, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  validateSession: (sessionToken) =>
    adminFetch('/admin/billing/session', sessionToken),

  getSummary: (sessionToken) =>
    adminFetch('/admin/billing/summary', sessionToken),

  runEnforcement: (sessionToken, payload = {}) =>
    adminFetch('/admin/billing/enforce', sessionToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listTenants: (sessionToken, params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });

    const suffix = query.toString() ? `?${query.toString()}` : '';
    return adminFetch(`/admin/billing/tenants${suffix}`, sessionToken);
  },

  updateTenantStatus: (sessionToken, companyId, payload) =>
    adminFetch(`/admin/billing/tenants/${companyId}/status`, sessionToken, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  registerPayment: (sessionToken, companyId, payload) =>
    adminFetch(`/admin/billing/tenants/${companyId}/payment`, sessionToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  issueInvoice: (sessionToken, companyId, payload) =>
    adminFetch(`/admin/billing/tenants/${companyId}/invoices`, sessionToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDocuments: (sessionToken, companyId) =>
    adminFetch(`/admin/billing/tenants/${companyId}/documents`, sessionToken),

  getEvents: (sessionToken, companyId) =>
    adminFetch(`/admin/billing/tenants/${companyId}/events`, sessionToken),

  updateOrderModes: (sessionToken, companyId, availableOrderModes) =>
    adminFetch(`/admin/billing/tenants/${companyId}/order-modes`, sessionToken, {
      method: 'PATCH',
      body: JSON.stringify({ availableOrderModes }),
    }),

  setTenantUpdates: (sessionToken, companyId, enabled) =>
    adminFetch(`/admin/billing/tenants/${companyId}/updates`, sessionToken, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),

  getUpdateRelease: (sessionToken) =>
    adminFetch('/admin/billing/updates/release', sessionToken),

  sendEmail: (sessionToken, payload) =>
    adminFetch('/admin/billing/send-email', sessionToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ─── Observability ────────────────────
  getObservabilityOverview: (sessionToken) =>
    adminFetch('/admin/observability/overview', sessionToken),

  getTenantMetrics: (sessionToken, companyId) =>
    adminFetch(`/admin/observability/tenants/${companyId}/metrics`, sessionToken),

  getTenantTraces: (sessionToken, companyId, params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return adminFetch(`/admin/observability/tenants/${companyId}/traces${suffix}`, sessionToken);
  },

  getTenantLogs: (sessionToken, companyId, params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return adminFetch(`/admin/observability/tenants/${companyId}/logs${suffix}`, sessionToken);
  },

  getGlobalTraces: (sessionToken, params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return adminFetch(`/admin/observability/traces${suffix}`, sessionToken);
  },

  getGlobalLogs: (sessionToken, params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return adminFetch(`/admin/observability/logs${suffix}`, sessionToken);
  },

  getSystemHealth: (sessionToken) =>
    adminFetch('/admin/observability/system', sessionToken),

  getRecentErrors: (sessionToken, limit = 50) =>
    adminFetch(`/admin/observability/errors?limit=${limit}`, sessionToken),

  getSlowQueries: (sessionToken, limit = 50) =>
    adminFetch(`/admin/observability/slow-queries?limit=${limit}`, sessionToken),
};

// =============================================
// FACTURACIÓN ELECTRÓNICA (e-CF)
// =============================================

const ecf = {
  // Configuración
  getConfig: () => get('/ecf/config'),
  updateConfig: (data) => put('/ecf/config', data),
  uploadCertificate: (data) => post('/ecf/upload-certificate', data),
  testConnection: () => post('/ecf/test-connection'),

  // Secuencias
  getSequences: () => get('/ecf/sequences'),
  createSequence: (data) => post('/ecf/sequences', data),
  updateSequence: (id, data) => put(`/ecf/sequences/${id}`, data),
  deleteSequence: (id) => del(`/ecf/sequences/${id}`),

  // Documentos
  getDocuments: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return get(`/ecf/documents${query ? `?${query}` : ''}`);
  },
  getDocument: (id) => get(`/ecf/documents/${id}`),

  // Operaciones
  emit: (invoiceId, tipoEcf) => post('/ecf/emit', { invoiceId, tipoEcf }),
  checkStatus: (id) => get(`/ecf/status/${id}`),
  retry: (id) => post(`/ecf/retry/${id}`),

  // Dashboard
  getDashboard: () => get('/ecf/dashboard'),
};

// =============================================
// EXPORTAR CLIENTE COMPLETO
// =============================================

const api = {
  get,
  post,
  put,
  patch,
  delete: del,
  auth,
  products,
  customers,
  suppliers,
  categories,
  invoices,
  expenses,
  users,
  shifts,
  shipments,
  backup,
  offers,
  settings,
  alerts,
  billing,
  platformBilling,
  ecf,
  email,
  setTokens,
  clearTokens,
  getAccessToken
};

export default api;
