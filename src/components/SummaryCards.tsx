import { formatEur } from "../utils/utils";
import { ANNUAL_EXEMPTION } from '../utils/constants';

interface SummaryCardsProps {
  taxOwed: number;
  taxableGain: number;
  exemptionRemaining: number;
  year: number;
}


export function SummaryCards({
  taxOwed,
  taxableGain,
  exemptionRemaining,
  year,
}: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground mb-1">
          Capital gains tax owed for {year}
        </p>
        <p className="text-3xl font-bold text-red-600">
          {formatEur(taxOwed)}
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
          Total exemption {year}: {formatEur(ANNUAL_EXEMPTION)}
        </p>
      </div>
    </div>
  );
}
