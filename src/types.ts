export enum GameStage {
  COUNTRIES = 1,
  CAPITALS = 2,
  SUBURBS = 3,
  LOCAL_MODE = 4,
  KNOWLEDGE_GAP = 5,
}

export interface Question {
  id: string;
  type: 'flag' | 'capital' | 'suburb' | 'local' | 'gap';
  image?: string;
  text: string;
  options: string[];
  correctAnswer: string;
  countryCode?: string;
}

export interface GameState {
  stage: GameStage;
  currentQuestionIndex: number;
  score: number;
  totalQuestions: number;
  isFinished: boolean;
  localCountry?: string;
  isAllOrNothing: boolean;
  mistakesThisSession: string[];
}

export interface UserStats {
  uid: string;
  displayName: string;
  highScore: number;
  mistakes: Record<string, number>;
  completedStages: number[];
}
