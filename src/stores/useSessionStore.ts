import { create } from 'zustand';
import type {
  ColorAnalysisResult,
  ConfirmedMapping,
  CvdMode,
  PatternConfig,
  RepairResult,
  SemanticAnalysis,
  SessionData,
  SourceImage,
  VerificationQuestion,
  VerificationResult,
} from '@/types';

export type AsyncOperation =
  | 'colorAnalysis'
  | 'semanticAnalysis'
  | 'repair'
  | 'verifyPrepare'
  | 'verifyEvaluate';

export interface OperationGuard {
  operation: AsyncOperation;
  revision: number;
  token: number;
}

export type RevisionGuard = number | OperationGuard;

export interface SessionActions {
  setSourceImage: (sourceImage: SourceImage | null) => void;
  setColorAnalysis: (
    colorAnalysis: ColorAnalysisResult | null,
    guard?: RevisionGuard,
  ) => boolean;
  setSemanticAnalysis: (
    semanticAnalysis: SemanticAnalysis | null,
    guard?: RevisionGuard,
  ) => boolean;
  setConfirmedMapping: (confirmedMapping: ConfirmedMapping | null) => void;
  setPatterns: (patterns: PatternConfig[]) => void;
  setRepairResult: (
    repairResult: RepairResult | null,
    guard?: RevisionGuard,
  ) => boolean;
  setReviewedQuestions: (
    reviewedQuestions: VerificationQuestion[] | null,
    guard?: RevisionGuard,
  ) => boolean;
  setVerificationResult: (
    verificationResult: VerificationResult | null,
    guard?: RevisionGuard,
  ) => boolean;
  setPreviewMode: (previewMode: CvdMode) => void;
  beginOperation: (operation: AsyncOperation) => OperationGuard;
  isGuardValid: (guard: RevisionGuard) => boolean;
  resetSession: () => void;
}

export type SessionStore = SessionData & SessionActions;

const INITIAL_SESSION_DATA: SessionData = {
  sourceImage: null,
  colorAnalysis: null,
  semanticAnalysis: null,
  confirmedMapping: null,
  patterns: [],
  repairResult: null,
  reviewedQuestions: null,
  verificationResult: null,
  previewMode: 'normal',
  revision: 0,
};

const ASYNC_OPERATIONS: readonly AsyncOperation[] = [
  'colorAnalysis',
  'semanticAnalysis',
  'repair',
  'verifyPrepare',
  'verifyEvaluate',
];

function createTokenMap(): Record<AsyncOperation, number> {
  return {
    colorAnalysis: 0,
    semanticAnalysis: 0,
    repair: 0,
    verifyPrepare: 0,
    verifyEvaluate: 0,
  };
}

/**
 * Store sesi tunggal di memori browser (tanpa persist middleware).
 * Setiap perubahan state menginvalidasi turunan yang bergantung padanya dan menaikkan `revision`
 * untuk mengabaikan respons async yang sudah kedaluwarsa.
 */
export const useSessionStore = create<SessionStore>()((set, get) => {
  const operationTokens = createTokenMap();

  const bumpTokens = (operations: readonly AsyncOperation[]): void => {
    for (const op of operations) {
      operationTokens[op] += 1;
    }
  };

  const checkGuard = (guard?: RevisionGuard): boolean => {
    if (guard === undefined) return true;
    const currentRevision = get().revision;
    if (typeof guard === 'number') {
      return guard === currentRevision;
    }
    return (
      guard.revision === currentRevision &&
      guard.token === operationTokens[guard.operation]
    );
  };

  return {
    ...INITIAL_SESSION_DATA,

    setSourceImage: (sourceImage) => {
      bumpTokens(ASYNC_OPERATIONS);
      set((state) => ({
        ...INITIAL_SESSION_DATA,
        sourceImage,
        revision: state.revision + 1,
      }));
    },

    setColorAnalysis: (colorAnalysis, guard) => {
      if (!checkGuard(guard)) return false;
      bumpTokens([
        'colorAnalysis',
        'semanticAnalysis',
        'repair',
        'verifyPrepare',
        'verifyEvaluate',
      ]);
      set((state) => ({
        colorAnalysis,
        semanticAnalysis: null,
        confirmedMapping: null,
        patterns: [],
        repairResult: null,
        reviewedQuestions: null,
        verificationResult: null,
        revision: state.revision + 1,
      }));
      return true;
    },

    setSemanticAnalysis: (semanticAnalysis, guard) => {
      if (!checkGuard(guard)) return false;
      bumpTokens([
        'semanticAnalysis',
        'repair',
        'verifyPrepare',
        'verifyEvaluate',
      ]);
      set((state) => ({
        semanticAnalysis,
        confirmedMapping: null,
        patterns: [],
        repairResult: null,
        reviewedQuestions: null,
        verificationResult: null,
        revision: state.revision + 1,
      }));
      return true;
    },

    setConfirmedMapping: (confirmedMapping) => {
      bumpTokens(['repair', 'verifyPrepare', 'verifyEvaluate']);
      set((state) => ({
        confirmedMapping,
        patterns: [],
        repairResult: null,
        reviewedQuestions: null,
        verificationResult: null,
        revision: state.revision + 1,
      }));
    },

    setPatterns: (patterns) => {
      bumpTokens(['repair', 'verifyEvaluate']);
      set((state) => ({
        patterns: [...patterns],
        repairResult: null,
        verificationResult: null,
        revision: state.revision + 1,
      }));
    },

    setRepairResult: (repairResult, guard) => {
      if (!checkGuard(guard)) return false;
      bumpTokens(['repair', 'verifyEvaluate']);
      set((state) => ({
        repairResult,
        verificationResult: null,
        revision: state.revision + 1,
      }));
      return true;
    },

    setReviewedQuestions: (reviewedQuestions, guard) => {
      if (!checkGuard(guard)) return false;
      bumpTokens(['verifyPrepare', 'verifyEvaluate']);
      set((state) => ({
        reviewedQuestions: reviewedQuestions ? [...reviewedQuestions] : null,
        verificationResult: null,
        revision: state.revision + 1,
      }));
      return true;
    },

    setVerificationResult: (verificationResult, guard) => {
      if (!checkGuard(guard)) return false;
      bumpTokens(['verifyEvaluate']);
      set((state) => ({
        verificationResult,
        revision: state.revision + 1,
      }));
      return true;
    },

    setPreviewMode: (previewMode) => {
      set({ previewMode });
    },

    beginOperation: (operation) => {
      operationTokens[operation] += 1;
      return {
        operation,
        revision: get().revision,
        token: operationTokens[operation],
      };
    },

    isGuardValid: (guard) => checkGuard(guard),

    resetSession: () => {
      bumpTokens(ASYNC_OPERATIONS);
      set((state) => ({
        ...INITIAL_SESSION_DATA,
        revision: state.revision + 1,
      }));
    },
  };
});
