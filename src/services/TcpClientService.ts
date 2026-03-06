import { Buffer } from 'buffer'
import TcpSocket from 'react-native-tcp-socket'
import { AppMessage } from '../protocol/messages'
import { encodeFrame, encodeRawFrame, FrameParser } from '../utils/framingUtils'
import * as FileSystem from 'expo-file-system'

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

    const socket = TcpSocket.createConnection({ host, port }, () => {
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
   * 파일 업로드: 서버의 파일 전송 포트에 별도 TCP 연결을 열어
   * JSON 헤더 + 바이너리 데이터를 전송
   */
  uploadFile(
    host: string,
    port: number,
    fileUri: string,
    fileName: string,
    fileSize: number,
    onProgress?: (sent: number, total: number) => void,
    onComplete?: (success: boolean, error?: string) => void
  ): void {
    console.log(`TcpClient: uploading ${fileName} (${fileSize} bytes) to ${host}:${port}`)

    const uploadSocket = TcpSocket.createConnection(
      { host, port },
      () => {
        console.log('TcpClient: upload connection established')

        // 1) JSON 헤더 전송
        const header = encodeRawFrame({ fileName, fileSize })
        uploadSocket.write(header)

        // 2) 바이너리 데이터를 청크로 분할하여 전송 (OOM 방지)
        // 120KB = 3의 배수(Base64 깨짐 방지)
        const CHUNK_SIZE = 120 * 1024
        let offset = 0

        const sendNextChunk = async () => {
          try {
            while (offset < fileSize) {
              const end = Math.min(offset + CHUNK_SIZE, fileSize)
              const length = end - offset

              const base64Chunk = await FileSystem.readAsStringAsync(fileUri, {
                encoding: 'base64',
                position: offset,
                length: length,
              })
              const chunk = Buffer.from(base64Chunk, 'base64')

              const canContinue = uploadSocket.write(chunk)
              offset = end
              onProgress?.(offset, fileSize)

              if (!canContinue) {
                // 버퍼가 가득 찬 경우 drain 이벤트를 기다림
                uploadSocket.once('drain', sendNextChunk)
                return
              }
            }
            // 모든 데이터 전송 완료
            console.log('TcpClient: file upload data sent')
          } catch (e) {
            console.error('TcpClient: error reading/sending chunk', e)
            uploadSocket.destroy()
            onComplete?.(false, '파일 읽기 오류가 발생했습니다.')
          }
        }

        sendNextChunk()
      }
    )

    uploadSocket.on('close', () => {
      console.log('TcpClient: upload connection closed')
      onComplete?.(true)
    })

    uploadSocket.on('error', (err) => {
      console.error('TcpClient: upload error:', err.message)
      onComplete?.(false, err.message)
    })

    uploadSocket.on('timeout', () => {
      console.error('TcpClient: upload timeout')
      uploadSocket.destroy()
      onComplete?.(false, '업로드 시간 초과')
    })
  }

  /** 연결 해제 */
  disconnect(): void {
    if (this.socket) {
      try {
        this.socket.destroy()
      } catch { }
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
