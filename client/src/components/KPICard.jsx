import React from 'react';

const KPICard = ({ title, value, icon, trend, color, subtext }) => (
    <div className="bg-[#13141F] p-6 rounded-2xl border border-white/5 shadow-lg hover:border-white/10 transition-all duration-300 group">
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl bg-${color}-500/10 group-hover:bg-${color}-500/20 transition-colors`}>
                {icon}
            </div>
            {trend && (
                <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
                    {trend}
                </span>
            )}
        </div>
        <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">{title}</h3>
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        {subtext && <p className="text-xs text-gray-500 mt-2">{subtext}</p>}
    </div>
);

export default KPICard;
