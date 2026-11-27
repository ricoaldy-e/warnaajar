import { errorResponse, parseVerifyRequest } from '@/modules/ai-analysis/http';
import { prepareQuestions } from '@/modules/verification/prepare';
import { evaluateQuestions } from '@/modules/verification/evaluate';

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await parseVerifyRequest(request);
    if (input.action === 'evaluate') return Response.json(await evaluateQuestions(input, request.signal));
    return Response.json(await prepareQuestions(input, request.signal));
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
