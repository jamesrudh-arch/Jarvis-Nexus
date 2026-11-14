/**
 * @nexus/railway — GraphQL documents.
 *
 * EVERY field below was verified against the live Railway schema snapshot
 * captured 2026-11-15 (data/railway/schema_full_snapshot.json, 387 object
 * types). Nothing is invented; when the API evolves, the contract drift
 * detector (contract.ts) flags field removals before they mislead health
 * reports.
 *
 * SECURITY: there is deliberately NO `variables` query here — it returns
 * secret VALUES inline (EnvironmentVariables is a JSON scalar). Secret
 * values must never enter discovery, logs, memory or audit records.
 */

// ---------------------------------------------------------------------------
// Read queries
// ---------------------------------------------------------------------------

export const Q_PROJECTS = `
query Projects($first: Int) {
  projects(first: $first) {
    edges { node { id name description createdAt updatedAt workspaceId isPublic baseEnvironmentId } }
    pageInfo { hasNextPage }
  }
}`;

export const Q_WORKSPACE = `
query Workspace($id: String!) {
  workspace(workspaceId: $id) { id name plan projectCount createdAt }
}`;

export const Q_PLATFORM_STATUS = `
query PlatformStatus {
  platformStatus { isStable incident { id message status url createdAt } maintenance { id message status start url } }
}`;

export const Q_PROJECT_ENVIRONMENTS = `
query ProjectEnvironments($projectId: String!, $first: Int) {
  project(id: $projectId) {
    id name
    environments(first: $first) {
      edges { node { id name isEphemeral createdAt updatedAt } }
      pageInfo { hasNextPage }
    }
  }
}`;

export const Q_SERVICE_INSTANCES = `
query ServiceInstances($projectId: String!, $environmentId: String!) {
  environment(id: $environmentId, projectId: $projectId) {
    id name
    serviceInstances(first: 50) {
      edges {
        node {
          id serviceId serviceName environmentId region
          healthcheckPath restartPolicyType restartPolicyMaxRetries numReplicas
          hasEverDeployed sleepApplication builder
          latestDeployment {
            id status createdAt updatedAt statusUpdatedAt staticUrl
            serviceId environmentId projectId
            canRedeploy canRollback deploymentStopped meta
          }
          domains {
            serviceDomains { id domain suffix syncStatus targetPort }
            customDomains { id domain status { verified certificateStatus } }
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
}`;

export const Q_ENVIRONMENT_DEPLOYMENTS = `
query EnvironmentDeployments($projectId: String!, $environmentId: String!, $first: Int) {
  environment(id: $environmentId, projectId: $projectId) {
    deployments(first: $first) {
      edges {
        node {
          id status createdAt updatedAt statusUpdatedAt
          serviceId environmentId projectId staticUrl
          canRedeploy canRollback deploymentStopped meta
          creator { email name }
        }
      }
      pageInfo { hasNextPage }
    }
  }
}`;

export const Q_DEPLOYMENT_DETAIL = `
query DeploymentDetail($deploymentId: String!) {
  deployment(id: $deploymentId) {
    id status createdAt updatedAt statusUpdatedAt
    serviceId environmentId projectId staticUrl url
    canRedeploy canRollback deploymentStopped meta
    creator { email name }
  }
}`;

export const Q_DEPLOYMENT_LOGS = `
query DeploymentLogs($deploymentId: String!, $limit: Int) {
  deploymentLogs(deploymentId: $deploymentId, limit: $limit) { message severity timestamp }
}`;

export const Q_BUILD_LOGS = `
query BuildLogs($deploymentId: String!, $limit: Int) {
  buildLogs(deploymentId: $deploymentId, limit: $limit) { message severity timestamp }
}`;

export const Q_DEPLOYMENT_EVENTS = `
query DeploymentEvents($deploymentId: String!, $first: Int) {
  deploymentEvents(id: $deploymentId, first: $first) {
    edges { node { id step createdAt completedAt } }
  }
}`;

export const Q_VOLUME_INSTANCES = `
query VolumeInstances($projectId: String!, $environmentId: String!) {
  environment(id: $environmentId, projectId: $projectId) {
    volumeInstances(first: 50) {
      edges {
        node { id volumeId serviceId environmentId sizeMB currentSizeMB mountPath state region createdAt }
      }
      pageInfo { hasNextPage }
    }
  }
}`;

export const Q_VOLUME_BACKUPS = `
query VolumeBackups($volumeInstanceId: String!) {
  volumeInstanceBackupList(volumeInstanceId: $volumeInstanceId) {
    id name createdAt expiresAt usedMB referencedMB volumeInstanceSizeMB
  }
}`;

export const Q_VOLUME_BACKUP_SCHEDULES = `
query VolumeBackupSchedules($volumeInstanceId: String!) {
  volumeInstanceBackupScheduleList(volumeInstanceId: $volumeInstanceId) {
    id name kind cron retentionSeconds createdAt
  }
}`;

export const Q_PROJECT_EVENTS = `
query ProjectEvents($projectId: String!, $first: Int) {
  events(projectId: $projectId, first: $first) {
    edges { node { id action object severity createdAt payload projectId environmentId } }
    pageInfo { hasNextPage }
  }
}`;

export const Q_WORKSPACE_AUDIT_LOGS = `
query WorkspaceAuditLogs($workspaceId: String!, $first: Int) {
  auditLogs(workspaceId: $workspaceId, first: $first) {
    edges { node { id eventType createdAt projectId environmentId workspaceId } }
    pageInfo { hasNextPage }
  }
}`;

// Cost intelligence — measured usage vs estimates are kept DISTINCT.
export const Q_ESTIMATED_USAGE = `
query EstimatedUsage($measurements: [MetricMeasurement!]!, $projectId: String) {
  estimatedUsage(measurements: $measurements, projectId: $projectId) { estimatedValue measurement projectId }
}`;

export const Q_WORKSPACE_USAGE_TOTALS = `
query WorkspaceUsageTotals($measurements: [MetricMeasurement!]!) {
  workspaceUsageTotals(measurements: $measurements) { measurement value }
}`;

export const Q_PROJECT_USAGE = `
query ProjectUsage($measurements: [MetricMeasurement!]!, $projectId: String, $startDate: DateTime, $endDate: DateTime) {
  usage(measurements: $measurements, projectId: $projectId, startDate: $startDate, endDate: $endDate) { measurement value }
}`;

/** Metric measurements used by cost intelligence (verified enum values). */
export const USAGE_MEASUREMENTS = [
  "CPU_USAGE",
  "MEMORY_USAGE_GB",
  "DISK_USAGE_GB",
  "EPHEMERAL_DISK_USAGE_GB",
  "NETWORK_RX_GB",
  "NETWORK_TX_GB",
  "BACKUP_USAGE_GB",
] as const;

// ---------------------------------------------------------------------------
// Mutations — the recovery operation registry. NONE of these are ever
// executed in read-only mode (the default). Each maps to an L3/L4
// authorization level in authorization.ts.
// ---------------------------------------------------------------------------

export const M_DEPLOYMENT_RESTART = `
mutation DeploymentRestart($id: String!) { deploymentRestart(id: $id) }`;

export const M_DEPLOYMENT_REDEPLOY = `
mutation DeploymentRedeploy($id: String!, $usePreviousImageTag: Boolean) {
  deploymentRedeploy(id: $id, usePreviousImageTag: $usePreviousImageTag) { id status }
}`;

export const M_DEPLOYMENT_ROLLBACK = `
mutation DeploymentRollback($id: String!) { deploymentRollback(id: $id) }`;

export const M_DEPLOYMENT_STOP = `
mutation DeploymentStop($id: String!) { deploymentStop(id: $id) }`;

export const M_DEPLOYMENT_CANCEL = `
mutation DeploymentCancel($id: String!) { deploymentCancel(id: $id) }`;

export const M_DEPLOYMENT_APPROVE = `
mutation DeploymentApprove($id: String!) { deploymentApprove(id: $id) }`;

export const M_DEPLOYMENT_REMOVE = `
mutation DeploymentRemove($id: String!) { deploymentRemove(id: $id) }`;

export const M_SERVICE_INSTANCE_REDEPLOY = `
mutation ServiceInstanceRedeploy($environmentId: String!, $serviceId: String!) {
  serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
}`;

export const M_SERVICE_INSTANCE_DEPLOY = `
mutation ServiceInstanceDeploy($environmentId: String!, $serviceId: String!, $latestCommit: Boolean!) {
  serviceInstanceDeploy(environmentId: $environmentId, serviceId: $serviceId, latestCommit: $latestCommit)
}`;

export const M_VOLUME_BACKUP_CREATE = `
mutation VolumeBackupCreate($volumeInstanceId: String!, $name: String) {
  volumeInstanceBackupCreate(volumeInstanceId: $volumeInstanceId, name: $name)
}`;

export const M_VOLUME_BACKUP_RESTORE = `
mutation VolumeBackupRestore($volumeInstanceId: String!, $volumeInstanceBackupId: String!, $wipeServiceIds: [String!]!, $replicaServiceIds: [String!]!) {
  volumeInstanceBackupRestore(volumeInstanceId: $volumeInstanceId, volumeInstanceBackupId: $volumeInstanceBackupId, wipeServiceIds: $wipeServiceIds, replicaServiceIds: $replicaServiceIds)
}`;
