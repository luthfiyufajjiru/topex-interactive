import { hc } from 'hono/client';
import type { AppType } from '@server/index';
import type { TopexQueryParams, TopexApiResponse } from '@/types';

// Initialize Hono RPC client targeting the current origin
export const rpcClient = hc<AppType>('/');

/**
 * Executes a typed query against the Hono backend proxy
 */
export async function extractTopexData(params: TopexQueryParams): Promise<TopexApiResponse> {
  const res = await rpcClient.api.topex.extract.$post({
    json: params,
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Server error: ${res.statusText}`);
  }

  return data as TopexApiResponse;
}
