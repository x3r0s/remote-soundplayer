declare module 'react-native-zeroconf' {
    import { EventEmitter } from 'events'

    export interface Service {
        name: string
        fullName: string
        addresses: string[]
        host: string
        port: number
        txt: {
            [key: string]: string
        }
    }

    export default class Zeroconf extends EventEmitter {
        constructor()
        scan(type?: string, protocol?: string, domain?: string): void
        stop(): void
        getServices(): { [name: string]: Service }
        removeDeviceListeners(): void
        addDeviceListeners(): void
        publishService(
            type: string,
            protocol: string,
            domain: string,
            name: string,
            port: number,
            txt?: { [key: string]: string }
        ): void
        unpublishService(name: string): void
    }
}
