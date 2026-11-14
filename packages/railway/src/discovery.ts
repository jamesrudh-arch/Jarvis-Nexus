/**
 * @nexus/railway — complete infrastructure discovery (directive §4).
 *
 * Discovers every resource class the authenticated token can see:
 * workspace, projects, environments, service instances (+ latest deployments,
 * domains), deployment history, volumes, volume backups + schedules,
 * platform status, project events and workspace audit logs.
 *
 * Honest-classification guarantees:
 *  - a resource the API errors on is recorded `inaccessible` with the reason,
 *    never silently dropped;
 *  - the `variables` query is NEVER issued (returns secret values inline);
 *  - nothing is marked "discovered" that the API did not return.
 */
import type { RailwayClient } from "./client";
import type { RailwayResult } from "./errors";
import { railwayOk } from "./errors";
import {
  Q_PROJECTS, Q_WORKSPACE, Q_PLATFORM_STATUS, Q_PROJECT_ENVIRONMENTS,
  Q_SERVICE_INSTANCES, Q_ENVIRONMENT_DEPLOYMENTS, Q_VOLUME_INSTANCES,
  Q_VOLUME_BACKUPS, Q_VOLUME_BACKUP_SCHEDULES, Q_PROJECT_EVENTS,
  Q_WORKSPACE_AUDIT_LOGS,
} from "./queries";
import type {
  ClassificationEntry, InfrastructureSnapshot, RailwayDeploymentModel,
  RailwayDomainModel, RailwayEnvironmentModel, RailwayEventModel,
  RailwayProjectModel, RailwayServiceInstanceModel, RailwayVolumeBackupModel,
  RailwayVolumeModel, RailwayWorkspaceModel,
} from "./model";
import { emptySnapshot } from "./model";
import type { DeploymentStatus } from "./model";

export interface DiscoveryOptions {
  /** Focus project (RAILWAY_PROJECT_ID). When unset, all accessible projects are discovered. */
  projectId?: string;
  /** Deployment history depth per environment. */
  deploymentsPerEnvironment?: number;
  /** Project events depth. */
  eventLimit?: number;
  /** Workspace audit-log depth (null disables). */
  auditLogLimit?: number | null;
}

export class DiscoveryService {
  constructor(
    private readonly client: RailwayClient,
    private readonly opts: DiscoveryOptions = {},
  ) {}

  /** Full discovery sweep. Client-side TTL cache makes repeated sweeps cheap. */
  async discoverAll(): Promise<RailwayResult<InfrastructureSnapshot>> {
    const snapshot = emptySnapshot(new Date().toISOString());
    const classifications: ClassificationEntry[] = snapshot.classifications;

    // ---- projects ----------------------------------------------------------
    const projectsRes = await this.client.request<{
      projects: { edges: Array<{ node: any }> };
    }>(Q_PROJECTS, { first: 50 });
    if (!projectsRes.ok) return { ok: false, error: projectsRes.error };
    const projects: RailwayProjectModel[] = projectsRes.value.data.projects.edges.map((e) => ({
      id: String(e.node.id),
      name: String(e.node.name),
      description: e.node.description ?? null,
      workspaceId: e.node.workspaceId ?? null,
      isPublic: Boolean(e.node.isPublic),
      createdAt: String(e.node.createdAt),
      updatedAt: String(e.node.updatedAt),
    }));
    snapshot.projects = projects;
    const focus = this.opts.projectId
      ? projects.filter((p) => p.id === this.opts.projectId)
      : projects;
    if (this.opts.projectId && focus.length === 0) {
      classifications.push({
        resource: `project:${this.opts.projectId}`,
        classification: "missing",
        reason: "RAILWAY_PROJECT_ID does not match any project visible to this token",
      });
    }

    // ---- workspace (via first project's workspaceId) ------------------------
    const workspaceId = focus[0]?.workspaceId ?? projects[0]?.workspaceId ?? null;
    if (workspaceId) {
      const wsRes = await this.client.request<{ workspace: any }>(Q_WORKSPACE, { id: workspaceId });
      if (wsRes.ok && wsRes.value.data.workspace) {
        const w = wsRes.value.data.workspace;
        const workspace: RailwayWorkspaceModel = {
          id: String(w.id), name: String(w.name),
          plan: w.plan ?? null, projectCount: w.projectCount ?? null, createdAt: w.createdAt ?? null,
        };
        snapshot.workspace = workspace;
      } else if (!wsRes.ok) {
        classifications.push({ resource: `workspace:${workspaceId}`, classification: "inaccessible", reason: `workspace query failed: ${wsRes.error.kind}` });
        snapshot.workspace = null;
      }
    } else {
      classifications.push({ resource: "workspace", classification: "unsupported", reason: "no project reports a workspaceId (workspace tokens may not expose it)" });
    }

    // ---- platform status -----------------------------------------------------
    const psRes = await this.client.request<{ platformStatus: any }>(Q_PLATFORM_STATUS, {});
    if (psRes.ok) {
      const ps = psRes.value.data.platformStatus;
      snapshot.platformStatus = {
        isStable: Boolean(ps?.isStable),
        incident: ps?.incident ? { id: String(ps.incident.id), message: String(ps.incident.message), status: String(ps.incident.status), url: String(ps.incident.url), createdAt: ps.incident.createdAt ?? null } : null,
        maintenance: ps?.maintenance ? { id: String(ps.maintenance.id), message: String(ps.maintenance.message), status: String(ps.maintenance.status), start: String(ps.maintenance.start), url: String(ps.maintenance.url) } : null,
      };
    } else {
      classifications.push({ resource: "platformStatus", classification: "inaccessible", reason: `platformStatus query failed: ${psRes.error.kind}` });
    }

    // ---- per-project environments / service instances / deployments ---------
    for (const project of focus) {
      const envRes = await this.client.request<{
        project: { environments: { edges: Array<{ node: any }> } } | null;
      }>(Q_PROJECT_ENVIRONMENTS, { projectId: project.id, first: 50 });
      if (!envRes.ok || !envRes.value.data.project) {
        classifications.push({ resource: `project:${project.id}:environments`, classification: "inaccessible", reason: `environments query failed: ${envRes.ok ? "null project" : envRes.error.kind}` });
        continue;
      }
      const environments: RailwayEnvironmentModel[] = envRes.value.data.project.environments.edges.map((e) => ({
        id: String(e.node.id), name: String(e.node.name), projectId: project.id,
        isEphemeral: Boolean(e.node.isEphemeral),
        createdAt: String(e.node.createdAt), updatedAt: String(e.node.updatedAt),
      }));
      snapshot.environments.push(...environments);

      for (const env of environments) {
        // service instances + latest deployment + domains
        const siRes = await this.client.request<{
          environment: { serviceInstances: { edges: Array<{ node: any }> } } | null;
        }>(Q_SERVICE_INSTANCES, { projectId: project.id, environmentId: env.id });
        if (!siRes.ok || !siRes.value.data.environment) {
          classifications.push({ resource: `environment:${env.id}:serviceInstances`, classification: "inaccessible", reason: `serviceInstances query failed: ${siRes.ok ? "null environment" : siRes.error.kind}` });
        } else {
          const instances: RailwayServiceInstanceModel[] = siRes.value.data.environment.serviceInstances.edges.map((e) => {
            const n = e.node;
            const latest = n.latestDeployment
              ? this.normalizeDeployment(n.latestDeployment)
              : null;
            const domains: RailwayDomainModel[] = [
              ...(n.domains?.serviceDomains ?? []).map((d: any) => ({
                kind: "service" as const, domain: String(d.domain), status: String(d.syncStatus),
                targetPort: d.targetPort ?? null, suffix: d.suffix ?? null,
              })),
              ...(n.domains?.customDomains ?? []).map((d: any) => ({
                kind: "custom" as const,
                domain: String(d.domain),
                // CustomDomain.status is an OBJECT (verified + certificateStatus) in the live schema
                status: d.status
                  ? d.status.verified
                    ? "VERIFIED"
                    : `certificate:${String(d.status.certificateStatus ?? "UNKNOWN")}`
                  : "UNKNOWN",
                targetPort: null, suffix: null,
              })),
            ];
            return {
              id: String(n.id), serviceId: String(n.serviceId), serviceName: String(n.serviceName),
              environmentId: String(n.environmentId), region: n.region ?? null,
              healthcheckPath: n.healthcheckPath ?? null,
              restartPolicyType: String(n.restartPolicyType ?? "UNKNOWN"),
              restartPolicyMaxRetries: Number(n.restartPolicyMaxRetries ?? 0),
              numReplicas: n.numReplicas ?? null, hasEverDeployed: Boolean(n.hasEverDeployed),
              sleepApplication: n.sleepApplication ?? null, builder: n.builder ?? null,
              latestDeployment: latest, domains,
            };
          });
          snapshot.serviceInstances.push(...instances);
        }

        // deployment history
        const depRes = await this.client.request<{
          environment: { deployments: { edges: Array<{ node: any }> } } | null;
        }>(Q_ENVIRONMENT_DEPLOYMENTS, {
          projectId: project.id, environmentId: env.id,
          first: this.opts.deploymentsPerEnvironment ?? 20,
        });
        if (!depRes.ok || !depRes.value.data.environment) {
          classifications.push({ resource: `environment:${env.id}:deployments`, classification: "inaccessible", reason: `deployments query failed: ${depRes.ok ? "null environment" : depRes.error.kind}` });
        } else {
          const deployments = depRes.value.data.environment.deployments.edges.map((e) => this.normalizeDeployment(e.node));
          snapshot.recentDeployments.push(...deployments);
        }

        // volumes
        const volRes = await this.client.request<{
          environment: { volumeInstances: { edges: Array<{ node: any }> } } | null;
        }>(Q_VOLUME_INSTANCES, { projectId: project.id, environmentId: env.id });
        if (!volRes.ok || !volRes.value.data.environment) {
          classifications.push({ resource: `environment:${env.id}:volumeInstances`, classification: "inaccessible", reason: `volumeInstances query failed: ${volRes.ok ? "null environment" : volRes.error.kind}` });
        } else {
          const volumes: RailwayVolumeModel[] = volRes.value.data.environment.volumeInstances.edges.map((e) => {
            const n = e.node;
            return {
              id: String(n.id), volumeId: String(n.volumeId), serviceId: n.serviceId ?? null,
              environmentId: String(n.environmentId), sizeMB: Number(n.sizeMB ?? 0),
              currentSizeMB: n.currentSizeMB ?? null, mountPath: String(n.mountPath ?? ""),
              state: String(n.state ?? "UNKNOWN"), region: n.region ?? null, createdAt: String(n.createdAt),
            };
          });
          snapshot.volumes.push(...volumes);

          // backups + schedules per volume instance (existence only — never claimed recoverable)
          for (const volume of volumes) {
            const backups: RailwayVolumeBackupModel[] = [];
            const bRes = await this.client.request<{ volumeInstanceBackupList: any[] }>(Q_VOLUME_BACKUPS, { volumeInstanceId: volume.id });
            let schedules: RailwayVolumeBackupModel["schedules"] = [];
            if (bRes.ok) {
              const sRes = await this.client.request<{ volumeInstanceBackupScheduleList: any[] }>(Q_VOLUME_BACKUP_SCHEDULES, { volumeInstanceId: volume.id });
              if (sRes.ok) {
                schedules = (sRes.value.data.volumeInstanceBackupScheduleList ?? []).map((s) => ({
                  id: String(s.id), name: s.name ?? null, kind: s.kind ?? null,
                  cron: s.cron ?? null, retentionSeconds: s.retentionSeconds ?? null,
                }));
              } else {
                classifications.push({ resource: `volume:${volume.id}:schedules`, classification: "inaccessible", reason: `backup schedule query failed: ${sRes.error.kind}` });
              }
              for (const b of bRes.value.data.volumeInstanceBackupList ?? []) {
                backups.push({
                  id: String(b.id), name: b.name ?? null, volumeInstanceId: volume.id,
                  createdAt: String(b.createdAt), expiresAt: b.expiresAt ?? null,
                  usedMB: b.usedMB ?? null, referencedMB: b.referencedMB ?? null,
                  volumeInstanceSizeMB: b.volumeInstanceSizeMB ?? null,
                  schedules, verified: false, recoverability: "UNVERIFIED",
                });
              }
            } else {
              classifications.push({ resource: `volume:${volume.id}:backups`, classification: "inaccessible", reason: `backup list query failed: ${bRes.error.kind}` });
            }
            snapshot.volumeBackups.push(...backups);
          }
        }
      }

      // project events
      const evRes = await this.client.request<{
        events: { edges: Array<{ node: any }> };
      }>(Q_PROJECT_EVENTS, { projectId: project.id, first: this.opts.eventLimit ?? 50 });
      if (evRes.ok) {
        const events: RailwayEventModel[] = evRes.value.data.events.edges.map((e) => ({
          id: String(e.node.id), action: String(e.node.action), object: String(e.node.object),
          severity: String(e.node.severity), createdAt: String(e.node.createdAt),
          projectId: e.node.projectId ?? null, environmentId: e.node.environmentId ?? null,
          payload: e.node.payload ?? null,
        }));
        snapshot.recentEvents.push(...events);
      } else {
        classifications.push({ resource: `project:${project.id}:events`, classification: "inaccessible", reason: `events query failed: ${evRes.error.kind}` });
      }
    }

    // ---- workspace audit logs (metadata only — no payloads with secrets) ----
    if (this.opts.auditLogLimit !== null && this.opts.auditLogLimit !== undefined && workspaceId) {
      const alRes = await this.client.request<{ auditLogs: { edges: Array<{ node: any }> } }>(Q_WORKSPACE_AUDIT_LOGS, { workspaceId, first: this.opts.auditLogLimit });
      if (!alRes.ok) {
        classifications.push({ resource: `workspace:${workspaceId}:auditLogs`, classification: "inaccessible", reason: `auditLogs query failed: ${alRes.error.kind}` });
      }
      // audit log metadata is surfaced through intelligence queries, not stored here
    }

    return railwayOk(snapshot);
  }

  private normalizeDeployment(node: any): RailwayDeploymentModel {
    return {
      id: String(node.id),
      status: (String(node.status ?? "UNKNOWN") as DeploymentStatus),
      serviceId: node.serviceId ?? null,
      environmentId: String(node.environmentId ?? ""),
      projectId: String(node.projectId ?? ""),
      createdAt: String(node.createdAt ?? ""),
      updatedAt: node.updatedAt ?? null,
      statusUpdatedAt: node.statusUpdatedAt ?? null,
      staticUrl: node.staticUrl ?? null,
      url: node.url ?? null,
      canRedeploy: node.canRedeploy ?? undefined,
      canRollback: node.canRollback ?? undefined,
      deploymentStopped: node.deploymentStopped ?? undefined,
      meta: node.meta ?? null,
      creator: node.creator ? { email: String(node.creator.email), name: node.creator.name ?? null } : null,
    };
  }
}
