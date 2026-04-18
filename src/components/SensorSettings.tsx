import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Thermometer,
  Sun,
  Camera,
  Lightbulb,
  Wifi,
  Play,
  Square,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useApp, useSimulateData } from '../contexts/AppContext';
import * as api from '../services/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface SensorSettingsProps {
  onStartCamera?: () => void;
  onStopCamera?: () => void;
  onStartCSI?: () => void;
  onStopCSI?: () => void;
}

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Checkbox({ label, checked, onChange, disabled }: CheckboxProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="flex items-center gap-2 text-left disabled:opacity-50"
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-md border text-white ${
          checked
            ? 'border-blue-600 bg-blue-600'
            : 'border-gray-300 bg-white text-transparent'
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      <span className="text-sm text-gray-700">{label}</span>
    </button>
  );
}

interface SectionTitleProps {
  icon: React.ReactNode;
  title: string;
  statusText?: string;
  active?: boolean;
}

function SectionTitle({
  icon,
  title,
  statusText = '待机',
  active = false,
}: SectionTitleProps) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
      </div>
      <div
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
          active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            active ? 'bg-emerald-500' : 'bg-gray-400'
          }`}
        />
        {statusText}
      </div>
    </div>
  );
}

interface TripleButtonGroupProps {
  value: 'left' | 'right' | 'both';
  onChange: (value: 'left' | 'right' | 'both') => void;
  disabled?: boolean;
  labels?: { left: string; right: string; both: string };
}

function TripleButtonGroup({
  value,
  onChange,
  disabled,
  labels,
}: TripleButtonGroupProps) {
  const items: Array<{ key: 'left' | 'right' | 'both'; label: string }> = [
    { key: 'left', label: labels?.left || '左目' },
    { key: 'right', label: labels?.right || '右目' },
    { key: 'both', label: labels?.both || '双目' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(item.key)}
          className={`rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
            value === item.key
              ? 'bg-purple-600 text-white'
              : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function SensorSettings({
  onStartCamera,
  onStopCamera,
  onStartCSI,
  onStopCSI,
}: SensorSettingsProps) {
  const {
    state,
    updateSensorConfig,
    updateSaveConfig,
    setSensorDataSource,
    startCollection,
    stopCollection,
    dispatch,
  } = useApp();

  const {
    simulateTemperatureHumidity,
    simulateThermalRadiation,
    simulateIlluminance,
  } = useSimulateData();

  // const { sensorConfig, saveConfig, collectionStatus, sensorStatus } = state;
  const { sensorConfig, saveConfig, collectionStatus, sensorStatus, sensorDataSource } = state;
  
  const tempSource = sensorDataSource.temperatureHumidity;
  const radSource = sensorDataSource.thermalRadiation;
  const lightSource = sensorDataSource.spectrometer;
  
  const isCollecting = collectionStatus === 'collecting';
  const hasProject = state.currentProject !== null;

  const [backendConnected, setBackendConnected] = useState(false);
  const [cameraBackendRunning, setCameraBackendRunning] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectingCSI, setConnectingCSI] = useState(false);
  
  // 真实传感器和模拟数据
  // const [tempSource, setTempSource] = useState<'real' | 'simulated'>('simulated');
  // const [radSource, setRadSource] = useState<'real' | 'simulated'>('simulated');
  // const [lightSource, setLightSource] = useState<'real' | 'simulated'>('simulated');

  const tempWsRef = useRef<WebSocket | null>(null);
  const radWsRef = useRef<WebSocket | null>(null);
  const lightWsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/status`);
        if (!response.ok) throw new Error('status not ok');

        const data = await response.json();
        setBackendConnected(true);
        setCameraBackendRunning(Boolean(data?.data?.camera?.running));  //??????????!!!!!!!!!!
        setConnectionError(null);
      } catch {
        setBackendConnected(false);
      }
    };

    checkBackend();
    const timer = setInterval(checkBackend, 3000);
    return () => clearInterval(timer);
  }, []);

  // useEffect(() => {
  //   if (!isCollecting) return;

  //   const timers: NodeJS.Timeout[] = [];

  //   if (sensorConfig.temperatureHumidity.enabled) {
  //     timers.push(
  //       setInterval(
  //         simulateTemperatureHumidity,
  //         sensorConfig.temperatureHumidity.interval * 1000
  //       )
  //     );
  //   }

    // if (sensorConfig.thermalRadiation.enabled) {
    //   timers.push(
    //     setInterval(
    //       simulateThermalRadiation,
    //       sensorConfig.thermalRadiation.interval * 1000
    //     )
    //   );
    // }

    // if (sensorConfig.spectrometer.enabled) {
    //   timers.push(
    //     setInterval(
    //       simulateIlluminance,
    //       sensorConfig.spectrometer.interval * 1000
    //     )
    //   );
    // }

  //   return () => timers.forEach(clearInterval);
  // }, [
  //   isCollecting,
  //   sensorConfig,
  //   simulateTemperatureHumidity,
  //   simulateThermalRadiation,
  //   simulateIlluminance,
  // ]);

  useEffect(() => {
    if (!isCollecting) return;

    const timers: NodeJS.Timeout[] = [];

    if (sensorConfig.temperatureHumidity.enabled && tempSource === 'simulated') {
      timers.push(
        setInterval(
          simulateTemperatureHumidity,
          sensorConfig.temperatureHumidity.interval * 1000
        )
      );
    }

    if (sensorConfig.thermalRadiation.enabled && radSource === 'simulated') {
      timers.push(
        setInterval(
          simulateThermalRadiation,
          sensorConfig.thermalRadiation.interval * 1000
        )
      );
    }

    if (sensorConfig.spectrometer.enabled && lightSource === 'simulated') {
      timers.push(
        setInterval(
          simulateIlluminance,
          sensorConfig.spectrometer.interval * 1000
        )
      );
    }

    return () => timers.forEach(clearInterval);
  }, [
    isCollecting,
    sensorConfig,
    tempSource,
    radSource,
    lightSource,
    simulateTemperatureHumidity,
    simulateThermalRadiation,
    simulateIlluminance,
  ]);

  // 新增三个真实设备启动函数
  // -------------------------------------------------------------------------
  const tryStartTempReal = useCallback(async () => {
    if (!state.currentProject?.name) {
      throw new Error('请先选择项目');
    }

    const port = sensorConfig.temperatureHumidity.port || '';
    if (!port.trim()) {
      throw new Error('未填写温湿度传感器串口号');
    }

    await api.startTemp({
      port,
      baudrate: sensorConfig.temperatureHumidity.baudrate || 9600,
      project_name: state.currentProject.name,
      save_options: {
        save_csv: true,
        save_jsonl: false,
      },
    });

    if (tempWsRef.current) {
      tempWsRef.current.close();
      tempWsRef.current = null;
    }

    tempWsRef.current = api.createTempWebSocket(
      (data) => {
        dispatch({
          type: 'ADD_TEMPERATURE_HUMIDITY_DATA',
          payload: {
            timestamp: new Date(data.timestamp * 1000),
            airTemperature: data.air_temperature,
            relativeHumidity: data.relative_humidity,
          },
        });

        dispatch({
          type: 'SET_SENSOR_STATUS',
          payload: { temperatureHumidity: 'active' },
        });
      },
      (error) => {
        console.error('温湿度 WebSocket 错误:', error);
      },
      () => {
        console.log('温湿度 WebSocket 已关闭');
      }
    );

    setSensorDataSource({ temperatureHumidity: 'real' });
  }, [state.currentProject, sensorConfig.temperatureHumidity, dispatch]);

  // tryStartRadReal--------------------------------------------------------
  const tryStartRadReal = useCallback(async () => {
    if (!state.currentProject?.name) {
      throw new Error('请先选择项目');
    }

    const port = sensorConfig.thermalRadiation.port || '';
    if (!port.trim()) {
      throw new Error('未填写热辐射传感器串口号');
    }

    await api.startRad({
      port,
      baudrate: sensorConfig.thermalRadiation.baudrate || 9600,
      project_name: state.currentProject.name,
      save_options: {
        save_csv: true,
        save_jsonl: false,
      },
    });

    if (radWsRef.current) {
      radWsRef.current.close();
      radWsRef.current = null;
    }

    radWsRef.current = api.createRadWebSocket(
      (data) => {
        dispatch({
          type: 'ADD_THERMAL_RADIATION_DATA',
          payload: {
            timestamp: new Date(data.timestamp * 1000),
            blackGlobeTemperature: data.black_globe_temperature,
          },
        });

        dispatch({
          type: 'SET_SENSOR_STATUS',
          payload: { thermalRadiation: 'active' },
        });
      },
      (error) => {
        console.error('热辐射 WebSocket 错误:', error);
      },
      () => {
        console.log('热辐射 WebSocket 已关闭');
      }
    );

    setSensorDataSource({ thermalRadiation: 'real' });
  }, [state.currentProject, sensorConfig.thermalRadiation, dispatch]);

  // ------------------------------------------------------------------------------
  const tryStartLightReal = useCallback(async () => {
    if (!state.currentProject?.name) {
      throw new Error('请先选择项目');
    }

    const port = sensorConfig.spectrometer.port || '';
    if (!port.trim()) {
      throw new Error('未填写照明传感器串口号');
    }

    await api.startLight({
      port,
      baudrate: sensorConfig.spectrometer.baudrate || 9600,
      project_name: state.currentProject.name,
      save_options: {
        save_csv: true,
        save_jsonl: false,
      },
    });

    if (lightWsRef.current) {
      lightWsRef.current.close();
      lightWsRef.current = null;
    }

    lightWsRef.current = api.createLightWebSocket(
      (data) => {
        dispatch({
          type: 'ADD_ILLUMINANCE_DATA',
          payload: {
            timestamp: new Date(data.timestamp * 1000),
            illuminance: data.illuminance,
            spectrum: [],
            colorTemperature: data.color_temperature ?? 0,
          },
        });

        dispatch({
          type: 'SET_SENSOR_STATUS',
          payload: { spectrometer: 'active' },
        });
      },
      (error) => {
        console.error('照明 WebSocket 错误:', error);
      },
      () => {
        console.log('照明 WebSocket 已关闭');
      }
    );

    setSensorDataSource({ spectrometer: 'real' });
  }, [state.currentProject, sensorConfig.spectrometer, dispatch]);



  const handleToggleCSI = useCallback(async () => {
    if (sensorStatus.wifiCSI === 'connected') {
      try {
        await api.stopCSI();
      } catch (error) {
        console.error('停止 CSI 失败:', error);
      }

      onStopCSI?.();
      dispatch({ type: 'SET_SENSOR_STATUS', payload: { wifiCSI: 'idle' } });
      dispatch({
        type: 'UPDATE_SENSOR_CONFIG',
        payload: { wifiCSI: { enabled: false, connected: false } },
      });
      return;
    }

    if (!state.currentProject?.name) {
      setConnectionError('请先创建并选择一个项目，再连接 CSI');
      return;
    }

    try {
      setConnectingCSI(true);
      setConnectionError(null);

      await api.startCSI({
        project_name: state.currentProject.name,
        save_options: {
          save_raw_data: !!saveConfig.wifiCSI.save_raw_csi,
          save_fragment_data: !!saveConfig.wifiCSI.save_slice_data,
        },
      });

      dispatch({ type: 'SET_SENSOR_STATUS', payload: { wifiCSI: 'connected' } });
      dispatch({
        type: 'UPDATE_SENSOR_CONFIG',
        payload: { wifiCSI: { enabled: true, connected: true } },
      });

      onStartCSI?.();
    } catch (error: any) {
      setConnectionError(`CSI连接失败: ${error?.message || '未知错误'}`);
    } finally {
      setConnectingCSI(false);
    }
  }, [
    sensorStatus.wifiCSI,
    onStartCSI,
    onStopCSI,
    dispatch,
    state.currentProject,
    saveConfig.wifiCSI,
  ]);

  // const handleStartCollection = useCallback(async () => {
  //   if (!backendConnected) {
  //     setConnectionError('后端服务未连接');
  //     return;
  //   }

  //   try {
  //     onStartCamera?.();
  //     startCollection();
  //     setCameraBackendRunning(true);
  //     setConnectionError(null);
  //   } catch (error: any) {
  //     setConnectionError(`启动采集失败: ${error?.message || '未知错误'}`);
  //   }
  // }, [backendConnected, onStartCamera, startCollection]);

  const handleStartCollection = useCallback(async () => {
    if (!backendConnected) {
      setConnectionError('后端服务未连接');
      return;
    }

    if (!hasProject) {
      setConnectionError('请先创建并选择项目');
      return;
    }

    try {
      setConnectionError(null);

      // 默认先设为 simulated，后面谁启动成功再切 real
      setSensorDataSource({
        temperatureHumidity: 'simulated',
        thermalRadiation: 'simulated',
        spectrometer: 'simulated',
      });

      // Camera 仍按你现在逻辑启动
      onStartCamera?.();
      setCameraBackendRunning(true);

      // 尝试真实温湿度
      if (sensorConfig.temperatureHumidity.enabled) {
        try {
          await tryStartTempReal();
        } catch (e) {
          console.warn('温湿度真实设备启动失败，回退模拟:', e);
          setSensorDataSource({ temperatureHumidity: 'simulated' });
          dispatch({
            type: 'SET_SENSOR_STATUS',
            payload: { temperatureHumidity: 'active' },
          });
        }
      }

      // 尝试真实热辐射
      if (sensorConfig.thermalRadiation.enabled) {
        try {
          await tryStartRadReal();
        } catch (e) {
          console.warn('热辐射真实设备启动失败，回退模拟:', e);
          setSensorDataSource({ thermalRadiation: 'simulated' });
          dispatch({
            type: 'SET_SENSOR_STATUS',
            payload: { thermalRadiation: 'active' },
          });
        }
      }

      // 尝试真实照明
      if (sensorConfig.spectrometer.enabled) {
        try {
          await tryStartLightReal();
        } catch (e) {
          console.warn('照明真实设备启动失败，回退模拟:', e);
          setSensorDataSource({ spectrometer: 'simulated' });
          dispatch({
            type: 'SET_SENSOR_STATUS',
            payload: { spectrometer: 'active' },
          });
        }
      }

      startCollection();
    } catch (error: any) {
      setConnectionError(`启动采集失败: ${error?.message || '未知错误'}`);
    }
  }, [
    backendConnected,
    hasProject,
    onStartCamera,
    startCollection,
    sensorConfig.temperatureHumidity.enabled,
    sensorConfig.thermalRadiation.enabled,
    sensorConfig.spectrometer.enabled,
    tryStartTempReal,
    tryStartRadReal,
    tryStartLightReal,
  ]);
// -----------------------------------------------------------------------
  // const handleStopCollection = useCallback(async () => {
  //   onStopCamera?.();

  //   try {
  //     await api.stopCamera();
  //   } catch (error) {
  //     console.error('停止后端失败:', error);
  //   }

  //   setCameraBackendRunning(false);
  //   stopCollection();
  // }, [onStopCamera, stopCollection]);
  const handleStopCollection = useCallback(async () => {
    onStopCamera?.();

    try {
      await api.stopCamera();
    } catch (error) {
      console.error('停止 Camera 后端失败:', error);
    }

    try {
      await api.stopTemp();
    } catch (error) {
      console.warn('停止 Temp 后端失败:', error);
    }

    try {
      await api.stopRad();
    } catch (error) {
      console.warn('停止 Rad 后端失败:', error);
    }

    try {
      await api.stopLight();
    } catch (error) {
      console.warn('停止 Light 后端失败:', error);
    }

    if (tempWsRef.current) {
      tempWsRef.current.close();
      tempWsRef.current = null;
    }
    if (radWsRef.current) {
      radWsRef.current.close();
      radWsRef.current = null;
    }
    if (lightWsRef.current) {
      lightWsRef.current.close();
      lightWsRef.current = null;
    }

    setCameraBackendRunning(false);
    setSensorDataSource({
      temperatureHumidity: 'simulated',
      thermalRadiation: 'simulated',
      spectrometer: 'simulated',
    });

    stopCollection();
  }, [onStopCamera, stopCollection]);

// ------------------------------------------------------------------------
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-5">
        <h2 className="text-2xl font-bold text-gray-900">采集设置</h2>
      </div>

      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-4">
        {!backendConnected && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">后端服务未连接</div>
                <div className="mt-1 text-xs">请先运行：backend 目录下的 python main.py</div>
              </div>
            </div>
          </div>
        )}

        {connectionError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {connectionError}
          </div>
        )}

        <div
          className={`rounded-2xl border p-4 ${
            isCollecting
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <span
              className={`h-2 w-2 rounded-full ${
                isCollecting ? 'bg-emerald-500' : 'bg-gray-400'
              }`}
            />
            {isCollecting ? '采集中' : '等待开始'}
          </div>
          <p className="mt-1 text-xs text-gray-600">
            {isCollecting ? '视频与传感器数据正在采集中' : '点击底部按钮开始采集'}
          </p>
        </div>

        <div className="rounded-2xl bg-gray-50 p-4">
          <SectionTitle
            icon={<Thermometer className="h-5 w-5 text-red-500" />}
            title="温湿度传感器"
            statusText={sensorStatus.temperatureHumidity === 'active' ? '正常' : '待机'}
            // statusText={
            //   sensorStatus.temperatureHumidity === 'active'
            //     ? tempSource === 'real'
            //       ? '真实设备'
            //       : '模拟数据'
            //     : '待机'
            // }
            active={sensorStatus.temperatureHumidity === 'active'}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600">采集间隔 (秒)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={sensorConfig.temperatureHumidity.interval}
                onChange={(e) =>
                  updateSensorConfig({
                    temperatureHumidity: {
                      ...sensorConfig.temperatureHumidity,
                      interval: parseInt(e.target.value) || 5,
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">采集精度</label>
              <select
                value={sensorConfig.temperatureHumidity.precision}
                onChange={(e) =>
                  updateSensorConfig({
                    temperatureHumidity: {
                      ...sensorConfig.temperatureHumidity,
                      precision: e.target.value as '0.1' | '0.01' | '0.001',
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              >
                <option value="0.1">0.1°C</option>
                <option value="0.01">0.01°C</option>
                <option value="0.001">0.001°C</option>
              </select>
            </div>
          </div>

          {/* 串口号和波特率加在这里--------------------------------------------------- */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600">串口号</label>
              <input
                type="text"
                placeholder="例如 COM5"
                value={sensorConfig.temperatureHumidity.port}
                onChange={(e) =>
                  updateSensorConfig({
                    temperatureHumidity: {
                      ...sensorConfig.temperatureHumidity,
                      port: e.target.value,
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">波特率</label>
              <input
                type="number"
                value={sensorConfig.temperatureHumidity.baudrate}
                onChange={(e) =>
                  updateSensorConfig({
                    temperatureHumidity: {
                      ...sensorConfig.temperatureHumidity,
                      baudrate: parseInt(e.target.value) || 9600,
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <p className="mb-2 text-xs font-medium text-gray-600">保存设置</p>
            <Checkbox
              label="保存温湿度数据"
              checked={saveConfig.temperatureHumidity.enabled}
              onChange={(checked) =>
                updateSaveConfig({ temperatureHumidity: { enabled: checked } })
              }
              disabled={isCollecting}
            />
          </div>
        </div>

        <div className="rounded-2xl bg-gray-50 p-4">
          <SectionTitle
            icon={<Sun className="h-5 w-5 text-orange-500" />}
            title="热辐射传感器"
            statusText={sensorStatus.thermalRadiation === 'active' ? '正常' : '待机'}
            // statusText={
            //   sensorStatus.thermalRadiation === 'active'
            //     ? radSource === 'real'
            //       ? '真实设备'
            //       : '模拟数据'
            //     : '待机'
            // }
            active={sensorStatus.thermalRadiation === 'active'}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600">采集间隔 (秒)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={sensorConfig.thermalRadiation.interval}
                onChange={(e) =>
                  updateSensorConfig({
                    thermalRadiation: {
                      ...sensorConfig.thermalRadiation,
                      interval: parseInt(e.target.value) || 5,
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">采集精度</label>
              <select
                value={sensorConfig.thermalRadiation.precision}
                onChange={(e) =>
                  updateSensorConfig({
                    thermalRadiation: {
                      ...sensorConfig.thermalRadiation,
                      precision: e.target.value as '0.1' | '0.01' | '0.001',
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              >
                <option value="0.1">0.1°C</option>
                <option value="0.01">0.01°C</option>
                <option value="0.001">0.001°C</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600">串口号</label>
              <input
                type="text"
                placeholder="例如 COM6"
                value={sensorConfig.thermalRadiation.port}
                onChange={(e) =>
                  updateSensorConfig({
                    thermalRadiation: {
                      ...sensorConfig.thermalRadiation,
                      port: e.target.value,
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">波特率</label>
              <input
                type="number"
                value={sensorConfig.thermalRadiation.baudrate}
                onChange={(e) =>
                  updateSensorConfig({
                    thermalRadiation: {
                      ...sensorConfig.thermalRadiation,
                      baudrate: parseInt(e.target.value) || 9600,
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <p className="mb-2 text-xs font-medium text-gray-600">保存设置</p>
            <Checkbox
              label="保存热辐射数据"
              checked={saveConfig.thermalRadiation.enabled}
              onChange={(checked) =>
                updateSaveConfig({ thermalRadiation: { enabled: checked } })
              }
              disabled={isCollecting}
            />
          </div>
        </div>

        <div className="rounded-2xl bg-gray-50 p-4">
          <SectionTitle
            icon={<Lightbulb className="h-5 w-5 text-yellow-500" />}
            title="光谱照度计"
            statusText={sensorStatus.spectrometer === 'active' ? '正常' : '待机'}
            // statusText={
            //   sensorStatus.spectrometer === 'active'
            //     ? lightSource === 'real'
            //       ? '真实设备'
            //       : '模拟数据'
            //     : '待机'
            // }
            active={sensorStatus.spectrometer === 'active'}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600">采集间隔 (秒)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={sensorConfig.spectrometer.interval}
                onChange={(e) =>
                  updateSensorConfig({
                    spectrometer: {
                      ...sensorConfig.spectrometer,
                      interval: parseInt(e.target.value) || 5,
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">采集精度</label>
              <select
                value={sensorConfig.spectrometer.precision}
                onChange={(e) =>
                  updateSensorConfig({
                    spectrometer: {
                      ...sensorConfig.spectrometer,
                      precision: e.target.value as 'low' | 'medium' | 'high',
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600">串口号</label>
              <input
                type="text"
                placeholder="例如 COM7"
                value={sensorConfig.spectrometer.port}
                onChange={(e) =>
                  updateSensorConfig({
                    spectrometer: {
                      ...sensorConfig.spectrometer,
                      port: e.target.value,
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">波特率</label>
              <input
                type="number"
                value={sensorConfig.spectrometer.baudrate}
                onChange={(e) =>
                  updateSensorConfig({
                    spectrometer: {
                      ...sensorConfig.spectrometer,
                      baudrate: parseInt(e.target.value) || 9600,
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <p className="mb-2 text-xs font-medium text-gray-600">保存设置</p>
            <Checkbox
              label="保存光谱照度数据"
              checked={saveConfig.spectrometer.enabled}
              onChange={(checked) =>
                updateSaveConfig({ spectrometer: { enabled: checked } })
              }
              disabled={isCollecting}
            />
          </div>
        </div>

        <div className="rounded-2xl bg-gray-50 p-4">
          <SectionTitle
            icon={<Camera className="h-5 w-5 text-purple-500" />}
            title="双目摄像头"
            statusText={cameraBackendRunning ? '正常' : '待机'}
            active={cameraBackendRunning}
          />

          <div>
            <label className="mb-2 block text-xs text-gray-600">采集模式</label>
            <TripleButtonGroup
              value={sensorConfig.binocularCamera.mode}
              onChange={(mode) =>
                updateSensorConfig({
                  binocularCamera: {
                    ...sensorConfig.binocularCamera,
                    mode,
                  },
                })
              }
              disabled={isCollecting}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-200 pt-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600">视频帧率</label>
              <select
                value={sensorConfig.binocularCamera.frameRate}
                onChange={(e) =>
                  updateSensorConfig({
                    binocularCamera: {
                      ...sensorConfig.binocularCamera,
                      frameRate: parseInt(e.target.value) as 15 | 30 | 60,
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              >
                <option value={20}>20 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">图像采集间隔 (秒)</label>
              <input
                type="number"
                min={1}
                max={300}
                value={sensorConfig.binocularCamera.imageCaptureInterval}
                onChange={(e) =>
                  updateSensorConfig({
                    binocularCamera: {
                      ...sensorConfig.binocularCamera,
                      imageCaptureInterval: parseInt(e.target.value) || 30,
                    },
                  })
                }
                disabled={isCollecting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <p className="mb-3 text-xs font-medium text-gray-600">保存设置</p>

            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500">视频</p>
                <div className="space-y-2 pl-2">
                  <Checkbox
                    label="保存原始视频"
                    checked={!!saveConfig.binocularCamera.save_raw_video}
                    onChange={(checked) =>
                      updateSaveConfig({
                        binocularCamera: {
                          ...saveConfig.binocularCamera,
                          save_raw_video: checked,
                        },
                      })
                    }
                    disabled={isCollecting}
                  />

                  {saveConfig.binocularCamera.save_raw_video && (
                    <div className="pl-6">
                      <label className="mb-1 block text-xs text-gray-500">保存视角</label>
                      <TripleButtonGroup
                        value={saveConfig.binocularCamera.raw_video_view || 'both'}
                        onChange={(v) =>
                          updateSaveConfig({
                            binocularCamera: {
                              ...saveConfig.binocularCamera,
                              raw_video_view: v,
                            },
                          })
                        }
                        disabled={isCollecting}
                      />
                    </div>
                  )}

                  <Checkbox
                    label="保存追踪视频"
                    checked={!!saveConfig.binocularCamera.save_tracked_video}
                    onChange={(checked) =>
                      updateSaveConfig({
                        binocularCamera: {
                          ...saveConfig.binocularCamera,
                          save_tracked_video: checked,
                        },
                      })
                    }
                    disabled={isCollecting}
                  />

                  {saveConfig.binocularCamera.save_tracked_video && (
                    <div className="pl-6">
                      <label className="mb-1 block text-xs text-gray-500">保存视角</label>
                      <TripleButtonGroup
                        value={
                          saveConfig.binocularCamera.tracked_video_view === 'left'
                            ? 'left'
                            : saveConfig.binocularCamera.tracked_video_view === 'right'
                            ? 'right'
                            : 'both'
                        }
                        onChange={(v) =>
                          updateSaveConfig({
                            binocularCamera: {
                              ...saveConfig.binocularCamera,
                              tracked_video_view: v,
                            },
                          })
                        }
                        disabled={isCollecting}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-500">图像</p>
                <div className="space-y-2 pl-2">
                  <Checkbox
                    label="保存原始图像"
                    checked={!!saveConfig.binocularCamera.save_raw_images}
                    onChange={(checked) =>
                      updateSaveConfig({
                        binocularCamera: {
                          ...saveConfig.binocularCamera,
                          save_raw_images: checked,
                        },
                      })
                    }
                    disabled={isCollecting}
                  />

                  {saveConfig.binocularCamera.save_raw_images && (
                    <div className="pl-6">
                      <label className="mb-1 block text-xs text-gray-500">保存视角</label>
                      <TripleButtonGroup
                        value={saveConfig.binocularCamera.raw_image_views || 'both'}
                        onChange={(v) =>
                          updateSaveConfig({
                            binocularCamera: {
                              ...saveConfig.binocularCamera,
                              raw_image_views: v,
                            },
                          })
                        }
                        disabled={isCollecting}
                      />
                    </div>
                  )}

                  <Checkbox
                    label="保存追踪图像"
                    checked={!!saveConfig.binocularCamera.save_tracked_images}
                    onChange={(checked) =>
                      updateSaveConfig({
                        binocularCamera: {
                          ...saveConfig.binocularCamera,
                          save_tracked_images: checked,
                        },
                      })
                    }
                    disabled={isCollecting}
                  />

                  {saveConfig.binocularCamera.save_tracked_images && (
                    <div className="pl-6">
                      <label className="mb-1 block text-xs text-gray-500">保存视角</label>
                      <TripleButtonGroup
                        value={saveConfig.binocularCamera.tracked_image_views || 'both'}
                        onChange={(v) =>
                          updateSaveConfig({
                            binocularCamera: {
                              ...saveConfig.binocularCamera,
                              tracked_image_views: v,
                            },
                          })
                        }
                        disabled={isCollecting}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-500">其他</p>
                <div className="space-y-2 pl-2">
                  <Checkbox
                    label="保存人物片段 (person clips)"
                    checked={!!saveConfig.binocularCamera.save_person_clips}
                    onChange={(checked) =>
                      updateSaveConfig({
                        binocularCamera: {
                          ...saveConfig.binocularCamera,
                          save_person_clips: checked,
                        },
                      })
                    }
                    disabled={isCollecting}
                  />

                  <Checkbox
                    label="保存分类结果"
                    checked={!!saveConfig.binocularCamera.save_classification_results}
                    onChange={(checked) =>
                      updateSaveConfig({
                        binocularCamera: {
                          ...saveConfig.binocularCamera,
                          save_classification_results: checked,
                        },
                      })
                    }
                    disabled={isCollecting}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-gray-50 p-4">
          <SectionTitle
            icon={<Wifi className="h-5 w-5 text-cyan-500" />}
            title="WiFi CSI"
            statusText={sensorStatus.wifiCSI === 'connected' ? '已连接' : '未连接'}
            active={sensorStatus.wifiCSI === 'connected'}
          />

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {sensorStatus.wifiCSI === 'connected'
                ? 'CSI 已连接，右侧面板将显示数据'
                : '点击按钮连接 CSI'}
            </p>

            <button
              type="button"
              onClick={handleToggleCSI}
              disabled={connectingCSI}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                sensorStatus.wifiCSI === 'connected'
                  ? 'bg-gray-700 hover:bg-gray-800'
                  : 'bg-cyan-600 hover:bg-cyan-700'
              } disabled:opacity-50`}
            >
              {connectingCSI
                ? '连接中...'
                : sensorStatus.wifiCSI === 'connected'
                ? '断开 CSI'
                : '连接 CSI'}
            </button>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <p className="mb-2 text-xs font-medium text-gray-600">保存设置</p>
            <div className="space-y-2">
              <Checkbox
                label="保存原始 CSI 数据"
                checked={!!saveConfig.wifiCSI.save_raw_csi}
                onChange={(checked) =>
                  updateSaveConfig({
                    wifiCSI: {
                      ...saveConfig.wifiCSI,
                      save_raw_csi: checked,
                    },
                  })
                }
                disabled={isCollecting}
              />

              <Checkbox
                label="保存切片数据"
                checked={!!saveConfig.wifiCSI.save_slice_data}
                onChange={(checked) =>
                  updateSaveConfig({
                    wifiCSI: {
                      ...saveConfig.wifiCSI,
                      save_slice_data: checked,
                    },
                  })
                }
                disabled={isCollecting}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 bg-white p-4">
        <button
          type="button"
          onClick={isCollecting ? handleStopCollection : handleStartCollection}
          disabled={!hasProject}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            isCollecting
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isCollecting ? (
            <>
              <Square className="h-5 w-5" />
              停止采集
            </>
          ) : (
            <>
              <Play className="h-5 w-5" />
              开始采集
            </>
          )}
        </button>
      </div>
    </div>
  );
}