import { Buffer } from 'buffer'
import TcpSocket from 'react-native-tcp-socket'
import * as FileSystem from 'expo-file-system'
import { AppMessage } from '../protocol/messages'
import { encodeFrame, encodeRawFrame, FrameParser } from '../utils/framingUtils'
import { TRANSFER_PORT } from './TcpServerService'

// =============================================
// TCP 클라이언트 서비스 (컨트롤러 모드)
// =============================================

type MessageHandler = (msg: AppMessage) => void
type StatusHandler = (status: 'connected' | 'disconnected' | 'error', error?: string) => void

const CHUNK_SIZE = 65536 // 64KB

class TcpClientService {
  private socket: TcpSocket.Socket | null = null
  private parser = new FrameParser()
  private host = ''
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

    this.host = host
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

  /**
   * 파일 전송 (포트 9877)
   * @param fileUri 로컬 파일 URI (content:// 아닌 file://)
   * @param fileId 고유 파일 ID
   * @param fileName 파일명
   * @param onProgress 진행률 콜백 (0~1)
   */
  async sendFile(
    fileUri: string,
    fileId: string,
    fileName: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (!this.host) throw new Error('Not connected')

    // 파일 크기 확인
    const info = await FileSystem.getInfoAsync(fileUri, { size: true })
    if (!info.exists) throw new Error('File not found')
    const fileSize = (info as FileSystem.FileInfo & { size: number }).size ?? 0

    return new Promise((resolve, reject) => {
      const transferSocket = TcpSocket.createConnection(
        { host: this.host, port: TRANSFER_PORT, timeout: 30000 },
        async () => {
          try {
            // 1. 헤더 전송
            const header = encodeRawFrame({ fileId, fileName, fileSize })
            transferSocket.write(header)

            // 2. 파일 청크 전송
            let offset = 0
            while (offset < fileSize) {
              const readSize = Math.min(CHUNK_SIZE, fileSize - offset)
              const base64 = await FileSystem.readAsStringAsync(fileUri, {
                encoding: FileSystem.EncodingType.Base64,
                position: offset,
                length: readSize,
              })
              const chunk = Buffer.from(base64, 'base64')
              transferSocket.write(chunk)
              offset += readSize
              onProgress?.(offset / fileSize)
            }

            // 3. 연결 종료 = EOF 신호
            transferSocket.destroy()
          } catch (e) {
            transferSocket.destroy()
            reject(e)
          }
        }
      )

      transferSocket.on('close', () => resolve())
      transferSocket.on('error', (err) => {
        console.error('Transfer socket error:', err.message)
        reject(err)
      })
      transferSocket.on('timeout', () => {
        transferSocket.destroy()
        reject(new Error('파일 전송 시간 초과'))
      })
    })
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
