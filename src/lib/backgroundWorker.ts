import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in environment variables.');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// State variables for tracking
let offlineStartTime: number | null = null;
let lastOfflineNotified: number = 0;
let offlineNotificationCount: number = 0;
const sensorErrorStartTimes: Record<number, number> = {};
const lastNotifiedRef: Record<number, number> = {};
const notificationCountsRef: Record<string, number> = {};

// Helper to format time in Thailand timezone
const formatTime = (date: Date) => {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
};

// Send LINE notification
const sendLineNotification = async (to: string, accessToken: string, message: string) => {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken.trim()}`,
      },
      body: JSON.stringify({
        to: to.trim(),
        messages: [{ type: 'text', text: message }],
      }),
    });
    if (!response.ok) {
      console.error('Background Worker: LINE API Error Status:', response.status);
    } else {
      console.log('Background Worker: LINE notification sent successfully');
    }
  } catch (error) {
    console.error('Background Worker: Error sending LINE notification:', error);
  }
};

export const startBackgroundWorker = () => {
  if (!supabaseUrl || !supabaseKey) {
    console.log('Background Worker: Cannot start, missing Supabase credentials.');
    return;
  }

  console.log('Background Worker: Started monitoring sensor logs...');

  // Poll every 10 seconds
  setInterval(async () => {
    try {
      // Fetch settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('device_settings')
        .select('*')
        .eq('id', 1)
        .single();

      if (settingsError || !settingsData) {
        console.error('Background Worker: Error fetching settings:', settingsError);
        return;
      }

      const settings = {
        temp_min: parseFloat(settingsData.temp_min) || 0,
        temp_max: parseFloat(settingsData.temp_max) || 0,
        humid_min: parseFloat(settingsData.humid_min) || 0,
        humid_max: parseFloat(settingsData.humid_max) || 0,
        notify_interval: parseInt(settingsData.notify_interval) || 10,
        line_access_token: settingsData.line_access_token || '',
        line_user_id: settingsData.line_user_id || '',
        sensor_names: settingsData.sensor_names || { 1: 'เซนเซอร์ 1', 2: 'เซนเซอร์ 2' }
      };

      if (!settings.line_access_token || !settings.line_user_id) {
        // No LINE credentials, skip monitoring
        return;
      }

      // Fetch latest log from the correct table
      const { data: logsData, error: logsError } = await supabase
        .from('Temp-sketch_mar24a')
        .select('id, created_at, t1, h1, t2, h2')
        .order('created_at', { ascending: false })
        .limit(1);

      if (logsError || !logsData || logsData.length === 0) {
        return;
      }

      const latestLog = logsData[0];
      
      const latestLogsBySensor: Record<number, any> = {
        1: {
          sensor_id: 1,
          sensor_name: settings.sensor_names[1] || 'เซนเซอร์ 1',
          temperature: Number(latestLog.t1) || 0,
          humidity: Number(latestLog.h1) || 0,
          recorded_at: latestLog.created_at
        },
        2: {
          sensor_id: 2,
          sensor_name: settings.sensor_names[2] || 'เซนเซอร์ 2',
          temperature: Number(latestLog.t2) || 0,
          humidity: Number(latestLog.h2) || 0,
          recorded_at: latestLog.created_at
        }
      };

      const now = Date.now();
      let isSystemOffline = true;
      let mostRecentLogTime = 0;

      // Check offline status across all sensors
      Object.values(latestLogsBySensor).forEach((log: any) => {
        const logTime = new Date(log.recorded_at).getTime();
        if (logTime > mostRecentLogTime) {
          mostRecentLogTime = logTime;
        }
        
        // If any sensor has data within the last 10 minutes, system is not completely offline
        if (now - logTime <= 10 * 60 * 1000) {
          isSystemOffline = false;
        }
      });

      // 1. Handle System Offline / Recovery
      if (isSystemOffline) {
        if (!offlineStartTime) {
          offlineStartTime = mostRecentLogTime; // Start tracking from the last known good data
        }

        const offlineDurationMs = now - offlineStartTime;
        const offlineMinutes = Math.floor(offlineDurationMs / 60000);

        // Notify if offline for > 5 mins
        if (offlineMinutes >= 5) {
          let intervalMinutes = 5;
          if (offlineNotificationCount === 0) {
            intervalMinutes = 0;
          } else if (offlineNotificationCount === 1) {
            intervalMinutes = 5;
          } else {
            intervalMinutes = settings.notify_interval;
          }

          const intervalMs = intervalMinutes * 60 * 1000;

          if (now - lastOfflineNotified > intervalMs) {
            lastOfflineNotified = now;
            offlineNotificationCount++;

            const message = `🔴 แจ้งเตือน: ระบบขาดการเชื่อมต่อ (Offline)\n📌 ปัญหา: ไม่ได้รับข้อมูลจากอุปกรณ์เกิน 5 นาที\n🕒 ข้อมูลล่าสุดเมื่อ: ${formatTime(new Date(mostRecentLogTime))}\n⏳ ขาดหายไปแล้ว: ${offlineMinutes} นาที\n🔍 สาเหตุ: อาจเกิดจาก WiFi หลุด, ไฟดับ หรือปัญหาการส่งข้อมูลไปยัง Server\n⏰ เวลาปัจจุบัน: ${formatTime(new Date(now))}`;
            
            await sendLineNotification(settings.line_user_id, settings.line_access_token, message);
          }
        }
      } else {
        // System is online. Check for recovery.
        if (offlineStartTime && mostRecentLogTime > offlineStartTime) {
          const downtimeMs = mostRecentLogTime - offlineStartTime;
          const minutes = Math.floor(downtimeMs / 60000);
          const seconds = Math.floor((downtimeMs % 60000) / 1000);
          
          const startTimeStr = formatTime(new Date(offlineStartTime));
          const recoveryTimeStr = formatTime(new Date(mostRecentLogTime));
          
          const recoveryMessage = `🟢 แจ้งเตือน: ระบบกลับมาใช้งานปกติ (Online)\n📍 สถานะ: เชื่อมต่อสำเร็จ\n🕒 เริ่มหลุดเมื่อ: ${startTimeStr}\n🕒 กลับมาเมื่อ: ${recoveryTimeStr}\n⏱️ รวมเวลาที่ขาดหาย: ${minutes} นาที ${seconds} วินาที\n✅ ระบบกำลังเริ่มบันทึกข้อมูลตามปกติ`;
          
          await sendLineNotification(settings.line_user_id, settings.line_access_token, recoveryMessage);
          
          // Reset offline tracking
          offlineStartTime = null;
          offlineNotificationCount = 0;
          lastOfflineNotified = 0;
        }
      }

      // 2. Handle Sensor Errors and Thresholds
      Object.values(latestLogsBySensor).forEach((log: any) => {
        const logTime = new Date(log.recorded_at).getTime();
        
        // Skip processing old logs (older than 10 minutes)
        if (now - logTime > 10 * 60 * 1000) {
          return;
        }

        const isError = log.temperature === -999 || log.humidity === -999;
        const isTempIssue = !isError && (log.temperature > settings.temp_max || log.temperature < settings.temp_min);
        const isHumidIssue = !isError && (log.humidity > settings.humid_max || log.humidity < settings.humid_min);
        
        const problemKey = `sensor_${log.sensor_id}`;
        const sensorName = settings.sensor_names[log.sensor_id] || log.sensor_name;

        if (isTempIssue || isHumidIssue || isError) {
          if (isError && !sensorErrorStartTimes[log.sensor_id]) {
            sensorErrorStartTimes[log.sensor_id] = logTime;
          }

          const lastTime = lastNotifiedRef[log.sensor_id] || 0;
          const count = notificationCountsRef[problemKey] || 0;
          
          let intervalMinutes = 10;
          if (count === 0) {
            intervalMinutes = 0;
          } else if (count === 1) {
            intervalMinutes = 5;
          } else {
            intervalMinutes = settings.notify_interval;
          }

          const intervalMs = intervalMinutes * 60 * 1000;

          if (now - lastTime > intervalMs) {
            lastNotifiedRef[log.sensor_id] = now;
            notificationCountsRef[problemKey] = count + 1;
            
            let message = '';
            
            if (isError) {
              message = `❌ แจ้งเตือน: เซนเซอร์ขัดข้อง (Sensor Error)\n📍 จุดที่วัด: ${sensorName}\n📌 ปัญหา: ไม่สามารถอ่านค่าจากเซนเซอร์ได้\n🔍 สาเหตุ: เซนเซอร์อาจชำรุด, สายสัญญาณหลุด หรือไฟเลี้ยงไม่พอ\n🛠️ คำแนะนำ: กรุณาตรวจสอบการเชื่อมต่อของเซนเซอร์ทันที\n⏰ เวลา: ${formatTime(new Date(logTime))}`;
            } else {
              message = `⚠️ แจ้งเตือน: ค่าผิดปกติ\n📍 จุดที่วัด: ${sensorName}\n`;
              if (isTempIssue) {
                const status = log.temperature > settings.temp_max ? 'สูงเกินเกณฑ์' : 'ต่ำกว่าเกณฑ์';
                message += `🌡️ อุณหภูมิ: ${log.temperature.toFixed(1)}°C (${status})\n`;
                message += `📊 เกณฑ์ที่ตั้งไว้: ${settings.temp_min}-${settings.temp_max}°C\n`;
              }
              if (isHumidIssue) {
                const status = log.humidity > settings.humid_max ? 'สูงเกินเกณฑ์' : 'ต่ำกว่าเกณฑ์';
                message += `💧 ความชื้น: ${log.humidity.toFixed(0)}% (${status})\n`;
                message += `📊 เกณฑ์ที่ตั้งไว้: ${settings.humid_min}-${settings.humid_max}%\n`;
              }
              message += `\n⏰ เวลา: ${formatTime(new Date(logTime))}`;
            }

            sendLineNotification(settings.line_user_id, settings.line_access_token, message);
          }
        } else {
          // Normal data. Check for sensor error recovery.
          if (sensorErrorStartTimes[log.sensor_id]) {
            const startTime = sensorErrorStartTimes[log.sensor_id];
            // Only recover if the new normal data is strictly newer than the error start time
            if (logTime > startTime) {
              const downtimeMs = logTime - startTime;
              const minutes = Math.floor(downtimeMs / 60000);
              const seconds = Math.floor((downtimeMs % 60000) / 1000);
              
              const recoveryMessage = `✅ แจ้งเตือน: เซนเซอร์กลับมาใช้งานปกติ\n📍 จุดที่วัด: ${sensorName}\n🕒 เริ่มขัดข้องเมื่อ: ${formatTime(new Date(startTime))}\n🕒 กลับมาเมื่อ: ${formatTime(new Date(logTime))}\n⏱️ รวมเวลาที่ขัดข้อง: ${minutes} นาที ${seconds} วินาที`;
              
              sendLineNotification(settings.line_user_id, settings.line_access_token, recoveryMessage);
              
              delete sensorErrorStartTimes[log.sensor_id];
              notificationCountsRef[problemKey] = 0;
            }
          } else {
             // Reset notification counts if everything is normal
             notificationCountsRef[problemKey] = 0;
          }
        }
      });

    } catch (error) {
      console.error('Background Worker: Error in polling loop:', error);
    }
  }, 10000); // Poll every 10 seconds
};
