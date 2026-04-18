import React, { useMemo, useState } from 'react';
import { Camera } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { CameraFrame, SensorConfig } from '../types';

interface VideoPanelProps {
  cameraFrame?: CameraFrame | null;
  sensorConfig?: SensorConfig;
  collectionStatus?: string;
}

function DetectionBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <div className="absolute left-3 top-3 z-10 rounded-lg bg-slate-900/85 px-3 py-1.5 text-sm text-white shadow">
      👁 检测到 {count} 个目标
    </div>
  );
}

function FrameBox({
  title,
  src,
  count,
}: {
  title: string;
  src?: string;
  count: number;
}) {
  return (
    <div className="relative h-full overflow-hidden rounded-2xl bg-slate-950">
      {src ? (
        <>
          <DetectionBadge count={count} />
          <img
            src={src}
            alt={title}
            className="h-full w-full object-contain bg-slate-950"
          />
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-gray-400">
          暂无视频帧
        </div>
      )}
    </div>
  );
}

export function VideoPanel({
  cameraFrame: propCameraFrame,
  sensorConfig: propSensorConfig,
  collectionStatus: propCollectionStatus,
}: VideoPanelProps) {
  const { state } = useApp();

  const cameraFrame = propCameraFrame ?? state.cameraFrame;
  const sensorConfig = propSensorConfig ?? state.sensorConfig;
  const collectionStatus = propCollectionStatus ?? state.collectionStatus;

  const [displayMode, setDisplayMode] = useState<'left' | 'right' | 'both'>(
    sensorConfig.binocularCamera.mode === 'both'
      ? 'both'
      : sensorConfig.binocularCamera.mode === 'left'
      ? 'left'
      : 'right'
  );

  const isCollecting = collectionStatus === 'collecting';
  const isCameraEnabled = sensorConfig.binocularCamera.enabled;

  const leftDetections = useMemo(
    () => cameraFrame?.detections?.length ?? 0,
    [cameraFrame]
  );
  const rightDetections = leftDetections;

  if (!isCameraEnabled) {
    return (
      <div className="h-full rounded-3xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-purple-500" />
            <h3 className="text-[15px] font-semibold text-gray-900">视频可视化</h3>
          </div>
          <span className="text-sm text-gray-400">未启用</span>
        </div>
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-gray-200 text-gray-400">
          双目摄像头未启用
        </div>
      </div>
    );
  }

  return (
    <div className="h-full rounded-3xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col min-h-0">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-purple-500" />
          <h3 className="text-[15px] font-semibold text-gray-900">视频可视化</h3>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isCollecting ? 'bg-emerald-500' : 'bg-gray-400'
            }`}
          />
          {isCollecting ? '采集中' : '未采集'}
        </div>
      </div>

      {sensorConfig.binocularCamera.mode === 'both' && (
        <div className="mb-3 flex items-center gap-3">
          <span className="text-sm text-gray-600">显示通道:</span>

          {(['left', 'right', 'both'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setDisplayMode(mode)}
              className={`rounded-xl px-4 py-1.5 text-sm transition-colors ${
                displayMode === mode
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {mode === 'left' ? '左目' : mode === 'right' ? '右目' : '双目'}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0">
        {displayMode === 'both' ? (
          <div className="grid h-full min-h-0 grid-cols-2 gap-2">
            <FrameBox
              title="左目画面"
              src={cameraFrame?.leftFrame}
              count={leftDetections}
            />
            <FrameBox
              title="右目画面"
              src={cameraFrame?.rightFrame}
              count={rightDetections}
            />
          </div>
        ) : displayMode === 'left' ? (
          <FrameBox
            title="左目画面"
            src={cameraFrame?.leftFrame}
            count={leftDetections}
          />
        ) : (
          <FrameBox
            title="右目画面"
            src={cameraFrame?.rightFrame}
            count={rightDetections}
          />
        )}
      </div>
    </div>
  );
}