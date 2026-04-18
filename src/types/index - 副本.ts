// 项目管理类型
export interface Project {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

// 温湿度传感器参数
export interface TemperatureHumiditySensorConfig {
  enabled: boolean;
  interval: number; // 采集间隔(秒)
  precision: '0.1' | '0.01' | '0.001'; // 采集精度
  port: string; // 串口号，例如 COM5
  baudrate: number; // 波特率，例如 9600
}

// 热辐射传感器参数
export interface ThermalRadiationSensorConfig {
  enabled: boolean;
  interval: number;
  precision: '0.1' | '0.01' | '0.001';
  port: string; // 串口号，例如 COM6
  baudrate: number; // 波特率，例如 9600
}

// 双目摄像头参数
export interface BinocularCameraConfig {
  enabled: boolean;
  frameRate: 15 | 30 | 60;
  mode: 'left' | 'right' | 'both';
  imageCaptureInterval: number; // 图像采集间隔(秒)
}

// 光谱照度计参数
export interface SpectrometerConfig {
  enabled: boolean;
  interval: number;
  precision: 'low' | 'medium' | 'high';
  port: string; // 串口号，例如 COM7
  baudrate: number; // 波特率，例如 9600
}

// WiFi CSI配置
export interface WifiCSIConfig {
  enabled: boolean;
  connected: boolean;
}

// 温湿度传感器保存设置
export interface TemperatureHumiditySaveConfig {
  enabled: boolean; // 是否保存数据
}

// 热辐射传感器保存设置
export interface ThermalRadiationSaveConfig {
  enabled: boolean; // 是否保存数据
}

// 光谱照度计保存设置
export interface SpectrometerSaveConfig {
  enabled: boolean; // 是否保存数据
}

// 双目摄像头保存设置（与后端 artifact_saver.py 一致）
export interface BinocularCameraSaveConfig {
  save_raw_video: boolean; // 是否保存原始视频
  save_tracked_video: boolean; // 是否保存追踪视频
  save_raw_images: boolean; // 是否保存原始图像
  save_tracked_images: boolean; // 是否保存追踪后图像
  save_person_clips: boolean; // 是否保存人物片段
  save_classification_results: boolean; // 是否保存分类结果
  raw_image_interval: number; // 原始图像采集间隔(帧)
  tracked_image_interval: number; // 追踪图像采集间隔(帧)
  video_fps: number; // 视频帧率
  tracked_video_view: 'left' | 'right';
  tracked_image_views: 'left' | 'right' | 'both';
  raw_image_views: 'left' | 'right' | 'both';
  raw_video_view: 'left' | 'right' | 'both';
}

// WiFi CSI保存设置
export interface WifiCSISaveConfig {
  save_raw_csi: boolean; // 是否保存原始CSI数据
  save_slice_data: boolean; // 是否保存切片数据
}

// 保存设置总览
export interface SaveConfig {
  temperatureHumidity: TemperatureHumiditySaveConfig;
  thermalRadiation: ThermalRadiationSaveConfig;
  spectrometer: SpectrometerSaveConfig;
  binocularCamera: BinocularCameraSaveConfig;
  wifiCSI: WifiCSISaveConfig;
}

// 采集状态
export type CollectionStatus = 'idle' | 'collecting' | 'error';

// 传感器配置总览
export interface SensorConfig {
  temperatureHumidity: TemperatureHumiditySensorConfig;
  thermalRadiation: ThermalRadiationSensorConfig;
  binocularCamera: BinocularCameraConfig;
  spectrometer: SpectrometerConfig;
  wifiCSI: WifiCSIConfig;
}

// 采集到的数据点
export interface TemperatureHumidityData {
  timestamp: Date;
  airTemperature: number;
  relativeHumidity: number;
}

export interface ThermalRadiationData {
  timestamp: Date;
  blackGlobeTemperature: number;
}

export interface IlluminanceData {
  timestamp: Date;
  illuminance: number;
  spectrum: number[];
  colorTemperature?: number;
}

export interface CameraFrame {
  timestamp: Date;
  leftFrame?: string;
  rightFrame?: string;
  detections: Detection[];
}

export interface Detection {
  id: string;
  bbox: [number, number, number, number];
  label: string;
  confidence: number;
  action?: string;
}

export interface CSIData {
  timestamp: Date;
  amplitude: number[];
  phase: number[];
  subcarrierIndex: number[];
}

// 处理后的结果
export interface ProcessedResult {
  timestamp: Date;
  id: string;
  airTemperature?: number;
  relativeHumidity?: number;
  blackGlobeTemperature?: number;
  action?: string;
  actionConfidence?: number;
  illuminance?: number;
}

// 采集错误
export interface CollectionError {
  sensor: string;
  message: string;
  timestamp: Date;
}

// 传感器状态
export interface SensorStatus {
  temperatureHumidity: 'idle' | 'active' | 'error';
  thermalRadiation: 'idle' | 'active' | 'error';
  binocularCamera: 'idle' | 'active' | 'error';
  spectrometer: 'idle' | 'active' | 'error';
  wifiCSI: 'idle' | 'connected' | 'error';
}

// 数据来源状态
export interface SensorDataSource {
  temperatureHumidity: 'real' | 'simulated';
  thermalRadiation: 'real' | 'simulated';
  spectrometer: 'real' | 'simulated';
}

// App全局状态
export interface AppState {
  currentProject: Project | null;
  projects: Project[];
  sensorConfig: SensorConfig;
  saveConfig: SaveConfig;
  collectionStatus: CollectionStatus;
  sensorStatus: SensorStatus;
  sensorDataSource: SensorDataSource;
  errors: CollectionError[];
  temperatureHumidityData: TemperatureHumidityData[];
  thermalRadiationData: ThermalRadiationData[];
  illuminanceData: IlluminanceData[];
  cameraFrame: CameraFrame | null;
  csiData: CSIData | null;
  results: ProcessedResult[];
}

// Action类型
export type AppAction =
  | { type: 'SET_PROJECTS'; payload: Project[] }
  | { type: 'SET_CURRENT_PROJECT'; payload: Project | null }
  | { type: 'ADD_PROJECT'; payload: Project }
  | { type: 'UPDATE_SENSOR_CONFIG'; payload: Partial<SensorConfig> }
  | { type: 'UPDATE_SAVE_CONFIG'; payload: Partial<SaveConfig> }
  | { type: 'SET_COLLECTION_STATUS'; payload: CollectionStatus }
  | { type: 'SET_SENSOR_STATUS'; payload: Partial<SensorStatus> }
  | { type: 'SET_SENSOR_DATA_SOURCE'; payload: Partial<SensorDataSource> }
  | { type: 'ADD_ERROR'; payload: CollectionError }
  | { type: 'CLEAR_ERRORS' }
  | { type: 'ADD_TEMPERATURE_HUMIDITY_DATA'; payload: TemperatureHumidityData }
  | { type: 'ADD_THERMAL_RADIATION_DATA'; payload: ThermalRadiationData }
  | { type: 'ADD_ILLUMINANCE_DATA'; payload: IlluminanceData }
  | { type: 'SET_CAMERA_FRAME'; payload: CameraFrame }
  | { type: 'SET_CSI_DATA'; payload: CSIData }
  | { type: 'ADD_RESULT'; payload: ProcessedResult }
  | { type: 'CLEAR_DATA' };