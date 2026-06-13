import { useState, useEffect, useCallback, useRef } from 'react';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import type {
  NormalizedActivity,
  TaxCalculationResult,
  TaxDataState,
  FotomomentPrices,
} from '../utils/types';
import { calculateTax, fetchFotomomentPrices } from '../utils/fifoEngine';

function deepUnwrap(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'object' || raw === null) return [];

  const seen = new Set<unknown>();
  const stack: unknown[] = [raw];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) return current;

    if (typeof current === 'object' && current !== null) {
      for (const val of Object.values(current as Record<string, unknown>)) {
        if (Array.isArray(val)) return val;
        if (typeof val === 'object' && val !== null) stack.push(val);
      }
    }
  }

  return [];
}

function toNum(val: unknown): number {
  if (val == null || val === '') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function resolveSymbol(a: any): string {
  const id = a.assetId ?? '';
  const idIsTicker = id.length > 0 && id.length < 20 && /^[A-Za-z0-9.:]+$/.test(id);

  const symbol =
    a.assetSymbol ??
    a.symbol ??
    a.ticker ??
    (idIsTicker ? id : null) ??
    a.asset?.symbol ??
    a.asset?.ticker ??
    a.asset?.asset?.symbol ??
    a.assetData?.symbol ??
    '';
  if (symbol) return symbol.toUpperCase();

  const name = (a.assetName ?? a.name ?? a.description ?? '').trim();
  const firstWord = name.split(/[\s,./]+/)[0] ?? '';
  return firstWord.toUpperCase();
}

function normalizeActivities(raw: unknown): NormalizedActivity[] {
  const list = deepUnwrap(raw);

  return list.map((a: any) => {
    const rawType = (a.activityType ?? a.type ?? '').toUpperCase();
    const rawQty = toNum(a.quantity ?? a.shares ?? a.filled ?? a.executedQuantity);
    const rawUnitPrice = toNum(a.unitPrice ?? a.price ?? a.costPerShare);
    const rawTotal = toNum(a.totalPrice ?? a.amount ?? a.total) || (rawQty * rawUnitPrice);

    return {
      id: a.id ?? '',
      accountId: a.accountId ?? '',
      accountName: a.accountName ?? '',
      symbol: resolveSymbol(a),
      assetName: a.assetName ?? a.name ?? a.description ?? a.asset?.name ?? (a.symbol ?? ''),
      activityType: rawType as NormalizedActivity['activityType'],
      quantity: rawQty,
      unitPrice: rawUnitPrice,
      totalPrice: rawTotal,
      currency: a.currency ?? 'EUR',
      date: a.date instanceof Date ? a.date.toISOString() : (a.date ?? a.dateTime ?? a.transactionDate ?? ''),
      fee: toNum(a.fee ?? a.commission ?? a.brokerFee) || undefined,
      tax: toNum(a.tax) || undefined,
    };
  }).filter(
    (a) => a.activityType === 'BUY' || a.activityType === 'SELL' ||
          a.activityType === 'ADD_HOLDING' || a.activityType === 'TRANSFER_IN'
  );
}

function normalizeRates(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.rates)) return obj.rates;
  }
  return [];
}

export function useTaxData(
  ctx: AddonContext | null,
  taxYear: number
): TaxDataState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TaxCalculationResult | null>(null);
  const abortRef = useRef(false);

  const compute = useCallback(async () => {
    if (!ctx) {
      setError('Addon context niet beschikbaar');
      setLoading(false);
      return;
    }

    abortRef.current = false;
    setLoading(true);
    setError(null);

    try {
      ctx.api.logger.info(`Meerwaardebelasting: start berekening voor jaar ${taxYear}`);

      const [accountsRaw, activitiesRaw, ratesRaw] = await Promise.all([
        ctx.api.accounts.getAll().catch(() => []),
        ctx.api.activities.getAll().catch(() => []),
        ctx.api.exchangeRates.getAll().catch(() => []),
      ]);

      if (abortRef.current) return;

      const accounts = Array.isArray(accountsRaw) ? accountsRaw : [];
      const rawList = deepUnwrap(activitiesRaw);
      if (rawList.length > 0) {
        const first = rawList[0];
        const keys = Object.keys(first).join(', ');
        ctx.api.logger.debug(`Eerste activiteit velden: ${keys}`);
        ctx.api.logger.debug(`Eerste activiteit: assetSymbol=${JSON.stringify(first.assetSymbol)}, symbol=${JSON.stringify(first.symbol)}, ticker=${JSON.stringify(first.ticker)}, assetName=${JSON.stringify(first.assetName)}, activityType=${JSON.stringify(first.activityType)}, quantity=${JSON.stringify(first.quantity)}`);
      }
      const activities = normalizeActivities(activitiesRaw);
      const rates = normalizeRates(ratesRaw);

      const buyCount = activities.filter(a => a.activityType === 'BUY' || a.activityType === 'ADD_HOLDING' || a.activityType === 'TRANSFER_IN').length;
      const sellCount = activities.filter(a => a.activityType === 'SELL').length;
      ctx.api.logger.info(`Activiteiten: ${activities.length} totaal (${buyCount} aankopen, ${sellCount} verkopen)`);

      if (buyCount === 0) {
        ctx.api.logger.warn('Geen aankoopactiviteiten gevonden!');
      }

      const uniqueSymbols = [...new Set(activities.map(a => a.symbol))].filter(Boolean);
      ctx.api.logger.info(`Unieke symbolen in activiteiten: ${uniqueSymbols.length > 0 ? uniqueSymbols.join(', ') : 'GEEN — alle symbolen leeg!'}`);
      if (uniqueSymbols.length === 0) {
        ctx.api.logger.warn('ALLE activiteiten hebben lege symbolen — FIFO engine kan geen onderscheid maken tussen assets!');
      }

      const accountMap = new Map(accounts.map((a: any) => [a.id, a.name || a.id]));

      const enriched = activities.map((a) => ({
        ...a,
        accountName: accountMap.get(a.accountId) || a.accountName || a.accountId,
      }));

      const pre2026Symbols = new Set<string>();
      for (const a of enriched) {
        if (a.activityType === 'BUY' || a.activityType === 'ADD_HOLDING' || a.activityType === 'TRANSFER_IN') {
          const buyDate = new Date(a.date);
          if (buyDate < new Date('2026-01-01')) {
            pre2026Symbols.add(a.symbol);
          }
        }
      }

      let fotomomentPrices: FotomomentPrices = {};
      if (pre2026Symbols.size > 0) {
        ctx.api.logger.info(`Fotomoment prijzen ophalen voor ${pre2026Symbols.size} symbolen`);
        fotomomentPrices = await fetchFotomomentPrices(
          [...pre2026Symbols],
          (symbol: string) => ctx.api.quotes.getHistory(symbol),
          (msg: string) => ctx.api.logger.debug(msg)
        );
        const foundSymbols = Object.keys(fotomomentPrices);
        ctx.api.logger.info(`Fotomoment prijzen gevonden voor ${foundSymbols.length}/${pre2026Symbols.size} symbolen`);
      }

      if (abortRef.current) return;

      ctx.api.logger.info(`FIFO engine starten: ${enriched.length} activiteiten`);

      const calcResult = calculateTax(
        enriched,
        rates,
        fotomomentPrices,
        taxYear
      );

      if (abortRef.current) return;

      ctx.api.logger.info(`Berekening voltooid: ${calcResult.realizedGains.length} gerealiseerde meerwaarden`);
      setResult(calcResult);
    } catch (err: any) {
      if (!abortRef.current) {
        const msg = err?.message ?? 'Onbekende fout bij belastingberekening';
        ctx?.api.logger.error(`Fout: ${msg}`);
        setError(msg);
      }
    } finally {
      if (!abortRef.current) {
        setLoading(false);
      }
    }
  }, [ctx, taxYear]);

  useEffect(() => {
    abortRef.current = false;
    compute();
    return () => {
      abortRef.current = true;
    };
  }, [compute]);

  const refetch = useCallback(() => {
    compute();
  }, [compute]);

  return { loading, error, result, refetch };
}
