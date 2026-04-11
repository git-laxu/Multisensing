import React, { createContext, useContext, useReducer, ReactNode, useCallback, useEffect } from 'react';
import {
  AppState,
  AppAction,
  Project,
  SensorConfig,
  SaveConfig,
  CollectionStatus,
  SensorStatus,
  TemperatureHumidityData,
  ThermalRadiationData,
  IlluminanceData,
  CameraFrame,
  CSIData,
  ProcessedResult,
  CollectionError,
} from '../types';
import * as api from '../services/api';

// 初始传感器配置
const initialSensorConfig: SensorConfig = {
  temperatureHumidity: {
    enabled: true,
    interval: 5,
    precision: '0.1',
  },
  thermalRadiation: {
    enabled: true,
    interval: 5,
    precision: '0.1',
  },
  binocularCamera: {
    enabled: true,
    frameRate: 30,
    mode: 'right',
    imageCaptureInterval: 30,
  },
  spectrometer: {
    enabled: true,
    interval: 5,
    precision: 'medium',
  },
  wifiCSI: {
    enabled: false,
    connected: false,
  },
};

// 初始保存设置
const initialSaveConfig: SaveConfig = {
  temperatureHumidity: {
    enabled: true,
  },
  thermalRadiation: {
    enabled: true,
  },
  spectrometer: {
    enabled: true,
  },
  binocularCamera: {
    save_raw_video: false,
    save_tracked_video: true,
    save_raw_images: false,
    save_tracked_images: true,
    save_person_clips: true,
    save_classification_results: true,
    raw_image_interval: 30,
    tracked_image_interval: 30,
    video_fps: 20,
    tracked_video_view: 'right',
    tracked_image_views: 'both',
    raw_image_views: 'both',
    raw_video_view: 'both',
  },
  wifiCSI: {
    save_raw_csi: true,
    save_slice_data: true,
  },
};

// 初始状态
const initialState: AppState = {
  currentProject: null,
  projects: [],
  sensorConfig: initialSensorConfig,
  saveConfig: initialSaveConfig,
  collectionStatus: 'idle',
  sensorStatus: {
    temperatureHumidity: 'idle',
    thermalRadiation: 'idle',
    binocularCamera: 'idle',
    spectrometer: 'idle',
    wifiCSI: 'idle',
  },
  errors: [],
  temperatureHumidityData: [],
  thermalRadiationData: [],
  illuminanceData: [],
  cameraFrame: null,
  csiData: null,
  results: [],
};

// 本地存储键名
const LOCAL_STORAGE_KEYS = {
  PROJECTS: 'multi_sensor_projects',
  SESSIONS: 'multi_sensor_sessions',
};

// ============================================================================
// 本地存储辅助函数
// ============================================================================

interface LocalProjectInfo {
  name: string;
  created_at: string;
  updated_at: string;
  session_count: number;
  total_size: number;
}

interface LocalSessionInfo {
  id: string;
  name: string;
  path: string;
  created_at: string;
  size: number;
}

function getLocalProjects(): LocalProjectInfo[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEYS.PROJECTS);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('读取本地项目失败:', e);
  }
  return [];
}

function saveLocalProjects(projects: LocalProjectInfo[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.error('保存本地项目失败:', e);
  }
}

function getLocalSessions(projectName: string): LocalSessionInfo[] {
  try {
    const data = localStorage.getItem(`${LOCAL_STORAGE_KEYS.SESSIONS}_${projectName}`);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('读取本地sessions失败:', e);
  }
  return [];
}

function saveLocalSessions(projectName: string, sessions: LocalSessionInfo[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEYS.SESSIONS}_${projectName}`, JSON.stringify(sessions));

    // 同时更新项目的session_count和total_size
    const projects = getLocalProjects();
    const projectIndex = projects.findIndex(p => p.name === projectName);
    if (projectIndex >= 0) {
      projects[projectIndex].session_count = sessions.length;
      projects[projectIndex].total_size = sessions.reduce((sum, s) => sum + s.size, 0);
      projects[projectIndex].updated_at = new Date().toISOString();
      saveLocalProjects(projects);
    }
  } catch (e) {
    console.error('保存本地sessions失败:', e);
  }
}

// Reducer函数
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload };

    case 'SET_CURRENT_PROJECT':
      return { ...state, currentProject: action.payload };

    case 'ADD_PROJECT':
      return {
        ...state,
        projects: [...state.projects, action.payload],
        currentProject: action.payload,
      };

    case 'UPDATE_SENSOR_CONFIG':
      return {
        ...state,
        sensorConfig: { ...state.sensorConfig, ...action.payload },
      };

    case 'UPDATE_SAVE_CONFIG':
      return {
        ...state,
        saveConfig: { ...state.saveConfig, ...action.payload },
      };

    case 'SET_COLLECTION_STATUS':
      return { ...state, collectionStatus: action.payload };

    case 'SET_SENSOR_STATUS':
      return {
        ...state,
        sensorStatus: { ...state.sensorStatus, ...action.payload },
      };

    case 'ADD_ERROR':
      return {
        ...state,
        errors: [...state.errors.slice(-9), action.payload],
      };

    case 'CLEAR_ERRORS':
      return { ...state, errors: [] };

    case 'ADD_TEMPERATURE_HUMIDITY_DATA':
      return {
        ...state,
        temperatureHumidityData: [
          ...state.temperatureHumidityData.slice(-59),
          action.payload,
        ],
      };

    case 'ADD_THERMAL_RADIATION_DATA':
      return {
        ...state,
        thermalRadiationData: [
          ...state.thermalRadiationData.slice(-59),
          action.payload,
        ],
      };

    case 'ADD_ILLUMINANCE_DATA':
      return {
        ...state,
        illuminanceData: [...state.illuminanceData.slice(-59), action.payload],
      };

    case 'SET_CAMERA_FRAME':
      return { ...state, cameraFrame: action.payload };

    case 'SET_CSI_DATA':
      return { ...state, csiData: action.payload };

    case 'ADD_RESULT':
      return {
        ...state,
        results: [...state.results.slice(-99), action.payload],
      };

    case 'CLEAR_DATA':
      return {
        ...state,
        temperatureHumidityData: [],
        thermalRadiationData: [],
        illuminanceData: [],
        cameraFrame: null,
        csiData: null,
        results: [],
        errors: [],
      };

    default:
      return state;
  }
}

// Context类型
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  // 便捷方法
  loadProjects: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  deleteProject: (name: string) => Promise<void>;
  selectProject: (project: Project) => void;
  updateSensorConfig: (config: Partial<SensorConfig>) => void;
  updateSaveConfig: (config: Partial<SaveConfig>) => void;
  startCollection: () => void;
  stopCollection: () => void;
  connectCSI: () => void;
  disconnectCSI: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider组件
interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    try {
      // 先尝试从后端获取
      const response = await api.getProjects();
      const projects: Project[] = response.projects.map((p) => ({
        id: p.name,
        name: p.name,
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at),
      }));
      dispatch({ type: 'SET_PROJECTS', payload: projects });
    } catch (error) {
      // 后端不可用时，使用本地存储
      console.warn('后端服务不可用，使用本地存储:', error);
      const localProjects = getLocalProjects();
      const projects: Project[] = localProjects.map((p) => ({
        id: p.name,
        name: p.name,
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at),
      }));
      dispatch({ type: 'SET_PROJECTS', payload: projects });
    }
  }, []);

  // 创建项目
  const createProject = useCallback(async (name: string) => {
    try {
      // 先尝试调用后端API
      await api.createProject(name);
      await loadProjects();
    } catch (error) {
      // 后端不可用时，使用本地存储
      console.warn('后端服务不可用，使用本地存储创建项目:', error);
      const localProjects = getLocalProjects();

      // 检查是否已存在
      if (localProjects.some(p => p.name === name)) {
        throw new Error('项目已存在');
      }

      const newLocalProject: LocalProjectInfo = {
        name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        session_count: 0,
        total_size: 0,
      };

      localProjects.push(newLocalProject);
      saveLocalProjects(localProjects);

      // 同时初始化该项目的sessions
      saveLocalSessions(name, []);

      // 更新状态
      await loadProjects();
    }
  }, [loadProjects]);

  // 删除项目
  const deleteProject = useCallback(async (name: string) => {
    try {
      // 先尝试调用后端API
      await api.deleteProject(name);
      await loadProjects();
    } catch (error) {
      // 后端不可用时，使用本地存储
      console.warn('后端服务不可用，使用本地存储删除项目:', error);
      const localProjects = getLocalProjects();
      const filtered = localProjects.filter(p => p.name !== name);
      saveLocalProjects(filtered);

      // 同时删除该项目的sessions
      localStorage.removeItem(`${LOCAL_STORAGE_KEYS.SESSIONS}_${name}`);

      await loadProjects();
    }

    // 如果删除的是当前选中的项目，清除选择
    if (state.currentProject?.name === name) {
      dispatch({ type: 'SET_CURRENT_PROJECT', payload: null });
    }
  }, [loadProjects, state.currentProject]);

  const selectProject = useCallback((project: Project) => {
    dispatch({ type: 'SET_CURRENT_PROJECT', payload: project });
    dispatch({ type: 'CLEAR_DATA' });
  }, []);

  const updateSensorConfig = useCallback((config: Partial<SensorConfig>) => {
    dispatch({ type: 'UPDATE_SENSOR_CONFIG', payload: config });
  }, []);

  const updateSaveConfig = useCallback((config: Partial<SaveConfig>) => {
    dispatch({ type: 'UPDATE_SAVE_CONFIG', payload: config });
  }, []);

  const startCollection = useCallback(() => {
    dispatch({ type: 'SET_COLLECTION_STATUS', payload: 'collecting' });
    dispatch({ type: 'SET_SENSOR_STATUS', payload: {
      temperatureHumidity: 'active',
      thermalRadiation: 'active',
      binocularCamera: 'active',
      spectrometer: 'active',
    }});
  }, []);

  const stopCollection = useCallback(() => {
    dispatch({ type: 'SET_COLLECTION_STATUS', payload: 'idle' });
    dispatch({ type: 'SET_SENSOR_STATUS', payload: {
      temperatureHumidity: 'idle',
      thermalRadiation: 'idle',
      binocularCamera: 'idle',
      spectrometer: 'idle',
    }});
  }, []);

  const connectCSI = useCallback(() => {
    dispatch({ type: 'SET_SENSOR_STATUS', payload: { wifiCSI: 'connected' } });
    dispatch({
      type: 'UPDATE_SENSOR_CONFIG',
      payload: { wifiCSI: { enabled: true, connected: true } },
    });
  }, []);

  const disconnectCSI = useCallback(() => {
    dispatch({ type: 'SET_SENSOR_STATUS', payload: { wifiCSI: 'idle' } });
    dispatch({
      type: 'UPDATE_SENSOR_CONFIG',
      payload: { wifiCSI: { enabled: false, connected: false } },
    });
  }, []);

  // 初始化时加载项目列表
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const value: AppContextType = {
    state,
    dispatch,
    loadProjects,
    createProject,
    deleteProject,
    selectProject,
    updateSensorConfig,
    updateSaveConfig,
    startCollection,
    stopCollection,
    connectCSI,
    disconnectCSI,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// Hook
export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// 模拟数据生成器
export function useSimulateData() {
  const { dispatch, state } = useApp();

  const simulateTemperatureHumidity = useCallback(() => {
    const data: TemperatureHumidityData = {
      timestamp: new Date(),
      airTemperature: 20 + Math.random() * 5,
      relativeHumidity: 40 + Math.random() * 20,
    };
    dispatch({ type: 'ADD_TEMPERATURE_HUMIDITY_DATA', payload: data });
  }, [dispatch]);

  const simulateThermalRadiation = useCallback(() => {
    const data: ThermalRadiationData = {
      timestamp: new Date(),
      blackGlobeTemperature: 25 + Math.random() * 8,
    };
    dispatch({ type: 'ADD_THERMAL_RADIATION_DATA', payload: data });
  }, [dispatch]);

  const simulateIlluminance = useCallback(() => {
    const data: IlluminanceData = {
      timestamp: new Date(),
      illuminance: 300 + Math.random() * 200,
      spectrum: Array.from({ length: 10 }, () => Math.random() * 100),
    };
    dispatch({ type: 'ADD_ILLUMINANCE_DATA', payload: data });
  }, [dispatch]);

  const simulateCameraFrame = useCallback(() => {
    const actions = ['walk', 'sit', 'stand', 'scratch head', 'wave', 'bend'];
    const frame: CameraFrame = {
      timestamp: new Date(),
      leftFrame: undefined,
      rightFrame: `data:image/svg+xml,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
          <rect fill="#1a1a2e" width="640" height="480"/>
          <rect fill="#16213e" x="100" y="150" width="120" height="200" rx="10"/>
          <rect fill="#16213e" x="400" y="180" width="100" height="180" rx="10"/>
          <circle fill="#0f3460" cx="320" cy="240" r="80"/>
          <text x="320" y="320" text-anchor="middle" fill="#e94560" font-size="14">ID: ${Math.floor(Math.random() * 100)}</text>
        </svg>
      `)}`,
      detections: [
        {
          id: `person_${Date.now()}`,
          bbox: [200, 200, 400, 450],
          label: 'person',
          confidence: 0.95 + Math.random() * 0.05,
          action: actions[Math.floor(Math.random() * actions.length)],
        },
      ],
    };
    dispatch({ type: 'SET_CAMERA_FRAME', payload: frame });
  }, [dispatch]);

  const simulateCSI = useCallback(() => {
    const subcarrierCount = 90;
    const csi: CSIData = {
      timestamp: new Date(),
      amplitude: Array.from({ length: subcarrierCount }, () => 20 + Math.random() * 30),
      phase: Array.from({ length: subcarrierCount }, () => Math.random() * Math.PI * 2),
      subcarrierIndex: Array.from({ length: subcarrierCount }, (_, i) => i - 45),
    };
    dispatch({ type: 'SET_CSI_DATA', payload: csi });
  }, [dispatch]);

  const simulateResult = useCallback(() => {
    const actions = ['walk', 'sit', 'stand', 'scratch head', 'wave', 'bend'];
    const result: ProcessedResult = {
      timestamp: new Date(),
      id: `ID=${String(Math.floor(Math.random() * 100)).padStart(3, '0')}`,
      airTemperature: 20 + Math.random() * 5,
      relativeHumidity: 40 + Math.random() * 20,
      blackGlobeTemperature: 25 + Math.random() * 8,
      action: actions[Math.floor(Math.random() * actions.length)],
      actionConfidence: 0.9 + Math.random() * 0.1,
    };
    dispatch({ type: 'ADD_RESULT', payload: result });
  }, [dispatch]);

  return {
    simulateTemperatureHumidity,
    simulateThermalRadiation,
    simulateIlluminance,
    simulateCameraFrame,
    simulateCSI,
    simulateResult,
  };
}
