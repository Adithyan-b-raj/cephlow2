-- Add workflow_json to persist the React Flow graph (nodes + edges) for advanced batch editor
ALTER TABLE batches ADD COLUMN workflow_json TEXT;
