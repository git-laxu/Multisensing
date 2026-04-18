import React, { useEffect, useRef } from 'react';
import { Lightbulb } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

interface AreaChartProps {
  data: Array<{ time: string; value: number }>;
  color: string;
}

function CanvasAreaChart({ data, color }: AreaChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = Math.max(container.clientWidth, 320);
      const height = Math.max(container.clientHeight, 170);
      const dpr = window.devicePixelRatio || 1;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      if (data.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('暂无数据', width / 2, height / 2);
        return;
      }

      const padding = { top: 0, right: 30, bottom: 40, left: 24 };  //------------------------
      const innerWidth = width - padding.left - padding.right;
      const innerHeight = height - padding.top - padding.bottom;

      const values = data.map((d) => d.value);
      const minY = Math.min(...values) * 0.9;
      const maxY = Math.max(...values) * 1.1;

      const scaleX = (index: number) =>
        padding.left + (index / Math.max(data.length - 1, 1)) * innerWidth;
      const scaleY = (value: number) =>
        padding.top +
        innerHeight -
        ((value - minY) / Math.max(maxY - minY, 1e-6)) * innerHeight;

      const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      gradient.addColorStop(0, `${color}55`);
      gradient.addColorStop(1, `${color}00`);

      ctx.beginPath();
      data.forEach((d, i) => {
        const x = scaleX(i);
        const y = scaleY(d.value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(scaleX(data.length - 1), height - padding.bottom);
      ctx.lineTo(padding.left, height - padding.bottom);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = scaleX(i);
        const y = scaleY(d.value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.strokeStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(padding.left, height - padding.bottom);
      ctx.lineTo(width - padding.right, height - padding.bottom);
      ctx.stroke();

      const xLabelStep = Math.max(Math.ceil(data.length / 4), 1);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';

      data.forEach((item, index) => {
        if (index % xLabelStep !== 0 && index !== data.length - 1) return;
        ctx.fillText(
          String(item.time).slice(-5),
          scaleX(index),
          height - padding.bottom + 16
        );
      });
    };

    draw();

    const observer = new ResizeObserver(draw);
    observer.observe(container);
    window.addEventListener('resize', draw);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [data, color]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

export function IlluminancePanel() {
  const { state } = useApp();
  const { illuminanceData, sensorConfig } = state;

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const chartData = illuminanceData.map((item) => ({
    time: formatTime(item.timestamp),
    value: parseFloat(item.illuminance.toFixed(1)),
  }));

  const latestIlluminance = illuminanceData[illuminanceData.length - 1];

  if (!sensorConfig.spectrometer.enabled) return null;

  return (
    <div className="h-full rounded-3xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col min-h-0">
      <div className="mb-4 flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-yellow-500" />
        <h3 className="text-[15px] font-semibold text-gray-900">照明数据监测</h3>
      </div>
      
      <div className="mb-0 rounded-2xl bg-yellow-50 px-20 py-0 text-center">
        <div className="mb-0 grid grid-cols-2 px-12 gap-0">
          <div className="mb-2 rounded-2xl bg-yellow-50 px-4 py-3 text-center">
            <div className="text-sm text-yellow-600">当前照度</div>
            <div className="mt-1 text-2xl font-bold text-yellow-700">
              {latestIlluminance
                ? `${latestIlluminance.illuminance.toFixed(1)} lux`
                : '--'}
            </div>
          </div>
            <div className="mb-2 rounded-2xl bg-yellow-50 px-4 py-3 text-center">
              <div className="text-sm text-yellow-600">当前色温</div>
              <div className="mt-1 text-2xl font-bold text-yellow-700">
                {latestIlluminance
                  ? `${latestIlluminance.illuminance.toFixed(1)} K`
                  : '--'}
              </div>
            </div>
          </div> 
        </div>   

      {/* <div className="flex-1 min-h-0 rounded-2xl border border-gray-100 bg-white p-2"> */}
      <div className="flex-1 min-h-0 rounded-2xl bg-white p-2">
        <CanvasAreaChart data={chartData} color="#eab308" />
      </div>
    </div>
  );
}