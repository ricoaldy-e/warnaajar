import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ColorAnalysisResult,
  ConfirmedMapping,
  PatternConfig,
  RepairResult,
  SemanticAnalysis,
  SourceImage,
  VerificationQuestion,
  VerificationResult,
} from '@/types';
import { useSessionStore } from '../useSessionStore';

// Fixture sintetis untuk menguji state sesi, bukan data produksi.
function makeImageData(width = 4, height = 4): ImageData {
  return {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
    colorSpace: 'srgb',
  } satisfies ImageData;
}

function makeSource(name = 'peta.png'): SourceImage {
  return {
    file: new Blob(['png'], { type: 'image/png' }),
    name,
    image: makeImageData(),
  };
}

const colorAnalysisFixture: ColorAnalysisResult = {
  colors: [
    { id: 'c1', hex: '#45934F' },
    { id: 'c2', hex: '#CD4949' },
  ],
  conflicts: [
    { colorAId: 'c1', colorBId: 'c2', mode: 'deutan', deltaE: 4.2 },
  ],
  threshold: 10,
};

const semanticAnalysisFixture: SemanticAnalysis = {
  visualType: 'map',
  dataType: 'categorical',
  categories: [
    {
      colorId: 'c1',
      label: 'Hutan',
      included: true,
      order: null,
      suggestedPattern: 'diagonal',
    },
    {
      colorId: 'c2',
      label: 'Permukiman',
      included: true,
      order: null,
      suggestedPattern: 'dots',
    },
  ],
  explanation: 'Hutan dan permukiman berpotensi sulit dibedakan.',
  warnings: [],
};

const confirmedMappingFixture: ConfirmedMapping = {
  dataType: 'categorical',
  categories: [
    { colorId: 'c1', label: 'Hutan', included: true, order: null },
    { colorId: 'c2', label: 'Permukiman', included: true, order: null },
  ],
};

const patternsFixture: PatternConfig[] = [
  { colorId: 'c1', kind: 'diagonal', spacingPx: 10 },
  { colorId: 'c2', kind: 'dots', spacingPx: 12 },
];

function makeRepairFixture(): RepairResult {
  return {
    image: makeImageData(),
    appliedColorIds: ['c1', 'c2'],
    warnings: [],
  };
}

const questionsFixture: VerificationQuestion[] = [
  {
    id: 'q1',
    question: 'Wilayah manakah yang merupakan hutan?',
    expectedAnswer: 'A',
  },
];

const verificationFixture: VerificationResult = {
  mode: 'deutan',
  items: [
    {
      question: questionsFixture[0],
      before: { answer: 'B', status: 'incorrect' },
      after: { answer: 'A', status: 'correct' },
    },
  ],
  warnings: [],
};

function populateFullSession(): void {
  const store = useSessionStore.getState();
  store.setSourceImage(makeSource());
  store.setColorAnalysis(colorAnalysisFixture);
  store.setSemanticAnalysis(semanticAnalysisFixture);
  store.setConfirmedMapping(confirmedMappingFixture);
  store.setPatterns(patternsFixture);
  store.setRepairResult(makeRepairFixture());
  store.setReviewedQuestions(questionsFixture);
  store.setVerificationResult(verificationFixture);
  store.setPreviewMode('deutan');
}

describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
  });

  it('memulai dengan state awal yang bersih dan previewMode normal', () => {
    const state = useSessionStore.getState();
    expect(state.sourceImage).toBeNull();
    expect(state.colorAnalysis).toBeNull();
    expect(state.semanticAnalysis).toBeNull();
    expect(state.confirmedMapping).toBeNull();
    expect(state.patterns).toEqual([]);
    expect(state.repairResult).toBeNull();
    expect(state.reviewedQuestions).toBeNull();
    expect(state.verificationResult).toBeNull();
    expect(state.previewMode).toBe('normal');
  });

  it('menginvalidasi seluruh turunan dan mengembalikan previewMode ke normal saat sumber diganti', () => {
    populateFullSession();
    const prevRevision = useSessionStore.getState().revision;
    const nextSource = makeSource('grafik.png');

    useSessionStore.getState().setSourceImage(nextSource);

    const state = useSessionStore.getState();
    expect(state.sourceImage).toBe(nextSource);
    expect(state.colorAnalysis).toBeNull();
    expect(state.semanticAnalysis).toBeNull();
    expect(state.confirmedMapping).toBeNull();
    expect(state.patterns).toEqual([]);
    expect(state.repairResult).toBeNull();
    expect(state.reviewedQuestions).toBeNull();
    expect(state.verificationResult).toBeNull();
    expect(state.previewMode).toBe('normal');
    expect(state.revision).toBe(prevRevision + 1);
  });

  it('menginvalidasi semantic, mapping, pola, repair, pertanyaan, dan verification saat colorAnalysis berubah', () => {
    populateFullSession();
    const prevRevision = useSessionStore.getState().revision;
    const updatedAnalysis: ColorAnalysisResult = {
      ...colorAnalysisFixture,
      threshold: 12,
    };

    const committed = useSessionStore.getState().setColorAnalysis(updatedAnalysis);

    expect(committed).toBe(true);
    const state = useSessionStore.getState();
    expect(state.sourceImage).not.toBeNull();
    expect(state.colorAnalysis).toEqual(updatedAnalysis);
    expect(state.semanticAnalysis).toBeNull();
    expect(state.confirmedMapping).toBeNull();
    expect(state.patterns).toEqual([]);
    expect(state.repairResult).toBeNull();
    expect(state.reviewedQuestions).toBeNull();
    expect(state.verificationResult).toBeNull();
    expect(state.previewMode).toBe('deutan');
    expect(state.revision).toBe(prevRevision + 1);
  });

  it('menginvalidasi pola, repair, pertanyaan, dan verification saat mapping dikonfirmasi ulang', () => {
    populateFullSession();
    const prevRevision = useSessionStore.getState().revision;
    const updatedMapping: ConfirmedMapping = {
      dataType: 'categorical',
      categories: [
        { colorId: 'c1', label: 'Hutan Primer', included: true, order: null },
        { colorId: 'c2', label: 'Latar', included: false, order: null },
      ],
    };

    useSessionStore.getState().setConfirmedMapping(updatedMapping);

    const state = useSessionStore.getState();
    expect(state.sourceImage).not.toBeNull();
    expect(state.colorAnalysis).toEqual(colorAnalysisFixture);
    expect(state.semanticAnalysis).toEqual(semanticAnalysisFixture);
    expect(state.confirmedMapping).toEqual(updatedMapping);
    expect(state.patterns).toEqual([]);
    expect(state.repairResult).toBeNull();
    expect(state.reviewedQuestions).toBeNull();
    expect(state.verificationResult).toBeNull();
    expect(state.revision).toBe(prevRevision + 1);
  });

  it('menginvalidasi repair dan verification saat pola diubah sambil mempertahankan pertanyaan valid', () => {
    populateFullSession();
    const prevRevision = useSessionStore.getState().revision;
    const updatedPatterns: PatternConfig[] = [
      { colorId: 'c1', kind: 'crosshatch', spacingPx: 8 },
      { colorId: 'c2', kind: 'horizontal', spacingPx: 12 },
    ];

    useSessionStore.getState().setPatterns(updatedPatterns);

    const state = useSessionStore.getState();
    expect(state.confirmedMapping).toEqual(confirmedMappingFixture);
    expect(state.patterns).toEqual(updatedPatterns);
    expect(state.repairResult).toBeNull();
    expect(state.reviewedQuestions).toEqual(questionsFixture);
    expect(state.verificationResult).toBeNull();
    expect(state.revision).toBe(prevRevision + 1);
  });

  it('menginvalidasi verification saat pertanyaan atau kunci diubah', () => {
    populateFullSession();
    const prevRevision = useSessionStore.getState().revision;
    const nextQuestions: VerificationQuestion[] = [
      { id: 'q1', question: 'Mana wilayah permukiman?', expectedAnswer: 'B' },
    ];

    const committed = useSessionStore.getState().setReviewedQuestions(nextQuestions);

    expect(committed).toBe(true);
    const state = useSessionStore.getState();
    expect(state.repairResult).not.toBeNull();
    expect(state.reviewedQuestions).toEqual(nextQuestions);
    expect(state.verificationResult).toBeNull();
    expect(state.revision).toBe(prevRevision + 1);
  });

  it('tidak mengubah state lain atau menaikkan revision saat previewMode diganti', () => {
    populateFullSession();
    const prevRevision = useSessionStore.getState().revision;
    const guard = useSessionStore.getState().beginOperation('verifyEvaluate');

    useSessionStore.getState().setPreviewMode('protan');

    const state = useSessionStore.getState();
    expect(state.previewMode).toBe('protan');
    expect(state.revision).toBe(prevRevision);
    expect(state.confirmedMapping).toEqual(confirmedMappingFixture);
    expect(state.repairResult).not.toBeNull();
    expect(state.verificationResult).toEqual(verificationFixture);
    expect(state.isGuardValid(guard)).toBe(true);
  });

  it('mengabaikan respons async yang berasal dari revision lama', () => {
    const store = useSessionStore.getState();
    store.setSourceImage(makeSource('awal.png'));
    store.setColorAnalysis(colorAnalysisFixture);
    const staleRevision = useSessionStore.getState().revision;

    // Sumber diganti sebelum request AI selesai.
    store.setSourceImage(makeSource('baru.png'));
    const committed = store.setSemanticAnalysis(
      semanticAnalysisFixture,
      staleRevision,
    );

    expect(committed).toBe(false);
    expect(useSessionStore.getState().semanticAnalysis).toBeNull();
  });

  it('menerapkan latest request wins pada retry operasi yang overlap', () => {
    const store = useSessionStore.getState();
    store.setSourceImage(makeSource());
    store.setColorAnalysis(colorAnalysisFixture);

    const firstGuard = store.beginOperation('semanticAnalysis');
    const secondGuard = store.beginOperation('semanticAnalysis');

    expect(store.isGuardValid(firstGuard)).toBe(false);
    expect(store.isGuardValid(secondGuard)).toBe(true);

    const firstResult: SemanticAnalysis = {
      ...semanticAnalysisFixture,
      explanation: 'Respons pertama (terlambat)',
    };
    const secondResult: SemanticAnalysis = {
      ...semanticAnalysisFixture,
      explanation: 'Respons terbaru',
    };

    expect(store.setSemanticAnalysis(firstResult, firstGuard)).toBe(false);
    expect(useSessionStore.getState().semanticAnalysis).toBeNull();

    expect(store.setSemanticAnalysis(secondResult, secondGuard)).toBe(true);
    expect(useSessionStore.getState().semanticAnalysis?.explanation).toBe(
      'Respons terbaru',
    );
  });

  it('mengganti hasil verification aktif saat evaluate mode lain', () => {
    populateFullSession();
    const guard = useSessionStore.getState().beginOperation('verifyEvaluate');
    const protanResult: VerificationResult = {
      mode: 'protan',
      items: [],
      warnings: ['Mode protan'],
    };

    const committed = useSessionStore
      .getState()
      .setVerificationResult(protanResult, guard);

    expect(committed).toBe(true);
    expect(useSessionStore.getState().verificationResult).toEqual(protanResult);
  });

  it('mengabaikan respons async yang datang setelah resetSession', () => {
    const store = useSessionStore.getState();
    store.setSourceImage(makeSource());
    store.setColorAnalysis(colorAnalysisFixture);
    const guard = store.beginOperation('semanticAnalysis');

    store.resetSession();

    expect(store.isGuardValid(guard)).toBe(false);
    expect(store.setSemanticAnalysis(semanticAnalysisFixture, guard)).toBe(
      false,
    );
    expect(useSessionStore.getState().sourceImage).toBeNull();
    expect(useSessionStore.getState().semanticAnalysis).toBeNull();
  });
});
