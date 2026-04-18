import React, { useState, useEffect } from 'react';
import {
  Database,
  Download,
  ChevronRight,
  ChevronDown,
  HardDrive,
  FolderOpen,
  Trash2,
  RefreshCw,
  Loader2,
  Calendar,
  Camera,
  Wifi,
  Thermometer,
  Lightbulb,
} from 'lucide-react';
import * as api from '../services/api';
import { useApp } from '../contexts/AppContext';

// ==============================
// 本地存储键名
// ==============================
const LOCAL_STORAGE_KEYS = {
  PROJECTS: 'multi_sensor_projects',
  SESSIONS: 'multi_sensor_sessions',
};

// ==============================
// 后端返回结构
// ==============================
interface BackendProjectInfo {
  project_name: string;
  project_path?: string;
  created_at?: string | null;
  updated_at?: string | null;
  session_count?: number;
  total_size_bytes?: number;
  total_size_mb?: number;
  sensor_type?: 'camera' | 'csi' | 'temp' | 'rad' | 'light';
}

interface BackendSessionArtifacts {
  has_raw_video?: boolean;
  has_tracked_video?: boolean;
  has_person_clips?: boolean;
  raw_video_files?: string[];
  tracked_video_files?: string[];
  raw_images_left_count?: number;
  raw_images_right_count?: number;
  tracked_images_left_count?: number;
  tracked_images_right_count?: number;
  person_clips_left_count?: number;
  person_clips_right_count?: number;

  has_raw_data?: boolean;
  has_fragment_data?: boolean;
  has_fragment_images?: boolean;
  raw_file_count?: number;
  processed_row_file_count?: number;
  fragment_slice_file_count?: number;
  fragment_image_file_count?: number;

  has_csv?: boolean;
  has_jsonl?: boolean;
  csv_file_count?: number;
  jsonl_file_count?: number;

  has_temp_session?: boolean;
  has_rad_session?: boolean;
  temp_session_id?: string;
  rad_session_id?: string;
}

interface BackendSessionInfo {
  session_id: string;
  session_name?: string;
  session_path?: string;
  created_at?: string | null;
  project_name?: string;
  camera_index?: number;
  frame_rate?: number;
  display_mode?: string;
  save_options?: Record<string, any>;
  total_size_bytes?: number;
  total_size_mb?: number;
  artifacts?: BackendSessionArtifacts;
  sensor_type?: 'camera' | 'csi' | 'temp' | 'rad' | 'light';
}

// ==============================
// 页面内部统一结构
// ==============================
interface ProjectInfo {
  name: string;
  path: string;
  created_at: string;
  updated_at?: string;
  session_count: number;
  total_size_bytes: number;
  total_size_mb: number;
  sensor_type?: 'camera' | 'csi' | 'temp' | 'rad' | 'light' | 'thermal_env';
}

interface SessionRecord {
  id: string;
  name: string;
  path: string;
  created_at: string;
  size_bytes: number;
  size_mb: number;
  artifacts: BackendSessionArtifacts;
  sensor_type?: 'camera' | 'csi' | 'temp' | 'rad' | 'light' | 'thermal_env';
}

interface ProjectGroup {
  project: ProjectInfo;
  sessions: SessionRecord[];
  expanded: boolean;
  loading: boolean;
}

// ==============================
// 本地存储兜底结构
// ==============================
interface LocalProjectInfo {
  name: string;
  created_at: string;
  updated_at?: string;
  session_count?: number;
  total_size?: number;
}

interface LocalSessionInfo {
  id: string;
  name: string;
  path: string;
  created_at: string;
  size: number;
}

function getLocalProjects(): LocalProjectInfo[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEYS.PROJECTS);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('读取本地项目失败:', e);
  }
  return [];
}

function saveLocalProjects(projects: LocalProjectInfo[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.error('保存本地项目失败:', e);
  }
}

function getLocalSessions(projectName: string): LocalSessionInfo[] {
  try {
    const data = localStorage.getItem(`${LOCAL_STORAGE_KEYS.SESSIONS}_${projectName}`);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('读取本地 sessions 失败:', e);
  }
  return [];
}

function saveLocalSessions(projectName: string, sessions: LocalSessionInfo[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEYS.SESSIONS}_${projectName}`, JSON.stringify(sessions));
  } catch (e) {
    console.error('保存本地 sessions 失败:', e);
  }
}

// ==============================
// 数据映射
// ==============================
function mapBackendProject(
  p: BackendProjectInfo,
  sensorType: 'camera' | 'csi' | 'temp' | 'rad' | 'light' | 'thermal_env'
): ProjectInfo {
  return {
    name: p.project_name || '',
    path: p.project_path || '',
    created_at: p.created_at || new Date().toISOString(),
    updated_at: p.updated_at ?? p.created_at ?? new Date().toISOString(),
    session_count: p.session_count ?? 0,
    total_size_bytes: p.total_size_bytes ?? 0,
    total_size_mb: p.total_size_mb ?? 0,
    sensor_type: sensorType,
  };
}

function mapBackendSession(
  s: BackendSessionInfo,
  sensorType: 'camera' | 'csi' | 'temp' | 'rad' | 'light'
): SessionRecord {
  return {
    id: s.session_id,
    name: s.session_name || s.session_id,
    path: s.session_path || '',
    created_at: s.created_at || new Date().toISOString(),
    size_bytes: s.total_size_bytes ?? 0,
    size_mb: s.total_size_mb ?? 0,
    artifacts: s.artifacts || {},
    sensor_type: sensorType,
  };
}

function mapLocalProject(p: LocalProjectInfo): ProjectInfo {
  return {
    name: p.name,
    path: '',
    created_at: p.created_at || new Date().toISOString(),
    updated_at: p.updated_at ?? p.created_at ?? new Date().toISOString(),
    session_count: p.session_count ?? 0,
    total_size_bytes: p.total_size ?? 0,
    total_size_mb: Number(((p.total_size ?? 0) / 1024 / 1024).toFixed(2)),
    sensor_type: 'camera',
  };
}

function mapLocalSession(s: LocalSessionInfo): SessionRecord {
  return {
    id: s.id,
    name: s.name,
    path: s.path,
    created_at: s.created_at || new Date().toISOString(),
    size_bytes: s.size ?? 0,
    size_mb: Number(((s.size ?? 0) / 1024 / 1024).toFixed(2)),
    artifacts: {},
    sensor_type: 'camera',
  };
}

// ==============================
// 工具函数
// ==============================
function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getErrorMessage(error: any, fallback = '操作失败，请重试'): string {
  if (!error) return fallback;

  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error?.message === 'string' && error.message.trim()) return error.message;

  if (typeof error?.response?.data?.detail === 'string' && error.response.data.detail.trim()) {
    return error.response.data.detail;
  }

  if (typeof error?.response?.data?.message === 'string' && error.response.data.message.trim()) {
    return error.response.data.message;
  }

  if (typeof error?.detail === 'string' && error.detail.trim()) {
    return error.detail;
  }

  return fallback;
}

function isBackendUnavailable(error: any): boolean {
  const status = error?.response?.status ?? error?.status;
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return false;
  }

  const message = String(
    error?.message ||
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      ''
  ).toLowerCase();

  return (
    !status ||
    status >= 500 ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('network')
  );
}

function mergeProjects(
  backendProjects: BackendProjectInfo[],
  localProjects: LocalProjectInfo[],
  sensorType: 'camera' | 'csi' | 'temp' | 'rad' | 'light' | 'thermal_env',
  allowLocalFallback: boolean
): ProjectGroup[] {
  const merged = new Map<string, ProjectInfo>();

  backendProjects.forEach((p) => {
    const project = mapBackendProject(p, sensorType);
    if (project.name) {
      merged.set(project.name, project);
    }
  });

  if (allowLocalFallback) {
    localProjects.forEach((p) => {
      if (!merged.has(p.name)) {
        const project = mapLocalProject(p);
        merged.set(project.name, project);
      }
    });
  }

  return Array.from(merged.values())
    .sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at).getTime();
      const bTime = new Date(b.updated_at || b.created_at).getTime();
      return bTime - aTime;
    })
    .map((project) => ({
      project,
      sessions: [],
      expanded: false,
      loading: false,
    }));
}

function mergeSessions(
  backendSessions: BackendSessionInfo[],
  localSessions: LocalSessionInfo[],
  sensorType: 'camera' | 'csi' | 'temp' | 'rad' | 'light',
  allowLocalFallback: boolean
): SessionRecord[] {
  const merged = new Map<string, SessionRecord>();

  backendSessions.forEach((s) => {
    const session = mapBackendSession(s, sensorType);
    if (session.id) {
      merged.set(session.id, session);
    }
  });

  if (allowLocalFallback) {
    localSessions.forEach((s) => {
      if (!merged.has(s.id)) {
        const session = mapLocalSession(s);
        merged.set(session.id, session);
      }
    });
  }

  return Array.from(merged.values()).sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// 热环境 session 合并函数
function mergeThermalEnvSessions(
  tempSessions: BackendSessionInfo[],
  radSessions: BackendSessionInfo[]
): SessionRecord[] {
  const merged = new Map<string, SessionRecord>();

  const addSession = (s: BackendSessionInfo, sourceType: 'temp' | 'rad') => {
    const mapped = mapBackendSession(s, sourceType);
    const key = mapped.id;

    if (!merged.has(key)) {
      merged.set(key, {
        id: mapped.id,
        name: mapped.name,
        path: mapped.path,
        created_at: mapped.created_at,
        size_bytes: mapped.size_bytes,
        size_mb: mapped.size_mb,
        sensor_type: 'thermal_env',
        artifacts: {
          has_csv: (mapped.artifacts as any)?.has_csv ?? false,
          has_jsonl: (mapped.artifacts as any)?.has_jsonl ?? false,
          csv_file_count: (mapped.artifacts as any)?.csv_file_count ?? 0,
          jsonl_file_count: (mapped.artifacts as any)?.jsonl_file_count ?? 0,
          has_temp_session: sourceType === 'temp',
          has_rad_session: sourceType === 'rad',
          temp_session_id: sourceType === 'temp' ? mapped.id : undefined,
          rad_session_id: sourceType === 'rad' ? mapped.id : undefined,
        },
      });
      return;
    }

    const existing = merged.get(key)!;

    merged.set(key, {
      ...existing,
      path: [existing.path, mapped.path].filter(Boolean).join('\n'),
      size_bytes: existing.size_bytes + mapped.size_bytes,
      size_mb: Number(((existing.size_bytes + mapped.size_bytes) / 1024 / 1024).toFixed(2)),
      created_at:
        new Date(existing.created_at).getTime() <= new Date(mapped.created_at).getTime()
          ? existing.created_at
          : mapped.created_at,
      artifacts: {
        ...existing.artifacts,
        has_csv:
          Boolean(existing.artifacts.has_csv) || Boolean((mapped.artifacts as any)?.has_csv),
        has_jsonl:
          Boolean(existing.artifacts.has_jsonl) || Boolean((mapped.artifacts as any)?.has_jsonl),
        csv_file_count:
          (existing.artifacts.csv_file_count ?? 0) + ((mapped.artifacts as any)?.csv_file_count ?? 0),
        jsonl_file_count:
          (existing.artifacts.jsonl_file_count ?? 0) + ((mapped.artifacts as any)?.jsonl_file_count ?? 0),
        has_temp_session:
          Boolean(existing.artifacts.has_temp_session) || sourceType === 'temp',
        has_rad_session:
          Boolean(existing.artifacts.has_rad_session) || sourceType === 'rad',
        temp_session_id:
          existing.artifacts.temp_session_id ?? (sourceType === 'temp' ? mapped.id : undefined),
        rad_session_id:
          existing.artifacts.rad_session_id ?? (sourceType === 'rad' ? mapped.id : undefined),
      },
    });
  };

  tempSessions.forEach((s) => addSession(s, 'temp'));
  radSessions.forEach((s) => addSession(s, 'rad'));

  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// 
function syncBackendProjectsToLocal(backendProjects: BackendProjectInfo[]): void {
  const localProjects = getLocalProjects();
  const localMap = new Map(localProjects.map((p) => [p.name, p]));

  const merged: LocalProjectInfo[] = backendProjects.map((p) => {
    const existing = localMap.get(p.project_name);
    return {
      name: p.project_name,
      created_at: p.created_at || existing?.created_at || new Date().toISOString(),
      updated_at: p.updated_at ?? p.created_at ?? existing?.updated_at ?? new Date().toISOString(),
      session_count: p.session_count ?? existing?.session_count ?? 0,
      total_size: p.total_size_bytes ?? existing?.total_size ?? 0,
    };
  });

  for (const localProject of localProjects) {
    if (!merged.some((p) => p.name === localProject.name)) {
      merged.push(localProject);
    }
  }

  saveLocalProjects(merged);
}

// ==============================
// Session 列表项
// ==============================
interface SessionItemProps {
  session: SessionRecord;
  onDownload: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function SessionItem({ session, onDownload, onDelete, deleting }: SessionItemProps) {
  const artifacts = session.artifacts || {};
  const isCSI = session.sensor_type === 'csi';
  const isEnv =
    session.sensor_type === 'temp' ||
    session.sensor_type === 'rad' ||
    session.sensor_type === 'light' ||
    session.sensor_type === 'thermal_env';

  const envLabel =
    session.sensor_type === 'temp'
      ? '温湿度'
      : session.sensor_type === 'rad'
      ? '热辐射'
      : session.sensor_type === 'light'
      ? '照明'
      : session.sensor_type === 'thermal_env'
      ? '热环境'
      : '环境';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold text-slate-900">{session.name}</div>
          <div className="mt-1 break-all text-sm text-slate-500">{session.path || '无路径信息'}</div>
        </div>

        <div className="flex shrink-0 items-center gap-6 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(session.created_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            <span>{formatSize(session.size_bytes)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {isCSI ? (
          <>
            <span
              className={`rounded-full px-2 py-1 ${
                artifacts.has_raw_data ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              原始CSI {artifacts.has_raw_data ? '✓' : '✗'}
            </span>
            <span
              className={`rounded-full px-2 py-1 ${
                artifacts.has_fragment_data ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              切片数据 {artifacts.has_fragment_data ? '✓' : '✗'}
            </span>
            <span
              className={`rounded-full px-2 py-1 ${
                artifacts.has_fragment_images ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              切片图像 {artifacts.has_fragment_images ? '✓' : '✗'}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              原始文件 {artifacts.raw_file_count ?? 0}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              处理行文件 {artifacts.processed_row_file_count ?? 0}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              切片文件 {artifacts.fragment_slice_file_count ?? 0}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              图像文件 {artifacts.fragment_image_file_count ?? 0}
            </span>
          </>
        ) : isEnv ? (
          <>
            <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-700">
              {envLabel}数据
            </span>

            {session.sensor_type === 'thermal_env' && (
              <>
                <span
                  className={`rounded-full px-2 py-1 ${
                    artifacts.has_temp_session ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  温湿度 {artifacts.has_temp_session ? '✓' : '✗'}
                </span>
                <span
                  className={`rounded-full px-2 py-1 ${
                    artifacts.has_rad_session ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  热辐射 {artifacts.has_rad_session ? '✓' : '✗'}
                </span>
              </>
            )}

            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              CSV文件 {artifacts.csv_file_count ?? 0}
            </span>
            <span
              className={`rounded-full px-2 py-1 ${
                artifacts.has_csv ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              CSV {artifacts.has_csv ? '✓' : '✗'}
            </span>
            <span
              className={`rounded-full px-2 py-1 ${
                artifacts.has_jsonl ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              JSONL {artifacts.has_jsonl ? '✓' : '✗'}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              JSONL文件 {artifacts.jsonl_file_count ?? 0}
            </span>
          </>
        ) : (
          <>
            <span
              className={`rounded-full px-2 py-1 ${
                artifacts.has_raw_video ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              原始视频 {artifacts.has_raw_video ? '✓' : '✗'}
            </span>
            <span
              className={`rounded-full px-2 py-1 ${
                artifacts.has_tracked_video ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              跟踪视频 {artifacts.has_tracked_video ? '✓' : '✗'}
            </span>
            <span
              className={`rounded-full px-2 py-1 ${
                artifacts.has_person_clips ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              Person Clips {artifacts.has_person_clips ? '✓' : '✗'}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              左原图 {artifacts.raw_images_left_count ?? 0}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              右原图 {artifacts.raw_images_right_count ?? 0}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              左跟踪图 {artifacts.tracked_images_left_count ?? 0}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              右跟踪图 {artifacts.tracked_images_right_count ?? 0}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              左 Clips {artifacts.person_clips_left_count ?? 0}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              右 Clips {artifacts.person_clips_right_count ?? 0}
            </span>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={onDownload}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <Download className="h-4 w-4" />
          下载
        </button>

        <button
          onClick={onDelete}
          disabled={deleting}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          删除
        </button>
      </div>
    </div>
  );
}

// ==============================
// 项目组组件
// ==============================
interface ProjectGroupComponentProps {
  project: ProjectInfo;
  sessions: SessionRecord[];
  expanded: boolean;
  onToggleExpand: () => void;
  onDownloadProject: () => void;
  onDeleteProject: () => void;
  onDownloadSession: (session: SessionRecord) => void;
  onDeleteSession: (session: SessionRecord) => void;
  deletingProject: boolean;
  deletingSession: string | null;
  loadingSessions: boolean;
}

function ProjectGroupComponent({
  project,
  sessions,
  expanded,
  onToggleExpand,
  onDownloadProject,
  onDeleteProject,
  onDownloadSession,
  onDeleteSession,
  deletingProject,
  deletingSession,
  loadingSessions,
}: ProjectGroupComponentProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-4 px-6 py-5">
        <div className="flex min-w-0 items-center gap-4">
          <button onClick={onToggleExpand} className="text-slate-500 hover:text-slate-700">
            {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>

          <FolderOpen className="h-6 w-6 shrink-0 text-blue-500" />

          <div className="min-w-0">
            <div className="truncate text-2xl font-semibold text-slate-900">{project.name}</div>
            <div className="mt-1 text-sm text-slate-500">{project.session_count} 次采集</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-6 text-slate-600">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            <span>{formatSize(project.total_size_bytes)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>创建: {formatDate(project.created_at)}</span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownloadProject();
            }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            <Download className="h-4 w-4" />
            下载全部
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteProject();
            }}
            disabled={deletingProject}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {deletingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-5">
          {loadingSessions ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-12 text-center text-slate-400">暂无采集记录</div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  onDownload={() => onDownloadSession(session)}
                  onDelete={() => onDeleteSession(session)}
                  deleting={deletingSession === session.id}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DataSectionProps {
  title: string;
  icon: React.ReactNode;
  projects: ProjectGroup[];
  emptyText: string;
  loading: boolean;
  onRefresh: () => void;
  onToggleExpand: (projectName: string) => void;
  onDownloadProject: (projectName: string) => void;
  onDeleteProject: (projectName: string) => void;
  onDownloadSession: (projectName: string, session: SessionRecord) => void;
  onDeleteSession: (projectName: string, session: SessionRecord) => void;
  deletingProject: string | null;
  deletingSession: string | null;
}

function DataSection({
  title,
  icon,
  projects,
  emptyText,
  loading,
  onRefresh,
  onToggleExpand,
  onDownloadProject,
  onDeleteProject,
  onDownloadSession,
  onDeleteSession,
  deletingProject,
  deletingSession,
}: DataSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-10 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中...
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-400">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((group) => (
            <ProjectGroupComponent
              key={`${title}-${group.project.name}`}
              project={group.project}
              sessions={group.sessions}
              expanded={group.expanded}
              loadingSessions={group.loading}
              onToggleExpand={() => onToggleExpand(group.project.name)}
              onDownloadProject={() => onDownloadProject(group.project.name)}
              onDeleteProject={() => onDeleteProject(group.project.name)}
              onDownloadSession={(session) => onDownloadSession(group.project.name, session)}
              onDeleteSession={(session) => onDeleteSession(group.project.name, session)}
              deletingProject={deletingProject === group.project.name}
              deletingSession={deletingSession}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ==============================
// 主页面组件
// ==============================
export function DataManagement() {
  const { loadProjects: reloadAppProjects } = useApp();

  const [cameraProjects, setCameraProjects] = useState<ProjectGroup[]>([]);
  const [csiProjects, setCSIProjects] = useState<ProjectGroup[]>([]);
  const [thermalEnvProjects, setThermalEnvProjects] = useState<ProjectGroup[]>([]);
  const [lightEnvProjects, setLightEnvProjects] = useState<ProjectGroup[]>([]); 

  const [loadingCamera, setLoadingCamera] = useState(true);
  const [loadingCSI, setLoadingCSI] = useState(true);
  const [loadingThermalEnv, setLoadingThermalEnv] = useState(false);
  const [loadingLightEnv, setLoadingLightEnv] = useState(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [csiError, setCSIError] = useState<string | null>(null);
  const [thermalEnvError, setThermalEnvError] = useState<string | null>(null);
  const [lightEnvError, setLightEnvError] = useState<string | null>(null);

  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);

  // 加载相机项目
  const loadCameraProjects = async () => {
    setLoadingCamera(true);
    setCameraError(null);

    const localProjects = getLocalProjects();

    try {
      const response = await api.getProjects();
      const backendProjects: BackendProjectInfo[] = response.projects || [];

      syncBackendProjectsToLocal(backendProjects);

      const mergedProjects = mergeProjects(backendProjects, getLocalProjects(), 'camera', true);

      setCameraProjects((prev) =>
        mergedProjects.map((pg) => {
          const existing = prev.find((item) => item.project.name === pg.project.name);
          return existing
            ? { ...pg, expanded: existing.expanded, sessions: existing.sessions, loading: existing.loading }
            : pg;
        })
      );

      if (mergedProjects.length === 0) {
        setCameraError('暂无 Camera 项目');
      }
    } catch (err) {
      console.warn('后端服务不可用，使用本地存储:', err);

      const mergedProjects = mergeProjects([], localProjects, 'camera', true);

      setCameraProjects((prev) =>
        mergedProjects.map((pg) => {
          const existing = prev.find((item) => item.project.name === pg.project.name);
          return existing
            ? { ...pg, expanded: existing.expanded, sessions: existing.sessions, loading: existing.loading }
            : pg;
        })
      );

      if (mergedProjects.length === 0) {
        setCameraError('暂无 Camera 项目');
      }
    } finally {
      setLoadingCamera(false);
    }
  };

  // 加载CSI项目
  const loadCSIProjects = async () => {
    setLoadingCSI(true);
    setCSIError(null);

    try {
      const response = await api.getCSIProjects();
      const backendProjects: BackendProjectInfo[] = response.projects || [];

      const mergedProjects = mergeProjects(backendProjects, [], 'csi', false);

      setCSIProjects((prev) =>
        mergedProjects.map((pg) => {
          const existing = prev.find((item) => item.project.name === pg.project.name);
          return existing
            ? { ...pg, expanded: existing.expanded, sessions: existing.sessions, loading: existing.loading }
            : pg;
        })
      );

      if (mergedProjects.length === 0) {
        setCSIError('暂无 CSI 项目');
      }
    } catch (err) {
      console.warn('加载 CSI 项目失败:', err);
      setCSIProjects([]);
      setCSIError('CSI 数据管理接口不可用，或暂无 CSI 项目');
    } finally {
      setLoadingCSI(false);
    }
  };

  // 加载热环境项目
  const loadThermalEnvProjects = async () => {
    setLoadingThermalEnv(true);
    setThermalEnvError(null);

    try {
      const [tempResp, radResp] = await Promise.all([
        api.getTempProjects(),
        api.getRadProjects(),
      ]);

      const tempProjects: BackendProjectInfo[] = (tempResp.projects || []).map((p: any) => ({
        ...p,
        sensor_type: 'temp',
      }));

      const radProjects: BackendProjectInfo[] = (radResp.projects || []).map((p: any) => ({
        ...p,
        sensor_type: 'rad',
      }));

      const mergedMap = new Map<string, ProjectInfo>();

      [...tempProjects, ...radProjects].forEach((p) => {
        const existing = mergedMap.get(p.project_name);
        const sizeBytes = p.total_size_bytes ?? 0;
        const sessionCount = p.session_count ?? 0;
        const createdAt = p.created_at || new Date().toISOString();
        const updatedAt = p.updated_at ?? p.created_at ?? new Date().toISOString();

        if (!existing) {
          mergedMap.set(
            p.project_name,
            mapBackendProject(
              {
                ...p,
                total_size_bytes: sizeBytes,
                total_size_mb: Number((sizeBytes / 1024 / 1024).toFixed(2)),
                session_count: sessionCount,
              },
              'thermal_env'
            )
          );
        } else {
          mergedMap.set(p.project_name, {
            ...existing,
            total_size_bytes: existing.total_size_bytes + sizeBytes,
            total_size_mb: Number(((existing.total_size_bytes + sizeBytes) / 1024 / 1024).toFixed(2)),
            session_count: existing.session_count + sessionCount,
            created_at: existing.created_at || createdAt,
            updated_at: updatedAt,
            sensor_type: 'thermal_env',
          });
        }
      });

      const mergedProjects = Array.from(mergedMap.values())
        .sort((a, b) => {
          const aTime = new Date(a.updated_at || a.created_at).getTime();
          const bTime = new Date(b.updated_at || b.created_at).getTime();
          return bTime - aTime;
        })
        .map((project) => ({
          project,
          sessions: [],
          expanded: false,
          loading: false,
        }));

      setThermalEnvProjects((prev) =>
        mergedProjects.map((pg) => {
          const existing = prev.find((item) => item.project.name === pg.project.name);
          return existing
            ? { ...pg, expanded: existing.expanded, sessions: existing.sessions, loading: existing.loading }
            : pg;
        })
      );

      if (mergedProjects.length === 0) {
        setThermalEnvError('暂无热环境项目');
      }
    } catch (err) {
      console.warn('加载热环境项目失败:', err);
      setThermalEnvProjects([]);
      setThermalEnvError('热环境数据管理接口不可用，或暂无热环境项目');
    } finally {
      setLoadingThermalEnv(false);
    }
  };

  // 加载光环境项目
  const loadLightEnvProjects = async () => {
    setLoadingLightEnv(true);
    setLightEnvError(null);

    try {
      const response = await api.getLightProjects();
      const backendProjects: BackendProjectInfo[] = (response.projects || []).map((p: any) => ({
       ...p,
        sensor_type: 'light',
      }));

      const mergedProjects = mergeProjects(backendProjects, [], 'light', false);

      setLightEnvProjects((prev) =>
        mergedProjects.map((pg) => {
          const existing = prev.find((item) => item.project.name === pg.project.name);
          return existing
            ? { ...pg, expanded: existing.expanded, sessions: existing.sessions, loading: existing.loading }
            : pg;
        })
      );

      if (mergedProjects.length === 0) {
        setLightEnvError('暂无光环境项目');
      }
    } catch (err) {
      console.warn('加载光环境项目失败:', err);
      setLightEnvProjects([]);
      setLightEnvError('光环境数据管理接口不可用，或暂无光环境项目');
    } finally {
      setLoadingLightEnv(false);
    }
  };

  // 加载相机项目的sessions
  const loadCameraProjectSessions = async (projectName: string) => {
    setCameraProjects((prev) =>
      prev.map((pg) =>
        pg.project.name === projectName ? { ...pg, loading: true } : pg
      )
    );

    const localSessions = getLocalSessions(projectName);

    try {
      const response = await api.getProjectSessions(projectName);
      const backendSessions: BackendSessionInfo[] = response.sessions || [];
      const mergedSessions = mergeSessions(backendSessions, localSessions, 'camera', true);

      if (backendSessions.length > 0) {
        saveLocalSessions(
          projectName,
          mergedSessions.map((session) => ({
            id: session.id,
            name: session.name,
            path: session.path,
            created_at: session.created_at,
            size: session.size_bytes,
          }))
        );
      }

      setCameraProjects((prev) =>
        prev.map((pg) =>
          pg.project.name === projectName
            ? {
                ...pg,
                sessions: mergedSessions,
                loading: false,
              }
            : pg
        )
      );
    } catch (err) {
      console.warn('后端服务不可用，使用本地存储获取 Camera sessions:', err);

      const mergedSessions = mergeSessions([], localSessions, 'camera', true);

      setCameraProjects((prev) =>
        prev.map((pg) =>
          pg.project.name === projectName
            ? {
                ...pg,
                sessions: mergedSessions,
                loading: false,
              }
            : pg
        )
      );
    }
  };

  // 加载CSI项目的sessions
  const loadCSIProjectSessions = async (projectName: string) => {
    setCSIProjects((prev) =>
      prev.map((pg) =>
        pg.project.name === projectName ? { ...pg, loading: true } : pg
      )
    );

    try {
      const response = await api.getCSIProjectSessions(projectName);
      const backendSessions: BackendSessionInfo[] = response.sessions || [];
      const mergedSessions = mergeSessions(backendSessions, [], 'csi', false);

      setCSIProjects((prev) =>
        prev.map((pg) =>
          pg.project.name === projectName
            ? {
                ...pg,
                sessions: mergedSessions,
                loading: false,
              }
            : pg
        )
      );
    } catch (err) {
      console.warn('加载 CSI sessions 失败:', err);

      setCSIProjects((prev) =>
        prev.map((pg) =>
          pg.project.name === projectName
            ? {
                ...pg,
                sessions: [],
                loading: false,
              }
            : pg
        )
      );
    }
  };

  // 热环境 session 加载函数
  const loadThermalEnvProjectSessions = async (projectName: string) => {
    setThermalEnvProjects((prev) =>
      prev.map((pg) =>
        pg.project.name === projectName ? { ...pg, loading: true } : pg
      )
    );

    try {
      const [tempResp, radResp] = await Promise.all([
        api.getTempProjectSessions(projectName),
        api.getRadProjectSessions(projectName),
      ]);

      const tempSessions: BackendSessionInfo[] = (tempResp.sessions || []).map((s: any) => ({
        ...s,
        sensor_type: 'temp',
      }));

      const radSessions: BackendSessionInfo[] = (radResp.sessions || []).map((s: any) => ({
        ...s,
        sensor_type: 'rad',
      }));

      // const mergedSessions = [
      //   ...mergeSessions(tempSessions, [], 'temp', false),
      //   ...mergeSessions(radSessions, [], 'rad', false),
      // ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const mergedSessions = mergeThermalEnvSessions(tempSessions, radSessions);

      setThermalEnvProjects((prev) =>
        prev.map((pg) =>
          pg.project.name === projectName
            ? {
                ...pg,
                sessions: mergedSessions,
                loading: false,
              }
            : pg
        )
      );
    } catch (err) {
      console.warn('加载热环境 sessions 失败:', err);

      setThermalEnvProjects((prev) =>
        prev.map((pg) =>
          pg.project.name === projectName
            ? {
                ...pg,
                sessions: [],
                loading: false,
              }
            : pg
        )
      );
    }
  };

  // 光环境 session 加载函数
  const loadLightEnvProjectSessions = async (projectName: string) => {
    setLightEnvProjects((prev) =>
      prev.map((pg) =>
        pg.project.name === projectName ? { ...pg, loading: true } : pg
      )
    );

    try {
      const response = await api.getLightProjectSessions(projectName);
      const backendSessions: BackendSessionInfo[] = (response.sessions || []).map((s: any) => ({
        ...s,
        sensor_type: 'light',
      }));

      const mergedSessions = mergeSessions(backendSessions, [], 'light', false);

      setLightEnvProjects((prev) =>
        prev.map((pg) =>
          pg.project.name === projectName
            ? {
                ...pg,
                sessions: mergedSessions,
                loading: false,
              }
            : pg
        )
      );
    } catch (err) {
      console.warn('加载光环境 sessions 失败:', err);

      setLightEnvProjects((prev) =>
        prev.map((pg) =>
          pg.project.name === projectName
            ? {
                ...pg,
                sessions: [],
                loading: false,
              }
            : pg
        )
      );
    }
  };

  // 传相机数据的函数
  const toggleCameraProjectExpand = (projectName: string) => {
    setCameraProjects((prev) =>
      prev.map((pg) => {
        if (pg.project.name !== projectName) return pg;

        const newExpanded = !pg.expanded;
        if (newExpanded && pg.sessions.length === 0 && !pg.loading) {
          loadCameraProjectSessions(projectName);
        }

        return { ...pg, expanded: newExpanded };
      })
    );
  };

  // 传CSI数据的函数
  const toggleCSIProjectExpand = (projectName: string) => {
    setCSIProjects((prev) =>
      prev.map((pg) => {
        if (pg.project.name !== projectName) return pg;

        const newExpanded = !pg.expanded;
        if (newExpanded && pg.sessions.length === 0 && !pg.loading) {
          loadCSIProjectSessions(projectName);
        }

        return { ...pg, expanded: newExpanded };
      })
    );
  };

  // 传热环境和辐射数据的函数
  const toggleThermalEnvProjectExpand = (projectName: string) => {
    setThermalEnvProjects((prev) =>
      prev.map((pg) => {
        if (pg.project.name !== projectName) return pg;

        const newExpanded = !pg.expanded;
        if (newExpanded && pg.sessions.length === 0 && !pg.loading) {
          loadThermalEnvProjectSessions(projectName);
        }

        return { ...pg, expanded: newExpanded };
      })
    );
  };
  // 传光环境数据的函数
  const toggleLightEnvProjectExpand = (projectName: string) => {
    setLightEnvProjects((prev) =>
      prev.map((pg) => {
        if (pg.project.name !== projectName) return pg;

        const newExpanded = !pg.expanded;
        if (newExpanded && pg.sessions.length === 0 && !pg.loading) {
          loadLightEnvProjectSessions(projectName);
        }

        return { ...pg, expanded: newExpanded };
      })
    );
  };

  // 下载函数
  const handleDownloadCameraSession = (projectName: string, session: SessionRecord) => {
    const url = api.getSessionDownloadUrl(projectName, session.id);
    window.open(url, '_blank');
  };

  const handleDownloadCameraProject = (projectName: string) => {
    const url = api.getProjectDownloadUrl(projectName);
    window.open(url, '_blank');
  };

  const handleDownloadCSISession = (projectName: string, session: SessionRecord) => {
    const url = api.getCSISessionDownloadUrl(projectName, session.id);
    window.open(url, '_blank');
  };

  const handleDownloadCSIProject = (projectName: string) => {
    const url = api.getCSIProjectDownloadUrl(projectName);
    window.open(url, '_blank');
  };

  // const handleDownloadThermalEnvSession = (projectName: string, session: SessionRecord) => {
  //   let url = '';

  //   if (session.sensor_type === 'temp') {
  //     url = api.getTempSessionDownloadUrl(projectName, session.id);
  //   } else if (session.sensor_type === 'rad') {
  //     url = api.getRadSessionDownloadUrl(projectName, session.id);
  //   }

  //   if (url) {
  //     window.open(url, '_blank');
  //   }
  // };
  const handleDownloadThermalEnvSession = (projectName: string, session: SessionRecord) => {
    const url = api.getThermalEnvSessionDownloadUrl(
      projectName,
      session.id,
      session.artifacts.temp_session_id,
      session.artifacts.rad_session_id
    );
    window.open(url, '_blank');
  };

  const handleDownloadThermalEnvProject = (projectName: string) => {
    const url = api.getThermalEnvProjectDownloadUrl(projectName);
    window.open(url, '_blank');
  };

  const handleDownloadLightEnvSession = (projectName: string, session: SessionRecord) => {
    const url = api.getLightSessionDownloadUrl(projectName, session.id);
    window.open(url, '_blank');
  };

  const handleDownloadLightEnvProject = (projectName: string) => {
    const url = api.getLightProjectDownloadUrl(projectName);
    window.open(url, '_blank');
  };

    const handleDeleteCameraSession = async (projectName: string, session: SessionRecord) => {
      if (!window.confirm(`确定要删除 Camera 采集记录 "${session.name}" 吗？此操作不可撤销。`)) return;

      setDeletingSession(session.id);

      try {
        await api.deleteSession(projectName, session.id);

        const localSessions = getLocalSessions(projectName).filter((s) => s.id !== session.id);
        saveLocalSessions(projectName, localSessions);

        await loadCameraProjectSessions(projectName);
        await loadCameraProjects();
        await reloadAppProjects();
      } catch (err) {
        if (!isBackendUnavailable(err)) {
          alert(getErrorMessage(err, '删除失败，请重试'));
          setDeletingSession(null);
          return;
        }

        console.warn('后端服务不可用，使用本地存储删除 Camera session:', err);

        const localSessions = getLocalSessions(projectName).filter((s) => s.id !== session.id);
        saveLocalSessions(projectName, localSessions);

        await loadCameraProjectSessions(projectName);
        await loadCameraProjects();
        await reloadAppProjects();
      } finally {
        setDeletingSession(null);
      }
    };

  // 删除函数
  const handleDeleteThermalEnvSession = async (projectName: string, session: SessionRecord) => {
    if (!window.confirm(`确定要删除热环境采集记录 "${session.name}" 吗？此操作不可撤销。`)) return;

    setDeletingSession(session.id);

    try {
      if (session.artifacts.temp_session_id) {
        await api.deleteTempSession(projectName, session.artifacts.temp_session_id);
      }

      if (session.artifacts.rad_session_id) {
        await api.deleteRadSession(projectName, session.artifacts.rad_session_id);
      }

      await loadThermalEnvProjectSessions(projectName);
      await loadThermalEnvProjects();
    } catch (err) {
      alert(getErrorMessage(err, '删除热环境 session 失败'));
    } finally {
      setDeletingSession(null);
    }
  };

  const handleDeleteThermalEnvProject = async (_projectName: string) => {
    alert('热环境项目由温湿度和热辐射两部分合并显示，请分别展开后删除具体 session。');
  };

  const handleDeleteLightEnvSession = async (projectName: string, session: SessionRecord) => {
    if (!window.confirm(`确定要删除光环境采集记录 "${session.name}" 吗？此操作不可撤销。`)) return;

    setDeletingSession(session.id);

    try {
      await api.deleteLightSession(projectName, session.id);
      await loadLightEnvProjectSessions(projectName);
      await loadLightEnvProjects();
    } catch (err) {
      alert(getErrorMessage(err, '删除光环境 session 失败'));
    } finally {
      setDeletingSession(null);
    }
  };

  const handleDeleteLightEnvProject = async (projectName: string) => {
    if (!window.confirm(`确定要删除光环境项目 "${projectName}" 吗？此操作不可撤销。`)) return;

    setDeletingProject(projectName);

    try {
      await api.deleteLightProject(projectName);
      await loadLightEnvProjects();
    } catch (err) {
      alert(getErrorMessage(err, '删除光环境项目失败'));
    } finally {
      setDeletingProject(null);
    }
  };

  const handleDeleteCameraProject = async (projectName: string) => {
    if (!window.confirm(`确定要删除 Camera 项目 "${projectName}" 吗？此操作不可撤销。`)) return;

    setDeletingProject(projectName);

    try {
      await api.deleteProject(projectName);

      const localProjects = getLocalProjects().filter((p) => p.name !== projectName);
      saveLocalProjects(localProjects);
      localStorage.removeItem(`${LOCAL_STORAGE_KEYS.SESSIONS}_${projectName}`);

      await loadCameraProjects();
      await reloadAppProjects();
    } catch (err) {
      if (!isBackendUnavailable(err)) {
        alert(getErrorMessage(err, '删除项目失败，请重试'));
        setDeletingProject(null);
        return;
      }

      console.warn('后端服务不可用，使用本地存储删除 Camera 项目:', err);

      const localProjects = getLocalProjects().filter((p) => p.name !== projectName);
      saveLocalProjects(localProjects);
      localStorage.removeItem(`${LOCAL_STORAGE_KEYS.SESSIONS}_${projectName}`);

      await loadCameraProjects();
      await reloadAppProjects();
    } finally {
      setDeletingProject(null);
    }
  };

  const handleDeleteCSISession = async (projectName: string, session: SessionRecord) => {
    if (!window.confirm(`确定要删除 CSI 采集记录 "${session.name}" 吗？此操作不可撤销。`)) return;

    setDeletingSession(session.id);

    try {
      await api.deleteCSISession(projectName, session.id);
      await loadCSIProjectSessions(projectName);
      await loadCSIProjects();
    } catch (err) {
      alert(getErrorMessage(err, '删除 CSI session 失败'));
    } finally {
      setDeletingSession(null);
    }
  };

  const handleDeleteCSIProject = async (projectName: string) => {
    if (!window.confirm(`确定要删除 CSI 项目 "${projectName}" 吗？此操作不可撤销。`)) return;

    setDeletingProject(projectName);

    try {
      await api.deleteCSIProject(projectName);
      await loadCSIProjects();
    } catch (err) {
      alert(getErrorMessage(err, '删除 CSI 项目失败'));
    } finally {
      setDeletingProject(null);
    }
  };

  useEffect(() => {
    loadCameraProjects();
    loadCSIProjects();
    loadThermalEnvProjects();
    loadLightEnvProjects();
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-6 py-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex items-center gap-3">
          <Database className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">数据管理</h1>
            <p className="mt-1 text-sm text-slate-500">
              查看、下载和删除历史采集数据
            </p>
          </div>
        </div>

        {cameraError && !loadingCamera && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {cameraError}
          </div>
        )}

        {csiError && !loadingCSI && (
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-700">
            {csiError}
          </div>
        )}

        {thermalEnvError && !loadingThermalEnv && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
            {thermalEnvError}
          </div>
        )}

        {lightEnvError && !loadingLightEnv && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
            {lightEnvError}
          </div>
        )}

        <DataSection
          title="Camera 数据"
          icon={<Camera className="h-5 w-5 text-purple-600" />}
          projects={cameraProjects}
          emptyText="暂无 Camera 项目"
          loading={loadingCamera}
          onRefresh={loadCameraProjects}
          onToggleExpand={toggleCameraProjectExpand}
          onDownloadProject={handleDownloadCameraProject}
          onDeleteProject={handleDeleteCameraProject}
          onDownloadSession={handleDownloadCameraSession}
          onDeleteSession={handleDeleteCameraSession}
          deletingProject={deletingProject}
          deletingSession={deletingSession}
        />

        <DataSection
          title="CSI 数据"
          icon={<Wifi className="h-5 w-5 text-cyan-600" />}
          projects={csiProjects}
          emptyText="暂无 CSI 项目"
          loading={loadingCSI}
          onRefresh={loadCSIProjects}
          onToggleExpand={toggleCSIProjectExpand}
          onDownloadProject={handleDownloadCSIProject}
          onDeleteProject={handleDeleteCSIProject}
          onDownloadSession={handleDownloadCSISession}
          onDeleteSession={handleDeleteCSISession}
          deletingProject={deletingProject}
          deletingSession={deletingSession}
        />

        <DataSection
          title="热环境数据"
          icon={<Thermometer className="h-5 w-5 text-red-500" />}
          projects={thermalEnvProjects}
          emptyText="暂无热环境数据"
          loading={loadingThermalEnv}
          onRefresh={loadThermalEnvProjects}
          onToggleExpand={toggleThermalEnvProjectExpand}
          onDownloadProject={handleDownloadThermalEnvProject}
          onDeleteProject={handleDeleteThermalEnvProject}
          onDownloadSession={handleDownloadThermalEnvSession}
          onDeleteSession={handleDeleteThermalEnvSession}
          deletingProject={deletingProject}
          deletingSession={deletingSession}
        />

        <DataSection
          title="光环境数据"
          icon={<Lightbulb className="h-5 w-5 text-yellow-500" />}
          projects={lightEnvProjects}
          emptyText="暂无光环境数据"
          loading={loadingLightEnv}
          onRefresh={loadLightEnvProjects}
          onToggleExpand={toggleLightEnvProjectExpand}
          onDownloadProject={handleDownloadLightEnvProject}
          onDeleteProject={handleDeleteLightEnvProject}
          onDownloadSession={handleDownloadLightEnvSession}
          onDeleteSession={handleDeleteLightEnvSession}
          deletingProject={deletingProject}
          deletingSession={deletingSession}
        />
      </div>
    </div>
  );
}