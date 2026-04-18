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
import {
  useCameraWebSocket,
  useCSIWebSocket,
  CameraConfig,
} from '../hooks/useWebSocket';
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
    if (!lastFrame) return;

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
  }, [lastFrame, dispatch]);

  useEffect(() => {
    if (!lastData) return;

    const csi: CSIData = {
      timestamp: new Date(lastData.timestamp),
      amplitude: lastData.amplitude,
      phase: [],
      subcarrierIndex: lastData.amplitude.map(
        (_, i) => i - Math.floor(lastData.amplitude.length / 2)
      ),
    };

    dispatch({ type: 'SET_CSI_DATA', payload: csi });
  }, [lastData, dispatch]);

  return (
    // 页边距
    <main className="p-4">         {/* 页边距（左侧，右侧，上侧 */}{/* 值越小，边距越小 */}
      <div className="max-w-full mx-auto">
        {!hasProject && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                <span className="font-bold text-blue-600">
                  {hasProjects ? '!' : '?'}
                </span>
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

        {/* 左边采集设置 + 右边全部可视化区域”这一整块的总高度：
            flex 表示左边和右边并排，
            gap-4 表示左面板和右面板中间的间距；
            130px 表示总高度，值越小，整块区域越高高
                                                   */}
        <div className="flex gap-4" style={{ height: 'calc(100vh - 110px)' }}> 
          
          {/* 左侧采集设置面板尺寸：
              w-80 就是左侧面板宽度，Tailwind 里 w-80 对应固定宽度 20rem（约 320px），可以用 w-[340px] 来精确表达；
              shrink-0 表示即使窗口变窄，左边这块也不要被压缩
              h-full 表示左侧面板高度吃满父容器，也就是吃满前面那句 calc(100vh - 110px) 算出来的总高度 
                                                            */}
          <div className="w-[380px] shrink-0 h-full">
            <SensorSettings
              onStartCamera={startBackendCamera}
              onStopCamera={stopBackendCamera}
              onStartCSI={startBackendCSI}
              onStopCSI={stopBackendCSI}
            />
          </div>

          {/* 右侧把左边剩下的全部宽度吃掉
              flex-1 控制右侧整体宽度，右边自动占除左侧采集设置宽度之外的剩余空间；
              h-full 表示右边高度也吃满总高度；
              flex flex-col 表示右侧内部是竖向排布，2×2 可视化区在上，结果区在下；
              gap-4 是这两个上下区域之间的垂直间距；
              min-w-0 允许右侧内容在空间不够时正确收缩？？？？？？？？？？？？？？？？？？？？？？？ */}
          <div className="flex-1 h-full min-w-0 flex flex-col gap-4">

            {/* 四块面板的总布局控制中心：
                grid-cols-2 决定了它是两列，所以四个面板呈现成 2×2，改成 grid-cols-1，四块就会纵向排成一列；改成 grid-cols-3，就会变成三列布局
                gap-4 控制四个面板之间横向和纵向的间距
                flex-1 表示“在右侧这根竖向 flex 里，上面这个 grid 区域自动吃掉除底部结果区之外的剩余高度”
                       如果想改“上面四宫格整体高度”，最直接不是改这里，而是改下面结果区的高度，因为这里是吃剩余空间的
                min-h-0 防止 grid 因为内部内容过高而不愿收缩
                auto-rows-fr 让 grid 的每一行尽量均分可用高度，所以两行面板大体一样高。*/}
            <div className="grid flex-1 min-h-0 grid-cols-2 gap-4 auto-rows-fr">
              
              {/* h-full 表示单个 panel 吃满自己那个网格格子的高度；
                  min-h-0 还是为了允许内部收缩 */}
              <div className="min-h-0 h-full">
                <TemperatureHumidityPanel />
              </div>

              <div className="min-h-0 h-full">
                <VideoPanel />
              </div>

              <div className="min-h-0 h-full">
                <IlluminancePanel />
              </div>

              <div className="min-h-0 h-full">
                <CSIPanel />
              </div>
            </div>

            {/* 控制底部结果输出面板高度：
                h-[28%] 表示它占右侧整列高度的大约 28%。所以你想让底部结果区更高，就把 28% 改大，比如 h-[32%]
                min-h-[210px] 是底部结果区的最小高度保护，如果觉得窗口缩小时底部还是太高，可以把这个值降一点，比如 min-h-[180px]
                shrink-0 表示不参与压缩，优先保住自己的高度 */}
            <div className="h-[20%] min-h-[160px] shrink-0">
              <ResultsPanel />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}