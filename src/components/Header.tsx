import React, { useState } from 'react';
import { Activity, FolderOpen, Plus, ChevronDown, X, Database, BarChart3, Trash2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Link, useLocation } from 'react-router-dom';

export function Header() {
  const { state, createProject, selectProject, deleteProject } = useApp();
  const location = useLocation();
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);

  const handleCreateProject = async () => {
    if (newProjectName.trim()) {
      try {
        await createProject(newProjectName.trim());
        setNewProjectName('');
        setShowNewProjectModal(false);
      } catch (error) {
        alert('创建项目失败，请重试');
      }
    }
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectName: string) => {
    e.stopPropagation();
    if (confirm(`确定要删除项目 "${projectName}" 吗？此操作不可撤销。`)) {
      setDeletingProject(projectName);
      try {
        await deleteProject(projectName);
      } catch (error) {
        alert('删除项目失败，请重试');
      } finally {
        setDeletingProject(null);
      }
    }
  };

  // 判断当前页面
  const isDataCollectionPage = location.pathname === '/' || location.pathname === '/data-collection';
  const isDataManagementPage = location.pathname === '/data-management';

  return (
    <>
      <header className="bg-white border-b border-gray-200">
        {/* 顶部导航栏 */}
        <div className="px-6 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            {/* Logo & Title */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-sm">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">多传感器数据采集系统</h1>
                <p className="text-xs text-gray-500">Multi-Sensor Data Acquisition</p>
              </div>
            </div>

            {/* 导航按钮 */}
            <div className="flex items-center gap-2">
              <Link
                to="/data-collection"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isDataCollectionPage
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span className="text-sm font-medium">数据采集与可视化</span>
              </Link>
              <Link
                to="/data-management"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isDataManagementPage
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Database className="w-4 h-4" />
                <span className="text-sm font-medium">数据管理</span>
              </Link>
            </div>

            {/* Project Selector */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <button
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                >
                  <FolderOpen className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-700">
                    {state.currentProject?.name || '选择项目'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {showProjectDropdown && (
                  <div className="absolute top-full mt-2 left-0 w-72 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                    {state.projects.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">
                        暂无项目
                      </div>
                    ) : (
                      state.projects.map((project) => (
                        <div
                          key={project.id}
                          className={`flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors group ${
                            state.currentProject?.id === project.id
                              ? 'bg-blue-50'
                              : ''
                          }`}
                        >
                          <button
                            onClick={() => {
                              selectProject(project);
                              setShowProjectDropdown(false);
                            }}
                            className="flex-1 text-left text-sm text-gray-700"
                          >
                            {project.name}
                          </button>
                          <button
                            onClick={(e) => handleDeleteProject(e, project.name)}
                            disabled={deletingProject === project.name}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                            title="删除项目"
                          >
                            {deletingProject === project.name ? (
                              <X className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowNewProjectModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">新建项目</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 m-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">新建项目</h2>
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  项目名称
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="请输入项目名称"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateProject();
                    }
                  }}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowNewProjectModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim()}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close dropdown */}
      {showProjectDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowProjectDropdown(false)}
        />
      )}
    </>
  );
}
