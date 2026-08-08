import * as Device from 'expo-device';
import { Platform } from 'react-native';

// TV boxes baratas costumam ter 1-2GB de RAM total (contra 4-8GB+ de um
// celular médio) — abaixo desse limite, listas grandes com muita
// renderização simultânea pesam mais. `Device.totalMemory` é síncrono
// (não precisa de useEffect/useState), então isso pode ser calculado uma
// vez só, direto no module scope.
const LOW_END_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

// MAS: RAM alta não quer dizer processador rápido. É comum TV box barata
// vir com "bastante RAM" (4GB+, número que ajuda a vender) só que com um
// chip de processador antigo/fraco por baixo — nesse caso, o gargalo real
// é CPU, não memória, e o critério de RAM sozinho classificaria (errado)
// esse aparelho como "normal", deixando de aplicar as otimizações que ele
// mais precisa.
//
// Pra pegar esse caso, faz um teste rápido e real de velocidade de CPU na
// abertura do app: roda uma quantidade fixa de contas (sem I/O, sem
// esperar rede/disco) e mede quanto tempo levou. Processador rápido
// termina isso em poucos milissegundos; processador fraco demora bem
// mais — o número em si aparece na tela de Diagnóstico, pra dar pra
// calibrar o limiar certo com dados reais de aparelhos de verdade, em vez
// de eu ter que adivinhar sem poder testar numa TV box específica.
const CPU_BENCHMARK_ITERATIONS = 3_000_000;
// Ponto de partida conservador — ajustável depois de ver números reais
// de TV boxes reportados na tela de Diagnóstico.
const CPU_BENCHMARK_SLOW_THRESHOLD_MS = 40;

function benchmarkCpuMs(): number {
  const start = Date.now();
  let x = 0;
  for (let i = 0; i < CPU_BENCHMARK_ITERATIONS; i++) {
    x += Math.sqrt(i) % 7;
  }
  // Só pra o resultado do loop não ser "otimizado embora" por engano por
  // algum motor JS mais agressivo — nunca chega a logar de verdade.
  if (x === -1) console.log(x);
  return Date.now() - start;
}

// Alguns TV box ainda são 32-bit (armeabi-v7a) mesmo em 2026 — geralmente
// sinal de chip mais antigo/mais fraco, já que fabricantes de chip novo
// quase sempre saem direto em 64-bit hoje em dia.
function is32BitOnly(): boolean {
  try {
    const archs = Device.supportedCpuArchitectures || [];
    return archs.length > 0 && !archs.some((a) => a.includes('64'));
  } catch {
    return false;
  }
}

export const cpuBenchmarkMs = Platform.OS === 'web' ? 0 : benchmarkCpuMs();

const isLowEndDevice = (() => {
  try {
    const mem = Device.totalMemory;
    const weakByRam = typeof mem === 'number' && mem > 0 && mem < LOW_END_THRESHOLD_BYTES;
    const weakByCpu = cpuBenchmarkMs > CPU_BENCHMARK_SLOW_THRESHOLD_MS;
    const weakByArch = is32BitOnly();
    return weakByRam || weakByCpu || weakByArch;
  } catch {
    return false;
  }
})();

/**
 * true se o aparelho for considerado fraco — por RAM baixa, CPU lenta no
 * benchmark, ou arquitetura só 32-bit (qualquer um dos três já classifica
 * como fraco). Usado pra reduzir renderização simultânea e desligar
 * prefetches em segundo plano que competiriam por CPU.
 */
export function useIsLowEndDevice(): boolean {
  return isLowEndDevice;
}

/** Detalhes crus da detecção — usado na tela de Diagnóstico pra mostrar
 * os números reais do aparelho, e permitir calibrar os limiares certos
 * com dados de TV box de verdade (sem isso, teria que adivinhar às
 * cegas, sem poder testar no aparelho da pessoa). */
export function getDeviceCapabilityInfo() {
  return {
    isLowEndDevice,
    totalMemoryBytes: Device.totalMemory,
    cpuBenchmarkMs,
    cpuBenchmarkThresholdMs: CPU_BENCHMARK_SLOW_THRESHOLD_MS,
    is32BitOnly: is32BitOnly(),
    supportedCpuArchitectures: Device.supportedCpuArchitectures,
    modelName: Device.modelName,
    osVersion: Device.osVersion,
  };
}

/**
 * Ajusta os parâmetros de virtualização de uma FlatList conforme a força
 * do aparelho — menos itens de cada vez em TV box fraca, mantém o padrão
 * em aparelhos normais. Usado pelas listas que continuam em FlatList
 * (ex: a linha de seções da Home). Para Movies/Series/Channels, que usam
 * FlashList, ver getFlashListPerfProps abaixo.
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

/**
 * Equivalente a getListPerfProps, mas pro FlashList (que não usa
 * initialNumToRender/maxToRenderPerBatch/windowSize do FlatList — o
 * parâmetro que controla quanto ele renderiza além da área visível é o
 * drawDistance). Valor menor = menos itens montados de uma vez = menos
 * CPU/memória gasta em TV box fraca; maior = rolagem mais "generosa" mas
 * mais pesada. `undefined` deixa o FlashList usar o próprio padrão.
 */
export function getFlashListPerfProps() {
  return isLowEndDevice ? { drawDistance: 120 } : {};
}
