import { Buffer } from 'buffer'
import TcpSocket from 'react-native-tcp-socket'
import * as FileSystem from 'expo-file-system'
import { AppMessage, TransferHeaderMessage } from '../protocol/messages'
import { encodeFrame, encodeRawFrame, FrameParser } from '../utils/framingUtils'
import { getAudioFilePath, ensureAudioDir } from '../utils/fileStorage'

// =============================================
// TCP 서버 서비스 (서버 모드 - 아이 방 기기)
// 포트 9876: 제어 명령 (JSON)
// 포트 9877: 파일 전송 (binary)
// =============================================

export const CONTROL_PORT = 9876
export const TRANSFER_PORT = 9877

type MessageHandler = (clientId: string, msg: AppMessage) => void
type ClientEvent = (clientId: string) => void
type FileReceivedHandler = (
  fileId: string,
  filePath: string,
  fileName: string,
  fileSize: number
) => void

class TcpServerService {
  private controlServer: TcpSocket.Server | null = null
  private transferServer: TcpSocket.Server | null = null
  private clients: Map<string, TcpSocket.Socket> = new Map()

  /** TCP 서버 시작 */
  start(
    onMessage: MessageHandler,
    onClientConnect: ClientEvent,
    onClientDisconnect: ClientEvent,
    onFileReceived: FileReceivedHandler
  ): void {
    if (this.controlServer) {
      console.warn('TcpServerService: already running')
      return
    }

    this.startControlServer(onMessage, onClientConnect, onClientDisconnect)
    this.startTransferServer(onFileReceived)
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

  private startTransferServer(onFileReceived: FileReceivedHandler): void {
    this.transferServer = TcpSocket.createServer((socket) => {
      this.handleFileReceive(socket, onFileReceived)
    })

    this.transferServer.listen(
      { port: TRANSFER_PORT, host: '0.0.0.0', reuseAddress: true },
      () => console.log(`Transfer server listening on :${TRANSFER_PORT}`)
    )

    this.transferServer.on('error', (err) => {
      console.error('Transfer server error:', err.message)
    })
  }

  /**
   * 파일 수신 처리
   * 프로토콜:
   *   1. length-prefix JSON 헤더: { fileId, fileName, fileSize }
   *   2. raw binary 파일 데이터
   *   3. 소켓 close = EOF
   */
  private handleFileReceive(
    socket: TcpSocket.Socket,
    onFileReceived: FileReceivedHandler
  ): void {
    const chunks: Buffer[] = []
    let headerParsed = false
    let fileId = ''
    let fileName = ''
    let fileSize = 0
    let headerBuffer = Buffer.alloc(0)

    socket.on('data', (data) => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as string, 'binary')

      if (!headerParsed) {
        // 헤더 파싱 (length-prefix JSON)
        headerBuffer = Buffer.concat([headerBuffer, chunk])

        if (headerBuffer.length >= 4) {
          const msgLen = headerBuffer.readUInt32BE(0)
          if (headerBuffer.length >= 4 + msgLen) {
            try {
              const header = JSON.parse(
                headerBuffer.slice(4, 4 + msgLen).toString('utf8')
              ) as TransferHeaderMessage
              fileId = header.fileId
              fileName = header.fileName
              fileSize = header.fileSize
              headerParsed = true

              // 헤더 이후 남은 데이터는 파일 데이터
              const rest = headerBuffer.slice(4 + msgLen)
              if (rest.length > 0) chunks.push(rest)
            } catch (e) {
              console.error('Transfer: failed to parse header', e)
              socket.destroy()
            }
          }
        }
      } else {
        chunks.push(chunk)
      }
    })

    socket.on('close', async () => {
      if (!headerParsed || !fileId) return

      try {
        await ensureAudioDir()
        const filePath = getAudioFilePath(fileId, fileName)

        // 전체 데이터를 한 번에 base64로 인코딩해서 저장
        const allData = Buffer.concat(chunks)
        await FileSystem.writeAsStringAsync(filePath, allData.toString('base64'), {
          encoding: FileSystem.EncodingType.Base64,
        })

        console.log(
          `Transfer: saved "${fileName}" (${allData.length} bytes) → ${filePath}`
        )
        onFileReceived(fileId, filePath, fileName, allData.length)
      } catch (e) {
        console.error('Transfer: failed to save file', e)
      }
    })

    socket.on('error', (err) => {
      console.error('Transfer socket error:', err.message)
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
    this.transferServer?.close()
    this.controlServer = null
    this.transferServer = null
    console.log('TcpServerService: stopped')
  }
}

export const tcpServer = new TcpServerService()
