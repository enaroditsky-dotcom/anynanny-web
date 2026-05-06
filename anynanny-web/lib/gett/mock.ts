export async function orderSafeRideMock(): Promise<{ ok: true; requestId: string }> {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return { ok: true, requestId: `gett_mock_${Date.now()}` };
}
