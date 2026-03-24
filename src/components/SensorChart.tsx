import React from 'react';
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

interface SensorChartProps {
  data: SensorLog[];
  timeRange: 'realtime' | '24h' | '7d' | '30d';
  onTimeRangeChange: (range: 'realtime' | '24h' | '7d' | '30d') => void;
  theme: 'light' | 'dark';
}

export function SensorChart({ data, timeRange, onTimeRangeChange, theme }: SensorChartProps) {
  const isDark = theme === 'dark';

  // Prepare Chart.js data
  const chartData = React.useMemo(() => {
    // Sort data by time
    const sortedData = [...data].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    
    const labels = sortedData.map(log => format(new Date(log.recorded_at), 'HH:mm:ss'));
    
    return {
      labels,
      datasets: [
        {
          label: 'อุณหภูมิ (°C)',
          data: sortedData.map(log => log.temperature),
          borderColor: '#ef4444', // red-500
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
          yAxisID: 'y-temp',
        },
        {
          label: 'ความชื้น (%)',
          data: sortedData.map(log => log.humidity),
          borderColor: '#3b82f6', // blue-500
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
          yAxisID: 'y-humidity',
        }
      ]
    };
  }, [data]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
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
          maxTicksLimit: 10,
          color: isDark ? '#52525b' : '#a1a1aa',
          font: {
            size: 10
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
          }
        }
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
          }
        },
        min: 0,
        max: 100
      }
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:gap-3 lg:h-full">
      {/* Header & Controls */}
      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl sm:rounded-3xl p-2 sm:p-3 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h2 className="text-sm sm:text-base font-medium text-zinc-900 dark:text-zinc-100">แนวโน้มอุณหภูมิและความชื้นแบบ Real-time</h2>
          
          <div className="flex bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-1 shadow-inner w-full sm:w-auto overflow-x-auto no-scrollbar">
            <div className="flex min-w-max">
              {(['realtime', '24h', '7d', '30d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => onTimeRangeChange(range)}
                  className={`px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                    timeRange === range
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  {range === 'realtime' ? 'Real-time' : range === '24h' ? '24 ชั่วโมง' : range === '7d' ? '7 วัน' : '30 วัน'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chart Canvas Container */}
      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl sm:rounded-3xl p-4 sm:p-6 flex flex-col shadow-sm flex-1 lg:min-h-0">
        <div className="flex-1 w-full min-h-[300px] lg:min-h-0">
          <Line data={chartData} options={options} />
        </div>
      </div>
    </div>
  );
}
