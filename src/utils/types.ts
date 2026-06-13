export interface NormalizedActivity {
  id: string;
  accountId: string;
  accountName: string;
  symbol: string;
  assetId: string;
  assetName: string;
  activityType: 'BUY' | 'SELL' | 'ADD_HOLDING' | 'TRANSFER_IN';
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  currency: string;
  date: string;
}

export interface ExchangeRateEntry {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  date: string;
}

export interface TaxLot {
  id: string;
  activityId: string;
  symbol: string;
  assetName: string;
  accountId: string;
  purchaseDate: string;
  quantityPurchased: number;
  quantityRemaining: number;
  unitCostEur: number;
  totalCostEur: number;
  usesFotomoment: boolean;
  originalUnitCostEur?: number;
  fotomomentPriceEur?: number;
}

export interface RealizedGain {
  id: string;
  sellActivityId: string;
  symbol: string;
  assetName: string;
  accountId: string;
  accountName: string;
  purchaseDate: string;
  sellDate: string;
  quantity: number;
  proceedsEur: number;
  costBasisEur: number;
  gainEur: number;
  taxableGainEur: number;
  taxLiabilityEur: number;
  usesFotomoment: boolean;
  fotomomentAdjusted: boolean;
  originalUnitPriceEur?: number;
  fotomomentUnitPriceEur?: number;
  sellUnitPriceEur: number;
}

export interface YearSummary {
  year: number;
  totalMeerwaarde: number;
  totalVerlies: number;
  nettoMeerwaarde: number;
  belastbareMeerwaarde: number;
  vrijstellingGebruikt: number;
  belastingVerschuldigd: number;
}

export interface FotomomentPrices {
  [symbol: string]: number;
}

export interface TaxCalculationResult {
  year: number;
  realizedGains: RealizedGain[];
  summary: YearSummary;
  exemptionRemaining: number;
  accountNames: Record<string, string>;
}

export interface TaxDataState {
  loading: boolean;
  error: string | null;
  result: TaxCalculationResult | null;
}
