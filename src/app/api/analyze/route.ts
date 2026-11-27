import { analyzeImage } from '@/modules/ai-analysis/analyze';
import { errorResponse, parseAnalyzeRequest } from '@/modules/ai-analysis/http';

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await parseAnalyzeRequest(request);
    return Response.json(await analyzeImage(input, request.signal));
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
