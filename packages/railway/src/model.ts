/**
 * @nexus/railway — normalized internal resource model.
 *
 * Directive §4: an accurate internal representation that DISTINGUISHES
 * discovered / inaccessible / missing / unsupported / unverified resources.
 * Every model type maps 1:1 onto verified live-schema fields (queries.ts).
 */

export type ResourceClassification =
  | "discovered"    // confirmed present via the API
  | "inaccessible"  // exists but this token cannot read it (or read failed)
  | "missing"       // expected but absent
  | "unsupported"   // real resource class the API/integration does not model
  | "unverified";   // observed but not yet validated against the API

export interface ClassificationEntry {
  resource: string;
  classification: ResourceClassification;
  reason: string;
}

export type DeploymentStatus =
  | "BUILDING" | "CRASHED" | "DEPLOYING" | "FAILED" | "INITIALIZING" | "NEEDS_APPROVAL"
  | "QUEUED" | "REMOVED" | "REMOVING" | "SKIPPED" | "SLEEPING" | "SUCCESS" | "WAITING"
  | "UNKNOWN";

export type DeploymentHealthClass = "healthy" | "transitioning" | "failed" | "sleeping" | "removed" | "approval_needed" | "unknown";

/** Status classification per the verified DeploymentStatus enum (13 values). */
export function classifyDeploymentStatus(status: string): DeploymentHealthClass {
  switch (status) {
    case "SUCCESS": return "healthy";
    case "FAILED":
    case "CRASHED": return "failed";
    case "BUILDING":
    case "QUEUED":
    case "DEPLOYING":
    case "INITIALIZING":
    case "WAITING": return "transitioning";
    case "NEEDS_APPROVAL": return "approval_needed";
    case "SLEEPING": return "sleeping";
    case "REMOVED":
    case "REMOVING":
    case "SKIPPED": return "removed";
    default: return "unknown";
  }
}

export interface RailwayProjectModel {
  id: string;
  name: string;
  description?: string | null;
  workspaceId?: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RailwayEnvironmentModel {
  id: string;
  name: string;
  projectId: string;
  isEphemeral: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RailwayDomainModel {
  kind: "service" | "custom";
  domain: string;
  status: string;
  targetPort?: number | null;
  suffix?: string | null;
}

export interface RailwayDeploymentModel {
  id: string;
  status: DeploymentStatus;
  serviceId?: string | null;
  environmentId: string;
  projectId: string;
  createdAt: string;
  updatedAt?: string | null;
  statusUpdatedAt?: string | null;
  staticUrl?: string | null;
  url?: string | null;
  canRedeploy?: boolean;
  canRollback?: boolean;
  deploymentStopped?: boolean;
  meta?: unknown; // opaque JSON scalar in the live schema
  creator?: { email: string; name?: string | null } | null;
}

export interface RailwayServiceInstanceModel {
  id: string;
  serviceId: string;
  serviceName: string;
  environmentId: string;
  region?: string | null;
  healthcheckPath?: string | null;
  restartPolicyType: string;
  restartPolicyMaxRetries: number;
  numReplicas?: number | null;
  hasEverDeployed: boolean;
  sleepApplication?: boolean | null;
  builder?: string | null;
  latestDeployment?: RailwayDeploymentModel | null;
  domains: RailwayDomainModel[];
}

export interface RailwayVolumeModel {
  id: string;
  volumeId: string;
  serviceId?: string | null;
  environmentId: string;
  sizeMB: number;
  currentSizeMB?: number | null;
  mountPath: string;
  state: string;
  region?: string | null;
  createdAt: string;
}

export interface RailwayBackupScheduleModel {
  id: string;
  name?: string | null;
  kind?: string | null;
  cron?: string | null;
  retentionSeconds?: number | null;
}

export interface RailwayVolumeBackupModel {
  id: string;
  name?: string | null;
  volumeInstanceId: string;
  createdAt: string;
  expiresAt?: string | null;
  usedMB?: number | null;
  referencedMB?: number | null;
  volumeInstanceSizeMB?: number | null;
  schedules: RailwayBackupScheduleModel[];
  /** Existence is NOT recoverability — a backup that has never been restored
   *  is not proven recoverable (directive §12). */
  verified: false;
  recoverability: "UNVERIFIED";
}

export interface PlatformStatusModel {
  isStable: boolean;
  incident?: { id: string; message: string; status: string; url: string; createdAt?: string | null } | null;
  maintenance?: { id: string; message: string; status: string; start: string; url: string } | null;
}

export interface RailwayEventModel {
  id: string;
  action: string;
  object: string;
  severity: string;
  createdAt: string;
  projectId?: string | null;
  environmentId?: string | null;
  payload?: unknown;
}

export interface RailwayWorkspaceModel {
  id: string;
  name: string;
  plan?: string | null;
  projectCount?: number | null;
  createdAt?: string | null;
}

export interface InfrastructureSnapshot {
  asOf: string;
  workspace?: RailwayWorkspaceModel | null;
  platformStatus?: PlatformStatusModel | null;
  projects: RailwayProjectModel[];
  environments: RailwayEnvironmentModel[];
  serviceInstances: RailwayServiceInstanceModel[];
  volumes: RailwayVolumeModel[];
  volumeBackups: RailwayVolumeBackupModel[];
  recentDeployments: RailwayDeploymentModel[];
  recentEvents: RailwayEventModel[];
  classifications: ClassificationEntry[];
}

export function emptySnapshot(asOf: string): InfrastructureSnapshot {
  return {
    asOf,
    workspace: null,
    platformStatus: null,
    projects: [],
    environments: [],
    serviceInstances: [],
    volumes: [],
    volumeBackups: [],
    recentDeployments: [],
    recentEvents: [],
    classifications: [],
  };
}

/** Fingerprint of a deployment for change detection (reconciliation). */
export function deploymentFingerprint(d: RailwayDeploymentModel): string {
  return `${d.id}:${d.status}:${d.statusUpdatedAt ?? d.updatedAt ?? d.createdAt}:${d.deploymentStopped ? "stopped" : "live"}`;
}
