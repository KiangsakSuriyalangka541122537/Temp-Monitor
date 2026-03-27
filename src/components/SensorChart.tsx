import React, { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { format } from 'date-fns';
import { SensorLog } from '../types';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

import { Calendar, Clock, ChevronDown, ArrowRight } from 'lucide-react';

interface SensorChartProps {
  data: SensorLog[];
  sensorNames: Record<number, string>;
  timeRange: 'realtime' | '24h' | '7d' | '30d' | 'custom';
  onTimeRangeChange: (range: 'realtime' | '24h' | '7d' | '30d' | 'custom') => void;
  customFilter: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  };
  onCustomFilterChange: (filter: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  }) => void;
  theme: 'light' | 'dark';
}

export function SensorChart({ 
  data, 
  sensorNames, 
  timeRange, 
  onTimeRangeChange, 
  customFilter,
  onCustomFilterChange,
  theme 
}: SensorChartProps) {
  const isDark = theme === 'dark';
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Prepare Chart.js data
  const chartData = useMemo(() => {
    if (data.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Sort data by time (O(N log N))
    const sortedData = [...data].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    
    // Pre-format timestamps to avoid repeated formatting (O(N))
    const formattedData = sortedData.map(log => ({
      ...log,
      formattedTime: format(new Date(log.recorded_at), 'HH:mm:ss')
    }));

    // Get unique timestamps for labels (O(N))
    const timestamps = Array.from(new Set(formattedData.map(log => log.formattedTime)));
    
    // Group data by sensor and timestamp for O(1) lookup (O(N))
    const dataMap = new Map<string, SensorLog>();
    formattedData.forEach(log => {
      dataMap.set(`${log.sensor_id}-${log.formattedTime}`, log);
    });

    // Get unique sensor IDs (O(N))
    const sensors = Array.from(new Set(sortedData.map(log => log.sensor_id)));
    
    const datasets: any[] = [];
    const colors = [
      { temp: '#ef4444', humid: '#3b82f6' }, // Sensor 1: Red, Blue
      { temp: '#f97316', humid: '#06b6d4' }, // Sensor 2: Orange, Cyan
      { temp: '#8b5cf6', humid: '#10b981' }, // Sensor 3: Violet, Emerald
      { temp: '#ec4899', humid: '#eab308' }, // Sensor 4: Pink, Yellow
    ];

    sensors.forEach((sId, index) => {
      const sensorName = sensorNames[sId] || `เซนเซอร์ ${sId}`;
      const colorSet = colors[index % colors.length];

      // Map data to the global timestamps using the map for O(1) lookup
      const tempData = new Array(timestamps.length);
      const humidData = new Array(timestamps.length);

      for (let i = 0; i < timestamps.length; i++) {
        const log = dataMap.get(`${sId}-${timestamps[i]}`);
        tempData[i] = log && log.temperature !== -999 ? log.temperature : null;
        humidData[i] = log && log.humidity !== -999 ? log.humidity : null;
      }

      datasets.push({
        label: `${sensorName} - อุณหภูมิ (°C)`,
        data: tempData,
        borderColor: colorSet.temp,
        backgroundColor: `${colorSet.temp}1a`,
        fill: false,
        tension: 0.4, // Reduced tension for better performance and look
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        yAxisID: 'y-temp',
        spanGaps: true,
      });

      datasets.push({
        label: `${sensorName} - ความชื้น (%)`,
        data: humidData,
        borderColor: colorSet.humid,
        backgroundColor: `${colorSet.humid}1a`,
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        yAxisID: 'y-humidity',
        spanGaps: true,
      });
    });
    
    return {
      labels: timestamps,
      datasets
    };
  }, [data, sensorNames]);

  // Get sensors for custom legend
  const sensorsList = useMemo(() => {
    const sIds = Array.from(new Set(data.map(log => log.sensor_id)));
    const colors = [
      { temp: '#ef4444', humid: '#3b82f6' }, // Sensor 1: Red, Blue
      { temp: '#f97316', humid: '#06b6d4' }, // Sensor 2: Orange, Cyan
      { temp: '#8b5cf6', humid: '#10b981' }, // Sensor 3: Violet, Emerald
      { temp: '#ec4899', humid: '#eab308' }, // Sensor 4: Pink, Yellow
    ];
    return sIds.map((id, index) => ({
      id,
      name: sensorNames[id] || `เซนเซอร์ ${id}`,
      colors: colors[index % colors.length]
    }));
  }, [data, sensorNames]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: !isMobile,
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 20,
          font: {
            family: 'Prompt',
            size: 11
          },
          color: isDark ? '#a1a1aa' : '#71717a'
        }
      },
      tooltip: {
        backgroundColor: isDark ? '#18181b' : '#ffffff',
        titleColor: isDark ? '#f4f4f5' : '#18181b',
        bodyColor: isDark ? '#a1a1aa' : '#71717a',
        borderColor: isDark ? '#3f3f46' : '#e4e4e7',
        borderWidth: 1,
        padding: 12,
        boxPadding: 6,
        usePointStyle: true,
        titleFont: {
          family: 'Prompt',
          size: 13,
          weight: 'bold'
        },
        bodyFont: {
          family: 'Prompt',
          size: 12
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          autoSkipPadding: 15,
          maxTicksLimit: isMobile ? 5 : 10,
          color: isDark ? '#52525b' : '#a1a1aa',
          font: {
            size: isMobile ? 8 : 10
          }
        }
      },
      'y-temp': {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'อุณหภูมิ (°C)',
          color: '#ef4444',
          font: {
            family: 'Prompt',
            size: 11,
            weight: 'bold'
          }
        },
        grid: {
          color: isDark ? 'rgba(63, 63, 70, 0.3)' : 'rgba(228, 228, 231, 0.5)',
        },
        ticks: {
          color: isDark ? '#52525b' : '#a1a1aa',
          font: {
            size: 10
          },
          stepSize: 5
        },
        min: 15,
        max: isMobile ? 38 : 42
      },
      'y-humidity': {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'ความชื้น (%)',
          color: '#3b82f6',
          font: {
            family: 'Prompt',
            size: 11,
            weight: 'bold'
          }
        },
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: isDark ? '#52525b' : '#a1a1aa',
          font: {
            size: 10
          },
          stepSize: 20
        },
        min: 0,
        max: isMobile ? 120 : 150
      }
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:gap-3 lg:h-full">
      {/* Header & Controls */}
      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl sm:rounded-3xl p-1.5 sm:p-3 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3">
          <h2 className="text-sm sm:text-base font-medium text-zinc-900 dark:text-zinc-100">แนวโน้มอุณหภูมิและความชื้นแบบ Real-time</h2>
          
          <div className="flex bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-1 shadow-inner w-full sm:w-auto overflow-x-auto no-scrollbar">
            <div className="flex min-w-max">
              {(['realtime', '24h', '7d', '30d', 'custom'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => onTimeRangeChange(range)}
                  className={`px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs font-medium rounded-xl transition-all duration-200 whitespace-nowrap ${
                    timeRange === range
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  {range === 'realtime' ? 'Real-time' : range === '24h' ? '24 ชั่วโมง' : range === '7d' ? '7 วัน' : range === '30d' ? '30 วัน' : 'กำหนดเอง'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Filter UI */}
        {timeRange === 'custom' && (
          <div className="flex flex-col sm:flex-row gap-4 mt-4 p-4 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border border-zinc-100 dark:border-zinc-800/50 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Date Range Group */}
            <div className="flex-1 flex flex-col gap-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 dark:text-zinc-500 flex items-center gap-2 px-2">
                <Calendar className="w-3.5 h-3.5" /> ช่วงวันที่
              </label>
              <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-1.5 shadow-sm focus-within:ring-4 focus-within:ring-zinc-500/10 transition-all duration-300">
                <input
                  type="date"
                  value={customFilter.startDate}
                  onChange={(e) => onCustomFilterChange({ ...customFilter, startDate: e.target.value })}
                  className="flex-1 bg-transparent border-none px-3 py-2 text-xs sm:text-sm focus:outline-none dark:color-scheme-dark cute-input rounded-full"
                />
                <div className="w-8 h-8 flex items-center justify-center bg-zinc-50 dark:bg-zinc-800 rounded-full shrink-0">
                  <ArrowRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                </div>
                <input
                  type="date"
                  value={customFilter.endDate}
                  onChange={(e) => onCustomFilterChange({ ...customFilter, endDate: e.target.value })}
                  className="flex-1 bg-transparent border-none px-3 py-2 text-xs sm:text-sm focus:outline-none dark:color-scheme-dark cute-input rounded-full"
                />
              </div>
            </div>

            {/* Time Range Group */}
            <div className="flex-1 flex flex-col gap-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 dark:text-zinc-500 flex items-center gap-2 px-2">
                <Clock className="w-3.5 h-3.5" /> ช่วงเวลา
              </label>
              <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-1.5 shadow-sm focus-within:ring-4 focus-within:ring-zinc-500/10 transition-all duration-300">
                <input
                  type="time"
                  value={customFilter.startTime}
                  onChange={(e) => onCustomFilterChange({ ...customFilter, startTime: e.target.value })}
                  className="flex-1 bg-transparent border-none px-3 py-2 text-xs sm:text-sm focus:outline-none dark:color-scheme-dark cute-input rounded-full"
                />
                <div className="w-8 h-8 flex items-center justify-center bg-zinc-50 dark:bg-zinc-800 rounded-full shrink-0">
                  <ArrowRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                </div>
                <input
                  type="time"
                  value={customFilter.endTime}
                  onChange={(e) => onCustomFilterChange({ ...customFilter, endTime: e.target.value })}
                  className="flex-1 bg-transparent border-none px-3 py-2 text-xs sm:text-sm focus:outline-none dark:color-scheme-dark cute-input rounded-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart Canvas Container */}
      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl sm:rounded-3xl flex flex-col shadow-sm flex-1 lg:min-h-0 overflow-hidden">
        <div className="flex-1 w-full min-h-[280px] lg:min-h-0 p-2 sm:p-6">
          <Line data={chartData} options={options} />
        </div>

        {/* Custom Legend - Mobile Only */}
        <div className="sm:hidden grid grid-cols-2 gap-1.5 p-2 border-t border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/20">
          {sensorsList.map((sensor) => (
            <div key={sensor.id} className="flex flex-col gap-0.5 p-1.5 bg-white dark:bg-zinc-900/40 rounded-lg border border-zinc-100 dark:border-zinc-800/50 shadow-sm">
              <span className="text-[9px] font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {sensor.name}
              </span>
              <div className="grid grid-cols-1 gap-0">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sensor.colors.temp }} />
                  <span className="text-[8px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">อุณหภูมิ (°C)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sensor.colors.humid }} />
                  <span className="text-[8px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">ความชื้น (%)</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
