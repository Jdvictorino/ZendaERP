export const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: currency,
    }).format(amount || 0);
};