import React, { useState, useEffect, useCallback } from 'react';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns';
import { FileText, Download, Calendar, Filter, ChevronLeft, ChevronRight, Search, AlertCircle, CheckCircle2, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { SensorLog } from '../types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF with autotable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface ReportPageProps {
  sensorNames: Record<number, string>;
  thresholds: {
    tempMin: number;
    tempMax: number;
    humidMin: number;
    humidMax: number;
  };
  onBack: () => void;
}

type ReportRange = 'day' | 'month' | 'year' | 'custom';

export function ReportPage({ sensorNames, thresholds, onBack }: ReportPageProps) {
  const [range, setRange] = useState<ReportRange>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [customRange, setCustomRange] = useState({
    start: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [logs, setLogs] = useState<SensorLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchReportData = useCallback(async () => {
    setIsLoading(true);
    try {
      let startDate: string;
      let endDate: string;

      if (range === 'day') {
        startDate = startOfDay(selectedDate).toISOString();
        endDate = endOfDay(selectedDate).toISOString();
      } else if (range === 'month') {
        startDate = startOfMonth(selectedDate).toISOString();
        endDate = endOfMonth(selectedDate).toISOString();
      } else if (range === 'year') {
        startDate = startOfYear(selectedDate).toISOString();
        endDate = endOfYear(selectedDate).toISOString();
      } else {
        startDate = startOfDay(new Date(customRange.start)).toISOString();
        endDate = endOfDay(new Date(customRange.end)).toISOString();
      }

      const { data, error } = await supabase
        .from('Temp-sketch_mar24a')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const mappedLogs: SensorLog[] = [];
        data.forEach((log: any) => {
          mappedLogs.push({
            id: log.id * 2,
            sensor_id: 1,
            sensor_name: sensorNames[1] || 'เซนเซอร์ 1',
            temperature: log.t1 || 0,
            humidity: log.h1 || 0,
            recorded_at: log.created_at
          });
          mappedLogs.push({
            id: log.id * 2 + 1,
            sensor_id: 2,
            sensor_name: sensorNames[2] || 'เซนเซอร์ 2',
            temperature: log.t2 || 0,
            humidity: log.h2 || 0,
            recorded_at: log.created_at
          });
        });
        setLogs(mappedLogs);
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [range, selectedDate, customRange, sensorNames]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const filteredLogs = logs.filter(log => 
    log.sensor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    format(new Date(log.recorded_at), 'HH:mm:ss').includes(searchQuery)
  );

  const stats = {
    avgTemp: logs.length > 0 ? logs.reduce((acc, curr) => acc + curr.temperature, 0) / logs.length : 0,
    avgHumid: logs.length > 0 ? logs.reduce((acc, curr) => acc + curr.humidity, 0) / logs.length : 0,
    totalAlerts: logs.filter(log => 
      log.temperature > thresholds.tempMax || 
      log.temperature < thresholds.tempMin || 
      log.humidity > thresholds.humidMax || 
      log.humidity < thresholds.humidMin
    ).length
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(20);
    doc.text('Server Monitor Report', 14, 22);
    
    // Add info
    doc.setFontSize(11);
    doc.text(`Report Type: ${range.toUpperCase()}`, 14, 32);
    doc.text(`Period: ${range === 'custom' ? `${customRange.start} to ${customRange.end}` : format(selectedDate, range === 'day' ? 'dd MMMM yyyy' : range === 'month' ? 'MMMM yyyy' : 'yyyy')}`, 14, 38);
    doc.text(`Generated at: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, 14, 44);

    // Add summary
    doc.text('Summary:', 14, 54);
    doc.text(`- Average Temperature: ${stats.avgTemp.toFixed(1)}°C`, 14, 60);
    doc.text(`- Average Humidity: ${stats.avgHumid.toFixed(1)}%`, 14, 66);
    doc.text(`- Total Alerts: ${stats.totalAlerts}`, 14, 72);

    // Add table
    const tableData = filteredLogs.map(log => {
      const isNormal = log.temperature <= thresholds.tempMax && 
                       log.temperature >= thresholds.tempMin && 
                       log.humidity <= thresholds.humidMax && 
                       log.humidity >= thresholds.humidMin;
      return [
        format(new Date(log.recorded_at), 'dd/MM/yyyy HH:mm:ss'),
        log.sensor_name,
        `${log.temperature.toFixed(1)}°C`,
        `${log.humidity.toFixed(1)}%`,
        isNormal ? 'Normal' : 'Abnormal'
      ];
    });

    doc.autoTable({
      startY: 80,
      head: [['Date/Time', 'Sensor', 'Temp', 'Humid', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    doc.save(`report-${format(new Date(), 'yyyyMMdd-HHmmss')}.pdf`);
  };

  const changeDate = (amount: number) => {
    const newDate = new Date(selectedDate);
    if (range === 'day') newDate.setDate(newDate.getDate() + amount);
    else if (range === 'month') newDate.setMonth(newDate.getMonth() + amount);
    else if (range === 'year') newDate.setFullYear(newDate.getFullYear() + amount);
    setSelectedDate(newDate);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-blue-500" />
              รายงานประวัติข้อมูล
            </h1>
            <p className="text-sm text-zinc-500">ดูประวัติการทำงานและส่งออกข้อมูลเป็น PDF</p>
          </div>
        </div>
        
        <button 
          onClick={exportPDF}
          disabled={logs.length === 0}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-medium transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-5 h-5" />
          ส่งออก PDF Report
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl w-full sm:w-auto">
              {(['day', 'month', 'year', 'custom'] as ReportRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    range === r 
                      ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  {r === 'day' ? 'รายวัน' : r === 'month' ? 'รายเดือน' : r === 'year' ? 'รายปี' : 'กำหนดเอง'}
                </button>
              ))}
            </div>

            {range !== 'custom' ? (
              <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
                <button 
                  onClick={() => changeDate(-1)}
                  className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2 font-medium">
                  <Calendar className="w-4 h-4 text-zinc-400" />
                  {format(selectedDate, range === 'day' ? 'dd MMMM yyyy' : range === 'month' ? 'MMMM yyyy' : 'yyyy')}
                </div>
                <button 
                  onClick={() => changeDate(1)}
                  className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input 
                  type="date" 
                  value={customRange.start}
                  onChange={(e) => setCustomRange({...customRange, start: e.target.value})}
                  className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/50"
                />
                <span className="text-zinc-400">ถึง</span>
                <input 
                  type="date" 
                  value={customRange.end}
                  onChange={(e) => setCustomRange({...customRange, end: e.target.value})}
                  className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text"
              placeholder="ค้นหาชื่อเซนเซอร์/เวลา..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">อุณหภูมิเฉลี่ย</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white">{stats.avgTemp.toFixed(1)}°C</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">ความชื้นเฉลี่ย</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white">{stats.avgHumid.toFixed(1)}%</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">จำนวนความผิดปกติ</p>
          <p className={`text-2xl font-bold ${stats.totalAlerts > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            {stats.totalAlerts} ครั้ง
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">วัน/เวลา</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">ชื่อเซนเซอร์</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">อุณหภูมิ</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">ความชื้น</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Activity className="w-8 h-8 text-blue-500 animate-spin-slow" />
                      <p className="text-sm text-zinc-500">กำลังโหลดข้อมูลรายงาน...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Filter className="w-8 h-8 text-zinc-300" />
                      <p className="text-sm text-zinc-500">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isNormal = log.temperature <= thresholds.tempMax && 
                                   log.temperature >= thresholds.tempMin && 
                                   log.humidity <= thresholds.humidMax && 
                                   log.humidity >= thresholds.humidMin;
                  return (
                    <tr key={log.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {format(new Date(log.recorded_at), 'dd/MM/yyyy')}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {format(new Date(log.recorded_at), 'HH:mm:ss')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium">{log.sensor_name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-mono ${
                          log.temperature > thresholds.tempMax || log.temperature < thresholds.tempMin 
                            ? 'text-red-500 font-bold' 
                            : 'text-zinc-900 dark:text-zinc-100'
                        }`}>
                          {log.temperature.toFixed(1)}°C
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-mono ${
                          log.humidity > thresholds.humidMax || log.humidity < thresholds.humidMin 
                            ? 'text-red-500 font-bold' 
                            : 'text-zinc-900 dark:text-zinc-100'
                        }`}>
                          {log.humidity.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isNormal 
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' 
                            : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                        }`}>
                          {isNormal ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {isNormal ? 'ปกติ' : 'ผิดปกติ'}
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
