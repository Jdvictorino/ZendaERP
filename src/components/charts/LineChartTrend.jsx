import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Card, { CardBody } from '../ui/Card.jsx';

const LineChartTrend = ({ data, title, dataKey = 'value', xAxisKey = 'label', height = 300, currency = 'USD' }) => {
    return (
        <Card>
            <CardBody>
                <h3 className="text-base font-semibold text-ink mb-4">{title}</h3>
                <ResponsiveContainer width="100%" height={height}>
                    <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
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
                                const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
                                return [`${numValue.toFixed(2)} ${currency}`, 'Monto'];
                            }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey={dataKey} stroke="#4f46e5" strokeWidth={2} dot={{ fill: "#4f46e5", r: 3 }} activeDot={{ r: 6 }} />
                    </LineChart>
                </ResponsiveContainer>
            </CardBody>
        </Card>
    );
};

export default LineChartTrend;
