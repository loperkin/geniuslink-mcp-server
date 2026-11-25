import { DurableObject } from "cloudflare:workers";
import { createOAuthGateway } from "./oauth-gateway.js";
import { createWorker } from "./worker.js";
import { StagingApprovalLedger } from "./staging-approval-ledger.js";
import { createStagingOptions, stagingOrigin } from "./staging-links.js";

const readWorker = createWorker(createStagingOptions(false));
const writeWorker = createWorker(createStagingOptions(true));

export default createOAuthGateway({
  origin: stagingOrigin,
  backend: canWrite => canWrite ? writeWorker : readWorker,
  writeScope: true
});

export class StagingWriteApprovals extends DurableObject {
  fetch(request) {
    return new StagingApprovalLedger(this.ctx).fetch(request);
  }
}
