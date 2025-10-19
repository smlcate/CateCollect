import knex from '../../db/knexClient.js';

export async function logEvent(stage, message, meta = null, documentId = null) {
  try {
    await knex('ingest_events').insert({
      document_id: documentId,
      stage, message,
      meta: meta ? JSON.stringify(meta) : null
    });
  } catch (err) {
    // avoid throwing from logger; print to console instead
    console.error('[ingest-event]', stage, message, err?.message || err);
  }
}
