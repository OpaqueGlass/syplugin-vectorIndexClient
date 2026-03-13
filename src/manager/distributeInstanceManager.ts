import { debugPush, logPush, warnPush } from "@/logger";

enum MessageType {
  PRESENCE = "PRESENCE",     // 存在证明（心跳）
  INDEX_TASK = "INDEX_TASK", // 索引任务
  LEAVE = "LEAVE",           // 主动离开通知
  DIRECT_MSG = "DIRECT_MSG"  // 点对点消息
}

interface WSMessage {
  type: MessageType;
  senderId: string;
  to?: string;        // 目标节点 ID (空则为广播)
  msgId?: string;     // 消息唯一标识，用于回复匹配
  isLeader: boolean;
  timestamp: number;
  data?: any;
}

type RoleChangeCallback = (isLeader: boolean) => void;

export class DistributedLeaderClient {
  private ws: WebSocket | null = null;
  private readonly id: string;
  private isLeader: boolean = false;
  private lastLeaderHeartbeat: number = Date.now();
  private intervals: any[] = [];
  private knownNodes: Set<string> = new Set();
  // 配置(单位ms)
  // CHECK_TICK < HEARTBEAT_INTERVAL <= LEADER_EXPIRY
  private readonly LEADER_EXPIRY = 45_000;
  private readonly HEARTBEAT_INTERVAL = 30_000;
  private readonly CHECK_TICK = 1_000;

  constructor(
    private url: string,
    private onRoleChange: RoleChangeCallback
  ) {
    this.id = `client_${Math.random().toString(36).substring(2, 7)}`;
    this.initWebSocket();
    this.setupTerminationHandler();
  }

  private setupTerminationHandler(): void {
    window.addEventListener('beforeunload', () => {
      this.sendLeaveNotification();
    });
  }

  private initWebSocket(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      logPush(`[${this.id}] 已连接`);
      this.startLoop();
      // 上线时立即广播一次，告知大家有新节点加入
      this.sendPresence();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) { /* 忽略非法格式 */ }
    };

    this.ws.onclose = () => {
      this.stopLoop();
      logPush("连接断开，3秒后重连");
      setTimeout(() => this.initWebSocket(), 3000);
    };
  }

  private startLoop(): void {
    this.stopLoop();
    this.intervals.push(setInterval(() => this.sendPresence(), this.HEARTBEAT_INTERVAL));
    this.intervals.push(setInterval(() => this.monitorLeader(), this.CHECK_TICK));
  }

  private stopLoop(): void {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
  }

  private sendPresence(): void {
    this.sendMessage(MessageType.PRESENCE);
  }

  /**
   * 主动发送离开消息
   */
  public sendLeaveNotification(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload = this.createMessage(MessageType.LEAVE);
      this.ws.send(JSON.stringify(payload));
      this.ws.close();
      this.stopLoop();
    }
  }

  private monitorLeader(): void {
    const now = Date.now();
    if (!this.isLeader && (now - this.lastLeaderHeartbeat > this.LEADER_EXPIRY)) {
      logPush("检测到 Leader 失效，发起竞选...");
      this.promoteToLeader();
    }
  }

  private handleMessage(msg: WSMessage): void {
    if (msg.senderId === this.id) return;

    switch (msg.type) {
      case MessageType.PRESENCE:
        this.handlePresence(msg);
        break;
      case MessageType.LEAVE:
        this.handleLeave(msg);
        break;
      case MessageType.DIRECT_MSG:
        this.handleDirectMessage(msg);
        break;
    }
  }

  private handlePresence(msg: WSMessage): void {
    if (this.isLeader && !this.knownNodes.has(msg.senderId)) {
        logPush(`发现新节点 [${msg.senderId}] 加入，Leader 主动推送身份确认`);
        this.sendPresence();
    }
    this.knownNodes.add(msg.senderId);

    if (msg.isLeader) {
      if (this.isLeader && this.id > msg.senderId) {
        logPush(`发现更高优先级 Leader [${msg.senderId}]，主动降级`);
        this.demoteToFollower();
      }
      this.lastLeaderHeartbeat = Date.now();
    }
  }

  /**
   * 收到其他节点离开的通知
   */
  private handleLeave(msg: WSMessage): void {
    this.knownNodes.delete(msg.senderId);
    if (msg.isLeader) {
      logPush(`Leader [${msg.senderId}] 已离开，立即触发重新选举`);
      this.lastLeaderHeartbeat = 0;
      this.monitorLeader();
    }
  }

  /**
   * 角色变更触发器
   */
  private promoteToLeader(): void {
    if (!this.isLeader) {
      this.isLeader = true;
      logPush(`%c [${this.id}] 升级为 Leader`, "background: #222; color: #bada55");
      this.onRoleChange(true);
      this.sendPresence();
    }
  }

  private demoteToFollower(): void {
    if (this.isLeader) {
      this.isLeader = false;
      logPush(`[${this.id}] 降级为 Follower`);
      this.onRoleChange(false);
    }
    this.lastLeaderHeartbeat = Date.now();
  }

  /**
   * 消息发送接口
   */
  public sendDirectMessage(toId: string, data: any, correlationId?: string): string {
    const msgId = correlationId || `msg_${Math.random().toString(36).slice(2, 9)}`;
    const payload: WSMessage = {
      ...this.createMessage(MessageType.DIRECT_MSG),
      to: toId,
      msgId: msgId,
      data: data
    };
    this.ws?.send(JSON.stringify(payload));
    return msgId;
  }

  private handleDirectMessage(msg: WSMessage): void {
    if (msg.to && msg.to !== this.id) return; // 不是发给我的，忽略
    logPush(`收到来自 [${msg.senderId}] 的消息 (ID: ${msg.msgId}):`, msg.data);
    // TODO: 消息回调？
  }

  private createMessage(type: MessageType): WSMessage {
    return {
      type,
      senderId: this.id,
      isLeader: this.isLeader,
      timestamp: Date.now()
    };
  }

  private sendMessage(type: MessageType, data?: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...this.createMessage(type), data }));
    }
  }
}