import React, { useState } from 'react';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { RefreshCw, Play } from 'lucide-react';
import { useTaxData } from '../hooks/useTaxData';
import { SummaryCards } from '../components/SummaryCards';
import { LedgerTable } from '../components/LedgerTable';

interface MeerwaardePageProps {
  ctx: AddonContext;
}

export function MeerwaardePage({ ctx }: MeerwaardePageProps) {
  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState(currentYear);
  const [started, setStarted] = useState(false);

  const { loading, error, result, refetch } = useTaxData(
    started ? ctx : null,
    taxYear
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Meerwaardebelasting</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Belgische meerwaardebelasting op aandelen (2026+)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={taxYear}
            onChange={(e) => setTaxYear(Number(e.target.value))}
            className="rounded-md border px-3 py-1.5 text-sm bg-background"
            disabled={loading}
          >
            {[2026, 2027, 2028, 2029, 2030].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {!started ? (
            <button
              onClick={() => setStarted(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Play className="h-4 w-4" />
              Maak een simulatie
            </button>
          ) : (
            <button
              onClick={refetch}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Bezig...' : 'Ververs'}
            </button>
          )}
        </div>
      </div>

      {!started ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-lg text-muted-foreground">
            Druk op <strong>"Maak een simulatie"</strong> om de meerwaardebelasting voor {taxYear} te berekenen.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            De engine doorloopt al uw aan- en verkooptransacties via de FIFO-methode en berekent de
            gerealiseerde meerwaarden.
          </p>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-4" />
          <p className="text-muted-foreground">Bezig met berekenen...</p>
          <p className="text-xs text-muted-foreground mt-1">
            Transacties ophalen, wisselkoersen laden en FIFO-matching uitvoeren
          </p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700 font-medium">Er is een fout opgetreden</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
          <button
            onClick={refetch}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 mt-4 hover:bg-red-100 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Opnieuw proberen
          </button>
        </div>
      ) : result ? (
        <>
          <SummaryCards
            belastingVerschuldigd={result.summary.belastingVerschuldigd}
            belastbareMeerwaarde={result.summary.belastbareMeerwaarde}
            exemptionRemaining={result.exemptionRemaining}
            year={taxYear}
          />

          <LedgerTable
            realizedGains={result.realizedGains}
            summary={result.summary}
            exemptionRemaining={result.exemptionRemaining}
            year={taxYear}
          />
        </>
      ) : null}
    </div>
  );
}
