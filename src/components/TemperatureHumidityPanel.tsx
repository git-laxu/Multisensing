import React, { useEffect, useRef } from 'react';
import { Thermometer } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

interface LineChartProps {
  data: Array<{ time: string; [key: string]: string | number | null }>;
  lines: Array<{ dataKey: string; name: string; color: string }>;
}

function CanvasLineChart({ data, lines }: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 绘图区设置--------------------------------------------------------------------------
    const draw = () => {
      const width = Math.max(container.clientWidth, 320);
      const height = Math.max(container.clientHeight, 180);
      const dpr = window.devicePixelRatio || 1;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;       //绘图区设置相关-------------------------------
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

      const padding = { top: 22, right: 30, bottom: 42, left: 48 };   //绘图区设置相关----------
      const innerWidth = width - padding.left - padding.right;
      const innerHeight = height - padding.top - padding.bottom;

      let minY = Infinity;
      let maxY = -Infinity;

      data.forEach((d) => {
        lines.forEach((line) => {
          const value = d[line.dataKey];
          if (typeof value === 'number') {
            minY = Math.min(minY, value);
            maxY = Math.max(maxY, value);
          }
        });
      });

      if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return;

      const range = Math.max(maxY - minY, 1);
      minY -= range * 0.15;
      maxY += range * 0.15;

      const scaleX = (index: number) =>
        padding.left + (index / Math.max(data.length - 1, 1)) * innerWidth;
      const scaleY = (value: number) =>
        padding.top +
        innerHeight -
        ((value - minY) / Math.max(maxY - minY, 1e-6)) * innerHeight;

      ctx.strokeStyle = '#eef2f7';
      ctx.lineWidth = 1;
      const ticks = 4;

      for (let i = 0; i < ticks; i += 1) {
        const tickValue = minY + (i / (ticks - 1)) * (maxY - minY);
        const y = scaleY(tickValue);

        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(tickValue.toFixed(1), padding.left - 8, y + 3);
      }

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

      lines.forEach((line) => {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();

        let started = false;
        data.forEach((d, index) => {
          const value = d[line.dataKey];
          if (typeof value !== 'number') return;

          const x = scaleX(index);
          const y = scaleY(value);

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      });

      ctx.font = '10px Arial';
      ctx.textAlign = 'left';
      lines.forEach((line, index) => {
        const x = padding.left + index * 110;
        const y = 12;

        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 14, y);
        ctx.stroke();

        ctx.fillStyle = '#6b7280';
        ctx.fillText(line.name, x + 18, y + 4);
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
  }, [data, lines]);

  return (
    // 绘图区 CanvasLineChart 的组件--------------------------------------------------
    // 容器多大，canvas 就多大，因为外层是 h-full w-full，canvas 本身也是 h-full w-full
    <div ref={containerRef} className="h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

export function TemperatureHumidityPanel() {
  const { state } = useApp();
  const { temperatureHumidityData, thermalRadiationData, sensorConfig } = state;

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const combinedData = temperatureHumidityData.map((item, index) => ({
    time: formatTime(item.timestamp),
    airTemp: parseFloat(item.airTemperature.toFixed(1)),
    humidity: parseFloat(item.relativeHumidity.toFixed(1)),
    blackGlobe: thermalRadiationData[index]
      ? parseFloat(thermalRadiationData[index].blackGlobeTemperature.toFixed(1))
      : null,
  }));

  const latestTempHumidity =
    temperatureHumidityData[temperatureHumidityData.length - 1];
  const latestRadiation = thermalRadiationData[thermalRadiationData.length - 1];

  if (!sensorConfig.temperatureHumidity.enabled) return null;

  return (
    // 整个温湿度面板的外壳
    // h-full 表示它要吃满 DataCollectionPage.tsx 分给它的那个网格格子高度；
    // flex flex-col 表示内部所有东西按竖向往下排；
    // p-4 是整个面板的内边距，也就是标题、三块数值卡、图表区离白色卡片边缘的距离；
    // min-h-0 的作用是允许这个 panel 在父容器高度变小时继续收缩，不至于被内部内容反向撑爆
    <div className="h-full rounded-3xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col min-h-0">
      
      {/* mb-4 是标题区和下面三块数值卡之间的间距,把 mb-4 改成 mb-2，标题和数值卡会更贴近;
          gap-2 表示 “温湿度与热辐射监测” 与其前边的 logo 之间的距离 */}
      <div className="mb-4 flex items-center gap-2">

        {/* h-5 w-5 是标题前面温度计图标的大小 */}
        <Thermometer className="h-5 w-5 text-red-500" />

        {/* 标题文字：
            text-[15px] 是标题字号，想让标题更醒目，就把 text-[15px] 改成 text-base 或者 text-[16px]；
            font-semibold 是字重
            本身没有单独“占比”参数，它是内容自适应高度 */}
        <h3 className="text-[15px] font-semibold text-gray-900"> 
          温湿度与热辐射监测
        </h3>
      </div>

      {/* 三块卡片排布：
          grid grid-cols-3 横向排布，一行三列
          gap-3 是三块卡片之间的横向间距
          mb-4 是这整层数值卡和下面图表区之间的间距
          总高度没写死的，而是由每个卡片自己的内边距和文字大小共同撑出来 */}
      <div className="mb-2 grid grid-cols-3 gap-3">

        {/* 控制数值卡结构：
            py-4 是上下内边距，它最直接决定每张卡有多高；
            px-4 影响左右留白，会影响数字看起来松不松，但对高度影响不大 */}
        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-center">
          {/* text-sm 是小标题字号 */}
          <div className="text-sm text-rose-400">空气温度</div>
          {/* text-2xl 是数值字号，把 text-2xl 改成 text-xl，数字会变小，整张卡高度感会稍微减弱；如果改成 text-3xl，数字更大，视觉上会更占空间；
              font-bold 是粗体；
              mt-1 是小标题和大数字之间的垂直间距 */}
          <div className="mt-1 text-2xl font-bold text-rose-500">
            {latestTempHumidity
              ? `${latestTempHumidity.airTemperature.toFixed(1)}°C`
              : '--'}
          </div>
        </div>

        <div className="rounded-2xl bg-blue-50 px-4 py-3 text-center">
          <div className="text-sm text-blue-400">相对湿度</div>
          <div className="mt-1 text-2xl font-bold text-blue-500">
            {latestTempHumidity
              ? `${latestTempHumidity.relativeHumidity.toFixed(1)}%`
              : '--'}
          </div>
        </div>

        <div className="rounded-2xl bg-orange-50 px-4 py-3 text-center">
          <div className="text-sm text-orange-400">黑球温度</div>
          <div className="mt-1 text-2xl font-bold text-orange-500">
            {latestRadiation
              ? `${latestRadiation.blackGlobeTemperature.toFixed(1)}°C`
              : '--'}
          </div>
        </div>
      </div>

      {/* 图表容器：
          flex-1 表示在标题区和三张数值卡区占完高度以后，这个图表容器自动吃掉剩下的所有高度
          min-h-0 也是为了允许它在父容器变小时继续缩小
          p-2 是图表容器自身的内边距，也就是 canvas 离这块白底小卡片边缘的距离 */}
      {/* <div className="flex-1 min-h-0 rounded-2xl border border-gray-100 bg-white p-0"> */}
      <div className="flex-1 min-h-0 rounded-2xl bg-white p-0">
        <CanvasLineChart
          data={combinedData}
          lines={[
            { dataKey: 'airTemp', name: '温度(°C)', color: '#ef4444' },
            { dataKey: 'humidity', name: '湿度(%)', color: '#3b82f6' },
            { dataKey: 'blackGlobe', name: '黑球(°C)', color: '#f97316' },
          ]}
        />
      </div>
    </div>
  );
}