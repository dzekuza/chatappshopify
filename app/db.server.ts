import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

// One client per process, in every environment. Each warm Vercel lambda keeps
// its module scope, so a second client would double the connections opened
// against the Supabase transaction pooler — which is shared with the other
// deployment of this app and already the source of pool-timeout crashes.
// Keep `connection_limit=1` on DATABASE_URL for the same reason.
const prisma = global.prismaGlobal ?? new PrismaClient();

global.prismaGlobal = prisma;

export default prisma;
