// Ambient TypeScript declarations for Web Bluetooth (BLE) and Web Serial (USB)

export {};

declare global {
  interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    value?: DataView | null;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    writeValueWithoutResponse(value: BufferSource): Promise<void>;
    writeValue?(value: BufferSource): Promise<void>;
  }

  interface BluetoothRemoteGATTService {
    getCharacteristic(characteristic: number | string): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTServer {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: number | string): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothDevice extends EventTarget {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServer;
  }

  interface BluetoothLEScanFilter {
    services?: (number | string)[];
    name?: string;
    namePrefix?: string;
  }

  interface RequestDeviceOptions {
    filters?: BluetoothLEScanFilter[];
    optionalServices?: (number | string)[];
    acceptAllDevices?: boolean;
  }

  interface Bluetooth {
    requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
  }

  interface SerialPort extends EventTarget {
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
    open(options: {
      baudRate: number;
      dataBits?: 7 | 8;
      stopBits?: 1 | 2;
      parity?: 'none' | 'even' | 'odd';
      flowControl?: 'none' | 'hardware';
    }): Promise<void>;
    close(): Promise<void>;
  }

  interface Serial {
    requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<SerialPort>;
    getPorts(): Promise<SerialPort[]>;
  }

  interface Navigator {
    bluetooth?: Bluetooth;
    serial?: Serial;
  }
}
