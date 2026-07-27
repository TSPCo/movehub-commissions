export interface CommissionCalcInput {
  /** Null means no month-start snapshot has been taken yet for this user/month. */
  fileCountAtStart: number | null;
  completions: number;
  commissionPerMatterPence: number;
  bonusUpliftPercent: number;
  bonusThresholdNumerator: number;
  bonusThresholdDenominator: number;
}

export interface CommissionCalcResult {
  basePence: number;
  /** Null when there's no snapshot to base a threshold on. */
  bonusThreshold: number | null;
  bonusHit: boolean;
  bonusPence: number;
  totalPence: number;
}

/**
 * £X per completed matter, plus a percentage uplift if completions this
 * month reach a fraction (default 1/3, rounded down) of the matters the
 * person had open at the start of the month. Rounding down was an explicit
 * choice — e.g. 20 files at month start needs only 6 completions (not 7)
 * to hit the bonus.
 */
export function calculateCommission(input: CommissionCalcInput): CommissionCalcResult {
  const basePence = input.completions * input.commissionPerMatterPence;

  if (input.fileCountAtStart == null) {
    return { basePence, bonusThreshold: null, bonusHit: false, bonusPence: 0, totalPence: basePence };
  }

  const bonusThreshold = Math.floor(
    (input.fileCountAtStart * input.bonusThresholdNumerator) / input.bonusThresholdDenominator
  );
  const bonusHit = input.completions >= bonusThreshold;
  const bonusPence = bonusHit ? Math.round(basePence * (input.bonusUpliftPercent / 100)) : 0;

  return { basePence, bonusThreshold, bonusHit, bonusPence, totalPence: basePence + bonusPence };
}
