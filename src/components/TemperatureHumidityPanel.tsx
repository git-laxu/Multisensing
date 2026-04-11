import React, { useEffect, useRef } from 'react';
import { Thermometer } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

interface LineChartProps {
  data: Array<{ time: string; [key: string]: string | number | null }>;
  lines: Array<{ dataKey: string; name: string; color: string }>;
  height?: number;
}

function CanvasLineChart({ data, lines, height = 220 }: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(container.clientWidth, 320);
      const chartHeight = height;

      canvas.width = width * dpr;
      canvas.height = chartHeight * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${chartHeight}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      const padding = { top: 26, right: 20, bottom: 40, left: 50 };
      const innerWidth = width - padding.left - padding.right;
      const innerHeight = chartHeight - padding.top - padding.bottom;

      ctx.clearRect(0, 0, width, chartHeight);

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

      if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return;

      const yRange = maxY - minY || 1;
      minY = minY - yRange * 0.15;
      maxY = maxY + yRange * 0.15;

      const scaleX = (index: number) =>
        padding.left + (index / Math.max(data.length - 1, 1)) * innerWidth;

      const scaleY = (value: number) =>
        padding.top + innerHeight - ((value - minY) / Math.max(maxY - minY, 1e-6)) * innerHeight;

      // 网格线
      ctx.strokeStyle = '#f0f0f0';
      ctx.lineWidth = 1;
      const yTicks = 4;

      for (let i = 0; i < yTicks; i++) {
        const tickValue = minY + (i / (yTicks - 1)) * (maxY - minY);
        const y = scaleY(tickValue);

        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        ctx.fillStyle = '#6b7280';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(tickValue.toFixed(1), padding.left - 8, y + 4);
      }

      // X轴
      ctx.strokeStyle = '#e5e5e5';
      ctx.beginPath();
      ctx.moveTo(padding.left, chartHeight - padding.bottom);
      ctx.lineTo(width - padding.right, chartHeight - padding.bottom);
      ctx.stroke();

      // X轴标签
      const xLabelIndices = data
        .map((_, i) => i)
        .filter((i) => i % Math.max(Math.ceil(data.length / 4), 1) === 0 || i === data.length - 1);

      ctx.fillStyle = '#6b7280';
      ctx.font = '9px Arial';
      ctx.textAlign = 'center';

      xLabelIndices.forEach((i) => {
        const x = scaleX(i);
        const timeStr = String(data[i].time).slice(-5);
        ctx.fillText(timeStr, x, chartHeight - padding.bottom + 15);
      });

      // 数据线
      lines.forEach((line) => {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
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
      ctx.font = '10px Arial';
      lines.forEach((line, i) => {
        const x = padding.left + i * 120;
        const y = 12;

        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 15, y);
        ctx.stroke();

        ctx.fillStyle = '#6b7280';
        ctx.textAlign = 'left';
        ctx.fillText(line.name, x + 20, y + 4);
      });
    };

    draw();

    const resizeObserver = new ResizeObserver(() => {
      draw();
    });

    resizeObserver.observe(container);
    window.addEventListener('resize', draw);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [data, lines, height]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        暂无数据
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}

export function TemperatureHumidityPanel() {
  const { state } = useApp();
  const { temperatureHumidityData, thermalRadiationData, sensorConfig } = state;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const combinedData = temperatureHumidityData.map((item, index) => ({
    time: formatTime(item.timestamp),
    airTemp: parseFloat(item.airTemperature.toFixed(1)),
    humidity: parseFloat(item.relativeHumidity.toFixed(1)),
    blackGlobe: thermalRadiationData[index]
      ? parseFloat(thermalRadiationData[index].blackGlobeTemperature.toFixed(1))
      : null,
  }));

  const latestTempHumidity = temperatureHumidityData[temperatureHumidityData.length - 1];
  const latestRadiation = thermalRadiationData[thermalRadiationData.length - 1];

  if (!sensorConfig.temperatureHumidity.enabled) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm h-full flex flex-col min-h-0">
      <h3 className="text-[18px] font-semibold text-slate-900 flex items-center gap-2 mb-4 flex-shrink-0">
        <Thermometer className="w-5 h-5 text-red-500" />
        温湿度与热辐射监测
      </h3>

      {/* 实时数值 */}
      <div className="grid grid-cols-3 gap-4 mb-4 flex-shrink-0">
        <div className="bg-red-50 rounded-xl p-4 text-center">
          <div className="text-sm text-red-500 mb-1">空气温度</div>
          <div className="text-[18px] font-bold text-red-600">
            {latestTempHumidity ? `${latestTempHumidity.airTemperature.toFixed(1)}°C` : '--'}
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <div className="text-sm text-blue-500 mb-1">相对湿度</div>
          <div className="text-[18px] font-bold text-blue-600">
            {latestTempHumidity ? `${latestTempHumidity.relativeHumidity.toFixed(1)}%` : '--'}
          </div>
        </div>

        <div className="bg-orange-50 rounded-xl p-4 text-center">
          <div className="text-sm text-orange-500 mb-1">黑球温度</div>
          <div className="text-[18px] font-bold text-orange-600">
            {latestRadiation ? `${latestRadiation.blackGlobeTemperature.toFixed(1)}°C` : '--'}
          </div>
        </div>
      </div>

      {/* 曲线图 */}
      <div className="flex-1 min-h-0">
        <CanvasLineChart
          data={combinedData}
          lines={[
            { dataKey: 'airTemp', name: '温度(°C)', color: '#ef4444' },
            { dataKey: 'humidity', name: '湿度(%)', color: '#3b82f6' },
            { dataKey: 'blackGlobe', name: '黑球(°C)', color: '#f97316' },
          ]}
          height={220}
        />
      </div>
    </div>
  );
}