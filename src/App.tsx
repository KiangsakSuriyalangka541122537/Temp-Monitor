/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { Sun, Moon, CheckCircle2, AlertTriangle, Activity, Settings, X, Check, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { supabase } from './lib/supabase';
import { SensorCard } from './components/SensorCard';
import { SensorChart } from './components/SensorChart';
import { AlertLog } from './components/AlertLog';
import { ReportPage } from './components/ReportPage';
import { SensorLog, AlertLog as AlertLogType } from './types';

export default function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [view, setView] = useState<'dashboard' | 'report'>('dashboard');
  const [latestData, setLatestData] = useState<Record<number, SensorLog>>({});
  const [chartData, setChartData] = useState<SensorLog[]>([]);
  const [alertLogs, setAlertLogs] = useState<AlertLogType[]>([]);
  const [sensorNames, setSensorNames] = useState<Record<number, string>>({ 1: 'เซนเซอร์ 1', 2: 'เซนเซอร์ 2' });

  // โหลดชื่อจาก LocalStorage เป็นค่าเริ่มต้นชั่วคราว
  useEffect(() => {
    const saved = localStorage.getItem('sensorNames');
    if (saved) {
      setSensorNames(JSON.parse(saved));
    }
  }, []);

  // บันทึกชื่อลง localStorage เมื่อมีการเปลี่ยนแปลง (เพื่อความเร็วในการโหลดครั้งถัดไป)
  useEffect(() => {
    localStorage.setItem('sensorNames', JSON.stringify(sensorNames));
  }, [sensorNames]);

  const handleNameChange = async (id: number, newName: string) => {
    const updatedNames = { ...sensorNames, [id]: newName };
    setSensorNames(updatedNames);
    
    // บันทึกชื่อลง LocalStorage ทันทีเป็นระบบสำรอง
    localStorage.setItem('sensorNames', JSON.stringify(updatedNames));
    
    try {
      // พยายามบันทึกลง Supabase เพื่อซิงค์ข้ามเครื่อง
      const { error } = await supabase
        .from('device_settings')
        .update({ 
          sensor_names: updatedNames,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);
        
      if (error) {
        console.warn('Supabase sync failed:', error.message);
      } else {
        // ไม่ต้องเรียก setSensorNames ที่นี่ เพราะ Realtime Subscription จะจัดการให้เอง
        // เพื่อให้มั่นใจว่าข้อมูลในทุกเครื่องตรงกับบน Cloud จริงๆ
        toast.success('บันทึกชื่อเซนเซอร์เรียบร้อยแล้ว', {
          description: `เปลี่ยนชื่อเป็น "${newName}" และซิงค์ไปยังอุปกรณ์อื่นแล้ว`,
          duration: 2000
        });
      }
    } catch (err) {
      console.error('Unexpected error during name save:', err);
    }
  };
  const [timeRange, setTimeRange] = useState<'realtime' | '24h' | '7d' | '30d' | 'custom'>('realtime');
  const [customFilter, setCustomFilter] = useState({
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    startTime: '00:00',
    endTime: '23:59'
  });
  const [isConnected, setIsConnected] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    temp_min: 18.0,
    temp_max: 30.0,
    humid_min: 30.0,
    humid_max: 80.0,
    notify_interval: 10,
    line_access_token: '',
    line_user_id: ''
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // ดึงค่าตั้งค่าจาก Supabase
  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('device_settings')
      .select('*')
      .eq('id', 1)
      .single();
    
    if (!error && data) {
      const newSettings = {
        temp_min: data.temp_min,
        temp_max: data.temp_max,
        humid_min: data.humid_min,
        humid_max: data.humid_max,
        notify_interval: data.notify_interval,
        line_access_token: data.line_access_token || '',
        line_user_id: data.line_user_id || ''
      };
      
      setSettings(prev => {
        if (JSON.stringify(newSettings) !== JSON.stringify(prev)) {
          return newSettings;
        }
        return prev;
      });

      if (data.sensor_names) {
        // Only update if different to prevent re-render loops
        setSensorNames(prev => {
          if (JSON.stringify(data.sensor_names) !== JSON.stringify(prev)) {
            return data.sensor_names;
          }
          return prev;
        });
      }
    }
  }, []);

  const saveSettings = async () => {
    setIsSavingSettings(true);
    const { error } = await supabase
      .from('device_settings')
      .update({
        temp_min: settings.temp_min,
        temp_max: settings.temp_max,
        humid_min: settings.humid_min,
        humid_max: settings.humid_max,
        notify_interval: settings.notify_interval,
        line_access_token: settings.line_access_token,
        line_user_id: settings.line_user_id,
        sensor_names: sensorNames,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);
    
    if (!error) {
      setShowSettings(false);
      toast.success('บันทึกการตั้งค่าเรียบร้อยแล้ว', {
        description: 'เกณฑ์การแจ้งเตือนและชื่อเซนเซอร์ถูกอัปเดตแล้ว',
        icon: <Check className="w-4 h-4 text-emerald-500" />,
      });
    } else {
      toast.error('เกิดข้อผิดพลาดในการบันทึก', {
        description: error.message
      });
    }
    setIsSavingSettings(false);
  };

  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const lastNotifiedRef = useRef<Record<number, number>>({});

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
  const fetchData = useCallback(async () => {
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

      // ดึงข้อมูลสำหรับกราฟและ Alert Log
      let query = supabase
        .from('Temp-sketch_mar24a')
        .select('*');

      if (timeRange === 'custom') {
        const start = new Date(`${customFilter.startDate}T${customFilter.startTime}:00`).toISOString();
        const end = new Date(`${customFilter.endDate}T${customFilter.endTime}:59`).toISOString();
        query = query.gte('created_at', start).lte('created_at', end);
      } else if (timeRange === '24h') {
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        query = query.gte('created_at', yesterday.toISOString());
      } else if (timeRange === '7d') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = query.gte('created_at', weekAgo.toISOString());
      } else if (timeRange === '30d') {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        query = query.gte('created_at', monthAgo.toISOString());
      }

      const { data: history, error: historyError } = await query
        .order('created_at', { ascending: false })
        .limit(timeRange === 'realtime' ? 100 : 1000);

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
          .filter(log => 
            log.temperature > settings.temp_max || 
            log.temperature < settings.temp_min || 
            log.humidity > settings.humid_max || 
            log.humidity < settings.humid_min
          )
          .map(log => ({
            ...log,
            status: (log.temperature > settings.temp_max || log.temperature < settings.temp_min) && 
                    (log.humidity > settings.humid_max || log.humidity < settings.humid_min)
              ? 'both_high' 
              : (log.temperature > settings.temp_max || log.temperature < settings.temp_min)
                ? 'temperature_high' 
                : 'humidity_high'
          } as AlertLogType))
          .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
        setAlertLogs(alerts);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, [timeRange, customFilter, sensorNames, settings.temp_max, settings.temp_min, settings.humid_max, settings.humid_min]);

  useEffect(() => {
    fetchSettings();
    fetchData();

    // ตั้งค่า Polling เป็น fallback (ทุกๆ 15 วินาที)
    const pollInterval = setInterval(() => {
      fetchData();
      // ดึงค่าตั้งค่าเฉพาะเมื่อไม่ได้เปิดหน้าต่างตั้งค่าอยู่ เพื่อไม่ให้ทับค่าที่กำลังพิมพ์
      if (!showSettings) {
        fetchSettings();
      }
    }, 15000);

    // ตั้งค่า Supabase Realtime Subscription สำหรับข้อมูลเซนเซอร์
    const sensorSubscription = supabase
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

          // อัพเดทข้อมูลกราฟ (เฉพาะเมื่อเป็น Real-time)
          if (timeRange === 'realtime') {
            setChartData(prev => {
              const newData = [...prev, log1, log2];
              // เก็บข้อมูลไว้แค่ 200 รายการล่าสุด (100 จุดเวลา x 2 เซนเซอร์)
              if (newData.length > 200) return newData.slice(newData.length - 200);
              return newData;
            });

            // ตรวจสอบและเพิ่ม Alert ถ้าค่าผิดปกติ
            [log1, log2].forEach(async (log) => {
              const isTempIssue = log.temperature > settings.temp_max || log.temperature < settings.temp_min;
              const isHumidIssue = log.humidity > settings.humid_max || log.humidity < settings.humid_min;

              if (isTempIssue || isHumidIssue) {
                const newAlert: AlertLogType = {
                  ...log,
                  status: isTempIssue && isHumidIssue
                    ? 'both_high' 
                    : isTempIssue
                      ? 'temperature_high' 
                      : 'humidity_high'
                };
                setAlertLogs(prev => [newAlert, ...prev].slice(0, 50));

                // ส่ง LINE Notification ถ้าตั้งค่าไว้และถึงเวลาแจ้งเตือน
                if (settings.line_access_token && settings.line_user_id) {
                  const now = Date.now();
                  const lastTime = lastNotifiedRef.current[log.sensor_id] || 0;
                  const intervalMs = (settings.notify_interval || 10) * 60 * 1000;

                  if (now - lastTime > intervalMs) {
                    lastNotifiedRef.current = { ...lastNotifiedRef.current, [log.sensor_id]: now };
                    
                    const sensorName = sensorNames[log.sensor_id] || log.sensor_name;
                    let message = `⚠️ แจ้งเตือน: ${sensorName}\n`;
                    if (isTempIssue) message += `🌡️ อุณหภูมิ: ${log.temperature.toFixed(1)}°C (ปกติ ${settings.temp_min}-${settings.temp_max})\n`;
                    if (isHumidIssue) message += `💧 ความชื้น: ${log.humidity.toFixed(0)}% (ปกติ ${settings.humid_min}-${settings.humid_max})\n`;
                    message += `⏰ เวลา: ${format(new Date(log.recorded_at), 'HH:mm:ss')}`;

                    try {
                      const response = await fetch('/api/line/push', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          to: settings.line_user_id,
                          accessToken: settings.line_access_token,
                          messages: [{ type: 'text', text: message }]
                        })
                      });
                      if (!response.ok) {
                        const text = await response.text();
                        console.error('Auto LINE notification failed:', response.status, text);
                      }
                    } catch (err) {
                      console.error('Failed to send auto LINE notification:', err);
                    }
                  }
                }
              }
            });
          }
        }
      )
      .subscribe();

    // ตั้งค่า Supabase Realtime Subscription สำหรับการตั้งค่า (รวมถึงชื่อเซนเซอร์)
    const settingsSubscription = supabase
      .channel('device_settings_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'device_settings', filter: 'id=eq.1' },
        (payload) => {
          console.log('Settings updated from cloud:', payload.new);
          const newData = payload.new;
          
          // อัปเดตเกณฑ์การแจ้งเตือนเฉพาะเมื่อไม่ได้เปิดหน้าต่างตั้งค่าอยู่
          if (!showSettings) {
            setSettings({
              temp_min: newData.temp_min,
              temp_max: newData.temp_max,
              humid_min: newData.humid_min,
              humid_max: newData.humid_max,
              notify_interval: newData.notify_interval,
              line_access_token: newData.line_access_token || '',
              line_user_id: newData.line_user_id || ''
            });
          }
          
          // อัปเดตชื่อเซนเซอร์ (ซิงค์ข้ามเครื่อง)
          if (newData.sensor_names) {
            const names = typeof newData.sensor_names === 'string' 
              ? JSON.parse(newData.sensor_names) 
              : newData.sensor_names;
            setSensorNames(names);
            localStorage.setItem('sensorNames', JSON.stringify(names));
          }
        }
      )
      .subscribe((status) => {
        console.log('Settings subscription status:', status);
      });

    return () => {
      clearInterval(pollInterval);
      sensorSubscription.unsubscribe();
      settingsSubscription.unsubscribe();
    };
  }, [fetchData, fetchSettings, sensorNames, settings.temp_max, settings.temp_min, settings.humid_max, settings.humid_min, timeRange]);

  // คำนวณสถานะรวมของระบบ
  const systemStatus = useMemo(() => {
    const sensors = Object.values(latestData) as SensorLog[];
    if (sensors.length === 0) return 'loading';
    
    // ตรวจสอบว่าเซนเซอร์ออฟไลน์หรือไม่ (ไม่มีข้อมูลใหม่เกิน 5 นาที)
    const lastSeen = new Date(sensors[0].recorded_at).getTime();
    const diffMinutes = (currentTime.getTime() - lastSeen) / (1000 * 60);
    const isOffline = diffMinutes > 5;

    if (isOffline) return 'offline';
    
    const isCritical = (s: SensorLog) => 
      (s.temperature > settings.temp_max || s.temperature < settings.temp_min) && 
      (s.humidity > settings.humid_max || s.humidity < settings.humid_min);
    
    const isWarning = (s: SensorLog) => 
      s.temperature > settings.temp_max || s.temperature < settings.temp_min || 
      s.humidity > settings.humid_max || s.humidity < settings.humid_min;

    const hasCritical = sensors.some(isCritical);
    const hasWarning = sensors.some(isWarning);
    
    if (hasCritical) return 'critical';
    if (hasWarning) return 'warning';
    return 'normal';
  }, [latestData, currentTime]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans selection:bg-zinc-200 dark:selection:bg-zinc-800 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-2 sm:py-4 lg:py-6">
        
        {/* TOP NAVIGATION / HEADER */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 sm:mb-3 gap-4 sm:gap-6">
          <div 
            className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setView('dashboard')}
          >
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
              onClick={() => setView('report')}
              className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shadow-sm flex items-center gap-2"
              title="ดูรายงานประวัติ"
            >
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline text-sm font-medium">รายงาน</span>
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
              title="ตั้งค่าเกณฑ์การแจ้งเตือน"
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
              title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </header>

        {/* MAIN CONTENT AREA */}
        <AnimatePresence mode="wait">
          {view === 'dashboard' ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
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
                      thresholds={{ 
                        tempMin: settings.temp_min, 
                        tempMax: settings.temp_max, 
                        humidMin: settings.humid_min, 
                        humidMax: settings.humid_max 
                      }}
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
                    sensorNames={sensorNames}
                    timeRange={timeRange} 
                    onTimeRangeChange={setTimeRange} 
                    customFilter={customFilter}
                    onCustomFilterChange={setCustomFilter}
                    theme={theme}
                  />
                </div>
              </div>

              {/* ALERT LOG (FULL WIDTH BELOW) */}
              <div className="w-full h-auto lg:h-[450px] overflow-hidden">
                <AlertLog 
                  logs={alertLogs} 
                  sensorNames={sensorNames} 
                  thresholds={{ 
                    tempMin: settings.temp_min, 
                    tempMax: settings.temp_max, 
                    humidMin: settings.humid_min, 
                    humidMax: settings.humid_max 
                  }} 
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ReportPage 
                sensorNames={sensorNames}
                thresholds={{
                  tempMin: settings.temp_min,
                  tempMax: settings.temp_max,
                  humidMin: settings.humid_min,
                  humidMax: settings.humid_max
                }}
                onBack={() => setView('dashboard')}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* SETTINGS MODAL */}
        <AnimatePresence>
          {showSettings && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSettings(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
              >
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    ตั้งค่าเกณฑ์การแจ้งเตือน
                  </h2>
                  <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-500 uppercase tracking-wider">อุณหภูมิต่ำสุด (°C)</label>
                      <input 
                        type="number" 
                        value={isNaN(settings.temp_min) ? '' : settings.temp_min} 
                        onChange={(e) => {
                          const val = e.target.value === '' ? NaN : parseFloat(e.target.value);
                          setSettings(prev => ({...prev, temp_min: val}));
                        }}
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-500 uppercase tracking-wider">อุณหภูมิสูงสุด (°C)</label>
                      <input 
                        type="number" 
                        value={isNaN(settings.temp_max) ? '' : settings.temp_max} 
                        onChange={(e) => {
                          const val = e.target.value === '' ? NaN : parseFloat(e.target.value);
                          setSettings(prev => ({...prev, temp_max: val}));
                        }}
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-red-500/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-500 uppercase tracking-wider">ความชื้นต่ำสุด (%)</label>
                      <input 
                        type="number" 
                        value={isNaN(settings.humid_min) ? '' : settings.humid_min} 
                        onChange={(e) => {
                          const val = e.target.value === '' ? NaN : parseFloat(e.target.value);
                          setSettings(prev => ({...prev, humid_min: val}));
                        }}
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-500 uppercase tracking-wider">ความชื้นสูงสุด (%)</label>
                      <input 
                        type="number" 
                        value={isNaN(settings.humid_max) ? '' : settings.humid_max} 
                        onChange={(e) => {
                          const val = e.target.value === '' ? NaN : parseFloat(e.target.value);
                          setSettings(prev => ({...prev, humid_max: val}));
                        }}
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-red-500/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-500 uppercase tracking-wider">ระยะเวลาแจ้งเตือนซ้ำ (นาที)</label>
                    <input 
                      type="number" 
                      value={isNaN(settings.notify_interval) ? '' : settings.notify_interval} 
                      onChange={(e) => {
                        const val = e.target.value === '' ? NaN : parseInt(e.target.value);
                        setSettings(prev => ({...prev, notify_interval: val}));
                      }}
                      className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-zinc-500/50"
                    />
                    <p className="text-xs text-zinc-400">ระยะเวลาขั้นต่ำก่อนจะส่ง LINE แจ้งเตือนซ้ำอีกครั้ง</p>
                  </div>

                  <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">LINE Messaging API (แทน Notify)</label>
                        {settings.line_access_token && settings.line_user_id && (
                          <button 
                            onClick={async () => {
                              try {
                                const response = await fetch('/api/line/push', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    to: settings.line_user_id,
                                    accessToken: settings.line_access_token,
                                    messages: [{ type: 'text', text: '🔔 ทดสอบการแจ้งเตือนจากระบบ Server Monitor (Messaging API)' }]
                                  })
                                });
                                
                                if (!response.ok) {
                                  const text = await response.text();
                                  console.error('Server error response:', response.status, text);
                                  let errorMsg = 'ตรวจสอบ Token/ID';
                                  try {
                                    const errData = JSON.parse(text);
                                    if (errData.message) {
                                      errorMsg = errData.message;
                                    } else if (errData.error) {
                                      errorMsg = errData.error;
                                    }
                                    if (errData.details && Array.isArray(errData.details)) {
                                      errorMsg += ' (' + errData.details.map((d: any) => `${d.property}: ${d.message}`).join(', ') + ')';
                                    }
                                  } catch (e) {}
                                  toast.error(`ส่งไม่สำเร็จ: ${errorMsg}`);
                                  return;
                                }

                                await response.json();
                                toast.success('ส่งข้อความทดสอบเรียบร้อย');
                              } catch (e) {
                                console.error('LINE test error:', e);
                                toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
                              }
                            }}
                            className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg hover:bg-blue-200 transition-colors"
                          >
                            ทดสอบส่ง
                          </button>
                        )}
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] text-zinc-500 mb-1 block">Channel Access Token</label>
                          <input 
                            type="password" 
                            placeholder="ใส่ Channel Access Token..."
                            value={settings.line_access_token} 
                            onChange={(e) => setSettings(prev => ({...prev, line_access_token: e.target.value}))}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-500 mb-1 block">Your User ID</label>
                          <input 
                            type="text" 
                            placeholder="ใส่ User ID (U...)"
                            value={settings.line_user_id} 
                            onChange={(e) => setSettings(prev => ({...prev, line_user_id: e.target.value}))}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                          <p className="text-[9px] text-zinc-400 mt-1 italic">* ต้องเพิ่ม Bot เป็นเพื่อนก่อนจึงจะรับข้อความได้</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-400">ตั้งค่าได้ที่ LINE Developers Console</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 flex gap-3">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="flex-1 py-3 rounded-xl font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button 
                    onClick={saveSettings}
                    disabled={isSavingSettings}
                    className="flex-1 py-3 rounded-xl font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isSavingSettings ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <Toaster position="top-center" richColors />

      </div>
    </div>
  );
}
