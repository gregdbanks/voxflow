import { http, HttpResponse, type DefaultBodyType, type JsonBodyType } from 'msw';

type HttpResponseLike = HttpResponse<DefaultBodyType>;
export type MockTranscriptionResponder = (body: FormData) =>
  | Promise<HttpResponseLike | { status: number; body: JsonBodyType }>
  | HttpResponseLike
  | { status: number; body: JsonBodyType };

let responder: MockTranscriptionResponder = async () =>
  HttpResponse.json({ text: 'hello world' });

export function setTranscriptionResponder(next: MockTranscriptionResponder): void {
  responder = next;
}

export function resetTranscriptionResponder(): void {
  responder = async () => HttpResponse.json({ text: 'hello world' });
}

export const handlers = [
  http.post('https://api.groq.com/openai/v1/audio/transcriptions', async ({ request }) => {
    const body = await request.formData();
    const result = await responder(body);
    if (result instanceof HttpResponse) return result as HttpResponse<DefaultBodyType>;
    return HttpResponse.json(result.body, { status: result.status });
  }),
];
