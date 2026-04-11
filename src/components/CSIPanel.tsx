import React, { useEffect, useRef, useState } from 'react';
import { Wifi, Activity } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { CSIData } from '../types';

interface CSIPanelProps {
  csiData?: CSIData | null;
  isConnected?: boolean;
}

export function CSIPanel({
  csiData: propCSIData,
  isConnected: propIsConnected
}: CSIPanelProps) {
  const { state } = useApp();
  const csiData = propCSIData ?? state.csiData;
  const isConnected = propIsConnected ?? state.sensorConfig.wifiCSI.connected;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  // CSI振幅图渲染
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !csiData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 600;
    const height = 200;
    canvas.width = width;
    canvas.height = height;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // 绘制背景网格
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 数据处理
    const amplitudes = csiData.amplitude;
    const barWidth = width / amplitudes.length;
    const maxAmp = Math.max(...amplitudes);
    const minAmp = Math.min(...amplitudes);
    const range = maxAmp - minAmp || 1;

    // 创建渐变
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, '#06b6d4');
    gradient.addColorStop(1, '#22d3ee');

    // 绘制柱状图
    amplitudes.forEach((amp, i) => {
      const x = i * barWidth;
      const barHeight = ((amp - minAmp) / range) * (height - 20);
      const y = height - barHeight - 10;

      ctx.fillStyle = gradient;
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    });

    // X轴标签 - 90个子载波的频率范围是-45到+44
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    const labels = ['-45', '-22', '0', '+22', '+44'];
    labels.forEach((label, i) => {
      const x = (width / 4) * i + 20;
      ctx.fillText(label, x, height - 2);
    });

  }, [csiData]);

  // 检测滚动区域是否可滚动
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const checkScroll = () => {
      setShowScrollHint(scrollElement.scrollHeight > scrollElement.clientHeight);
    };

    checkScroll();
    // 监听内容变化
    const observer = new MutationObserver(checkScroll);
    observer.observe(scrollElement, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [csiData, isConnected]);

  // CSI数据统计
  const stats = csiData ? {
    avg: csiData.amplitude.reduce((a, b) => a + b, 0) / csiData.amplitude.length,
    max: Math.max(...csiData.amplitude),
    min: Math.min(...csiData.amplitude),
    count: csiData.amplitude.length
  } : null;

  // 面板标题区域高度（固定）
  const headerHeight = 56;
  // 状态卡片高度（固定）
  const statusCardHeight = 60;

  // 采集状态下是否有数据
  const hasData = !!csiData && isConnected;

  // 未连接时的紧凑提示
  const showCompactTip = !isConnected;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm h-full flex flex-col overflow-hidden">
      {/* 固定标题区域 */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0" style={{ height: headerHeight }}>
        <h2 className="text-lg font-semibold text-gray-900">CSI可视化</h2>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-sm text-gray-600">
            {isConnected ? '已连接' : '未连接'}
          </span>
        </div>
      </div>

      {/* CSI状态卡片 - 固定 */}
      <div className={`rounded-xl p-3 mb-3 flex-shrink-0 ${isConnected ? 'bg-cyan-50' : 'bg-gray-50'}`} style={{ height: statusCardHeight }}>
        <div className="flex items-center gap-2">
          <Wifi className={`w-4 h-4 ${isConnected ? 'text-cyan-600' : 'text-gray-400'}`} />
          <div>
            <p className={`text-xs font-medium ${isConnected ? 'text-cyan-800' : 'text-gray-600'}`}>
              {isConnected ? 'CSI数据流正常' : '等待CSI数据...'}
            </p>
            {csiData && (
              <p className="text-xs text-cyan-600">
                {new Date(csiData.timestamp).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 未连接时的紧凑提示 - 只占很小空间 */}
      {showCompactTip && (
        <div className="flex-shrink-0 flex items-center justify-center" style={{ height: '20px' }}>
          <Activity className="w-3 h-3 text-gray-400 mr-1" />
          <span className="text-xs text-gray-400">点击"连接CSI"开始</span>
        </div>
      )}

      {/* 计算可用内容区域高度 */}
      <div
        className="flex-1 flex flex-col min-h-0"
        style={{
          height: showCompactTip
            ? `calc(100% - ${headerHeight + statusCardHeight + 12 + 20}px)`
            : `calc(100% - ${headerHeight + statusCardHeight + 12}px)`
        }}
      >
        {/* CSI振幅可视化 - 根据状态变化：收缩30%后变为70% */}
        <div
          className={`bg-gray-900 rounded-xl p-3 flex-shrink-0 transition-all duration-300`}
          style={{
            // 未采集或无数据时：占满空间
            // 采集时有数据：收缩30%（变为70%高度）
            height: hasData ? '70%' : '100%'
          }}
        >
          {csiData ? (
            <>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-medium text-gray-300">子载波振幅</h4>
                <span className="text-xs text-gray-500">
                  {csiData.amplitude.length} 个子载波
                </span>
              </div>
              <canvas
                ref={canvasRef}
                className="w-full h-[calc(100%-20px)] rounded"
              />
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <p className="text-xs">启用CSI连接后显示数据</p>
            </div>
          )}
        </div>

        {/* CSI详细信息区域 - 采集且有数据时显示在下方的30%空间，可滚动 */}
        {hasData && (
          <div
            className="flex-1 mt-2 overflow-hidden flex flex-col"
            style={{ height: '30%' }}
          >
            <div className="flex items-center justify-between mb-1 flex-shrink-0">
              <h4 className="text-xs font-medium text-gray-700">CSI详细信息</h4>
              {showScrollHint && (
                <span className="text-xs text-gray-400">↓ 可滚动</span>
              )}
            </div>

            {/* 统计信息卡片 */}
            {stats && (
              <div className="grid grid-cols-3 gap-2 mb-2 flex-shrink-0">
                <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                  <div className="text-xs text-gray-500">平均</div>
                  <div className="text-sm font-bold text-cyan-600">
                    {stats.avg.toFixed(1)}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                  <div className="text-xs text-gray-500">最大</div>
                  <div className="text-sm font-bold text-green-600">
                    {stats.max.toFixed(1)}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                  <div className="text-xs text-gray-500">最小</div>
                  <div className="text-sm font-bold text-orange-600">
                    {stats.min.toFixed(1)}
                  </div>
                </div>
              </div>
            )}

            {/* 可滚动的详细信息区域 - 真正可滚动 */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto min-h-0"
              style={{
                maxHeight: 'calc(100% - 80px)',
                scrollBehavior: 'smooth'
              }}
            >
              <div className="grid grid-cols-2 gap-1.5 text-xs pb-2">
                {/* 采样时间 */}
                <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">采样时间</p>
                  <p className="font-semibold text-gray-900 text-[10px]">
                    {new Date(csiData.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                {/* 采样日期 */}
                <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">采样日期</p>
                  <p className="font-semibold text-gray-900 text-[10px]">
                    {new Date(csiData.timestamp).toLocaleDateString()}
                  </p>
                </div>
                {/* 频率范围 */}
                <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">频率范围</p>
                  <p className="font-semibold text-gray-900 text-[10px]">-45 ~ +44</p>
                </div>
                {/* 信号带宽 */}
                <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">信号带宽</p>
                  <p className="font-semibold text-gray-900 text-[10px]">20 MHz</p>
                </div>
                {/* 采样率 */}
                <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">采样率</p>
                  <p className="font-semibold text-gray-900 text-[10px]">1000 Hz</p>
                </div>
                {/* 子载波数 */}
                <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">子载波数</p>
                  <p className="font-semibold text-gray-900 text-[10px]">{stats?.count || 0}</p>
                </div>
                {/* MAC地址 */}
                <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">MAC地址</p>
                  <p className="font-semibold text-gray-900 text-[10px]">AA:BB:CC:DD:EE:FF</p>
                </div>
                {/* 信道号 */}
                <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">信道号</p>
                  <p className="font-semibold text-gray-900 text-[10px]">36</p>
                </div>
                {/* RSSI */}
                <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">RSSI</p>
                  <p className="font-semibold text-gray-900 text-[10px]">-45 dBm</p>
                </div>
                {/* 噪声底 */}
                <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">噪声底</p>
                  <p className="font-semibold text-gray-900 text-[10px]">-92 dBm</p>
                </div>
                {/* 帧长度 */}
                <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">帧长度</p>
                  <p className="font-semibold text-gray-900 text-[10px]">512 bytes</p>
                </div>
                {/* 数据速率 */}
                <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">数据速率</p>
                  <p className="font-semibold text-gray-900 text-[10px]">6 Mbps</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 自定义滚动条样式 */}
      <style>{`
        .overflow-y-auto::-webkit-scrollbar {
          width: 4px;
        }
        .overflow-y-auto::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 2px;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 2px;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background: #a1a1a1;
        }
      `}</style>
    </div>
  );
}
