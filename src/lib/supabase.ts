import { createClient } from '@supabase/supabase-js';

// Supabase Configuration
// ใช้ค่าจาก environment variables หรือใช้ค่าเริ่มต้นที่ผู้ใช้ระบุมา
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tzjmorrkocoxihtsyrfy.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6am1vcnJrb2NveGlodHN5cmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDk3MDUsImV4cCI6MjA4NzcyNTcwNX0.SirelOHD7cp51HyM7I5eKTchUfMrDss0asZfAJVo5k8';

// สร้าง Supabase client สำหรับเชื่อมต่อกับฐานข้อมูล
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
