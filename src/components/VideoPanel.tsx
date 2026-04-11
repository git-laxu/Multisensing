import React, { useState } from 'react';
import { Camera, Eye, Monitor } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { CameraFrame, SensorConfig } from '../types';

interface VideoPanelProps {
  cameraFrame?: CameraFrame | null;
  sensorConfig?: SensorConfig;
  collectionStatus?: string;
}

export function VideoPanel({
  cameraFrame: propCameraFrame,
  sensorConfig: propSensorConfig,
  collectionStatus: propCollectionStatus
}: VideoPanelProps) {
  const { state } = useApp();
  const cameraFrame = propCameraFrame ?? state.cameraFrame;
  const sensorConfig = propSensorConfig ?? state.sensorConfig;
  const collectionStatus = propCollectionStatus ?? state.collectionStatus;

  const [displayMode, setDisplayMode] = useState<'right' | 'left' | 'both'>(
    sensorConfig.binocularCamera.mode === 'both' ? 'both' :
    sensorConfig.binocularCamera.mode === 'left' ? 'left' : 'right'
  );

  const isCollecting = collectionStatus === 'collecting';
  const hasDetections = cameraFrame && cameraFrame.detections.length > 0;
  const isCameraEnabled = sensorConfig.binocularCamera.enabled;

  // 面板标题区域高度（固定）
  const headerHeight = 56;
  // 模式切换区域高度（如果有）
  const modeSwitchHeight = isCameraEnabled && sensorConfig.binocularCamera.mode === 'both' ? 44 : 0;
  // 固定标题区域总高度
  const fixedHeaderHeight = headerHeight + modeSwitchHeight;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm h-full flex flex-col overflow-hidden">
      {/* 固定标题区域 */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0" style={{ height: headerHeight }}>
        <h2 className="text-lg font-semibold text-gray-900">视频可视化</h2>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isCollecting ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-sm text-gray-600">
            {isCollecting ? '采集中' : '未采集'}
          </span>
        </div>
      </div>

      {/* 摄像头模式切换 - 固定位置 */}
      {isCameraEnabled && sensorConfig.binocularCamera.mode === 'both' && (
        <div className="flex items-center gap-4 mb-3 flex-shrink-0" style={{ height: modeSwitchHeight }}>
          <span className="text-sm text-gray-600">显示通道:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setDisplayMode('left')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                displayMode === 'right'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={isCollecting}
            >
              右目
            </button>
            <button
              onClick={() => setDisplayMode('both')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                displayMode === 'both'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={isCollecting}
            >
              双目
            </button>
          </div>
        </div>
      )}

      {/* 未启用摄像头时的提示 */}
      {!isCameraEnabled && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
          <Camera className="w-10 h-10 mb-2 text-gray-300" />
          <p className="text-sm">双目摄像头未启用</p>
          <p className="text-xs">请在左侧设置中启用摄像头</p>
        </div>
      )}

      {/* 已启用摄像头 - 根据采集状态调整布局 */}
      {isCameraEnabled && (
        <div className="flex-1 flex flex-col min-h-0" style={{ height: `calc(100% - ${fixedHeaderHeight}px)` }}>
          {/* 视频显示区域 - 收缩30%后变为70%，下方显示详细信息占30% */}
          <div
            className={`relative bg-gray-900 rounded-xl overflow-hidden flex-shrink-0 transition-all duration-300`}
            style={{
              // 未采集时：占满剩余空间
              // 采集时且有检测结果：收缩30%（变为70%高度）
              height: (isCollecting && hasDetections) ? '70%' : '100%'
            }}
          >
            {cameraFrame ? (
              displayMode === 'both' ? (
                <div className="flex h-full">
                  <div className="flex-1 border-r border-gray-700">
                    <img
                      src={cameraFrame.leftFrame || ''}
                      alt="左目"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex-1">
                    <img
                      src={cameraFrame.rightFrame || ''}
                      alt="右目"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              ) : (
                <img
                  src={displayMode === 'left' ? cameraFrame.leftFrame || '' : cameraFrame.rightFrame || ''}
                  alt="Camera Feed"
                  className="w-full h-full object-contain"
                />
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                <Monitor className="w-6 h-6 mr-2" />
                <p className="text-xs">
                  {isCollecting ? '等待视频数据...' : '开始采集后显示视频画面'}
                </p>
              </div>
            )}

            {/* 检测信息覆盖 */}
            {hasDetections && (
              <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded-lg text-xs">
                <div className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  <span>检测到 {cameraFrame.detections.length} 个目标</span>
                </div>
              </div>
            )}

            {/* 帧率信息 */}
            <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-0.5 rounded text-xs">
              {sensorConfig.binocularCamera.frameRate} FPS
            </div>
          </div>

          {/* 检测结果列表 - 采集时有检测结果时显示在下方的30%空间 */}
          {isCollecting && hasDetections && (
            <div
              className="flex-1 mt-2 overflow-hidden flex flex-col"
              style={{ height: '30%' }}
            >
              <h4 className="text-xs font-medium text-gray-700 mb-1 flex-shrink-0">检测结果</h4>
              <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
                {cameraFrame.detections.map((detection, idx) => (
                  <div
                    key={detection.id || idx}
                    className="flex items-center justify-between bg-gray-50 p-1.5 rounded-lg border border-gray-200 flex-shrink-0"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-purple-100 rounded-full flex items-center justify-center">
                        <span className="text-purple-700 font-semibold text-xs">
                          {(detection.label || 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900">{detection.label || 'Unknown'}</p>
                        {detection.action && (
                          <p className="text-xs text-purple-600">动作: {detection.action}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-gray-900">
                        {((detection.confidence || 0) * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 未采集时且没有检测结果时的空状态 */}
          {!isCollecting && !hasDetections && cameraFrame && (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <p className="text-xs">等待检测结果...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
