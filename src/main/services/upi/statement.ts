import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import type { DatabaseContext } from '../../db';
import { paymentsRepository } from '../../db/payments';
import { repositories } from '../../db/repositories';
import type {
  MatchResult,
  PushOutcome,
  StatementMapping,
  StatementPick,
  StatementPreview,
} from '../../../shared/payments-api';
import { matchStatement } from './reconcile';
import {
  detectSheet,
  parseCsv,
  parseLines,
  toYoupiCsv,
  type StatementSheet,
} from './statement-parse';
import { YoupiError } from './youpi-client';
import type { PaymentConfigStore } from './config';
import type { CollectService } from './collect';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 20000;

/** Reads the first sheet of an .xlsx or a .csv into rows of text. */
export async function readTable(path: string): Promise<string[][]> {
  if (statSync(path).size > MAX_BYTES) throw new Error('validation');
  if (extname(path).toLowerCase() === '.csv') return parseCsv(readFileSync(path, 'utf8'));
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(path);
  const sheet = book.worksheets[0];
  if (!sheet || sheet.rowCount > MAX_ROWS || sheet.columnCount > 60) throw new Error('validation');
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const cell = row.getCell(c);
      cells.push(
        cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.text.trim(),
      );
    }
    rows.push(cells);
  });
  return rows;
}

/** Bank statement matching: reads the file, proposes matches, and records what the owner confirms. */
export function statementService(
  context: DatabaseContext,
  store: PaymentConfigStore,
  collect: CollectService,
) {
  const repo = paymentsRepository(context),
    firms = repositories(context);
  const sessions = new Map<string, { sheet: StatementSheet; fileName: string }>();

  function remember(sheet: StatementSheet, fileName: string) {
    const token = randomUUID();
    sessions.set(token, { sheet, fileName });
    for (const key of [...sessions.keys()].slice(0, Math.max(0, sessions.size - 3)))
      sessions.delete(key);
    return token;
  }
  const session = (token: string) => {
    const found = sessions.get(token);
    if (!found) throw new Error('notFound');
    return found;
  };

  function preview(table: string[][], fileName: string): StatementPreview {
    const found = detectSheet(table);
    if (!found) throw new Error('validation');
    return {
      token: remember(found.sheet, fileName),
      fileName,
      headers: found.sheet.headers,
      sample: found.sheet.rows.slice(0, 6),
      rowCount: found.sheet.rows.length,
      mapping: found.mapping,
    };
  }

  async function open(firm: number): Promise<StatementPreview | null> {
    firms.get(firm);
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const selected = await dialog.showOpenDialog(parent, {
      properties: ['openFile'],
      filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'csv'] }],
    });
    if (selected.canceled) return null;
    const path = selected.filePaths[0];
    return preview(await readTable(path), basename(path));
  }

  const lines = (token: string, mapping: StatementMapping) =>
    parseLines(session(token).sheet, mapping);

  function match(firm: number, token: string, mapping: StatementMapping): MatchResult {
    firms.get(firm);
    const parsed = lines(token, mapping),
      candidates = repo.candidates(firm);
    return {
      ...matchStatement(parsed, candidates),
      creditCount: parsed.filter((l) => l.creditPaise > 0).length,
      openPayments: candidates.length,
    };
  }

  /** Marks the owner's chosen pairs as confirmed by the bank statement. */
  function confirm(firm: number, token: string, mapping: StatementMapping, picks: StatementPick[]) {
    firms.get(firm);
    const parsed = lines(token, mapping),
      candidates = repo.candidates(firm);
    const chosen = picks.map((pick) => {
      const line = parsed.find((l) => l.index === pick.lineIndex && l.creditPaise > 0);
      const candidate = candidates.find((c) => c.txnId === pick.txnId);
      // Never confirm a payment against a bank credit of a different amount.
      if (!line || !candidate || line.creditPaise !== candidate.amountPaise)
        throw new Error('validation');
      return { line, candidate };
    });
    if (new Set(chosen.map((c) => c.candidate.txnId)).size !== chosen.length)
      throw new Error('validation');
    return context.sqlite.transaction(() => {
      for (const { line, candidate } of chosen) {
        const note = `${line.date} ${line.description}`.slice(0, 200);
        const existing = repo.confirmation(candidate.txnId);
        if (existing)
          repo.setConfirmation(candidate.txnId, {
            state: 'confirmed',
            confirmedAt: repo.now(),
            confirmedBy: 'statement',
            statementNote: note,
            utr: existing.utr || line.utrs[0] || '',
          });
        else
          repo.addConfirmation({
            txnId: candidate.txnId,
            firmId: firm,
            state: 'confirmed',
            utr: line.utrs[0] ?? candidate.utr,
            source: 'statement',
            recordedAt: repo.now(),
            confirmedAt: repo.now(),
            confirmedBy: 'statement',
            statementNote: note,
          });
        firms.audit(firm, 'payment_confirmations', candidate.txnId, 'confirm', existing ?? null, {
          by: 'statement',
          note,
        });
      }
      return chosen.length;
    })();
  }

  /** Optionally lets YouPI-PG reconcile its own orders from the same statement. */
  async function push(
    firm: number,
    token: string,
    mapping: StatementMapping,
  ): Promise<PushOutcome> {
    const client = store.client(firm);
    const empty = { reconciled: 0, conflicts: 0, unmatched: 0 };
    if (!client) return { ok: false, problem: 'config', ...empty };
    try {
      const result = await client.importStatement(toYoupiCsv(lines(token, mapping)));
      await collect.sync(firm);
      return { ok: true, ...result };
    } catch (error) {
      return {
        ok: false,
        problem: error instanceof YoupiError ? error.code : 'unreachable',
        ...empty,
      };
    }
  }

  return { preview, open, match, confirm, push };
}
export type StatementService = ReturnType<typeof statementService>;
