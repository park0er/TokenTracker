import React from 'react';
import CalendarHeatmap from 'react-calendar-heatmap';
import { subYears } from 'date-fns';
import { Calendar } from 'lucide-react';
import 'react-calendar-heatmap/dist/styles.css';

const Heatmap = ({ data, getHeatmapClass }) => {
    return (
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
                        values={data}
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
    );
};

export default Heatmap;
