/**
 * 后端API服务
 * 提供与Python后端通信的接口
 * 同时支持本地存储模式，兼容无后端环境
 */

// 后端服务地址（根据实际部署环境配置）
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// 本地存储键名
const STORAGE_KEYS = {
  PROJECTS: 'multi_sensor_projects',
  SESSIONS: 'multi_sensor_sessions',
};

// ============================================================================
// 类型定义
// ============================================================================

export interface CSIStatus {
  running: boolean;
  receiver?: {
    received_packets: number;
  };
  processor?: {
    total_packets: number;
    total_processed: number;
    total_saved: number;
  };
  slicer?: {
    fragment_count: number;
    slice_count: number;
    stream_cache_rows: number;
  };
  websocket_connections: number;
}

export interface CSIDataMessage {
  type: 'csi_data';
  timestamp: number;
  amplitude: number[];
  stats: {
    received_packets: number;
    processed: number;
    fragments: number;
    slices: number;
  };
}

export interface CameraStatus {
  running: boolean;
  frame_count: number;
  detection_count: number;
  websocket_connections: number;
  capture_alive: boolean;
  tracking_alive: boolean;
}

export interface Detection {
  track_id: number;
  bbox: number[];
  label: string;
  confidence: number;
  action?: string;
  action_confidence?: number;
}

export interface VideoDataMessage {
  type: 'video_frame';
  frame_id: number;
  timestamp: number;
  frame?: string; // 兼容旧格式：单帧图像
  frame_left?: string | null; // 左目图像 base64编码
  frame_right?: string | null; // 右目图像 base64编码
  detections: {
    left: Detection[];
    right: Detection[];
  };
  stats: {
    frame_count: number;
    detection_count: number;
  };
}

export interface OverallStatus {
  csi: CSIStatus;
  camera: CameraStatus;
}

export interface ApiResponse {
  status: string;
  message?: string;
}

// ============================================================================
// 项目管理 API
// ============================================================================

export interface ProjectInfo {
  name: string;
  created_at: string;
  updated_at: string;
  session_count: number;
  total_size: number;
}

export interface SessionInfo {
  id: string;
  name: string;
  path: string;
  created_at: string;
  size: number;
}

export interface ProjectDetail {
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
  session_count: number;
  total_size: number;
  sessions: SessionInfo[];
}

export interface SessionDetail {
  id: string;
  project_name: string;
  path: string;
  created_at: string;
  files: Array<{
    name: string;
    path: string;
    size: number;
    type: string;
  }>;
  total_size: number;
}

export interface ProjectsResponse {
  projects: ProjectInfo[];
}

export interface SessionsResponse {
  project_name: string;
  sessions: SessionInfo[];
  total_count: number;
  total_size: number;
}

/**
 * 获取所有项目列表
 */
export async function getProjects(): Promise<ProjectsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/projects`);
  if (!response.ok) {
    throw new Error(`获取项目列表失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 创建新项目
 */
export async function createProject(projectName: string): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ project_name: projectName }),
  });
  if (!response.ok) {
    throw new Error(`创建项目失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 删除项目
 */
export async function deleteProject(projectName: string): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectName)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`删除项目失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 获取项目下的所有session
 */
export async function getProjectSessions(projectName: string): Promise<SessionsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectName)}/sessions`);
  if (!response.ok) {
    throw new Error(`获取session列表失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 获取session详情
 */
export async function getSessionDetail(projectName: string, sessionId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`
  );

  if (!response.ok) {
    throw new Error(`获取session详情失败: ${response.statusText}`);
  }

  return response.json();
}

/**
 * 删除session
 */
export async function deleteSession(projectName: string, sessionId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok) {
    throw new Error(`删除session失败: ${response.statusText}`);
  }

  return response.json();
}

/**
 * 获取session下载链接
 */
export function getSessionDownloadUrl(projectName: string, sessionId: string): string {
  return `${API_BASE_URL}/api/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/download`;
}

/**
 * 获取项目下载链接
 */
export function getProjectDownloadUrl(projectName: string): string {
  return `${API_BASE_URL}/api/projects/${encodeURIComponent(projectName)}/download`;
}

// 摄像头启动配置接口
export interface CameraStartConfig {
  camera_index?: number;
  frame_rate?: number;
  display_mode?: 'left' | 'right' | 'both';
  project_name: string;
  save_options?: {
    save_video?: boolean;
    save_frames?: boolean;
    save_detections?: boolean;
  };
}

// ============================================================================
// 本地存储API - 不依赖后端
// ============================================================================

/**
 * 从本地存储获取所有项目
 */
export function getLocalProjects(): ProjectInfo[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('读取本地项目失败:', e);
  }
  return [];
}

/**
 * 保存项目到本地存储
 */
export function saveLocalProjects(projects: ProjectInfo[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.error('保存本地项目失败:', e);
  }
}

/**
 * 创建新项目（本地存储）
 */
export function createLocalProject(projectName: string): ProjectInfo {
  const projects = getLocalProjects();

  // 检查是否已存在
  if (projects.some(p => p.name === projectName)) {
    throw new Error('项目已存在');
  }

  const newProject: ProjectInfo = {
    name: projectName,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    session_count: 0,
    total_size: 0,
  };

  projects.push(newProject);
  saveLocalProjects(projects);

  // 同时初始化该项目的sessions
  saveLocalSessions(projectName, []);

  return newProject;
}

/**
 * 删除项目（本地存储）
 */
export function deleteLocalProject(projectName: string): void {
  const projects = getLocalProjects();
  const filtered = projects.filter(p => p.name !== projectName);
  saveLocalProjects(filtered);

  // 同时删除该项目的sessions
  localStorage.removeItem(`${STORAGE_KEYS.SESSIONS}_${projectName}`);
}

/**
 * 获取指定项目的所有sessions（本地存储）
 */
export function getLocalSessions(projectName: string): SessionInfo[] {
  try {
    const data = localStorage.getItem(`${STORAGE_KEYS.SESSIONS}_${projectName}`);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('读取本地sessions失败:', e);
  }
  return [];
}

/**
 * 保存sessions到本地存储
 */
export function saveLocalSessions(projectName: string, sessions: SessionInfo[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEYS.SESSIONS}_${projectName}`, JSON.stringify(sessions));

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

/**
 * 创建新session（本地存储）
 */
export function createLocalSession(projectName: string, sessionName?: string): SessionInfo {
  const sessions = getLocalSessions(projectName);

  const newSession: SessionInfo = {
    id: `session_${Date.now()}`,
    name: sessionName || `采集_${new Date().toLocaleString('zh-CN')}`,
    path: `${projectName}/${sessionName || `session_${Date.now()}`}`,
    created_at: new Date().toISOString(),
    size: 0,
  };

  sessions.push(newSession);
  saveLocalSessions(projectName, sessions);

  return newSession;
}

/**
 * 删除session（本地存储）
 */
export function deleteLocalSession(projectName: string, sessionId: string): void {
  const sessions = getLocalSessions(projectName);
  const filtered = sessions.filter(s => s.id !== sessionId);
  saveLocalSessions(projectName, filtered);
}

/**
 * 更新session信息（本地存储）
 */
export function updateLocalSession(projectName: string, sessionId: string, updates: Partial<SessionInfo>): void {
  const sessions = getLocalSessions(projectName);
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex >= 0) {
    sessions[sessionIndex] = { ...sessions[sessionIndex], ...updates };
    saveLocalSessions(projectName, sessions);
  }
}

/**
 * 检查后端是否可用
 */
export async function checkBackendAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}

// ============================================================================
// API函数
// ============================================================================

/**
 * 获取整体服务状态
 */
export async function getOverallStatus(): Promise<OverallStatus> {
  const response = await fetch(`${API_BASE_URL}/api/status`);
  if (!response.ok) {
    throw new Error(`获取状态失败: ${response.statusText}`);
  }
  return response.json();
}

// ============================================================================
// CSI API
// ============================================================================

/**
 * 获取CSI服务状态
 */
export async function getCSIStatus(): Promise<CSIStatus> {
  const response = await fetch(`${API_BASE_URL}/api/csi/status`);
  if (!response.ok) {
    throw new Error(`获取CSI状态失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 启动CSI采集
 */
export async function startCSI(): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/csi/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`启动CSI采集失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 停止CSI采集
 */
export async function stopCSI(): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/csi/stop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`停止CSI采集失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 创建CSI WebSocket连接
 */
export function createCSIWebSocket(
  onMessage: (data: CSIDataMessage) => void,
  onError?: (error: Event) => void,
  onClose?: () => void
): WebSocket {
  const ws = new WebSocket(`${API_BASE_URL.replace('http', 'ws')}/api/csi/ws`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as CSIDataMessage;
      onMessage(data);
    } catch (e) {
      console.error('CSI WebSocket消息解析错误:', e);
    }
  };

  ws.onerror = (error) => {
    console.error('CSI WebSocket错误:', error);
    onError?.(error);
  };

  ws.onclose = () => {
    console.log('CSI WebSocket关闭');
    onClose?.();
  };

  return ws;
}

// ============================================================================
// Camera API
// ============================================================================

/**
 * 获取视频服务状态
 */
export async function getCameraStatus(): Promise<CameraStatus> {
  const response = await fetch(`${API_BASE_URL}/api/camera/status`);
  if (!response.ok) {
    throw new Error(`获取视频状态失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 启动视频采集
 * @param config 启动配置，包含项目名和采集参数
 */
export async function startCamera(config: CameraStartConfig): Promise<ApiResponse> {
  console.log('[API] startCamera 发送配置:', JSON.stringify(config, null, 2));
  const response = await fetch(`${API_BASE_URL}/api/camera/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(`启动视频采集失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 停止视频采集
 */
export async function stopCamera(): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/camera/stop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`停止视频采集失败: ${response.statusText}`);
  }
  return response.json();
}

/**
 * 创建视频 WebSocket连接
 */
export function createCameraWebSocket(
  onMessage: (data: VideoDataMessage) => void,
  onError?: (error: Event) => void,
  onClose?: () => void
): WebSocket {
  const ws = new WebSocket(`${API_BASE_URL.replace('http', 'ws')}/api/camera/ws`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as VideoDataMessage;
      onMessage(data);
    } catch (e) {
      console.error('视频 WebSocket消息解析错误:', e);
    }
  };

  ws.onerror = (error) => {
    console.error('视频 WebSocket错误:', error);
    onError?.(error);
  };

  ws.onclose = () => {
    console.log('视频 WebSocket关闭');
    onClose?.();
  };

  return ws;
}
