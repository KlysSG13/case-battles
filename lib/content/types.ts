export interface CriterionSeed {
  name: string;
  description: string;
  weight: number; // сумма весов по кейсу = 100
}

export interface CaseSeed {
  title: string;
  body: string; // 150–300 слов
  difficulty: number; // 1–3
  timeLimitSec?: number;
  criteria: CriterionSeed[];
}

export interface DomainSeed {
  slug: string;
  title: string;
  emoji: string;
  sort: number;
  cases: CaseSeed[];
}
