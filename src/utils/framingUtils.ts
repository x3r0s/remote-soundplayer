import { Buffer } from 'buffer'
import { AppMessage } from '../protocol/messages'

// =============================================
// TCP Length-Prefix 프레이밍
// 포맷: [4 bytes: payload length (uint32 BE)][N bytes: JSON payload]
// TCP는 스트림 기반이므로 메시지 경계를 명확히 처리해야 함
// =============================================

/**
 * 메시지를 length-prefix 프레임으로 인코딩
 */
export function encodeFrame(message: AppMessage): Buffer {
  const payload = Buffer.from(JSON.stringify(message), 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32BE(payload.length, 0)
  return Buffer.concat([header, payload])
}

/**
 * 임의 객체를 length-prefix 프레임으로 인코딩 (파일 전송 헤더용)
 */
export function encodeRawFrame(data: object): Buffer {
  const payload = Buffer.from(JSON.stringify(data), 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32BE(payload.length, 0)
  return Buffer.concat([header, payload])
}

/**
 * TCP 스트림에서 length-prefix 프레임을 파싱하는 클래스
 * 불완전한 수신 데이터를 내부 버퍼에 누적하여 처리
 */
export class FrameParser {
  private buffer: Buffer = Buffer.alloc(0)

  /**
   * 수신된 TCP 데이터를 처리하고, 완성된 메시지가 있으면 콜백 호출
   */
  feed(data: Buffer | string, onMessage: (msg: AppMessage) => void): void {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as string, 'binary')
    this.buffer = Buffer.concat([this.buffer, chunk])

    while (this.buffer.length >= 4) {
      const payloadLength = this.buffer.readUInt32BE(0)

      // 최대 50MB 방어 (잘못된 데이터 대비)
      if (payloadLength > 50 * 1024 * 1024) {
        console.error('FrameParser: invalid payload length', payloadLength)
        this.buffer = Buffer.alloc(0)
        break
      }

      if (this.buffer.length < 4 + payloadLength) break

      const payload = this.buffer.slice(4, 4 + payloadLength)
      this.buffer = this.buffer.slice(4 + payloadLength)

      try {
        const msg = JSON.parse(payload.toString('utf8')) as AppMessage
        onMessage(msg)
      } catch (e) {
        console.error('FrameParser: failed to parse JSON', e)
      }
    }
  }

  /**
   * 임의 객체를 파싱하는 버전 (파일 전송 헤더용)
   * 헤더 파싱 후 남은 raw 바이너리 데이터도 반환
   */
  feedForHeader(
    data: Buffer | string,
    onHeader: (parsed: object, remainder: Buffer) => void
  ): void {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as string, 'binary')
    this.buffer = Buffer.concat([this.buffer, chunk])

    if (this.buffer.length >= 4) {
      const payloadLength = this.buffer.readUInt32BE(0)
      if (this.buffer.length >= 4 + payloadLength) {
        const payload = this.buffer.slice(4, 4 + payloadLength)
        const remainder = this.buffer.slice(4 + payloadLength)
        this.buffer = Buffer.alloc(0)
        try {
          const parsed = JSON.parse(payload.toString('utf8'))
          onHeader(parsed, remainder)
        } catch (e) {
          console.error('FrameParser: failed to parse header JSON', e)
        }
      }
    }
  }

  reset(): void {
    this.buffer = Buffer.alloc(0)
  }
}
