const Database = require('better-sqlite3');
const db = new Database('ledger.db', { verbose: console.log });

console.log('Migrating database to V2...');

try {
    db.prepare('ALTER TABLE usage_logs ADD COLUMN message_id TEXT').run();
    console.log('Added message_id column.');
} catch (e) {
    console.log('message_id column likely exists or error:', e.message);
}

try {
    db.prepare('ALTER TABLE usage_logs ADD COLUMN cache_read INTEGER DEFAULT 0').run();
    console.log('Added cache_read column.');
} catch (e) {
    console.log('cache_read column likely exists or error:', e.message);
}

try {
    db.prepare('ALTER TABLE daily_stats ADD COLUMN cache_read INTEGER DEFAULT 0').run();
    console.log('Added cache_read to daily_stats.');
} catch (e) {
    console.log('cache_read column in daily_stats likely exists or error:', e.message);
}

console.log('Migration complete.');
