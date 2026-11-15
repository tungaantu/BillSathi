import type { Result } from './types';
import type { BackupConfig } from './backup';
import type { SaleSummary } from './sales';

export interface BackupPreview {
  path: string;
  fileName: string;
  size: number;
  createdAt: string;
  appVersion: string;
  firms: string[];
  counts: { parties: number; items: number; transactions: number };
}
export type InspectResult =
  { ok: true; preview: BackupPreview } | { ok: false; reason: 'notBackup' | 'newer' | 'corrupt' };
export interface BackupFileInfo {
  name: string;
  path: string;
  size: number;
  mtime: string;
  preview: BackupPreview | null;
}
export interface BackupStatus {
  config: BackupConfig;
  folder: string;
  lastBackupAt: string | null;
  daysSince: number | null;
  reminderDue: boolean;
}
export interface RecycleRow extends SaleSummary {
  daysLeft: number;
}
export interface AuditFilter {
  from?: string;
  to?: string;
  entity?: string;
  action?: string;
  limit?: number;
}
export interface AuditRow {
  id: number;
  at: string;
  action: string;
  entity: string;
  entityId: number | null;
  before: string | null;
  after: string | null;
  actor: string;
}
export type VerifyId =
  | 'integrity'
  | 'orphanLines'
  | 'totals'
  | 'allocations'
  | 'numbering'
  | 'negativeStock'
  | 'balances';
export interface VerifyCheck {
  id: VerifyId;
  status: 'ok' | 'warn' | 'error';
  count: number;
  /** Short, language-neutral examples such as "INV-0004 (₹118.00 instead of ₹120.00)". */
  details: string[];
  fixable: boolean;
}
export interface VerifyReport {
  ranAt: string;
  checks: VerifyCheck[];
}
export interface LockStatus {
  hasPin: boolean;
  lockAfterMinutes: 0 | 1 | 5 | 15 | 30;
  askPinForEdit: boolean;
  cooldownMs: number;
}
export interface PinAttempt {
  ok: boolean;
  attemptsLeft: number;
  cooldownMs: number;
}
export interface LockOptions {
  lockAfterMinutes?: 0 | 1 | 5 | 15 | 30;
  askPinForEdit?: boolean;
}

export interface SafetyApi {
  backup: {
    status(): Promise<Result<BackupStatus>>;
    setConfig(patch: Partial<BackupConfig>): Promise<Result<BackupStatus>>;
    chooseFolder(): Promise<Result<string | null>>;
    run(saveAs?: boolean): Promise<Result<{ path: string; size: number } | null>>;
    history(): Promise<Result<BackupFileInfo[]>>;
    pickRestore(): Promise<Result<InspectResult | null>>;
    inspect(path: string): Promise<Result<InspectResult>>;
    restore(
      path: string,
    ): Promise<Result<{ ok: true } | { ok: false; reason: 'notBackup' | 'newer' | 'corrupt' }>>;
    openFolder(): Promise<Result<void>>;
  };
  recycle: {
    list(firm: number): Promise<Result<RecycleRow[]>>;
    restore(firm: number, id: number): Promise<Result<void>>;
    purge(firm: number, id: number): Promise<Result<void>>;
    empty(firm: number): Promise<Result<number>>;
  };
  audit: {
    list(firm: number, filter: AuditFilter): Promise<Result<AuditRow[]>>;
    entities(firm: number): Promise<Result<string[]>>;
  };
  verify: {
    run(firm: number): Promise<Result<VerifyReport>>;
    fix(firm: number, check: VerifyId): Promise<Result<VerifyReport>>;
  };
  lock: {
    status(): Promise<Result<LockStatus>>;
    setPin(
      pin: string,
      current?: string,
    ): Promise<
      Result<{ ok: boolean; recoveryCode?: string; attemptsLeft?: number; cooldownMs?: number }>
    >;
    removePin(current: string): Promise<Result<PinAttempt>>;
    verify(pin: string): Promise<Result<PinAttempt>>;
    recover(code: string, newPin: string): Promise<Result<{ ok: boolean; recoveryCode?: string }>>;
    setOptions(options: LockOptions, current?: string): Promise<Result<PinAttempt>>;
  };
}
