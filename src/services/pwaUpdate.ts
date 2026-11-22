type UpdateListener = (available: boolean) => void;

let updateAvailable = false;
let updateHandler: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<UpdateListener>();

export function setPwaUpdateHandler(
  handler: (reloadPage?: boolean) => Promise<void>
): void {
  updateHandler = handler;
}

export function notifyPwaUpdateAvailable(available: boolean): void {
  updateAvailable = available;
  listeners.forEach((cb) => {
    try {
      cb(updateAvailable);
    } catch {
      // Ignora erros em ouvintes individuais
    }
  });
}

export function subscribePwaUpdate(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(updateAvailable);
  return () => {
    listeners.delete(listener);
  };
}

export async function triggerSafePwaReload(): Promise<boolean> {
  if (!updateHandler) return false;
  await updateHandler(true);
  return true;
}
