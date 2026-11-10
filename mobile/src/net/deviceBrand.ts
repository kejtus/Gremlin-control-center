import { Platform } from 'react-native';

/** Huawei / Honor / HyperOS — często bez Google Speech z pudełka. */
export function isHuaweiFamily(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    const c = Platform.constants as {
      Brand?: string;
      Manufacturer?: string;
      Model?: string;
    };
    const s = `${c.Brand || ''} ${c.Manufacturer || ''} ${c.Model || ''}`.toLowerCase();
    return /huawei|honor|hinova|harmony|hyper/.test(s);
  } catch {
    return false;
  }
}
