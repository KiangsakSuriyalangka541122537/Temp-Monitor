export interface SensorLog {
  id: number;
  sensor_id: number;
  sensor_name: string;
  temperature: number;
  humidity: number;
  recorded_at: string;
}

export interface AlertLog {
  id: number;
  sensor_id: number;
  sensor_name: string;
  temperature: number;
  humidity: number;
  recorded_at: string;
  status: 'temperature_high' | 'humidity_high' | 'both_high' | 'error';
}
