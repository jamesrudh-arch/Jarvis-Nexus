import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  await db.ownerSwitch.update({ where: { switchKey: 'microphone' }, data: { enabled: false } });
  await db.ownerSwitch.update({ where: { switchKey: 'camera' }, data: { enabled: false } });
  console.log('Sensor switches restored to privacy-first defaults (MIC/CAM OFF).');
}
main().finally(() => db.$disconnect());
