---
AIGC:
    ContentProducer: Minimax Agent AI
    ContentPropagator: Minimax Agent AI
    Label: AIGC
    ProduceID: "00000000000000000000000000000000"
    PropagateID: "00000000000000000000000000000000"
    ReservedCode1: 3045022051dd28ea7e08efb4ff898ef1c7afe21f973b71277405fe6b18838e7ef76b940e022100db7e75b820f7923e7df4cf9b79af3b9a80b0680085206ebdba4eaac243671a12
    ReservedCode2: 3045022100847011594a76b83d0ece5c70873a87a5a05330a8d6275354473484ed5672b2bb022037e60f16c11a690c038fa5c454105b339ebf99e0e3eaa1d56c546cd6804c68db
---

# 多传感器数据采集系统 - 后端服务

## 目录结构

```
backend/
├── main.py              # 统一后端服务入口
├── requirements.txt     # Python依赖
├── csi_service/
│   └── main.py          # CSI采集服务
└── cam_service/
    └── main.py          # 视频采集服务
```

## 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

## 启动后端服务

### 方式一：启动统一服务（推荐）

```bash
cd backend
python main.py
```

这将启动一个统一的后端服务，监听以下端口：
- HTTP API: http://localhost:8000
- CSI WebSocket: ws://localhost:8000/api/csi/ws
- 视频 WebSocket: ws://localhost:8000/api/camera/ws

### 方式二：分别启动CSI和视频服务

```bash
# 终端1：启动CSI服务
cd backend
python -m csi_service.main

# 终端2：启动视频服务
cd backend
python -m cam_service.main
```

## API接口

### 状态查询

```bash
# 获取所有服务状态
curl http://localhost:8000/api/status

# 获取CSI服务状态
curl http://localhost:8000/api/csi/status

# 获取视频服务状态
curl http://localhost:8000/api/camera/status
```

### 启动/停止

```bash
# 启动CSI采集
curl -X POST http://localhost:8000/api/csi/start

# 停止CSI采集
curl -X POST http://localhost:8000/api/csi/stop

# 启动视频采集
curl -X POST http://localhost:8000/api/camera/start

# 停止视频采集
curl -X POST http://localhost:8000/api/camera/stop
```

### WebSocket连接

```javascript
// CSI WebSocket
const csiWs = new WebSocket('ws://localhost:8000/api/csi/ws');
csiWs.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'csi_data') {
    console.log('CSI amplitude:', data.amplitude);
  }
};

// 视频 WebSocket
const camWs = new WebSocket('ws://localhost:8000/api/camera/ws');
camWs.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'video_frame') {
    console.log('Frame:', data.frame);
  }
};
```

## 替换为真实模块

当前后端使用模拟模块来演示功能。要使用真实传感器，请按以下步骤替换：

1. 将您的 `csi_receiver.py`、`csi_preprocessor.py`、`csi_fragment_slicer.py`、`csi_image.py` 文件放入 `csi_service/` 目录
2. 将您的 `capture_worker.py`、`tracking_worker.py`、`person_frame_extractor.py`、`classification.py` 文件放入 `cam_service/` 目录
3. 修改 `main.py` 中的导入语句，使用真实模块替代模拟模块

## 注意事项

1. CSI服务需要在Linux系统上运行（需要WiFi网卡支持）
2. 视频服务需要摄像头设备和相应的Python环境
3. 确保防火墙允许相关端口的访问
