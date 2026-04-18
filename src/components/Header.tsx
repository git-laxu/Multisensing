import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  FolderOpen,
  Plus,
  ChevronDown,
  X,
  Database,
  BarChart3,
  Trash2,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Link, useLocation } from 'react-router-dom';

function getErrorMessage(error: any, fallback: string): string {
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

export function Header() {
  // const { state, createProject, selectProject, deleteProject } = useApp();
  const { state, createProject, selectProject, hideProjectFromSelector } = useApp();
  const location = useLocation();

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) {
      alert('项目名称不能为空');
      return;
    }

    if (creatingProject) return;

    setCreatingProject(true);
    try {
      await createProject(name);
      setNewProjectName('');
      setShowNewProjectModal(false);
      setShowProjectDropdown(false);
    } catch (error) {
      alert(getErrorMessage(error, '创建项目失败，请重试'));
    } finally {
      setCreatingProject(false);
    }
  };

  const handleDeleteProject = (
    e: React.MouseEvent,
    projectName: string
  ) => {
    e.stopPropagation();

    if (!confirm(`确定要将项目 "${projectName}" 从项目选择列表中移除吗？这不会删除项目数据。`)) {
      return;
    }

    setDeletingProject(projectName);
    try {
      hideProjectFromSelector(projectName);
    } finally {
      setDeletingProject(null);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowProjectDropdown(false);
      }
    };

    if (showProjectDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProjectDropdown]);

  const isDataCollectionPage =
    location.pathname === '/' || location.pathname === '/data-collection';
  const isDataManagementPage = location.pathname === '/data-management';

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-[1920px] items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-[28px] font-bold leading-none text-gray-900">
                  多传感器数据采集系统
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  Multi-Sensor Data Acquisition
                </p>
              </div>
            </div>

            <nav className="flex items-center gap-2 rounded-2xl bg-gray-100 p-1">
              <Link
                to="/data-collection"
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  isDataCollectionPage
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                数据采集与可视化
              </Link>

              <Link
                to="/data-management"
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  isDataManagementPage
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Database className="h-4 w-4" />
                数据管理
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setShowProjectDropdown((prev) => !prev)}
                className="flex min-w-[210px] items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:bg-gray-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FolderOpen className="h-5 w-5 shrink-0 text-gray-500" />
                  <span className="truncate text-lg font-medium text-gray-800">
                    {state.currentProject?.name || '选择项目'}
                  </span>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-gray-500 transition-transform ${
                    showProjectDropdown ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showProjectDropdown && (
                <div className="absolute right-0 top-full z-50 mt-3 w-[430px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                  {state.projects.length === 0 ? (
                    <div className="px-5 py-6 text-center text-sm text-gray-500">
                      暂无项目
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto py-2">
                      {state.projects.map((project) => {
                        const isCurrent =
                          state.currentProject?.name === project.name;

                        return (
                          <div
                            key={project.name}
                            className={`group mx-2 flex items-center justify-between rounded-xl px-3 py-3 transition-colors ${
                              isCurrent ? 'bg-blue-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                selectProject(project);
                                setShowProjectDropdown(false);
                              }}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div
                                className={`truncate text-base font-medium ${
                                  isCurrent ? 'text-blue-700' : 'text-gray-800'
                                }`}
                              >
                                {project.name}
                              </div>
                              <div className="mt-1 text-xs text-gray-400">
                                {isCurrent ? '当前项目' : '点击切换到该项目'}
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleDeleteProject(e, project.name)}
                              disabled={deletingProject === project.name}
                              className="ml-3 rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                              title="删除项目"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowNewProjectModal(true)}
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-4 text-lg font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus className="h-5 w-5" />
              新建项目
            </button>
          </div>
        </div>
      </header>

      {showNewProjectModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">新建项目</h2>
              <button
                type="button"
                onClick={() => {
                  if (creatingProject) return;
                  setShowNewProjectModal(false);
                }}
                className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                项目名称
              </label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="请输入项目名称"
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateProject();
                  }
                }}
                disabled={creatingProject}
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  if (creatingProject) return;
                  setShowNewProjectModal(false);
                }}
                disabled={creatingProject}
                className="flex-1 rounded-2xl border border-gray-300 px-4 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={creatingProject}
                className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingProject ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}