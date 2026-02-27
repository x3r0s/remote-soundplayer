import Zeroconf from 'react-native-zeroconf'
import { DiscoveredDevice } from '../stores/controllerStore'

// =============================================
// mDNS 서비스 탐색 및 광고
// react-native-zeroconf 사용
// Android: CHANGE_WIFI_MULTICAST_STATE 권한 필요
// =============================================

const SERVICE_TYPE = 'soundplayer'
const SERVICE_PROTOCOL = 'tcp'
const SERVICE_DOMAIN = 'local.'
const CONTROL_PORT = 9876

class MdnsService {
  private zeroconf: Zeroconf | null = null
  private isPublishing = false
  private isScanning = false

  private getZeroconf(): Zeroconf {
    if (!this.zeroconf) {
      this.zeroconf = new Zeroconf()
    }
    return this.zeroconf
  }

  // ---- 서버 모드: 서비스 광고 ----

  /**
   * mDNS 서비스 등록 (서버 모드에서 호출)
   * @param deviceName 기기 이름 (다른 기기에서 보이는 이름)
   */
  publishService(deviceName: string): void {
    if (this.isPublishing) return
    try {
      const zc = this.getZeroconf()
      zc.publishService(
        SERVICE_TYPE,
        SERVICE_PROTOCOL,
        SERVICE_DOMAIN,
        deviceName,
        CONTROL_PORT,
        { version: '1' }
      )
      this.isPublishing = true
      console.log('mDNS: published service as', deviceName)
    } catch (e) {
      console.error('mDNS publish error:', e)
    }
  }

  /** mDNS 서비스 등록 해제 */
  unpublishService(): void {
    if (!this.isPublishing) return
    try {
      const zc = this.getZeroconf()
      zc.unpublishService(SERVICE_TYPE)
      this.isPublishing = false
      console.log('mDNS: unpublished service')
    } catch (e) {
      console.error('mDNS unpublish error:', e)
    }
  }

  // ---- 컨트롤러 모드: 기기 스캔 ----

  /**
   * mDNS 스캔 시작 (컨트롤러 모드에서 호출)
   * @param onFound 기기 발견 시 콜백
   * @param onRemoved 기기 제거 시 콜백
   */
  startScan(
    onFound: (device: DiscoveredDevice) => void,
    onRemoved: (name: string) => void
  ): void {
    if (this.isScanning) {
      this.stopScan()
    }

    const zc = this.getZeroconf()

    // 이전 리스너 제거
    zc.removeAllListeners()

    zc.on('resolved', (service: ZeroconfService) => {
      // service: { name, host, port, addresses: string[], txt }
      const address = service.addresses?.[0] ?? service.host
      const device: DiscoveredDevice = {
        name: service.name,
        host: service.host,
        address,
        port: service.port,
      }
      console.log('mDNS: found device', device.name, device.address)
      onFound(device)
    })

    zc.on('remove', (name: string) => {
      console.log('mDNS: removed device', name)
      onRemoved(name)
    })

    zc.on('error', (err: unknown) => {
      console.error('mDNS scan error:', err)
    })

    try {
      // DNSSD 모드로 스캔 (NSD보다 Android 호환성 좋음)
      zc.scan(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN)
      this.isScanning = true
      console.log('mDNS: scan started')
    } catch (e) {
      console.error('mDNS scan start error:', e)
    }
  }

  /** mDNS 스캔 중지 */
  stopScan(): void {
    if (!this.isScanning) return
    try {
      const zc = this.getZeroconf()
      zc.stop()
      zc.removeAllListeners()
      this.isScanning = false
      console.log('mDNS: scan stopped')
    } catch (e) {
      console.error('mDNS stop error:', e)
    }
  }

  /** 완전 정리 */
  destroy(): void {
    this.unpublishService()
    this.stopScan()
    this.zeroconf = null
  }
}

// react-native-zeroconf 내부 타입
interface ZeroconfService {
  name: string
  host: string
  port: number
  addresses: string[]
  txt?: Record<string, string>
}

export const mdnsService = new MdnsService()
