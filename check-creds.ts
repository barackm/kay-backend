import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { decrypt } from "./src/services/encryption.js";

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "Jeff@te.com" },
  });

  if (!user) {
    console.log("User not found");
    return;
  }

  const credentials = await prisma.userServerCredential.findMany({
    where: { userId: user.id },
    include: { server: true },
  });

  console.log("\n=== User Credentials ===");
  console.log(`User: ${user.email} (ID: ${user.id})`);
  console.log(`\nConnected servers: ${credentials.length}\n`);

  for (const cred of credentials) {
    console.log(`Server: ${cred.server.name}`);
    console.log(`Package: ${cred.server.npmPackage}`);

    try {
      const decryptedEnv = decrypt(cred.encryptedEnvVars);
      const envObj = JSON.parse(decryptedEnv);
      console.log("Credentials:");
      for (const [key, value] of Object.entries(envObj)) {
        if (key.includes("TOKEN") || key.includes("PASSWORD")) {
          console.log(`  ${key}: ${String(value).substring(0, 10)}...`);
        } else {
          console.log(`  ${key}: ${value}`);
        }
      }
    } catch (error) {
      console.log("Error decrypting:", error);
    }
    console.log();
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
