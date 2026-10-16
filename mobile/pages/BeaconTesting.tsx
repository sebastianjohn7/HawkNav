import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, DeviceEventEmitter } from "react-native";
import { BleManager } from 'react-native-ble-plx';

const manager = new BleManager();

export async function BeaconTesting() {
    manager.startDeviceScan(null, null, (error, device) => {
  if (error) {
    // Handle error (e.g., Bluetooth is turned off)
    return;
  }
  
  if (device && device.name) {
    console.log(`Discovered: ${device.name} (${device.id})`);
    // Store device state or trigger a connection hook
  }
});
// Stop scanning before connecting
manager.stopDeviceScan();

const connectedDevice = await manager.connectToDevice(device.id);
// Essential: Discover all characteristics and services before interacting
const fullDeviceProfile = await connectedDevice.discoverAllServicesAndCharacteristics();

// Reading a characteristic value
const characteristic = await manager.readCharacteristicForDevice(
  deviceId,
  serviceUUID,
  characteristicUUID
);
console.log("Base64 Value:", characteristic.value);

// Subscribing to continuous updates (Streaming)
manager.monitorCharacteristicForDevice(
  deviceId,
  serviceUUID,
  characteristicUUID,
  (error, char) => {
    if (char?.value) {
      // Decode your Base64 payload here
    }
  }
);

}
