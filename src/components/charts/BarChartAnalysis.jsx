import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Card, { CardBody } from '../ui/Card.jsx';

const BarChartAnalysis = ({ data, title, dataKey = 'value', xAxisKey = 'label', height = 300, currency = 'USD', color = '#4f46e5' }) => {
    return (
        <Card>
            <CardBody>
                <h3 className="text-base font-semibold text-ink mb-4">{title}</h3>
                <ResponsiveContainer width="100%" height={height}>
                    <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey={xAxisKey} stroke="#64748b" style={{ fontSize: '12px' }} />
                        <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#fff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '0.5rem',
                                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                            }}
                            formatter={(value) => {
                                if (typeof value === 'number' && !isNaN(value)) {
                                    return [`${value.toFixed(2)} ${currency}`, 'Monto'];
                                }
                                if (value === null || value === undefined) {
                                    return ['N/A', 'Monto'];
                                }
                                // Si es string o cualquier otro tipo
                                return [String(value), 'Monto'];
                            }}
                        />
                        <Legend />
                        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                </ResponsiveContainer>
            </CardBody>
        </Card>
    );
};

export default BarChartAnalysis;
