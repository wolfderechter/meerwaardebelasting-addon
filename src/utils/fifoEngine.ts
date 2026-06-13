import type {
  NormalizedActivity,
  ExchangeRateEntry,
  TaxLot,
  RealizedGain,
  YearSummary,
  TaxCalculationResult,
  FotomomentPrices,
} from './types';

const FOTOMOMENT_DATE = '2025-12-31';
const TAX_RATE = 0.10;
const ANNUAL_EXEMPTION = 10_000;
const BASE_CURRENCY = 'EUR';

function parseDate(dateStr: string): number {
  return new Date(dateStr).getTime();
}

function getYear(dateStr: string): number {
  return new Date(dateStr).getFullYear();
}

function isPreFotomoment(dateStr: string): boolean {
  return parseDate(dateStr) < parseDate(FOTOMOMENT_DATE);
}

function unwrapArray(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'object' || raw === null) return [];
  const obj = raw as Record<string, unknown>;
  for (const key of ['data', 'results', 'quotes', 'history', 'items', 'prices']) {
    const val = obj[key];
    if (Array.isArray(val)) return val;
  }
  return [];
}

function normalizeArray<T>(data: T[] | { data?: T[] } | undefined | null): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)) {
    return data.data as T[];
  }
  return unwrapArray(data) as T[];
}

export function buildExchangeRateMap(
  rawRates: unknown
): Map<string, Map<string, Map<string, number>>> {
  const map = new Map<string, Map<string, Map<string, number>>>();
  const rates = normalizeArray(rawRates as any);

  for (const r of rates) {
    const entry = r as ExchangeRateEntry;
    if (!entry.fromCurrency || !entry.toCurrency || entry.rate == null) continue;
    if (entry.fromCurrency === entry.toCurrency) continue;

    const from = entry.fromCurrency.toUpperCase();
    const to = entry.toCurrency.toUpperCase();
    const date = entry.date?.substring(0, 10);

    if (!map.has(from)) map.set(from, new Map());
    const toMap = map.get(from)!;
    if (!toMap.has(to)) toMap.set(to, new Map());
    toMap.get(to)!.set(date, entry.rate);
  }

  return map;
}

export function getExchangeRate(
  rateMap: Map<string, Map<string, Map<string, number>>>,
  fromCurrency: string,
  toCurrency: string,
  date: string
): number {
  if (fromCurrency === toCurrency) return 1;
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  const dateKey = date.substring(0, 10);

  const toMap = rateMap.get(from);
  if (toMap) {
    const dateMap = toMap.get(to);
    if (dateMap) {
      if (dateMap.has(dateKey)) return dateMap.get(dateKey)!;
      const closest = findClosestDate(dateMap, dateKey);
      if (closest != null) return dateMap.get(closest)!;
    }
  }

  const inverseMap = rateMap.get(to);
  if (inverseMap) {
    const invDateMap = inverseMap.get(from);
    if (invDateMap) {
      if (invDateMap.has(dateKey)) return 1 / invDateMap.get(dateKey)!;
      const closest = findClosestDate(invDateMap, dateKey);
      if (closest != null) return 1 / invDateMap.get(closest)!;
    }
  }

  const eurToFrom = rateMap.get('EUR')?.get(from);
  const eurToTo = rateMap.get('EUR')?.get(to);
  if (eurToFrom && eurToTo) {
    const fromRate = eurToFrom.get(dateKey) ?? findClosestRate(eurToFrom, dateKey);
    const toRate = eurToTo.get(dateKey) ?? findClosestRate(eurToTo, dateKey);
    if (fromRate != null && toRate != null) return toRate / fromRate;
  }

  return 1;
}

function findClosestDate(map: Map<string, number>, target: string): string | null {
  const targetTs = parseDate(target);
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const d of map.keys()) {
    const diff = Math.abs(parseDate(d) - targetTs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = d;
    }
  }
  return best;
}

function findClosestRate(map: Map<string, number>, dateKey: string): number | null {
  const closest = findClosestDate(map, dateKey);
  return closest != null ? map.get(closest)! : null;
}

export async function fetchFotomomentPrices(
  symbols: string[],
  getHistory: (symbol: string) => Promise<unknown>,
  logInfo?: (msg: string) => void
): Promise<FotomomentPrices> {
  const prices: FotomomentPrices = {};
  const uniqueSymbols = [...new Set(symbols)];

  for (const symbol of uniqueSymbols) {
    try {
      const historyRaw = await getHistory(symbol);
      const quotes = unwrapArray(historyRaw);

      if (quotes.length === 0) {
        logInfo?.(`${symbol}: Geen quotes gevonden`);
        continue;
      }

      const firstDate = quotes.length > 0 ? (quotes[0].date || quotes[0].dateTime || '').substring(0, 10) : '-';
      const lastDate = quotes.length > 0 ? (quotes[quotes.length - 1].date || quotes[quotes.length - 1].dateTime || '').substring(0, 10) : '-';
      logInfo?.(`${symbol}: ${quotes.length} quotes (${firstDate} - ${lastDate})`);

      const fotomomentQuote = quotes.find((q: any) => {
        const qDate = (q.date || q.dateTime || q.timestamp || q.datetime || '').substring(0, 10);
        return qDate === FOTOMOMENT_DATE;
      });

      if (fotomomentQuote) {
        const price = fotomomentQuote.price ?? fotomomentQuote.close ?? fotomomentQuote.adjClose ?? fotomomentQuote.adjustedClose;
        if (price != null) {
          prices[symbol] = price;
          logInfo?.(`${symbol}: Fotoprijs gevonden = ${price}`);
        }
      } else {
        logInfo?.(`${symbol}: Geen quote voor ${FOTOMOMENT_DATE}`);
        const lastQ = quotes[quotes.length - 1];
        if (lastQ) {
          const lDate = (lastQ.date || lastQ.dateTime || '').substring(0, 10);
          if (lDate < FOTOMOMENT_DATE) {
            const price = lastQ.price ?? lastQ.close ?? lastQ.adjClose ?? lastQ.adjustedClose;
            if (price != null) {
              prices[symbol] = price;
              logInfo?.(`${symbol}: Laatste beschikbare prijs gebruikt (${lDate}): ${price}`);
            }
          }
        }
      }
    } catch (e: any) {
      logInfo?.(`${symbol}: Fout bij ophalen: ${e?.message ?? e}`);
      continue;
    }
  }

  return prices;
}

function convertToEur(
  amount: number,
  currency: string,
  rateMap: Map<string, Map<string, Map<string, number>>>,
  date: string
): number {
  if (currency.toUpperCase() === BASE_CURRENCY) return amount;
  const rate = getExchangeRate(rateMap, currency, BASE_CURRENCY, date);
  return amount * rate;
}

function computeGainFotomoment(
  proceedsEur: number,
  fotomomentCostEur: number,
  originalCostEur: number
): { costBasisEur: number; gainEur: number; adjusted: boolean } {
  const higher = Math.max(fotomomentCostEur, originalCostEur);
  const costBasisEur = Math.min(higher, proceedsEur);
  const adjusted = higher !== fotomomentCostEur;
  const gainEur = proceedsEur - costBasisEur;
  return { costBasisEur, gainEur, adjusted };
}

export function runFifoEngine(
  activities: NormalizedActivity[],
  rateMap: Map<string, Map<string, Map<string, number>>>,
  fotomomentPrices: FotomomentPrices,
  taxYear: number
): TaxCalculationResult {
  const buys = activities
    .filter((a) => a.activityType === 'BUY' || a.activityType === 'ADD_HOLDING' || a.activityType === 'TRANSFER_IN')
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));

  const sells = activities
    .filter((a) => a.activityType === 'SELL')
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));

  const accountNames: Record<string, string> = {};

  function createLot(
    buy: NormalizedActivity,
    rateMap: Map<string, Map<string, Map<string, number>>>,
    fotomomentPrices: FotomomentPrices
  ): TaxLot {
    const isPre2026 = isPreFotomoment(buy.date);
    const rawFee = buy.fee ?? 0;

    const rawTotalCost = buy.totalPrice || (buy.quantity * buy.unitPrice);
    const totalExFees = convertToEur(rawTotalCost, buy.currency, rateMap, buy.date);
    const feeEur = convertToEur(rawFee, buy.currency, rateMap, buy.date);
    const costExFees = totalExFees - feeEur;
    const unitCostExFees = buy.quantity > 0 ? costExFees / buy.quantity : 0;

    const rawUnitPriceEur = convertToEur(buy.unitPrice, buy.currency, rateMap, buy.date);

    if (isPre2026 && fotomomentPrices[buy.symbol] != null) {
      const fotoPrice = fotomomentPrices[buy.symbol];
      const fotomomentPriceEur = convertToEur(fotoPrice, buy.currency, rateMap, FOTOMOMENT_DATE);

      return {
        id: `lot-${buy.id}`,
        activityId: buy.id,
        symbol: buy.symbol,
        assetName: buy.assetName,
        accountId: buy.accountId,
        purchaseDate: buy.date,
        quantityPurchased: buy.quantity,
        quantityRemaining: buy.quantity,
        unitCostEur: fotomomentPriceEur,
        totalCostEur: fotomomentPriceEur * buy.quantity,
        usesFotomoment: true,
        originalUnitCostEur: rawUnitPriceEur,
        fotomomentPriceEur,
      };
    }

    return {
      id: `lot-${buy.id}`,
      activityId: buy.id,
      symbol: buy.symbol,
      assetName: buy.assetName,
      accountId: buy.accountId,
      purchaseDate: buy.date,
      quantityPurchased: buy.quantity,
      quantityRemaining: buy.quantity,
      unitCostEur: unitCostExFees,
      totalCostEur: costExFees,
      usesFotomoment: false,
      originalUnitCostEur: rawUnitPriceEur,
      fotomomentPriceEur: undefined,
    };
  }

  const allRealizedGains: RealizedGain[] = [];
  const accountIds = [...new Set([...buys.map((b) => b.accountId), ...sells.map((s) => s.accountId)])];

  for (const accountId of accountIds) {
    const accountBuys = buys.filter((b) => b.accountId === accountId);
    const accountSells = sells.filter((s) => s.accountId === accountId);

    for (const b of accountBuys) {
      if (!accountNames[b.accountId]) accountNames[b.accountId] = b.accountName;
    }

    const lots: TaxLot[] = [];
    let lotCounter = 0;

    for (const buy of accountBuys) {
      const lot = createLot(buy, rateMap, fotomomentPrices);
      lot.id = `lot-${buy.id}-${lotCounter++}`;
      lots.push(lot);
    }

    const sortedSells = [...accountSells].sort((a, b) => parseDate(a.date) - parseDate(b.date));

    for (const sell of sortedSells) {
      if (!accountNames[sell.accountId]) accountNames[sell.accountId] = sell.accountName;
      const sellYear = getYear(sell.date);
      const isCurrentYear = sellYear === taxYear;

      let remainingSellQty = sell.quantity;
      const rawProceeds = sell.totalPrice;
      const rawSellFee = sell.fee ?? 0;
      const proceedsExFees = convertToEur(rawProceeds, sell.currency, rateMap, sell.date);
      const sellFeeEur = convertToEur(rawSellFee, sell.currency, rateMap, sell.date);
      const proceedsNet = proceedsExFees - sellFeeEur;
      const sellUnitProceed = remainingSellQty > 0 ? proceedsNet / remainingSellQty : 0;

      const sellLots = lots.filter((l) => l.symbol === sell.symbol && l.quantityRemaining > 0);

      for (const lot of sellLots) {
        if (remainingSellQty <= 0) break;

        const matchQty = Math.min(remainingSellQty, lot.quantityRemaining);
        const matchProceeds = sellUnitProceed * matchQty;
        const fotomomentCost = lot.unitCostEur * matchQty;
        const originalCost = (lot.originalUnitCostEur ?? lot.unitCostEur) * matchQty;
        const { costBasisEur, gainEur, adjusted } = computeGainFotomoment(
          matchProceeds,
          fotomomentCost,
          originalCost
        );

        const gain = matchProceeds - costBasisEur;
        const taxLiability = gain > 0 ? gain * TAX_RATE : 0;

        if (isCurrentYear) {
          const origPrice = lot.originalUnitCostEur;
          const fotoPrice = lot.fotomomentPriceEur;

          allRealizedGains.push({
            id: `gain-${sell.id}-${lot.id}`,
            sellActivityId: sell.id,
            symbol: sell.symbol,
            assetName: sell.assetName,
            accountId: sell.accountId,
            accountName: accountNames[sell.accountId] || sell.accountId,
            purchaseDate: lot.purchaseDate,
            sellDate: sell.date,
            quantity: matchQty,
            proceedsEur: matchProceeds,
            costBasisEur,
            gainEur: gain,
            taxableGainEur: gain > 0 ? gain : 0,
            taxLiabilityEur: taxLiability,
            usesFotomoment: lot.usesFotomoment,
            fotomomentAdjusted: adjusted,
            originalUnitPriceEur: origPrice ?? undefined,
            fotomomentUnitPriceEur: fotoPrice ?? undefined,
            sellUnitPriceEur: sellUnitProceed,
          });
        }

        lot.quantityRemaining -= matchQty;
        remainingSellQty -= matchQty;
      }

      if (remainingSellQty > 0.0001 && isCurrentYear) {
        const uncoveredProceeds = sellUnitProceed * remainingSellQty;
        allRealizedGains.push({
          id: `gain-uncovered-${sell.id}`,
          sellActivityId: sell.id,
          symbol: sell.symbol,
          assetName: sell.assetName,
          accountId: sell.accountId,
          accountName: accountNames[sell.accountId] || sell.accountId,
          purchaseDate: FOTOMOMENT_DATE,
          sellDate: sell.date,
          quantity: remainingSellQty,
          proceedsEur: uncoveredProceeds,
          costBasisEur: 0,
          gainEur: uncoveredProceeds,
          taxableGainEur: uncoveredProceeds,
          taxLiabilityEur: uncoveredProceeds * TAX_RATE,
          usesFotomoment: false,
          fotomomentAdjusted: false,
          sellUnitPriceEur: sellUnitProceed,
        });
      }
    }
  }

  const yearGains = allRealizedGains.filter(
    (g) => getYear(g.sellDate) === taxYear
  );

  let totalMeerwaarde = 0;
  let totalVerlies = 0;

  for (const g of yearGains) {
    if (g.gainEur >= 0) totalMeerwaarde += g.gainEur;
    else totalVerlies += Math.abs(g.gainEur);
  }

  const nettoMeerwaarde = Math.max(0, totalMeerwaarde - totalVerlies);

  const vrijstellingGebruikt = Math.min(nettoMeerwaarde, ANNUAL_EXEMPTION);
  const belastbareMeerwaarde = Math.max(0, nettoMeerwaarde - ANNUAL_EXEMPTION);
  const belastingVerschuldigd = belastbareMeerwaarde * TAX_RATE;

  const summary: YearSummary = {
    year: taxYear,
    totalMeerwaarde,
    totalVerlies,
    nettoMeerwaarde,
    belastbareMeerwaarde,
    vrijstellingGebruikt,
    belastingVerschuldigd,
  };

  return {
    year: taxYear,
    realizedGains: yearGains,
    summary,
    exemptionRemaining: Math.max(0, ANNUAL_EXEMPTION - vrijstellingGebruikt),
    accountNames,
  };
}

export function calculateTax(
  activities: NormalizedActivity[],
  rawRates: unknown,
  fotomomentPrices: FotomomentPrices,
  taxYear: number
): TaxCalculationResult {
  const rateMap = buildExchangeRateMap(rawRates);
  return runFifoEngine(activities, rateMap, fotomomentPrices, taxYear);
}
