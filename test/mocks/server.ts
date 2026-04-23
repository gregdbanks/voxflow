import { setupServer } from 'msw/node';
import { handlers, resetTranscriptionResponder } from './handlers.js';

export const server = setupServer(...handlers);

export function resetAllMocks(): void {
  server.resetHandlers(...handlers);
  resetTranscriptionResponder();
}
