import { prisma } from "../../db/client.js";

const STATE_EXPIRY_MS = 10 * 60 * 1000;

export async function storeState(
  state: string,
  kaySessionId?: string,
  serviceName?: string
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + STATE_EXPIRY_MS);

  await prisma.oAuthState.upsert({
    where: { state },
    create: {
      state,
      kaySessionId: kaySessionId || null,
      serviceName: serviceName || null,
      createdAt: now,
      expiresAt,
    },
    update: {
      kaySessionId: kaySessionId || null,
      serviceName: serviceName || null,
      expiresAt,
    },
  });
}

export async function getStateKaySessionId(
  state: string
): Promise<string | undefined> {
  const data = await prisma.oAuthState.findUnique({
    where: { state },
  });

  if (!data) {
    return undefined;
  }

  if (Date.now() >= data.expiresAt.getTime()) {
    await prisma.oAuthState.delete({ where: { state } });
    return undefined;
  }

  return data.kaySessionId || undefined;
}

export async function getStateServiceName(
  state: string
): Promise<string | undefined> {
  const data = await prisma.oAuthState.findUnique({
    where: { state },
  });

  if (!data || Date.now() >= data.expiresAt.getTime()) {
    return undefined;
  }

  return data.serviceName || undefined;
}

export async function validateState(state: string): Promise<boolean> {
  const data = await prisma.oAuthState.findUnique({
    where: { state },
  });

  if (!data) {
    return false;
  }

  const isValid = Date.now() < data.expiresAt.getTime();
  if (!isValid) {
    await prisma.oAuthState.delete({ where: { state } });
  }

  return isValid;
}

export async function removeState(state: string): Promise<void> {
  await prisma.oAuthState.deleteMany({
    where: { state },
  });
}

export async function cleanupExpiredStates(): Promise<void> {
  const now = new Date();
  await prisma.oAuthState.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });
}

setInterval(() => {
  cleanupExpiredStates().catch(console.error);
}, 5 * 60 * 1000);
