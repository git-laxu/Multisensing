import React, { useState, useEffect, useCallback } from 'react';
import {
  Thermometer,
  Sun,
  Camera,
  Lightbulb,
  Wifi,
  Play,
  Square,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  WifiOff,
  Check
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
    <label className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50' : ''}`}>
      <div
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
        }`}
        onClick={() => !disabled && onChange(!checked)}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

interface SectionTitleProps {
  icon: React.ReactNode;
  title: string;
  status?: 'idle' | 'active' | 'error' | 'connected';
  statusText?: string;
  statusColor?: 'emerald' | 'red' | 'gray';
}

function SectionTitle({
  icon,
  title,
  status,
  statusText,
  statusColor = 'gray',
}: SectionTitleProps) {
  const getStatusStyle = () => {
    switch (statusColor) {
      case 'emerald':
        return 'bg-emerald-50 text-emerald-600';
      case 'red':
        return 'bg-red-50 text-red-600';
      default:
        return 'bg-gray-100 text-gray-500';
    }
  };

  const getDotStyle = () => {
    switch (statusColor) {
      case 'emerald':
        return 'bg-emerald-500';
      case 'red':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <h3 className="font-medium text-gray-900 truncate">{title}</h3>
      </div>
      {status && (
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium shrink-0 ${getStatusStyle()}`}
        >
          <span
            className={`w-2 h-2 rounded-full ${getDotStyle()} ${
              statusColor === 'emerald' ? 'animate-pulse' : ''
            }`}
          />
          {statusText || (status === 'active' || status === 'connected' ? '正常' : '待机')}
        </div>
      )}
    </div>
  );
}

interface TripleButtonGroupProps {
  value: 'left' | 'right' | 'both';
  onChange: (value: 'left' | 'right' | 'both') => void;
  labels?: { left: string; right: string; both: string };
  disabled?: boolean;
}

function TripleButtonGroup({
  value,
  onChange,
  labels,
  disabled,
}: TripleButtonGroupProps) {
  const defaultLabels = { left: '左目', right: '右目', both: '双目' };
  const l = labels || defaultLabels;

  return (
    <div className="grid grid-cols-3 gap-1">
      {(['left', 'right', 'both'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => !disabled && onChange(mode)}
          disabled={disabled}
          className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            value === mode
              ? 'bg-purple-600 text-white'
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
          } disabled:opacity-50`}
        >
          {l[mode]}
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
  const { state, updateSensorConfig, updateSaveConfig, startCollection, stopCollection, dispatch } = useApp();
  const {
    simulateTemperatureHumidity,
    simulateThermalRadiation,
    simulateIlluminance,
  } = useSimulateData();

  const { sensorConfig, saveConfig, collectionStatus, sensorStatus } = state;
  const isCollecting = collectionStatus === 'collecting';

  const [backendConnected, setBackendConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [cameraBackendRunning, setCameraBackendRunning] = useState(false);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/status`);
        if (response.ok) {
          const data = await response.json();
          setBackendConnected(true);
          setCameraBackendRunning(data.camera?.running || false);
          setConnectionError(null);
        } else {
          setBackendConnected(false);
        }
      } catch {
        setBackendConnected(false);
        setConnectionError('无法连接到后端服务');
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isCollecting) return;

    const intervals: NodeJS.Timeout[] = [];

    if (sensorConfig.temperatureHumidity.enabled) {
      intervals.push(
        setInterval(
          simulateTemperatureHumidity,
          sensorConfig.temperatureHumidity.interval * 1000
        )
      );
    }

    if (sensorConfig.thermalRadiation.enabled) {
      intervals.push(
        setInterval(
          simulateThermalRadiation,
          sensorConfig.thermalRadiation.interval * 1000
        )
      );
    }

    if (sensorConfig.spectrometer.enabled) {
      intervals.push(
        setInterval(
          simulateIlluminance,
          sensorConfig.spectrometer.interval * 1000
        )
      );
    }

    return () => intervals.forEach(clearInterval);
  }, [
    isCollecting,
    sensorConfig,
    simulateTemperatureHumidity,
    simulateThermalRadiation,
    simulateIlluminance,
  ]);

  const handleToggleCSI = useCallback(async () => {
    if (sensorStatus.wifiCSI === 'connected') {
      onStopCSI?.();
      dispatch({ type: 'SET_SENSOR_STATUS', payload: { wifiCSI: 'idle' } });
      dispatch({
        type: 'UPDATE_SENSOR_CONFIG',
        payload: { wifiCSI: { enabled: false, connected: false } },
      });
    } else {
      try {
        setConnecting(true);
        setConnectionError(null);

        await api.startCSI();

        dispatch({ type: 'SET_SENSOR_STATUS', payload: { wifiCSI: 'connected' } });
        dispatch({
          type: 'UPDATE_SENSOR_CONFIG',
          payload: { wifiCSI: { enabled: true, connected: true } },
        });

        onStartCSI?.();
      } catch (error: any) {
        setConnectionError(`CSI连接失败: ${error.message}`);
      } finally {
        setConnecting(false);
      }
    }
  }, [sensorStatus.wifiCSI, dispatch, onStartCSI, onStopCSI]);

  const handleStartCollection = useCallback(async () => {
    if (!backendConnected) {
      setConnectionError('后端服务未连接');
      return;
    }

    try {
      onStartCamera?.();
      startCollection();
      setCameraBackendRunning(true);
    } catch (error: any) {
      setConnectionError(`启动采集失败: ${error.message}`);
    }
  }, [backendConnected, startCollection, onStartCamera]);

  const handleStopCollection = useCallback(async () => {
    onStopCamera?.();

    try {
      await api.stopCamera();
    } catch (error: any) {
      console.error('停止后端失败:', error);
    }

    setCameraBackendRunning(false);
    stopCollection();
  }, [stopCollection, onStopCamera]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm xl:max-h-[calc(100vh-120px)] flex flex-col overflow-hidden">
      <div className="p-6 pb-4 border-b border-gray-100 shrink-0">
        <h2 className="text-lg font-semibold text-gray-900">采集设置</h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-6">
        {!backendConnected && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-800">后端服务未连接</p>
                <p className="text-xs text-yellow-600">请在本地运行: cd backend && python main.py</p>
              </div>
            </div>
          </div>
        )}

        {backendConnected && (
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <p className="text-xs">后端服务已连接</p>
            </div>
          </div>
        )}

        <div
          className={`p-4 rounded-xl border-2 transition-colors ${
            isCollecting
              ? 'border-emerald-300 bg-emerald-50'
              : state.errors.length > 0
                ? 'border-red-300 bg-red-50'
                : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-3">
            {isCollecting ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            ) : state.errors.length > 0 ? (
              <XCircle className="w-6 h-6 text-red-600" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-400" />
            )}
            <div>
              <p
                className={`font-medium ${
                  isCollecting
                    ? 'text-emerald-700'
                    : state.errors.length > 0
                      ? 'text-red-700'
                      : 'text-gray-600'
                }`}
              >
                {isCollecting ? '采集中' : state.errors.length > 0 ? '采集异常' : '等待开始'}
              </p>
              <p className="text-xs text-gray-500">
                {isCollecting
                  ? '视频和传感器数据采集中'
                  : state.errors.length > 0
                    ? state.errors[0]?.message
                    : '点击下方按钮开始采集'}
              </p>
            </div>
          </div>
        </div>

        {/* 温湿度 */}
        <div className="p-4 bg-gray-50 rounded-xl">
          <SectionTitle
            icon={<Thermometer className="w-5 h-5 text-blue-600" />}
            title="温湿度传感器"
            status={sensorStatus.temperatureHumidity}
            statusColor={sensorStatus.temperatureHumidity === 'active' ? 'emerald' : 'gray'}
          />

          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-600">采集参数</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">采集间隔 (秒)</label>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  disabled={isCollecting}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">采集精度</label>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  disabled={isCollecting}
                >
                  <option value="0.1">0.1°C</option>
                  <option value="0.01">0.01°C</option>
                  <option value="0.001">0.001°C</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-600 mb-2">保存设置</p>
            <Checkbox
              label="保存温湿度数据为 CSV"
              checked={saveConfig.temperatureHumidity.enabled}
              onChange={(checked) =>
                updateSaveConfig({
                  temperatureHumidity: { enabled: checked },
                })
              }
              disabled={isCollecting}
            />
          </div>
        </div>

        {/* 热辐射 */}
        <div className="p-4 bg-gray-50 rounded-xl">
          <SectionTitle
            icon={<Sun className="w-5 h-5 text-orange-600" />}
            title="热辐射传感器"
            status={sensorStatus.thermalRadiation}
            statusColor={sensorStatus.thermalRadiation === 'active' ? 'emerald' : 'gray'}
          />

          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-600">采集参数</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">采集间隔 (秒)</label>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  disabled={isCollecting}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">采集精度</label>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  disabled={isCollecting}
                >
                  <option value="0.1">0.1°C</option>
                  <option value="0.01">0.01°C</option>
                  <option value="0.001">0.001°C</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-600 mb-2">保存设置</p>
            <Checkbox
              label="保存热辐射数据为 CSV"
              checked={saveConfig.thermalRadiation.enabled}
              onChange={(checked) =>
                updateSaveConfig({
                  thermalRadiation: { enabled: checked },
                })
              }
              disabled={isCollecting}
            />
          </div>
        </div>

        {/* 光谱照度计 */}
        <div className="p-4 bg-gray-50 rounded-xl">
          <SectionTitle
            icon={<Lightbulb className="w-5 h-5 text-yellow-600" />}
            title="光谱照度计"
            status={sensorStatus.spectrometer}
            statusColor={sensorStatus.spectrometer === 'active' ? 'emerald' : 'gray'}
          />

          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-600">采集参数</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">采集间隔 (秒)</label>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  disabled={isCollecting}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">采集精度</label>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  disabled={isCollecting}
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-600 mb-2">保存设置</p>
            <Checkbox
              label="保存光谱照度数据为 CSV"
              checked={saveConfig.spectrometer.enabled}
              onChange={(checked) =>
                updateSaveConfig({
                  spectrometer: { enabled: checked },
                })
              }
              disabled={isCollecting}
            />
          </div>
        </div>

        {/* 双目摄像头 */}
        <div className="p-4 bg-gray-50 rounded-xl">
          <SectionTitle
            icon={<Camera className="w-5 h-5 text-purple-600" />}
            title="双目摄像头"
            status={cameraBackendRunning ? 'active' : 'idle'}
            statusColor={cameraBackendRunning ? 'emerald' : 'gray'}
          />

          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-600">参数设置</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">视频帧率</label>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  disabled={isCollecting}
                >
                  <option value={15}>15 fps</option>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">图像采集间隔 (秒)</label>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
                  disabled={isCollecting}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-600 mb-3">保存设置</p>

            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-medium">视频</p>
                <div className="pl-2 space-y-2">
                  <Checkbox
                    label="保存原始视频"
                    checked={saveConfig.binocularCamera.save_raw_video}
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
                    <div className="pl-4">
                      <label className="block text-xs text-gray-500 mb-1">保存视角</label>
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
                    checked={saveConfig.binocularCamera.save_tracked_video}
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
                    <div className="pl-4">
                      <label className="block text-xs text-gray-500 mb-1">保存视角</label>
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
                              tracked_video_view: v === 'both' ? 'right' : v,
                            },
                          })
                        }
                        labels={{ left: '左目', right: '右目', both: '右目' }}
                        disabled={isCollecting}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-medium">图像</p>
                <div className="pl-2 space-y-2">
                  <Checkbox
                    label="保存原始图像"
                    checked={saveConfig.binocularCamera.save_raw_images}
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
                    <div className="pl-4">
                      <label className="block text-xs text-gray-500 mb-1">保存视角</label>
                      <TripleButtonGroup
                        value={saveConfig.binocularCamera.raw_image_views}
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
                    checked={saveConfig.binocularCamera.save_tracked_images}
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
                    <div className="pl-4">
                      <label className="block text-xs text-gray-500 mb-1">保存视角</label>
                      <TripleButtonGroup
                        value={saveConfig.binocularCamera.tracked_image_views}
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

              <div className="space-y-2 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-medium">其他</p>
                <div className="pl-2 space-y-2">
                  <Checkbox
                    label="保存人物片段 (person clips)"
                    checked={saveConfig.binocularCamera.save_person_clips}
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
                    checked={saveConfig.binocularCamera.save_classification_results}
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

        {/* WiFi CSI */}
        <div className="p-4 bg-gray-50 rounded-xl">
          <SectionTitle
            icon={<Wifi className="w-5 h-5 text-cyan-600" />}
            title="WiFi CSI"
            status={sensorStatus.wifiCSI}
            statusColor={sensorStatus.wifiCSI === 'connected' ? 'emerald' : 'gray'}
            statusText={sensorStatus.wifiCSI === 'connected' ? '已连接' : '未连接'}
          />

          <p className="text-xs text-gray-500 mb-3">
            点击按钮启用CSI采集（需要后端服务运行）
          </p>

          <button
            onClick={handleToggleCSI}
            className={`w-full py-2.5 px-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
              sensorStatus.wifiCSI === 'connected'
                ? 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200 border-2 border-cyan-300'
                : 'bg-cyan-600 text-white hover:bg-cyan-700'
            }`}
            disabled={connecting || !backendConnected}
          >
            {connecting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {sensorStatus.wifiCSI === 'connected' ? '断开中...' : '连接中...'}
              </>
            ) : sensorStatus.wifiCSI === 'connected' ? (
              <>
                <WifiOff className="w-5 h-5" />
                断开 CSI 连接
              </>
            ) : (
              <>
                <Wifi className="w-5 h-5" />
                启用 CSI 采集
              </>
            )}
          </button>

          <div className="mt-4 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-600 mb-2">保存设置</p>
            <div className="space-y-2">
              <Checkbox
                label="保存原始 CSI 数据"
                checked={saveConfig.wifiCSI.save_raw_csi}
                onChange={(checked) =>
                  updateSaveConfig({
                    wifiCSI: { ...saveConfig.wifiCSI, save_raw_csi: checked },
                  })
                }
                disabled={isCollecting}
              />
              <Checkbox
                label="保存切片数据"
                checked={saveConfig.wifiCSI.save_slice_data}
                onChange={(checked) =>
                  updateSaveConfig({
                    wifiCSI: { ...saveConfig.wifiCSI, save_slice_data: checked },
                  })
                }
                disabled={isCollecting}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 pt-4 border-t border-gray-100 shrink-0 bg-white">
        <div className="flex gap-3">
          <button
            onClick={isCollecting ? handleStopCollection : handleStartCollection}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition-colors ${
              isCollecting
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
            disabled={connecting}
          >
            {isCollecting ? (
              <>
                <Square className="w-5 h-5" />
                停止采集
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                开始采集
              </>
            )}
          </button>
        </div>

        {connectionError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">{connectionError}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}