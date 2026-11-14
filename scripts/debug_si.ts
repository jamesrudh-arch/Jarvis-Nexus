const ENDPOINT = "https://backboard.railway.com/graphql/v2";
const token = process.env.RAILWAY_API_TOKEN!;
const Q = `
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
            customDomains { id domain status }
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
}`;
const res = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ query: Q, variables: { projectId: "f3e6f010-61df-4e97-bc5e-1f7dd695c4d3", environmentId: "86a07ea1-0e97-4873-9cad-35e5fbfe8807" } }) });
const body = await res.json();
console.log("status:", res.status);
console.log(JSON.stringify(body, null, 1).slice(0, 1200));
