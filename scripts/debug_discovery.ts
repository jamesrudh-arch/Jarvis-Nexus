import { RailwayIntel } from "@nexus/railway";
import { NexusDb, migrate } from "@nexus/db";
const db = NexusDb.open(":memory:");
migrate(db);
const intel = new RailwayIntel({ db, env: { ...process.env, RAILWAY_READ_ONLY: "true" } as Record<string, string | undefined> });
const r = await intel.discovery.discoverAll();
if (!r.ok) {
  console.log("DISCOVERY FAILED:", JSON.stringify(r.error.toJSON()));
} else {
  console.log(JSON.stringify({
    ok: true,
    projects: r.value.projects.map(p => ({ id: p.id, name: p.name, workspaceId: p.workspaceId })),
    environments: r.value.environments.length,
    serviceInstances: r.value.serviceInstances.map(s => ({ name: s.serviceName, latest: s.latestDeployment?.status })),
    volumes: r.value.volumes.length,
    classifications: r.value.classifications,
    clientStats: intel.client.stats(),
  }, null, 2));
}
db.close();
