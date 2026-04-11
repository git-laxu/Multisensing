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
} from 'lucide-react';
import * as api from '../services/api';

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
  session_count?: number;
  total_size_bytes?: number;
  total_size_mb?: number;
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
}

// ==============================
// 页面内部统一结构
// ==============================
interface ProjectInfo {
  name: string;
  path: string;
  created_at: string;
  session_count: number;
  total_size_bytes: number;
  total_size_mb: number;
}

interface SessionRecord {
  id: string;
  name: string;
  path: string;
  created_at: string;
  size_bytes: number;
  size_mb: number;
  artifacts: BackendSessionArtifacts;
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

function getLocalSessions(projectName: string): LocalSessionInfo[] {
  try {
    const data = localStorage.getItem(`${LOCAL_STORAGE_KEYS.SESSIONS}_${projectName}`);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('读取本地 sessions 失败:', e);
  }
  return [];
}

// ==============================
// 数据映射
// ==============================
function mapBackendProject(p: BackendProjectInfo): ProjectInfo {
  return {
    name: p.project_name || '',
    path: p.project_path || '',
    created_at: p.created_at || new Date().toISOString(),
    session_count: p.session_count ?? 0,
    total_size_bytes: p.total_size_bytes ?? 0,
    total_size_mb: p.total_size_mb ?? 0,
  };
}

function mapBackendSession(s: BackendSessionInfo): SessionRecord {
  return {
    id: s.session_id,
    name: s.session_name || s.session_id,
    path: s.session_path || '',
    created_at: s.created_at || new Date().toISOString(),
    size_bytes: s.total_size_bytes ?? 0,
    size_mb: s.total_size_mb ?? 0,
    artifacts: s.artifacts || {},
  };
}

function mapLocalProject(p: LocalProjectInfo): ProjectInfo {
  return {
    name: p.name,
    path: '',
    created_at: p.created_at || new Date().toISOString(),
    session_count: p.session_count ?? 0,
    total_size_bytes: p.total_size ?? 0,
    total_size_mb: Number(((p.total_size ?? 0) / 1024 / 1024).toFixed(2)),
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

// ==============================
// Session 列表项
// ==============================
interface SessionItemProps {
  session: SessionRecord;
  projectName: string;
  onDownload: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function SessionItem({ session, onDownload, onDelete, deleting }: SessionItemProps) {
  const artifacts = session.artifacts || {};

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-slate-900 truncate">{session.name}</div>
          <div className="mt-1 text-sm text-slate-500 break-all">{session.path || '无路径信息'}</div>
        </div>

        <div className="flex items-center gap-6 text-sm text-slate-600 shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>{formatDate(session.created_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            <span>{formatSize(session.size_bytes)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className={`px-2 py-1 rounded-full ${artifacts.has_raw_video ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
          原始视频 {artifacts.has_raw_video ? '✓' : '✗'}
        </span>
        <span className={`px-2 py-1 rounded-full ${artifacts.has_tracked_video ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
          跟踪视频 {artifacts.has_tracked_video ? '✓' : '✗'}
        </span>
        <span className={`px-2 py-1 rounded-full ${artifacts.has_person_clips ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
          Person Clips {artifacts.has_person_clips ? '✓' : '✗'}
        </span>
        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
          左原图 {artifacts.raw_images_left_count ?? 0}
        </span>
        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
          右原图 {artifacts.raw_images_right_count ?? 0}
        </span>
        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
          左跟踪图 {artifacts.tracked_images_left_count ?? 0}
        </span>
        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
          右跟踪图 {artifacts.tracked_images_right_count ?? 0}
        </span>
        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
          左 Clips {artifacts.person_clips_left_count ?? 0}
        </span>
        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
          右 Clips {artifacts.person_clips_right_count ?? 0}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={onDownload}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          下载
        </button>

        <button
          onClick={onDelete}
          disabled={deleting}
          className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={onToggleExpand} className="text-slate-500 hover:text-slate-700">
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>

          <FolderOpen className="w-6 h-6 text-blue-500 shrink-0" />

          <div className="min-w-0">
            <div className="text-2xl font-semibold text-slate-900 truncate">{project.name}</div>
            <div className="mt-1 text-sm text-slate-500">
              {project.session_count} 次采集
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-slate-600 shrink-0">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            <span>{formatSize(project.total_size_bytes)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>创建: {formatDate(project.created_at)}</span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownloadProject();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            下载全部
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteProject();
            }}
            disabled={deletingProject}
            className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
          >
            {deletingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 px-6 py-5 bg-slate-50">
          {loadingSessions ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              加载中...
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center text-slate-400 py-12">暂无采集记录</div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  projectName={project.name}
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

// ==============================
// 主页面组件
// ==============================
export function DataManagement() {
  const [projects, setProjects] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.getProjects();
      const backendProjects: BackendProjectInfo[] = response.projects || [];

      setProjects(
        backendProjects.map((p) => ({
          project: mapBackendProject(p),
          sessions: [],
          expanded: false,
          loading: false,
        }))
      );
    } catch (err) {
      console.warn('后端服务不可用，使用本地存储:', err);

      const localProjects = getLocalProjects();
      if (localProjects.length === 0) {
        setError('暂无项目，请先在“数据采集与可视化”页面创建项目');
      }

      setProjects(
        localProjects.map((p) => ({
          project: mapLocalProject(p),
          sessions: [],
          expanded: false,
          loading: false,
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  const loadProjectSessions = async (projectName: string) => {
    setProjects((prev) =>
      prev.map((pg) =>
        pg.project.name === projectName ? { ...pg, loading: true } : pg
      )
    );

    try {
      const response = await api.getProjectSessions(projectName);
      const backendSessions: BackendSessionInfo[] = response.sessions || [];

      setProjects((prev) =>
        prev.map((pg) =>
          pg.project.name === projectName
            ? {
                ...pg,
                sessions: backendSessions.map(mapBackendSession),
                loading: false,
              }
            : pg
        )
      );
    } catch (err) {
      console.warn('后端服务不可用，使用本地存储获取 sessions:', err);

      const localSessions = getLocalSessions(projectName);

      setProjects((prev) =>
        prev.map((pg) =>
          pg.project.name === projectName
            ? {
                ...pg,
                sessions: localSessions.map(mapLocalSession),
                loading: false,
              }
            : pg
        )
      );
    }
  };

  const toggleProjectExpand = (projectName: string) => {
    setProjects((prev) =>
      prev.map((pg) => {
        if (pg.project.name !== projectName) return pg;

        const newExpanded = !pg.expanded;
        if (newExpanded && pg.sessions.length === 0 && !pg.loading) {
          loadProjectSessions(projectName);
        }

        return { ...pg, expanded: newExpanded };
      })
    );
  };

  const handleDownloadSession = (session: SessionRecord, projectName: string) => {
    const url = api.getSessionDownloadUrl(projectName, session.id);
    window.open(url, '_blank');
  };

  const handleDeleteSession = async (session: SessionRecord, projectName: string) => {
    if (!window.confirm(`确定要删除采集记录 "${session.name}" 吗？此操作不可撤销。`)) return;

    setDeletingSession(session.id);

    try {
      await api.deleteSession(projectName, session.id);
      await loadProjectSessions(projectName);
      await loadProjects();
    } catch (err) {
      console.warn('后端服务不可用，使用本地存储删除 session:', err);

      try {
        const sessions = getLocalSessions(projectName);
        const filtered = sessions.filter((s) => s.id !== session.id);
        localStorage.setItem(`${LOCAL_STORAGE_KEYS.SESSIONS}_${projectName}`, JSON.stringify(filtered));
        await loadProjectSessions(projectName);
        await loadProjects();
      } catch (localErr) {
        console.error('本地删除 session 失败:', localErr);
        alert('删除失败，请重试');
      }
    } finally {
      setDeletingSession(null);
    }
  };

  const handleDeleteProject = async (projectName: string) => {
    if (!window.confirm(`确定要删除项目 "${projectName}" 及其所有数据吗？此操作不可撤销。`)) return;

    setDeletingProject(projectName);

    try {
      await api.deleteProject(projectName);
      await loadProjects();
    } catch (err) {
      console.warn('后端服务不可用，使用本地存储删除项目:', err);

      try {
        const localProjects = getLocalProjects();
        const filtered = localProjects.filter((p) => p.name !== projectName);
        localStorage.setItem(LOCAL_STORAGE_KEYS.PROJECTS, JSON.stringify(filtered));
        localStorage.removeItem(`${LOCAL_STORAGE_KEYS.SESSIONS}_${projectName}`);
        await loadProjects();
      } catch (localErr) {
        console.error('本地删除项目失败:', localErr);
        alert('删除失败，请重试');
      }
    } finally {
      setDeletingProject(null);
    }
  };

  const handleDownloadProject = (projectName: string) => {
    const url = api.getProjectDownloadUrl(projectName);
    window.open(url, '_blank');
  };

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-8 py-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Database className="w-8 h-8 text-blue-500" />
              <h1 className="text-4xl font-bold text-slate-900">数据管理</h1>
            </div>
            <p className="mt-2 text-lg text-slate-500">查看、下载和删除历史采集数据</p>
          </div>

          <button
            onClick={loadProjects}
            className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            刷新
          </button>
        </div>
      </div>

      <div className="px-8 py-8">
        {error && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
            {error}
          </div>
        )}

        {loading && projects.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-8 py-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
            <h3 className="mt-4 text-xl font-semibold text-slate-700">加载中...</h3>
            <p className="mt-2 text-slate-500">正在获取项目列表</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-8 py-16 text-center">
            <FolderOpen className="w-10 h-10 mx-auto text-slate-300" />
            <h3 className="mt-4 text-2xl font-semibold text-slate-700">暂无项目</h3>
            <p className="mt-2 text-slate-500">请先在“数据采集与可视化”页面创建项目</p>
          </div>
        ) : (
          <div className="space-y-6">
            {projects.map((pg) => (
              <ProjectGroupComponent
                key={pg.project.name}
                project={pg.project}
                sessions={pg.sessions}
                expanded={pg.expanded}
                onToggleExpand={() => toggleProjectExpand(pg.project.name)}
                onDownloadProject={() => handleDownloadProject(pg.project.name)}
                onDeleteProject={() => handleDeleteProject(pg.project.name)}
                onDownloadSession={(session) => handleDownloadSession(session, pg.project.name)}
                onDeleteSession={(session) => handleDeleteSession(session, pg.project.name)}
                deletingSession={deletingSession}
                deletingProject={deletingProject === pg.project.name}
                loadingSessions={pg.loading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}