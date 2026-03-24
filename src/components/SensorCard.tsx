import React from 'react';
import { TriangleAlert, Droplets, CheckCircle2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SensorLog } from '../types';

// ฟังก์ชันสำหรับรวม Tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SensorCardProps {
  data: SensorLog | null;
  sensorName: string;
}

export function SensorCard({ data, sensorName }: SensorCardProps) {
  // ถ้ายังไม่มีข้อมูล ให้แสดงสถานะกำลังโหลด
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-40 bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl animate-pulse">
        <div className="w-24 h-4 bg-zinc-200 dark:bg-zinc-800 rounded mb-4"></div>
        <div className="w-20 h-10 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
      </div>
    );
  }

  const isTempHigh = data.temperature > 30;
  const isHumidHigh = data.humidity > 80;
  const isNormal = !isTempHigh && !isHumidHigh;

  return (
    <div
      className={cn(
        "relative flex flex-col p-2 sm:p-3 rounded-2xl sm:rounded-3xl border transition-colors duration-300 shadow-sm",
        isTempHigh && isHumidHigh
          ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50"
          : isTempHigh
          ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50"
          : isHumidHigh
          ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50"
          : "bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
      )}
    >
      <div className="flex justify-between items-center mb-1 sm:mb-2">
        <h3 className="text-zinc-500 dark:text-zinc-400 font-medium text-[9px] sm:text-[11px]">{sensorName}</h3>
        <div className="flex gap-1">
          {isNormal && <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />}
          {isTempHigh && <TriangleAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />}
          {isHumidHigh && <Droplets className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500" />}
        </div>
      </div>

      <div className="flex items-baseline gap-1 mb-1 sm:mb-2">
        <span className={cn(
          "text-xl sm:text-3xl font-light tracking-tight",
          isTempHigh ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"
        )}>
          {data.temperature.toFixed(1)}
        </span>
        <span className="text-zinc-400 dark:text-zinc-500 text-base sm:text-xl font-light">°C</span>
      </div>

      <div className="flex items-center gap-1.5 text-[9px] sm:text-[11px] pt-2 sm:pt-3 border-t border-zinc-100 dark:border-zinc-800/50 justify-between">
        <div className="flex items-center gap-1">
          <Droplets className={cn("w-3 h-3 sm:w-3.5 sm:h-3.5", isHumidHigh ? "text-orange-500" : "text-zinc-400 dark:text-zinc-500")} />
          <span className={cn(
            "font-medium",
            isHumidHigh ? "text-orange-600 dark:text-orange-400" : "text-zinc-600 dark:text-zinc-400"
          )}>
            {data.humidity.toFixed(0)}%
          </span>
        </div>
        <span className="text-[9px] sm:text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
          {new Date(data.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
