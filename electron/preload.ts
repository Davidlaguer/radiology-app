// electron/preload.ts
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // expón métodos si los necesitas; por ahora vacío
});
