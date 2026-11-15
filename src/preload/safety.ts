import type { Result } from '../shared/types';
import type { SafetyApi } from '../shared/safety-api';

type Invoke = <T>(channel: string, ...args: unknown[]) => Promise<Result<T>>;
export const safetyApi = (invoke: Invoke): SafetyApi => ({
  backup: {
    status: () => invoke('safety:backup:status'),
    setConfig: (patch) => invoke('safety:backup:setConfig', patch),
    chooseFolder: () => invoke('safety:backup:chooseFolder'),
    run: (saveAs) => invoke('safety:backup:run', saveAs),
    history: () => invoke('safety:backup:history'),
    pickRestore: () => invoke('safety:backup:pickRestore'),
    inspect: (path) => invoke('safety:backup:inspect', path),
    restore: (path) => invoke('safety:backup:restore', path),
    openFolder: () => invoke('safety:backup:openFolder'),
  },
  recycle: {
    list: (f) => invoke('safety:recycle:list', f),
    restore: (f, id) => invoke('safety:recycle:restore', f, id),
    purge: (f, id) => invoke('safety:recycle:purge', f, id),
    empty: (f) => invoke('safety:recycle:empty', f),
  },
  audit: {
    list: (f, filter) => invoke('safety:audit:list', f, filter),
    entities: (f) => invoke('safety:audit:entities', f),
  },
  verify: {
    run: (f) => invoke('safety:verify:run', f),
    fix: (f, check) => invoke('safety:verify:fix', f, check),
  },
  lock: {
    status: () => invoke('safety:lock:status'),
    setPin: (pin, current) => invoke('safety:lock:setPin', pin, current),
    removePin: (current) => invoke('safety:lock:removePin', current),
    verify: (pin) => invoke('safety:lock:verify', pin),
    recover: (code, pin) => invoke('safety:lock:recover', code, pin),
    setOptions: (options, current) => invoke('safety:lock:setOptions', options, current),
  },
});
