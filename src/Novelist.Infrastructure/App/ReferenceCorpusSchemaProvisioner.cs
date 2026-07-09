using Microsoft.Data.Sqlite;

namespace Novelist.Infrastructure.App;

internal static class ReferenceCorpusSchemaProvisioner
{
    public static async ValueTask EnsureCoreTablesAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS reference_anchors (
              anchor_id INTEGER PRIMARY KEY,
              novel_id INTEGER,
              title TEXT NOT NULL,
              author TEXT NOT NULL,
              source_path TEXT NOT NULL,
              source_kind TEXT NOT NULL,
              license_status TEXT NOT NULL,
              source_file_hash TEXT NOT NULL,
              build_version TEXT NOT NULL,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              corpus_visibility TEXT NOT NULL DEFAULT 'private',
              source_trust TEXT NOT NULL DEFAULT 'user_verified',
              user_tags_json TEXT NOT NULL DEFAULT '[]'
            );

            CREATE TABLE IF NOT EXISTS reference_text_nodes (
              node_id TEXT PRIMARY KEY,
              anchor_id INTEGER NOT NULL,
              parent_node_id TEXT,
              node_type TEXT NOT NULL,
              sequence_index INTEGER NOT NULL,
              depth INTEGER NOT NULL,
              chapter_index INTEGER,
              start_offset INTEGER NOT NULL,
              end_offset INTEGER NOT NULL,
              char_len INTEGER NOT NULL,
              text_hash TEXT NOT NULL,
              text TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(anchor_id) REFERENCES reference_anchors(anchor_id) ON DELETE CASCADE,
              FOREIGN KEY(parent_node_id) REFERENCES reference_text_nodes(node_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS reference_analysis_runs (
              run_id TEXT PRIMARY KEY,
              anchor_id INTEGER NOT NULL,
              analyzer_version TEXT NOT NULL,
              schema_version TEXT NOT NULL,
              model_provider TEXT NOT NULL,
              model_id TEXT NOT NULL,
              scope TEXT NOT NULL,
              status TEXT NOT NULL,
              token_budget INTEGER,
              tokens_spent INTEGER NOT NULL DEFAULT 0,
              resume_cursor TEXT,
              started_at TEXT NOT NULL,
              completed_at TEXT,
              observation_count INTEGER NOT NULL DEFAULT 0,
              FOREIGN KEY(anchor_id) REFERENCES reference_anchors(anchor_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS reference_feature_observations (
              observation_id TEXT PRIMARY KEY,
              node_id TEXT NOT NULL,
              node_type TEXT NOT NULL,
              run_id TEXT NOT NULL,
              anchor_id INTEGER NOT NULL,
              feature_family TEXT NOT NULL,
              feature_key TEXT NOT NULL,
              value_kind TEXT NOT NULL,
              value_text TEXT,
              value_num REAL,
              value_bool INTEGER,
              value_json TEXT,
              intensity REAL,
              confidence REAL NOT NULL,
              evidence_start INTEGER,
              evidence_end INTEGER,
              explanation TEXT,
              review_state TEXT NOT NULL DEFAULT 'unverified',
              validity_state TEXT NOT NULL DEFAULT 'active',
              superseded_by_run_id TEXT,
              created_at TEXT NOT NULL,
              FOREIGN KEY(node_id) REFERENCES reference_text_nodes(node_id) ON DELETE CASCADE,
              FOREIGN KEY(run_id) REFERENCES reference_analysis_runs(run_id) ON DELETE CASCADE,
              FOREIGN KEY(anchor_id) REFERENCES reference_anchors(anchor_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS reference_corpus_libraries (
              library_id TEXT PRIMARY KEY,
              scope TEXT NOT NULL,
              novel_id INTEGER,
              name TEXT NOT NULL,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reference_library_members (
              library_id TEXT NOT NULL,
              anchor_id INTEGER NOT NULL,
              enabled INTEGER NOT NULL DEFAULT 1,
              source_quality TEXT,
              disabled_reason TEXT,
              dedup_group_id TEXT,
              PRIMARY KEY(library_id, anchor_id),
              FOREIGN KEY(library_id) REFERENCES reference_corpus_libraries(library_id) ON DELETE CASCADE,
              FOREIGN KEY(anchor_id) REFERENCES reference_anchors(anchor_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS reference_session_library_binding (
              session_id TEXT NOT NULL,
              library_id TEXT NOT NULL,
              PRIMARY KEY(session_id, library_id),
              FOREIGN KEY(library_id) REFERENCES reference_corpus_libraries(library_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS reference_source_license (
              anchor_id INTEGER PRIMARY KEY,
              license_state TEXT NOT NULL,
              authorization_evidence TEXT,
              reuse_policy TEXT NOT NULL,
              max_verbatim_ratio REAL,
              cleared_for_insertion INTEGER NOT NULL DEFAULT 0,
              reviewed_at TEXT,
              FOREIGN KEY(anchor_id) REFERENCES reference_anchors(anchor_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS reference_text_node_embeddings (
              embedding_id TEXT PRIMARY KEY,
              node_id TEXT NOT NULL,
              anchor_id INTEGER NOT NULL,
              provider_key TEXT NOT NULL,
              model_id TEXT NOT NULL,
              dimensions INTEGER NOT NULL,
              text_hash TEXT NOT NULL,
              embedding_json TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY(node_id) REFERENCES reference_text_nodes(node_id) ON DELETE CASCADE,
              FOREIGN KEY(anchor_id) REFERENCES reference_anchors(anchor_id) ON DELETE CASCADE
            );

            CREATE UNIQUE INDEX IF NOT EXISTS ux_reference_text_node_embeddings_generation
              ON reference_text_node_embeddings(node_id, provider_key, model_id, dimensions);

            CREATE INDEX IF NOT EXISTS idx_reference_text_node_embeddings_lookup
              ON reference_text_node_embeddings(provider_key, model_id, dimensions, anchor_id);

            CREATE TABLE IF NOT EXISTS reference_current_chapter_embedding_cache (
              cache_id TEXT PRIMARY KEY,
              novel_id INTEGER NOT NULL,
              chapter_number INTEGER NOT NULL,
              draft_text_hash TEXT NOT NULL,
              provider_key TEXT NOT NULL,
              model_id TEXT NOT NULL,
              dimensions INTEGER NOT NULL,
              embedding_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS ux_reference_current_chapter_embedding_cache_generation
              ON reference_current_chapter_embedding_cache(
                novel_id,
                chapter_number,
                draft_text_hash,
                provider_key,
                model_id,
                dimensions);

            CREATE INDEX IF NOT EXISTS idx_reference_text_nodes_parent
              ON reference_text_nodes(parent_node_id, sequence_index);

            CREATE INDEX IF NOT EXISTS idx_reference_text_nodes_anchor_type
              ON reference_text_nodes(anchor_id, node_type);

            CREATE INDEX IF NOT EXISTS idx_reference_text_nodes_chapter
              ON reference_text_nodes(anchor_id, chapter_index, sequence_index);

            CREATE INDEX IF NOT EXISTS idx_reference_observations_family
              ON reference_feature_observations(anchor_id, feature_family, feature_key, value_text);

            CREATE INDEX IF NOT EXISTS idx_reference_observations_num
              ON reference_feature_observations(anchor_id, feature_family, feature_key, value_num);

            CREATE INDEX IF NOT EXISTS idx_reference_observations_node
              ON reference_feature_observations(node_id, run_id, validity_state);

            CREATE UNIQUE INDEX IF NOT EXISTS ux_obs_generation_key
              ON reference_feature_observations(
                run_id,
                node_id,
                feature_family,
                feature_key,
                IFNULL(evidence_start, -1),
                IFNULL(evidence_end, -1));

            CREATE INDEX IF NOT EXISTS idx_reference_library_members_anchor
              ON reference_library_members(anchor_id, enabled);
            """;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
