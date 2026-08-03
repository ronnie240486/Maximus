// Logger de depuração temporário — só existe pra rastrear de vez o bug da
// sessão de teste sendo sobrescrita. Grava um histórico curto (últimas 40
// entradas) em storage, com hora + de onde veio + o que aconteceu. Dá pra
// ver isso na tela de Diagnóstico (botão "Ver logs de depuração").
import { storage } from '@/src/utils/storage';

const KEY = 'debug_session_log_v1';
const MAX_ENTRIES = 40;

export async function logSessionEvent(where: string, detail: string): Promise<void> {
  try {
    const raw = await storage.getItem<string>(KEY, '');
    const list: string[] = raw ? JSON.parse(raw) : [];
    const time = new Date().toTimeString().slice(0, 8);
    list.push(`${time} [${where}] ${detail}`);
    while (list.length > MAX_ENTRIES) list.shift();
    await storage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Log de depuração não pode nunca quebrar o app de verdade.
  }
}

export async function getSessionLog(): Promise<string[]> {
  try {
    const raw = await storage.getItem<string>(KEY, '');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearSessionLog(): Promise<void> {
  await storage.removeItem(KEY);
}
