import React from 'react';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

const LiveFeed = ({ logs }) => {
    const { t } = useLanguage();
    return (
        <div className="bg-[#13141F] rounded-2xl border border-white/5 shadow-xl overflow-hidden flex flex-col h-[400px]">
            <div className="p-6 border-b border-white/5 bg-[#13141F]">
                <h2 className="text-lg font-semibold text-white">{t('liveFeed')}</h2>
            </div>
            <div className="overflow-y-auto flex-1 p-0 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                <table className="w-full text-sm text-left">
                    <tbody className="divide-y divide-white/5">
                        {logs.map((log) => (
                            <tr key={log.id} className="hover:bg-white/5 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-mono text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
                                            {format(new Date(log.timestamp), 'HH:mm')}
                                        </span>
                                        <span className="text-emerald-400 font-mono text-xs font-bold bg-emerald-400/10 px-2 py-0.5 rounded">
                                            ${log.cost_usd.toFixed(4)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center mt-1">
                                        <span className="text-gray-300 font-medium truncate max-w-[120px] text-xs">
                                            {log.session_key.includes('cron') ? t('cronTask') : t('mainSession')}
                                        </span>
                                        <div className="text-xs flex gap-2">
                                            <span className="text-blue-400">{log.input_delta}</span>
                                            <span className="text-gray-600">/</span>
                                            <span className="text-orange-400">{log.output_delta}</span>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LiveFeed;
