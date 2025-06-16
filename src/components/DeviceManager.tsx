import React, { useState, useEffect } from 'react';
import { HardDrive, Usb, CheckCircle, AlertCircle, Zap, RefreshCw } from 'lucide-react';
import { api, StorageDevice } from '../services/api';

interface DeviceManagerProps {
  onDeviceSelect: (device: StorageDevice | null) => void;
  selectedDevice: StorageDevice | null;
  onStartConversion: () => void;
  isConverting: boolean;
}

const DeviceManager: React.FC<DeviceManagerProps> = ({
  onDeviceSelect,
  selectedDevice,
  onStartConversion,
  isConverting
}) => {
  const [devices, setDevices] = useState<StorageDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getDevices();
      setDevices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'sd':
        return <HardDrive size={20} className="text-blue-600" />;
      case 'usb':
        return <Usb size={20} className="text-green-600" />;
      default:
        return <HardDrive size={20} className="text-gray-600" />;
    }
  };

  return (
    <div className="bg-white border-t border-gray-300">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">Storage Devices</h3>
          <button
            onClick={loadDevices}
            className="p-1 rounded hover:bg-gray-200"
            title="Refresh devices"
          >
            <RefreshCw size={16} className={`text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        <div className="space-y-2 mb-4">
          {loading ? (
            <div className="text-center py-4 text-gray-500">
              <RefreshCw size={20} className="mx-auto mb-2 animate-spin" />
              <p className="text-sm">Scanning for devices...</p>
            </div>
          ) : error ? (
            <div className="text-center py-4 text-red-500">
              <p className="text-sm">Error: {error}</p>
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">No storage devices detected</p>
              <p className="text-xs mt-1">Connect an SD card or USB drive</p>
            </div>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className={`p-3 border rounded-lg cursor-pointer transition-all ${
                  selectedDevice?.id === device.id
                    ? 'border-blue-500 bg-blue-50'
                    : device.isConnected
                    ? 'border-gray-200 hover:border-gray-300'
                    : 'border-gray-100 bg-gray-50 opacity-60'
                }`}
                onClick={() => device.isConnected && onDeviceSelect(device)}
              >
                <div className="flex items-center">
                  <div className="mr-3">
                    {getDeviceIcon(device.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{device.name}</div>
                    <div className="text-xs text-gray-500">
                      {device.capacity} • {device.freeSpace} free
                    </div>
                  </div>
                  <div className="ml-2">
                    {device.isConnected ? (
                      <CheckCircle size={16} className="text-green-500" />
                    ) : (
                      <AlertCircle size={16} className="text-gray-400" />
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <button
          onClick={onStartConversion}
          disabled={!selectedDevice || isConverting}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center ${
            selectedDevice && !isConverting
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Zap size={18} className="mr-2" />
          {isConverting ? 'Converting & Flashing...' : 'Convert & Flash to Device'}
        </button>

        {selectedDevice && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-sm mb-2">Target Device:</h4>
            <p className="text-xs text-gray-600">{selectedDevice.name}</p>
            <p className="text-xs text-gray-500">{selectedDevice.mountPath}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceManager;