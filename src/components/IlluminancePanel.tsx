import React, { useEffect, useRef } from 'react';
import { Lightbulb } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

interface AreaChartProps {
  data: Array<{ time: string; value: number }>;
  color: string;
  height?: number;
}

function CanvasAreaChart({ data, color, height = 180 }: AreaChartProps) {
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

      const padding = { top: 25, right: 20, bottom: 40, left: 30 };
      const innerWidth = width - padding.left - padding.right;
      const innerHeight = chartHeight - padding.top - padding.bottom;

      ctx.clearRect(0, 0, width, chartHeight);

      const values = data.map((d) => d.value);
      if (values.length === 0) return;

      const minY = Math.min(...values) * 0.9;
      const maxY = Math.max(...values) * 1.1;

      const scaleX = (index: number) =>
        padding.left + (index / Math.max(data.length - 1, 1)) * innerWidth;

      const scaleY = (value: number) =>
        padding.top + innerHeight - ((value - minY) / Math.max(maxY - minY, 1e-6)) * innerHeight;

      const gradient = ctx.createLinearGradient(0, padding.top, 0, chartHeight - padding.bottom);
      gradient.addColorStop(0, color + '50');
      gradient.addColorStop(1, color + '00');

      // 面积
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

      // 折线
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
  }, [data, color, height]);

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

export function IlluminancePanel() {
  const { state } = useApp();
  const { illuminanceData, sensorConfig } = state;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const chartData = illuminanceData.map((item) => ({
    time: formatTime(item.timestamp),
    value: parseFloat(item.illuminance.toFixed(1)),
  }));

  const latestIlluminance = illuminanceData[illuminanceData.length - 1];

  if (!sensorConfig.spectrometer.enabled) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm h-full flex flex-col min-h-0">
      <h3 className="text-[18px] font-semibold text-slate-900 flex items-center gap-2 mb-4 flex-shrink-0">
        <Lightbulb className="w-5 h-5 text-yellow-500" />
        照明数据监测
      </h3>

      {/* 实时数值 */}
      <div className="bg-yellow-50 rounded-xl p-5 mb-4 text-center flex-shrink-0">
        <div className="text-sm text-yellow-600 mb-2">当前照度</div>
        <div className="text-[18px] font-bold text-yellow-700">
          {latestIlluminance ? `${latestIlluminance.illuminance.toFixed(1)} lux` : '--'}
        </div>
      </div>

      {/* 面积图 */}
      <div className="flex-1 min-h-0">
        <CanvasAreaChart
          data={chartData}
          color="#eab308"
          height={180}
        />
      </div>
    </div>
  );
}