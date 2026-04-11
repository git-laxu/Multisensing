import React, { useState } from 'react';
import { Camera, Wifi, Eye, Monitor } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { CameraFrame, CSIData, SensorConfig } from '../types';

export function VideoDisplay() {
  const { state, updateSensorConfig } = useApp();
  const { cameraFrame, csiData, sensorConfig, collectionStatus } = state;
  const [viewMode, setViewMode] = useState<'video' | 'csi'>('video');

  const isCollecting = collectionStatus === 'collecting';

  // CSI数据处理
  const csiChartData = csiData
    ? csiData.amplitude.map((amp, idx) => ({
        subcarrier: csiData.subcarrierIndex[idx],
        amplitude: amp,
      }))
    : [];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">视频与CSI可视化</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('video')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'video'
                ? 'bg-purple-100 text-purple-700 border border-purple-300'
                : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Camera className="w-4 h-4" />
            双目视频
          </button>
          <button
            onClick={() => setViewMode('csi')}
            disabled={!sensorConfig.wifiCSI.connected}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'csi'
                ? 'bg-cyan-100 text-cyan-700 border border-cyan-300'
                : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Wifi className="w-4 h-4" />
            CSI数据
          </button>
        </div>
      </div>

      {viewMode === 'video' ? (
        <VideoView
          cameraFrame={cameraFrame}
          sensorConfig={sensorConfig}
          isCollecting={isCollecting}
        />
      ) : (
        <CSIView csiData={csiData} csiChartData={csiChartData} />
      )}
    </div>
  );
}

interface VideoViewProps {
  cameraFrame: CameraFrame | null;
  sensorConfig: SensorConfig;
  isCollecting: boolean;
}

function VideoView({ cameraFrame, sensorConfig, isCollecting }: VideoViewProps) {
  const [displayMode, setDisplayMode] = useState<'right' | 'left'>(
    sensorConfig.binocularCamera.mode === 'both'
      ? 'right'
      : sensorConfig.binocularCamera.mode === 'left'
        ? 'left'
        : 'right'
  );

  return (
    <div className="space-y-4">
      {/* 摄像头模式切换 */}
      {sensorConfig.binocularCamera.mode === 'both' && (
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">显示通道:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setDisplayMode('left')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                displayMode === 'left'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={isCollecting}
            >
              左目
            </button>
            <button
              onClick={() => setDisplayMode('right')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                displayMode === 'right'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={isCollecting}
            >
              右目
            </button>
          </div>
        </div>
      )}

      {/* 视频显示区域 */}
      <div className="relative bg-gray-900 rounded-xl overflow-hidden aspect-video">
        {cameraFrame ? (
          <img
            src={displayMode === 'left' ? cameraFrame.leftFrame || '' : cameraFrame.rightFrame || ''}
            alt="Camera Feed"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <Monitor className="w-16 h-16 mb-4" />
            <p className="text-sm">
              {isCollecting ? '等待视频数据...' : '开始采集后显示视频画面'}
            </p>
          </div>
        )}

        {/* 检测信息覆盖 */}
        {cameraFrame && cameraFrame.detections.length > 0 && (
          <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-2 rounded-lg text-xs">
            <div className="flex items-center gap-2">
              <Eye className="w-3 h-3" />
              <span>检测到 {cameraFrame.detections.length} 个目标</span>
            </div>
          </div>
        )}
      </div>

      {/* 检测结果列表 */}
      {cameraFrame && cameraFrame.detections.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">检测结果</h4>
          <div className="space-y-2">
            {cameraFrame.detections.map((detection, idx) => (
              <div
                key={detection.id || idx}
                className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                    <span className="text-purple-700 font-semibold text-sm">
                      {detection.label.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{detection.label}</p>
                    {detection.action && (
                      <p className="text-xs text-purple-600">动作: {detection.action}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">
                    {(detection.confidence * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500">置信度</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!sensorConfig.binocularCamera.enabled && (
        <div className="text-center py-8 text-gray-500">
          <Camera className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>双目摄像头未启用</p>
        </div>
      )}
    </div>
  );
}

interface CSIViewProps {
  csiData: CSIData | null;
  csiChartData: Array<{ subcarrier: number; amplitude: number }>;
}

function CSIView({ csiData, csiChartData }: CSIViewProps) {
  // 渲染简单的CSI振幅图
  const maxAmplitude = csiData ? Math.max(...csiData.amplitude) : 100;

  return (
    <div className="space-y-4">
      {/* CSI状态 */}
      <div className="flex items-center justify-between bg-cyan-50 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${csiData ? 'bg-cyan-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-sm font-medium text-cyan-800">
            {csiData ? 'CSI数据流正常' : '等待CSI数据...'}
          </span>
        </div>
        {csiData && (
          <span className="text-xs text-cyan-600">
            更新时间: {csiData.timestamp.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* CSI可视化区域 */}
      <div className="bg-gray-900 rounded-xl p-4">
        {csiData ? (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-300">子载波振幅变化趋势</h4>
            {/* 振幅柱状图 */}
            <div className="flex items-end justify-between h-48 gap-1">
              {csiChartData.map((item, idx) => (
                <div
                  key={idx}
                  className="flex-1 bg-gradient-to-t from-cyan-400 to-cyan-600 rounded-t-sm transition-all duration-100"
                  style={{ height: `${(item.amplitude / maxAmplitude) * 100}%` }}
                  title={`子载波 ${item.subcarrier}: ${item.amplitude.toFixed(2)}`}
                />
              ))}
            </div>
            {/* X轴标签 */}
            <div className="flex justify-between text-xs text-gray-500">
              <span>-26</span>
              <span>0</span>
              <span>+26</span>
            </div>
            {/* 统计信息 */}
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="text-center">
                <p className="text-xs text-gray-500">平均振幅</p>
                <p className="text-lg font-semibold text-cyan-400">
                  {(csiData.amplitude.reduce((a, b) => a + b, 0) / csiData.amplitude.length).toFixed(1)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">最大振幅</p>
                <p className="text-lg font-semibold text-cyan-400">
                  {Math.max(...csiData.amplitude).toFixed(1)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">最小振幅</p>
                <p className="text-lg font-semibold text-cyan-400">
                  {Math.min(...csiData.amplitude).toFixed(1)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-gray-400">
            <Wifi className="w-16 h-16 mb-4" />
            <p className="text-sm">启用CSI连接后显示数据</p>
          </div>
        )}
      </div>

      {/* CSI原始数据 */}
      {csiData && (
        <div className="bg-gray-50 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">CSI详细信息</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500">子载波数量</p>
              <p className="font-semibold text-gray-900">{csiData.amplitude.length}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500">采样时间</p>
              <p className="font-semibold text-gray-900">{csiData.timestamp.toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
