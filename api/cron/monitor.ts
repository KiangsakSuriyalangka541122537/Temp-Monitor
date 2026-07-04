import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://tzjmorrkocoxihtsyrfy.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6am1vcnJrb2NveGlodHN5cmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDk3MDUsImV4cCI6MjA4NzcyNTcwNX0.SirelOHD7cp51HyM7I5eKTchUfMrDss0asZfAJVo5k8';
const supabase = createClient(supabaseUrl, supabaseKey);

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

// Send LINE notification (Supports both Messaging API and LINE Notify)
const sendLineNotification = async (to: string, accessToken: string, message: string, settings?: any) => {
  try {
    if (to && to.trim()) {
      // Use LINE Messaging API (Push Message)
      if (settings?.sensor_names?.line_error === 'limit_reached') {
        console.warn('Cron: LINE Messaging API is rate limited. Skipping push notification.');
        return { success: false, status: 429, errorText: 'monthly limit' };
      }
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
        const text = await response.text();
        console.error('Cron: LINE Messaging API Error:', response.status, text);
        return { success: false, status: response.status, errorText: text };
      } else {
        console.log('Cron: LINE Messaging notification sent successfully');
        return { success: true };
      }
    } else {
      // Use LINE Notify
      const response = await fetch('https://notify-api.line.me/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${accessToken.trim()}`,
        },
        body: new URLSearchParams({ message }),
      });
      if (!response.ok) {
        const text = await response.text();
        console.error('Cron: LINE Notify Error:', response.status, text);
        return { success: false, status: response.status, errorText: text };
      } else {
        console.log('Cron: LINE Notify sent successfully');
        return { success: true };
      }
    }
  } catch (error) {
    console.error('Cron: Error sending LINE notification:', error);
    return { success: false, errorText: error instanceof Error ? error.message : String(error) };
  }
};

// Update LINE API error status in Supabase so the Web interface can display warning & guides
const updateLineErrorStatus = async (
  result: { success: boolean; status?: number; errorText?: string },
  settings: any
) => {
  const currentNames = { ...(settings.sensor_names || {}) };
  let changed = false;

  if (!result.success) {
    const isLimitError = result.status === 429 || (result.errorText && result.errorText.includes('monthly limit'));
    if (isLimitError) {
      if (currentNames.line_error !== 'limit_reached') {
        currentNames.line_error = 'limit_reached';
        currentNames.line_error_time = new Date().toISOString();
        changed = true;
      }
    } else {
      // Other error (e.g. invalid token, bad user ID, etc.)
      const errStr = result.errorText || 'unknown_error';
      const shortErr = errStr.length > 200 ? errStr.substring(0, 200) + '...' : errStr;
      if (currentNames.line_error !== shortErr) {
        currentNames.line_error = shortErr;
        currentNames.line_error_time = new Date().toISOString();
        changed = true;
      }
    }
  } else {
    // Success - clear errors
    if (currentNames.line_error) {
      delete currentNames.line_error;
      delete currentNames.line_error_time;
      changed = true;
    }
  }

  if (changed) {
    try {
      await supabase
        .from('device_settings')
        .update({ sensor_names: currentNames })
        .eq('id', 1);
      console.log('Cron: Updated LINE error status in database:', currentNames.line_error || 'CLEARED');
    } catch (e) {
      console.error('Cron: Failed to update device_settings with LINE error:', e);
    }
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET or POST requests
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' });
  }

  try {
    // 1. Fetch settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('device_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (settingsError || !settingsData) {
      return res.status(500).json({ error: 'Error fetching settings' });
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

    if (!settings.line_access_token) {
      return res.status(400).json({ error: 'LINE credentials not configured' });
    }

    // 2. Fetch latest logs to find valid values
    const { data: logsData, error: logsError } = await supabase
      .from('Temp-sketch_mar24a')
      .select('id, created_at, t1, h1, t2, h2')
      .order('created_at', { ascending: false })
      .limit(10);

    if (logsError || !logsData || logsData.length === 0) {
      return res.status(200).json({ status: 'No data to process' });
    }

    const latestLog = logsData[0];
    
    // Extract latest non-zero values for each sensor from logs
    let t1 = 0, h1 = 0, t2 = 0, h2 = 0;
    let recorded_at_1 = latestLog.created_at;
    let recorded_at_2 = latestLog.created_at;

    const validT1Row = logsData.find(r => r.t1 && Number(r.t1) !== 0 && Number(r.t1) !== -999);
    if (validT1Row) {
      t1 = Number(validT1Row.t1);
      h1 = Number(validT1Row.h1);
      recorded_at_1 = validT1Row.created_at;
    } else {
      t1 = Number(latestLog.t1) || 0;
      h1 = Number(latestLog.h1) || 0;
    }

    const validT2Row = logsData.find(r => r.t2 && Number(r.t2) !== 0 && Number(r.t2) !== -999);
    if (validT2Row) {
      t2 = Number(validT2Row.t2);
      h2 = Number(validT2Row.h2);
      recorded_at_2 = validT2Row.created_at;
    } else {
      t2 = Number(latestLog.t2) || 0;
      h2 = Number(latestLog.h2) || 0;
    }

    const latestLogsBySensor: Record<number, any> = {
      1: {
        sensor_id: 1,
        sensor_name: settings.sensor_names[1] || 'เซนเซอร์ 1',
        temperature: t1,
        humidity: h1,
        recorded_at: recorded_at_1
      },
      2: {
        sensor_id: 2,
        sensor_name: settings.sensor_names[2] || 'เซนเซอร์ 2',
        temperature: t2,
        humidity: h2,
        recorded_at: recorded_at_2
      }
    };

    const now = Date.now();
    let mostRecentLogTime = 0;

    Object.values(latestLogsBySensor).forEach((log: any) => {
      const logTime = new Date(log.recorded_at).getTime();
      if (logTime > mostRecentLogTime) {
        mostRecentLogTime = logTime;
      }
    });

    const diffMinutes = (now - mostRecentLogTime) / (1000 * 60);
    const isOffline = diffMinutes > 5;

    // 3. Fetch notification state
    // We will use a table called 'notification_state' to track when we last sent a message
    // If it doesn't exist, we will try to create it or just handle the error gracefully
    const { data: stateData, error: stateError } = await supabase
      .from('notification_state')
      .select('*')
      .eq('id', 1)
      .single();

    // Default state if table doesn't exist or is empty
    let state = stateData || {
      id: 1,
      is_offline: false,
      offline_start_time: null,
      last_offline_notified: null,
      sensor_error_starts: {},
      last_sensor_notified: {}
    };

    const updates: any = { id: 1 };
    let shouldUpdateState = false;
    let notificationsSent = 0;

    // --- Handle Offline ---
    if (isOffline) {
      if (!state.is_offline) {
        // Just went offline
        updates.is_offline = true;
        updates.offline_start_time = new Date(mostRecentLogTime).toISOString();
        shouldUpdateState = true;
      }

      const offlineStartTime = state.offline_start_time ? new Date(state.offline_start_time).getTime() : mostRecentLogTime;
      const offlineDurationMins = Math.floor((now - offlineStartTime) / 60000);
      
      const lastNotified = state.last_offline_notified ? new Date(state.last_offline_notified).getTime() : 0;
      const minsSinceLastNotify = (now - lastNotified) / 60000;

      // Send notification if it's been longer than notify_interval since last notify
      // Or if we haven't notified yet
      if (!state.last_offline_notified || minsSinceLastNotify >= settings.notify_interval) {
        const t1 = latestLogsBySensor[1]?.temperature !== -999 ? `${latestLogsBySensor[1]?.temperature.toFixed(1)}°C` : 'ขัดข้อง';
        const h1 = latestLogsBySensor[1]?.humidity !== -999 ? `${latestLogsBySensor[1]?.humidity.toFixed(0)}%` : 'ขัดข้อง';
        const t2 = latestLogsBySensor[2]?.temperature !== -999 ? `${latestLogsBySensor[2]?.temperature.toFixed(1)}°C` : 'ขัดข้อง';
        const h2 = latestLogsBySensor[2]?.humidity !== -999 ? `${latestLogsBySensor[2]?.humidity.toFixed(0)}%` : 'ขัดข้อง';

        const message = `🔴 แจ้งเตือน: พบปัญหาขาดการเชื่อมต่อ (Offline)\n` +
          `📌 อุปกรณ์: เครื่องวัดอุณหภูมิตู้เก็บยา\n` +
          `⚠️ สถานะ: ขาดการเชื่อมต่อเกิน 5 นาที (อาจเกิดจาก WiFi หลุด, ไฟดับ หรือบอร์ดไม่มีไฟเลี้ยง)\n` +
          `🕒 ข้อมูลล่าสุดเมื่อ: ${formatTime(new Date(mostRecentLogTime))}\n` +
          `⏳ ขาดหายไปแล้ว: ${offlineDurationMins} นาที\n` +
          `📊 อุณหภูมิ/ความชื้นล่าสุดก่อนหลุด:\n` +
          `🔹 ${settings.sensor_names[1] || 'เซนเซอร์ 1'}: ${t1} | ${h1}\n` +
          `🔹 ${settings.sensor_names[2] || 'เซนเซอร์ 2'}: ${t2} | ${h2}\n` +
          `⏰ เวลาปัจจุบัน: ${formatTime(new Date(now))}`;
        
        const result = await sendLineNotification(settings.line_user_id, settings.line_access_token, message, settings);
        await updateLineErrorStatus(result, settings);
        
        updates.last_offline_notified = new Date(now).toISOString();
        shouldUpdateState = true;
        notificationsSent++;
      }
    } else {
      // System is Online
      if (state.is_offline) {
        // Just recovered
        const offlineStartTime = state.offline_start_time ? new Date(state.offline_start_time).getTime() : mostRecentLogTime;
        const downtimeMs = mostRecentLogTime - offlineStartTime;
        const minutes = Math.floor(downtimeMs / 60000);
        const seconds = Math.floor((downtimeMs % 60000) / 1000);
        
        const recoveryMessage = `🟢 แจ้งเตือน: ระบบกลับมาใช้งานปกติ (Online)\n📍 สถานะ: เชื่อมต่อสำเร็จ\n🕒 เริ่มหลุดเมื่อ: ${formatTime(new Date(offlineStartTime))}\n🕒 กลับมาเมื่อ: ${formatTime(new Date(mostRecentLogTime))}\n⏱️ รวมเวลาที่ขาดหาย: ${minutes} นาที ${seconds} วินาที\n✅ ระบบกำลังเริ่มบันทึกข้อมูลตามปกติ`;
        
        const result = await sendLineNotification(settings.line_user_id, settings.line_access_token, recoveryMessage, settings);
        await updateLineErrorStatus(result, settings);
        
        updates.is_offline = false;
        updates.offline_start_time = null;
        updates.last_offline_notified = null;
        shouldUpdateState = true;
        notificationsSent++;
      }
    }

    // --- Handle Sensor Errors & Thresholds ---
    const newSensorErrorStarts = { ...(state.sensor_error_starts || {}) };
    const newLastSensorNotified = { ...(state.last_sensor_notified || {}) };

    for (const log of Object.values(latestLogsBySensor)) {
      const logTime = new Date(log.recorded_at).getTime();
      
      // Skip old logs
      if (now - logTime > 10 * 60 * 1000) continue;

      const isS2 = log.sensor_id === 2;
      const isError = log.temperature === -999 || (!isS2 && log.humidity === -999);
      const isTempIssue = !isError && (log.temperature > settings.temp_max || log.temperature < settings.temp_min);
      const isHumidIssue = !isS2 && !isError && (log.humidity > settings.humid_max || log.humidity < settings.humid_min);
      
      const sensorIdStr = String(log.sensor_id);
      const sensorName = log.sensor_name;

      if (isError || isTempIssue || isHumidIssue) {
        if (isError && !newSensorErrorStarts[sensorIdStr]) {
          newSensorErrorStarts[sensorIdStr] = new Date(logTime).toISOString();
          shouldUpdateState = true;
        }

        const lastNotified = newLastSensorNotified[sensorIdStr] ? new Date(newLastSensorNotified[sensorIdStr]).getTime() : 0;
        const minsSinceLastNotify = (now - lastNotified) / 60000;

        if (!newLastSensorNotified[sensorIdStr] || minsSinceLastNotify >= settings.notify_interval) {
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

          const result = await sendLineNotification(settings.line_user_id, settings.line_access_token, message, settings);
          await updateLineErrorStatus(result, settings);
          
          newLastSensorNotified[sensorIdStr] = new Date(now).toISOString();
          shouldUpdateState = true;
          notificationsSent++;
        }
      } else {
        // Normal data, check for recovery
        if (newSensorErrorStarts[sensorIdStr]) {
          const startTime = new Date(newSensorErrorStarts[sensorIdStr]).getTime();
          if (logTime > startTime) {
            const downtimeMs = logTime - startTime;
            const minutes = Math.floor(downtimeMs / 60000);
            const seconds = Math.floor((downtimeMs % 60000) / 1000);
            
            const recoveryMessage = `✅ แจ้งเตือน: เซนเซอร์กลับมาใช้งานปกติ\n📍 จุดที่วัด: ${sensorName}\n🕒 เริ่มขัดข้องเมื่อ: ${formatTime(new Date(startTime))}\n🕒 กลับมาเมื่อ: ${formatTime(new Date(logTime))}\n⏱️ รวมเวลาที่ขัดข้อง: ${minutes} นาที ${seconds} วินาที`;
            
            const result = await sendLineNotification(settings.line_user_id, settings.line_access_token, recoveryMessage, settings);
            await updateLineErrorStatus(result, settings);
            
            delete newSensorErrorStarts[sensorIdStr];
            delete newLastSensorNotified[sensorIdStr];
            shouldUpdateState = true;
            notificationsSent++;
          }
        }
      }
    }

    // Save state back to Supabase if changed
    if (shouldUpdateState) {
      updates.sensor_error_starts = newSensorErrorStarts;
      updates.last_sensor_notified = newLastSensorNotified;
      
      // Upsert the state
      await supabase.from('notification_state').upsert(updates);
    }

    return res.status(200).json({ 
      status: 'success', 
      checked_at: new Date().toISOString(),
      is_offline: isOffline,
      notifications_sent: notificationsSent
    });

  } catch (error) {
    console.error('Cron Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
