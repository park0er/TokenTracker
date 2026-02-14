import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, RefreshCw } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const PricingTable = () => {
    const { t } = useLanguage();
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState('');

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/config/pricing');
            setConfig(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setStatus('saving');
        try {
            await axios.post('/api/config/pricing', config);
            setStatus('saved');
            setTimeout(() => setStatus(''), 2000);
        } catch (err) {
            console.error(err);
            setStatus('error');
        } finally {
            setSaving(false);
        }
    };

    const handlePriceChange = (model, type, value) => {
        setConfig(prev => ({
            ...prev,
            [model]: {
                ...prev[model],
                [type]: parseFloat(value) || 0
            }
        }));
    };

    const handleCurrencyChange = (model, value) => {
        setConfig(prev => ({
            ...prev,
            [model]: {
                ...prev[model],
                currency: value
            }
        }));
    };

    const handleExchangeRateChange = (value) => {
        setConfig(prev => ({
            ...prev,
            settings: {
                ...prev.settings,
                exchange_rate: parseFloat(value) || 7.0
            }
        }));
    };

    if (loading || !config) return <div className="text-gray-500 text-sm p-4">Loading config...</div>;

    const models = Object.keys(config).filter(k => k !== 'settings');

    return (
        <div className="bg-[#13141F] rounded-2xl border border-white/5 shadow-xl p-6 mt-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-white mb-1">{t('pricingTable')}</h2>
                    <p className="text-xs text-gray-500">{t('source')}</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${status === 'saved' ? 'bg-green-500/20 text-green-400' : 'bg-emerald-500 text-white hover:bg-emerald-600'
                        }`}
                >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {status === 'saved' ? t('saved') : t('save')}
                </button>
            </div>

            <div className="flex items-center gap-4 mb-6 bg-white/5 p-4 rounded-xl">
                <label className="text-sm text-gray-400">{t('exchangeRate')}:</label>
                <div className="flex items-center gap-2">
                    <span className="text-white font-mono">1 USD =</span>
                    <input
                        type="number"
                        step="0.01"
                        value={config.settings?.exchange_rate || 7.0}
                        onChange={(e) => handleExchangeRateChange(e.target.value)}
                        className="bg-[#0B0C15] border border-gray-700 text-white text-sm rounded px-3 py-1 w-24 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                    <span className="text-white font-mono">CNY</span>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-500 uppercase bg-white/5">
                        <tr>
                            <th className="px-6 py-3 rounded-l-lg">{t('model')}</th>
                            <th className="px-6 py-3">{t('inputPrice')}</th>
                            <th className="px-6 py-3">{t('outputPrice')}</th>
                            <th className="px-6 py-3 rounded-r-lg">{t('currency')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {models.map((model) => (
                            <tr key={model} className="border-b border-white/5 hover:bg-white/5">
                                <td className="px-6 py-4 font-medium text-white">{model}</td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs">$</span>
                                        <input
                                            type="number"
                                            step="0.001"
                                            value={config[model].input}
                                            onChange={(e) => handlePriceChange(model, 'input', e.target.value)}
                                            className="bg-transparent border-b border-gray-700 focus:border-emerald-500 w-24 text-white text-right focus:outline-none"
                                        />
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs">$</span>
                                        <input
                                            type="number"
                                            step="0.001"
                                            value={config[model].output}
                                            onChange={(e) => handlePriceChange(model, 'output', e.target.value)}
                                            className="bg-transparent border-b border-gray-700 focus:border-emerald-500 w-24 text-white text-right focus:outline-none"
                                        />
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <select
                                        value={config[model].currency}
                                        onChange={(e) => handleCurrencyChange(model, e.target.value)}
                                        className="bg-[#0B0C15] border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value="USD">USD</option>
                                        <option value="CNY">CNY</option>
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default PricingTable;
