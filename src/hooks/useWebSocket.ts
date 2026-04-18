/**
 * WebSocket连接管理Hook
 * 用于管理与后端服务的WebSocket连接
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import * as api from '../services/api';

// 后端服务地址
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

// 摄像头配置接口 - 与后端 artifact_saver.py 中的字段保持一致
export interface CameraConfig {
  project_name: string;
  camera_index?: number;
  frame_rate?: number;
  display_mode?: 'left' | 'right' | 'both';
  save_options?: {
    save_raw_video?: boolean;
    save_tracked_video?: boolean;
    save_raw_images?: boolean;
    save_tracked_images?: boolean;
    save_person_clips?: boolean;
    save_classification_results?: boolean;
    raw_image_interval?: number;
    tracked_image_interval?: number;
    video_fps?: number;
    tracked_video_view?: 'left' | 'right';
    tracked_image_views?: 'left' | 'right' | 'both';
    raw_image_views?: 'left' | 'right' | 'both';
    raw_video_view?: 'left' | 'right' | 'both';
  };
}

export function useCameraWebSocket(enabled: boolean, config?: CameraConfig) {
  const wsRef = useRef<WebSocket | null>(null);
  const configRef = useRef<CameraConfig | undefined>(config);

  // 始终保持 configRef 为最新值
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
  });
  const [lastFrame, setLastFrame] = useState<{
    frame_left?: string | null;
    frame_right?: string | null;
    frame_id: number;
    detections: {
      left: api.Detection[];
      right: api.Detection[];
    };
    timestamp: number;
  } | null>(null);

  const onMessageRef = useRef<((data: api.VideoDataMessage) => void) | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));

    try {
      const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/api/camera/ws`;
      console.log('[Camera WS] 尝试连接:', wsUrl);

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[Camera WS] 连接成功');
        setState({ connected: true, connecting: false, error: null });
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as api.VideoDataMessage;
          if (data.type === 'video_frame') {
            setLastFrame({
              frame_left: data.frame_left ?? null,
              frame_right: data.frame_right ?? null,
              frame_id: data.frame_id,
              detections: {
                left: data.detections.left ?? [],
                right: data.detections.right ?? [],
              },
              timestamp: data.timestamp,
            });

            onMessageRef.current?.(data);
          }
        } catch (e) {
          console.error('[Camera WS] 消息解析错误:', e);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[Camera WS] 连接错误:', error);
        setState({ connected: false, connecting: false, error: 'WebSocket连接错误' });
      };

      wsRef.current.onclose = () => {
        console.log('[Camera WS] 连接关闭');
        setState({ connected: false, connecting: false, error: null });
      };
    } catch (error: any) {
      console.error('[Camera WS] 连接失败:', error);
      setState({ connected: false, connecting: false, error: error.message });
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState({ connected: false, connecting: false, error: null });
    setLastFrame(null);
  }, []);

  // 启动后端摄像头服务
  const startBackendCamera = useCallback(async (cameraConfig?: CameraConfig) => {
    try {
      console.log('[Camera WS] 启动后端摄像头服务...');
      // 优先使用传入的配置，否则使用 ref 中保存的最新配置
      const effectiveConfig = cameraConfig || configRef.current;
      // 合并传入的配置和默认配置
      const finalConfig = {
        camera_index: effectiveConfig?.camera_index ?? 0,
        frame_rate: effectiveConfig?.frame_rate ?? 30,
        display_mode: effectiveConfig?.display_mode ?? 'right',
        project_name: effectiveConfig?.project_name ?? 'default_project',
        save_options: effectiveConfig?.save_options ?? {
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
      };
      console.log('[Camera WS] 最终配置:', JSON.stringify(finalConfig, null, 2));
      await api.startCamera(finalConfig);
      // 等待一小段时间让服务启动
      await new Promise(resolve => setTimeout(resolve, 500));
      connect();
    } catch (error: any) {
      console.error('[Camera WS] 启动后端失败:', error);
      setState(prev => ({ ...prev, error: `启动后端失败: ${error.message}` }));
    }
  }, [connect]);

  // 停止后端摄像头服务
  const stopBackendCamera = useCallback(async () => {
    disconnect();
    try {
      await api.stopCamera();
      console.log('[Camera WS] 后端摄像头服务已停止');
    } catch (error: any) {
      console.error('[Camera WS] 停止后端失败:', error);
    }
  }, [disconnect]);

  // 自动连接/断开
  useEffect(() => {
    if (enabled) {
      startBackendCamera();
    } else {
      stopBackendCamera();
    }

    return () => {
      disconnect();
    };
  }, [enabled, startBackendCamera, stopBackendCamera, disconnect]);

  return {
    ...state,
    lastFrame,
    startBackendCamera,
    stopBackendCamera,
    reconnect: connect,
  };
}

export function useCSIWebSocket(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
  });
  const [lastData, setLastData] = useState<{
    amplitude: number[];
    channel?: number;
    stats: api.CSIDataMessage['stats'];
    timestamp: number;
  } | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));

    try {
      const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/api/csi/ws`;
      console.log('[CSI WS] 尝试连接:', wsUrl);

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[CSI WS] 连接成功');
        setState({ connected: true, connecting: false, error: null });
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as api.CSIDataMessage;
          if (data.type === 'csi_data') {
            setLastData({
              amplitude: data.amplitude,
              channel: data.channel,
              stats: data.stats,
              timestamp: data.timestamp,
            });
          }
        } catch (e) {
          console.error('[CSI WS] 消息解析错误:', e);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[CSI WS] 连接错误:', error);
        setState({ connected: false, connecting: false, error: 'WebSocket连接错误' });
      };

      wsRef.current.onclose = () => {
        console.log('[CSI WS] 连接关闭');
        setState({ connected: false, connecting: false, error: null });
      };
    } catch (error: any) {
      console.error('[CSI WS] 连接失败:', error);
      setState({ connected: false, connecting: false, error: error.message });
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState({ connected: false, connecting: false, error: null });
    setLastData(null);
  }, []);

  // 启动后端CSI服务
  const startBackendCSI = useCallback(async () => {
    try {
      console.log('[CSI WS] 启动后端CSI服务...');
      await api.startCSI();
      await new Promise(resolve => setTimeout(resolve, 500));
      connect();
    } catch (error: any) {
      console.error('[CSI WS] 启动后端失败:', error);
      setState(prev => ({ ...prev, error: `启动后端失败: ${error.message}` }));
    }
  }, [connect]);

  // 停止后端CSI服务
  const stopBackendCSI = useCallback(async () => {
    disconnect();
    try {
      await api.stopCSI();
      console.log('[CSI WS] 后端CSI服务已停止');
    } catch (error: any) {
      console.error('[CSI WS] 停止后端失败:', error);
    }
  }, [disconnect]);

  // 自动连接/断开
  useEffect(() => {
    if (enabled) {
      startBackendCSI();
    } else {
      stopBackendCSI();
    }

    return () => {
      disconnect();
    };
  }, [enabled, startBackendCSI, stopBackendCSI, disconnect]);

  return {
    ...state,
    lastData,
    startBackendCSI,
    stopBackendCSI,
    reconnect: connect,
  };
}
