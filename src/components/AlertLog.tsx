import React from 'react';
import { format } from 'date-fns';
import { TriangleAlert, Droplets } from 'lucide-react';
import { AlertLog as AlertLogType } from '../types';

import { Calendar, Clock, Activity, ArrowRight } from 'lucide-react';

interface AlertLogProps {
  logs: AlertLogType[];
  sensorNames: Record<number, string>;
  thresholds: { tempMin: number; tempMax: number; humidMin: number; humidMax: number };
}

export function AlertLog({ 
  logs, 
  sensorNames, 
  thresholds
}: AlertLogProps) {
  return (
    <div className="flex flex-col gap-2 sm:gap-3 h-full min-h-[400px] lg:min-h-0">
      {/* Header Card */}
      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
            <Activity className="w-4 h-4" />
          </div>
          <h2 className="text-sm sm:text-base font-medium text-zinc-900 dark:text-zinc-100">ประวัติค่าผิดปกติ</h2>
        </div>
      </div>
      
      {/* Table Card */}
      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl sm:rounded-3xl flex flex-col shadow-sm flex-1 overflow-hidden">
        <div className="overflow-auto flex-1">
          <table className="w-full text-[10px] sm:text-sm text-left table-fixed sm:table-auto">
            <thead className="text-[9px] sm:text-xs text-zinc-500 dark:text-zinc-400 uppercase sticky top-0 bg-white dark:bg-zinc-900/95 backdrop-blur-sm z-10">
              <tr>
                <th className="w-[15%] px-1 sm:px-6 py-3 font-medium">เวลา</th>
                <th className="w-[35%] px-1 sm:px-6 py-3 font-medium">จุดที่วัด</th>
                <th className="w-[25%] px-1 sm:px-6 py-3 font-medium text-center sm:text-left">ค่าที่วัด</th>
                <th className="w-[25%] px-1 sm:px-6 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
                      <td className="px-1 sm:px-6 py-2 sm:py-4 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        <span className="hidden sm:inline">{format(new Date(log.recorded_at), 'dd/MM/yyyy ')}</span>
                        {format(new Date(log.recorded_at), 'HH:mm')}
                      </td>
                      <td className="px-1 sm:px-6 py-2 sm:py-4 text-zinc-900 dark:text-zinc-300 font-medium break-words leading-tight">
                        {sensorNames[log.sensor_id] || log.sensor_name}
                      </td>
                      <td className="px-1 sm:px-6 py-2 sm:py-4 whitespace-nowrap text-center sm:text-left">
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                          <div className="flex items-center justify-center sm:justify-start gap-1">
                            <span className="sm:hidden text-[7px] text-zinc-400 font-bold uppercase">อุณหภูมิ</span>
                            <span className={isTempIssue ? 'text-red-600 dark:text-red-400 font-bold' : 'text-zinc-500 dark:text-zinc-500'}>
                              {log.temperature === -999 ? 'ERR' : `${log.temperature.toFixed(1)}°`}
                            </span>
                          </div>
                          <div className="flex items-center justify-center sm:justify-start gap-1">
                            <span className="sm:hidden text-[7px] text-zinc-400 font-bold uppercase">ความชื้น</span>
                            <span className={isHumidIssue ? 'text-orange-600 dark:text-orange-400 font-bold' : 'text-zinc-500 dark:text-zinc-500'}>
                              {log.humidity === -999 ? 'ERR' : `${log.humidity.toFixed(0)}%`}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-1 sm:px-6 py-2 sm:py-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1">
                          {log.temperature === -999 || log.humidity === -999 ? (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20 text-[7px] sm:text-[11px]">
                              <TriangleAlert className="w-2 h-2 sm:w-3 sm:h-3" />
                              <span>เซนเซอร์มีปัญหา</span>
                            </span>
                          ) : (
                            <>
                              {isTempIssue && (
                                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20 text-[7px] sm:text-[11px]">
                                  <TriangleAlert className="w-2 h-2 sm:w-3 sm:h-3" />
                                  <span>อุณหภูมิ</span>
                                </span>
                              )}
                              {isHumidIssue && (
                                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-500/20 text-[7px] sm:text-[11px]">
                                  <Droplets className="w-2 h-2 sm:w-3 sm:h-3" />
                                  <span>ความชื้น</span>
                                </span>
                              )}
                            </>
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
    </div>
  );
}
