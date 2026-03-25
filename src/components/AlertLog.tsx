import React from 'react';
import { format } from 'date-fns';
import { TriangleAlert, Droplets } from 'lucide-react';
import { AlertLog as AlertLogType } from '../types';

import { Calendar, Clock, Activity, ArrowRight } from 'lucide-react';

interface AlertLogProps {
  logs: AlertLogType[];
  sensorNames: Record<number, string>;
  thresholds: { tempMin: number; tempMax: number; humidMin: number; humidMax: number };
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
}

export function AlertLog({ 
  logs, 
  sensorNames, 
  thresholds, 
  timeRange, 
  onTimeRangeChange, 
  customFilter, 
  onCustomFilterChange 
}: AlertLogProps) {
  return (
    <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl overflow-hidden flex flex-col shadow-sm h-full min-h-[400px] lg:min-h-0">
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800/50 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-sm sm:text-base font-medium text-zinc-900 dark:text-zinc-100">ประวัติค่าผิดปกติ</h2>
        
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex bg-zinc-100 dark:bg-zinc-900/50 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 w-full sm:w-auto overflow-x-auto no-scrollbar">
            {[
              { id: 'realtime', label: 'Real-time' },
              { id: '24h', label: '24 ชม.' },
              { id: '7d', label: '7 วัน' },
              { id: '30d', label: '30 วัน' },
              { id: 'custom', label: 'กำหนดเอง' }
            ].map((range) => (
              <button
                key={range.id}
                onClick={() => onTimeRangeChange(range.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex-1 sm:flex-none ${
                  timeRange === range.id
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom Filter UI */}
      {timeRange === 'custom' && (
        <div className="flex flex-col sm:flex-row gap-4 p-4 bg-zinc-100/30 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800/50 animate-in fade-in slide-in-from-top-2 duration-300">
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
      
      <div className="overflow-auto flex-1">
        <table className="w-full text-xs sm:text-sm text-left">
          <thead className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 uppercase sticky top-0 bg-white dark:bg-zinc-900/95 backdrop-blur-sm z-10">
            <tr>
              <th className="px-4 sm:px-6 py-3 font-medium">เวลา</th>
              <th className="px-4 sm:px-6 py-3 font-medium">จุดที่วัด</th>
              <th className="px-4 sm:px-6 py-3 font-medium">ค่าที่วัดได้</th>
              <th className="px-4 sm:px-6 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-100/50">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-zinc-400 dark:text-zinc-500">
                  ไม่มีประวัติค่าผิดปกติ
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isTempIssue = log.temperature > thresholds.tempMax || log.temperature < thresholds.tempMin;
                const isHumidIssue = log.humidity > thresholds.humidMax || log.humidity < thresholds.humidMin;
                
                return (
                  <tr key={log.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      <span className="hidden sm:inline">{format(new Date(log.recorded_at), 'dd/MM/yyyy ')}</span>
                      {format(new Date(log.recorded_at), 'HH:mm')}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-zinc-900 dark:text-zinc-300 font-medium whitespace-nowrap">
                      {sensorNames[log.sensor_id] || log.sensor_name}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className={isTempIssue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-zinc-500 dark:text-zinc-500'}>
                          {log.temperature.toFixed(1)}°
                        </span>
                        <span className={isHumidIssue ? 'text-orange-600 dark:text-orange-400 font-medium' : 'text-zinc-500 dark:text-zinc-500'}>
                          {log.humidity.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1 sm:gap-2">
                        {isTempIssue && (
                          <span className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[11px] font-medium bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20">
                            <TriangleAlert className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            <span>อุณหภูมิ</span>
                          </span>
                        )}
                        {isHumidIssue && (
                          <span className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[11px] font-medium bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-500/20">
                            <Droplets className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            <span>ความชื้น</span>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
