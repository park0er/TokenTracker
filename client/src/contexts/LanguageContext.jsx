import React, { createContext, useState, useContext } from 'react';

const LanguageContext = createContext();

export const translations = {
    en: {
        title: "Xisheng & Rollie",
        subtitle: "Token Tracker",
        autoUpdate: "Auto-updates every 60s",
        lastUpdated: "Last updated",
        refresh: "Refresh Data",
        dateRange: "Date Range",
        groupBy: "Group By",
        day: "Day",
        week: "Week",
        month: "Month",
        year: "Year",
        totalCost: "Total Cost",
        totalTokens: "Total Tokens",
        totalInput: "Input",
        totalOutput: "Output",
        trendAnalysis: "Trend Analysis",
        showingAggregation: "Showing {period}ly aggregation",
        yearlyHeatmap: "Yearly Heatmap",
        last12Months: "Last 12 Months",
        liveFeed: "Live Feed",
        cronTask: "Cron Task",
        mainSession: "Main Session",
        cost: "Cost",
        input: "Input",
        output: "Output",
        less: "Less",
        more: "More",
        aggregatedPoints: "{count} {period}s aggregated",
        pricingTable: "Model Pricing & Configuration",
        model: "Model",
        inputPrice: "Input Price (per 1M)",
        outputPrice: "Output Price (per 1M)",
        currency: "Currency",
        exchangeRate: "Exchange Rate (USD → CNY)",
        save: "Save Configuration",
        saved: "Saved!",
        saving: "Saving...",
        source: "Source: Based on official API pricing"
    },
    zh: {
        title: "Xisheng & Rollie",
        subtitle: "Token 统计器",
        autoUpdate: "60秒自动刷新",
        lastUpdated: "最后更新",
        refresh: "刷新数据",
        dateRange: "时间范围",
        groupBy: "统计维度",
        day: "日",
        week: "周",
        month: "月",
        year: "年",
        totalCost: "总成本",
        totalTokens: "Token 总量",
        totalInput: "输入",
        totalOutput: "输出",
        trendAnalysis: "趋势分析",
        showingAggregation: "当前视图: 按{period}聚合",
        yearlyHeatmap: "全年热力图",
        last12Months: "过去 12 个月",
        liveFeed: "实时流水",
        cronTask: "后台任务",
        mainSession: "主会话",
        cost: "成本",
        input: "输入",
        output: "输出",
        less: "少",
        more: "多",
        aggregatedPoints: "聚合了 {count} 个时间点",
        pricingTable: "模型定价与配置",
        model: "模型",
        inputPrice: "输入价格 (每百万)",
        outputPrice: "输出价格 (每百万)",
        currency: "币种",
        exchangeRate: "汇率 (USD → CNY)",
        save: "保存配置",
        saved: "已保存!",
        saving: "保存中...",
        source: "来源: 基于官方 API 定价"
    }
};

export const LanguageProvider = ({ children }) => {
    const [language, setLanguage] = useState('zh'); // Default to Chinese as user requested

    const t = (key, params = {}) => {
        let str = translations[language][key] || key;
        Object.keys(params).forEach(param => {
            str = str.replace(`{${param}}`, params[param]);
        });
        return str;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => useContext(LanguageContext);
