/** Serializable state for the activity currently visible beside the chat. */
export interface ActivitySnapshot {
  activityId: string;
  state: unknown;
}

/** JSON Schema subset shared by activity definitions and LLM providers. */
interface SchemaDescription {
  description?: string;
}

export type ToolInputSchema =
  | (SchemaDescription & {
      type: "object";
      properties: Record<string, ToolInputSchema>;
      required?: readonly string[];
      additionalProperties?: boolean;
    })
  | (SchemaDescription & {
      type: "array";
      items: ToolInputSchema;
    })
  | (SchemaDescription & {
      type: "string";
      enum?: readonly string[];
    })
  | (SchemaDescription & {
      type: "number" | "integer" | "boolean";
    });

/** A provider-independent tool an activity makes available to the virtual client. */
export interface ActivityTool<Input = unknown> {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  /** Deterministic input used by the offline provider during development. */
  mockInput?: unknown;
  /** Validates provider output before the server records or dispatches it. */
  parseInput(value: unknown, state?: unknown): Input;
}

/** A validated, nonverbal event that starts an activity-driven client turn. */
export interface ActivityTurnEvent {
  activityId: string;
  requestId: string;
  actor: "learner" | "platform";
  type: string;
  text: string;
  input: unknown;
}

/** Contract implemented once per activity and consumed by the shared chat flow. */
export interface ActivityDefinition<State = unknown> {
  id: string;
  /** Short visible label used in client-facing availability notices. */
  label: string;
  /** Validates the activity snapshot received from the browser. */
  parseState(value: unknown): State;
  /** Describes the validated state in concise, human-readable LLM context. */
  describeState(state: State): string;
  tools: readonly ActivityTool[];
  /** Optionally shape the offered tools around the validated current state. */
  getTools?(state: State): readonly ActivityTool[];
  /** Force a tool when this state requires the virtual client to act. */
  requiredToolName?(state: State): string | undefined;
  /** Validates an activity event that asks the client to take its turn. */
  parseTurnEvent?(
    value: unknown,
    requestId: string,
    state: State,
  ): ActivityTurnEvent;
}

/** Type-erased activity definition stored in a heterogeneous registry. */
export interface RegisteredActivity {
  id: string;
  label: string;
  parseState(value: unknown): unknown;
  describeState(state: unknown): string;
  tools: readonly ActivityTool[];
  getTools?(state: unknown): readonly ActivityTool[];
  requiredToolName?(state: unknown): string | undefined;
  parseTurnEvent?(
    value: unknown,
    requestId: string,
    state: unknown,
  ): ActivityTurnEvent;
}

/** Preserves an activity's state type while adapting it for registry storage. */
export function defineActivity<State>(
  definition: ActivityDefinition<State>,
): RegisteredActivity {
  return {
    id: definition.id,
    label: definition.label,
    parseState: definition.parseState,
    describeState: (state) => definition.describeState(state as State),
    tools: definition.tools,
    getTools: definition.getTools
      ? (state) => definition.getTools!(state as State)
      : undefined,
    requiredToolName: definition.requiredToolName
      ? (state) => definition.requiredToolName!(state as State)
      : undefined,
    parseTurnEvent: definition.parseTurnEvent
      ? (value, requestId, state) =>
          definition.parseTurnEvent!(value, requestId, state as State)
      : undefined,
  };
}

/** A validated activity tool call returned for the client activity to apply. */
export interface ActivityAction {
  activityId: string;
  tool: string;
  input: unknown;
}

/** Transcript metadata used to deduplicate visible tool-availability notices. */
export interface ActivityAvailabilityNotice {
  activityId: string;
  toolNames: string[];
}
