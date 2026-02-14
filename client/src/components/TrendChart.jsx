import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-gray-900/95 backdrop-blur-md border border-gray-700 p-4 rounded-xl shadow-2xl min-w-[200px]">
                <p className="text-gray-300 font-medium mb-3 border-b border-gray-700 pb-2">{data.label}</p>
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-xs uppercase">Total Tokens</span>
                        <span className="text-emerald-400 font-bold">{data.total_tokens.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-blue-400">Input</span>
                        <span className="text-gray-300">{data.input_tokens.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-orange-400">Output</span>
                        <span className="text-gray-300">{data.output_tokens.toLocaleString()}</span>
                    </div>
                    <div className="pt-2 border-t border-gray-700 mt-2 flex justify-between items-center">
                        <span className="text-gray-400 text-xs uppercase">Cost</span>
                        <span className="text-white font-mono font-bold">${data.total_cost_usd?.toFixed(4)}</span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

const TrendChart = ({ data, groupBy }) => {
    return (
        <div className="bg-[#13141F] rounded-2xl p-6 border border-white/5 shadow-xl">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    Trend Analysis
                </h2>
                <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded">
                    Showing {groupBy}ly aggregation
                </span>
            </div>
            <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#23242F" vertical={false} />
                        <XAxis
                            dataKey="label"
                            stroke="#6B7280"
                            tick={{ fontSize: 12 }}
                            tickMargin={10}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            stroke="#6B7280"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#10B981', strokeWidth: 1, strokeDasharray: '4 4' }} />
                        <Area
                            type="monotone"
                            dataKey="total_tokens"
                            stroke="#10B981"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorTokens)"
                            animationDuration={1000}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default TrendChart;
