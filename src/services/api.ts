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
  websocket_connections: number;
  project_name?: string;
  session_id?: string | null;
  session_root?: string | null;
  save_options?: Record<string, any>;
  receiver?: {
    received_packets: number;
    dat_file?: string;
    bin_file?: string;
    csv_file?: string;
  };
  processor?: {
    total_packets: number;
    total_processed: number;
    total_saved: number;
    raw_cache_rows?: number;
    proc_cache_rows?: number;
  };
  slicer?: {
    fragment_count: number;
    slice_count: number;
    stream_cache_rows: number;
    last_fragment_start?: number;
    fragment_window?: number;
    fragment_step?: number;
    slice_window?: number;
    slice_step?: number;
  };
  image_converter?: {
    total_tasks: number;
    total_images: number;
    save_dir?: string;
  };
}

export interface CSIDataMessage {
  type: 'csi_data';
  timestamp: number;
  amplitude: number[];
  channel?: number;          // 新增----------------------------
  subcarrierIndex?: number[];
  stats: {
    received_packets: number;
    processed: number;
    fragments: number;
    slices: number;
    images?: number;
    session_id?: string;
  };
}

export interface CameraStatus {
  running: boolean;
  frame_count: number;
  detection_count: number;
  websocket_connections: number;
  capture_alive: boolean;
  tracking_alive: boolean;
  classifier_enabled?: boolean;
  project_name?: string;
  session_id?: string | null;
  session_root?: string | null;
  save_options?: Record<string, any>;
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
  frame?: string;
  frame_left?: string | null;
  frame_right?: string | null;
  detections: {
    left: Detection[];
    right: Detection[];
  };
  stats: {
    frame_count: number;
    detection_count: number;
    session_id?: string;
  };
}

export interface TempStatus {
  running: boolean;
  websocket_connections: number;
  project_name?: string;
  session_id?: string | null;
  session_root?: string | null;
  save_options?: Record<string, any>;
  reader?: {
    port?: string;
    baudrate?: number;
    running?: boolean;
    total_received?: number;
    last_data_time?: number | null;
  };
  latest_data?: {
    timestamp?: number;
    air_temperature?: number;
    relative_humidity?: number;
  } | null;
}

export interface TempDataMessage {
  type: 'temperature_humidity_data';
  timestamp: number;
  air_temperature: number;
  relative_humidity: number;
  stats?: {
    session_id?: string;
  };
}

export interface RadStatus {
  running: boolean;
  websocket_connections: number;
  project_name?: string;
  session_id?: string | null;
  session_root?: string | null;
  save_options?: Record<string, any>;
  reader?: {
    port?: string;
    baudrate?: number;
    running?: boolean;
    total_received?: number;
    last_data_time?: number | null;
  };
  latest_data?: {
    timestamp?: number;
    black_globe_temperature?: number;
  } | null;
}

export interface RadDataMessage {
  type: 'thermal_radiation_data';
  timestamp: number;
  black_globe_temperature: number;
  stats?: {
    session_id?: string;
  };
}

export interface LightStatus {
  running: boolean;
  websocket_connections: number;
  project_name?: string;
  session_id?: string | null;
  session_root?: string | null;
  save_options?: Record<string, any>;
  reader?: {
    port?: string;
    baudrate?: number;
    running?: boolean;
    total_received?: number;
    last_data_time?: number | null;
  };
  latest_data?: {
    timestamp?: number;
    illuminance?: number;
    color_temperature?: number;
  } | null;
}

export interface LightDataMessage {
  type: 'illuminance_data';
  timestamp: number;
  illuminance: number;
  color_temperature?: number;
  stats?: {
    session_id?: string;
  };
}

export interface OverallStatus {
  csi: CSIStatus;
  camera: CameraStatus;
  temp?: TempStatus;
  rad?: RadStatus;
  light?: LightStatus;
}

export interface ApiResponse {
  status?: string;
  message?: string;
  success?: boolean;
  data?: any;
}

export interface ErrorResponse {
  detail?: string;
  message?: string;
}

// ============================================================================
// 项目 / Session 通用类型
// ============================================================================

export interface ProjectInfo {
  name: string;
  created_at: string;
  updated_at?: string;
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
  updated_at?: string;
  session_count: number;
  total_size: number;
  sessions: SessionInfo[];
}

export interface SessionDetail {
  id: string;
  project_name: string;
  path: string;
  created_at: string;
  files?: Array<{
    name: string;
    path: string;
    size: number;
    type: string;
  }>;
  total_size: number;
}

export interface ProjectsResponse {
  success?: boolean;
  projects: any[];
}

export interface SessionsResponse {
  success?: boolean;
  project_name: string;
  sessions: any[];
  total_count?: number;
  total_size?: number;
}

// ============================================================================
// 启动配置类型
// ============================================================================

export interface CameraStartConfig {
  camera_index?: number;
  frame_rate?: number;
  display_mode?: 'left' | 'right' | 'both';
  project_name: string;
  save_options?: Record<string, any>;
}

export interface CSIStartConfig {
  project_name: string;
  save_options?: {
    save_raw_data?: boolean;
    save_processed_data?: boolean;
    save_fragment_data?: boolean;
    save_fragment_images?: boolean;
  };
}

export interface TempStartConfig {
  port: string;
  baudrate?: number;
  project_name: string;
  save_options?: {
    save_csv?: boolean;
    save_jsonl?: boolean;
  };
}

export interface RadStartConfig {
  port: string;
  baudrate?: number;
  project_name: string;
  save_options?: {
    save_csv?: boolean;
    save_jsonl?: boolean;
  };
}

export interface LightStartConfig {
  port: string;
  baudrate?: number;
  project_name: string;
  save_options?: {
    save_csv?: boolean;
    save_jsonl?: boolean;
  };
}

// ============================================================================
// 工具函数
// ============================================================================

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.message ||
      `${fallbackMessage}: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return data as T;
}

// ============================================================================
// Camera 数据管理 API
// ============================================================================

export async function getProjects(): Promise<ProjectsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/projects`);
  return parseJsonResponse<ProjectsResponse>(response, '获取项目列表失败');
}

export async function createProject(projectName: string): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ project_name: projectName }),
  });
  return parseJsonResponse<ApiResponse>(response, '创建项目失败');
}

export async function deleteProject(projectName: string): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectName)}`, {
    method: 'DELETE',
  });
  return parseJsonResponse<ApiResponse>(response, '删除项目失败');
}

export async function getProjectSessions(projectName: string): Promise<SessionsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${encodeURIComponent(projectName)}/sessions`
  );
  return parseJsonResponse<SessionsResponse>(response, '获取session列表失败');
}

export async function getSessionDetail(projectName: string, sessionId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`
  );
  return parseJsonResponse<any>(response, '获取session详情失败');
}

export async function deleteSession(projectName: string, sessionId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
    }
  );
  return parseJsonResponse<any>(response, '删除session失败');
}

export function getSessionDownloadUrl(projectName: string, sessionId: string): string {
  return `${API_BASE_URL}/api/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/download`;
}

export function getProjectDownloadUrl(projectName: string): string {
  return `${API_BASE_URL}/api/projects/${encodeURIComponent(projectName)}/download`;
}

// ============================================================================
// CSI 数据管理 API
// ============================================================================

export async function getCSIProjects(): Promise<ProjectsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/csi/projects`);
  return parseJsonResponse<ProjectsResponse>(response, '获取CSI项目列表失败');
}

export async function getCSIProjectSessions(projectName: string): Promise<SessionsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/csi/projects/${encodeURIComponent(projectName)}/sessions`
  );
  return parseJsonResponse<SessionsResponse>(response, '获取CSI session列表失败');
}

export async function getCSISessionDetail(projectName: string, sessionId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/csi/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`
  );
  return parseJsonResponse<any>(response, '获取CSI session详情失败');
}

export async function deleteCSISession(projectName: string, sessionId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/csi/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
    }
  );
  return parseJsonResponse<any>(response, '删除CSI session失败');
}

export async function deleteCSIProject(projectName: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/csi/projects/${encodeURIComponent(projectName)}`,
    {
      method: 'DELETE',
    }
  );
  return parseJsonResponse<any>(response, '删除CSI项目失败');
}

export function getCSISessionDownloadUrl(projectName: string, sessionId: string): string {
  return `${API_BASE_URL}/api/csi/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/download`;
}

export function getCSIProjectDownloadUrl(projectName: string): string {
  return `${API_BASE_URL}/api/csi/projects/${encodeURIComponent(projectName)}/download`;
}

// ============================================================================
// Temp 数据管理 API
// ============================================================================

export async function getTempProjects(): Promise<ProjectsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/temp/projects`);
  return parseJsonResponse<ProjectsResponse>(response, '获取温湿度项目列表失败');
}

export async function getTempProjectSessions(projectName: string): Promise<SessionsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/temp/projects/${encodeURIComponent(projectName)}/sessions`
  );
  return parseJsonResponse<SessionsResponse>(response, '获取温湿度 session 列表失败');
}

export async function getTempSessionDetail(projectName: string, sessionId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/temp/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`
  );
  return parseJsonResponse<any>(response, '获取温湿度 session 详情失败');
}

export async function deleteTempSession(projectName: string, sessionId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/temp/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
    }
  );
  return parseJsonResponse<any>(response, '删除温湿度 session 失败');
}

export async function deleteTempProject(projectName: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/temp/projects/${encodeURIComponent(projectName)}`,
    {
      method: 'DELETE',
    }
  );
  return parseJsonResponse<any>(response, '删除温湿度项目失败');
}

export function getTempSessionDownloadUrl(projectName: string, sessionId: string): string {
  return `${API_BASE_URL}/api/temp/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/download`;
}

export function getTempProjectDownloadUrl(projectName: string): string {
  return `${API_BASE_URL}/api/temp/projects/${encodeURIComponent(projectName)}/download`;
}

// ============================================================================
// Rad 数据管理 API
// ============================================================================

export async function getRadProjects(): Promise<ProjectsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/rad/projects`);
  return parseJsonResponse<ProjectsResponse>(response, '获取热辐射项目列表失败');
}

export async function getRadProjectSessions(projectName: string): Promise<SessionsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/rad/projects/${encodeURIComponent(projectName)}/sessions`
  );
  return parseJsonResponse<SessionsResponse>(response, '获取热辐射 session 列表失败');
}

export async function getRadSessionDetail(projectName: string, sessionId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/rad/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`
  );
  return parseJsonResponse<any>(response, '获取热辐射 session 详情失败');
}

export async function deleteRadSession(projectName: string, sessionId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/rad/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
    }
  );
  return parseJsonResponse<any>(response, '删除热辐射 session 失败');
}

export async function deleteRadProject(projectName: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/rad/projects/${encodeURIComponent(projectName)}`,
    {
      method: 'DELETE',
    }
  );
  return parseJsonResponse<any>(response, '删除热辐射项目失败');
}

export function getRadSessionDownloadUrl(projectName: string, sessionId: string): string {
  return `${API_BASE_URL}/api/rad/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/download`;
}

export function getRadProjectDownloadUrl(projectName: string): string {
  return `${API_BASE_URL}/api/rad/projects/${encodeURIComponent(projectName)}/download`;
}

// ============================================================================
// Light 数据管理 API
// ============================================================================

export async function getLightProjects(): Promise<ProjectsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/light/projects`);
  return parseJsonResponse<ProjectsResponse>(response, '获取照明项目列表失败');
}

export async function getLightProjectSessions(projectName: string): Promise<SessionsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/light/projects/${encodeURIComponent(projectName)}/sessions`
  );
  return parseJsonResponse<SessionsResponse>(response, '获取照明 session 列表失败');
}

export async function getLightSessionDetail(projectName: string, sessionId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/light/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`
  );
  return parseJsonResponse<any>(response, '获取照明 session 详情失败');
}

export async function deleteLightSession(projectName: string, sessionId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/light/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
    }
  );
  return parseJsonResponse<any>(response, '删除照明 session 失败');
}

export async function deleteLightProject(projectName: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/light/projects/${encodeURIComponent(projectName)}`,
    {
      method: 'DELETE',
    }
  );
  return parseJsonResponse<any>(response, '删除照明项目失败');
}

export function getLightSessionDownloadUrl(projectName: string, sessionId: string): string {
  return `${API_BASE_URL}/api/light/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/download`;
}

export function getLightProjectDownloadUrl(projectName: string): string {
  return `${API_BASE_URL}/api/light/projects/${encodeURIComponent(projectName)}/download`;
}

// ============================================================================
// Thermal Environment 数据管理 API
// ============================================================================

export function getThermalEnvSessionDownloadUrl(
  projectName: string,
  sessionId: string,
  tempSessionId?: string,
  radSessionId?: string
): string {
  const params = new URLSearchParams();

  if (tempSessionId) {
    params.set('temp_session_id', tempSessionId);
  }

  if (radSessionId) {
    params.set('rad_session_id', radSessionId);
  }

  const query = params.toString();
  const base = `${API_BASE_URL}/api/thermal/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/download`;

  return query ? `${base}?${query}` : base;
}

// 新增热环境项目级下载 URL 函数
export function getThermalEnvProjectDownloadUrl(projectName: string): string {
  return `${API_BASE_URL}/api/thermal/projects/${encodeURIComponent(projectName)}/download`;
}

// ============================================================================
// 本地存储 API - 不依赖后端
// ============================================================================

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

export function saveLocalProjects(projects: ProjectInfo[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.error('保存本地项目失败:', e);
  }
}

export function createLocalProject(projectName: string): ProjectInfo {
  const projects = getLocalProjects();

  if (projects.some((p) => p.name === projectName)) {
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
  saveLocalSessions(projectName, []);

  return newProject;
}

export function deleteLocalProject(projectName: string): void {
  const projects = getLocalProjects();
  const filtered = projects.filter((p) => p.name !== projectName);
  saveLocalProjects(filtered);
  localStorage.removeItem(`${STORAGE_KEYS.SESSIONS}_${projectName}`);
}

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

export function saveLocalSessions(projectName: string, sessions: SessionInfo[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEYS.SESSIONS}_${projectName}`, JSON.stringify(sessions));

    const projects = getLocalProjects();
    const projectIndex = projects.findIndex((p) => p.name === projectName);
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

export function createLocalSession(projectName: string, sessionName?: string): SessionInfo {
  const sessions = getLocalSessions(projectName);

  const timestamp = Date.now();
  const sessionId = `session_${timestamp}`;

  const newSession: SessionInfo = {
    id: sessionId,
    name: sessionName || `采集_${new Date().toLocaleString('zh-CN')}`,
    path: `${projectName}/${sessionId}`,
    created_at: new Date().toISOString(),
    size: 0,
  };

  sessions.push(newSession);
  saveLocalSessions(projectName, sessions);

  return newSession;
}

export function deleteLocalSession(projectName: string, sessionId: string): void {
  const sessions = getLocalSessions(projectName);
  const filtered = sessions.filter((s) => s.id !== sessionId);
  saveLocalSessions(projectName, filtered);
}

export function updateLocalSession(
  projectName: string,
  sessionId: string,
  updates: Partial<SessionInfo>
): void {
  const sessions = getLocalSessions(projectName);
  const sessionIndex = sessions.findIndex((s) => s.id === sessionId);
  if (sessionIndex >= 0) {
    sessions[sessionIndex] = { ...sessions[sessionIndex], ...updates };
    saveLocalSessions(projectName, sessions);
  }
}

export async function checkBackendAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// 整体状态 API
// ============================================================================

export async function getOverallStatus(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/status`);
  return parseJsonResponse<any>(response, '获取状态失败');
}

// ============================================================================
// CSI API
// ============================================================================

export async function getCSIStatus(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/csi/status`);
  return parseJsonResponse<any>(response, '获取CSI状态失败');
}

export async function startCSI(config: CSIStartConfig): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/csi/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  return parseJsonResponse<ApiResponse>(response, '启动CSI采集失败');
}

export async function stopCSI(): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/csi/stop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return parseJsonResponse<ApiResponse>(response, '停止CSI采集失败');
}

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

export async function getCameraStatus(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/camera/status`);
  return parseJsonResponse<any>(response, '获取视频状态失败');
}

export async function startCamera(config: CameraStartConfig): Promise<ApiResponse> {
  console.log('[API] startCamera 发送配置:', JSON.stringify(config, null, 2));

  const response = await fetch(`${API_BASE_URL}/api/camera/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  return parseJsonResponse<ApiResponse>(response, '启动视频采集失败');
}

export async function stopCamera(): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/camera/stop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return parseJsonResponse<ApiResponse>(response, '停止视频采集失败');
}

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