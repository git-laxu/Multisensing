/**
 * 数据采集页面 - 集成WebSocket连接
 */
import React, { useEffect } from 'react';
import { SensorSettings } from './SensorSettings';
import { TemperatureHumidityPanel } from './TemperatureHumidityPanel';
import { IlluminancePanel } from './IlluminancePanel';
import { VideoPanel } from './VideoPanel';
import { CSIPanel } from './CSIPanel';
import { ResultsPanel } from './ResultsPanel';
import { useCameraWebSocket, useCSIWebSocket, CameraConfig } from '../hooks/useWebSocket';
import { useApp } from '../contexts/AppContext';
import { CameraFrame, CSIData } from '../types';

export function DataCollectionPage() {
  const { state, dispatch } = useApp();
  const isCollecting = state.collectionStatus === 'collecting';
  const csiConnected = state.sensorStatus.wifiCSI === 'connected';
  const hasProject = state.currentProject !== null;
  const hasProjects = state.projects.length > 0;

  const cameraConfig: CameraConfig = {
    project_name: state.currentProject?.name || 'default_project',
    camera_index: 0,
    frame_rate: state.sensorConfig.binocularCamera.frameRate,
    display_mode: state.sensorConfig.binocularCamera.mode,
    save_options: {
      ...state.saveConfig.binocularCamera,
    },
  };

  const {
    lastFrame,
    startBackendCamera,
    stopBackendCamera,
  } = useCameraWebSocket(
    isCollecting && state.sensorConfig.binocularCamera.enabled,
    cameraConfig
  );

  const {
    lastData,
    startBackendCSI,
    stopBackendCSI,
  } = useCSIWebSocket(csiConnected);

  useEffect(() => {
    if (lastFrame) {
      const allDetections = [
        ...(lastFrame.detections.left ?? []),
        ...(lastFrame.detections.right ?? []),
      ];

      const frame: CameraFrame = {
        timestamp: new Date(lastFrame.timestamp),
        leftFrame: lastFrame.frame_left
          ? `data:image/jpeg;base64,${lastFrame.frame_left}`
          : undefined,
        rightFrame: lastFrame.frame_right
          ? `data:image/jpeg;base64,${lastFrame.frame_right}`
          : undefined,
        detections: allDetections.map((d, idx) => ({
          id: `person_${d.track_id}_${idx}`,
          bbox: d.bbox as [number, number, number, number],
          label: d.label || 'Unknown',
          confidence: d.confidence ?? 0,
          action: d.action,
        })),
      };

      dispatch({ type: 'SET_CAMERA_FRAME', payload: frame });
    }
  }, [lastFrame, dispatch]);

  useEffect(() => {
    if (lastData) {
      const csi: CSIData = {
        timestamp: new Date(lastData.timestamp),
        amplitude: lastData.amplitude,
        phase: [],
        subcarrierIndex: lastData.amplitude.map(
          (_, i) => i - Math.floor(lastData.amplitude.length / 2)
        ),
      };

      dispatch({ type: 'SET_CSI_DATA', payload: csi });
    }
  }, [lastData, dispatch]);

  return (
    <main className="p-4">
      <div className="max-w-full mx-auto">
        {!hasProject && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-600 font-bold">{hasProjects ? '!' : '?'}</span>
              </div>
              <div>
                <p className="font-medium text-blue-800">
                  {hasProjects ? '请先选择项目' : '请先创建项目'}
                </p>
                <p className="text-sm text-blue-600">
                  {hasProjects
                    ? '点击右上角的项目下拉菜单选择一个项目，然后再开始采集。'
                    : '点击右上角的“新建项目”按钮创建一个新项目。'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-4 items-start">
          {/* 左侧采集设置 */}
          <div className="min-w-0 xl:sticky xl:top-4 self-start">
            <SensorSettings
              onStartCamera={startBackendCamera}
              onStopCamera={stopBackendCamera}
              onStartCSI={startBackendCSI}
              onStopCSI={stopBackendCSI}
            />
          </div>

          {/* 右侧可视化 */}
          <div className="min-w-0 grid grid-cols-1 2xl:grid-cols-2 gap-4 auto-rows-auto">
            <div className="min-w-0 min-h-[300px]">
              <TemperatureHumidityPanel />
            </div>

            <div className="min-w-0 min-h-[300px]">
              <VideoPanel />
            </div>

            <div className="min-w-0 min-h-[300px]">
              <IlluminancePanel />
            </div>

            <div className="min-w-0 min-h-[300px]">
              <CSIPanel />
            </div>

            <div className="min-w-0 2xl:col-span-2 min-h-[150px]">
              <ResultsPanel />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}