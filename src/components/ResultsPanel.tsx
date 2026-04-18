import React, { useRef, useEffect } from 'react';
import { FileOutput, Download, Trash2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { ProcessedResult } from '../types';

export function ResultsPanel() {
  const { state, dispatch } = useApp();
  const { results, collectionStatus } = state;
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到最新结果
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [results]);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatResult = (result: ProcessedResult) => {
    const parts: string[] = [];

    parts.push(`时间=${formatTimestamp(result.timestamp)}`);

    if (result.id) {
      parts.push(result.id);
    }

    if (result.airTemperature !== undefined) {
      parts.push(`室温=${result.airTemperature.toFixed(1)}°C`);
    }

    if (result.relativeHumidity !== undefined) {
      parts.push(`相对湿度=${result.relativeHumidity.toFixed(1)}%`);
    }

    if (result.blackGlobeTemperature !== undefined) {
      parts.push(`辐射热=${result.blackGlobeTemperature.toFixed(1)}°C`);
    }

    if (result.illuminance !== undefined) {
      parts.push(`照度=${result.illuminance.toFixed(1)}lux`);
    }

    if (result.action) {
      parts.push(`action=${result.action}`);
    }

    if (result.actionConfidence !== undefined) {
      parts.push(`conf=${result.actionConfidence.toFixed(4)}`);
    }

    return parts.join(', ');
  };

  const handleExport = () => {
    const content = results.map(formatResult).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sensor_results_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    dispatch({ type: 'CLEAR_DATA' });
  };

  const isCollecting = collectionStatus === 'collecting';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileOutput className="w-5 h-5 text-gray-700" />
          {/* <h2 className="text-lg font-semibold text-gray-900">处理结果输出</h2> */}
          <h2 className="text-[15px] font-semibold text-gray-900">处理结果输出</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {results.length} 条记录
          </span>
          {results.length > 0 && (
            <>
              <button
                onClick={handleExport}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              >
                <Download className="w-3 h-3" />
                导出
              </button>
              <button
                onClick={handleClear}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                清空
              </button>
            </>
          )}
        </div>
      </div>

      {/* 结果显示区域 - 自适应高度 */}
      <div
        ref={scrollRef}
        className="flex-1 bg-gray-900 rounded-xl p-3 overflow-y-auto font-mono text-xs min-h-0"
      >
        {results.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <FileOutput className="w-8 h-8 mb-0 text-gray-600" />
            <p className="text-xs">{isCollecting ? '等待处理结果...' : '开始采集后显示处理结果'}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {results.map((result, index) => (
              <div
                key={`${result.timestamp.getTime()}-${index}`}
                className="text-cyan-400 hover:bg-gray-800 px-2 py-1.5 rounded transition-colors"
              >
                [{formatTimestamp(result.timestamp)}] {formatResult(result)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 算法说明 - 折叠显示 */}
      <div className="mt-2 p-0 bg-gray-50 rounded-lg flex-shrink-0">
        {/* <h4 className="text-xs font-medium text-gray-700">算法说明</h4> */}
        <div className="grid grid-cols-2 gap-2 mt-1 text-xs text-gray-600">
          <div className="bg-white p-1.5 rounded border border-gray-200">
            <p className="text-gray-800">视频: 捕捉→预处理→检测跟踪→帧提取→行为分类</p>
          </div>
          <div className="bg-white p-1.5 rounded border border-gray-200">
            <p className="text-gray-800">CSI: 接收→预处理→切片→彩图→行为分类</p>
          </div>
        </div>
      </div>
    </div>
  );
}
