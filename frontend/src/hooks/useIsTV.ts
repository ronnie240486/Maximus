import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

/**
 * Detecta automaticamente se o app está rodando numa TV box / Android TV,
 * sem precisar perguntar nada ao usuário. Usa o `deviceType` do expo-device,
 * que no Android lê o UI mode do sistema (UI_MODE_TYPE_TELEVISION) — o
 * mesmo sinal que o próprio launcher da TV usa para saber que é uma TV.
 *
 * Fica `null` por um instante no primeiro frame (a checagem é assíncrona);
 * qualquer código que dependa disso deve tratar `null` como "ainda não sei"
 * e não como "não é TV", pra evitar um pisca de layout errado no arranque.
 */
export function useIsTV(): boolean | null {
  const [isTV, setIsTV] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
        if (mounted) setIsTV(false);
        return;
      }
      try {
        const type = await Device.getDeviceTypeAsync();
        if (mounted) setIsTV(type === Device.DeviceType.TV);
      } catch {
        if (mounted) setIsTV(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return isTV;
}
