/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { Sun, Moon, CheckCircle2, AlertTriangle, Activity, Settings, X, Check, FileText, WifiOff, Send, Smartphone, Cpu, Copy, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { supabase } from './lib/supabase';
import { SensorCard } from './components/SensorCard';
import { SensorChart } from './components/SensorChart';
import { AlertLog } from './components/AlertLog';
import { ReportPage } from './components/ReportPage';
import { SensorLog, AlertLog as AlertLogType } from './types';

const getArduinoCode = (origin: string) => {
  return `/*
  ==============================================================
  โค้ดโปรแกรม Arduino (ESP32) สำหรับส่งข้อมูลอุณหภูมิและความชื้นเข้าตู้อัจฉริยะ
  - เชื่อมต่อกับเซนเซอร์ Sensor 1 (DHT22) ขาที่ 13
  - เชื่อมต่อกับเซนเซอร์ Sensor 2 (DS18B20) ขาที่ 33
  - เพิ่มหน้าจอ LCD 1602 / 2004 แบบ I2C แสดงผลตัวอักษรเป็นสถานะอุณหภูมิและความชื้น
    * ขา SDA ของจอ LCD ต่อกับ GPIO 21 ของ ESP32
    * ขา SCL ของจอ LCD ต่อกับ GPIO 22 ของ ESP32
  - มีระบบจัดการ Wi-Fi อัจฉริยะ (Captive Portal): ถ้าไม่เจอ WiFi บอร์ดจะปล่อยสัญญาณชื่อ "Cabinet-WiFi-Setup" ให้ตั้งค่าใหม่ผ่านมือถือได้ทันที
  - ส่งแจ้งเตือน LINE ด่วนโดยตรงจากตัวบอร์ดเมื่อตรวจพบเซนเซอร์ขาด/หลุด
  - บันทึกสถานะขัดข้อง (-999.0) เข้า Supabase ทันที เพื่อแสดงสถานะขัดข้องบนเว็บแอปพลิเคชัน
  ==============================================================
  
  วิธีเตรียมตัวก่อนอัปโหลดโค้ด:
  1. ใน Arduino IDE ให้ไปที่ Library Manager (Ctrl+Shift+I หรือ Cmd+Shift+I)
  2. ค้นหาและติดตั้งไลบรารีดังต่อไปนี้:
     - "DHT sensor library" (โดย Adafruit)
     - "Adafruit Unified Sensor" (โดย Adafruit)
     - "OneWire" (โดย Paul Stoffregen)
     - "DallasTemperature" (โดย Miles Burton)
     - "LiquidCrystal I2C" (โดย Frank de Brabander หรือ Marco Schwartz)
     - "WiFiManager" (โดย tzapu)
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <WiFiManager.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ข้อมูลจำเพาะและคีย์ระบบจากตู้ยาของท่าน (กรอกให้โดยอัตโนมัติ)
const char* supabase_url = "https://tzjmorrkocoxihtsyrfy.supabase.co";
const char* supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6am1vcnJrb2NveGlodHN5cmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDk3MDUsImV4cCI6MjA4NzcyNTcwNX0.SirelOHD7cp51HyM7I5eKTchUfMrDss0asZfAJVo5k8";
const char* line_token = "L450Ii1WvMvG7TDnQpP9ytpXq2FgjcPW488f+DV8AS0Ma6zoQXNiUf0LVBqvtWoS4Ftd62gr5JPQzXAcu+ypuxlC4QM1E0l1hDp2cqayWf6EumvBtPmcB1/cD7MAQBO3o5iayJWv6HOsduRc547RuwdB04t89/1O/w1cDnyilFU=";
const char* line_user_id = "Ua36e33071aed1a4de990b282dde7ad0d";
const char* proxy_url = "\${origin}/api/data";

// กำหนดขาเซนเซอร์ตามจริง
#define DHTPIN 13       // Sensor 1 (DHT22) -> GPIO 13
#define ONE_WIRE_BUS 33 // Sensor 2 (DS18B20) -> GPIO 33
#define DHTTYPE DHT22

// กำหนดหน้าจอ LCD 1602 / 2004 แบบ I2C
// มีระบบค้นหาและระบุ I2C Address อัตโนมัติ (I2C Auto-Scanner) ป้องกันปัญหาที่จอแต่ละตัวใช้รหัสไม่เหมือนกัน
#define LCD_COLUMNS 16   // จำนวนหลัก (เช่น 16 หรือ 20)
#define LCD_ROWS    2    // จำนวนบรรทัด (เช่น 2 หรือ 4)
LiquidCrystal_I2C* lcd_ptr = nullptr;
#define lcd (*lcd_ptr)

DHT dht(DHTPIN, DHTTYPE);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

unsigned long lastTime = 0;
unsigned long delayTime = 30000; // รอบการส่งข้อมูลปกติ ทุก 30 วินาที

// กำหนดตัวแปรสำหรับหน่วงเวลาส่ง LINE ป้องกันข้อความสแปม (ส่งทุกๆ 10 นาทีกรณีขัดข้องต่อเนื่อง)
unsigned long lastLineAlertTime = 0;
unsigned long lineAlertInterval = 600000; // 10 นาที (600,000 มิลลิวินาที)

// ฟังก์ชันสำหรับแสดงข้อมูลอุณหภูมิและความชื้นบนจอ LCD 1602 / 2004
void updateLCD(float t1, float h1, float t2, float h2, const String& statusText) {
  lcd.clear();
  
  // บรรทัดที่ 1 (Row 0): แสดงค่าเซนเซอร์ 1 (DHT22)
  lcd.setCursor(0, 0);
  if (t1 == -999.0 || h1 == -999.0) {
    lcd.print("S1: ERROR       ");
  } else {
    // S1: 25.4C H:55%
    lcd.print("S1:");
    lcd.print(t1, 1);
    lcd.print("C H:");
    lcd.print(h1, 0);
    lcd.print("%");
  }
  
  // บรรทัดที่ 2 (Row 1): แสดงค่าเซนเซอร์ 2 (DS18B20)
  lcd.setCursor(0, 1);
  if (t2 == -999.0) {
    lcd.print("S2: ERR  ");
  } else {
    lcd.print("S2:");
    lcd.print(t2, 1);
    lcd.print("C  ");
  }
  
  // วางข้อความสถานะที่ตำแหน่งด้านขวาล่าง (เช่น [OK], [ERR])
  lcd.setCursor(11, 1);
  lcd.print("[");
  lcd.print(statusText);
  lcd.print("]");
}

void setup() {
  Serial.begin(115200);
  Serial.println("\\n--- เริ่มต้นระบบ Smart Cabinet ESP32 ---");
  
  dht.begin();
  sensors.begin();

  // เริ่มต้นจอแสดงผล LCD I2C ด้วยระบบค้นหาแอดเดรสอัตโนมัติ (I2C Auto-Scanner)
  Wire.begin(21, 22); // กำหนดขา SDA=GPIO 21, SCL=GPIO 22 ของ ESP32 อย่างชัดเจน
  delay(100);

  byte lcd_addr = 0x27; // แอดเดรสเริ่มต้นมาตรฐาน
  Serial.println("--- เริ่มการค้นหาหน้าจอ LCD I2C ---");
  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.printf("พบอุปกรณ์ I2C ที่แอดเดรส: 0x%02X\\n", address);
      if (address == 0x27 || address == 0x3F || address == 0x3C || address == 0x20 || address == 0x3E) {
        lcd_addr = address;
        Serial.printf("-> ตรวจพบหน้าจอ LCD I2C ที่แอดเดรสจริง: 0x%02X\\n", lcd_addr);
      }
    }
  }

  // สร้างออบเจกต์จอ LCD ตามแอดเดรสที่ตรวจพบจริงแบบ Dynamic
  lcd_ptr = new LiquidCrystal_I2C(lcd_addr, LCD_COLUMNS, LCD_ROWS);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  
  lcd.setCursor(0, 0);
  lcd.print("Smart Cabinet v1");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");
  delay(1500);

  // ใช้ WiFiManager แทนการเขียนโค้ดตั้งค่า WiFi เองทั้งหมด
  WiFiManager wm;
  
  // แสดงผลบนจอว่ากำลังเชื่อมต่อหรือให้ตั้งค่าผ่านมือถือ
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connecting.");
  lcd.setCursor(0, 1);
  lcd.print("Or AP Setup mode");
  
  // ฟังก์ชันนี้จะพยายามเชื่อมต่อ WiFi ที่เคยบันทึกไว้
  // หากไม่สำเร็จ หรือไม่มีรหัสผ่าน จะเปิด AP ชื่อ "Cabinet-WiFi-Setup"
  bool res = wm.autoConnect("Cabinet-WiFi-Setup");

  if (!res) {
    Serial.println("เชื่อมต่อ WiFi ล้มเหลว กรุณารีสตาร์ทบอร์ด");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Failed!");
    delay(3000);
    ESP.restart();
  } 
  
  // หากมาถึงตรงนี้ แสดงว่าเชื่อมต่อ WiFi สำเร็จแล้ว
  Serial.println("\nเชื่อมต่อ Wi-Fi สำเร็จ!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connected! ");
  lcd.setCursor(0, 1);
  lcd.print(WiFi.localIP().toString());
  delay(2000);
}

void loop() {
  
  if ((millis() - lastTime) > delayTime || lastTime == 0) {
    if (WiFi.status() == WL_CONNECTED) {
      
      // --- อ่านค่าจากเซนเซอร์ 1 (DHT22) ---
      float h1 = dht.readHumidity();
      float t1 = dht.readTemperature();
      
      // --- อ่านค่าจากเซนเซอร์ 2 (DS18B20) ---
      sensors.requestTemperatures(); 
      float t2 = sensors.getTempCByIndex(0);
      float h2 = 0.0; // DS18B20 ไม่มีเซนเซอร์วัดความชื้น ให้ตั้งค่าเป็น 0
      
      boolean sensor1Failed = isnan(t1) || isnan(h1);
      boolean sensor2Failed = (t2 == DEVICE_DISCONNECTED_C || isnan(t2) || t2 < -50.0);
      
      String statusMsg = "OK";
      
      // บันทึกสถานะเพื่อส่ง LINE Alert
      if (sensor1Failed || sensor2Failed) {
        Serial.println("⚠️ ตรวจพบระบบเซนเซอร์ขัดข้อง!");
        statusMsg = "ERR";
        
        if (sensor1Failed) {
          t1 = -999.0;
          h1 = -999.0;
        }
        if (sensor2Failed) {
          t2 = -999.0;
        }
        
        // ส่งข้อความแจ้งเตือนด่วนเข้า LINE โดยตรงจากตัวบอร์ด (จำกัดเวลาส่ง เพื่อไม่ให้ข้อความสแปม)
        if (millis() - lastLineAlertTime > lineAlertInterval || lastLineAlertTime == 0) {
          sendLineAlertDirect(sensor1Failed, sensor2Failed);
          lastLineAlertTime = millis();
        }
      }
      
      Serial.print("Sensor 1 (DHT22): Temp = "); Serial.print(t1); Serial.print(" C, Humid = "); Serial.print(h1); Serial.println(" %");
      Serial.print("Sensor 2 (DS18B20): Temp = "); Serial.print(t2); Serial.println(" C");
      
      // แสดงผลอุณหภูมิและความชื้นแบบตัวอักษรอย่างละเอียดลงบนหน้าจอ LCD
      updateLCD(t1, h1, t2, h2, statusMsg);
      
      // ส่งข้อมูลเข้าเซิร์ฟเวอร์
      sendDataToCloud(t1, h1, t2, h2);
    } else {
      Serial.println("สัญญาณ Wi-Fi ขาดหาย กำลังรอเชื่อมต่อใหม่...");
      
      // แสดงสถานะตัดการเชื่อมต่อบน LCD
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Wi-Fi Lost!     ");
      lcd.setCursor(0, 1);
      lcd.print("Reconnecting... ");
    }
    lastTime = millis();
  }
}

// ฟังก์ชันส่งค่าเข้า Cloud (Supabase และ Web API Proxy)
void sendDataToCloud(float t1, float h1, float t2, float h2) {
  // 1. ส่งตรงเข้า Supabase
  WiFiClientSecure client;
  client.setInsecure(); // บายพาส SSL Verification
  
  HTTPClient http;
  
  // ส่งตรงเข้า REST API ของ Supabase
  String supabaseUrl = String(supabase_url) + "/rest/v1/Temp-sketch_mar24a";
  Serial.println("กำลังส่งข้อมูลเข้า Supabase โดยตรง...");
  http.begin(client, supabaseUrl);
  http.addHeader("apikey", supabase_key);
  http.addHeader("Authorization", "Bearer " + String(supabase_key));
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=representation");
  
  String payload = "[{\\\"t1\\\":" + String(t1, 1) + 
                   ",\\\"h1\\\":" + String(h1, 1) + 
                   ",\\\"t2\\\":" + String(t2, 1) + 
                   ",\\\"h2\\\":" + String(h2, 1) + "}]";
  
  int httpCode = http.POST(payload);
  if (httpCode > 0) {
    Serial.printf("Supabase Direct POST สำเร็จ, รหัส: %d\\n", httpCode);
  } else {
    Serial.printf("Supabase Direct POST ล้มเหลว, ข้อผิดพลาด: %s\\n", http.errorToString(httpCode).c_str());
  }
  http.end();
  
  // 2. ส่งผ่าน Web Proxy เพื่อรันฟังก์ชันและประมวลผลบนเซิร์ฟเวอร์เว็บด้วย
  Serial.println("กำลังส่งข้อมูลเข้า Web API Proxy...");
  http.begin(client, proxy_url);
  http.addHeader("Content-Type", "application/json");
  
  String proxyPayload = "{\\\"t1\\\":" + String(t1, 1) + 
                        ",\\\"h1\\\":" + String(h1, 1) + 
                        ",\\\"t2\\\":" + String(t2, 1) + 
                        ",\\\"h2\\\":" + String(h2, 1) + "}";
                        
  int proxyCode = http.POST(proxyPayload);
  if (proxyCode > 0) {
    Serial.printf("Web Proxy POST สำเร็จ, รหัส: %d\\n", proxyCode);
  } else {
    Serial.printf("Web Proxy POST ล้มเหลว, ข้อผิดพลาด: %s\\n", http.errorToString(proxyCode).c_str());
  }
  http.end();
}

// ฟังก์ชันส่งแจ้งเตือนเข้า LINE บอทโดยตรงจากบอร์ด
void sendLineAlertDirect(boolean sensor1Failed, boolean sensor2Failed) {
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  String lineUrl = "https://api.line.me/v2/bot/message/push";
  
  Serial.println("กำลังส่ง LINE Message จากบอร์ดโดยตรง...");
  http.begin(client, lineUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + String(line_token));
  
  String messageText = "⚠️ [แจ้งเตือนด่วนตู้อัจฉริยะ] ตรวจพบการทำงานขัดข้อง!\\n\\n";
  if (sensor1Failed) {
    messageText += "❌ เซนเซอร์ 1 (DHT22 - ขา 13) มีปัญหาขัดข้องหรือสายหลุด\\n";
  } else {
    messageText += "✅ เซนเซอร์ 1 (DHT22) เชื่อมต่อปกติ\\n";
  }
  
  if (sensor2Failed) {
    messageText += "❌ เซนเซอร์ 2 (DS18B20 - ขา 33) มีปัญหาขัดข้องหรือสายหลุด\\n";
  } else {
    messageText += "✅ เซนเซอร์ 2 (DS18B20) เชื่อมต่อปกติ\\n";
  }
  
  messageText += "\\nโปรดตรวจสอบตัวอุปกรณ์ทันทีเพื่อความปลอดภัยของยาและผลิตภัณฑ์!";
  
  // จัดทำ payload JSON สำหรับ LINE Messaging API (Push)
  String payload = "{\\\"to\\\":\\\"" + String(line_user_id) + "\\\",\\\"messages\\\":[{\\\"type\\\":\\\"text\\\",\\\"text\\\":\\\"" + messageText + "\\\"}]}";
  
  // จัดการการขึ้นบรรทัดใหม่ใน JSON payload
  payload.replace("\\n", "\\\\n");
  
  int httpCode = http.POST(payload);
  if (httpCode > 0) {
    Serial.printf("ส่ง LINE Message โดยตรงสำเร็จ, รหัส: %d\\n", httpCode);
  } else {
    Serial.printf("ส่ง LINE Message ล้มเหลว, ข้อผิดพลาด: %s\\n", http.errorToString(httpCode).c_str());
  }
  http.end();
}
\}`;
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const loginInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showLogin && loginInputRef.current) {
      const timer = setTimeout(() => {
        loginInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showLogin]);

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
      // พยายามบันทึกลง Supabase โดยใช้ upsert เพื่อซิงค์ข้ามเครื่องและป้องกันเคสไม่มีข้อมูลแถวที่ 1
      const { error } = await supabase
        .from('device_settings')
        .upsert({ 
          id: 1,
          sensor_names: updatedNames,
          updated_at: new Date().toISOString()
        });
        
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
  const [localSettings, setLocalSettings] = useState<any>(null);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'threshold' | 'line' | 'arduino'>('threshold');

  useEffect(() => {
    if (showSettings) {
      setActiveSettingsTab('threshold');
      setLocalSettings({
        temp_min: settings.temp_min.toString(),
        temp_max: settings.temp_max.toString(),
        humid_min: settings.humid_min.toString(),
        humid_max: settings.humid_max.toString(),
        notify_interval: settings.notify_interval.toString(),
        line_access_token: settings.line_access_token,
        line_user_id: settings.line_user_id
      });
    }
  }, [showSettings, settings]);

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [lineErrorDismissed, setLineErrorDismissed] = useState(() => {
    const until = localStorage.getItem('line_error_dismissed_until');
    if (until) {
      const untilTime = parseInt(until, 10);
      return Date.now() < untilTime;
    }
    return false;
  });

  const handleLineErrorDismiss = () => {
    const twoWeeksInMs = 14 * 24 * 60 * 60 * 1000;
    const dismissedUntil = Date.now() + twoWeeksInMs;
    localStorage.setItem('line_error_dismissed_until', dismissedUntil.toString());
    setLineErrorDismissed(true);
  };

  useEffect(() => {
    if (!isLoggedIn) {
      const timer = setTimeout(() => {
        loginInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoggedIn]);

  // ดึงค่าตั้งค่าจาก Supabase
  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('device_settings')
      .select('*')
      .eq('id', 1)
      .single();
    
    if (error && error.code === 'PGRST116') {
      console.log('No settings found, initializing default row in Supabase...');
      const defaultSettings = {
        id: 1,
        temp_min: 18.0,
        temp_max: 30.0,
        humid_min: 30.0,
        humid_max: 80.0,
        notify_interval: 10,
        line_access_token: '',
        line_user_id: '',
        sensor_names: { 1: 'เซนเซอร์ 1', 2: 'เซนเซอร์ 2' },
        updated_at: new Date().toISOString()
      };
      
      const { error: insertError } = await supabase
        .from('device_settings')
        .upsert([defaultSettings]);
      
      if (!insertError) {
        setSettings({
          temp_min: defaultSettings.temp_min,
          temp_max: defaultSettings.temp_max,
          humid_min: defaultSettings.humid_min,
          humid_max: defaultSettings.humid_max,
          notify_interval: defaultSettings.notify_interval,
          line_access_token: defaultSettings.line_access_token,
          line_user_id: defaultSettings.line_user_id
        });
        setSensorNames(defaultSettings.sensor_names);
      }
    } else if (!error && data) {
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
    
    const finalSettings = {
      temp_min: parseFloat(localSettings.temp_min) || 0,
      temp_max: parseFloat(localSettings.temp_max) || 0,
      humid_min: parseFloat(localSettings.humid_min) || 0,
      humid_max: parseFloat(localSettings.humid_max) || 0,
      notify_interval: parseInt(localSettings.notify_interval) || 1,
      line_access_token: localSettings.line_access_token,
      line_user_id: localSettings.line_user_id
    };

    const updatedSensorNames = { ...sensorNames };
    delete (updatedSensorNames as any).line_error;
    delete (updatedSensorNames as any).line_error_time;

    const { error } = await supabase
      .from('device_settings')
      .upsert({
        id: 1,
        ...finalSettings,
        sensor_names: updatedSensorNames,
        updated_at: new Date().toISOString()
      });
    
    if (!error) {
      setSettings(finalSettings);
      setSensorNames(updatedSensorNames);
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

  const sendTestNotification = async () => {
    if (!localSettings?.line_access_token?.trim() || !localSettings?.line_user_id?.trim()) {
      toast.error('ข้อมูลไม่ครบถ้วน', {
        description: 'กรุณากรอกทั้ง LINE Access Token และ User ID ก่อนทำรายการทดสอบ'
      });
      return;
    }

    setIsSendingTest(true);
    try {
      const response = await fetch('/api/line/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: localSettings.line_user_id.trim(),
          accessToken: localSettings.line_access_token.trim(),
          messages: [{
            type: 'text',
            text: '🔔 [ระบบอุณหภูมิตู้ยา]\n\nทดสอบการส่งข้อความแจ้งเตือนสำเร็จ!\nเว็บแอปพลิเคชันของคุณเชื่อมต่อกับ LINE เรียบร้อยแล้ว 🎉'
          }]
        })
      });

      const resData = await response.json();
      if (response.ok) {
        toast.success('ส่งข้อความทดสอบสำเร็จ!', {
          description: 'กรุณาตรวจสอบแอปพลิเคชัน LINE ของท่าน'
        });

        // Clear error on success
        const updatedSensorNames = { ...sensorNames };
        if ((updatedSensorNames as any).line_error) {
          delete (updatedSensorNames as any).line_error;
          delete (updatedSensorNames as any).line_error_time;
          setSensorNames(updatedSensorNames);

          await supabase
            .from('device_settings')
            .upsert({
              id: 1,
              ...settings,
              sensor_names: updatedSensorNames,
              updated_at: new Date().toISOString()
            });
        }
      } else {
        toast.error('ส่งข้อความทดสอบไม่สำเร็จ', {
          description: resData.error || resData.message || `รหัสข้อผิดพลาด: ${response.status}`
        });

        // Set line_error immediately on rate limit
        const isLimitError = response.status === 429 || (resData.message && typeof resData.message === 'string' && resData.message.includes('monthly limit'));
        if (isLimitError) {
          const updatedSensorNames = { ...sensorNames, line_error: 'limit_reached', line_error_time: new Date().toISOString() };
          setSensorNames(updatedSensorNames);
          await supabase
            .from('device_settings')
            .upsert({
              id: 1,
              ...settings,
              sensor_names: updatedSensorNames,
              updated_at: new Date().toISOString()
            });
        }
      }
    } catch (err) {
      toast.error('การเชื่อมต่อล้มเหลว', {
        description: err instanceof Error ? err.message : 'กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const copyCodeToClipboard = () => {
    const code = getArduinoCode(window.location.origin);
    navigator.clipboard.writeText(code);
    toast.success('คัดลอกโค้ด Arduino ไปยังคลิปบอร์ดเรียบร้อยแล้ว!', {
      description: 'สามารถนำไปวางใน Arduino IDE แล้วปรับปรุงรหัสผ่าน Wi-Fi ของท่านได้ทันที 🚀'
    });
  };

  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [offlineStartTime, setOfflineStartTime] = useState<number | null>(null);
  const lastNotifiedRef = useRef<Record<number, number>>({});
  const notificationCountsRef = useRef<Record<string, number>>({});
  const lastOfflineNotifiedRef = useRef<number>(0);
  const offlineNotificationCountRef = useRef<number>(0);
  const offlineStartTimeRef = useRef<number | null>(null);
  const sensorErrorStartTimeRef = useRef<Record<number, number>>({});
  const sensorErrorActiveRef = useRef<Record<number, boolean>>({ 1: false, 2: false });

  useEffect(() => {
    offlineStartTimeRef.current = offlineStartTime;
  }, [offlineStartTime]);

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

  // Refs สำหรับเก็บค่าล่าสุดเพื่อใช้ใน Realtime Subscription โดยไม่ทำให้ Effect รันใหม่
  const settingsRef = useRef(settings);
  const sensorNamesRef = useRef(sensorNames);
  const timeRangeRef = useRef(timeRange);
  const latestDataRef = useRef(latestData);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { sensorNamesRef.current = sensorNames; }, [sensorNames]);
  useEffect(() => { timeRangeRef.current = timeRange; }, [timeRange]);
  useEffect(() => { latestDataRef.current = latestData; }, [latestData]);

  // ตรวจสอบและส่งการแจ้งเตือน
  const checkAndNotify = async (log: SensorLog, currentSettings: any, currentSensorNames: Record<number, string>) => {
    // ตรวจสอบการกลับมาออนไลน์ (Recovery)
    const logTime = new Date(log.recorded_at).getTime();
    if (offlineStartTimeRef.current && logTime > offlineStartTimeRef.current) {
      const startTime = offlineStartTimeRef.current;
      offlineStartTimeRef.current = null; // ป้องกันการส่งซ้ำจากเซนเซอร์ตัวอื่นในรอบเดียวกัน
      setOfflineStartTime(null);
      
      const recoveryTime = logTime; // ใช้เวลาของข้อมูลใหม่เป็นเวลาที่กลับมาออนไลน์
      const downtimeMs = recoveryTime - startTime;
      const minutes = Math.floor(downtimeMs / 60000);
      const seconds = Math.floor((downtimeMs % 60000) / 1000);
      
      const startTimeStr = format(new Date(startTime), 'HH:mm:ss');
      const recoveryTimeStr = format(new Date(recoveryTime), 'HH:mm:ss');
      
      const recoveryMessage = `🟢 แจ้งเตือน: ระบบกลับมาใช้งานปกติ (Online)\n📍 สถานะ: เชื่อมต่อสำเร็จ\n🕒 เริ่มหลุดเมื่อ: ${startTimeStr}\n🕒 กลับมาเมื่อ: ${recoveryTimeStr}\n⏱️ รวมเวลาที่ขาดหาย: ${minutes} นาที ${seconds} วินาที\n✅ ระบบกำลังเริ่มบันทึกข้อมูลตามปกติ`;
      
      offlineNotificationCountRef.current = 0;
      lastOfflineNotifiedRef.current = 0;

      if (currentSettings.line_access_token && currentSettings.line_user_id) {
        // LINE Notification is now handled by the backend worker
        // to ensure it runs even when the website is closed.
      }
    }

    const tempMax = Number(currentSettings.temp_max);
    const tempMin = Number(currentSettings.temp_min);
    const humidMax = Number(currentSettings.humid_max);
    const humidMin = Number(currentSettings.humid_min);

    // ตรวจสอบความผิดปกติ: ค่าเป็น -999 หมายถึงเซนเซอร์ชำรุดหรือสายหลุด (เซนเซอร์ตัวที่ 2 ไม่ตรวจจับความชื้น)
    const isS2 = log.sensor_id === 2;
    const isError = log.temperature === -999 || (!isS2 && log.humidity === -999);
    const isTempIssue = !isError && (log.temperature > tempMax || log.temperature < tempMin);
    const isHumidIssue = !isS2 && !isError && (log.humidity > humidMax || log.humidity < humidMin);
    
    const problemKey = `sensor_${log.sensor_id}`;

    if (isTempIssue || isHumidIssue || isError) {
      if (isError && !sensorErrorStartTimeRef.current[log.sensor_id]) {
        sensorErrorStartTimeRef.current[log.sensor_id] = Date.now();
      }
      sensorErrorActiveRef.current[log.sensor_id] = true;

      const newAlert: AlertLogType = {
        ...log,
        status: isError ? 'error' : (isTempIssue && isHumidIssue ? 'both_high' : isTempIssue ? 'temperature_high' : 'humidity_high')
      };
      
      setAlertLogs(prev => {
        // ป้องกันการเพิ่มซ้ำในวินาทีเดียวกัน
        if (prev.length > 0 && prev[0].recorded_at === newAlert.recorded_at && prev[0].sensor_id === newAlert.sensor_id) {
          return prev;
        }
        return [newAlert, ...prev].slice(0, 50);
      });

      if (currentSettings.line_access_token && currentSettings.line_user_id) {
        const now = Date.now();
        const lastTime = lastNotifiedRef.current[log.sensor_id] || 0;
        const count = notificationCountsRef.current[problemKey] || 0;
        
        let intervalMinutes = 10;
        if (count === 0) {
          intervalMinutes = 0; // เตือนทันทีครั้งแรก
        } else if (count === 1) {
          intervalMinutes = 5; // ครั้งที่สองห่าง 5 นาที
        } else {
          intervalMinutes = Number(currentSettings.notify_interval) || 10;
        }

        const intervalMs = intervalMinutes * 60 * 1000;

        if (now - lastTime > intervalMs) {
          lastNotifiedRef.current = { ...lastNotifiedRef.current, [log.sensor_id]: now };
          notificationCountsRef.current[problemKey] = count + 1;
          
          const sensorName = currentSensorNames[log.sensor_id] || log.sensor_name;
          let message = '';
          
          if (isError) {
            message = `❌ แจ้งเตือน: เซนเซอร์ขัดข้อง (Sensor Error)\n📍 จุดที่วัด: ${sensorName}\n📌 ปัญหา: ไม่สามารถอ่านค่าจากเซนเซอร์ได้\n🔍 สาเหตุ: เซนเซอร์อาจชำรุด, สายสัญญาณหลุด หรือไฟเลี้ยงไม่พอ\n🛠️ คำแนะนำ: กรุณาตรวจสอบการเชื่อมต่อของเซนเซอร์ทันที`;
          } else {
            message = `⚠️ แจ้งเตือน: ค่าผิดปกติ\n📍 จุดที่วัด: ${sensorName}\n`;
            if (isTempIssue) {
              const status = log.temperature > tempMax ? 'สูงเกินเกณฑ์' : 'ต่ำกว่าเกณฑ์';
              message += `🌡️ อุณหภูมิ: ${log.temperature.toFixed(1)}°C (${status})\n`;
              message += `📊 เกณฑ์ที่ตั้งไว้: ${tempMin}-${tempMax}°C\n`;
            }
            if (isHumidIssue) {
              const status = log.humidity > humidMax ? 'สูงเกินเกณฑ์' : 'ต่ำกว่าเกณฑ์';
              message += `💧 ความชื้น: ${log.humidity.toFixed(0)}% (${status})\n`;
              message += `📊 เกณฑ์ที่ตั้งไว้: ${humidMin}-${humidMax}%\n`;
            }
          }
          message += `\n⏰ เวลา: ${format(new Date(log.recorded_at), 'HH:mm:ss')}`;

          // LINE Notification is now handled by the backend worker
        }
      }
    } else {
      // ตรวจสอบความต้องการแสดงประวัติค่ากลับมาเป็นปกติใน UI
      if (sensorErrorActiveRef.current[log.sensor_id]) {
        const recoveredAlert: AlertLogType = {
          ...log,
          status: 'recovered'
        };
        setAlertLogs(prev => {
          // ป้องกันการเพิ่มซ้ำในวินาทีเดียวกัน
          if (prev.length > 0 && prev[0].recorded_at === recoveredAlert.recorded_at && prev[0].sensor_id === recoveredAlert.sensor_id && prev[0].status === 'recovered') {
            return prev;
          }
          return [recoveredAlert, ...prev].slice(0, 50);
        });
        sensorErrorActiveRef.current[log.sensor_id] = false;
      }

      // ข้อมูลปกติ ให้รีเซ็ตตัวนับ
      if (sensorErrorStartTimeRef.current[log.sensor_id]) {
        const recoveryTime = Date.now();
        const startTime = sensorErrorStartTimeRef.current[log.sensor_id];
        const downtimeMs = recoveryTime - startTime;
        const minutes = Math.floor(downtimeMs / 60000);
        const seconds = Math.floor((downtimeMs % 60000) / 1000);
        
        const sensorName = currentSensorNames[log.sensor_id] || log.sensor_name;
        const recoveryMessage = `✅ แจ้งเตือน: เซนเซอร์กลับมาใช้งานปกติ\n📍 จุดที่วัด: ${sensorName}\n🕒 เริ่มขัดข้องเมื่อ: ${format(new Date(startTime), 'HH:mm:ss')}\n🕒 กลับมาเมื่อ: ${format(new Date(recoveryTime), 'HH:mm:ss')}\n⏱️ รวมเวลาที่ขัดข้อง: ${minutes} นาที ${seconds} วินาที`;
        
        delete sensorErrorStartTimeRef.current[log.sensor_id];

        if (currentSettings.line_access_token && currentSettings.line_user_id) {
          // LINE Notification is now handled by the backend worker
        }
      }
      notificationCountsRef.current[problemKey] = 0;
    }
  };

  // ดึงข้อมูลและตั้งค่า Realtime Subscription
  const fetchData = useCallback(async () => {
    try {
      // ดึงข้อมูลล่าสุดและข้อมูลประวัติพร้อมกันเพื่อความรวดเร็ว
      const latestPromise = supabase
        .from('Temp-sketch_mar24a')
        .select('id, created_at, t1, h1, t2, h2')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let historyQuery = supabase
        .from('Temp-sketch_mar24a')
        .select('id, created_at, t1, h1, t2, h2');

      if (timeRange === 'custom') {
        const start = new Date(`${customFilter.startDate}T${customFilter.startTime}:00`).toISOString();
        const end = new Date(`${customFilter.endDate}T${customFilter.endTime}:59`).toISOString();
        historyQuery = historyQuery.gte('created_at', start).lte('created_at', end);
      } else if (timeRange === '24h') {
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        historyQuery = historyQuery.gte('created_at', yesterday.toISOString());
      } else if (timeRange === '7d') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        historyQuery = historyQuery.gte('created_at', weekAgo.toISOString());
      } else if (timeRange === '30d') {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        historyQuery = historyQuery.gte('created_at', monthAgo.toISOString());
      }

      // ปรับ Limit ตามช่วงเวลาเพื่อลดปริมาณข้อมูลที่ส่ง
      const historyLimit = timeRange === 'realtime' ? 200 : 1000;
      const historyPromise = historyQuery
        .order('created_at', { ascending: false })
        .limit(historyLimit);

      const tempMax = Number(settings.temp_max);
      const tempMin = Number(settings.temp_min);
      const humidMax = Number(settings.humid_max);
      const humidMin = Number(settings.humid_min);

      const alertHistoryPromise = supabase
        .from('Temp-sketch_mar24a')
        .select('id, created_at, t1, h1, t2, h2')
        .order('created_at', { ascending: false })
        .limit(2000);

      const [latestRes, historyRes, alertHistoryRes] = await Promise.all([latestPromise, historyPromise, alertHistoryPromise]);

      if (latestRes.data) {
        setIsConnected(true);
        const log = latestRes.data;

        // Find latest valid non-zero/non-error values from history if needed
        let fallbackT1 = Number(log.t1) || 0;
        let fallbackH1 = Number(log.h1) || 0;
        let fallbackT2 = Number(log.t2) || 0;
        let fallbackH2 = Number(log.h2) || 0;

        if (historyRes.data && historyRes.data.length > 0) {
          if (fallbackT1 === 0 || fallbackH1 === 0) {
            const validRow = historyRes.data.find(r => r.t1 && Number(r.t1) !== 0 && Number(r.t1) !== -999);
            if (validRow) {
              if (fallbackT1 === 0) fallbackT1 = Number(validRow.t1);
              if (fallbackH1 === 0) fallbackH1 = Number(validRow.h1);
            }
          }
          if (fallbackT2 === 0) {
            const validRow = historyRes.data.find(r => r.t2 && Number(r.t2) !== 0 && Number(r.t2) !== -999);
            if (validRow) {
              fallbackT2 = Number(validRow.t2);
              fallbackH2 = Number(validRow.h2);
            }
          }
        }

        const newLatestData: Record<number, SensorLog> = {
          1: {
            id: log.id,
            sensor_id: 1,
            sensor_name: sensorNames[1] || 'เซนเซอร์ 1',
            temperature: fallbackT1,
            humidity: fallbackH1,
            recorded_at: log.created_at
          },
          2: {
            id: log.id,
            sensor_id: 2,
            sensor_name: sensorNames[2] || 'เซนเซอร์ 2',
            temperature: fallbackT2,
            humidity: fallbackH2,
            recorded_at: log.created_at
          }
        };
        setLatestData(newLatestData);
        setLastUpdated(new Date());

        // ตรวจสอบการแจ้งเตือนจากการ Polling
        [newLatestData[1], newLatestData[2]].forEach(log => {
          checkAndNotify(log, settingsRef.current, sensorNamesRef.current);
        });
      }

      if (historyRes.data) {
        const history = historyRes.data;
        const mappedHistory: SensorLog[] = new Array(history.length * 2);
        
        for (let i = history.length - 1; i >= 0; i--) {
          const log = history[i];
          const baseIdx = i * 2;
          
          mappedHistory[baseIdx] = {
            id: log.id * 2,
            sensor_id: 1,
            sensor_name: sensorNames[1] || 'เซนเซอร์ 1',
            temperature: Number(log.t1) || 0,
            humidity: Number(log.h1) || 0,
            recorded_at: log.created_at
          };
          
          mappedHistory[baseIdx + 1] = {
            id: log.id * 2 + 1,
            sensor_id: 2,
            sensor_name: sensorNames[2] || 'เซนเซอร์ 2',
            temperature: Number(log.t2) || 0,
            humidity: Number(log.h2) || 0,
            recorded_at: log.created_at
          };
        }
        
        setChartData(mappedHistory.reverse());
      }
      
      if (alertHistoryRes && alertHistoryRes.data) {
        const alerts: AlertLogType[] = [];
        const sensorErrorActive = { 1: false, 2: false };
        
        for (let i = alertHistoryRes.data.length - 1; i >= 0; i--) {
          const log = alertHistoryRes.data[i];
          const s1: SensorLog = {
            id: log.id * 2,
            sensor_id: 1,
            sensor_name: sensorNames[1] || 'เซนเซอร์ 1',
            temperature: Number(log.t1) || 0,
            humidity: Number(log.h1) || 0,
            recorded_at: log.created_at
          };
          
          const s2: SensorLog = {
            id: log.id * 2 + 1,
            sensor_id: 2,
            sensor_name: sensorNames[2] || 'เซนเซอร์ 2',
            temperature: Number(log.t2) || 0,
            humidity: Number(log.h2) || 0,
            recorded_at: log.created_at
          };

          [s1, s2].forEach(s => {
            const isS2 = s.sensor_id === 2;
            const isError = s.temperature === -999 || (!isS2 && s.humidity === -999);
            const isTempIssue = !isError && (s.temperature > tempMax || s.temperature < tempMin);
            const isHumidIssue = !isS2 && !isError && (s.humidity > humidMax || s.humidity < humidMin);
            const isAbnormal = isTempIssue || isHumidIssue || isError;
            
            if (isAbnormal) {
              if (!sensorErrorActive[s.sensor_id as 1 | 2]) {
                alerts.push({
                  ...s,
                  status: isError ? 'error' : (isTempIssue && isHumidIssue ? 'both_high' : isTempIssue ? 'temperature_high' : 'humidity_high')
                });
                sensorErrorActive[s.sensor_id as 1 | 2] = true;
              }
            } else if (sensorErrorActive[s.sensor_id as 1 | 2]) {
              alerts.push({
                ...s,
                status: 'recovered'
              });
              sensorErrorActive[s.sensor_id as 1 | 2] = false;
            }
          });
        }
        
        // Reverse alerts since they were added chronologically (oldest to newest)
        // and we want newest alerts first in the UI
        alerts.reverse();
        
        // Synchronize our ref with the latest state from history
        sensorErrorActiveRef.current = {
          1: sensorErrorActive[1],
          2: sensorErrorActive[2]
        };
        
        setAlertLogs(alerts.slice(0, 100));
      }

    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, [timeRange, customFilter, sensorNames, settings.temp_max, settings.temp_min, settings.humid_max, settings.humid_min]);

  useEffect(() => {
    fetchSettings();
    fetchData();

    // ตั้งค่า Polling เป็น fallback (อัพเดททุกๆ 10 วินาที เพื่อความรวดเร็วและเสถียรที่สุด)
    const pollInterval = setInterval(() => {
      if (!showSettings) {
        fetchData();
        fetchSettings();
      }
    }, 10000);

    // ตรวจสอบสถานะออฟไลน์ทุกๆ 1 นาที
    const offlineCheckInterval = setInterval(async () => {
      const currentSettings = settingsRef.current;
      const currentLatestData = latestDataRef.current;
      const currentSensorNames = sensorNamesRef.current;

      if (!currentSettings.line_access_token || !currentSettings.line_user_id) return;

      const sensors = Object.values(currentLatestData) as SensorLog[];
      if (sensors.length === 0) return;

      const lastSeen = new Date(sensors[0].recorded_at).getTime();
      const diffMinutes = (Date.now() - lastSeen) / (1000 * 60);
      
      // ถ้าไม่มีข้อมูลใหม่เกิน 10 นาที และยังไม่ได้แจ้งเตือนในช่วงเวลาที่กำหนด
      if (diffMinutes > 10) {
        if (!offlineStartTimeRef.current) {
          setOfflineStartTime(lastSeen);
        }
        
        const now = Date.now();
        const count = offlineNotificationCountRef.current;
        let intervalMinutes = 10;

        if (count === 0) {
          intervalMinutes = 0; // เตือนทันทีที่พบว่า Offline เกิน 10 นาที
        } else if (count === 1) {
          intervalMinutes = 5; // ครั้งที่สองห่าง 5 นาที
        } else {
          intervalMinutes = Number(currentSettings.notify_interval) || 10;
        }

        const intervalMs = intervalMinutes * 60 * 1000;
        
        if (now - lastOfflineNotifiedRef.current > intervalMs) {
          lastOfflineNotifiedRef.current = now;
          offlineNotificationCountRef.current += 1;
          const lastSeenTime = format(new Date(lastSeen), 'HH:mm:ss');
          const currentTimeStr = format(new Date(), 'HH:mm:ss');
          const message = `🔴 แจ้งเตือน: ระบบขาดการเชื่อมต่อ (Offline)\n📌 ปัญหา: ไม่ได้รับข้อมูลจากอุปกรณ์เกิน 10 นาที\n🕒 ข้อมูลล่าสุดเมื่อ: ${lastSeenTime}\n⏳ ขาดหายไปแล้ว: ${Math.floor(diffMinutes)} นาที\n🔍 สาเหตุ: อาจเกิดจาก WiFi หลุด, ไฟดับ หรือปัญหาการส่งข้อมูลไปยัง Server\n⏰ เวลาปัจจุบัน: ${currentTimeStr}`;
          
          // LINE Notification is now handled by the backend worker
        }
      } else {
        // ถ้าข้อมูลกลับมาปกติ ให้รีเซ็ตตัวนับ Offline
        offlineNotificationCountRef.current = 0;
      }
    }, 60000);

    // ตั้งค่า Supabase Realtime Subscription สำหรับข้อมูลเซนเซอร์
    const sensorSubscription = supabase
      .channel('Temp-sketch_mar24a_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Temp-sketch_mar24a' },
        (payload) => {
          const newLog = payload.new;
          const currentSensorNames = sensorNamesRef.current;
          const currentSettings = settingsRef.current;
          const currentTimeRange = timeRangeRef.current;
          
          setLatestData(prev => {
            const prev1 = prev[1];
            const prev2 = prev[2];

            const t1 = Number(newLog.t1) !== 0 ? Number(newLog.t1) : (prev1?.temperature || 0);
            const h1 = Number(newLog.h1) !== 0 ? Number(newLog.h1) : (prev1?.humidity || 0);
            const t2 = Number(newLog.t2) !== 0 ? Number(newLog.t2) : (prev2?.temperature || 0);
            const h2 = Number(newLog.h2) !== 0 ? Number(newLog.h2) : (prev2?.humidity || 0);

            const log1: SensorLog = {
              id: newLog.id * 2,
              sensor_id: 1,
              sensor_name: currentSensorNames[1] || 'เซนเซอร์ 1',
              temperature: t1,
              humidity: h1,
              recorded_at: newLog.created_at
            };

            const log2: SensorLog = {
              id: newLog.id * 2 + 1,
              sensor_id: 2,
              sensor_name: currentSensorNames[2] || 'เซนเซอร์ 2',
              temperature: t2,
              humidity: h2,
              recorded_at: newLog.created_at
            };

            // ตรวจสอบการแจ้งเตือนจาก Realtime (ไม่สนว่าอยู่หน้าไหนหรือเลือกช่วงเวลาอะไร)
            [log1, log2].forEach(log => {
              checkAndNotify(log, currentSettings, currentSensorNames);
            });

            if (currentTimeRange === 'realtime') {
              setChartData(prevChart => {
                const newData = [...prevChart, log1, log2];
                if (newData.length > 200) return newData.slice(newData.length - 200);
                return newData;
              });
            }

            return { 1: log1, 2: log2 };
          });
          setLastUpdated(new Date());
        }
      )
      .subscribe();

    const settingsSubscription = supabase
      .channel('device_settings_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'device_settings', filter: 'id=eq.1' },
        (payload) => {
          const newData = payload.new;
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
          if (newData.sensor_names) {
            const names = typeof newData.sensor_names === 'string' ? JSON.parse(newData.sensor_names) : newData.sensor_names;
            setSensorNames(names);
            localStorage.setItem('sensorNames', JSON.stringify(names));
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      clearInterval(offlineCheckInterval);
      sensorSubscription.unsubscribe();
      settingsSubscription.unsubscribe();
    };
  }, [fetchData, fetchSettings, showSettings]);

  // คำนวณสถานะรวมของระบบ
  const systemStatus = useMemo(() => {
    const sensors = Object.values(latestData) as SensorLog[];
    if (sensors.length === 0) return { type: 'loading', sensors: [] };
    
    // ตรวจสอบว่าเซนเซอร์ออฟไลน์หรือไม่ (ไม่มีข้อมูลใหม่เกิน 10 นาที)
    const lastSeen = new Date(sensors[0].recorded_at).getTime();
    const diffMinutes = (currentTime.getTime() - lastSeen) / (1000 * 60);
    const isOffline = diffMinutes > 10;
    const isLagging = false; // diffMinutes > 6 && diffMinutes <= 10;

    if (isOffline) {
      return { 
        type: 'offline', 
        sensors: sensors.map(s => sensorNames[s.sensor_id] || s.sensor_name),
        lag: Math.floor(diffMinutes),
        lastSeen: format(new Date(lastSeen), 'HH:mm:ss'),
        offlineStartTime: offlineStartTime
      };
    }

    if (isLagging) {
      return { 
        type: 'lagging', 
        sensors: sensors.map(s => sensorNames[s.sensor_id] || s.sensor_name),
        lag: Math.floor(diffMinutes),
        lastSeen: format(new Date(lastSeen), 'HH:mm:ss'),
        offlineStartTime: offlineStartTime
      };
    }
    
    const errorSensors = sensors.filter(s => {
      const isS2 = s.sensor_id === 2;
      return s.temperature === -999 || (!isS2 && s.humidity === -999);
    });
    if (errorSensors.length > 0) {
      return { type: 'error', sensors: errorSensors.map(s => sensorNames[s.sensor_id] || s.sensor_name) };
    }

    const isCritical = (s: SensorLog) => {
      const isS2 = s.sensor_id === 2;
      const isTempOut = s.temperature > settings.temp_max || s.temperature < settings.temp_min;
      if (isS2) {
        return false; // เซนเซอร์ 2 ไม่มีค่าความชื้น จึงไม่เข้าเงื่อนไขวิกฤต (ที่ต้องผิดปกติทั้ง 2 อย่าง)
      }
      const isHumidOut = s.humidity > settings.humid_max || s.humidity < settings.humid_min;
      return isTempOut && isHumidOut;
    };
    
    const isWarning = (s: SensorLog) => {
      const isS2 = s.sensor_id === 2;
      const isTempOut = s.temperature > settings.temp_max || s.temperature < settings.temp_min;
      if (isS2) {
        return isTempOut; // เซนเซอร์ 2 ตรวจสอบเฉพาะอุณหภูมิเท่านั้น
      }
      const isHumidOut = s.humidity > settings.humid_max || s.humidity < settings.humid_min;
      return isTempOut || isHumidOut;
    };

    const criticalSensors = sensors.filter(isCritical);
    if (criticalSensors.length > 0) {
      return { type: 'critical', sensors: criticalSensors.map(s => sensorNames[s.sensor_id] || s.sensor_name) };
    }

    const warningSensors = sensors.filter(isWarning);
    if (warningSensors.length > 0) {
      return { type: 'warning', sensors: warningSensors.map(s => sensorNames[s.sensor_id] || s.sensor_name) };
    }
    
    return { type: 'normal', sensors: [] };
  }, [latestData, currentTime, settings, sensorNames, offlineStartTime]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans selection:bg-zinc-200 dark:selection:bg-zinc-800 transition-colors duration-300">
      {/* LOGIN MODAL */}
      <AnimatePresence>
        {showLogin && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden"
            >
              <button 
                onClick={() => setShowLogin(false)}
                className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-emerald-500"></div>
              
              <div className="flex flex-col items-center mb-10">
                <div className="bg-blue-500/10 p-5 rounded-2xl mb-5 ring-1 ring-blue-500/20">
                  <Activity className="w-12 h-12 text-blue-500" />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Admin Login</h1>
                <p className="text-zinc-500 text-sm mt-2 font-medium">กรุณาเข้าสู่ระบบเพื่อจัดการการตั้งค่า</p>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">รหัสผ่านเข้าใช้งาน</label>
                  </div>
                  <div className="relative group">
                    <input 
                      ref={loginInputRef}
                      type="password"
                      autoFocus
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (loginPassword === '1234') {
                            setIsLoggedIn(true);
                            setShowLogin(false);
                            setShowSettings(true);
                            toast.success('เข้าสู่ระบบสำเร็จ');
                            setLoginPassword('');
                          } else {
                            toast.error('รหัสผ่านไม่ถูกต้อง');
                            setLoginPassword('');
                            setTimeout(() => loginInputRef.current?.focus(), 50);
                          }
                        }
                      }}
                      className="w-full bg-zinc-800/50 border border-zinc-700 rounded-2xl p-4 text-white outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder:text-zinc-600 font-mono tracking-widest"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                
                <button 
                  onClick={() => {
                    if (loginPassword === '1234') {
                      setIsLoggedIn(true);
                      setShowLogin(false);
                      setShowSettings(true);
                      toast.success('เข้าสู่ระบบสำเร็จ');
                      setLoginPassword('');
                    } else {
                      toast.error('รหัสผ่านไม่ถูกต้อง');
                      setLoginPassword('');
                      setTimeout(() => loginInputRef.current?.focus(), 50);
                    }
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  เข้าสู่ระบบ
                  <CheckCircle2 className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
                อุณภูมิตู้เก็บยา
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
              onClick={() => {
                if (isLoggedIn) {
                  setShowSettings(true);
                } else {
                  setShowLogin(true);
                }
              }}
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
              {/* LINE API LIMIT REACHED WARNING BANNER */}
              {(sensorNames as any).line_error === 'limit_reached' && !lineErrorDismissed && (
                <div className="mb-3 p-4 rounded-3xl border border-red-200 dark:border-red-900/50 bg-red-50/90 dark:bg-red-950/20 text-red-800 dark:text-red-300 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 shrink-0 mt-0.5 md:mt-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold">แจ้งเตือน: โควต้าส่งฟรีของ LINE Messaging API เต็มแล้ว (Error 429)</h4>
                      <p className="text-xs text-red-600 dark:text-red-400/80 mt-0.5 leading-relaxed">
                        ระบบไม่สามารถส่งการแจ้งเตือน Push Message ไปยัง LINE ได้ เนื่องจากใช้งานครบโควต้า 200 ข้อความ/เดือนของ LINE Bot แล้ว
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                    <button
                      onClick={handleLineErrorDismiss}
                      className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors"
                    >
                      รับทราบ
                    </button>
                    <button
                      onClick={() => {
                        setIsLoggedIn(true);
                        setShowSettings(true);
                        setActiveSettingsTab('line');
                      }}
                      className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-400 transition-colors"
                    >
                      ดูวิธีแก้ไขด่วน 🛠️
                    </button>
                  </div>
                </div>
              )}

              {/* SYSTEM STATUS BANNER */}
              {systemStatus.type !== 'loading' && (
                <div className={`mb-2 sm:mb-3 p-2 sm:p-3 rounded-2xl sm:rounded-3xl border flex items-center gap-3 sm:gap-4 transition-colors duration-300 shadow-sm ${
                  systemStatus.type === 'normal' 
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
                    : systemStatus.type === 'warning'
                    ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50 text-orange-800 dark:text-orange-300'
                    : systemStatus.type === 'lagging'
                    ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300'
                    : systemStatus.type === 'offline'
                    ? 'bg-zinc-100 dark:bg-zinc-900/40 border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-300 animate-pulse'
                    : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300'
                }`}>
                  <div className={`p-1.5 sm:p-2 rounded-full shrink-0 ${
                    systemStatus.type === 'normal' ? 'bg-emerald-100 dark:bg-emerald-900/50' :
                    systemStatus.type === 'warning' ? 'bg-orange-100 dark:bg-orange-900/50' :
                    systemStatus.type === 'lagging' ? 'bg-amber-100 dark:bg-amber-900/50' :
                    systemStatus.type === 'offline' ? 'bg-zinc-200 dark:bg-zinc-800' :
                    'bg-red-100 dark:bg-red-900/50'
                  }`}>
                    {systemStatus.type === 'normal' ? <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" /> : 
                     systemStatus.type === 'offline' ? <WifiOff className="w-5 h-5 sm:w-6 sm:h-6" /> :
                     systemStatus.type === 'lagging' ? <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" /> :
                     <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />}
                  </div>
                  <div>
                    <h2 className="font-semibold text-sm sm:text-lg leading-tight">
                      {systemStatus.type === 'normal' ? 'ระบบปกติ' :
                       systemStatus.type === 'lagging' ? 'การเชื่อมต่อล่าช้า (Lagging)' :
                       systemStatus.type === 'offline' ? 'เซนเซอร์ขาดการเชื่อมต่อ (Offline)' :
                       systemStatus.type === 'error' ? 'เซนเซอร์ขัดข้อง (Sensor Error)' :
                       systemStatus.type === 'critical' ? 'วิกฤต: พบความผิดปกติรุนแรง' :
                       'พบความผิดปกติ'}
                    </h2>
                    <p className="text-[10px] sm:text-sm opacity-80 mt-0.5">
                      {systemStatus.type === 'normal' ? 'อุณหภูมิและความชื้นอยู่ในเกณฑ์มาตรฐาน' :
                       systemStatus.type === 'lagging' ? (
                         <>
                           ข้อมูลล่าช้า {systemStatus.lag} นาที (ล่าสุดเมื่อ {systemStatus.lastSeen})
                           {systemStatus.offlineStartTime && (
                             <span className="block text-[9px] mt-0.5 opacity-70">
                               ช่วงเวลาที่ขาดหาย: {format(new Date(systemStatus.offlineStartTime), 'HH:mm:ss')} - ปัจจุบัน
                             </span>
                           )}
                         </>
                       ) :
                       systemStatus.type === 'offline' ? (
                         <>
                           ขาดการเชื่อมต่อ {systemStatus.lag} นาที (ล่าสุดเมื่อ {systemStatus.lastSeen})
                           {systemStatus.offlineStartTime && (
                             <span className="block text-[9px] mt-0.5 opacity-70">
                               ช่วงเวลาที่ขาดหาย: {format(new Date(systemStatus.offlineStartTime), 'HH:mm:ss')} - ปัจจุบัน
                             </span>
                           )}
                         </>
                       ) :
                       systemStatus.type === 'error' ? `พบปัญหาที่: ${systemStatus.sensors.join(', ')}` :
                       `กรุณาตรวจสอบ: ${systemStatus.sensors.join(', ')}`}
                    </p>
                  </div>
                </div>
              )}

              {/* SENSOR CARDS (PRIMARY INFO) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6 mb-2 sm:mb-3">
                {[1, 2].map((sensorId) => {
                  const data = latestData[sensorId];
                  return (
                    <div key={sensorId}>
                      <SensorCard 
                        data={data || null} 
                        sensorName={sensorNames[sensorId] || (sensorId === 1 ? 'เซนเซอร์ 1 (DHT22)' : 'เซนเซอร์ 2 (DS18B20)')} 
                        onNameChange={(newName) => handleNameChange(sensorId, newName)}
                        thresholds={{ 
                          tempMin: settings.temp_min, 
                          tempMax: settings.temp_max, 
                          humidMin: settings.humid_min, 
                          humidMax: settings.humid_max 
                        }}
                      />
                    </div>
                  );
                })}
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
                className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl"
              >
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Settings className="w-5 h-5 text-zinc-500" />
                    แผงการตั้งค่าและการเชื่อมต่อ
                  </h2>
                  <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Tab Header bar */}
                <div className="flex border-b border-zinc-100 dark:border-zinc-800 px-6 bg-zinc-50/50 dark:bg-zinc-900/50">
                  <button
                    type="button"
                    onClick={() => setActiveSettingsTab('threshold')}
                    className={`flex-1 py-3 text-xs md:text-sm font-semibold border-b-2 transition-colors ${
                      activeSettingsTab === 'threshold'
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                  >
                    เกณฑ์แจ้งเตือน
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSettingsTab('line')}
                    className={`flex-1 py-3 text-xs md:text-sm font-semibold border-b-2 transition-colors ${
                      activeSettingsTab === 'line'
                        ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                        : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                  >
                    การแจ้งเตือน LINE
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSettingsTab('arduino')}
                    className={`flex-1 py-3 text-xs md:text-sm font-semibold border-b-2 transition-colors ${
                      activeSettingsTab === 'arduino'
                        ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                        : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                  >
                    คู่มือโค้ด Arduino 🔌
                  </button>
                </div>
                
                <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                  
                  {activeSettingsTab === 'threshold' && (
                    <div className="space-y-6">
                      <p className="text-xs text-zinc-400">กำหนดเกณฑ์ขั้นต่ำและสูงสุดสำหรับตัวแปรอุณหภูมิและความชื้น ระบบจะส่งการแจ้งเตือนหา LINE หากเซนเซอร์ตรวจจับค่าผิดปกติได้นอกเกณฑ์นี้</p>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-zinc-500 uppercase tracking-wider">อุณหภูมิต่ำสุด (°C)</label>
                          <input 
                            type="number" 
                            step="0.1"
                            value={localSettings?.temp_min || ''} 
                            onChange={(e) => setLocalSettings({...localSettings, temp_min: e.target.value})}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500/50"
                            autoFocus
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-zinc-500 uppercase tracking-wider">อุณหภูมิสูงสุด (°C)</label>
                          <input 
                            type="number" 
                            step="0.1"
                            value={localSettings?.temp_max || ''} 
                            onChange={(e) => setLocalSettings({...localSettings, temp_max: e.target.value})}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-red-500/50"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-zinc-500 uppercase tracking-wider">ความชื้นต่ำสุด (%)</label>
                          <input 
                            type="number" 
                            step="1"
                            value={localSettings?.humid_min || ''} 
                            onChange={(e) => setLocalSettings({...localSettings, humid_min: e.target.value})}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-zinc-500 uppercase tracking-wider">ความชื้นสูงสุด (%)</label>
                          <input 
                            type="number" 
                            step="1"
                            value={localSettings?.humid_max || ''} 
                            onChange={(e) => setLocalSettings({...localSettings, humid_max: e.target.value})}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-red-500/50"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-500 uppercase tracking-wider">ระยะเวลาแจ้งเตือนซ้ำ (นาที)</label>
                        <input 
                          type="number" 
                          step="1"
                          value={localSettings?.notify_interval || ''} 
                          onChange={(e) => setLocalSettings({...localSettings, notify_interval: e.target.value})}
                          className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-zinc-500/50"
                        />
                        <p className="text-xs text-zinc-400">ระยะเวลาขั้นต่ำก่อนจะส่ง LINE แจ้งเตือนซ้ำอีกครั้ง เพื่อป้องกันการส่งรบกวนถี่ปะทุเกินไป</p>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'line' && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        ตั้งค่าการแจ้งเตือน LINE (Messaging API)
                      </h3>

                      {/* DETAILED EXPLANATION FOR LINE 429 LIMIT REACHED */}
                      {(sensorNames as any).line_error === 'limit_reached' && (
                        <div className="p-4 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300 text-xs space-y-2.5">
                          <div className="font-bold flex items-center gap-1.5 text-red-700 dark:text-red-400">
                            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                            พบข้อผิดพลาด: โควต้าการส่งฟรีรายเดือนเต็มแล้ว (LINE API 429)
                          </div>
                          <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
                            บัญชี LINE Bot ของคุณจำกัดการ Push Message ในแพ็กเกจเริ่มแรกไว้ที่ <strong>200 ข้อความต่อเดือน</strong> ปัจจุบันใช้งานเต็มโควต้าแล้ว จึงทำให้ไม่สามารถส่งแจ้งเตือนผ่าน API นี้ได้ชั่วคราว
                          </p>
                          <div className="font-bold text-zinc-800 dark:text-zinc-200 pt-1">
                            💡 วิธีแก้ไขเพื่อให้ระบบกลับมาแจ้งเตือนได้ทันที (ฟรี 100% และไม่มีข้อจำกัด):
                          </div>
                          <div className="leading-relaxed font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 dark:bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/25">
                            <div className="font-bold text-emerald-700 dark:text-emerald-400 mb-1">สลับไปใช้บริการ LINE Notify:</div>
                            <ol className="list-decimal pl-4 space-y-1">
                              <li>ลบค่าในช่อง <strong>"LINE User ID" ด้านล่างให้ว่างเปล่าโดยสมบูรณ์</strong></li>
                              <li>ออกรหัส Token จากบริการ <a href="https://notify-bot.line.me/" target="_blank" rel="noreferrer" className="underline font-bold text-emerald-600 dark:text-emerald-400">LINE Notify (คลิกที่นี่)</a></li>
                              <li>นำรหัส Token ที่ได้มากรอกในช่อง <strong>"LINE Channel Access Token"</strong> ด้านล่างนี้</li>
                            </ol>
                            <p className="mt-2 text-[11px] text-zinc-500">
                              * การใช้ LINE Notify ส่งฟรี ไม่จำกัดจำนวนข้อความต่อเดือน ทำให้ระบบเฝ้าระวังตู้ยาทำงานได้ต่อเนื่องไม่มีวันหลุด!
                            </p>
                          </div>
                        </div>
                      )}
                      
                      <p className="text-xs text-zinc-400">กรอกรหัสสำหรับเชื่อมต่อแจ้งเตือนเข้าแอป LINE โดยตรงเพื่อรับข่าวสารสถานะตู้ยาได้ทันท่วงที</p>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-500 uppercase tracking-wider block">LINE Channel Access Token</label>
                        <textarea 
                          rows={2}
                          value={localSettings?.line_access_token || ''} 
                          onChange={(e) => setLocalSettings({...localSettings, line_access_token: e.target.value})}
                          placeholder="กรอก Channel Access Token ยาวๆ ที่ได้จาก LINE Developer..."
                          className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500/50 text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-500 uppercase tracking-wider block">LINE User ID</label>
                        <input 
                          type="text" 
                          value={localSettings?.line_user_id || ''} 
                          onChange={(e) => setLocalSettings({...localSettings, line_user_id: e.target.value})}
                          placeholder="Ua36e33071aed1a4de990b282..."
                          className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm font-mono"
                        />
                      </div>

                      <div className="flex flex-col gap-2 pt-2">
                        <button
                          type="button"
                          onClick={sendTestNotification}
                          disabled={isSendingTest}
                          className="w-full px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-200/50 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {isSendingTest ? 'กำลังส่งข้อความทดสอบ...' : 'ทดสอบส่งข้อความแจ้งเตือนไปยัง LINE 🔔'}
                        </button>

                        <a
                          href="https://line.me/R/"
                          target="_blank"
                          rel="noreferrer"
                          className="w-full px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium border border-zinc-200/20 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                          เด้งเปิดแอป LINE (เพื่อเพิ่มเพื่อน/คัดลอก ID) 📲
                        </a>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'arduino' && (
                    <div className="space-y-6">
                      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/40 dark:border-amber-900/30 rounded-2xl p-4 space-y-2">
                        <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          สาเหตุหลักที่บอร์ดส่งข้อมูลเข้าเว็บไม่สำเร็จ:
                        </h4>
                        <ul className="text-xs text-amber-700 dark:text-amber-400 list-decimal pl-4 space-y-1">
                          <li><strong>ผิดโดเมน/URL:</strong> บอร์ดอาจจะส่งไปที่อยู่เว็บเก่า (เช่น Vercel) แต่ปัจจุบันเปลี่ยนที่อยู่เว็บแล้ว ให้ตรวจสอบ URL ปลายทางให้ตรง</li>
                          <li><strong>ติด SSL Handshake:</strong> ESP32 หรือ ESP8266 เชื่อมต่อผ่าน HTTPS จะขัดข้องทันทีหากไม่มีการข้าม SSL ให้เขียนโค้ดเพิ่มคำสั่ง <code className="bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded text-amber-900 font-mono">client.setInsecure();</code></li>
                          <li><strong>ฟอร์แมตข้อมูลไม่ตรง:</strong> ตู้ส่งค่า <code className="font-mono">t1, h1, t2, h2</code> หากส่งสลับรูปแบบ เว็บจะไม่บันทึก แต่ระบบเซิร์ฟเวอร์ของเรามีระบบ Auto-Fallback แก้ไขปัญหาจุดนี้เรียบร้อยแล้ว!</li>
                        </ul>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-violet-500" />
                            ช่องทางเชื่อมต่อที่ 1: ส่งผ่าน Web Proxy (แนะนำที่สุด ⭐⭐⭐)
                          </h4>
                        </div>
                        <p className="text-xs text-zinc-500">ง่ายที่สุด ปลอดภัยสูงสุด บอร์ดส่งเข้าเว็บบอร์ดยิงตรงไปที่ URL ปลายทางนี้ ตัวแอปจะทำหน้าที่ส่งต่อไปยัง Supabase และ LINE ให้เองโดยที่บอร์ดไม่ต้องเก็บคีย์ลับใดๆ</p>
                        
                        <div className="bg-zinc-50 dark:bg-zinc-800/80 rounded-xl p-3 border border-zinc-200/50 dark:border-zinc-700/50 space-y-1.5 font-mono text-xs">
                          <div className="text-zinc-400 text-[10px] uppercase">POST ENDPOINT URL</div>
                          <div className="text-blue-600 dark:text-blue-400 font-semibold break-all select-all flex justify-between items-center gap-2">
                            <span>{typeof window !== 'undefined' ? window.location.origin : 'https://temp-monitor-black.vercel.app'}/api/data</span>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(`${typeof window !== 'undefined' ? window.location.origin : 'https://temp-monitor-black.vercel.app'}/api/data`);
                                toast.success('คัดลอก Endpoint สำเร็จ!');
                              }}
                              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                              title="คัดลอกลิงก์"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="text-zinc-400 text-[10px] uppercase mt-2">JSON PAYLOAD FORMAT</div>
                          <div className="text-zinc-700 dark:text-zinc-300">{"{\"t1\": 24.5, \"h1\": 55.0, \"t2\": 25.1, \"h2\": 54.5}"}</div>
                        </div>
                      </div>

                      <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                          <ExternalLink className="w-4 h-4 text-zinc-500" />
                          ช่องทางเชื่อมต่อที่ 2: เชื่อมต่อ Supabase โดยตรง (Direct REST)
                        </h4>
                        <p className="text-xs text-zinc-500">เหมาะสำหรับการต่อตรงไม่ผ่านตัวกลาง แต่คุณจำเป็นต้องเพิ่ม HTTP Headers สองตัวนี้ในบอร์ดไม่อย่างนั้นฐานข้อมูลจะขึ้น 401 Unauthorized:</p>
                        
                        <div className="bg-zinc-50 dark:bg-zinc-800/80 rounded-xl p-4 border border-zinc-200/50 dark:border-zinc-700/50 space-y-2 font-mono text-xs break-all">
                          <div>
                            <span className="text-zinc-400 text-[10px] block uppercase">Direct URL</span>
                            <span className="text-zinc-700 dark:text-zinc-300 select-all">https://tzjmorrkocoxihtsyrfy.supabase.co/rest/v1/Temp-sketch_mar24a</span>
                          </div>
                          <div>
                            <span className="text-zinc-400 text-[10px] block uppercase">Header: apikey</span>
                            <span className="text-zinc-600 dark:text-zinc-400 select-all text-[10px]">eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6am1vcnJrb2NveGlodHN5cmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDk3MDUsImV4cCI6MjA4NzcyNTcwNX0.SirelOHD7cp51HyM7I5eKTchUfMrDss0asZfAJVo5k8</span>
                          </div>
                          <div>
                            <span className="text-zinc-400 text-[10px] block uppercase">Header: Authorization</span>
                            <span className="text-zinc-600 dark:text-zinc-400 select-all text-[10px]">Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6am1vcnJrb2NveGlodHN5cmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDk3MDUsImV4cCI6MjA4NzcyNTcwNX0.SirelOHD7cp51HyM7I5eKTchUfMrDss0asZfAJVo5k8</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                        <div className="flex justify-between items-center">
                          <h4 className="text-sm font-bold text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                            <Cpu className="w-4 h-4" />
                            โค้ดสำเร็จรูปสเก็ตช์ ESP32 (พร้อมใช้ 100%)
                          </h4>
                          <button
                            type="button"
                            onClick={copyCodeToClipboard}
                            className="px-3 py-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 dark:bg-violet-950/40 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-400 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            คัดลอกโค้ดทั้งหมด 📋
                          </button>
                        </div>
                        <p className="text-xs text-zinc-500">คัดลอกสเก็ตช์ด้านล่างไปวางบนโปรแกรม Arduino IDE ของคุณเพื่อทดสอบการเชื่อมต่อได้ทันที:</p>
                        
                        <div className="bg-zinc-950 text-zinc-300 rounded-xl p-4 font-mono text-[10px] overflow-x-auto max-h-[300px] leading-relaxed relative">
                          <pre>{getArduinoCode(typeof window !== 'undefined' ? window.location.origin : 'https://temp-monitor-black.vercel.app')}</pre>
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 flex gap-3">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    ปิดหน้าต่าง
                  </button>
                  {activeSettingsTab !== 'arduino' && (
                    <button 
                      onClick={saveSettings}
                      disabled={isSavingSettings}
                      className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSavingSettings ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                    </button>
                  )}
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
