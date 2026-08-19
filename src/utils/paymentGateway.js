const DEFAULT_TIMEOUT = 15000;

const withTimeout = async (executor, timeout = DEFAULT_TIMEOUT) => {
  if (typeof executor !== 'function') {
    throw new Error('withTimeout requiere una función ejecutora.');
  }
  if (typeof AbortController === 'undefined') {
    return executor();
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await executor(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

export const getGatewayConfig = (companyProfile = {}) => companyProfile?.payments?.gateway || null;

export const isGatewayConfigured = (companyProfile = {}) => {
  const config = getGatewayConfig(companyProfile);
  return Boolean(config?.baseUrl && config?.provider);
};

const buildHeaders = (config) => {
  const headers = { 'Content-Type': 'application/json' };
  if (config?.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  return headers;
};

export const createPaymentIntent = async ({ companyProfile, invoice, amount, currency, customer }) => {
  const config = getGatewayConfig(companyProfile);
  if (!config) {
    throw new Error('No hay un gateway de pagos configurado.');
  }
  const payload = {
    amount,
    currency,
    reference: invoice?.id,
    orderNumber: invoice?.orderNumber || invoice?.invoiceNumber,
      metadata: {
      customerId: invoice?.customerId,
      invoiceId: invoice?.id,
      source: 'zenda-erp',
    },
    customer: {
      name: customer?.name || invoice?.customerName || 'Cliente',
      email: customer?.email || customer?.correo || '',
      phone: customer?.phone || customer?.telefono || '',
    },
    callbackUrl: config?.callbackUrl || null,
    successUrl: config?.successUrl || null,
    cancelUrl: config?.cancelUrl || null,
  };

  const request = async (signal) => {
    const response = await fetch(`${config.baseUrl}/payment-intents`, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'El gateway rechazó la solicitud.');
    }
    return response.json();
  };

  const data = await withTimeout(request, config.timeoutMs || DEFAULT_TIMEOUT);
  return {
    provider: config.provider,
    intentId: data.id || data.intentId,
    paymentUrl: data.hostedUrl || data.url || data.checkoutUrl || null,
    status: data.status || 'pending',
    raw: data,
  };
};

export const fetchPaymentIntentStatus = async ({ companyProfile, intentId }) => {
  const config = getGatewayConfig(companyProfile);
  if (!config) {
    throw new Error('No hay un gateway de pagos configurado.');
  }
  if (!intentId) {
    throw new Error('Falta el identificador del intento de pago.');
  }

  const request = async (signal) => {
    const response = await fetch(`${config.baseUrl}/payment-intents/${intentId}`, {
      method: 'GET',
      headers: buildHeaders(config),
      signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'No se pudo consultar el intento de pago.');
    }
    return response.json();
  };

  const data = await withTimeout(request, config.timeoutMs || DEFAULT_TIMEOUT);
  return {
    status: data.status || data.state || 'pending',
    raw: data,
    amountReceived: data.amountReceived || data.amount_captured || data.monto_pagado || 0,
    lastUpdate: data.updatedAt || data.lastUpdate || new Date().toISOString(),
  };
};

export const mapGatewayStatusToPaymentStatus = (status) => {
  const normalized = (status || '').toLowerCase();
  if (['succeeded', 'paid', 'captured', 'success', 'completed'].includes(normalized)) {
    return 'Pagado';
  }
  if (['requires_payment_method', 'pending', 'in_process', 'processing', 'requires_action'].includes(normalized)) {
    return 'Pagado Parcialmente';
  }
  if (['canceled', 'failed', 'voided', 'refunded'].includes(normalized)) {
    return 'Fallido';
  }
  return 'Pendiente';
};
