import type { MediaDeviceOption } from '@/entities/media-device';
import type { NeonSelectOption } from '@/shared/ui/select/NeonSelect';

export function toSelectOptions(devices: MediaDeviceOption[]): NeonSelectOption[] {
  return devices.map((device) => ({ value: device.deviceId, label: device.label }));
}
