import type {
  CustomerProfile,
  PartyRate,
  Recurrence,
  RecurrenceInput,
  Reminder,
} from './customer-features';
import type { Result } from './types';
export interface CustomerApi {
  rates(firm: number): Promise<Result<PartyRate[]>>;
  profile(firm: number, party: number): Promise<Result<CustomerProfile>>;
  rate(firm: number, rate: PartyRate, remove?: boolean): Promise<Result<void>>;
  recurring(firm: number): Promise<Result<Recurrence[]>>;
  recur(firm: number, input: RecurrenceInput): Promise<Result<number>>;
  pause(firm: number, id: number, paused: boolean): Promise<Result<void>>;
  run(firm: number): Promise<Result<number>>;
  reminders(firm: number): Promise<Result<Reminder[]>>;
  message(firm: number, txn: number): Promise<Result<{ phone: string; message: string }>>;
  whatsapp(phone: string, message: string): Promise<Result<void>>;
  alerts(firm: number): Promise<Result<{ created: number; due: number }>>;
}
