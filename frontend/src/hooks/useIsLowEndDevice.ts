import * as Device from 'expo-device';

// TV boxes baratas costumam ter 1-2GB de RAM total (contra 4-8GB+ de um
// celular médio) — abaixo desse limite, listas grandes com muita
// renderização simultânea pesam mais. `Device.totalMemory` é síncrono
// (não precisa de useEffect/useState), então isso pode ser calculado uma
// vez só, direto no module scope.
const LOW_END_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

const isLowEndDevice = (() => {
  try {
    const mem = Device.totalMemory;
    return typeof mem === 'number' && mem > 0 && mem < LOW_END_THRESHOLD_BYTES;
  } catch {
    return false;
  }
})();

/**
 * true se o aparelho tem RAM baixa (TV box mais fraca) — usado pra reduzir
 * o quanto as listas grandes renderizam de uma vez (initialNumToRender,
 * windowSize etc). Em aparelhos com RAM normal/alta, não muda nada.
 */
export function useIsLowEndDevice(): boolean {
  return isLowEndDevice;
}

/**
 * Ajusta os parâmetros de virtualização de uma FlatList conforme a força
 * do aparelho — menos itens de cada vez em TV box fraca, mantém o padrão
 * em aparelhos normais.
 */
export function getListPerfProps(baseInitialNumToRender: number) {
  if (isLowEndDevice) {
    return {
      initialNumToRender: Math.max(6, Math.round(baseInitialNumToRender / 2)),
      maxToRenderPerBatch: Math.max(6, Math.round(baseInitialNumToRender / 2)),
      windowSize: 4,
    };
  }
  return {
    initialNumToRender: baseInitialNumToRender,
    maxToRenderPerBatch: baseInitialNumToRender,
    windowSize: 7,
  };
}
