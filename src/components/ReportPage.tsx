import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns';
import { FileText, Download, Calendar, Filter, ChevronLeft, ChevronRight, Search, AlertCircle, CheckCircle2, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { SensorLog } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [isExporting, setIsExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'normal' | 'abnormal'>('all');

  // Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportRange, setExportRange] = useState<ReportRange>('day');
  const [exportDate, setExportDate] = useState(new Date());
  const [exportCustomRange, setExportCustomRange] = useState({
    start: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [exportStatusFilter, setExportStatusFilter] = useState<'all' | 'normal' | 'abnormal'>('all');

  const handleOpenExportModal = () => {
    setExportRange(range);
    setExportDate(selectedDate);
    setExportCustomRange(customRange);
    setExportStatusFilter(statusFilter);
    setIsExportModalOpen(true);
  };

  const changeExportDate = (amount: number) => {
    const newDate = new Date(exportDate);
    if (exportRange === 'day') newDate.setDate(newDate.getDate() + amount);
    else if (exportRange === 'month') newDate.setMonth(newDate.getMonth() + amount);
    else if (exportRange === 'year') newDate.setFullYear(newDate.getFullYear() + amount);
    setExportDate(newDate);
  };

  const fetchReportData = useCallback(async () => {
    // Only show loading if we don't have data yet
    setIsLoading(prev => prev || false); 
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
        .select('id, created_at, t1, h1, t2, h2')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const mappedLogs: SensorLog[] = new Array(data.length * 2);
        for (let i = 0; i < data.length; i++) {
          const log = data[i];
          const baseIdx = i * 2;
          
          mappedLogs[baseIdx] = {
            id: log.id * 2,
            sensor_id: 1,
            sensor_name: '', // Will map later
            temperature: Number(log.t1) || 0,
            humidity: Number(log.h1) || 0,
            recorded_at: log.created_at
          };
          
          mappedLogs[baseIdx + 1] = {
            id: log.id * 2 + 1,
            sensor_id: 2,
            sensor_name: '', // Will map later
            temperature: Number(log.t2) || 0,
            humidity: Number(log.h2) || 0,
            recorded_at: log.created_at
          };
        }
        setLogs(mappedLogs);
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [range, selectedDate, customRange]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Clear logs when parameters change to force a clean loading state
  useEffect(() => {
    setLogs([]);
    setIsLoading(true);
  }, [range, selectedDate, customRange.start, customRange.end]);

  const displayLogs = useMemo(() => {
    return logs.map(log => ({
      ...log,
      sensor_name: sensorNames[log.sensor_id as keyof typeof sensorNames] || `เซนเซอร์ ${log.sensor_id}`
    }));
  }, [logs, sensorNames]);

  const filteredLogs = useMemo(() => {
    return displayLogs.filter(log => {
      const isSensorError = log.temperature === -999 || log.humidity === -999;
      const isNormal = !isSensorError && 
                       log.temperature <= thresholds.tempMax && 
                       log.temperature >= thresholds.tempMin && 
                       log.humidity <= thresholds.humidMax && 
                       log.humidity >= thresholds.humidMin;
      
      const matchesSearch = log.sensor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           format(new Date(log.recorded_at), 'HH:mm:ss').includes(searchQuery);
      
      const matchesStatus = statusFilter === 'all' || 
                           (statusFilter === 'normal' && isNormal) || 
                           (statusFilter === 'abnormal' && !isNormal);
      
      return matchesSearch && matchesStatus;
    });
  }, [displayLogs, thresholds, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const validLogs = logs.filter(l => l.temperature !== -999 && l.humidity !== -999);
    return {
      avgTemp: validLogs.length > 0 ? validLogs.reduce((acc, curr) => acc + curr.temperature, 0) / validLogs.length : 0,
      avgHumid: validLogs.length > 0 ? validLogs.reduce((acc, curr) => acc + curr.humidity, 0) / validLogs.length : 0,
      totalAlerts: logs.filter(log => 
        log.temperature === -999 || 
        log.humidity === -999 ||
        log.temperature > thresholds.tempMax || 
        log.temperature < thresholds.tempMin || 
        log.humidity > thresholds.humidMax || 
        log.humidity < thresholds.humidMin
      ).length
    };
  }, [logs, thresholds]);

  const exportPDF = async () => {
    setIsExporting(true);
    try {
      // Fetch data based on export settings
      let startDate: string;
      let endDate: string;

      if (exportRange === 'day') {
        startDate = startOfDay(exportDate).toISOString();
        endDate = endOfDay(exportDate).toISOString();
      } else if (exportRange === 'month') {
        startDate = startOfMonth(exportDate).toISOString();
        endDate = endOfMonth(exportDate).toISOString();
      } else if (exportRange === 'year') {
        startDate = startOfYear(exportDate).toISOString();
        endDate = endOfYear(exportDate).toISOString();
      } else {
        startDate = startOfDay(new Date(exportCustomRange.start)).toISOString();
        endDate = endOfDay(new Date(exportCustomRange.end)).toISOString();
      }

      const { data, error } = await supabase
        .from('Temp-sketch_mar24a')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) throw error;

      let exportLogs: SensorLog[] = [];
      if (data) {
        data.forEach((log: any) => {
          exportLogs.push({
            id: log.id * 2,
            sensor_id: 1,
            sensor_name: sensorNames[1] || 'เซนเซอร์ 1',
            temperature: log.t1 || 0,
            humidity: log.h1 || 0,
            recorded_at: log.created_at
          });
          exportLogs.push({
            id: log.id * 2 + 1,
            sensor_id: 2,
            sensor_name: sensorNames[2] || 'เซนเซอร์ 2',
            temperature: log.t2 || 0,
            humidity: log.h2 || 0,
            recorded_at: log.created_at
          });
        });
      }

      // Filter by status
      const finalExportLogs = exportLogs.filter(log => {
        const isSensorError = log.temperature === -999 || log.humidity === -999;
        const isNormal = !isSensorError && 
                         log.temperature <= thresholds.tempMax && 
                         log.temperature >= thresholds.tempMin && 
                         log.humidity <= thresholds.humidMax && 
                         log.humidity >= thresholds.humidMin;
        
        return exportStatusFilter === 'all' || 
              (exportStatusFilter === 'normal' && isNormal) || 
              (exportStatusFilter === 'abnormal' && !isNormal);
      });

      if (finalExportLogs.length === 0) {
        alert('ไม่พบข้อมูลในช่วงเวลาและสถานะที่เลือก');
        setIsExporting(false);
        return;
      }

      // Calculate stats for export
      const validExportLogs = finalExportLogs.filter(l => l.temperature !== -999 && l.humidity !== -999);
      const exportStats = {
        avgTemp: validExportLogs.length > 0 ? validExportLogs.reduce((acc, curr) => acc + curr.temperature, 0) / validExportLogs.length : 0,
        avgHumid: validExportLogs.length > 0 ? validExportLogs.reduce((acc, curr) => acc + curr.humidity, 0) / validExportLogs.length : 0,
        totalAlerts: finalExportLogs.filter(log => 
          log.temperature === -999 || 
          log.humidity === -999 ||
          log.temperature > thresholds.tempMax || 
          log.temperature < thresholds.tempMin || 
          log.humidity > thresholds.humidMax || 
          log.humidity < thresholds.humidMin
        ).length
      };

      const doc = new jsPDF();
      
      // Fetch Thai Font (THSarabunNew) to support Thai characters in PDF
      // Using a reliable source for THSarabunNew which is known to work well with jsPDF
      const fontUrl = 'https://raw.githubusercontent.com/Phonbopit/sarabun-webfont/master/fonts/thsarabunnew-webfont.ttf';
      const response = await fetch(fontUrl);
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Font = btoa(binary);

      doc.addFileToVFS('THSarabunNew.ttf', base64Font);
      doc.addFont('THSarabunNew.ttf', 'THSarabunNew', 'normal');
      doc.setFont('THSarabunNew');
      
      // --- Draw PDF Content (Minimalist & Thai) ---
      
      // Title
      doc.setFontSize(16);
      doc.setTextColor(30, 30, 30);
      doc.text('รายงานสรุปผลอุณหภูมิและความชื้น', 14, 20);
      
      // Period Info
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const periodText = exportRange === 'custom' 
        ? `ข้อมูลระหว่างวันที่: ${format(new Date(exportCustomRange.start), 'dd/MM/yyyy')} ถึง ${format(new Date(exportCustomRange.end), 'dd/MM/yyyy')}` 
        : `ข้อมูลประจำวันที่: ${format(exportDate, exportRange === 'day' ? 'dd/MM/yyyy' : exportRange === 'month' ? 'MM/yyyy' : 'yyyy')}`;
      doc.text(periodText, 14, 28);

      // Summary
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const statusText = exportStatusFilter === 'all' ? 'ทั้งหมด' : exportStatusFilter === 'normal' ? 'ปกติ' : 'ผิดปกติ';
      doc.text(`ตัวกรองสถานะ: ${statusText}   |   จำนวนที่พบ: ${finalExportLogs.length} รายการ`, 14, 34);
      doc.text(`อุณหภูมิเฉลี่ย: ${exportStats.avgTemp.toFixed(1)} °C   |   ความชื้นเฉลี่ย: ${exportStats.avgHumid.toFixed(1)} %   |   พบความผิดปกติรวม: ${exportStats.totalAlerts} ครั้ง`, 14, 40);

      // Table Data
      const tableData = finalExportLogs.map(log => {
        const isSensorError = log.temperature === -999 || log.humidity === -999;
        const isNormal = !isSensorError && 
                         log.temperature <= thresholds.tempMax && 
                         log.temperature >= thresholds.tempMin && 
                         log.humidity <= thresholds.humidMax && 
                         log.humidity >= thresholds.humidMin;
        return [
          format(new Date(log.recorded_at), 'dd/MM/yyyy HH:mm'),
          log.sensor_name,
          log.temperature === -999 ? 'ERR' : `${log.temperature.toFixed(1)} °C`,
          log.humidity === -999 ? 'ERR' : `${log.humidity.toFixed(1)} %`,
          isSensorError ? 'เซนเซอร์มีปัญหา' : (isNormal ? 'ปกติ' : 'ผิดปกติ')
        ];
      });

      // Draw Table
      autoTable(doc, {
        startY: 48,
        head: [['วัน/เวลา', 'จุดติดตั้ง (เซนเซอร์)', 'อุณหภูมิ', 'ความชื้น', 'สถานะ']],
        body: tableData,
        theme: 'grid',
        styles: {
          font: 'THSarabunNew',
          fontSize: 12, // Increased slightly because THSarabunNew is smaller than standard fonts
          textColor: [60, 60, 60],
          lineColor: [230, 230, 230],
          lineWidth: 0.1,
          cellPadding: 3,
        },
        headStyles: {
          fillColor: [245, 245, 245],
          textColor: [40, 40, 40],
          fontStyle: 'normal', // Explicitly set to normal since we only loaded the normal font
        },
        alternateRowStyles: {
          fillColor: [252, 252, 252]
        },
        didParseCell: function(data) {
          // Colorize status column
          if (data.section === 'body' && data.column.index === 4) {
            if (data.cell.raw === 'ผิดปกติ' || data.cell.raw === 'เซนเซอร์มีปัญหา') {
              data.cell.styles.textColor = [220, 38, 38]; // Red
            } else {
              data.cell.styles.textColor = [5, 150, 105]; // Green
            }
          }
        }
      });

      doc.save(`รายงานอุณหภูมิ_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
      setIsExportModalOpen(false);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('เกิดข้อผิดพลาดในการสร้าง PDF กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsExporting(false);
    }
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
              {isLoading && logs.length > 0 && (
                <Activity className="w-4 h-4 text-blue-500 animate-spin-slow" />
              )}
            </h1>
            <p className="text-sm text-zinc-500">ดูประวัติการทำงานและส่งออกข้อมูลเป็น PDF</p>
          </div>
        </div>
        
        <button 
          onClick={handleOpenExportModal}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-medium transition-all shadow-lg shadow-blue-500/20"
        >
          <Download className="w-5 h-5" />
          ส่งออก PDF Report
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl w-full sm:w-auto overflow-x-auto no-scrollbar">
              {(['day', 'month', 'year', 'custom'] as ReportRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`flex-1 sm:flex-none min-w-max px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
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

        <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-sm">
          <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl w-full overflow-x-auto no-scrollbar">
            {(['all', 'normal', 'abnormal'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`flex-1 min-w-max px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  statusFilter === f 
                    ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {f === 'all' ? 'ทั้งหมด' : f === 'normal' ? 'ปกติ' : 'ผิดปกติ'}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-sm">
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
                  const isSensorError = log.temperature === -999 || log.humidity === -999;
                  const isNormal = !isSensorError && 
                                   log.temperature <= thresholds.tempMax && 
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
                          log.temperature === -999 || log.temperature > thresholds.tempMax || log.temperature < thresholds.tempMin 
                            ? 'text-red-500 font-bold' 
                            : 'text-zinc-900 dark:text-zinc-100'
                        }`}>
                          {log.temperature === -999 ? 'ERR' : `${log.temperature.toFixed(1)}°C`}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-mono ${
                          log.humidity === -999 || log.humidity > thresholds.humidMax || log.humidity < thresholds.humidMin 
                            ? 'text-red-500 font-bold' 
                            : 'text-zinc-900 dark:text-zinc-100'
                        }`}>
                          {log.humidity === -999 ? 'ERR' : `${log.humidity.toFixed(1)}%`}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isNormal 
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' 
                            : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                        }`}>
                          {isNormal ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {isSensorError ? 'เซนเซอร์มีปัญหา' : (isNormal ? 'ปกติ' : 'ผิดปกติ')}
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
      {/* Export Modal */}
      <AnimatePresence>
        {isExportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-xl w-full max-w-lg overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Download className="w-5 h-5 text-blue-500" />
                  ตั้งค่าการส่งออก PDF
                </h2>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Range Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ช่วงเวลา</label>
                  <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl overflow-x-auto no-scrollbar">
                    {(['day', 'month', 'year', 'custom'] as ReportRange[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setExportRange(r)}
                        className={`flex-1 min-w-max px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                          exportRange === r 
                            ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                            : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                      >
                        {r === 'day' ? 'รายวัน' : r === 'month' ? 'รายเดือน' : r === 'year' ? 'รายปี' : 'กำหนดเอง'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date Selection */}
                {exportRange !== 'custom' ? (
                  <div className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700">
                    <button 
                      onClick={() => changeExportDate(-1)}
                      className="p-2 rounded-xl hover:bg-white dark:hover:bg-zinc-700 transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2 font-medium">
                      <Calendar className="w-4 h-4 text-zinc-400" />
                      {format(exportDate, exportRange === 'day' ? 'dd MMMM yyyy' : exportRange === 'month' ? 'MMMM yyyy' : 'yyyy')}
                    </div>
                    <button 
                      onClick={() => changeExportDate(1)}
                      className="p-2 rounded-xl hover:bg-white dark:hover:bg-zinc-700 transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input 
                      type="date" 
                      value={exportCustomRange.start}
                      onChange={(e) => setExportCustomRange({...exportCustomRange, start: e.target.value})}
                      className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/50"
                    />
                    <span className="text-zinc-400">ถึง</span>
                    <input 
                      type="date" 
                      value={exportCustomRange.end}
                      onChange={(e) => setExportCustomRange({...exportCustomRange, end: e.target.value})}
                      className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                )}

                {/* Status Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">สถานะ</label>
                  <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl overflow-x-auto no-scrollbar">
                    {(['all', 'normal', 'abnormal'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setExportStatusFilter(f)}
                        className={`flex-1 min-w-max px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                          exportStatusFilter === f 
                            ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                            : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                      >
                        {f === 'all' ? 'ทั้งหมด' : f === 'normal' ? 'ปกติ' : 'ผิดปกติ'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-800/30">
                <button
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-4 py-2 rounded-xl font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={exportPDF}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                  {isExporting ? <Activity className="w-4 h-4 animate-spin-slow" /> : <Download className="w-4 h-4" />}
                  {isExporting ? 'กำลังสร้าง...' : 'ยืนยันการส่งออก'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
