import Zeroconf from 'react-native-zeroconf'
import { NativeModules } from 'react-native'
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
  // publish와 scan에 별도 인스턴스 사용 (충돌 방지)
  private publishZc: Zeroconf | null = null
  private scanZc: Zeroconf | null = null
  private isPublishing = false
  private isScanning = false

  /** 네이티브 모듈 가용 여부 확인 */
  private isNativeAvailable(): boolean {
    return !!NativeModules.RNZeroconf
  }

  // ---- 서버 모드: 서비스 광고 ----

  /**
   * mDNS 서비스 등록 (서버 모드에서 호출)
   * @param deviceName 기기 이름 (다른 기기에서 보이는 이름)
   */
  publishService(deviceName: string): void {
    if (this.isPublishing) return
    if (!this.isNativeAvailable()) {
      console.warn('mDNS: RNZeroconf native module not available (rebuild required)')
      return
    }
    try {
      if (!this.publishZc) {
        this.publishZc = new Zeroconf()
      }
      this.publishZc.publishService(
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
      if (this.publishZc) {
        this.publishZc.unpublishService(SERVICE_TYPE)
        this.publishZc.removeAllListeners()
        this.publishZc = null // 인스턴스 완전 해제
      }
      this.isPublishing = false
      console.log('mDNS: unpublished service')
    } catch (e) {
      console.error('mDNS unpublish error:', e)
      this.isPublishing = false
      this.publishZc = null
    }
  }

  // ---- 컨트롤러 모드: 기기 스캔 ----

  /**
   * mDNS 스캔 시작 (컨트롤러 모드에서 호출)
   * 실패해도 예외를 던지지 않고 false 반환 → 수동 IP 입력으로 폴백
   * @param onFound 기기 발견 시 콜백
   * @param onRemoved 기기 제거 시 콜백
   * @param localIpToFilter 자기 자신의 IP (필터링용, 선택)
   * @returns 스캔 시작 성공 여부
   */
  startScan(
    onFound: (device: DiscoveredDevice) => void,
    onRemoved: (name: string) => void,
    localIpToFilter?: string
  ): boolean {
    if (!this.isNativeAvailable()) {
      console.warn('mDNS: RNZeroconf native module not available (rebuild required)')
      return false
    }

    try {
      if (this.isScanning) {
        this.stopScan()
      }

      this.scanZc = new Zeroconf()

      this.scanZc.on('resolved', (service: ZeroconfService) => {
        try {
          const address = service.addresses?.[0] ?? service.host
          // 자기 자신 필터링
          if (localIpToFilter && address === localIpToFilter) {
            console.log('mDNS: filtered own device', address)
            return
          }
          const device: DiscoveredDevice = {
            name: service.name,
            host: service.host,
            address,
            port: service.port,
          }
          console.log('mDNS: found device', device.name, device.address)
          onFound(device)
        } catch (e) {
          console.error('mDNS: error in resolved handler', e)
        }
      })

      this.scanZc.on('remove', (name: string) => {
        try {
          console.log('mDNS: removed device', name)
          onRemoved(name)
        } catch (e) {
          console.error('mDNS: error in remove handler', e)
        }
      })

      this.scanZc.on('error', (err: unknown) => {
        console.error('mDNS scan error:', err)
      })

      // DNSSD 모드로 스캔 (NSD보다 Android 호환성 좋음)
      this.scanZc.scan(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN)
      this.isScanning = true
      console.log('mDNS: scan started')
      return true
    } catch (e) {
      console.error('mDNS: startScan failed (native module error?):', e)
      this.isScanning = false
      this.scanZc = null
      return false
    }
  }

  /** mDNS 스캔 중지 */
  stopScan(): void {
    if (!this.isScanning) return
    try {
      if (this.scanZc) {
        this.scanZc.stop()
        this.scanZc.removeAllListeners()
        this.scanZc = null // 인스턴스 완전 해제
      }
      this.isScanning = false
      console.log('mDNS: scan stopped')
    } catch (e) {
      console.error('mDNS stop error:', e)
      this.isScanning = false
      this.scanZc = null
    }
  }

  /** 완전 정리 */
  destroy(): void {
    try {
      this.unpublishService()
      this.stopScan()
    } catch (e) {
      console.error('mDNS destroy error:', e)
    }
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
