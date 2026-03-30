// ── Main component ──────────────────────────────────────────────
export { WorkflowBuilder } from "./components/workflow-builder";

// ── Configuration ───────────────────────────────────────────────
export { configureBuilder, getBuilderConfig, resetBuilderConfig } from "./lib/builder-config";
export type { BuilderConfig } from "./lib/builder-config";

// ── Types ───────────────────────────────────────────────────────
export type {
  WorkflowBuilderProps,
  WorkflowExecution,
  FlowChatRequest,
  FlowChatResponse,
  LLMExecuteRequest,
  LLMExecuteResponse,
  FlowChatHandler,
  LLMExecuteHandler,
  CustomPaletteItem,
  CustomNodeTypeInfo,
  CustomNodeEditor,
} from "./types";
export type { FlowTemplate } from "./lib/flow-templates";
export type {
  PersonaNodeData,
  AppNodeData,
  CompetitorNodeData,
  ActionNodeData,
  NoteNodeData,
  TriggerNodeData,
  ConditionNodeData,
  TransformNodeData,
  OutputNodeData,
  LLMNodeData,
  StepNodeData,
  ConsensusNodeData,
  AffinityCategoryNodeData,
  ConfigNodeData,
  ConfigNodeSection,
  HttpRequestNodeData,
  CpoReviewNodeData,
  RescoreNodeData,
} from "./lib/flow-templates";
export type { Workspace } from "./hooks/use-workspaces";
export type {
  WorkflowStepResult,
} from "./lib/workflow-engine";
export type {
  BuilderTemplate,
  BuilderTemplateSource,
} from "./lib/builder-templates";
export type { StoredCredential } from "./types";

// ── Sub-components (for advanced usage) ─────────────────────────
export { FlowCanvas, GROUP_COLORS, groupColorIndex } from "./components/flow-canvas";
export { NodePalette } from "./components/node-palette";
export { NodeInspector } from "./components/node-inspector";
export { TemplateSidebar } from "./components/template-sidebar";
export { TemplateManager } from "./components/template-manager";
export { WorkspaceManager } from "./components/workspace-manager";
/** @deprecated Use BuilderChat for the integrated builder experience */
export { AIFlowChat } from "./components/ai-flow-chat";
export { BuilderChat } from "./components/builder-chat";
export { NodeContextMenu } from "./components/node-context-menu";
export { CredentialManager } from "./components/credential-manager";
export { ExpressionEditor } from "./components/expression-editor";
export { VersionPanel } from "./components/version-panel";
export type { VersionPanelProps } from "./components/version-panel";

// ── Inspector primitives (for building custom node editors) ─────
export { Field, inputClass, selectClass, textareaClass } from "./components/node-inspector";
export { Combobox, type ComboboxOption } from "./components/combobox";

// ── Node components (for custom composition) ────────────────────
export { PersonaNode } from "./components/nodes/persona-node";
export { AppNode } from "./components/nodes/app-node";
export { CompetitorNode } from "./components/nodes/competitor-node";
export { ActionNode } from "./components/nodes/action-node";
export { NoteNode } from "./components/nodes/note-node";
export { TriggerNode } from "./components/nodes/trigger-node";
export { ConditionNode } from "./components/nodes/condition-node";
export { TransformNode } from "./components/nodes/transform-node";
export { OutputNode } from "./components/nodes/output-node";
export { LLMNode } from "./components/nodes/llm-node";
export { StepNode } from "./components/nodes/step-node";
export { ConsensusNode } from "./components/nodes/consensus-node";
export { AffinityCategoryNode } from "./components/nodes/affinity-category-node";
export { ConfigNode } from "./components/nodes/config-node";
export { UserNode } from "./components/nodes/user-node";
export { HttpNode } from "./components/nodes/http-node";
export { WebhookNode } from "./components/nodes/webhook-node";
export { EmailNode } from "./components/nodes/email-node";
export { DatabaseNode } from "./components/nodes/database-node";
export { StorageNode } from "./components/nodes/storage-node";
export { JsonNode } from "./components/nodes/json-node";
export { TextNode } from "./components/nodes/text-node";
export { AggregatorNode } from "./components/nodes/aggregator-node";
export { ValidatorNode } from "./components/nodes/validator-node";
export { FormatterNode } from "./components/nodes/formatter-node";
export { LoopNode } from "./components/nodes/loop-node";
export { SwitchNode } from "./components/nodes/switch-node";
export { DelayNode } from "./components/nodes/delay-node";
export { ErrorHandlerNode } from "./components/nodes/error-handler-node";
export { MergeNode } from "./components/nodes/merge-node";
export { ClassifierNode } from "./components/nodes/classifier-node";
export { SummarizerNode } from "./components/nodes/summarizer-node";
export { SearchNode } from "./components/nodes/search-node";
export { EmbeddingNode } from "./components/nodes/embedding-node";
export { ExtractorNode } from "./components/nodes/extractor-node";
export { HttpRequestNode } from "./components/nodes/http-request-node";
export { CpoReviewNode } from "./components/nodes/cpo-review-node";
export { RescoreNode } from "./components/nodes/rescore-node";

// ── Hooks (for advanced usage) ──────────────────────────────────
export { useUndoRedo } from "./hooks/use-undo-redo";
export { useClipboard } from "./hooks/use-clipboard";
export { useNodeGroups, createGroupId, applyGroupDragConstraints } from "./hooks/use-node-groups";
export { useTouchDevice, useLongPress, useSwipeToDismiss } from "./hooks/use-touch-device";
export type { TouchCoords } from "./hooks/use-touch-device";

// ── Utilities ───────────────────────────────────────────────────
export { autoLayout } from "./lib/auto-layout";
export {
  summarizeNodes,
  summarizeEdges,
  summarizeUserNodes,
  buildCanvasSummary,
} from "./lib/canvas-summary";
export {
  validateWorkflow,
  createExecution,
  executeWorkflow,
  getExecutionOrder,
} from "./lib/workflow-engine";
export {
  /** @deprecated Use getBuiltInTemplates() which includes dynamically registered extras */
  BUILT_IN_TEMPLATES,
  GENERIC_BUILT_IN_TEMPLATES,
  DOMAIN_BUILT_IN_TEMPLATES,
  DOMAIN_TEMPLATE_IDS,
  getBuiltInTemplates,
  setBuiltInTemplates,
  getCustomTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  getAllTemplates,
  getTemplatesByCategory,
  setTemplateStoragePrefix,
  copyTemplate,
  getStarredTemplateIds,
  toggleStarTemplate,
  isTemplateStarred,
  getNextCopyName,
} from "./lib/flow-templates";
export {
  saveBuilderTemplate,
  getBuilderTemplates,
  getBuilderTemplatesBySource,
  deleteBuilderTemplate,
  renameBuilderTemplate,
  builderTemplateToFlowNodes,
  computeNextOffsetY,
  setBuilderTemplateStorageKey,
  SOURCE_META,
} from "./lib/builder-templates";
export {
  getWorkspaces,
  loadWorkspace,
  saveWorkspace,
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  renameWorkspace,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  getLastWorkspaceError,
  clearWorkspaceError,
} from "./hooks/use-workspaces";
export type { WorkspaceSaveError } from "./hooks/use-workspaces";
export {
  getUserNodes,
  saveUserNode,
  deleteUserNode,
  getUserNodeById,
  createUserNodeDefinition,
  buildUserNodeDefaults,
  setUserNodeStoragePrefix,
} from "./lib/user-nodes";
export type { UserNodeDefinition, UserNodeField } from "./lib/user-nodes";
export {
  listCredentials,
  addCredential,
  getCredentialValue,
  getCredentialByProvider,
  deleteCredential,
  updateCredential,
  migrateApiKey,
  setCredentialStoragePrefix,
  getCredentialStoragePrefix,
  getLastCredentialError,
  clearCredentialError,
} from "./lib/credential-store";
export type { CredentialStoreError } from "./lib/credential-store";
export { sanitizeErrorMessage } from "./lib/utils";

// ── Storage ──────────────────────────────────────────────────────
export type { StorageAdapter } from "./lib/storage-adapter";
export { LocalStorageAdapter, IndexedDBAdapter, StorageQuotaError } from "./lib/storage-adapter";
export { setStorageAdapter, getStorageAdapter, syncStorage } from "./lib/storage-context";

// ── Security utilities ──────────────────────────────────────────
export {
  secureSet,
  secureGet,
  secureRemove,
  isEncrypted,
} from "./lib/secure-storage";

// ── Persistence (Sprint 4) ───────────────────────────────────────
export {
  saveExecution,
  loadExecution,
  listExecutions,
  compareExecutions,
  deleteExecution,
  clearWorkspaceExecutions,
  setExecutionStorePrefix,
} from "./lib/execution-store";
export type {
  PersistedExecution,
  PersistedStep,
  ExecutionIndexEntry,
  ExecutionComparison,
} from "./lib/execution-store";
export {
  createVersion,
  listVersions,
  loadVersion,
  deleteVersion,
  renameVersion,
  diffVersions,
  clearWorkspaceVersions,
  setVersionStorePrefix,
} from "./lib/workflow-versions";
export type {
  WorkflowVersion,
  VersionIndexEntry,
  VersionDiff,
} from "./lib/workflow-versions";

// ── Bridge (Loop ↔ Builder) ─────────────────────────────────────
export { generateGapWorkflow } from "./lib/gap-to-workflow";
export type { GapInput, CpoInput, GapWorkflowOptions } from "./lib/gap-to-workflow";

// ── Domain-specific (opt-in, SupraLoop-specific) ─────────────────
// These exports are for SupraLoop's competitive benchmarking domain.
// Forkers should import from the domain barrel or delete entirely.
// Re-exported here for backward compatibility.
export {
  domainNodeTypes,
  DOMAIN_PALETTE_ITEMS,
  domainInspectorEditors,
} from "./components/nodes/domain";
