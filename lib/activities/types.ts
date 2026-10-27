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
      minItems?: number;
      maxItems?: number;
    })
  | (SchemaDescription & {
      type: "string";
      enum?: readonly string[];
      minLength?: number;
      maxLength?: number;
    })
  | (SchemaDescription & {
      type: "number" | "integer";
      minimum?: number;
      maximum?: number;
    })
  | (SchemaDescription & {
      type: "boolean";
    });

/** A provider-independent tool an activity makes available to the virtual client. */
export interface ActivityTool<Input = unknown> {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  /** Deterministic input used by the offline provider during development. */
  mockInput?: unknown;
  /** Validates provider output before the server records or dispatches it. */
  parseInput(value: unknown): Input;
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
}

/** Type-erased activity definition stored in a heterogeneous registry. */
export interface RegisteredActivity {
  id: string;
  label: string;
  parseState(value: unknown): unknown;
  describeState(state: unknown): string;
  tools: readonly ActivityTool[];
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
