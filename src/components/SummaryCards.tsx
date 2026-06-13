import React from 'react';

interface SummaryCardsProps {
  taxPayable: number;
  taxableGain: number;
  exemptionRemaining: number;
  year: number;
}

function formatEur(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}€${Math.abs(amount).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SummaryCards({
  taxPayable,
  taxableGain,
  exemptionRemaining,
  year,
}: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground mb-1">
          Capital gains tax payable in {year}
        </p>
        <p className="text-3xl font-bold text-red-600">
          {formatEur(taxPayable)}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          10% on {formatEur(taxableGain)} taxable gain
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground mb-1">
          Remaining exemption
        </p>
        <p className="text-3xl font-bold text-green-600">
          {formatEur(exemptionRemaining)}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Total exemption {year}: €10,000
        </p>
      </div>
    </div>
  );
}
