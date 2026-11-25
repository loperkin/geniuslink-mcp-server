// A staging-only SQLite Durable Object. Transactional insertion wins once
// across Worker isolates, including when a write or its readback is interrupted.
export class StagingApprovalLedger {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/consume") {
      return new Response(null, { status: 405 });
    }
    const approval = await request.text();
    if (!/^[a-f0-9]{64}$/.test(approval)) return new Response(null, { status: 400 });

    const consumed = this.storage.transactionSync(() => {
      if (this.storage.kv.get(approval)) return false;
      this.storage.kv.put(approval, true);
      return true;
    });
    return new Response(null, { status: consumed ? 201 : 409 });
  }
}
