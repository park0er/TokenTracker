import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';
import { 
  format, subDays, subMonths, subYears, isSameDay, isSameWeek, isSameMonth, isSameYear, 
  startOfWeek, startOfMonth, startOfYear, endOfWeek, endOfMonth, endOfYear, 
  isWithinInterval, parseISO 
} from 'date-fns';
import { Activity, Calendar, DollarSign, TrendingUp, Filter, RefreshCcw } from 'lucide-react';

const API_BASE = '/api';

// --- Aggregation Logic ---
const processData = (rawData, groupBy, dateRange) => {
  if (!rawData.length) return [];

  const filtered = rawData.filter(d => {
    const date = parseISO(d.date);
    return isWithinInterval(date, { start: dateRange.start, end: dateRange.end });
  });

  const grouped = {};
  
  filtered.forEach(item => {
    const date = parseISO(item.date);
    let key;
    let label;
    
    if (groupBy === 'day') {
      key = format(date, 'yyyy-MM-dd');
      label = format(date, 'MMM d');
    } else if (groupBy === 'week') {
      key = format(startOfWeek(date), 'yyyy-MM-dd');
      label = `W${format(date, 'w')} (${format(startOfWeek(date), 'MM/dd')})`;
    } else if (groupBy === 'month') {
      key = format(startOfMonth(date), 'yyyy-MM');
      label = format(date, 'MMM yyyy');
    } else if (groupBy === 'year') {
      key = format(startOfYear(date), 'yyyy');
      label = format(date, 'yyyy');
    }
    
    if (!grouped[key]) {
      grouped[key] = {
        date: key, 
        label: label, 
        total_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_cost_usd: 0
      };
    }
    
    grouped[key].total_tokens += item.total_tokens;
    grouped[key].input_tokens += item.input_tokens;
    grouped[key].output_tokens += item.output_tokens;
    grouped[key].total_cost_usd += item.total_cost_usd;
  });

  return Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));
};

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

function App() {
  const [rawData, setRawData] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [groupBy, setGroupBy] = useState('day'); 
  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date()
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, heatmapRes, logsRes] = await Promise.all([
        axios.get(`${API_BASE}/stats/daily?limit=365`),
        axios.get(`${API_BASE}/stats/heatmap`),
        axios.get(`${API_BASE}/logs?limit=50`)
      ]);
      setRawData(statsRes.data); 
      setHeatmapData(heatmapRes.data);
      setLogs(logsRes.data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const chartData = useMemo(() => processData(rawData, groupBy, dateRange), [rawData, groupBy, dateRange]);

  const summaryKPI = useMemo(() => {
    return chartData.reduce((acc, curr) => ({
      total_tokens: acc.total_tokens + curr.total_tokens,
      input_tokens: acc.input_tokens + curr.input_tokens,
      output_tokens: acc.output_tokens + curr.output_tokens,
      total_cost_usd: acc.total_cost_usd + curr.total_cost_usd,
    }), { total_tokens: 0, input_tokens: 0, output_tokens: 0, total_cost_usd: 0 });
  }, [chartData]);

  const handlePresetRange = (days) => {
    setDateRange({
      start: subDays(new Date(), days),
      end: new Date()
    });
  };

  const getHeatmapClass = (value) => {
    if (!value || value.count === 0) return 'color-empty';
    if (value.count < 10000) return 'color-scale-1';
    if (value.count < 50000) return 'color-scale-2';
    if (value.count < 100000) return 'color-scale-3';
    return 'color-scale-4';
  };

  return (
    <div className="min-h-screen bg-[#0B0C15] text-gray-100 font-sans selection:bg-emerald-500/30 pb-20">
      
      <nav className="border-b border-white/5 bg-[#0B0C15]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">Xisheng & Rollie <span className="text-emerald-400 font-light">Token Counter</span></span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Auto-updates every 60s</p>
              <p className="text-xs text-gray-400 font-mono">
                Last updated: {lastUpdated ? format(lastUpdated, 'HH:mm:ss') : '--:--:--'}
              </p>
            </div>
            <button 
              onClick={fetchData} 
              className={`p-2 rounded-full hover:bg-white/5 transition-all ${isLoading ? 'animate-spin' : ''}`}
              title="Refresh Data"
            >
              <RefreshCcw className="w-5 h-5 text-gray-400 hover:text-white" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-[#13141F] p-6 rounded-2xl border border-white/5 shadow-xl">
          
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date Range</span>
            <div className="flex items-center gap-2 flex-wrap">
              <input 
                type="date" 
                value={format(dateRange.start, 'yyyy-MM-dd')}
                onChange={(e) => setDateRange({...dateRange, start: parseISO(e.target.value)})}
                className="bg-[#0B0C15] border border-gray-700 text-gray-300 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
              />
              <span className="text-gray-500">-</span>
              <input 
                type="date" 
                value={format(dateRange.end, 'yyyy-MM-dd')}
                onChange={(e) => setDateRange({...dateRange, end: parseISO(e.target.value)})}
                className="bg-[#0B0C15] border border-gray-700 text-gray-300 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
              />
              <div className="flex gap-1 ml-2">
                {[7, 30, 90, 365].map(d => (
                  <button 
                    key={d}
                    onClick={() => handlePresetRange(d)}
                    className="px-3 py-1 text-xs rounded-md bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  >
                    Last {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Group By</span>
            <div className="flex bg-[#0B0C15] p-1 rounded-lg border border-gray-700">
              {['day', 'week', 'month', 'year'].map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 capitalize ${
                    groupBy === g 
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' 
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard 
            title="Total Cost (Selected Period)"
            value={`$${summaryKPI.total_cost_usd?.toFixed(4)}`}
            icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
            color="emerald"
            subtext={`${chartData.length} ${groupBy}s aggregated`}
          />
          <KPICard 
            title="Total Tokens"
            value={summaryKPI.total_tokens?.toLocaleString()}
            icon={<Activity className="w-5 h-5 text-blue-400" />}
            color="blue"
          />
          <KPICard 
            title="Total Input"
            value={summaryKPI.input_tokens?.toLocaleString()}
            icon={<TrendingUp className="w-5 h-5 text-violet-400" />}
            color="violet"
          />
          <KPICard 
            title="Total Output"
            value={summaryKPI.output_tokens?.toLocaleString()}
            icon={<Filter className="w-5 h-5 text-orange-400" />}
            color="orange"
          />
        </div>

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
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#23242F" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  stroke="#6B7280" 
                  tick={{fontSize: 12}} 
                  tickMargin={10}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  stroke="#6B7280" 
                  tick={{fontSize: 12}} 
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 bg-[#13141F] rounded-2xl p-6 border border-white/5 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-400" />
                Global Heatmap
              </h2>
              <span className="text-xs text-gray-500">Last 12 Months</span>
            </div>
            
            <div className="w-full overflow-x-auto pb-2">
               <div className="min-w-[700px]">
                <CalendarHeatmap
                  startDate={subYears(new Date(), 1)}
                  endDate={new Date()}
                  values={heatmapData}
                  classForValue={getHeatmapClass}
                  titleForValue={(value) => value ? `${value.date}: ${value.count.toLocaleString()}` : 'No data'}
                  showWeekdayLabels={true}
                  gutterSize={3} 
                />
              </div>
            </div>
            <div className="flex justify-end items-center gap-2 mt-4 text-xs text-gray-500">
              <span>Less</span>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={`w-3 h-3 rounded-sm bg-scale-${i}`}></div>
              ))}
              <span>More</span>
            </div>
          </div>

          <div className="bg-[#13141F] rounded-2xl border border-white/5 shadow-xl overflow-hidden flex flex-col h-[400px]">
            <div className="p-6 border-b border-white/5 bg-[#13141F]">
              <h2 className="text-lg font-semibold text-white">Live Feed</h2>
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
                            {log.session_key.includes('cron') ? 'Cron Task' : 'Main Session'}
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
        </div>
      </main>

      <style>{`
        .react-calendar-heatmap text { font-size: 10px; fill: #6B7280; }
        .react-calendar-heatmap .color-empty { fill: #1F2937; rx: 4px; }
        .react-calendar-heatmap .color-scale-1 { fill: #064E3B; rx: 4px; }
        .react-calendar-heatmap .color-scale-2 { fill: #10B981; rx: 4px; }
        .react-calendar-heatmap .color-scale-3 { fill: #34D399; rx: 4px; }
        .react-calendar-heatmap .color-scale-4 { fill: #6EE7B7; rx: 4px; }
        .bg-scale-1 { background-color: #064E3B; }
        .bg-scale-2 { background-color: #10B981; }
        .bg-scale-3 { background-color: #34D399; }
        .bg-scale-4 { background-color: #6EE7B7; }
        
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #4B5563; }
      `}</style>
    </div>
  );
}

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

export default App;
