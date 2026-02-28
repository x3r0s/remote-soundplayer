import { Buffer } from 'buffer'
import TcpSocket from 'react-native-tcp-socket'
import { AppMessage } from '../protocol/messages'
import { encodeFrame, FrameParser } from '../utils/framingUtils'

// =============================================
// TCP 서버 서비스 (서버 모드 - 아이 방 기기)
// 포트 9876: 제어 명령 (JSON)
// =============================================

export const CONTROL_PORT = 9876

type MessageHandler = (clientId: string, msg: AppMessage) => void
type ClientEvent = (clientId: string) => void

class TcpServerService {
  private controlServer: TcpSocket.Server | null = null
  private clients: Map<string, TcpSocket.Socket> = new Map()

  /** TCP 서버 시작 */
  start(
    onMessage: MessageHandler,
    onClientConnect: ClientEvent,
    onClientDisconnect: ClientEvent
  ): void {
    if (this.controlServer) {
      console.warn('TcpServerService: already running')
      return
    }

    this.startControlServer(onMessage, onClientConnect, onClientDisconnect)
  }

  private startControlServer(
    onMessage: MessageHandler,
    onClientConnect: ClientEvent,
    onClientDisconnect: ClientEvent
  ): void {
    this.controlServer = TcpSocket.createServer((socket) => {
      const clientId = `${socket.remoteAddress}:${socket.remotePort}`
      this.clients.set(clientId, socket)
      onClientConnect(clientId)

      const parser = new FrameParser()

      socket.on('data', (data) => {
        parser.feed(data as Buffer, (msg) => onMessage(clientId, msg))
      })

      socket.on('close', () => {
        this.clients.delete(clientId)
        onClientDisconnect(clientId)
      })

      socket.on('error', (err) => {
        console.error(`Control socket error [${clientId}]:`, err.message)
      })
    })

    this.controlServer.listen(
      { port: CONTROL_PORT, host: '0.0.0.0', reuseAddress: true },
      () => console.log(`Control server listening on :${CONTROL_PORT}`)
    )

    this.controlServer.on('error', (err) => {
      console.error('Control server error:', err.message)
    })
  }

  /** 특정 클라이언트에게 메시지 전송 */
  sendTo(clientId: string, message: AppMessage): void {
    const socket = this.clients.get(clientId)
    if (!socket) return
    try {
      socket.write(encodeFrame(message))
    } catch (e) {
      console.error(`sendTo [${clientId}] error:`, e)
    }
  }

  /** 연결된 모든 클라이언트에게 메시지 브로드캐스트 */
  broadcast(message: AppMessage): void {
    const frame = encodeFrame(message)
    this.clients.forEach((socket, clientId) => {
      try {
        socket.write(frame)
      } catch (e) {
        console.error(`broadcast to [${clientId}] error:`, e)
      }
    })
  }

  /** 연결된 클라이언트 수 */
  get connectedCount(): number {
    return this.clients.size
  }

  /** 서버 중지 */
  stop(): void {
    this.clients.forEach((socket) => {
      try {
        socket.destroy()
      } catch {}
    })
    this.clients.clear()

    this.controlServer?.close()
    this.controlServer = null
    console.log('TcpServerService: stopped')
  }
}

export const tcpServer = new TcpServerService()
