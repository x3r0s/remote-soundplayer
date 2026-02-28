import { Buffer } from 'buffer'
import TcpSocket from 'react-native-tcp-socket'
import { AppMessage } from '../protocol/messages'
import { encodeFrame, FrameParser } from '../utils/framingUtils'

// =============================================
// TCP 클라이언트 서비스 (컨트롤러 모드)
// =============================================

type MessageHandler = (msg: AppMessage) => void
type StatusHandler = (status: 'connected' | 'disconnected' | 'error', error?: string) => void

class TcpClientService {
  private socket: TcpSocket.Socket | null = null
  private parser = new FrameParser()
  private isConnected = false
  private messageHandler: MessageHandler | null = null
  private statusHandler: StatusHandler | null = null

  /** 메시지 핸들러 교체 (화면 전환 후 재등록용) */
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler
  }

  /** 서버에 연결 */
  connect(
    host: string,
    port: number,
    onMessage: MessageHandler,
    onStatus: StatusHandler
  ): void {
    if (this.socket) {
      this.disconnect()
    }

    this.parser.reset()
    this.messageHandler = onMessage
    this.statusHandler = onStatus

    const socket = TcpSocket.createConnection({ host, port, timeout: 10000 }, () => {
      this.isConnected = true
      console.log(`TcpClient: connected to ${host}:${port}`)
      this.statusHandler?.('connected')
    })

    socket.on('data', (data) => {
      this.parser.feed(data as Buffer, (msg) => this.messageHandler?.(msg))
    })

    socket.on('close', () => {
      this.isConnected = false
      this.socket = null
      console.log('TcpClient: disconnected')
      this.statusHandler?.('disconnected')
    })

    socket.on('error', (err) => {
      this.isConnected = false
      console.error('TcpClient error:', err.message)
      this.statusHandler?.('error', err.message)
    })

    socket.on('timeout', () => {
      console.error('TcpClient: connection timeout')
      socket.destroy()
      this.statusHandler?.('error', '연결 시간 초과')
    })

    this.socket = socket
  }

  /** 제어 메시지 전송 */
  send(message: AppMessage): boolean {
    if (!this.socket || !this.isConnected) {
      console.warn('TcpClient: not connected')
      return false
    }
    try {
      this.socket.write(encodeFrame(message))
      return true
    } catch (e) {
      console.error('TcpClient.send error:', e)
      return false
    }
  }

  /** 연결 해제 */
  disconnect(): void {
    if (this.socket) {
      try {
        this.socket.destroy()
      } catch {}
      this.socket = null
    }
    this.isConnected = false
    this.parser.reset()
    console.log('TcpClient: disconnected (manual)')
  }

  get connected(): boolean {
    return this.isConnected
  }
}

export const tcpClient = new TcpClientService()
