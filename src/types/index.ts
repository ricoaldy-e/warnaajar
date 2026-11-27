// Satu-satunya sumber tipe bersama (PRD.md §8.1). Ubah hanya lewat kesepakatan tim.
export type CvdMode = 'normal' | 'protan' | 'deutan' | 'tritan' | 'grayscale';
export type SimulatedMode = Exclude<CvdMode, 'normal'>;
export type VisualType = 'bar' | 'pie' | 'line' | 'map' | 'table' | 'unknown';
export type DataType = 'categorical' | 'ordinal' | 'unknown';
export type PatternKind = 'diagonal' | 'dots' | 'horizontal' | 'crosshatch';

export interface ColorSwatch {
  id: string;
  hex: string; // #RRGGBB
}

export interface ColorConflict {
  colorAId: string;
  colorBId: string;
  mode: SimulatedMode;
  deltaE: number;
}

export interface ColorAnalysisResult {
  colors: ColorSwatch[];
  conflicts: ColorConflict[];
  threshold: number;
}

export interface SemanticCategory {
  colorId: string;
  label: string | null;
  included: boolean;
  order: number | null; // only for confirmed ordinal data
  suggestedPattern?: PatternKind;
}

export interface SemanticAnalysis {
  visualType: VisualType;
  dataType: DataType;
  categories: SemanticCategory[];
  explanation: string;
  warnings: string[];
}

export interface PatternConfig {
  colorId: string;
  kind: PatternKind;
  spacingPx: number;
}

export interface RepairResult {
  image: ImageData; // client only; not serialized to API
  appliedColorIds: string[]; // means pattern applied, not certified readable
  warnings: string[];
}

export interface VerificationQuestion {
  id: string;
  question: string;
  expectedAnswer: string;
}

export type AnswerStatus = 'correct' | 'incorrect' | 'uncertain';
export interface VerifiedAnswer {
  answer: string | null;
  status: AnswerStatus;
}
export interface VerificationItem {
  question: VerificationQuestion;
  before: VerifiedAnswer;
  after: VerifiedAnswer;
}
export interface VerificationResult {
  mode: SimulatedMode;
  items: VerificationItem[];
  warnings: string[];
}

// Tambahan integrasi dan state sesi (CONTRACTS.md §2.1 & §7).
export interface ConfirmedMapping {
  dataType: Exclude<DataType, 'unknown'>;
  categories: SemanticCategory[];
}

export interface AnalysisContext {
  subject?: string;
  grade?: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface SourceImage {
  file: Blob;
  name: string;
  image: ImageData;
}

export interface SessionData {
  sourceImage: SourceImage | null;
  colorAnalysis: ColorAnalysisResult | null;
  semanticAnalysis: SemanticAnalysis | null;
  confirmedMapping: ConfirmedMapping | null;
  patterns: PatternConfig[];
  repairResult: RepairResult | null;
  reviewedQuestions: VerificationQuestion[] | null;
  verificationResult: VerificationResult | null;
  previewMode: CvdMode;
  revision: number;
}
