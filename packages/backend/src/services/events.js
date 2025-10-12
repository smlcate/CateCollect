// Simple event logger for workflow_events
import db from './knex.js';

export async function logEvent({ claim_id, type, detail, actor }) {
  // type examples: 'claim_created', 'claim_archived', 'claim_unarchived',
  // 'doc_uploaded', 'doc_registered', 'note_added'
  const payload = {
    claim_id,
    type,
    detail: detail ? JSON.stringify(detail) : null,
    actor: actor || null, // add 'actor' column later if desired; for now store in detail
  };
  await db('workflow_events').insert({
    claim_id: payload.claim_id,
    type: payload.type,
    detail: payload.detail,
    created_at: db.fn.now(),
  });
}
