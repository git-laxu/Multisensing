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
  // temperatureHumidity: {
  //   enabled: true,
  //   interval: 5,
  //   precision: '0.1',
  // },
  // thermalRadiation: {
  //   enabled: true,
  //   interval: 5,
  //   precision: '0.1',
  // },
  // spectrometer: {
  //   enabled: true,
  //   interval: 5,
  //   precision: 'medium',
  // },
  temperatureHumidity: {
    enabled: true,
    interval: 5,
    precision: '0.1',
    port: '',
    baudrate: 9600,
  },
  thermalRadiation: {
    enabled: true,
    interval: 5,
    precision: '0.1',
    port: '',
    baudrate: 9600,
  },
  spectrometer: {
    enabled: true,
    interval: 5,
    precision: 'medium',
    port: '',
    baudrate: 9600,
  },
  binocularCamera: {
    enabled: true,
    frameRate: 30,
    mode: 'right',
    imageCaptureInterval: 30,
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
  sensorDataSource: {
    temperatureHumidity: 'simulated',
    thermalRadiation: 'simulated',
    spectrometer: 'simulated',
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

function mergeProjectLists(backendProjects: Project[], localProjects: Project[]): Project[] {
  const merged = new Map<string, Project>();

  backendProjects.forEach((project) => {
    merged.set(project.name, project);
  });

  localProjects.forEach((project) => {
    if (!merged.has(project.name)) {
      merged.set(project.name, project);
    }
  });

  return Array.from(merged.values()).sort((a, b) => {
    const aTime = a.updatedAt?.getTime?.() ?? a.createdAt?.getTime?.() ?? 0;
    const bTime = b.updatedAt?.getTime?.() ?? b.createdAt?.getTime?.() ?? 0;
    return bTime - aTime;
  });
}

function syncProjectsToLocal(projects: Project[]): void {
  const localProjects: LocalProjectInfo[] = projects.map((project) => {
    const sessions = getLocalSessions(project.name);
    return {
      name: project.name,
      created_at: project.createdAt.toISOString(),
      updated_at: (project.updatedAt ?? project.createdAt).toISOString(),
      session_count: sessions.length,
      total_size: sessions.reduce((sum, s) => sum + (s.size ?? 0), 0),
    };
  });

  saveLocalProjects(localProjects);
}

function getErrorMessage(error: any, fallback: string): string {
  if (!error) return fallback;

  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error?.message === 'string' && error.message.trim()) return error.message;

  if (typeof error?.response?.data?.detail === 'string' && error.response.data.detail.trim()) {
    return error.response.data.detail;
  }

  if (typeof error?.response?.data?.message === 'string' && error.response.data.message.trim()) {
    return error.response.data.message;
  }

  if (typeof error?.detail === 'string' && error.detail.trim()) {
    return error.detail;
  }

  return fallback;
}

function isBackendUnavailable(error: any): boolean {
  const status = error?.response?.status ?? error?.status;
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return false;
  }

  const message = String(
    error?.message ||
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    ''
  ).toLowerCase();

  return (
    !status ||
    status >= 500 ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('network')
  );
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
    
    case 'SET_SENSOR_DATA_SOURCE':
      return {
      ...state,
        sensorDataSource: { ...state.sensorDataSource, ...action.payload },
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
        sensorDataSource: {                         //新增
          temperatureHumidity: 'simulated',
          thermalRadiation: 'simulated',
          spectrometer: 'simulated',
        },
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
  hideProjectFromSelector: (name: string) => void;
  selectProject: (project: Project) => void;
  updateSensorConfig: (config: Partial<SensorConfig>) => void;
  updateSaveConfig: (config: Partial<SaveConfig>) => void;
  setSensorDataSource: (source: Partial<AppState['sensorDataSource']>) => void;  //新增
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
    const localProjects = getLocalProjects();
    const localProjectList: Project[] = localProjects.map((p) => ({
      id: p.name,
      name: p.name,
      createdAt: new Date(p.created_at),
      updatedAt: new Date(p.updated_at ?? p.created_at),
    }));

    try {
      const response = await api.getProjects();
      const backendProjectList: Project[] = (response.projects || []).map((p: any) => ({
        id: p.project_name,
        name: p.project_name,
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at ?? p.created_at),
      }));

      // const mergedProjects = mergeProjectLists(backendProjectList, localProjectList);
      // dispatch({ type: 'SET_PROJECTS', payload: mergedProjects });
      // syncProjectsToLocal(mergedProjects);
      const mergedProjects = mergeProjectLists(backendProjectList, localProjectList);
      dispatch({ type: 'SET_PROJECTS', payload: mergedProjects });

      if (state.currentProject && !mergedProjects.some((p) => p.name === state.currentProject?.name)) {
        dispatch({ type: 'SET_CURRENT_PROJECT', payload: null });
      }

      syncProjectsToLocal(mergedProjects);
    } catch (error) {
      // console.warn('后端服务不可用，使用本地存储:', error);
      // dispatch({ type: 'SET_PROJECTS', payload: localProjectList });
      console.warn('后端服务不可用，使用本地存储:', error);
      dispatch({ type: 'SET_PROJECTS', payload: localProjectList });

      if (state.currentProject && !localProjectList.some((p) => p.name === state.currentProject?.name)) {
        dispatch({ type: 'SET_CURRENT_PROJECT', payload: null });
      }
    }
  // }, []);
  }, [state.currentProject]);

  // 创建项目
  const createProject = useCallback(async (name: string) => {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('项目名称不能为空');
  }

  try {
    await api.createProject(trimmedName);

    const localProjects = getLocalProjects();
    if (!localProjects.some((p) => p.name === trimmedName)) {
      localProjects.push({
        name: trimmedName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        session_count: 0,
        total_size: 0,
      });
      saveLocalProjects(localProjects);
      saveLocalSessions(trimmedName, []);
    }

    await loadProjects();

    const createdProject: Project = {
      id: trimmedName,
      name: trimmedName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    dispatch({ type: 'SET_CURRENT_PROJECT', payload: createdProject });
    return;
  } catch (error) {
    if (!isBackendUnavailable(error)) {
      throw new Error(getErrorMessage(error, '创建项目失败'));
    }

    console.warn('后端服务不可用，使用本地存储创建项目:', error);

    const localProjects = getLocalProjects();

    if (localProjects.some((p) => p.name === trimmedName)) {
      throw new Error(`项目 "${trimmedName}" 已存在`);
    }

    const newLocalProject: LocalProjectInfo = {
      name: trimmedName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      session_count: 0,
      total_size: 0,
    };

    localProjects.push(newLocalProject);
    saveLocalProjects(localProjects);
    saveLocalSessions(trimmedName, []);

    await loadProjects();

    const newProject: Project = {
      id: trimmedName,
      name: trimmedName,
      createdAt: new Date(newLocalProject.created_at),
      updatedAt: new Date(newLocalProject.updated_at),
    };

    dispatch({ type: 'SET_CURRENT_PROJECT', payload: newProject });
  }
}, [loadProjects]);

  // 删除项目
  const deleteProject = useCallback(async (name: string) => {
    try {
      await api.deleteProject(name);
    } catch (error) {
      if (!isBackendUnavailable(error)) {
        throw new Error(getErrorMessage(error, '删除项目失败'));
      }

      console.warn('后端服务不可用，使用本地存储删除项目:', error);
    }

    const localProjects = getLocalProjects();
    const filtered = localProjects.filter(p => p.name !== name);
    saveLocalProjects(filtered);
    localStorage.removeItem(`${LOCAL_STORAGE_KEYS.SESSIONS}_${name}`);

    if (state.currentProject?.name === name) {
      dispatch({ type: 'SET_CURRENT_PROJECT', payload: null });
    }

    await loadProjects();
  }, [loadProjects, state.currentProject]);

  const hideProjectFromSelector = useCallback((name: string) => {
  const filteredProjects = state.projects.filter((project) => project.name !== name);
  dispatch({ type: 'SET_PROJECTS', payload: filteredProjects });

  if (state.currentProject?.name === name) {
    dispatch({ type: 'SET_CURRENT_PROJECT', payload: null });
  }
}, [state.projects, state.currentProject]);

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

  const setSensorDataSource = useCallback(             //新增
    (source: Partial<AppState['sensorDataSource']>) => {
      dispatch({ type: 'SET_SENSOR_DATA_SOURCE', payload: source });
    },
    []
  );

  const startCollection = useCallback(() => {
    dispatch({ type: 'SET_COLLECTION_STATUS', payload: 'collecting' });
    dispatch({ type: 'SET_SENSOR_STATUS', payload: {
      // temperatureHumidity: 'idle',
      // thermalRadiation: 'idle',
      binocularCamera: 'active',
      // spectrometer: 'idle',
    }});
  }, []);

  // const stopCollection = useCallback(() => {
  //   dispatch({ type: 'SET_COLLECTION_STATUS', payload: 'idle' });
  //   dispatch({ type: 'SET_SENSOR_STATUS', payload: {
  //     temperatureHumidity: 'idle',
  //     thermalRadiation: 'idle',
  //     binocularCamera: 'idle',
  //     spectrometer: 'idle',
  //   }});
  // }, []);
  const stopCollection = useCallback(() => {
    dispatch({ type: 'SET_COLLECTION_STATUS', payload: 'idle' });
    dispatch({
      type: 'SET_SENSOR_STATUS',
      payload: {
        temperatureHumidity: 'idle',
        thermalRadiation: 'idle',
        binocularCamera: 'idle',
        spectrometer: 'idle',
      },
    });
    dispatch({
      type: 'SET_SENSOR_DATA_SOURCE',
      payload: {
        temperatureHumidity: 'simulated',
        thermalRadiation: 'simulated',
        spectrometer: 'simulated',
      },
    });
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
    hideProjectFromSelector,
    selectProject,
    updateSensorConfig,
    updateSaveConfig,
    setSensorDataSource,
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
      channel: Math.floor(Math.random() * subcarrierCount),   // 新增-------------------------
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