import React, { useEffect, useRef } from 'react';
import { Thermometer, Lightbulb, Activity } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

// Canvas图表组件 - 使用固定像素尺寸
interface LineChartProps {
  data: Array<{ time: string; [key: string]: string | number | null }>;
  lines: Array<{ dataKey: string; name: string; color: string }>;
  height?: number;
}

function CanvasLineChart({ data, lines, height = 280 }: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 固定尺寸
    const width = 600;
    const chartHeight = height;
    canvas.width = width;
    canvas.height = chartHeight;

    // 边距
    const padding = { top: 30, right: 30, bottom: 50, left: 60 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    // 清空画布
    ctx.clearRect(0, 0, width, chartHeight);

    // 计算Y轴范围
    let minY = Infinity;
    let maxY = -Infinity;
    data.forEach((d) => {
      lines.forEach((line) => {
        const value = d[line.dataKey];
        if (typeof value === 'number' && value !== null) {
          minY = Math.min(minY, value);
          maxY = Math.max(maxY, value);
        }
      });
    });

    // 添加边距
    const yRange = maxY - minY || 1;
    minY = minY - yRange * 0.15;
    maxY = maxY + yRange * 0.15;

    // 缩放函数
    const scaleX = (index: number) => padding.left + (index / (data.length - 1 || 1)) * innerWidth;
    const scaleY = (value: number) => padding.top + innerHeight - ((value - minY) / (maxY - minY)) * innerHeight;

    // 绘制网格线
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    const yTicks = 5;
    for (let i = 0; i < yTicks; i++) {
      const tickValue = minY + (i / (yTicks - 1)) * (maxY - minY);
      const y = scaleY(tickValue);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y轴刻度标签
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(tickValue.toFixed(1), padding.left - 8, y + 4);
    }

    // X轴
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, chartHeight - padding.bottom);
    ctx.lineTo(width - padding.right, chartHeight - padding.bottom);
    ctx.stroke();

    // X轴标签
    const xLabelIndices = data
      .map((_, i) => i)
      .filter((i) => i % Math.ceil(data.length / 6) === 0 || i === data.length - 1);

    ctx.fillStyle = '#6b7280';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    xLabelIndices.forEach((i) => {
      const x = scaleX(i);
      const timeStr = String(data[i].time).slice(-8);
      ctx.fillText(timeStr, x, chartHeight - padding.bottom + 20);
    });

    // 绘制每条线
    lines.forEach((line) => {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      let started = false;
      data.forEach((d, i) => {
        const value = d[line.dataKey];
        if (typeof value === 'number' && value !== null) {
          const x = scaleX(i);
          const y = scaleY(value);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    });

    // 图例
    ctx.font = '12px Arial';
    lines.forEach((line, i) => {
      const x = padding.left + i * 130;
      const y = 15;

      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 20, y);
      ctx.stroke();

      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'left';
      ctx.fillText(line.name, x + 25, y + 4);
    });
  }, [data, lines, height]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-gray-400 text-sm">暂无数据</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block' }}
      />
    </div>
  );
}

// 面积图组件
interface AreaChartProps {
  data: Array<{ time: string; value: number }>;
  color: string;
  height?: number;
}

function CanvasAreaChart({ data, color, height = 200 }: AreaChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 固定尺寸
    const width = 600;
    const chartHeight = height;
    canvas.width = width;
    canvas.height = chartHeight;

    // 边距
    const padding = { top: 30, right: 30, bottom: 50, left: 60 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    // 清空画布
    ctx.clearRect(0, 0, width, chartHeight);

    // 计算范围
    const values = data.map((d) => d.value);
    const minY = Math.min(...values) * 0.9;
    const maxY = Math.max(...values) * 1.1;

    // 缩放函数
    const scaleX = (index: number) => padding.left + (index / (data.length - 1 || 1)) * innerWidth;
    const scaleY = (value: number) => padding.top + innerHeight - ((value - minY) / (maxY - minY)) * innerHeight;

    // 创建渐变
    const gradient = ctx.createLinearGradient(0, padding.top, 0, chartHeight - padding.bottom);
    gradient.addColorStop(0, color + '50');
    gradient.addColorStop(1, color + '00');

    // 绘制面积
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = scaleX(i);
      const y = scaleY(d.value);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.lineTo(scaleX(data.length - 1), chartHeight - padding.bottom);
    ctx.lineTo(padding.left, chartHeight - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // 绘制线
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = scaleX(i);
      const y = scaleY(d.value);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // X轴
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, chartHeight - padding.bottom);
    ctx.lineTo(width - padding.right, chartHeight - padding.bottom);
    ctx.stroke();

    // X轴标签
    const xLabelIndices = data
      .map((_, i) => i)
      .filter((i) => i % Math.ceil(data.length / 6) === 0 || i === data.length - 1);

    ctx.fillStyle = '#6b7280';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    xLabelIndices.forEach((i) => {
      const x = scaleX(i);
      const timeStr = String(data[i].time).slice(-8);
      ctx.fillText(timeStr, x, chartHeight - padding.bottom + 20);
    });
  }, [data, color, height]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-gray-400 text-sm">暂无数据</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block' }}
      />
    </div>
  );
}

export function VisualizationPanel() {
  const { state } = useApp();
  const { temperatureHumidityData, thermalRadiationData, illuminanceData, sensorConfig } = state;

  // 格式化时间
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // 合并温湿度和热辐射数据
  const combinedTempHumidityData = temperatureHumidityData.map((item, index) => ({
    time: formatTime(item.timestamp),
    airTemp: parseFloat(item.airTemperature.toFixed(1)),
    humidity: parseFloat(item.relativeHumidity.toFixed(1)),
    blackGlobe: thermalRadiationData[index]
      ? parseFloat(thermalRadiationData[index].blackGlobeTemperature.toFixed(1))
      : null,
  }));

  // 照明数据
  const illuminanceChartData = illuminanceData.map((item) => ({
    time: formatTime(item.timestamp),
    value: parseFloat(item.illuminance.toFixed(1)),
  }));

  // 最新数据
  const latestTempHumidity = temperatureHumidityData[temperatureHumidityData.length - 1];
  const latestRadiation = thermalRadiationData[thermalRadiationData.length - 1];
  const latestIlluminance = illuminanceData[illuminanceData.length - 1];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">实时数据可视化</h2>

      <div className="space-y-6">
        {/* 温湿度/热辐射曲线图 */}
        {sensorConfig.temperatureHumidity.enabled && (
          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-2 mb-4">
              <Thermometer className="w-5 h-5 text-red-500" />
              <span className="font-medium text-gray-900">温湿度与热辐射监测</span>
            </div>

            {/* 实时数值 */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="text-xs text-gray-500 mb-1">空气温度</div>
                <div className="text-2xl font-bold text-red-600">
                  {latestTempHumidity ? `${latestTempHumidity.airTemperature.toFixed(1)}°C` : '--'}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="text-xs text-gray-500 mb-1">相对湿度</div>
                <div className="text-2xl font-bold text-blue-600">
                  {latestTempHumidity ? `${latestTempHumidity.relativeHumidity.toFixed(1)}%` : '--'}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="text-xs text-gray-500 mb-1">黑球温度</div>
                <div className="text-2xl font-bold text-orange-600">
                  {latestRadiation ? `${latestRadiation.blackGlobeTemperature.toFixed(1)}°C` : '--'}
                </div>
              </div>
            </div>

            {/* 曲线图 - 使用固定高度 */}
            <CanvasLineChart
              data={combinedTempHumidityData}
              lines={[
                { dataKey: 'airTemp', name: '空气温度 (°C)', color: '#ef4444' },
                { dataKey: 'humidity', name: '相对湿度 (%)', color: '#3b82f6' },
                { dataKey: 'blackGlobe', name: '黑球温度 (°C)', color: '#f97316' },
              ]}
              height={280}
            />
          </div>
        )}

        {/* 照明数据曲线图 */}
        {sensorConfig.spectrometer.enabled && (
          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              <span className="font-medium text-gray-900">照明数据监测</span>
            </div>

            {/* 实时数值 */}
            <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
              <div className="text-xs text-gray-500 mb-1">当前照度</div>
              <div className="text-2xl font-bold text-yellow-600">
                {latestIlluminance ? `${latestIlluminance.illuminance.toFixed(1)} lux` : '--'}
              </div>
            </div>

            {/* 面积图 */}
            <CanvasAreaChart
              data={illuminanceChartData}
              color="#eab308"
              height={220}
            />
          </div>
        )}

        {/* 无数据提示 */}
        {!sensorConfig.temperatureHumidity.enabled && !sensorConfig.spectrometer.enabled && (
          <div className="p-8 text-center text-gray-500">
            <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>暂无启用的传感器数据</p>
            <p className="text-sm">请在左侧面板启用温湿度传感器或光谱照度计</p>
          </div>
        )}
      </div>
    </div>
  );
}
