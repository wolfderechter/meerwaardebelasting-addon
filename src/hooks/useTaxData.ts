import { useState, useEffect, useCallback, useRef } from 'react';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import type {
  NormalizedActivity,
  TaxCalculationResult,
  TaxDataState,
  FotomomentPrices,
} from '../utils/types';
import { calculateTax, fetchFotomomentPrices, unwrapArray } from '../utils/fifoEngine';

function toNum(val: unknown): number {
  if (val == null || val === '') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function resolveSymbol(a: any): string {
  return (a.assetSymbol ?? a.assetId ?? a.symbol ?? '').toUpperCase();
}

function normalizeActivities(raw: unknown): NormalizedActivity[] {
  const list = unwrapArray(raw);

  return list.map((a: any) => {
    const rawType = String(a.activityType ?? '').toUpperCase();
    const rawQty = toNum(a.quantity);
    const rawUnitPrice = toNum(a.unitPrice);
    if(a.assetSymbol === 'AMD') {
      console.log('CHECKING AMD', { a, rawType, rawQty, rawUnitPrice });
    }
    const rawTotal = toNum(a.amount) || (rawQty * rawUnitPrice);
    const rawDate = a.date instanceof Date ? a.date.toISOString() : String(a.date ?? '');

    return {
      id: String(a.id ?? ''),
      accountId: String(a.accountId ?? ''),
      accountName: String(a.accountName ?? ''),
      symbol: resolveSymbol(a),
      assetId: String(a.assetId ?? ''),
      assetName: String(a.assetName ?? ''),
      activityType: rawType as NormalizedActivity['activityType'],
      quantity: rawQty,
      unitPrice: rawUnitPrice,
      totalPrice: rawTotal,
      currency: String(a.currency ?? 'EUR'),
      date: rawDate,
    };
  }).filter(
    (a) => a.activityType === 'BUY' || a.activityType === 'SELL' ||
          a.activityType === 'ADD_HOLDING' || a.activityType === 'TRANSFER_IN'
  );
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
      const rawList = unwrapArray(activitiesRaw);
      if (rawList.length > 0) {
        const first = rawList[0];
        const keys = Object.keys(first).join(', ');
        ctx.api.logger.debug(`Eerste activiteit velden: ${keys}`);
        ctx.api.logger.debug(`Eerste activiteit: assetSymbol=${JSON.stringify(first.assetSymbol)}, symbol=${JSON.stringify(first.symbol)}, ticker=${JSON.stringify(first.ticker)}, assetName=${JSON.stringify(first.assetName)}, activityType=${JSON.stringify(first.activityType)}, quantity=${JSON.stringify(first.quantity)}`);
      }
      const activities = normalizeActivities(activitiesRaw);
      const rates = unwrapArray(ratesRaw);
      if (rates.length > 0) {
        const first = rates[0];
        ctx.api.logger.debug(`Eerste rate velden: ${Object.keys(first).join(', ')}`);
        ctx.api.logger.debug(`Eerste rate: ${JSON.stringify(first)}`);
      } else {
        ctx.api.logger.warn('GEEN exchange rates gevonden!');
      }

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
      const symbolToAssetId = new Map<string, string>();
      for (const a of enriched) {
        if (a.activityType === 'BUY' || a.activityType === 'ADD_HOLDING' || a.activityType === 'TRANSFER_IN') {
          const buyDate = new Date(a.date);
          if (buyDate < new Date('2026-01-01')) {
            pre2026Symbols.add(a.symbol);
            if (a.assetId && !symbolToAssetId.has(a.symbol)) {
              symbolToAssetId.set(a.symbol, a.assetId);
            }
          }
        }
      }
      if (symbolToAssetId.size > 0) {
        ctx.api.logger.info(`Voorbeeld: symbol=AMD → assetId=${symbolToAssetId.get('AMD') || 'NIET GEVONDEN'}`);
      }
      let fotomomentPrices: FotomomentPrices = {};
      if (pre2026Symbols.size > 0) {
        ctx.api.logger.info(`Fotomoment prijzen ophalen voor ${pre2026Symbols.size} symbolen`);
        fotomomentPrices = await fetchFotomomentPrices(
          [...pre2026Symbols],
          symbolToAssetId,
          (assetId: string) => ctx.api.quotes.getHistory(assetId),
          (msg: string) => ctx.api.logger.debug(msg)
        );
        const foundSymbols = Object.keys(fotomomentPrices);
        ctx.api.logger.info(`Fotomoment prijzen gevonden voor ${foundSymbols.length}/${pre2026Symbols.size} symbolen`);
      }

      if (abortRef.current) return;

      const sells = enriched.filter(a => a.activityType === 'SELL');
      for (const s of sells) {
        ctx.api.logger.debug(`VERKOOP: symbol=${s.symbol}, qty=${s.quantity}, unitPrice=${s.unitPrice}, totalPrice=${s.totalPrice}, currency=${s.currency}, date=${s.date}`);
      }

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
