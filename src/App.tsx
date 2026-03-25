/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Sun, Moon, CheckCircle2, AlertTriangle, Activity } from 'lucide-react';
import { supabase } from './lib/supabase';
import { SensorCard } from './components/SensorCard';
import { SensorChart } from './components/SensorChart';
import { AlertLog } from './components/AlertLog';
import { SensorLog, AlertLog as AlertLogType } from './types';

export default function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [latestData, setLatestData] = useState<Record<number, SensorLog>>({});
  const [chartData, setChartData] = useState<SensorLog[]>([]);
  const [alertLogs, setAlertLogs] = useState<AlertLogType[]>([]);
  const [sensorNames, setSensorNames] = useState<Record<number, string>>(() => {
    const saved = localStorage.getItem('sensorNames');
    return saved ? JSON.parse(saved) : { 1: 'เซนเซอร์ 1', 2: 'เซนเซอร์ 2' };
  });

  // บันทึกชื่อเซนเซอร์ลง localStorage เมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    localStorage.setItem('sensorNames', JSON.stringify(sensorNames));
  }, [sensorNames]);

  const handleNameChange = (id: number, newName: string) => {
    setSensorNames(prev => ({ ...prev, [id]: newName }));
  };
  const [timeRange, setTimeRange] = useState<'realtime' | '24h' | '7d' | '30d'>('realtime');
  const [isConnected, setIsConnected] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // จัดการการเปลี่ยน Theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // อัพเดทเวลาปัจจุบันทุกๆ 1 วินาที
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ดึงข้อมูลและตั้งค่า Realtime Subscription
  useEffect(() => {
    // ฟังก์ชันสำหรับดึงข้อมูลเริ่มต้น
    const fetchData = async () => {
      try {
        // ดึงข้อมูลล่าสุดจากตาราง Temp-sketch_mar24a
        const { data: latest, error: latestError } = await supabase
          .from('Temp-sketch_mar24a')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);

        if (latestError) throw latestError;

        if (latest && latest.length > 0) {
          setIsConnected(true);
          const log = latest[0];
          const newLatestData: Record<number, SensorLog> = {
            1: {
              id: log.id,
              sensor_id: 1,
              sensor_name: sensorNames[1] || 'เซนเซอร์ 1',
              temperature: log.t1 || 0,
              humidity: log.h1 || 0,
              recorded_at: log.created_at
            },
            2: {
              id: log.id,
              sensor_id: 2,
              sensor_name: sensorNames[2] || 'เซนเซอร์ 2',
              temperature: log.t2 || 0,
              humidity: log.h2 || 0,
              recorded_at: log.created_at
            }
          };
          setLatestData(newLatestData);
          setLastUpdated(new Date());
        }

        // ดึงข้อมูลสำหรับกราฟ (100 รายการล่าสุด)
        const { data: history, error: historyError } = await supabase
          .from('Temp-sketch_mar24a')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (!historyError && history) {
          const mappedHistory: SensorLog[] = [];
          history.forEach((log: any) => {
            // เพิ่มข้อมูลเซนเซอร์ 1
            mappedHistory.push({
              id: log.id * 2, // สร้าง id จำลองให้ไม่ซ้ำ
              sensor_id: 1,
              sensor_name: sensorNames[1] || 'เซนเซอร์ 1',
              temperature: log.t1 || 0,
              humidity: log.h1 || 0,
              recorded_at: log.created_at
            });
            // เพิ่มข้อมูลเซนเซอร์ 2
            mappedHistory.push({
              id: log.id * 2 + 1,
              sensor_id: 2,
              sensor_name: sensorNames[2] || 'เซนเซอร์ 2',
              temperature: log.t2 || 0,
              humidity: log.h2 || 0,
              recorded_at: log.created_at
            });
          });
          setChartData(mappedHistory.reverse());
          
          // กรองข้อมูลที่ผิดปกติมาแสดงใน Alert Log
          const alerts = mappedHistory
            .filter(log => log.temperature > 30 || log.humidity > 80)
            .map(log => ({
              ...log,
              status: log.temperature > 30 && log.humidity > 80 
                ? 'both_high' 
                : log.temperature > 30 
                  ? 'temperature_high' 
                  : 'humidity_high'
            } as AlertLogType))
            .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
          setAlertLogs(alerts);
        }

      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();

    // ตั้งค่า Polling เป็น fallback (ทุกๆ 15 วินาที)
    const pollInterval = setInterval(fetchData, 15000);

    // ตั้งค่า Supabase Realtime Subscription
    const subscription = supabase
      .channel('Temp-sketch_mar24a_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Temp-sketch_mar24a' },
        (payload) => {
          const newLog = payload.new;
          
          // ข้อมูลเซนเซอร์ 1
          const log1: SensorLog = {
            id: newLog.id * 2,
            sensor_id: 1,
            sensor_name: sensorNames[1] || 'เซนเซอร์ 1',
            temperature: newLog.t1 || 0,
            humidity: newLog.h1 || 0,
            recorded_at: newLog.created_at
          };

          // ข้อมูลเซนเซอร์ 2
          const log2: SensorLog = {
            id: newLog.id * 2 + 1,
            sensor_id: 2,
            sensor_name: sensorNames[2] || 'เซนเซอร์ 2',
            temperature: newLog.t2 || 0,
            humidity: newLog.h2 || 0,
            recorded_at: newLog.created_at
          };
          
          // อัพเดทข้อมูลล่าสุด
          setLatestData({
            1: log1,
            2: log2
          });
          setLastUpdated(new Date());

          // อัพเดทข้อมูลกราฟ
          setChartData(prev => {
            const newData = [...prev, log1, log2];
            // เก็บข้อมูลไว้แค่ 200 รายการล่าสุด (100 จุดเวลา x 2 เซนเซอร์)
            if (newData.length > 200) return newData.slice(newData.length - 200);
            return newData;
          });

          // ตรวจสอบและเพิ่ม Alert ถ้าค่าผิดปกติ
          [log1, log2].forEach(log => {
            if (log.temperature > 30 || log.humidity > 80) {
              const newAlert: AlertLogType = {
                ...log,
                status: log.temperature > 30 && log.humidity > 80 
                  ? 'both_high' 
                  : log.temperature > 30 
                    ? 'temperature_high' 
                    : 'humidity_high'
              };
              setAlertLogs(prev => [newAlert, ...prev].slice(0, 50));
            }
          });
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      subscription.unsubscribe();
    };
  }, []);

  // คำนวณสถานะรวมของระบบ
  const systemStatus = useMemo(() => {
    const sensors = Object.values(latestData) as SensorLog[];
    if (sensors.length === 0) return 'loading';
    
    // ตรวจสอบว่าเซนเซอร์ออฟไลน์หรือไม่ (ไม่มีข้อมูลใหม่เกิน 5 นาที)
    const lastSeen = new Date(sensors[0].recorded_at).getTime();
    const diffMinutes = (currentTime.getTime() - lastSeen) / (1000 * 60);
    const isOffline = diffMinutes > 5;

    if (isOffline) return 'offline';
    
    const hasCritical = sensors.some(s => s.temperature > 30 && s.humidity > 80);
    const hasWarning = sensors.some(s => s.temperature > 30 || s.humidity > 80);
    
    if (hasCritical) return 'critical';
    if (hasWarning) return 'warning';
    return 'normal';
  }, [latestData, currentTime]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans selection:bg-zinc-200 dark:selection:bg-zinc-800 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-4 lg:py-6">
        
        {/* TOP NAVIGATION / HEADER */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 sm:mb-3 gap-4 sm:gap-6">
          <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-zinc-900 dark:bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm shrink-0">
              <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-white dark:text-zinc-900" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2 flex-wrap">
                Server Monitor
                {!isConnected && (
                <span className="text-[9px] sm:text-[10px] font-medium px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1 h-1 bg-zinc-400 rounded-full animate-pulse"></span>
                  Demo
                </span>
                )}
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400 mt-0.5 text-xs sm:text-sm">ระบบเฝ้าระวังอุณหภูมิและความชื้น</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-3 sm:gap-4 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl shadow-sm flex-1 sm:flex-none justify-between sm:justify-start">
              <div className="flex items-center gap-2 sm:gap-2.5 pr-3 sm:pr-4 border-r border-zinc-200 dark:border-zinc-800">
                <span className="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-zinc-600 dark:text-zinc-300 font-bold text-[10px] sm:text-sm tracking-widest">LIVE</span>
              </div>
              <div className="flex flex-col items-start sm:items-end pl-1">
                <span className="text-sm sm:text-base font-mono font-medium tracking-tight text-zinc-900 dark:text-zinc-100 leading-none">
                  {format(currentTime, 'HH:mm:ss')}
                </span>
                <span className="text-[8px] sm:text-[10px] text-zinc-500 uppercase tracking-wider mt-1 leading-none">
                  อัปเดตล่าสุด: {format(lastUpdated, 'HH:mm:ss')}
                </span>
              </div>
            </div>

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
              title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </header>

        {/* SYSTEM STATUS BANNER */}
        {systemStatus !== 'loading' && (
          <div className={`mb-2 sm:mb-3 p-2 sm:p-3 rounded-2xl sm:rounded-3xl border flex items-center gap-3 sm:gap-4 transition-colors duration-300 shadow-sm ${
            systemStatus === 'normal' 
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
              : systemStatus === 'warning'
              ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50 text-orange-800 dark:text-orange-300'
              : systemStatus === 'offline'
              ? 'bg-zinc-100 dark:bg-zinc-900/40 border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-300 animate-pulse'
              : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300'
          }`}>
            <div className={`p-1.5 sm:p-2 rounded-full shrink-0 ${
              systemStatus === 'normal' ? 'bg-emerald-100 dark:bg-emerald-900/50' :
              systemStatus === 'warning' ? 'bg-orange-100 dark:bg-orange-900/50' :
              systemStatus === 'offline' ? 'bg-zinc-200 dark:bg-zinc-800' :
              'bg-red-100 dark:bg-red-900/50'
            }`}>
              {systemStatus === 'normal' ? <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" /> : 
               systemStatus === 'offline' ? <Activity className="w-5 h-5 sm:w-6 sm:h-6 animate-spin-slow" /> :
               <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />}
            </div>
            <div>
              <h2 className="font-semibold text-sm sm:text-lg leading-tight">
                {systemStatus === 'normal' ? 'ระบบปกติ' :
                 systemStatus === 'warning' ? 'พบความผิดปกติ' :
                 systemStatus === 'offline' ? 'เซนเซอร์ขาดการเชื่อมต่อ (Offline)' :
                 'วิกฤต: พบความผิดปกติรุนแรง'}
              </h2>
              <p className="text-[10px] sm:text-sm opacity-80 mt-0.5">
                {systemStatus === 'normal' ? 'อุณหภูมิและความชื้นอยู่ในเกณฑ์มาตรฐาน' :
                 systemStatus === 'offline' ? 'ไม่ได้รับข้อมูลใหม่เกิน 5 นาที กรุณาตรวจสอบอุปกรณ์' :
                 'กรุณาตรวจสอบค่าเซ็นเซอร์ที่มีการแจ้งเตือน'}
              </p>
            </div>
          </div>
        )}

        {/* SENSOR CARDS (PRIMARY INFO) */}
        <div className={`grid gap-3 sm:gap-6 mb-2 sm:mb-3 ${
          Object.keys(latestData).length === 1 ? 'grid-cols-1' : 
          Object.keys(latestData).length === 2 ? 'grid-cols-2' :
          'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4'
        }`}>
          {(Object.entries(latestData) as [string, SensorLog][]).map(([id, data]) => (
            <div key={id}>
              <SensorCard 
                data={data} 
                sensorName={sensorNames[data.sensor_id] || data.sensor_name} 
                onNameChange={(newName) => handleNameChange(data.sensor_id, newName)}
              />
            </div>
          ))}
        </div>

        {/* MAIN CONTENT GRID (SECONDARY INFO) */}
        <div className="w-full lg:h-[600px] mb-4 sm:mb-6">
          {/* GRAPH SECTION (TRENDS) */}
          <div className="h-auto lg:h-full">
            <SensorChart 
              data={chartData} 
              timeRange={timeRange} 
              onTimeRangeChange={setTimeRange} 
              theme={theme}
            />
          </div>
        </div>

        {/* ALERT LOG (FULL WIDTH BELOW) */}
        <div className="w-full h-auto lg:h-[450px] overflow-hidden">
          <AlertLog logs={alertLogs} />
        </div>

      </div>
    </div>
  );
}
