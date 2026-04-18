import React, { useEffect, useMemo, useRef } from 'react';
import { Wifi } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCSIWebSocket } from '../hooks/useWebSocket';

function drawCSIChart(
  canvas: HTMLCanvasElement,
  amplitude: number[],
  subcarrierIndex: number[],
  channel?: number  // 新增最大子载波显示函数 --------------------------------------------------
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const parent = canvas.parentElement;
  if (!parent) return;

  const width = Math.max(parent.clientWidth, 320);   //---------------------------------
  const height = Math.max(parent.clientHeight, 180);
  const dpr = window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;   //-------------------------------------------------
  canvas.style.height = `${height}px`;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  if (!amplitude.length) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('等待CSI数据...', width / 2, height / 2);
    return;
  }

  // 显示最大子载波编号
  // const maxAmp = Math.max(...amplitude);
  // const maxAmpIdx = amplitude.findIndex(v => v === maxAmp);
  // const maxSubcarrier = subcarrierIndex[maxAmpIdx] ?? '-';

  // ctx.fillStyle = '#94a3b8';
  // ctx.font = '12px Arial';
  // ctx.textAlign = 'left';
  // ctx.fillText(`当前最大子载波：${maxSubcarrier}`, 20, height - 30);
  const channelLabel = channel ?? '-';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`当前最大子载波：${channelLabel}`, 20, height - 30);
  
  // 振幅图显示区域设置
  const padding = { top: 22, right: 0, bottom: 36, left: 0};  // ----------------------------
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const minX = Math.min(...subcarrierIndex);
  const maxX = Math.max(...subcarrierIndex);
  const minY = Math.min(...amplitude);
  const maxY = Math.max(...amplitude);

  const scaleX = (x: number) =>
    padding.left + ((x - minX) / Math.max(maxX - minX, 1e-6)) * innerWidth;
  const scaleY = (y: number) =>
    padding.top +
    innerHeight -
    ((y - minY) / Math.max(maxY - minY, 1e-6)) * innerHeight;

  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;

  const gridCount = 4;
  for (let i = 0; i < gridCount; i += 1) {
    const y = padding.top + (i / (gridCount - 1)) * innerHeight;
    ctx.strokeStyle = '#243041';
    // ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 2;
  ctx.beginPath();

  amplitude.forEach((value, index) => {
    const x = scaleX(subcarrierIndex[index]);
    const y = scaleY(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  // ctx.fillStyle = '#94a3b8';
  // ctx.font = '10px Arial';
  // ctx.textAlign = 'center';
  // ctx.fillText(`${minX}`, padding.left, height - 8);
  // ctx.fillText(`${maxX}`, width - padding.right, height - 8);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px Arial';

  const xTickCount = 5;
  for (let i = 0; i < xTickCount; i += 1) {
    const ratio = i / (xTickCount - 1);
    const value = Math.round(minX + ratio * (maxX - minX));
    const x = padding.left + ratio * innerWidth;

    if (i === 0) {
      ctx.textAlign = 'left';
      ctx.fillText(`${value}`, 6, height - 2);
    } else if (i === xTickCount - 1) {
      ctx.textAlign = 'right';
      ctx.fillText(`${value}`, width - 6, height - 2);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(`${value}`, x, height - 2);
    }
  }
}

export function CSIPanel() {
  const { state } = useApp();
  // const { csiData, sensorStatus } = state;
  const enabled = state.sensorConfig.wifiCSI.enabled;
  const { lastData, connected } = useCSIWebSocket(enabled);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);

  // const stats = useMemo(() => {
  //   if (!csiData?.amplitude?.length) return null;
  //   const values = csiData.amplitude;
  //   const sum = values.reduce((acc, value) => acc + value, 0);
  //   return {
  //     avg: sum / values.length,
  //     max: Math.max(...values),
  //     min: Math.min(...values),
  //     count: values.length,
  //   };
  // }, [csiData]);
  const stats = useMemo(() => {
    if (!lastData?.amplitude?.length) return null;
    const values = lastData.amplitude;
    const sum = values.reduce((acc, value) => acc + value, 0);
    return {
      avg: sum / values.length,
      max: Math.max(...values),
      min: Math.min(...values),
      count: values.length,
    };
  }, [lastData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = chartWrapRef.current;
    if (!canvas || !wrap) return;

    // const render = () => {
    //   drawCSIChart(
    //     canvas,
    //     csiData?.amplitude ?? [],
    //     csiData?.subcarrierIndex ??
    //       (csiData?.amplitude ?? []).map(
    //         (_, i) => i - Math.floor((csiData?.amplitude?.length ?? 0) / 2)
    //       ),
    //     csiData?.channel   // 新增最大子载波编号 ----------------------------------------------------------
    //   );
    // };
    const render = () => {
      const xAxis = (lastData?.amplitude ?? []).map((_, i) => i + 1);
      drawCSIChart(
        canvas,
        lastData?.amplitude ?? [],
        // (lastData?.amplitude ?? []).map(
        //   (_, i) => i - Math.floor((lastData?.amplitude?.length ?? 0) / 2)
        // ),
       xAxis,   // 如果长度是 4000，横坐标就会是 1 ~ 4000，不再是 -2000 ~ 1999
        lastData?.channel
      );
    };

    render();

    const observer = new ResizeObserver(render);
    observer.observe(wrap);
    window.addEventListener('resize', render);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', render);
    };
  // }, [csiData]);
  }, [lastData]);

  // const connected = sensorStatus.wifiCSI === 'connected';
  // const hasData = Boolean(csiData?.amplitude?.length);
  const hasData = Boolean(lastData?.amplitude?.length);

  return (
    // 面板最外层：
    // h-full 表示这张卡片吃满 DataCollectionPage.tsx 分给它的那个网格格子高度；
    // p-4 是卡片内部四周留白；
    // flex flex-col 表示里面所有内容按“从上到下”纵向排布；
    // min-h-0 的作用是允许这张卡片在父容器缩小时继续收缩，不至于被内部内容反撑开。
    <div className="h-full rounded-3xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col min-h-0">
      
      {/* 标题栏：
          mb-4 是标题栏和下面图表主体之间的竖向间距。你把它改小，比如改成 mb-2，标题和下面黑底图会更靠近 */}
      <div className="mb-4 flex items-center justify-between">
        {/* 标题左边：
            h-5 w-5 是 WiFi 图标大小；
            gap-2 是图标和标题文字的间距；
            text-[15px] 是标题字号；
            font-semibold 是字重 */}
        <div className="flex items-center gap-2">
          <Wifi className="h-5 w-5 text-cyan-500" />
          <h3 className="text-[15px] font-semibold text-gray-900">CSI可视化</h3>
        </div>

        {/* 标题右边连接状态：
            text-sm 是“已连接/未连接”的字号；
            gap-2 是状态点和文字间距；
            h-2.5 w-2.5 是小圆点大小 */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? 'bg-emerald-500' : 'bg-gray-400'
            }`}
          />
          {connected ? '已连接' : '未连接'}
        </div>
      </div>

      {/* <div className="mb-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-500"> */}
        {/* {hasData ? 'CSI 数据已接收' : '等待CSI数据...'} */}
      {/* </div> */}

      {/* 整个“图表区 + 下方三个统计卡”的总容器：
          flex-1 表示它吃掉标题栏以下的剩余高度；
          flex flex-col 表示里面是上下排;
          gap-3 表示黑底图和下面三张统计卡之间的竖向间距 */}
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        
        {/* “振幅图显示区”：
            flex-1 表示黑底图吃掉下方卡片的剩余高度，即优先卡片，黑底 ＝ 面板高度 － 下方卡片高度；
            bg-slate-950 是黑色背景;
            rounded-2xl 是黑底区域圆角;
            p-0 说明黑底图容器自己没有内边距，canvas 直接贴边放进去；
            canvas className="block h-full w-full rounded-xl" 表面上意思是“canvas 跟着父容器一样大”，
              但这只是 CSS 层的意图，前面在 drawCSIChart() 里又手动改了 canvas 的 style 宽高，
              所以最终还是以后面的 JS 计算为准。 */}
        <div
          ref={chartWrapRef}
          className="min-h-0 flex-1 rounded-2xl bg-slate-950 p-0"
        >
          <canvas ref={canvasRef} className="block h-full w-full rounded-xl" />
        </div>

        {/* 统计值卡片：
            gap-2 控制三张卡之间的横向间隔 */}
        {hasData && stats && (
          <div className="grid grid-cols-3 gap-2">

            {/* p-2 是卡片内边距，直接决定卡片高度；
                text-xs 是上面小标题字号；
                text-lg 是下面数值字号；
                mt-1 是标题和数值之间的垂直间隔 */}
            <div className="rounded-xl bg-gray-50 p-2 text-center">
              <div className="text-xs text-gray-500">平均振幅</div>
              <div className="mt-1 text-lg font-bold text-cyan-600">
                {stats.avg.toFixed(1)}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 p-2 text-center">
              <div className="text-xs text-gray-500">最大振幅</div>
              <div className="mt-1 text-lg font-bold text-emerald-600">
                {stats.max.toFixed(1)}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 p-2 text-center">
              <div className="text-xs text-gray-500">最小振幅</div>
              <div className="mt-1 text-lg font-bold text-orange-500">
                {stats.min.toFixed(1)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
