import { useState } from 'react';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { RefreshCw } from 'lucide-react';
import { useTaxData } from '../hooks/useTaxData';
import { SummaryCards } from '../components/SummaryCards';
import { LedgerTable } from '../components/LedgerTable';

interface MeerwaardePageProps {
  ctx: AddonContext;
}

export function MeerwaardePage({ ctx }: MeerwaardePageProps) {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2026; y <= currentYear; y++) years.push(y);
  const [taxYear, setTaxYear] = useState(currentYear);

  const { loading, error, result } = useTaxData(ctx, taxYear);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Meerwaardebelasting</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Belgian capital gains tax on securities
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={taxYear}
            onChange={(e) => setTaxYear(Number(e.target.value))}
            className="rounded-md border px-3 py-1.5 text-sm bg-background"
            disabled={loading}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-4" />
          <p className="text-muted-foreground">Calculating...</p>
          <p className="text-xs text-muted-foreground mt-1">
            Fetching transactions, loading exchange rates, running FIFO matching
          </p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700 font-medium">An error occurred</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      ) : result ? (
        <>
          <SummaryCards
            taxOwed={result.summary.taxOwed}
            taxableGain={result.summary.taxableGain}
            exemptionRemaining={result.exemptionRemaining}
            year={taxYear}
          />

          <LedgerTable
            realizedGains={result.realizedGains}
            summary={result.summary}
            year={taxYear}
          />
        </>
      ) : null}
    </div>
  );
}
