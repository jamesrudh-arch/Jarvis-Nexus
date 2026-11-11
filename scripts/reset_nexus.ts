import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  await db.conversationMessage.deleteMany();
  await db.conversation.deleteMany();
  await db.memoryRecord.deleteMany({ where: { sourceRef: 'Conversation with Owner' } });
  await db.securityAuditEvent.deleteMany({ where: { source: 'OwnerConsole' } });
  await db.nexusWorldState.update({
    where: { id: 1 },
    data: {
      ownerName: 'Owner',
      firstLaunchCompleted: false,
      activeMode: 'wake_auth',
      currentZone: 'central_operations',
      posX: 1.45, posZ: 0.95, yawRad: -0.42,
      locomotionState: 'idle_console_work',
      posture: 'focused_standing',
      emotionalState: 'attentive',
      activeActivitySummary: 'Reviewing primary systems assembly at Central Operations.',
      interruptedTaskStackJson: '[]',
      activeCameraPreset: 'living_presence',
      reducedMotion: false,
    },
  });
  console.log('World state reset to first-run defaults.');
}
main().finally(() => db.$disconnect());
