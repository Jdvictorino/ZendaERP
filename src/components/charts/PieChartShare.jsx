import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import Card, { CardBody } from '../ui/Card.jsx';

// Paleta categórica alineada a los tokens: brand, sky, success, warning, danger, slate, brand claro, teal
const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#64748b', '#a5b4fc', '#14b8a6'];

const PieChartShare = ({ data, title, height = 300, dataKey = 'value', nameKey = 'name' }) => {
    return (
        <Card>
            <CardBody>
                <h3 className="text-base font-semibold text-ink mb-4">{title}</h3>
                <ResponsiveContainer width="100%" height={height}>
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry) => `${entry[nameKey]} (${entry.percent?.toFixed(1)}%)`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey={dataKey}
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value.toFixed(2)}`} />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </CardBody>
        </Card>
    );
};

export default PieChartShare;
