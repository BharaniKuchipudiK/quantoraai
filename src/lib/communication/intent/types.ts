export type CommunicationDomain =
  | 'general'
  | 'travel'
  | 'education'
  | 'finance'
  | 'coding'
  | 'research';

export type CommunicationMode =
  | 'ask'
  | 'plan'
  | 'build'
  | 'compare'
  | 'decide'
  | 'review';

export type CommunicationStakes = 'low' | 'medium' | 'high';

export type CommunicationAutonomy =
  | 'answer_only'
  | 'recommend'
  | 'draft';

export type CommunicationIntent = {
  domain: CommunicationDomain;
  mode: CommunicationMode;
  stakes: CommunicationStakes;
  autonomy: CommunicationAutonomy;
  needsClarification: boolean;
  userGoal: string | null;
};
