import React from 'react';
import { format } from 'date-fns';
import { TriangleAlert, Droplets } from 'lucide-react';
import { AlertLog as AlertLogType } from '../types';

interface AlertLogProps {
  logs: AlertLogType[];
  sensorNames: Record<number, string>;
  thresholds: { tempMin: number; tempMax: number; humidMin: number; humidMax: number };
}

export function AlertLog({ logs, sensorNames, thresholds }: AlertLogProps) {
  return (
    <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl overflow-hidden flex flex-col shadow-sm h-full min-h-[400px] lg:min-h-0">
      <div className="p-2 sm:p-3 border-b border-zinc-100 dark:border-zinc-800/50 shrink-0">
        <h2 className="text-sm sm:text-base font-medium text-zinc-900 dark:text-zinc-100">ประวัติค่าผิดปกติ</h2>
      </div>
      
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
