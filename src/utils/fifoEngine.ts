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

export function unwrapArray(raw: unknown): any[] {
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

export function buildExchangeRateMap(
  rawRates: unknown
): Map<string, Map<string, Map<string, number>>> {
  const map = new Map<string, Map<string, Map<string, number>>>();
  const rates = unwrapArray(rawRates);

  for (const r of rates) {
    const entry = r as ExchangeRateEntry;
    if (!entry.fromCurrency || !entry.toCurrency || entry.rate == null) continue;
    if (entry.fromCurrency === entry.toCurrency) continue;

    const from = entry.fromCurrency.toUpperCase();
    const to = entry.toCurrency.toUpperCase();
    const rawEntry = r as any;
    const date = rawEntry.timestamp?.substring(0, 10) || entry.date?.substring(0, 10);
    if (!date) continue;
    const rate = typeof entry.rate === 'string' ? parseFloat(entry.rate) : entry.rate;
    if (isNaN(rate)) continue;

    if (!map.has(from)) map.set(from, new Map());
    const toMap = map.get(from)!;
    if (!toMap.has(to)) toMap.set(to, new Map());
    toMap.get(to)!.set(date, rate);
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
  symbolToAssetId: Map<string, string>,
  getHistory: (assetId: string) => Promise<unknown>,
  logInfo?: (msg: string) => void
): Promise<FotomomentPrices> {
  const prices: FotomomentPrices = {};
  const uniqueSymbols = [...new Set(symbols)];

  for (const symbol of uniqueSymbols) {
    const assetId = symbolToAssetId.get(symbol) || symbol;
    try {
      const historyRaw = await getHistory(assetId);
      const quotes = unwrapArray(historyRaw);

      if (quotes.length === 0) {
        logInfo?.(`${symbol} (assetId=${assetId}): Geen quotes gevonden`);
        continue;
      }

      const firstQuote = quotes[0];
      const firstDate = (firstQuote.timestamp || firstQuote.date || firstQuote.dateTime || '').substring(0, 10);
      const lastDate = (quotes[quotes.length - 1].timestamp || quotes[quotes.length - 1].date || quotes[quotes.length - 1].dateTime || '').substring(0, 10);
      logInfo?.(`${symbol} (assetId=${assetId}): ${quotes.length} quotes (${firstDate} - ${lastDate})`);

      const fotomomentQuote = quotes.find((q: any) => {
        const qDate = (q.timestamp || q.date || q.dateTime || q.datetime || '').substring(0, 10);
        return qDate === FOTOMOMENT_DATE;
      });

      if (fotomomentQuote) {
        const price = fotomomentQuote.close ?? fotomomentQuote.adjclose ?? fotomomentQuote.price ?? fotomomentQuote.adjClose;
        if (price != null) {
          prices[symbol] = price;
          logInfo?.(`${symbol}: Fotoprijs gevonden = ${price}`);
        } else {
          logInfo?.(`${symbol}: Fotoprijs quote gevonden maar close/adjclose is null`);
        }
      } else {
        logInfo?.(`${symbol}: Geen quote voor ${FOTOMOMENT_DATE}`);
        const lastQ = quotes[quotes.length - 1];
        if (lastQ) {
          const lDate = (lastQ.timestamp || lastQ.date || lastQ.dateTime || '').substring(0, 10);
          if (lDate < FOTOMOMENT_DATE) {
            const price = lastQ.close ?? lastQ.adjclose ?? lastQ.price ?? lastQ.adjClose;
            if (price != null) {
              prices[symbol] = price;
              logInfo?.(`${symbol}: Laatste beschikbare prijs gebruikt (${lDate}): ${price}`);
            }
          }
        }
      }
    } catch (e: any) {
      logInfo?.(`${symbol} (assetId=${assetId}): Fout bij ophalen: ${e?.message ?? e}`);
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

    const rawTotalCost = buy.totalPrice || (buy.quantity * buy.unitPrice);
    const totalEur = convertToEur(rawTotalCost, buy.currency, rateMap, buy.date);
    const unitCost = buy.quantity > 0 ? totalEur / buy.quantity : 0;

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
      unitCostEur: unitCost,
      totalCostEur: totalEur,
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
      const matchingLots = lots.filter((l) => l.symbol === sell.symbol && l.quantityRemaining > 0);
      console.log(`[FIFO] account=${accountId}, date=${sell.date}, year=${sellYear}, isCurrentYear=${isCurrentYear}, symbol=${sell.symbol}, qty=${sell.quantity}, totalPrice=${sell.totalPrice}, matchingLots=${matchingLots.length}, totalLots=${lots.length}, totalBuys=${accountBuys.length}`);

      let remainingSellQty = sell.quantity;
      const proceedsEur = convertToEur(sell.totalPrice, sell.currency, rateMap, sell.date);
      const sellUnitPrice = remainingSellQty > 0 ? proceedsEur / remainingSellQty : 0;

      const sellLots = lots.filter((l) => l.symbol === sell.symbol && l.quantityRemaining > 0);

      for (const lot of sellLots) {
        if (remainingSellQty <= 0) break;

        const matchQty = Math.min(remainingSellQty, lot.quantityRemaining);
        const matchProceeds = sellUnitPrice * matchQty;
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
            sellUnitPriceEur: sellUnitPrice,
          });
        }

        lot.quantityRemaining -= matchQty;
        remainingSellQty -= matchQty;
      }

      if (remainingSellQty > 0.0001 && isCurrentYear) {
        const uncoveredProceeds = sellUnitPrice * remainingSellQty;
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
          sellUnitPriceEur: sellUnitPrice,
        });
      }
    }
  }

  let totalMeerwaarde = 0;
  let totalVerlies = 0;

  for (const g of allRealizedGains) {
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
    realizedGains: allRealizedGains,
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
