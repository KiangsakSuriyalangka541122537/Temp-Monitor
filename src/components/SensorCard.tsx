import React, { useState } from 'react';
import { TriangleAlert, Droplets, CheckCircle2, Activity, Pencil, Check, X } from 'lucide-react';
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
  onNameChange?: (newName: string) => void;
  thresholds: { tempMin: number; tempMax: number; humidMin: number; humidMax: number };
}

export function SensorCard({ data, sensorName, onNameChange, thresholds }: SensorCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(sensorName);

  const handleSave = () => {
    if (onNameChange && tempName.trim()) {
      onNameChange(tempName.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempName(sensorName);
    setIsEditing(false);
  };

  // ถ้ายังไม่มีข้อมูล ให้แสดงสถานะกำลังโหลด
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-40 bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl animate-pulse">
        <div className="w-24 h-4 bg-zinc-200 dark:bg-zinc-800 rounded mb-4"></div>
        <div className="w-20 h-10 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
      </div>
    );
  }

  const lastSeen = new Date(data.recorded_at).getTime();
  const isOffline = (Date.now() - lastSeen) / (1000 * 60) > 6;
  const isSensorError = data.temperature === -999 || data.humidity === -999;

  const isTempHigh = data.temperature > thresholds.tempMax;
  const isTempLow = data.temperature < thresholds.tempMin;
  const isHumidHigh = data.humidity > thresholds.humidMax;
  const isHumidLow = data.humidity < thresholds.humidMin;
  
  const isTempIssue = !isSensorError && (isTempHigh || isTempLow);
  const isHumidIssue = !isSensorError && (isHumidHigh || isHumidLow);
  const isNormal = !isTempIssue && !isHumidIssue && !isOffline && !isSensorError;

  return (
    <div
      className={cn(
        "relative flex flex-col p-1.5 sm:p-3 rounded-xl sm:rounded-3xl border transition-colors duration-300 shadow-sm",
        isOffline
          ? "bg-zinc-50 dark:bg-zinc-900/20 border-zinc-200 dark:border-zinc-800/50 grayscale"
          : isSensorError
          ? "bg-red-50/50 dark:bg-red-950/10 border-red-200 dark:border-red-900/30"
          : isTempIssue && isHumidIssue
          ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50"
          : isTempIssue
          ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50"
          : isHumidIssue
          ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50"
          : "bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
      )}
    >
      <div className="flex justify-between items-center mb-1 sm:mb-2 group">
        {isEditing ? (
          <div className="flex items-center gap-1 w-full">
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              className="bg-zinc-100 dark:bg-zinc-800 border-none rounded px-1.5 py-0.5 text-[10px] sm:text-xs w-full focus:ring-1 focus:ring-zinc-400 outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
            />
            <button onClick={handleSave} className="text-emerald-500 hover:text-emerald-600">
              <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
            <button onClick={handleCancel} className="text-red-500 hover:text-red-600">
              <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 overflow-hidden">
            <h3 className="text-zinc-500 dark:text-zinc-400 font-medium text-[9px] sm:text-[11px] truncate">
              {sensorName} 
              {isOffline && <span className="text-zinc-400 ml-1">(ออฟไลน์)</span>}
              {!isOffline && isSensorError && <span className="text-red-500 ml-1">(เซนเซอร์มีปัญหา)</span>}
            </h3>
            <button 
              onClick={() => setIsEditing(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <Pencil className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            </button>
          </div>
        )}
        
        {!isEditing && (
          <div className="flex gap-1 shrink-0">
            {isOffline && <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400 animate-pulse" />}
            {isSensorError && !isOffline && <TriangleAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500 animate-pulse" />}
            {isNormal && <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />}
            {!isOffline && !isSensorError && isTempIssue && <TriangleAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />}
            {!isOffline && !isSensorError && isHumidIssue && <Droplets className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500" />}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-1 mb-1 sm:mb-2">
        <span className={cn(
          "text-lg sm:text-3xl font-light tracking-tight",
          isOffline || isSensorError ? "text-zinc-400 text-base sm:text-xl" : isTempIssue ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"
        )}>
          {isSensorError ? "ERR" : data.temperature.toFixed(1)}
        </span>
        {!isSensorError && <span className="text-zinc-400 dark:text-zinc-500 text-sm sm:text-xl font-light">°C</span>}
      </div>

      <div className="flex items-center gap-1 text-[8px] sm:text-[11px] pt-1.5 sm:pt-3 border-t border-zinc-100 dark:border-zinc-800/50 justify-between">
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Droplets className={cn("w-2.5 h-2.5 sm:w-3.5 sm:h-3.5", isHumidIssue && !isSensorError ? "text-orange-500" : "text-zinc-400 dark:text-zinc-500")} />
          <span className={cn(
            "font-medium",
            isHumidIssue && !isSensorError ? "text-orange-600 dark:text-orange-400" : "text-zinc-600 dark:text-zinc-400"
          )}>
            {isSensorError ? "--" : data.humidity.toFixed(0)}%
          </span>
        </div>
        <span className="text-[8px] sm:text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
          {new Date(data.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
